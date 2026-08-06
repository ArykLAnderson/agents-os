import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const bin = path.join(root, "bin", "steward.mjs");

async function invoke(store, operation, request = {}, environment = {}) {
  return await new Promise((resolve, reject) => {
    const child = execFile(process.execPath, [bin], { env: { ...process.env, STEWARD_STORE: store, ...environment } }, (error, stdout, stderr) => {
      if (error && error.code !== 0 && !stdout) return reject(error);
      resolve({ code: error?.code ?? 0, body: JSON.parse(stdout), stderr });
    });
    child.stdin.end(`${JSON.stringify({ operation, ...request })}\n`);
  });
}

async function waitForFile(file) {
  const deadline = Date.now() + 5_000;
  while (true) {
    try { await readFile(file); return; }
    catch (error) {
      if (error?.code !== "ENOENT") throw error;
      if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${file}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
}

async function waitForAnyFile(files) {
  const deadline = Date.now() + 5_000;
  while (true) {
    for (const file of files) {
      try { await readFile(file); return file; }
      catch (error) { if (error?.code !== "ENOENT") throw error; }
    }
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for one of ${files.join(", ")}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
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

  const captured = await invoke(store, "intakes.capture", { replay_key: "capture:one", content: "Keep the successor intent", provenance: { source: "architect" }, space_id: "space:agent-os", expected_space_revision: created.body.result.space.revision, relevance_reason: "The accepted route still needs delivery", owner_references: [{ kind: "frame", id: "frame:abc" }] });
  assert.equal(captured.code, 0);
  assert.equal(captured.body.result.matter.home_space_id, "space:agent-os");
  assert.equal(captured.body.result.matter.return_condition.kind, "none");

  const replay = await invoke(store, "intakes.capture", { replay_key: "capture:one", content: "Keep the successor intent", provenance: { source: "architect" }, space_id: "space:agent-os", expected_space_revision: created.body.result.space.revision, relevance_reason: "The accepted route still needs delivery", owner_references: [{ kind: "frame", id: "frame:abc" }] });
  assert.equal(replay.code, 0);
  assert.equal(replay.body.result.intake.id, captured.body.result.intake.id);
  assert.equal(replay.body.result.matter.id, captured.body.result.matter.id);

  const resolved = await invoke(store, "matters.read", { matter_id: captured.body.result.matter.id });
  assert.equal(resolved.code, 0);
  assert.equal(resolved.body.result.matter.relevance_reason, "The accepted route still needs delivery");
});

test("concurrent Space creation preserves the directory or returns a typed revision conflict", async (t) => {
  const store = await fixture(t);
  const identity = await invoke(store, "identity.resolve");
  const expectedDirectoryRevision = identity.body.result.directory.revision;
  const attempts = await Promise.all(Array.from({ length: 100 }, (_, index) => invoke(store, "spaces.create", {
    expected_directory_revision: expectedDirectoryRevision,
    space: { id: `space:race-${index}`, name: `Race ${index}` },
  })));

  const successful = attempts.filter((attempt) => attempt.code === 0);
  const conflicts = attempts.filter((attempt) => attempt.code === 2 && attempt.body.failure.code === "directory_revision_conflict");
  assert.equal(successful.length, 1);
  assert.equal(conflicts.length, 99);

  const manifest = await invoke(store, "spaces.manifest", { space_id: successful[0].body.result.space.id });
  assert.equal(manifest.code, 0);
  assert.equal(manifest.body.result.space.id, successful[0].body.result.space.id);
});

test("a delayed earlier transaction claim cannot enter after a later writer has read stale state", async (t) => {
  const store = await fixture(t);
  const markerDirectory = path.join(path.dirname(store), "barrier");
  const control = path.join(path.dirname(store), "transaction-barrier.mjs");
  await writeFile(control, `
import fs from "node:fs";
import path from "node:path";
import { syncBuiltinESMExports } from "node:module";
const role = process.env.LOCK_TEST_ROLE;
const store = path.resolve(process.env.STEWARD_STORE);
const markers = process.env.LOCK_TEST_MARKERS;
const originalWrite = fs.writeFileSync.bind(fs);
const originalRename = fs.renameSync.bind(fs);
const originalExists = fs.existsSync.bind(fs);
const waiter = new Int32Array(new SharedArrayBuffer(4));
let legacyClaim = false;
const mark = (name) => originalWrite(path.join(markers, name), "ready\\n", { flag: "w" });
const wait = (name) => {
  const target = path.join(markers, name);
  const deadline = Date.now() + 5_000;
  while (!originalExists(target)) {
    if (Date.now() >= deadline) throw new Error(\`Timed out waiting for \${name}\`);
    Atomics.wait(waiter, 0, 0, 5);
  }
};
fs.mkdirSync(markers, { recursive: true });
fs.writeFileSync = function (target, ...args) {
  const destination = String(target);
  if (role === "a" && destination.endsWith(".claim")) {
    mark("a-before-claim");
    wait("b-before-publish");
  }
  const result = originalWrite(target, ...args);
  if (destination.endsWith(".claim")) {
    legacyClaim = true;
    if (role === "a") mark("a-claim-published");
  }
  if (role === "a" && destination.endsWith(".lock")) mark("a-lock-acquired");
  if (legacyClaim && role === "a" && destination.endsWith(".tmp")) {
    mark("a-before-publish");
    wait("b-published");
  }
  if (legacyClaim && role === "b" && destination.endsWith(".tmp")) {
    mark("b-before-publish");
    wait("a-before-publish");
  }
  return result;
};
fs.renameSync = function (source, target, ...args) {
  const destination = path.resolve(String(target));
  const result = originalRename(source, target, ...args);
  if (legacyClaim && role === "b" && destination === store && String(source).endsWith(".tmp")) mark("b-published");
  return result;
};
syncBuiltinESMExports();
`);
  const identity = await invoke(store, "identity.resolve");
  const request = (id) => ({ expected_directory_revision: identity.body.result.directory.revision, space: { id: `space:${id}`, name: id.toUpperCase() } });
  const environment = { NODE_OPTIONS: `--import=${control}`, LOCK_TEST_MARKERS: markerDirectory };
  const first = invoke(store, "spaces.create", request("a"), { ...environment, LOCK_TEST_ROLE: "a" });
  const firstMarker = await waitForAnyFile([path.join(markerDirectory, "a-before-claim"), path.join(markerDirectory, "a-lock-acquired")]);
  const second = invoke(store, "spaces.create", request("b"), { ...environment, LOCK_TEST_ROLE: "b" });
  if (firstMarker.endsWith("a-before-claim")) {
    await waitForFile(path.join(markerDirectory, "b-before-publish"));
    await waitForFile(path.join(markerDirectory, "a-before-publish"));
  }
  const attempts = await Promise.all([first, second]);

  const successful = attempts.filter((attempt) => attempt.code === 0);
  const conflicts = attempts.filter((attempt) => attempt.code === 2 && attempt.body.failure.code === "directory_revision_conflict");
  assert.equal(successful.length, 1);
  assert.equal(conflicts.length, 1);
  const persisted = JSON.parse(await readFile(store, "utf8"));
  assert.equal(persisted.directory.revision, 1);
  assert.deepEqual(Object.keys(persisted.directory.spaces), [successful[0].body.result.space.id]);
});

test("the facade rejects stale writes, bad deferrals, root associations, and retired placement without partial mutation", async (t) => {
  const store = await fixture(t);
  const identity = await invoke(store, "identity.resolve");
  const space = await invoke(store, "spaces.create", { expected_directory_revision: identity.body.result.directory.revision, space: { id: "space:tanego", name: "Tanego" } });
  const capture = await invoke(store, "intakes.capture", { replay_key: "capture:two", content: "Review vocabulary", provenance: { source: "architect" }, space_id: "space:tanego", expected_space_revision: space.body.result.space.revision, relevance_reason: "A learner-facing change is pending", owner_references: [] });
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

  const root = await invoke(store, "spaces.associations.set", { space_id: "space:tanego", expected_revision: deferred.body.result.space.revision, association: { namespace_id: "namespace:root", include_descendants: false } });
  assert.equal(root.code, 2);
  assert.equal(root.body.failure.code, "root_namespace_forbidden");
  const associated = await invoke(store, "spaces.associations.set", { space_id: "space:tanego", expected_revision: deferred.body.result.space.revision, association: { namespace_id: "namespace:agent-platform", include_descendants: false, expected_association_revision: 0 } });
  assert.equal(associated.code, 0);
  const removed = await invoke(store, "spaces.associations.remove", { space_id: "space:tanego", expected_revision: associated.body.result.space.revision, namespace_id: "namespace:agent-platform" });
  assert.equal(removed.code, 0);
  assert.equal(removed.body.result.retired_association.namespace_id, "namespace:agent-platform");

  const returned = await invoke(store, "matters.transition", { matter_id: matter.id, expected_revision: deferred.body.result.matter.revision, transition: "return", relevance_reason: matter.relevance_reason });
  const quiet = await invoke(store, "matters.transition", { matter_id: matter.id, expected_revision: returned.body.result.matter.revision, transition: "quiet", relevance_reason: matter.relevance_reason });
  const released = await invoke(store, "matters.transition", { matter_id: matter.id, expected_revision: quiet.body.result.matter.revision, transition: "release", relevance_reason: matter.relevance_reason });
  const restored = await invoke(store, "matters.transition", { matter_id: matter.id, expected_revision: released.body.result.matter.revision, transition: "restored", relevance_reason: matter.relevance_reason });
  assert.equal(restored.body.result.matter.lifecycle, "active");

  const retire = await invoke(store, "spaces.retire", { space_id: "space:tanego", expected_revision: restored.body.result.space.revision });
  assert.equal(retire.code, 0);
  const placement = await invoke(store, "intakes.capture", { replay_key: "capture:retired", content: "Cannot enter", provenance: { source: "architect" }, space_id: "space:tanego", expected_space_revision: retire.body.result.space.revision, relevance_reason: "No", owner_references: [] });
  assert.equal(placement.code, 2);
  assert.equal(placement.body.failure.code, "space_retired");

  const complete = await invoke(store, "spaces.manifest", { space_id: "space:tanego" });
  assert.equal(complete.code, 0);
  assert.equal(complete.body.result.matters.length, 1);
  assert.equal(complete.body.result.matters[0].id, matter.id);
});

test("Space custody manifests advance their Space revision and reject stale placement", async (t) => {
  const store = await fixture(t);
  const identity = await invoke(store, "identity.resolve");
  const space = await invoke(store, "spaces.create", { expected_directory_revision: identity.body.result.directory.revision, space: { id: "space:currentness", name: "Currentness" } });
  const first = await invoke(store, "intakes.capture", { replay_key: "capture:currentness-one", content: "First custody item", provenance: { source: "architect" } });
  const second = await invoke(store, "intakes.capture", { replay_key: "capture:currentness-two", content: "Second custody item", provenance: { source: "architect" } });

  const placed = await invoke(store, "matters.place", { intake_id: first.body.result.intake.id, space_id: "space:currentness", expected_space_revision: space.body.result.space.revision, relevance_reason: "First custody mutation", owner_references: [] });
  assert.equal(placed.code, 0);
  assert.equal(placed.body.result.space.revision, space.body.result.space.revision + 1);
  const stale = await invoke(store, "matters.place", { intake_id: second.body.result.intake.id, space_id: "space:currentness", expected_space_revision: space.body.result.space.revision, relevance_reason: "Second custody mutation", owner_references: [] });
  assert.equal(stale.code, 2);
  assert.equal(stale.body.failure.code, "space_revision_conflict");
  const manifest = await invoke(store, "spaces.manifest", { space_id: "space:currentness" });
  assert.equal(manifest.body.result.space.revision, placed.body.result.space.revision);
  assert.deepEqual(manifest.body.result.matters.map((matter) => matter.id), [placed.body.result.matter.id]);
});

test("direct Intake capture CASes the Space revision before changing its manifest", async (t) => {
  const store = await fixture(t);
  const identity = await invoke(store, "identity.resolve");
  const space = await invoke(store, "spaces.create", { expected_directory_revision: identity.body.result.directory.revision, space: { id: "space:direct-capture", name: "Direct capture" } });
  const captured = await invoke(store, "intakes.capture", { replay_key: "capture:direct-one", content: "First direct custody item", provenance: { source: "architect" }, space_id: "space:direct-capture", expected_space_revision: space.body.result.space.revision, relevance_reason: "First direct custody mutation", owner_references: [] });
  assert.equal(captured.code, 0);
  assert.equal(captured.body.result.space.revision, space.body.result.space.revision + 1);
  const stale = await invoke(store, "intakes.capture", { replay_key: "capture:direct-two", content: "Second direct custody item", provenance: { source: "architect" }, space_id: "space:direct-capture", expected_space_revision: space.body.result.space.revision, relevance_reason: "Second direct custody mutation", owner_references: [] });
  assert.equal(stale.code, 2);
  assert.equal(stale.body.failure.code, "space_revision_conflict");
  const manifest = await invoke(store, "spaces.manifest", { space_id: "space:direct-capture" });
  assert.deepEqual(manifest.body.result.matters.map((matter) => matter.id), [captured.body.result.matter.id]);
});

test("Question Answer submission and closure leave Matter unchanged without its owner endpoint", async (t) => {
  const store = await fixture(t);
  const identity = await invoke(store, "identity.resolve");
  const space = await invoke(store, "spaces.create", { expected_directory_revision: identity.body.result.directory.revision, space: { id: "space:docs", name: "Docs" } });
  const intake = await invoke(store, "intakes.capture", { replay_key: "capture:unplaced", content: "Ask the design owner", provenance: { source: "architect" } });
  assert.equal(intake.body.result.matter, null);
  const placed = await invoke(store, "matters.place", { intake_id: intake.body.result.intake.id, space_id: "space:docs", expected_space_revision: space.body.result.space.revision, relevance_reason: "The owner needs an answer", owner_references: [{ kind: "blueprint", id: "blueprint:one" }] });
  assert.equal(placed.body.result.space.revision, space.body.result.space.revision + 1);
  assert.equal(placed.code, 0);
  const matter = placed.body.result.matter;

  const linked = await invoke(store, "matters.questions.link", { matter_id: matter.id, expected_revision: matter.revision, question: { owner: { kind: "blueprint", id: "blueprint:one" }, locator: "question:one", revision: "question-revision:one" } });
  assert.equal(linked.code, 0);
  const before = linked.body.result.matter;
  const answer = await invoke(store, "matters.answers.submit", { matter_id: matter.id, expected_revision: before.revision, answer: { id: "answer:one", body: "Use the space successor" } });
  assert.equal(answer.code, 2);
  assert.equal(answer.body.failure.code, "question_owner_unavailable");
  const after = await invoke(store, "matters.read", { matter_id: matter.id });
  assert.deepEqual(after.body.result.matter, before);
  assert.equal(JSON.stringify(after.body).includes("Use the space successor"), false);
  const closedBySteward = await invoke(store, "matters.questions.close", { matter_id: matter.id, expected_revision: before.revision, owner: { kind: "steward", id: "steward:global" }, result_locator: "result:one" });
  assert.equal(closedBySteward.code, 2);
  assert.equal(closedBySteward.body.failure.code, "question_owner_unavailable");
  const spoofedOwner = await invoke(store, "matters.questions.close", { matter_id: matter.id, expected_revision: before.revision, owner: { kind: "blueprint", id: "blueprint:one" }, disposition: "resolved", result_locator: "result:one" });
  assert.equal(spoofedOwner.code, 2);
  assert.equal(spoofedOwner.body.failure.code, "question_owner_unavailable");
});
