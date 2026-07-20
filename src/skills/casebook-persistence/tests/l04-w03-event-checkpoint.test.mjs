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
  case: "case:80453ec2-3f1e-4da9-b4a3-7f84d8f6257d",
  secondCase: "case:81453ec2-3f1e-4da9-b4a3-7f84d8f6257d",
  frame: "frame:820bd36b-7d2e-42a8-b423-d321867fb278",
  discovery: "discovery:825bd36b-7d2e-42a8-b423-d321867fb278",
  consumer: "consumer:83b82c54-3af4-4324-b13f-71c5833bd679",
  narrowedPolicy: "view-policy:84b82c54-3af4-4324-b13f-71c5833bd679",
});
const authorityClaim = Object.freeze({ human_authorized: true, acting_role: "architect", authority_basis: "disposable L04-W03 evidence" });

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
  const root = await mkdtemp(path.join(os.tmpdir(), `casebook-l04-w03-${label}-`));
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const store = path.join(root, "store.sqlite3");
  const configuration = { source: { kind: "synthetic-test", locator: `l04-w03:${label}` }, authority_mode: "sqlite", sqlite: { database_url: store, sqlite_bin: sqliteBinary } };
  const initialized = await invoke(entrypoint, root, { protocol, operation: "initialize_store", operation_id: `operation:l04-w03:${label}:init`, authority_claim: authorityClaim, configuration });
  assert.equal(initialized.code, 0, initialized.stderr || JSON.stringify(initialized.json));
  const initialization = initialized.json.result.initialization;
  return { root, store, sqliteBinary, entrypoint, configuration, initialization, context: { view_id: initialization.view.id, view_policy_revision_id: initialization.view.policy_revision_id, purpose: "bounded Steward reconciliation", requested_audience_ceiling: "private" } };
}

function common(state) { return { protocol, request_version: 1, store_id: state.initialization.store_id, context: state.context, configuration: state.configuration }; }

async function createCase(state, caseId = ids.case, operationId = `operation:l04-w03:${caseId}:create`) {
  const result = await invoke(state.entrypoint, state.root, {
    ...common(state), operation: "case.create", operation_id: operationId, expected_revision: 0,
    commit_basis: "synthetic event evidence", provenance: { acting_role: "case" },
    case: { id: caseId, home_namespace_id: state.initialization.namespace.id, state: "active", title: `Event ${caseId}`, summary: "Snapshot version one.", scope: "Disposable", aliases: [], facets: [], entries: [], sources: [], relationships: [], references: [] },
  });
  assert.equal(result.code, 0, result.stderr || JSON.stringify(result.json));
  return result;
}

async function reviseCase(state, created, summary = "Snapshot version two.") {
  const current = await invoke(state.entrypoint, state.root, { ...common(state), operation: "case.read", case_id: created.json.result.case.id });
  assert.equal(current.code, 0, current.stderr || JSON.stringify(current.json));
  const next = structuredClone(current.json.result.case);
  next.summary = summary;
  const result = await invoke(state.entrypoint, state.root, {
    ...common(state), operation: "case.commit_revision", operation_id: `operation:l04-w03:${created.json.result.case.id}:revise`, expected_revision: current.json.result.revision.number,
    commit_basis: "advance after snapshot fence", provenance: { acting_role: "case" }, case: next,
  });
  assert.equal(result.code, 0, result.stderr || JSON.stringify(result.json));
  return result;
}

async function createFrame(state) {
  const result = await invoke(state.entrypoint, state.root, {
    ...common(state), operation: "frame.create", operation_id: "operation:l04-w03:frame:create", expected_revision: 0,
    commit_basis: "synthetic event evidence", provenance: { acting_role: "frame", authority_basis: "disposable scope" },
    frame: { id: ids.frame, home_namespace_id: state.initialization.namespace.id, authority_scope_namespace_ids: [state.initialization.namespace.id], status: "active", title: "Event Frame", outcome: "Snapshot frame.", case_links: [], discovery: [{ id: ids.discovery, display_order: 0, lifecycle: "active", category: "frontier", title: "Event observation", body: "Disposable.", human_authority: "not_required", dependencies: [] }], disposition_boundaries: [], case_dispositions: [] },
  });
  assert.equal(result.code, 0, result.stderr || JSON.stringify(result.json));
  return result;
}

function observe(state, operation, fields = {}) {
  return invoke(state.entrypoint, state.root, { ...common(state), operation, ...fields });
}

