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
  rootCase: "case:9053ec24-3f1e-4da9-b4a3-7f84d8f6257d",
  auxiliaryCase: "case:9153ec24-3f1e-4da9-b4a3-7f84d8f6257d",
  activeFrame: "frame:920bd36b-7d2e-42a8-b423-d321867fb278",
  historicalFrame: "frame:930bd36b-7d2e-42a8-b423-d321867fb278",
  activeDiscovery: "discovery:945bd36b-7d2e-42a8-b423-d321867fb278",
  historicalDiscovery: "discovery:955bd36b-7d2e-42a8-b423-d321867fb278",
  consumer: "consumer:96b82c54-3af4-4324-b13f-71c5833bd679",
  narrowPolicy: "view-policy:97b82c54-3af4-4324-b13f-71c5833bd679",
  broadPolicy: "view-policy:98b82c54-3af4-4324-b13f-71c5833bd679",
});
const authorityClaim = Object.freeze({
  human_authorized: true,
  acting_role: "architect",
  authority_basis: "disposable L04-W05 Steward integration evidence",
});

function invoke(entrypoint, cwd, request) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [entrypoint], {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? "", HOME: cwd },
    }, (error, stdout, stderr) => resolve({
      code: error ? 2 : 0,
      json: stdout ? JSON.parse(stdout) : {},
      stderr,
    }));
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

async function sqlite(state, sql) {
  return new Promise((resolve, reject) => execFile(
    state.sqliteBinary,
    ["-batch", "-bail", "-json", state.store, sql],
    { encoding: "utf8" },
    (error, stdout, stderr) => error ? reject(new Error(stderr || error.message)) : resolve(JSON.parse(stdout || "[]")),
  ));
}

async function setup(entrypoint = sourceEntrypoint, label = "source") {
  const root = await mkdtemp(path.join(os.tmpdir(), `casebook-l04-w05-${label}-`));
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const store = path.join(root, "store.sqlite3");
  const configuration = {
    source: { kind: "synthetic-test", locator: `l04-w05:${label}` },
    authority_mode: "sqlite",
    sqlite: { database_url: store, sqlite_bin: sqliteBinary },
  };
  const initialized = await invoke(entrypoint, root, {
    protocol,
    operation: "initialize_store",
    operation_id: `operation:l04-w05:${label}:initialize`,
    authority_claim: authorityClaim,
    configuration,
  });
  assert.equal(initialized.code, 0, initialized.stderr || JSON.stringify(initialized.json));
  const initialization = initialized.json.result.initialization;
  return {
    root,
    store,
    sqliteBinary,
    entrypoint,
    configuration,
    initialization,
    context: {
      view_id: initialization.view.id,
      view_policy_revision_id: initialization.view.policy_revision_id,
      purpose: "bounded final Steward observation gate",
      requested_audience_ceiling: "private",
    },
  };
}

function common(state) {
  return {
    protocol,
    request_version: 1,
    store_id: state.initialization.store_id,
    context: state.context,
    configuration: state.configuration,
  };
}

function call(state, operation, fields = {}) {
  return invoke(state.entrypoint, state.root, { ...common(state), operation, ...fields });
}

async function createCase(state, caseId, operationId, title) {
  const result = await call(state, "case.create", {
    operation_id: operationId,
    expected_revision: 0,
    commit_basis: "synthetic Steward observation owner",
    provenance: { acting_role: "case", authority_basis: "disposable owner fixture" },
    case: {
      id: caseId,
      home_namespace_id: state.initialization.namespace.id,
      state: "active",
      title,
      summary: "Steward hydrates this only through the typed Case façade.",
      scope: "Disposable L04-W05 integration evidence.",
      aliases: [], facets: [], entries: [], sources: [], relationships: [], references: [],
    },
  });
  assert.equal(result.code, 0, result.stderr || JSON.stringify(result.json));
  return result;
}

