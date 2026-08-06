import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const bin = path.join(root, "bin", "steward.mjs");

async function invoke(store, operation, request = {}) {
  return await new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [bin], { env: { ...process.env, STEWARD_STORE: store } }, (error, stdout, stderr) => {
      if (error && error.code !== 0 && !stdout) return reject(error);
      resolve({ code: error?.code ?? 0, body: JSON.parse(stdout), stderr });
    });
    child.stdin.end(`${JSON.stringify({ operation, ...request })}\n`);
  });
}

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "steward-f007-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return path.join(dir, "steward.json");
}

test("the public facade preserves one Global Steward and custody across independent processes", async (t) => {
  const store = await fixture(t);
  const first = await invoke(store, "identity.resolve");
  assert.equal(first.code, 0);
  assert.equal(first.body.status, "success");
  assert.equal(first.body.result.steward.id, "steward:global");

  const created = await invoke(store, "spaces.create", { expected_directory_revision: first.body.result.directory.revision, space: { id: "space:agent-os", name: "Agent OS" } });
  assert.equal(created.code, 0);
  assert.equal(created.body.result.space.lifecycle, "active");

  const captured = await invoke(store, "intakes.capture", { replay_key: "capture:one", content: "Keep the successor intent", provenance: { source: "architect" }, space_id: "space:agent-os", relevance_reason: "The accepted route still needs delivery", owner_references: [{ kind: "frame", id: "frame:abc" }] });
  assert.equal(captured.code, 0);
  assert.equal(captured.body.result.matter.home_space_id, "space:agent-os");
  assert.equal(captured.body.result.matter.return_condition.kind, "none");

  const replay = await invoke(store, "intakes.capture", { replay_key: "capture:one", content: "Keep the successor intent", provenance: { source: "architect" }, space_id: "space:agent-os", relevance_reason: "The accepted route still needs delivery", owner_references: [{ kind: "frame", id: "frame:abc" }] });
  assert.equal(replay.code, 0);
  assert.equal(replay.body.result.intake.id, captured.body.result.intake.id);
  assert.equal(replay.body.result.matter.id, captured.body.result.matter.id);

  const resolved = await invoke(store, "matters.read", { matter_id: captured.body.result.matter.id });
  assert.equal(resolved.code, 0);
  assert.equal(resolved.body.result.matter.relevance_reason, "The accepted route still needs delivery");
});