async function finishSnapshot(state, ownerKinds = ["case", "frame"], limit = 1) {
  const begun = await observe(state, "reconciliation_snapshot.begin", { owner_kinds: ownerKinds });
  assert.equal(begun.code, 0, begun.stderr || JSON.stringify(begun.json));
  const identities = [];
  let cursor = begun.json.result.first_cursor;
  let completionToken = null;
  do {
    const page = await observe(state, "reconciliation_snapshot.page", { snapshot_token: begun.json.result.snapshot_token, cursor, limit });
    assert.equal(page.code, 0, page.stderr || JSON.stringify(page.json));
    identities.push(...page.json.result.identities);
    cursor = page.json.result.next_cursor;
    completionToken = page.json.result.completion_token ?? null;
  } while (cursor != null);
  const finished = await observe(state, "reconciliation_snapshot.finish", { snapshot_token: begun.json.result.snapshot_token, completion_token: completionToken });
  assert.equal(finished.code, 0, finished.stderr || JSON.stringify(finished.json));
  return { begun, identities, finished };
}

function checkpointCas(state, operationId, expected, eventCursor, snapshotFence, pendingEventIds = []) {
  return observe(state, "checkpoint.compare_and_set", {
    operation_id: operationId,
    consumer_id: ids.consumer,
    expected_checkpoint_revision: expected,
    next_checkpoint: { event_cursor: eventCursor, snapshot_fence: snapshotFence, pending_event_ids: pendingEventIds },
  });
}