async function reviseRootCase(state, created) {
  const read = await call(state, "case.read", { case_id: ids.rootCase });
  assert.equal(read.code, 0, read.stderr || JSON.stringify(read.json));
  const next = structuredClone(read.json.result.case);
  next.summary = "Revision two is the current-first dependency root.";
  const revised = await call(state, "case.commit_revision", {
    operation_id: "operation:l04-w05:root:revise",
    expected_revision: 1,
    commit_basis: "advance the observed dependency root",
    provenance: { acting_role: "case", authority_basis: "disposable current-first fixture" },
    case: next,
  });
  assert.equal(revised.code, 0, revised.stderr || JSON.stringify(revised.json));
  return { oldRevision: created.json.result.revision.id, newRevision: revised.json.result.revision.id };
}

async function createFrame(state, { frameId, discoveryId, rootRevision, historical }) {
  const result = await call(state, "frame.create", {
    operation_id: `operation:l04-w05:${historical ? "historical" : "active"}:frame`,
    expected_revision: 0,
    commit_basis: "synthetic Steward dependency owner",
    provenance: { acting_role: "frame", authority_basis: "disposable namespace scope" },
    frame: {
      id: frameId,
      home_namespace_id: state.initialization.namespace.id,
      authority_scope_namespace_ids: [state.initialization.namespace.id],
      status: historical ? "completed" : "active",
      title: `Steward observation ${historical ? "historical" : "active"} Frame`,
      outcome: historical ? "Retained provenance, outside current attention." : "Current attention remains owner-controlled.",
      case_links: [],
      discovery: [{
        id: discoveryId,
        display_order: 0,
        lifecycle: historical ? "settled" : "active",
        category: historical ? "settled" : "frontier",
        title: "Steward observation dependency",
        body: "The substrate describes impact but does not reconcile meaning.",
        human_authority: "not_required",
        ...(historical ? { disposition: "accepted", resolution: "Historical fixture settled before the root advanced." } : {}),
        dependencies: [{
          target_kind: "case",
          target_id: ids.rootCase,
          predicate: "depends-on",
          observed_revision_id: rootRevision,
          provenance: "synthetic direct semantic dependency",
        }],
      }],
      disposition_boundaries: [], case_dispositions: [],
    },
  });
  assert.equal(result.code, 0, result.stderr || JSON.stringify(result.json));
  return result;
}

async function finishSnapshot(state, ownerKinds = ["case", "frame"], limit = 1) {
  const begun = await call(state, "reconciliation_snapshot.begin", { owner_kinds: ownerKinds });
  assert.equal(begun.code, 0, begun.stderr || JSON.stringify(begun.json));
  const identities = [];
  let cursor = begun.json.result.first_cursor;
  let completionToken = null;
  do {
    const page = await call(state, "reconciliation_snapshot.page", {
      snapshot_token: begun.json.result.snapshot_token,
      cursor,
      limit,
    });
    assert.equal(page.code, 0, page.stderr || JSON.stringify(page.json));
    identities.push(...page.json.result.identities);
    cursor = page.json.result.next_cursor;
    completionToken = page.json.result.completion_token ?? null;
  } while (cursor != null);
  const finished = await call(state, "reconciliation_snapshot.finish", {
    snapshot_token: begun.json.result.snapshot_token,
    completion_token: completionToken,
  });
  assert.equal(finished.code, 0, finished.stderr || JSON.stringify(finished.json));
  return { begun, identities, finished };
}

function checkpointCas(state, operationId, expectedRevision, snapshot, pendingEventIds = []) {
  return call(state, "checkpoint.compare_and_set", {
    operation_id: operationId,
    consumer_id: ids.consumer,
    expected_checkpoint_revision: expectedRevision,
    next_checkpoint: {
      event_cursor: snapshot.event_cursor,
      snapshot_fence: snapshot.snapshot_fence,
      pending_event_ids: pendingEventIds,
    },
  });
}

async function reviseAndActivatePolicy(state, policyRevisionId, objectKinds, operationLabel) {
  const predecessor = state.context.view_policy_revision_id;
  const revised = await call(state, "view_policy.revise", {
    operation_id: `operation:l04-w05:policy:${operationLabel}:revise`,
    authority_claim: authorityClaim,
    predecessor_revision_id: predecessor,
    policy: {
      view_id: state.context.view_id,
      view_policy_revision_id: policyRevisionId,
      home_namespace_id: state.initialization.namespace.id,
      audience_ceiling: "private",
      namespace_ids: [state.initialization.namespace.id],
      object_kinds: objectKinds,
      limits: { max_results: 25, max_traversal_depth: 3 },
      store_operation_receipts_visible: true,
    },
  });
  assert.equal(revised.code, 0, revised.stderr || JSON.stringify(revised.json));
  const activated = await call(state, "view_policy.activate", {
    operation_id: `operation:l04-w05:policy:${operationLabel}:activate`,
    authority_claim: authorityClaim,
    view_id: state.context.view_id,
    view_policy_revision_id: policyRevisionId,
  });
  assert.equal(activated.code, 0, activated.stderr || JSON.stringify(activated.json));
  state.context = { ...state.context, view_policy_revision_id: policyRevisionId };
  return { predecessor, revised, activated };
}

