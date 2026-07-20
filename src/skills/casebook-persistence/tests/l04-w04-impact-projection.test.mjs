import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  cleanupSandbox,
  generateAndValidateSandbox,
  selectCompatibleSqliteBinary,
} from "./sandbox-harness.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceEntrypoint = path.join(packageRoot, "variants/sqlite/bin/casebook-persistence.mjs");
const protocol = { id: "casebook-persistence-json", version: 1 };
const ids = Object.freeze({
  case: "case:4c5aa065-6e3d-4356-b3f0-e3131273407a",
  staleFrame: "frame:c1d318fa-0ddb-4614-9737-166641401c15",
  currentFrame: "frame:462c4b43-7548-4011-94f5-edd07b342f26",
  deferredFrame: "frame:b5dd38e1-1dee-4c65-90a4-df318274c930",
  unknownFrame: "frame:017adce5-8418-4ca7-a796-f4dd01c050c9",
  navigationFrame: "frame:180a06af-1216-4eb9-8707-18396e84417d",
  staleDiscovery: "discovery:6bbc713d-4f01-4942-b9db-7d81e043b67f",
  currentDiscovery: "discovery:0aeea1b5-8131-4b80-9c89-def6101e8958",
  deferredDiscovery: "discovery:27c0c701-ed70-4e86-9b27-96002ea4ac51",
  unknownDiscovery: "discovery:cbf83e02-fede-4e12-8692-a1264d3316a7",
  navigationDiscovery: "discovery:ebc55cc7-f8d8-4837-9929-2077b6845edd",
});
const authorityClaim = Object.freeze({ human_authorized: true, acting_role: "architect", authority_basis: "disposable L04-W04 evidence" });

function invoke(entrypoint, cwd, request) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [entrypoint], {
      cwd, encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? "", HOME: cwd },
    }, (error, stdout, stderr) => resolve({ code: error ? 2 : 0, json: stdout ? JSON.parse(stdout) : {}, stderr }));
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

async function sqlite(state, sql) {
  return new Promise((resolve, reject) => execFile(
    state.sqliteBinary, ["-batch", "-bail", "-json", state.store, sql], { encoding: "utf8" },
    (error, stdout, stderr) => error ? reject(new Error(stderr || error.message)) : resolve(JSON.parse(stdout || "[]")),
  ));
}

async function setup(entrypoint = sourceEntrypoint, label = "source") {
  const root = await mkdtemp(path.join(os.tmpdir(), `casebook-l04-w04-${label}-`));
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const store = path.join(root, "store.sqlite3");
  const configuration = { source: { kind: "synthetic-test", locator: `l04-w04:${label}` }, authority_mode: "sqlite", sqlite: { database_url: store, sqlite_bin: sqliteBinary } };
  const initialized = await invoke(entrypoint, root, { protocol, operation: "initialize_store", operation_id: `operation:l04-w04:${label}:init`, authority_claim: authorityClaim, configuration });
  assert.equal(initialized.code, 0, initialized.stderr || JSON.stringify(initialized.json));
  const initialization = initialized.json.result.initialization;
  return { root, store, sqliteBinary, entrypoint, configuration, initialization, context: { view_id: initialization.view.id, view_policy_revision_id: initialization.view.policy_revision_id, purpose: "bounded current-first impact", requested_audience_ceiling: "private" } };
}

function common(state) { return { protocol, request_version: 1, store_id: state.initialization.store_id, context: state.context, configuration: state.configuration }; }

async function createAndReviseRoot(state) {
  const created = await invoke(state.entrypoint, state.root, {
    ...common(state), operation: "case.create", operation_id: "operation:l04-w04:root:create", expected_revision: 0,
    commit_basis: "synthetic dependency root", provenance: { acting_role: "case" },
    case: { id: ids.case, home_namespace_id: state.initialization.namespace.id, state: "active", title: "Impact root", summary: "Root revision one.", scope: "Disposable", aliases: [], facets: [], entries: [], sources: [], relationships: [], references: [] },
  });
  assert.equal(created.code, 0, created.stderr || JSON.stringify(created.json));
  const read = await invoke(state.entrypoint, state.root, { ...common(state), operation: "case.read", case_id: ids.case });
  const next = structuredClone(read.json.result.case);
  next.summary = "Root revision two.";
  const revised = await invoke(state.entrypoint, state.root, {
    ...common(state), operation: "case.commit_revision", operation_id: "operation:l04-w04:root:revise", expected_revision: 1,
    commit_basis: "advance dependency root", provenance: { acting_role: "case" }, case: next,
  });
  assert.equal(revised.code, 0, revised.stderr || JSON.stringify(revised.json));
  return { oldRevision: created.json.result.revision.id, newRevision: revised.json.result.revision.id };
}