test("event pages are bounded, replayable at least once, and expose stable duplicate-safe identity", async () => {
  const state = await setup();
  try {
    await createCase(state);
    await createFrame(state);
    const first = await observe(state, "events.page", { limit: 1 });
    const duplicate = await observe(state, "events.page", { limit: 1 });
    assert.equal(first.code, 0, first.stderr || JSON.stringify(first.json));
    assert.deepEqual(duplicate.json.result.events, first.json.result.events);
    assert.equal(first.json.result.events.length, 1);
    assert.deepEqual(first.json.result.events[0].deduplication_key, { store_id: state.initialization.store_id, event_id: first.json.result.events[0].event_id });
    assert.match(first.json.result.events[0].payload_digest, /^[0-9a-f]{64}$/);
    assert.equal(first.json.result.result_completeness, "truncated");
    const second = await observe(state, "events.page", { after_cursor: first.json.result.next_cursor, limit: 1 });
    assert.equal(second.code, 0, second.stderr || JSON.stringify(second.json));
    assert.notEqual(second.json.result.events[0].event_id, first.json.result.events[0].event_id);
    assert.equal(second.json.result.result_completeness, "complete");
    assert.equal(second.json.result.delivery_semantics, "at_least_once");
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("checkpoint compare-and-set is idempotent, bounds pending events, and reports truthful freshness", async () => {
  const state = await setup();
  try {
    await createCase(state);
    const absent = await observe(state, "checkpoint.read", { consumer_id: ids.consumer });
    assert.equal(absent.code, 0, absent.stderr || JSON.stringify(absent.json));
    assert.equal(absent.json.result.status, "absent");
    assert.equal(absent.json.result.freshness, "unknown");
    assert.equal(absent.json.result.snapshot_bootstrap_required, true);

    const snapshot = await finishSnapshot(state);
    const initialRequest = {
      operation_id: "operation:l04-w03:checkpoint:initial",
      consumer_id: ids.consumer,
      expected_checkpoint_revision: 0,
      next_checkpoint: { event_cursor: snapshot.finished.json.result.event_cursor, snapshot_fence: snapshot.finished.json.result.snapshot_fence, pending_event_ids: [] },
    };
    const initial = await observe(state, "checkpoint.compare_and_set", initialRequest);
    const replay = await observe(state, "checkpoint.compare_and_set", initialRequest);
    assert.equal(initial.code, 0, initial.stderr || JSON.stringify(initial.json));
    assert.equal(replay.code, 0, replay.stderr || JSON.stringify(replay.json));
    assert.equal(replay.json.result.idempotent_replay, true);
    assert.equal(initial.json.result.checkpoint.freshness, "complete");
    assert.equal(initial.json.result.bootstrap, "initial_snapshot");

    await createCase(state, ids.secondCase);
    const page = await observe(state, "events.page", { after_cursor: initial.json.result.checkpoint.event_cursor, limit: 10 });
    assert.equal(page.code, 0, page.stderr || JSON.stringify(page.json));
    const eventId = page.json.result.events[0].event_id;
    const partial = await checkpointCas(state, "operation:l04-w03:checkpoint:partial", 1, page.json.result.next_cursor, snapshot.finished.json.result.snapshot_fence, [eventId]);
    assert.equal(partial.code, 0, partial.stderr || JSON.stringify(partial.json));
    assert.equal(partial.json.result.checkpoint.freshness, "partial");
    assert.deepEqual(partial.json.result.checkpoint.pending_event_ids, [eventId]);
    const readPartial = await observe(state, "checkpoint.read", { consumer_id: ids.consumer });
    assert.equal(readPartial.json.result.checkpoint.freshness, "partial");

    const overflow = await checkpointCas(state, "operation:l04-w03:checkpoint:overflow", 2, page.json.result.next_cursor, snapshot.finished.json.result.snapshot_fence, Array(33).fill(eventId));
    assert.equal(overflow.code, 2);
    assert.equal(overflow.json.failure.code, "checkpoint.pending_overflow");
    assert.equal(overflow.json.failure.evidence.snapshot_reconciliation_required, true);
    assert.equal((await observe(state, "checkpoint.read", { consumer_id: ids.consumer })).json.result.checkpoint.revision, 2);

    const complete = await checkpointCas(state, "operation:l04-w03:checkpoint:complete", 2, page.json.result.next_cursor, snapshot.finished.json.result.snapshot_fence, []);
    assert.equal(complete.code, 0, complete.stderr || JSON.stringify(complete.json));
    assert.equal(complete.json.result.checkpoint.freshness, "complete");
    const stale = await checkpointCas(state, "operation:l04-w03:checkpoint:stale", 2, page.json.result.next_cursor, snapshot.finished.json.result.snapshot_fence, []);
    assert.equal(stale.code, 2);
    assert.equal(stale.json.failure.code, "checkpoint.revision_conflict");

    const mismatch = structuredClone(initialRequest);
    mismatch.next_checkpoint.pending_event_ids = [eventId];
    const mismatched = await observe(state, "checkpoint.compare_and_set", mismatch);
    assert.equal(mismatched.code, 2);
    assert.equal(mismatched.json.failure.code, "checkpoint.idempotency_mismatch");
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("expired cursors require one-fence owner snapshot reconciliation without admitting later revisions", async () => {
  const state = await setup();
  try {
    const created = await createCase(state);
    await createFrame(state);
    const oldPage = await observe(state, "events.page", { limit: 1 });
    assert.equal(oldPage.code, 0, oldPage.stderr || JSON.stringify(oldPage.json));
    const oldSequence = oldPage.json.result.events[0].commit_sequence;
    await sqlite(state, `UPDATE event_retention SET retained_after_sequence=${oldSequence + 1} WHERE singleton=1;`);
    const expired = await observe(state, "events.page", { after_cursor: oldPage.json.result.next_cursor, limit: 10 });
    assert.equal(expired.code, 2);
    assert.equal(expired.json.failure.code, "event.cursor_expired");
    assert.equal(expired.json.failure.evidence.snapshot_reconciliation_required, true);

    const begun = await observe(state, "reconciliation_snapshot.begin", { owner_kinds: ["case"] });
    assert.equal(begun.code, 0, begun.stderr || JSON.stringify(begun.json));
    await reviseCase(state, created);
    await createCase(state, ids.secondCase);
    const page = await observe(state, "reconciliation_snapshot.page", { snapshot_token: begun.json.result.snapshot_token, cursor: begun.json.result.first_cursor, limit: 10 });
    assert.equal(page.code, 0, page.stderr || JSON.stringify(page.json));
    assert.deepEqual(page.json.result.identities.map((item) => item.stable_id), [ids.case]);
    assert.equal(page.json.result.identities[0].owner_revision_at_fence.number, 1);
    assert.equal(page.json.result.snapshot_fence, begun.json.result.snapshot_fence);
    const historical = await invoke(state.entrypoint, state.root, {
      ...common(state), operation: "case.read", case_id: ids.case,
      revision_id: page.json.result.identities[0].owner_revision_at_fence.id,
    });
    assert.equal(historical.code, 0, historical.stderr || JSON.stringify(historical.json));
    assert.equal(historical.json.result.case.summary, "Snapshot version one.");
    const finished = await observe(state, "reconciliation_snapshot.finish", { snapshot_token: begun.json.result.snapshot_token, completion_token: page.json.result.completion_token });
    assert.equal(finished.code, 0, finished.stderr || JSON.stringify(finished.json));
    assert.equal(finished.json.result.snapshot_fence, begun.json.result.snapshot_fence);
    assert.equal(finished.json.result.event_cursor_sequence_at_fence, begun.json.result.event_sequence_at_fence);
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("material policy transitions require an exact new snapshot bootstrap and preserve non-disclosing lineage", async () => {
  const state = await setup();
  try {
    await createCase(state);
    await createFrame(state);
    const initialSnapshot = await finishSnapshot(state);
    const initial = await checkpointCas(state, "operation:l04-w03:policy:initial", 0, initialSnapshot.finished.json.result.event_cursor, initialSnapshot.finished.json.result.snapshot_fence);
    assert.equal(initial.code, 0, initial.stderr || JSON.stringify(initial.json));

    const revised = await invoke(state.entrypoint, state.root, {
      ...common(state), operation: "view_policy.revise", operation_id: "operation:l04-w03:policy:revise", authority_claim: authorityClaim,
      predecessor_revision_id: state.context.view_policy_revision_id,
      policy: {
        view_id: state.context.view_id, view_policy_revision_id: ids.narrowedPolicy,
        home_namespace_id: state.initialization.namespace.id, audience_ceiling: "private",
        namespace_ids: [state.initialization.namespace.id], object_kinds: ["case"],
        limits: { max_results: 25, max_traversal_depth: 3 }, store_operation_receipts_visible: true,
      },
    });
    assert.equal(revised.code, 0, revised.stderr || JSON.stringify(revised.json));
    const activated = await invoke(state.entrypoint, state.root, {
      ...common(state), operation: "view_policy.activate", operation_id: "operation:l04-w03:policy:activate", authority_claim: authorityClaim,
      view_id: state.context.view_id, view_policy_revision_id: ids.narrowedPolicy,
    });
    assert.equal(activated.code, 0, activated.stderr || JSON.stringify(activated.json));
    const narrowed = { ...state, context: { ...state.context, view_policy_revision_id: ids.narrowedPolicy } };

    const oldCursor = await observe(narrowed, "events.page", { after_cursor: initial.json.result.checkpoint.event_cursor, limit: 10 });
    assert.equal(oldCursor.code, 2);
    assert.equal(oldCursor.json.failure.code, "event.policy_transition_required");
    const transitionRead = await observe(narrowed, "checkpoint.read", { consumer_id: ids.consumer });
    assert.equal(transitionRead.code, 0, transitionRead.stderr || JSON.stringify(transitionRead.json));
    assert.equal(transitionRead.json.result.status, "policy_transition_required");
    assert.equal(transitionRead.json.result.freshness, "unknown");
    assert.equal(JSON.stringify(transitionRead.json.result).includes(ids.frame), false);

    const ordinary = await observe(narrowed, "events.page", { limit: 10 });
    assert.equal(ordinary.code, 0, ordinary.stderr || JSON.stringify(ordinary.json));
    const rejected = await checkpointCas(narrowed, "operation:l04-w03:policy:no-bootstrap", 1, ordinary.json.result.next_cursor, initialSnapshot.finished.json.result.snapshot_fence);
    assert.equal(rejected.code, 2);
    assert.equal(rejected.json.failure.code, "checkpoint.snapshot_bootstrap_required");

    const bootstrap = await finishSnapshot(narrowed, ["case", "frame"], 10);
    assert.deepEqual(bootstrap.identities.map((item) => item.owner_kind), ["case"]);
    const transitioned = await checkpointCas(narrowed, "operation:l04-w03:policy:bootstrap", 1, bootstrap.finished.json.result.event_cursor, bootstrap.finished.json.result.snapshot_fence);
    assert.equal(transitioned.code, 0, transitioned.stderr || JSON.stringify(transitioned.json));
    assert.equal(transitioned.json.result.bootstrap, "policy_transition_snapshot");
    assert.equal(transitioned.json.result.checkpoint.predecessor_policy_revision_id, state.context.view_policy_revision_id);
    assert.equal(transitioned.json.result.checkpoint.view_policy_revision_id, ids.narrowedPolicy);
    assert.equal(transitioned.json.result.checkpoint.freshness, "complete");

    const retiredFeed = await observe(state, "events.page", { limit: 10 });
    assert.equal(retiredFeed.code, 2);
    assert.equal(retiredFeed.json.failure.code, "view_invalid");
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("generated Pi, Codex, and OpenCode copies preserve event/snapshot/checkpoint behavior and clean up", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "casebook-l04-w03-generated-"));
  try {
    const generated = await generateAndValidateSandbox({ sandboxRoot: sandbox });
    for (const item of generated.results) {
      const state = await setup(path.join(item.package_root, "variants/sqlite/bin/casebook-persistence.mjs"), item.target);
      try {
        await createCase(state);
        const page = await observe(state, "events.page", { limit: 10 });
        assert.equal(page.code, 0, page.stderr || JSON.stringify(page.json));
        assert.equal(page.json.result.events.length, 1);
        const snapshot = await finishSnapshot(state, ["case"], 10);
        assert.deepEqual(snapshot.identities.map((item) => item.stable_id), [ids.case]);
        const checkpoint = await checkpointCas(state, `operation:l04-w03:${item.target}:checkpoint`, 0, snapshot.finished.json.result.event_cursor, snapshot.finished.json.result.snapshot_fence);
        assert.equal(checkpoint.code, 0, checkpoint.stderr || JSON.stringify(checkpoint.json));
        assert.equal(checkpoint.json.result.checkpoint.freshness, "complete");
      } finally {
        await rm(state.root, { recursive: true, force: true });
      }
    }
  } finally {
    assert.equal(await cleanupSandbox(sandbox), true);
    assert.equal(await stat(sandbox).then(() => true).catch(() => false), false);
  }
});