test("the facade rejects stale writes, bad deferrals, root associations, and retired placement without partial mutation", async (t) => {
  const store = await fixture(t);
  const identity = await invoke(store, "identity.resolve");
  const space = await invoke(store, "spaces.create", { expected_directory_revision: identity.body.result.directory.revision, space: { id: "space:tanego", name: "Tanego" } });
  const capture = await invoke(store, "intakes.capture", { replay_key: "capture:two", content: "Review vocabulary", provenance: { source: "architect" }, space_id: "space:tanego", relevance_reason: "A learner-facing change is pending", owner_references: [] });
  const matter = capture.body.result.matter;

  const badDeferral = await invoke(store, "matters.transition", { matter_id: matter.id, expected_revision: matter.revision, transition: "deferred", relevance_reason: matter.relevance_reason, deferral_reason: "Waiting for review" });
  assert.equal(badDeferral.code, 2);
  assert.equal(badDeferral.body.failure.code, "deferral_return_condition_required");

  const deferred = await invoke(store, "matters.transition", { matter_id: matter.id, expected_revision: matter.revision, transition: "deferred", relevance_reason: matter.relevance_reason, deferral_reason: "Waiting for review", return_condition: { kind: "next_review", value: "2026-08-15" } });
  assert.equal(deferred.code, 0);
  assert.equal(deferred.body.result.matter.lifecycle, "deferred");

  const stale = await invoke(store, "matters.transition", { matter_id: matter.id, expected_revision: matter.revision, transition: "quiet", relevance_reason: matter.relevance_reason });
  assert.equal(stale.code, 2);
  assert.equal(stale.body.failure.code, "matter_revision_conflict");

  const root = await invoke(store, "spaces.associations.set", { space_id: "space:tanego", expected_revision: space.body.result.space.revision, association: { namespace_id: "namespace:root", include_descendants: false } });
  assert.equal(root.code, 2);
  assert.equal(root.body.failure.code, "root_namespace_forbidden");
  const associated = await invoke(store, "spaces.associations.set", { space_id: "space:tanego", expected_revision: space.body.result.space.revision, association: { namespace_id: "namespace:agent-platform", include_descendants: false, expected_association_revision: 0 } });
  assert.equal(associated.code, 0);
  const removed = await invoke(store, "spaces.associations.remove", { space_id: "space:tanego", expected_revision: associated.body.result.space.revision, namespace_id: "namespace:agent-platform" });
  assert.equal(removed.code, 0);
  assert.equal(removed.body.result.retired_association.namespace_id, "namespace:agent-platform");

  const returned = await invoke(store, "matters.transition", { matter_id: matter.id, expected_revision: deferred.body.result.matter.revision, transition: "return", relevance_reason: matter.relevance_reason });
  const quiet = await invoke(store, "matters.transition", { matter_id: matter.id, expected_revision: returned.body.result.matter.revision, transition: "quiet", relevance_reason: matter.relevance_reason });
  const released = await invoke(store, "matters.transition", { matter_id: matter.id, expected_revision: quiet.body.result.matter.revision, transition: "release", relevance_reason: matter.relevance_reason });
  const restored = await invoke(store, "matters.transition", { matter_id: matter.id, expected_revision: released.body.result.matter.revision, transition: "restored", relevance_reason: matter.relevance_reason });
  assert.equal(restored.body.result.matter.lifecycle, "active");

  const retire = await invoke(store, "spaces.retire", { space_id: "space:tanego", expected_revision: removed.body.result.space.revision });
  assert.equal(retire.code, 0);
  const placement = await invoke(store, "intakes.capture", { replay_key: "capture:retired", content: "Cannot enter", provenance: { source: "architect" }, space_id: "space:tanego", relevance_reason: "No", owner_references: [] });
  assert.equal(placement.code, 2);
  assert.equal(placement.body.failure.code, "space_retired");

  const complete = await invoke(store, "spaces.manifest", { space_id: "space:tanego" });
  assert.equal(complete.code, 0);
  assert.equal(complete.body.result.matters.length, 1);
  assert.equal(complete.body.result.matters[0].id, matter.id);
});

test("unplaced Intakes can be placed later and Questions retain owner-only closure with immutable answers", async (t) => {
  const store = await fixture(t);
  const identity = await invoke(store, "identity.resolve");
  const space = await invoke(store, "spaces.create", { expected_directory_revision: identity.body.result.directory.revision, space: { id: "space:docs", name: "Docs" } });
  const intake = await invoke(store, "intakes.capture", { replay_key: "capture:unplaced", content: "Ask the design owner", provenance: { source: "architect" } });
  assert.equal(intake.body.result.matter, null);
  const placed = await invoke(store, "matters.place", { intake_id: intake.body.result.intake.id, space_id: "space:docs", expected_space_revision: space.body.result.space.revision, relevance_reason: "The owner needs an answer", owner_references: [{ kind: "blueprint", id: "blueprint:one" }] });
  assert.equal(placed.code, 0);
  const matter = placed.body.result.matter;

  const linked = await invoke(store, "matters.questions.link", { matter_id: matter.id, expected_revision: matter.revision, question: { owner: { kind: "blueprint", id: "blueprint:one" }, locator: "question:one", revision: "question-revision:one" } });
  assert.equal(linked.code, 0);
  const answer = await invoke(store, "matters.answers.submit", { matter_id: matter.id, expected_revision: linked.body.result.matter.revision, answer: { id: "answer:one", body: "Use the space successor" } });
  assert.equal(answer.code, 0);
  const closedBySteward = await invoke(store, "matters.questions.close", { matter_id: matter.id, expected_revision: answer.body.result.matter.revision, owner: { kind: "steward", id: "steward:global" }, result_locator: "result:one" });
  assert.equal(closedBySteward.code, 2);
  assert.equal(closedBySteward.body.failure.code, "question_owner_required");
  const closed = await invoke(store, "matters.questions.close", { matter_id: matter.id, expected_revision: answer.body.result.matter.revision, owner: { kind: "blueprint", id: "blueprint:one" }, result_locator: "result:one" });
  assert.equal(closed.code, 0);
  assert.equal(closed.body.result.matter.question.state, "resolved");
});