async function createFrame(state, frameId, discoveryId, options = {}) {
  const dependency = {
    target_kind: "case", target_id: ids.case, predicate: options.predicate ?? "depends-on",
    ...(options.observedRevision == null ? {} : { observed_revision_id: options.observedRevision }),
    ...(options.pinnedRevision == null ? {} : { pinned_revision_id: options.pinnedRevision }),
    provenance: "synthetic semantic dependency",
  };
  const result = await invoke(state.entrypoint, state.root, {
    ...common(state), operation: "frame.create", operation_id: `operation:l04-w04:${frameId}:create`, expected_revision: 0,
    commit_basis: "synthetic reverse dependency", provenance: { acting_role: "frame", authority_basis: "disposable" },
    frame: {
      id: frameId, home_namespace_id: state.initialization.namespace.id,
      authority_scope_namespace_ids: [state.initialization.namespace.id], status: options.status ?? "active",
      title: `Impact ${frameId}`, outcome: "Projection only.",
      case_links: options.navigationOnly ? [dependency] : [],
      discovery: [{
        id: discoveryId, display_order: 0, lifecycle: "active", category: options.category ?? "frontier",
        title: "Explicit dependency", body: "No semantic mutation.", human_authority: "not_required",
        dependencies: options.navigationOnly ? [] : [
          ...(options.duplicate ? [dependency, { ...dependency, predicate: "requires" }] : [dependency]),
          ...(options.selfCycle ? [{ target_kind: "frame", target_id: frameId, predicate: "depends-on", provenance: "synthetic self-cycle" }] : []),
        ],
      }],
    },
  });
  assert.equal(result.code, 0, result.stderr || JSON.stringify(result.json));
  return result;
}

function project(state, revisions, limit = 100, overrides = {}) {
  return invoke(state.entrypoint, state.root, {
    ...common(state), operation: "impact.project", root: {
      family_id: ids.case, old_revision_id: revisions.oldRevision, new_revision_id: revisions.newRevision,
    }, limit, ...overrides,
  });
}

async function seedImpact(state) {
  const revisions = await createAndReviseRoot(state);
  await createFrame(state, ids.staleFrame, ids.staleDiscovery, { observedRevision: revisions.oldRevision, pinnedRevision: revisions.oldRevision, duplicate: true });
  await createFrame(state, ids.currentFrame, ids.currentDiscovery, { observedRevision: revisions.newRevision });
  await createFrame(state, ids.deferredFrame, ids.deferredDiscovery, { observedRevision: revisions.oldRevision, category: "deferred" });
  await createFrame(state, ids.unknownFrame, ids.unknownDiscovery);
  await createFrame(state, ids.navigationFrame, ids.navigationDiscovery, { observedRevision: revisions.oldRevision, navigationOnly: true, predicate: "tracks" });
  return revisions;
}

