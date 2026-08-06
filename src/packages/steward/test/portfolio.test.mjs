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
  const dir = await mkdtemp(path.join(os.tmpdir(), "steward-f008-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return path.join(dir, "steward.json");
}

const observation = (id, matterId, condition, observedAt, extra = {}) => ({
  id,
  matter_id: matterId,
  owner: { kind: "frame", id: `frame:${matterId.slice("matter:".length)}` },
  artifact: { id: `frame-artifact:${matterId.slice("matter:".length)}`, revision: `frame-revision:${condition}` },
  represented_revision: `frame-revision:${condition}`,
  currentness: "current",
  observed_at: observedAt,
  condition,
  limitations: [],
  ...extra,
});

async function portfolioFixture(t) {
  const store = await fixture(t);
  const identity = await invoke(store, "identity.resolve");
  const alpha = await invoke(store, "spaces.create", { expected_directory_revision: identity.body.result.directory.revision, space: { id: "space:alpha", name: "Alpha" } });
  const beta = await invoke(store, "spaces.create", { expected_directory_revision: alpha.body.result.directory.revision, space: { id: "space:beta", name: "Beta" } });
  const captures = [];
  for (const [index, spaceId] of ["space:alpha", "space:alpha", "space:alpha", "space:beta"].entries()) {
    const captured = await invoke(store, "intakes.capture", {
      replay_key: `portfolio:${index}`,
      content: `Intent ${index}`,
      provenance: { source: "architect", ordinal: index },
      space_id: spaceId,
      relevance_reason: `Intent ${index} remains relevant`,
      owner_references: [{ kind: "frame", id: `frame:owner-${index}` }],
    });
    captures.push(captured.body.result.matter);
  }
  const deferred = await invoke(store, "matters.transition", {
    matter_id: captures[3].id,
    expected_revision: captures[3].revision,
    transition: "deferred",
    relevance_reason: captures[3].relevance_reason,
    deferral_reason: "Await owner event",
    return_condition: { kind: "owner_event", value: "implementation-result" },
  });
  captures[3] = deferred.body.result.matter;
  const retired = await invoke(store, "spaces.retire", { space_id: "space:beta", expected_revision: beta.body.result.space.revision });
  const association = await invoke(store, "spaces.associations.set", {
    space_id: "space:alpha",
    expected_revision: alpha.body.result.space.revision,
    association: { namespace_id: "namespace:agent-platform", include_descendants: false, expected_association_revision: 0 },
  });
  return { store, alpha: association.body.result.space, beta: retired.body.result.space, matters: captures };
}

test("Portfolio composes reproducible complete active and retired Space manifests with attributable gaps", async (t) => {
  const { store, matters } = await portfolioFixture(t);
  const observations = matters.map((matter, index) => observation(`observation:${index}`, matter.id, index === 1 ? "blocked" : "current", `2026-08-0${index + 1}T00:00:00.000Z`));
  const request = { scope: { kind: "global" }, observations };
  const first = await invoke(store, "portfolio.compose", request);
  assert.equal(first.code, 0);
  assert.equal(first.body.result.view.scope.kind, "global");
  assert.equal(first.body.result.view.manifest.directory.revision, 3);
  assert.equal(first.body.result.view.manifest.spaces.length, 2);
  assert.equal(first.body.result.view.manifest.spaces.find((space) => space.id === "space:beta").lifecycle, "retired");
  assert.equal(first.body.result.view.manifest.spaces.find((space) => space.id === "space:beta").matters[0].id, matters[3].id);
  assert.equal(first.body.result.view.manifest.mixed_age, true);
  assert.deepEqual(first.body.result.view.coverage.gaps, []);

  const repeated = await invoke(store, "portfolio.compose", request);
  assert.equal(repeated.code, 0);
  assert.equal(repeated.body.result.view.id, first.body.result.view.id);

  const changed = await invoke(store, "portfolio.compose", { ...request, observations: observations.map((item) => item.id === "observation:1" ? { ...item, condition: "conflicting" } : item) });
  assert.equal(changed.code, 0);
  assert.notEqual(changed.body.result.view.id, first.body.result.view.id);

  const omitted = await invoke(store, "portfolio.compose", { ...request, observations: observations.slice(0, 3) });
  assert.equal(omitted.code, 0);
  assert.equal(omitted.body.result.view.coverage.gaps.some((gap) => gap.code === "owner_observation_missing" && gap.matter_id === matters[3].id), true);

  const conflicting = await invoke(store, "portfolio.compose", { ...request, observations: [...observations, { ...observations[0], id: "observation:conflict", condition: "blocked" }] });
  assert.equal(conflicting.code, 0);
  assert.equal(conflicting.body.result.view.coverage.gaps.some((gap) => gap.code === "observation_conflicting"), true);
});

test("Portfolio preserves evidence-cited bands, independent axes, ties, indeterminacy, return limits, and Search/Namespace context", async (t) => {
  const { store, matters } = await portfolioFixture(t);
  const observations = matters.map((matter, index) => observation(`attention:${index}`, matter.id, index === 3 ? "satisfied" : "current", `2026-08-0${index + 1}T00:00:00.000Z`));
  const attention = ["urgent", "next-conversation", "briefing", "quiet"].map((band, index) => ({
    matter_id: matters[index].id,
    band,
    evidence_ids: [`attention:${index}`],
    axes: { human_needed: index % 2 === 0, independently_progressing: index < 2, observation_limited: index === 2 },
    smallest_action: { text: `Review intent ${index}`, evidence_id: `attention:${index}` },
  }));
  const composed = await invoke(store, "portfolio.compose", {
    scope: { kind: "space", space_id: "space:alpha" },
    observations,
    attention: [attention[0], { ...attention[1], band: "urgent" }],
    search: { results: [{ id: "case:one", provenance: { source: "casebook-search" }, represented_revision: "case-revision:one", condition: "partial" }], continuation: { cursor: "next-page", limitations: ["eventually_convergent"] } },
    namespace_context: { namespace_id: "namespace:agent-platform", mode: "filter" },
  });
  assert.equal(composed.code, 0);
  const view = composed.body.result.view;
  assert.equal(view.orientation.recommendations.filter((item) => item.band === "urgent").length, 2);
  assert.equal(view.orientation.recommendations[0].axes.human_needed, true);
  assert.equal(view.orientation.recommendations[1].axes.human_needed, false);
  assert.equal(view.orientation.recommendations[0].explanation.provenance.source, "architect");
  assert.equal(view.orientation.indeterminate.some((item) => item.matter_id === matters[2].id), true);
  assert.equal(view.search.continuation.cursor, "next-page");
  assert.equal(view.search.completeness, "not_established");
  assert.equal(view.namespace.association.namespace_id, "namespace:agent-platform");

  const betaAssociation = await invoke(store, "spaces.associations.set", { space_id: "space:beta", expected_revision: 2, association: { namespace_id: "namespace:agent-platform", include_descendants: true, expected_association_revision: 0 } });
  assert.equal(betaAssociation.code, 0);
  const contradictory = await invoke(store, "portfolio.compose", { scope: { kind: "global" }, observations, namespace_context: { namespace_id: "namespace:agent-platform", mode: "rank" } });
  assert.equal(contradictory.code, 0);
  assert.equal(contradictory.body.result.view.namespace.conflicting, true);
  assert.equal(contradictory.body.result.view.namespace.associations.length, 2);
  const removedAssociation = await invoke(store, "spaces.associations.remove", { space_id: "space:alpha", expected_revision: 2, namespace_id: "namespace:agent-platform" });
  assert.equal(removedAssociation.code, 0);
  const retiredNamespace = await invoke(store, "portfolio.compose", { scope: { kind: "space", space_id: "space:alpha" }, observations, namespace_context: { namespace_id: "namespace:agent-platform", mode: "filter" } });
  assert.equal(retiredNamespace.code, 0);
  assert.equal(retiredNamespace.body.result.view.namespace.association.status, "retired");

  const bandsAndReturn = await invoke(store, "portfolio.compose", { scope: { kind: "global" }, observations, attention });
  assert.equal(bandsAndReturn.code, 0);
  assert.deepEqual(bandsAndReturn.body.result.view.orientation.recommendations.map((item) => item.band), ["urgent", "next-conversation", "briefing", "quiet"]);
  assert.equal(bandsAndReturn.body.result.view.returns.find((item) => item.matter_id === matters[3].id).status, "satisfied");

  const uncheckable = await invoke(store, "portfolio.compose", { scope: { kind: "global" }, observations: observations.map((item) => item.matter_id === matters[3].id ? { ...item, condition: "unavailable", limitations: ["owner endpoint unavailable"] } : item) });
  assert.equal(uncheckable.code, 0);
  assert.equal(uncheckable.body.result.view.returns.find((item) => item.matter_id === matters[3].id).status, "uncheckable");

  const root = await invoke(store, "portfolio.compose", { scope: { kind: "space", space_id: "space:alpha" }, observations, namespace_context: { namespace_id: "namespace:root", mode: "filter" } });
  assert.equal(root.code, 2);
  assert.equal(root.body.failure.code, "root_namespace_forbidden");
});

test("Portfolio acknowledgement re-observes identical scope, CASes only that baseline, is idempotent, and survives restart", async (t) => {
  const { store, matters } = await portfolioFixture(t);
  const observations = matters.map((matter, index) => observation(`ack:${index}`, matter.id, "current", `2026-08-0${index + 1}T00:00:00.000Z`));
  const globalRequest = { scope: { kind: "global" }, observations };
  const global = await invoke(store, "portfolio.compose", globalRequest);
  const spaceRequest = { scope: { kind: "space", space_id: "space:alpha" }, observations };
  const space = await invoke(store, "portfolio.compose", spaceRequest);

  const acknowledged = await invoke(store, "portfolio.acknowledge", { view_id: global.body.result.view.id, view_request: globalRequest, expected_baseline_revision: 0 });
  assert.equal(acknowledged.code, 0);
  assert.equal(acknowledged.body.result.baseline.scope.kind, "global");
  assert.equal(acknowledged.body.result.baseline.revision, 1);
  const replay = await invoke(store, "portfolio.acknowledge", { view_id: global.body.result.view.id, view_request: globalRequest, expected_baseline_revision: 0 });
  assert.equal(replay.code, 0);
  assert.equal(replay.body.result.replayed, true);

  const spaceAcknowledged = await invoke(store, "portfolio.acknowledge", { view_id: space.body.result.view.id, view_request: spaceRequest, expected_baseline_revision: 0 });
  assert.equal(spaceAcknowledged.code, 0);
  assert.equal(spaceAcknowledged.body.result.baseline.scope.space_id, "space:alpha");
  const baselines = await invoke(store, "portfolio.baselines.read");
  assert.equal(baselines.code, 0);
  assert.equal(baselines.body.result.global.view_id, global.body.result.view.id);
  assert.equal(baselines.body.result.spaces["space:alpha"].view_id, space.body.result.view.id);

  const changedSources = await invoke(store, "portfolio.acknowledge", { view_id: global.body.result.view.id, view_request: { ...globalRequest, observations: observations.map((item) => item.id === "ack:0" ? { ...item, condition: "blocked" } : item) }, expected_baseline_revision: 1 });
  assert.equal(changedSources.code, 2);
  assert.equal(changedSources.body.failure.code, "view_not_reproducible");
  const stillStored = await invoke(store, "portfolio.baselines.read");
  assert.equal(stillStored.body.result.global.view_id, global.body.result.view.id);

  const alternative = await invoke(store, "portfolio.compose", { ...globalRequest, observations: observations.map((item) => item.id === "ack:1" ? { ...item, condition: "blocked" } : item) });
  const staleCas = await invoke(store, "portfolio.acknowledge", { view_id: alternative.body.result.view.id, view_request: { ...globalRequest, observations: observations.map((item) => item.id === "ack:1" ? { ...item, condition: "blocked" } : item) }, expected_baseline_revision: 0 });
  assert.equal(staleCas.code, 2);
  assert.equal(staleCas.body.failure.code, "baseline_revision_conflict");
});