async function assertGate(state) {
  const root = await createCase(state, ids.rootCase, "operation:l04-w05:root:create", "Steward observation root Case");
  await createFrame(state, { frameId: ids.activeFrame, discoveryId: ids.activeDiscovery, rootRevision: root.json.result.revision.id, historical: false });
  await createFrame(state, { frameId: ids.historicalFrame, discoveryId: ids.historicalDiscovery, rootRevision: root.json.result.revision.id, historical: true });

  const duplicateA = await call(state, "events.page", { limit: 10 });
  const duplicateB = await call(state, "events.page", { limit: 10 });
  assert.equal(duplicateA.code, 0, duplicateA.stderr || JSON.stringify(duplicateA.json));
  assert.deepEqual(duplicateB.json.result.events, duplicateA.json.result.events);
  assert.equal(new Set(duplicateA.json.result.events.map((event) => `${event.deduplication_key.store_id}\0${event.deduplication_key.event_id}`)).size, 3);

  const initialSnapshot = await finishSnapshot(state);
  assert.deepEqual(initialSnapshot.identities.map((item) => item.stable_id).sort(), [ids.rootCase, ids.activeFrame, ids.historicalFrame].sort());
  const initialCheckpoint = await checkpointCas(state, "operation:l04-w05:checkpoint:initial", 0, initialSnapshot.finished.json.result);
  assert.equal(initialCheckpoint.code, 0, initialCheckpoint.stderr || JSON.stringify(initialCheckpoint.json));
  assert.equal(initialCheckpoint.json.result.checkpoint.freshness, "complete");

  const discovery = await call(state, "identity.discover", {
    owner_kinds: ["case", "frame"],
    query: { text: "Steward observation" },
    limit: 10,
    max_depth: 0,
  });
  assert.equal(discovery.code, 0, discovery.stderr || JSON.stringify(discovery.json));
  assert.deepEqual(discovery.json.result.candidates.map((item) => item.stable_id).sort(), [ids.rootCase, ids.activeFrame].sort());
  assert.equal(discovery.json.result.candidates.some((item) => item.stable_id === ids.historicalFrame), false);

  const hydrate = (ownerKind, candidateIds) => call(state, `${ownerKind}.discovery.hydrate`, {
    handoff_token: discovery.json.result.handoff_token,
    query_digest: discovery.json.result.query_digest,
    candidate_ids: candidateIds,
  });
  const caseHydration = await hydrate("case", [ids.rootCase]);
  const frameHydration = await hydrate("frame", [ids.activeFrame]);
  assert.equal(caseHydration.code, 0, caseHydration.stderr || JSON.stringify(caseHydration.json));
  assert.equal(frameHydration.code, 0, frameHydration.stderr || JSON.stringify(frameHydration.json));
  const unavailableHydration = await hydrate("frame", [ids.historicalFrame]);
  assert.equal(unavailableHydration.code, 2);
  assert.equal(unavailableHydration.json.failure.code, "frame.not_found_or_not_visible");
  assert.deepEqual(unavailableHydration.json.failure.evidence, {});

  const revisions = await reviseRootCase(state, root);
  const eventPage = await call(state, "events.page", {
    after_cursor: initialCheckpoint.json.result.checkpoint.event_cursor,
    limit: 10,
  });
  const duplicatePage = await call(state, "events.page", {
    after_cursor: initialCheckpoint.json.result.checkpoint.event_cursor,
    limit: 10,
  });
  assert.equal(eventPage.code, 0, eventPage.stderr || JSON.stringify(eventPage.json));
  assert.deepEqual(duplicatePage.json.result.events, eventPage.json.result.events);
  assert.equal(eventPage.json.result.events.length, 1);
  const pendingEventId = eventPage.json.result.events[0].event_id;
  const eventProgress = {
    event_cursor: eventPage.json.result.next_cursor,
    snapshot_fence: initialCheckpoint.json.result.checkpoint.snapshot_fence,
  };
  const partial = await checkpointCas(state, "operation:l04-w05:checkpoint:partial", 1, eventProgress, [pendingEventId]);
  assert.equal(partial.code, 0, partial.stderr || JSON.stringify(partial.json));
  assert.equal(partial.json.result.checkpoint.freshness, "partial");
  assert.deepEqual(partial.json.result.checkpoint.pending_event_ids, [pendingEventId]);

  const overflow = await checkpointCas(state, "operation:l04-w05:checkpoint:overflow", 2, eventProgress, Array(33).fill(pendingEventId));
  assert.equal(overflow.code, 2);
  assert.equal(overflow.json.failure.code, "checkpoint.pending_overflow");
  assert.equal(overflow.json.failure.evidence.snapshot_reconciliation_required, true);
  const afterOverflow = await call(state, "checkpoint.read", { consumer_id: ids.consumer });
  assert.equal(afterOverflow.json.result.checkpoint.revision, 2);
  assert.equal(afterOverflow.json.result.freshness, "partial");

  const beforeImpact = await sqlite(state, `SELECT
    (SELECT count(*) FROM owner_revisions) AS owner_revisions,
    (SELECT count(*) FROM owner_events) AS owner_events,
    (SELECT operation_fence FROM store_fence WHERE singleton=1) AS operation_fence;`);
  const impact = await call(state, "impact.project", {
    root: { family_id: ids.rootCase, old_revision_id: revisions.oldRevision, new_revision_id: revisions.newRevision },
    limit: 10,
  });
  assert.equal(impact.code, 0, impact.stderr || JSON.stringify(impact.json));
  const active = impact.json.result.dependents.find((item) => item.owner.id === ids.activeFrame);
  const historical = impact.json.result.dependents.find((item) => item.owner.id === ids.historicalFrame);
  assert.equal(active.impact, "affected");
  assert.equal(active.reconciliation, "owner_action_required");
  assert.equal(active.lifecycle.leaves_reconciliation_frontier, false);
  assert.equal(historical.impact, "deferred");
  assert.equal(historical.reconciliation, "outside_live_frontier");
  assert.equal(historical.lifecycle.classification, "historical/published-immutable");
  assert.deepEqual(impact.json.result.counts, { examined: 2, affected: 1, unchanged: 0, deferred: 1, unknown: 0, overflow: 0 });
  assert.equal(impact.json.result.stop_reason, "direct_frontier_complete");
  assert.equal(impact.json.result.authority.semantic_owner_mutation, "not_granted");
  assert.equal(impact.json.result.authority.executive_assistant_effects, "not_granted");
  assert.equal(impact.json.result.mutation_performed, false);
  assert.deepEqual(await sqlite(state, `SELECT
    (SELECT count(*) FROM owner_revisions) AS owner_revisions,
    (SELECT count(*) FROM owner_events) AS owner_events,
    (SELECT operation_fence FROM store_fence WHERE singleton=1) AS operation_fence;`), beforeImpact);

  const complete = await checkpointCas(state, "operation:l04-w05:checkpoint:complete", 2, eventProgress);
  assert.equal(complete.code, 0, complete.stderr || JSON.stringify(complete.json));
  assert.equal(complete.json.result.checkpoint.freshness, "complete");

  await createCase(state, ids.auxiliaryCase, "operation:l04-w05:auxiliary:create", "Cursor expiry boundary Case");
  const latestSequence = (await sqlite(state, "SELECT max(commit_sequence) AS sequence FROM owner_events;"))[0].sequence;
  await sqlite(state, `UPDATE event_retention SET retained_after_sequence=${latestSequence} WHERE singleton=1;`);
  const expired = await call(state, "events.page", {
    after_cursor: complete.json.result.checkpoint.event_cursor,
    limit: 10,
  });
  assert.equal(expired.code, 2);
  assert.equal(expired.json.failure.code, "event.cursor_expired");
  assert.equal(expired.json.failure.evidence.snapshot_reconciliation_required, true);
  const expirySnapshot = await finishSnapshot(state, ["case", "frame"], 2);
  const recovered = await checkpointCas(state, "operation:l04-w05:checkpoint:expiry-recovery", 3, expirySnapshot.finished.json.result);
  assert.equal(recovered.code, 0, recovered.stderr || JSON.stringify(recovered.json));
  assert.equal(recovered.json.result.bootstrap, "snapshot_reconciliation");
  assert.equal(recovered.json.result.checkpoint.freshness, "complete");

  const narrowed = await reviseAndActivatePolicy(state, ids.narrowPolicy, ["case"], "narrow");
  const transitionRead = await call(state, "checkpoint.read", { consumer_id: ids.consumer });
  assert.equal(transitionRead.json.result.status, "policy_transition_required");
  assert.equal(transitionRead.json.result.freshness, "unknown");
  assert.equal(JSON.stringify(transitionRead.json.result).includes(ids.activeFrame), false);
  const narrowSnapshot = await finishSnapshot(state, ["case", "frame"], 10);
  assert.deepEqual(narrowSnapshot.identities.map((item) => item.owner_kind), ["case", "case"]);
  const narrowCheckpoint = await checkpointCas(state, "operation:l04-w05:checkpoint:narrow", 4, narrowSnapshot.finished.json.result);
  assert.equal(narrowCheckpoint.code, 0, narrowCheckpoint.stderr || JSON.stringify(narrowCheckpoint.json));
  assert.equal(narrowCheckpoint.json.result.bootstrap, "policy_transition_snapshot");
  assert.equal(narrowCheckpoint.json.result.checkpoint.predecessor_policy_revision_id, narrowed.predecessor);

  await reviseAndActivatePolicy(state, ids.broadPolicy, ["case", "frame"], "broaden");
  const broadSnapshot = await finishSnapshot(state, ["case", "frame"], 10);
  assert.deepEqual(broadSnapshot.identities.map((item) => item.stable_id).sort(), [ids.rootCase, ids.auxiliaryCase, ids.activeFrame, ids.historicalFrame].sort());
  const broadCheckpoint = await checkpointCas(state, "operation:l04-w05:checkpoint:broaden", 5, broadSnapshot.finished.json.result);
  assert.equal(broadCheckpoint.code, 0, broadCheckpoint.stderr || JSON.stringify(broadCheckpoint.json));
  assert.equal(broadCheckpoint.json.result.bootstrap, "policy_transition_snapshot");
  assert.equal(broadCheckpoint.json.result.checkpoint.freshness, "complete");

  const retired = await call(state, "view_policy.retire", {
    operation_id: "operation:l04-w05:policy:retire",
    authority_claim: authorityClaim,
    view_id: state.context.view_id,
    view_policy_revision_id: ids.broadPolicy,
  });
  assert.equal(retired.code, 0, retired.stderr || JSON.stringify(retired.json));
  const retiredFeed = await call(state, "events.page", { limit: 10 });
  assert.equal(retiredFeed.code, 2);
  assert.equal(retiredFeed.json.failure.code, "view_invalid");
}

test("final Steward gate reconciles mixed-owner observation without semantic mutation or EA authority", async () => {
  const state = await setup();
  try {
    await assertGate(state);
  } finally {
    await rm(state.root, { recursive: true, force: true });
    assert.equal(await stat(state.root).then(() => true).catch(() => false), false);
  }
});

test("generated Pi, Codex, and OpenCode copies pass the final Steward gate and clean up", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "casebook-l04-w05-generated-"));
  try {
    const generated = await generateAndValidateSandbox({ sandboxRoot: sandbox });
    for (const item of generated.results) {
      const state = await setup(path.join(item.package_root, "variants/sqlite/bin/casebook-persistence.mjs"), item.target);
      try {
        await assertGate(state);
      } finally {
        await rm(state.root, { recursive: true, force: true });
        assert.equal(await stat(state.root).then(() => true).catch(() => false), false);
      }
    }
  } finally {
    assert.equal(await cleanupSandbox(sandbox), true);
    assert.equal(await stat(sandbox).then(() => true).catch(() => false), false);
  }
});