test("current-first reverse impact returns direct deduplicated semantic dependents and lifecycle buckets", async () => {
  const state = await setup();
  try {
    const revisions = await seedImpact(state);
    const projected = await project(state, revisions);
    assert.equal(projected.code, 0, projected.stderr || JSON.stringify(projected.json));
    const result = projected.json.result;
    assert.equal(result.status, "projected");
    assert.deepEqual(result.root.requested_change, { old_revision_id: revisions.oldRevision, new_revision_id: revisions.newRevision });
    assert.deepEqual(result.root.current_revision, { id: revisions.newRevision, number: 2 });
    assert.deepEqual(result.dependents.map((item) => item.owner.id), [ids.unknownFrame, ids.currentFrame, ids.deferredFrame, ids.staleFrame].sort());
    assert.equal(result.dependents.some((item) => item.owner.id === ids.navigationFrame), false);

    const stale = result.dependents.find((item) => item.owner.id === ids.staleFrame);
    assert.equal(stale.recorded_revision.observed_revision_id, revisions.oldRevision);
    assert.equal(stale.recorded_revision.pinned_revision_id, revisions.oldRevision);
    assert.equal(stale.impact, "affected");
    assert.equal(stale.lifecycle.classification, "active");
    assert.deepEqual(stale.current_owner_disposition, { status: "active", component: { kind: "discovery", id: ids.staleDiscovery, lifecycle: "active", category: "frontier" } });
    assert.equal(stale.dependencies.length, 2);
    assert.deepEqual(stale.dependencies.map((item) => item.kind).sort(), ["discovery_dependency", "discovery_dependency"]);
    assert.deepEqual(stale.dependencies.map((item) => item.path.predicate).sort(), ["depends-on", "requires"]);

    assert.deepEqual(result.counts, { examined: 4, affected: 1, unchanged: 1, deferred: 1, unknown: 1, overflow: 0 });
    assert.equal(result.stop_reason, "unknown_dependency_state");
    assert.equal(result.result_completeness, "complete_within_bounds");
    assert.equal(result.mutation_performed, false);
    assert.equal(result.projection.disposition, "disposable_replaceable");
    assert.equal(result.authority.semantic_owner_mutation, "not_granted");
    assert.equal(result.authority.executive_assistant_effects, "not_granted");
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("projection is bounded with truthful overflow and leaves semantic owner tables byte-for-byte unchanged", async () => {
  const state = await setup();
  try {
    const revisions = await seedImpact(state);
    const before = await sqlite(state, `SELECT
      (SELECT json_group_array(json_object('owner_id',owner_id,'revision_id',revision_id,'revision_number',revision_number,'projection_json',projection_json)) FROM (SELECT * FROM owner_current ORDER BY owner_id)) AS current_json,
      (SELECT count(*) FROM owner_revisions) AS revision_count,
      (SELECT count(*) FROM owner_events) AS event_count,
      (SELECT operation_fence FROM store_fence WHERE singleton=1) AS operation_fence;`);
    const projected = await project(state, revisions, 2);
    assert.equal(projected.code, 0, projected.stderr || JSON.stringify(projected.json));
    assert.equal(projected.json.result.dependents.length, 2);
    assert.deepEqual(projected.json.result.counts, { examined: 2, affected: 0, unchanged: 1, deferred: 0, unknown: 1, overflow: 2 });
    assert.equal(projected.json.result.stop_reason, "result_limit");
    assert.equal(projected.json.result.result_completeness, "truncated");
    assert.deepEqual(await sqlite(state, `SELECT
      (SELECT json_group_array(json_object('owner_id',owner_id,'revision_id',revision_id,'revision_number',revision_number,'projection_json',projection_json)) FROM (SELECT * FROM owner_current ORDER BY owner_id)) AS current_json,
      (SELECT count(*) FROM owner_revisions) AS revision_count,
      (SELECT count(*) FROM owner_events) AS event_count,
      (SELECT operation_fence FROM store_fence WHERE singleton=1) AS operation_fence;`), before);
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("direct-only projection remains cycle-safe and fails closed for revision, policy, and authority widening", async () => {
  const state = await setup();
  try {
    const revisions = await createAndReviseRoot(state);
    await createFrame(state, ids.staleFrame, ids.staleDiscovery, { observedRevision: revisions.oldRevision, selfCycle: true });
    const direct = await project(state, revisions);
    assert.equal(direct.code, 0, direct.stderr || JSON.stringify(direct.json));
    assert.deepEqual(direct.json.result.dependents.map((item) => item.owner.id), [ids.staleFrame]);
    assert.equal(direct.json.result.traversal, "direct_only_cycle_safe");

    const wrongRevision = await project(state, { ...revisions, newRevision: "case-revision:00000000-0000-4000-8000-000000000000" });
    assert.equal(wrongRevision.code, 2);
    assert.equal(wrongRevision.json.failure.code, "impact.root_not_found_or_not_visible");
    assert.deepEqual(wrongRevision.json.failure.evidence, {});
    const widened = await project(state, revisions, 10, { semantic_authority: true });
    assert.equal(widened.code, 2);
    assert.equal(widened.json.failure.code, "impact.request_invalid");
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("generated Pi, Codex, and OpenCode copies preserve disposable impact projection and clean up", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "casebook-l04-w04-generated-"));
  try {
    const generated = await generateAndValidateSandbox({ sandboxRoot: sandbox });
    for (const item of generated.results) {
      const state = await setup(path.join(item.package_root, "variants/sqlite/bin/casebook-persistence.mjs"), item.target);
      try {
        const revisions = await createAndReviseRoot(state);
        await createFrame(state, ids.staleFrame, ids.staleDiscovery, { observedRevision: revisions.oldRevision });
        const projected = await project(state, revisions);
        assert.equal(projected.code, 0, projected.stderr || JSON.stringify(projected.json));
        assert.deepEqual(projected.json.result.counts, { examined: 1, affected: 1, unchanged: 0, deferred: 0, unknown: 0, overflow: 0 });
        assert.equal(projected.json.result.mutation_performed, false);
      } finally {
        await rm(state.root, { recursive: true, force: true });
      }
    }
  } finally {
    assert.equal(await cleanupSandbox(sandbox), true);
    assert.equal(await stat(sandbox).then(() => true).catch(() => false), false);
  }
});
