import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { generateAndValidateSandbox, selectCompatibleSqliteBinary } from "./sandbox-harness.mjs";

const entrypoint = new URL("../variants/sqlite/bin/casebook-persistence.mjs", import.meta.url).pathname;
const protocol = { id: "casebook-persistence-json", version: 1 };
const CASE = "case:11000000-0000-4000-8000-000000000001";
const INBOUND = "case:11000000-0000-4000-8000-000000000002";
const SOURCE = "source:11000000-0000-4000-8000-000000000003";
const EVIDENCE = "evidence:11000000-0000-4000-8000-000000000004";
const PAYLOAD_CLASSES = [
  "case_current_projection",
  "case_family_versions",
  "case_profile_versions",
  "case_revision_selections",
  "disposable_case_projections",
];
const EXCLUSIONS = ["independent_files", "independent_resources", "remote_publications", "retained_snapshots"];
const RETAINED_AUDIT = [
  "authorization_claim_digest",
  "canonical_state_effect",
  "payload_scope_digest",
  "precondition_fence",
  "purge_operation_receipt",
  "purged_revision_ids",
  "purged_stable_identity_ids",
  "purged_version_ids",
  "retained_copy_disclosure",
  "target_case_id",
  "terminal_outcome",
];

function invoke(cwd, request, binary = entrypoint, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [binary], {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? "", HOME: cwd, ...extraEnv },
    }, (error, stdout, stderr) => resolve({
      exitCode: error ? 2 : 0,
      stderr,
      json: JSON.parse(stdout || "{}"),
    }));
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

function caseRecord(namespaceId, state = "active") {
  return {
    id: CASE,
    home_namespace_id: namespaceId,
    state,
    title: "Synthetic sensitive Case",
    summary: "Disposable purge-plan payload",
    scope: "synthetic L10-W03 only",
    aliases: [], facets: [], entries: [],
    sources: [{
      id: SOURCE,
      state: "active",
      display_label: "S1",
      version: {
        title: "Synthetic external source",
        accessed_at: "2026-07-20T00:00:00Z",
        examined_for: "purge disclosure",
        locators: [{ kind: "origin", uri: "https://example.test/synthetic-sensitive-copy", audience: "private" }],
      },
      fragments: [{
        id: EVIDENCE,
        state: "active",
        version: { excerpt: "synthetic sensitive bytes", purpose: "purge plan", captured_at: "2026-07-20T00:00:00Z" },
      }],
    }],
    relationships: [], references: [],
  };
}

async function fixture(root, sqliteBinary, runtime = entrypoint) {
  const call = (request) => invoke(root, request, runtime);
  const storePath = path.join(root, "synthetic-disposable.sqlite3");
  const configuration = {
    source: { kind: "synthetic-test", locator: "l10-w03-disposable" },
    authority_mode: "sqlite",
    sqlite: { database_url: storePath, sqlite_bin: sqliteBinary },
  };
  const initialized = await call({
    protocol,
    operation: "initialize_store",
    operation_id: "operation:l10-w03:initialize",
    authority_claim: { human_authorized: true, acting_role: "test-architect", authority_basis: "synthetic disposable fixture" },
    configuration,
  });
  assert.equal(initialized.exitCode, 0, initialized.stderr);
  const initialization = initialized.json.result.initialization;
  const context = {
    view_id: initialization.view.id,
    view_policy_revision_id: initialization.view.policy_revision_id,
    purpose: "plan synthetic Case payload purge without deletion",
    requested_audience_ceiling: "private",
  };
  const common = { protocol, request_version: 1, store_id: initialization.store_id, context, configuration };
  const created = await call({
    ...common,
    operation: "case.create",
    operation_id: "operation:l10-w03:create-target",
    expected_revision: 0,
    commit_basis: "create synthetic sensitive target",
    provenance: { acting_role: "case-reconcile", authority_basis: "synthetic fixture" },
    case: caseRecord(initialization.namespace.id),
  });
  assert.equal(created.exitCode, 0, JSON.stringify(created.json));
  const inboundRecord = {
    id: INBOUND,
    home_namespace_id: initialization.namespace.id,
    state: "active",
    title: "Synthetic inbound owner",
    summary: "Retained dependency",
    scope: "synthetic L10-W03 only",
    aliases: [], facets: [], entries: [], sources: [], relationships: [],
    references: [{
      target_kind: "case",
      target_id: CASE,
      observed_revision_id: created.json.result.revision.id,
      predicate: "depends_on",
      visibility: "private",
    }],
  };
  const inbound = await call({
    ...common,
    operation: "case.create",
    operation_id: "operation:l10-w03:create-inbound",
    expected_revision: 0,
    commit_basis: "create visible inbound dependency",
    provenance: { acting_role: "case-reconcile", authority_basis: "synthetic fixture" },
    case: inboundRecord,
  });
  assert.equal(inbound.exitCode, 0, JSON.stringify(inbound.json));
  const tombstone = await call({
    ...common,
    operation: "case.tombstone.commit",
    operation_id: "operation:l10-w03:tombstone",
    expected_revision: 1,
    commit_basis: "semantic owner disposition before purge planning",
    provenance: { acting_role: "case-reconcile", authority_basis: "synthetic semantic-owner decision" },
    case: caseRecord(initialization.namespace.id, "tombstoned"),
  });
  assert.equal(tombstone.exitCode, 0, JSON.stringify(tombstone.json));
  const snapshotPath = path.join(root, "pre-purge.snapshot.sqlite3");
  const snapshot = await call({
    protocol,
    operation: "snapshot_store",
    request_version: 1,
    operation_id: "operation:l10-w03:snapshot",
    operation_kind: "snapshot",
    purpose: "retain exact pre-purge synthetic copy",
    store_id: initialization.store_id,
    authority_claim: {
      human_authorized: true,
      acting_role: "snapshot-operator",
      authority_basis: "L10-W03 retained-copy disclosure",
      human_confirmation_reference: "human-confirmation:l10-w03:snapshot",
    },
    safety: { store_class: "disposable", authorization_reference: "disposable:l10-w03" },
    expected: {
      store_id: initialization.store_id,
      schema: { id: "casebook-persistence-sqlite", version: 1 },
      protocol,
      operation_fence: 4,
    },
    snapshot: { path: snapshotPath, owner: "test-owner:l10-w03", retention: "retain_until_explicit_deletion" },
    canonical_state_effect: "none",
    requested_postcondition_evidence: ["store_identity", "schema_identity", "operation_fence", "digest", "size", "consistency", "integrity"],
    configuration,
  });
  assert.equal(snapshot.exitCode, 0, snapshot.stderr || JSON.stringify(snapshot.json));
  assert.equal(snapshot.json.result.terminal.outcome, "snapshotted", JSON.stringify(snapshot.json));
  const projection = await call({
    ...common,
    operation: "projection.rebuild",
    operation_id: "operation:l10-w03:projection-rebuild",
    authority_claim: { human_authorized: true, acting_role: "test-operator", authority_basis: "synthetic purge projection scope", human_confirmation_reference: "human-confirmation:l10-w03:projection" },
    safety: { store_class: "disposable", authorization_reference: "disposable:l10-w03:projection" },
    projection_kinds: ["lexical", "reverse_reference", "staleness", "attention"],
    canonical_fence: snapshot.json.result.receipt.operation_fence,
    canonical_state_effect: "none",
    requested_postcondition_evidence: ["source_fence", "projection_digest", "verification", "atomic_selection", "canonical_state_unchanged"],
  });
  assert.equal(projection.exitCode, 0, projection.stderr || JSON.stringify(projection.json));
  assert.equal(projection.json.result.terminal.outcome, "rebuilt");
  const impact = await call({
    ...common,
    operation: "case.purge.inspect",
    case_id: CASE,
    expected_revision: 2,
    rationale: "inspect exact synthetic impact after retained snapshot",
  });
  assert.equal(impact.exitCode, 0, JSON.stringify(impact.json));
  return { root, storePath, common, initialization, tombstone, inbound, snapshot, projection, impact };
}

function planRequest(f) {
  const current = f.tombstone.json.result.revision;
  const impact = f.impact.json.result;
  const snapshot = f.snapshot.json.result.snapshot;
  return {
    ...f.common,
    operation: "case.purge.plan",
    operation_id: "operation:l10-w03:purge-plan",
    purpose: "plan only the exact synthetic Case payload purge",
    case_id: CASE,
    expected: {
      store_id: f.initialization.store_id,
      schema: { id: "casebook-persistence-sqlite", version: 1 },
      case_revision: { id: current.id, number: current.number },
      operation_fence: Number(impact.corpus_fence.slice("sqlite:".length)),
    },
    safety: {
      store_class: "disposable",
      synthetic_case: true,
      authorization_reference: "disposable:l10-w03:purge-plan",
    },
    authority_claim: {
      human_authorized: true,
      acting_role: "purge-operator",
      authority_basis: "explicit L10-W03 synthetic planning authority only",
      human_confirmation_reference: "human-confirmation:l10-w03:purge-plan",
    },
    payload_scope: {
      owner: { kind: "case", id: CASE },
      revision_scope: "all_revisions_through_expected",
      payload_classes: PAYLOAD_CLASSES,
      canonical_state_effect: "payload-erasure",
    },
    semantic_owner_disposition: {
      owner_kind: "case",
      owner_id: CASE,
      owner_revision_id: current.id,
      disposition: "purge_warranted",
      basis: "Case semantic owner explicitly tombstoned this synthetic payload",
    },
    impact_inspection: {
      corpus_fence: impact.corpus_fence,
      inbound_owner_revision_ids: impact.retained_dependencies.inbound_owner_revisions.map((item) => item.revision_id),
      evidence_ids: impact.retained_dependencies.evidence.map((item) => item.evidence_id),
      dependencies_acknowledged: true,
    },
    snapshot_disclosure: {
      declaration_complete: true,
      copies: [{
        operation_id: f.snapshot.json.result.receipt.operation_id,
        path: snapshot.path,
        sha256: snapshot.sha256,
        size_bytes: snapshot.size_bytes,
        source_operation_fence: snapshot.source.operation_fence,
        retention: snapshot.custody.retention,
        contains_payload: true,
      }],
    },
    external_copy_disclosure: {
      declaration_complete: true,
      copies: [{
        kind: "source_locator",
        locator: "https://example.test/synthetic-sensitive-copy",
        authority: "independent",
        copy_state: "known_or_possible",
        disposition: "out_of_scope",
      }],
    },
    exclusions: EXCLUSIONS,
    retained_audit_evidence: RETAINED_AUDIT,
  };
}

async function exists(candidate) {
  return stat(candidate).then(() => true).catch(() => false);
}

function sqliteRows(binary, storePath, sql) {
  return new Promise((resolve, reject) => {
    const child = execFile(binary, ["-batch", "-bail", "-json", storePath], { encoding: "utf8" }, (error, stdout, stderr) => {
      if (error) reject(Object.assign(error, { stderr }));
      else resolve(JSON.parse(stdout || "[]"));
    });
    child.stdin.end(sql);
  });
}

function executeRequest(f, plan, suffix = "execute") {
  return {
    ...f.common,
    operation: "case.purge.execute",
    operation_id: `operation:l10-w03:${suffix}`,
    purpose: "execute only the exact authorized synthetic Case payload purge plan",
    case_id: CASE,
    plan,
    safety: {
      store_class: "disposable",
      synthetic_case: true,
      store_name: path.basename(f.storePath),
      authorization_reference: "disposable:l10-w03:purge-execute",
    },
    authority_claim: {
      human_authorized: true,
      acting_role: "purge-operator",
      authority_basis: "explicit L10-W03 execution authority for this exact plan",
      human_confirmation_reference: "human-confirmation:l10-w03:purge-execute",
    },
    canonical_state_effect: "payload-erasure",
    requested_postcondition_evidence: [
      "canonical_payload_absent",
      "non_payload_identity_retained",
      "revision_history_retained",
      "audit_receipt_durable",
      "snapshots_untouched",
      "external_authorities_untouched",
    ],
  };
}

async function createPlan(root, f, runtime = entrypoint) {
  const planned = await invoke(root, planRequest(f), runtime);
  assert.equal(planned.exitCode, 0, planned.stderr || JSON.stringify(planned.json));
  return planned.json.result;
}

function receiptRequest(f, operationId) {
  return {
    protocol,
    operation: "get_store_operation_receipt",
    operation_id: operationId,
    store_id: f.initialization.store_id,
    authority_claim: {
      human_authorized: true,
      acting_role: "purge-recovery-operator",
      authority_basis: "receipt-first L10-W03 recovery",
    },
    context: { ...f.common.context, purpose: "inspect the durable purge receipt before recovery or replay" },
    configuration: f.common.configuration,
  };
}

async function sha256File(candidate) {
  return createHash("sha256").update(await readFile(candidate)).digest("hex");
}

async function tableRows(binary, storePath, table, where, orderBy) {
  return sqliteRows(binary, storePath, `SELECT * FROM ${table} WHERE ${where} ORDER BY ${orderBy};`);
}

async function protectedScope(binary, storePath) {
  const targetRevisions = `(SELECT revision_id FROM owner_revisions WHERE owner_id='${CASE}')`;
  const inboundRevisions = `(SELECT revision_id FROM owner_revisions WHERE owner_id='${INBOUND}')`;
  return {
    targetRetained: {
      owners: await tableRows(binary, storePath, "owners", `owner_id='${CASE}'`, "owner_id"),
      identities: await tableRows(binary, storePath, "owner_family_bindings", `owner_id='${CASE}'`, "family_id"),
      revisions: await tableRows(binary, storePath, "owner_revisions", `owner_id='${CASE}'`, "revision_number"),
      events: await tableRows(binary, storePath, "owner_events", `owner_id='${CASE}'`, "commit_sequence,event_id"),
    },
    targetPayload: {
      versions: await tableRows(binary, storePath, "owner_versions", `owner_id='${CASE}'`, "version_id"),
      selections: await tableRows(binary, storePath, "owner_revision_selections", `revision_id IN ${targetRevisions}`, "revision_id,family_id"),
      current: await tableRows(binary, storePath, "owner_current", `owner_id='${CASE}'`, "owner_id"),
      outbox: await tableRows(binary, storePath, "owner_outbox", `owner_id='${CASE}'`, "outbox_id"),
    },
    nonTarget: {
      owners: await tableRows(binary, storePath, "owners", `owner_id='${INBOUND}'`, "owner_id"),
      identities: await tableRows(binary, storePath, "owner_family_bindings", `owner_id='${INBOUND}'`, "family_id"),
      versions: await tableRows(binary, storePath, "owner_versions", `owner_id='${INBOUND}'`, "version_id"),
      revisions: await tableRows(binary, storePath, "owner_revisions", `owner_id='${INBOUND}'`, "revision_number"),
      selections: await tableRows(binary, storePath, "owner_revision_selections", `revision_id IN ${inboundRevisions}`, "revision_id,family_id"),
      current: await tableRows(binary, storePath, "owner_current", `owner_id='${INBOUND}'`, "owner_id"),
      events: await tableRows(binary, storePath, "owner_events", `owner_id='${INBOUND}'`, "commit_sequence,event_id"),
      outbox: await tableRows(binary, storePath, "owner_outbox", `owner_id='${INBOUND}'`, "outbox_id"),
    },
    projections: {
      target: await sqliteRows(binary, storePath, `SELECT * FROM disposable_projection_entries WHERE json_extract(payload_json,'$.owner.id')='${CASE}' OR json_extract(payload_json,'$.source_owner.id')='${CASE}' ORDER BY generation_id,projection_kind,entry_key;`),
      nonTarget: await sqliteRows(binary, storePath, `SELECT * FROM disposable_projection_entries WHERE NOT (json_extract(payload_json,'$.owner.id')='${CASE}' OR json_extract(payload_json,'$.source_owner.id')='${CASE}') ORDER BY generation_id,projection_kind,entry_key;`),
      generations: await sqliteRows(binary, storePath, "SELECT generation_id FROM disposable_projection_generations ORDER BY generation_id;"),
    },
    receipts: await sqliteRows(binary, storePath, "SELECT * FROM store_operation_receipts ORDER BY operation_id;"),
  };
}

function assertExactPlan(plan, f) {
  assert.equal(plan.plan_schema, "case-purge-plan@1");
  assert.equal(plan.status, "staged-only");
  assert.equal(plan.case_id, CASE);
  assert.equal(plan.expected.store_id, f.initialization.store_id);
  assert.equal(plan.execution_authorized, false);
  assert.equal(plan.canonical_payload_deleted, false);
  assert.equal(plan.full_erasure_claimed, false);
  assert.equal(plan.mutation_performed, false);
  assert.equal(plan.authorization.human_authorized, true);
  assert.equal(plan.authorization.human_confirmation_reference, "human-confirmation:l10-w03:purge-plan");
  assert.deepEqual(plan.payload_scope.payload_classes, PAYLOAD_CLASSES);
  assert.deepEqual(plan.exclusions, EXCLUSIONS);
  assert.deepEqual(plan.retained_non_payload_audit_evidence, RETAINED_AUDIT);
  assert.equal(plan.snapshot_disclosure.declaration_complete, true);
  assert.equal(plan.snapshot_disclosure.copies.length, 1);
  assert.equal(plan.snapshot_disclosure.copies[0].contains_payload, true);
  assert.equal(plan.external_copy_disclosure.declaration_complete, true);
  assert.deepEqual(plan.external_copy_disclosure.copies, [{
    kind: "source_locator",
    locator: "https://example.test/synthetic-sensitive-copy",
    authority: "independent",
    copy_state: "known_or_possible",
    disposition: "out_of_scope",
  }]);
}

function assertNotDeleted(result) {
  assert.equal(result.exitCode, 2, result.stderr || JSON.stringify(result.json));
  assert.equal(result.json.failure.evidence.terminal_outcome, "not_deleted");
  assert.equal(result.json.failure.evidence.canonical_payload_deleted, false);
  assert.equal(result.json.failure.evidence.full_erasure_claimed, false);
  assert.equal(result.json.failure.evidence.mutation_performed, false);
}

async function assertSettledTruth(sqliteBinary, f, plan, request, before, result, snapshotDigest) {
  const value = result.json.result;
  assert.equal(value.terminal.outcome, "deleted");
  assert.equal(value.canonical_payload_deleted, true);
  assert.equal(value.full_erasure_claimed, false);
  assert.deepEqual(value.retained_copy_disclosure, {
    known_copies_remain: true,
    retained_snapshots: plan.snapshot_disclosure.copies,
    declared_external_copies: plan.external_copy_disclosure.copies,
  });
  assert.deepEqual(value.deleted_scope.payload_classes, PAYLOAD_CLASSES);
  assert.deepEqual(value.deleted_scope.revision_ids, plan.payload_scope.revision_ids);
  assert.deepEqual(value.deleted_scope.stable_identity_ids, plan.payload_scope.stable_identity_ids);
  assert.deepEqual(value.deleted_scope.version_ids, plan.payload_scope.version_ids);
  assert.deepEqual(value.retained_non_payload_evidence.revision_ids, plan.payload_scope.revision_ids);
  assert.deepEqual(value.retained_non_payload_evidence.stable_identity_ids, plan.payload_scope.stable_identity_ids);
  assert.equal(value.postconditions.canonical_payload_absent, true);
  assert.equal(value.postconditions.non_payload_identity_retained, true);
  assert.equal(value.postconditions.revision_history_retained, true);
  assert.equal(value.postconditions.audit_receipt_durable, true);
  assert.equal(value.postconditions.snapshots_untouched, true);
  assert.equal(value.postconditions.external_authorities_untouched, true);
  assert.equal(await sha256File(f.snapshot.json.result.snapshot.path), snapshotDigest);

  const after = await protectedScope(sqliteBinary, f.storePath);
  assert.ok(before.targetPayload.versions.length > 0);
  assert.ok(before.targetPayload.selections.length > 0);
  assert.equal(before.targetPayload.current.length, 1);
  assert.ok(before.projections.target.length > 0);
  assert.deepEqual(after.targetRetained, before.targetRetained, "target identity, revision history, and audit events are retained byte-for-byte");
  assert.deepEqual(after.targetPayload, { versions: [], selections: [], current: [], outbox: [] }, "only declared target payload classes are absent");
  assert.deepEqual(after.nonTarget, before.nonTarget, "non-target canonical state is unchanged");
  assert.deepEqual(after.projections.target, [], "only target-derived disposable projection rows are absent");
  assert.deepEqual(after.projections.nonTarget, before.projections.nonTarget, "non-target projections are unchanged");
  assert.deepEqual(after.projections.generations, before.projections.generations, "projection generations are retained");
  const priorById = new Map(after.receipts.map((receipt) => [receipt.operation_id, receipt]));
  for (const receipt of before.receipts) assert.deepEqual(priorById.get(receipt.operation_id), receipt, `prior receipt ${receipt.operation_id} retained`);
  assert.equal(after.receipts.length, before.receipts.length + 1);
  assert.equal(after.receipts.filter((receipt) => receipt.operation_id === request.operation_id && receipt.operation_kind === "case_purge" && receipt.outcome === "deleted").length, 1);
}

async function prepareScenario(root, sqliteBinary, label, binary) {
  const scenarioRoot = path.join(root, label);
  await mkdir(scenarioRoot, { recursive: true });
  const liveAuthority = path.join(scenarioRoot, ".casebook");
  await mkdir(liveAuthority);
  const liveCanary = path.join(liveAuthority, "DO-NOT-ACCESS");
  await writeFile(liveCanary, "production/live authority canary\n");
  const f = await fixture(scenarioRoot, sqliteBinary, binary);
  const plan = await createPlan(scenarioRoot, f, binary);
  assertExactPlan(plan, f);
  return { f, plan, binary, liveCanary, liveCanaryBytes: await readFile(liveCanary) };
}

async function assertCanary(scenario) {
  assert.deepEqual(await readFile(scenario.liveCanary), scenario.liveCanaryBytes, "no production/live-style authority access");
}

async function exerciseGate(entrypointUnderTest, root, sqliteBinary, label) {
  const interruptedDuring = await prepareScenario(root, sqliteBinary, `${label}-during`, entrypointUnderTest);
  const duringRequest = executeRequest(interruptedDuring.f, interruptedDuring.plan, "during");
  const duringBefore = await protectedScope(sqliteBinary, interruptedDuring.f.storePath);
  const duringSnapshotDigest = await sha256File(interruptedDuring.f.snapshot.json.result.snapshot.path);
  const during = await invoke(interruptedDuring.f.root, duringRequest, entrypointUnderTest, { CASEBOOK_PERSISTENCE_TEST_FAULT: "purge_after_payload_delete_before_receipt" });
  assert.equal(during.json.failure.code, "case.purge_execution_failed");
  assertNotDeleted(during);
  assert.deepEqual(await protectedScope(sqliteBinary, interruptedDuring.f.storePath), duringBefore, "mid-transaction interruption rolls back every deletion");
  const duringReceiptFirst = await invoke(interruptedDuring.f.root, receiptRequest(interruptedDuring.f, duringRequest.operation_id), entrypointUnderTest);
  assert.equal(duringReceiptFirst.exitCode, 0, duringReceiptFirst.stderr || JSON.stringify(duringReceiptFirst.json));
  assert.equal(duringReceiptFirst.json.result.status, "absent_at_fence");
  const duringRecovered = await invoke(interruptedDuring.f.root, duringRequest, entrypointUnderTest);
  assert.equal(duringRecovered.exitCode, 0, duringRecovered.stderr || JSON.stringify(duringRecovered.json));
  await assertSettledTruth(sqliteBinary, interruptedDuring.f, interruptedDuring.plan, duringRequest, duringBefore, duringRecovered, duringSnapshotDigest);
  await assertCanary(interruptedDuring);

  const interruptedAfter = await prepareScenario(root, sqliteBinary, `${label}-after`, entrypointUnderTest);
  const afterRequest = executeRequest(interruptedAfter.f, interruptedAfter.plan, "after");
  const afterBefore = await protectedScope(sqliteBinary, interruptedAfter.f.storePath);
  const afterSnapshotDigest = await sha256File(interruptedAfter.f.snapshot.json.result.snapshot.path);
  const beforeExecutionReceipt = await invoke(interruptedAfter.f.root, receiptRequest(interruptedAfter.f, afterRequest.operation_id), entrypointUnderTest);
  assert.equal(beforeExecutionReceipt.json.result.status, "absent_at_fence", "interruption before execution leaves no receipt or deletion");
  assert.deepEqual(await protectedScope(sqliteBinary, interruptedAfter.f.storePath), afterBefore);
  const afterInterrupted = await invoke(interruptedAfter.f.root, afterRequest, entrypointUnderTest, { CASEBOOK_PERSISTENCE_TEST_FAULT: "purge_kill_executor_after_commit_before_response" });
  assert.notEqual(afterInterrupted.exitCode, 0, "executor is interrupted after durable commit and before response");
  const afterReceiptFirst = await invoke(interruptedAfter.f.root, receiptRequest(interruptedAfter.f, afterRequest.operation_id), entrypointUnderTest);
  assert.equal(afterReceiptFirst.exitCode, 0, afterReceiptFirst.stderr || JSON.stringify(afterReceiptFirst.json));
  assert.equal(afterReceiptFirst.json.result.status, "settled");
  assert.equal(afterReceiptFirst.json.result.receipt.operation_kind, "case_purge");
  assert.deepEqual(afterReceiptFirst.json.result.receipt.authority_claim, afterRequest.authority_claim);
  const receiptResult = { json: { result: afterReceiptFirst.json.result.receipt.result } };
  await assertSettledTruth(sqliteBinary, interruptedAfter.f, interruptedAfter.plan, afterRequest, afterBefore, receiptResult, afterSnapshotDigest);
  const afterReceiptRows = (await protectedScope(sqliteBinary, interruptedAfter.f.storePath)).receipts;
  const afterReplay = await invoke(interruptedAfter.f.root, afterRequest, entrypointUnderTest);
  assert.equal(afterReplay.exitCode, 0, afterReplay.stderr || JSON.stringify(afterReplay.json));
  assert.equal(afterReplay.json.result.idempotent_replay, true);
  assert.equal(afterReplay.json.result.receipt.result_digest, afterReceiptFirst.json.result.receipt.result_digest);
  assert.equal(afterReplay.json.result.full_erasure_claimed, false);
  assert.deepEqual((await protectedScope(sqliteBinary, interruptedAfter.f.storePath)).receipts, afterReceiptRows, "receipt replay performs no second deletion or settlement");
  await assertCanary(interruptedAfter);

  const refused = await prepareScenario(root, sqliteBinary, `${label}-refused`, entrypointUnderTest);
  const refusalBefore = await protectedScope(sqliteBinary, refused.f.storePath);
  const unauthorizedRequest = executeRequest(refused.f, refused.plan, "unauthorized");
  unauthorizedRequest.authority_claim.human_authorized = false;
  const unauthorized = await invoke(refused.f.root, unauthorizedRequest, entrypointUnderTest);
  assert.equal(unauthorized.json.failure.code, "case.purge_authority_required");
  assertNotDeleted(unauthorized);
  assert.deepEqual(await protectedScope(sqliteBinary, refused.f.storePath), refusalBefore, "execution needs separate exact human authorization");

  const tamperedRequest = executeRequest(refused.f, structuredClone(refused.plan), "tampered");
  tamperedRequest.plan.external_copy_disclosure.copies = [];
  const tampered = await invoke(refused.f.root, tamperedRequest, entrypointUnderTest);
  assert.equal(tampered.json.failure.code, "case.purge_plan_invalid");
  assertNotDeleted(tampered);
  assert.deepEqual(await protectedScope(sqliteBinary, refused.f.storePath), refusalBefore);

  const advanced = await invoke(refused.f.root, {
    protocol,
    operation: "snapshot_store",
    request_version: 1,
    operation_id: "operation:l10-w03:stale-fence-snapshot",
    operation_kind: "snapshot",
    purpose: "advance only the disposable store fence after exact purge planning",
    store_id: refused.f.initialization.store_id,
    authority_claim: { human_authorized: true, acting_role: "test-operator", authority_basis: "L10-W03 stale-plan proof", human_confirmation_reference: "human-confirmation:l10-w03:stale" },
    safety: { store_class: "disposable", authorization_reference: "disposable:l10-w03:stale" },
    expected: { store_id: refused.f.initialization.store_id, schema: { id: "casebook-persistence-sqlite", version: 1 }, protocol, operation_fence: refused.plan.expected.operation_fence },
    snapshot: { path: path.join(refused.f.root, "stale-fence.snapshot.sqlite3"), owner: "test-owner:l10-w03", retention: "retain_until_explicit_deletion" },
    canonical_state_effect: "none",
    requested_postcondition_evidence: ["store_identity", "schema_identity", "operation_fence", "digest", "size", "consistency", "integrity"],
    configuration: refused.f.common.configuration,
  }, entrypointUnderTest);
  assert.equal(advanced.exitCode, 0, advanced.stderr || JSON.stringify(advanced.json));
  const staleRequest = executeRequest(refused.f, refused.plan, "stale");
  const stale = await invoke(refused.f.root, staleRequest, entrypointUnderTest);
  assert.equal(stale.json.failure.code, "case.purge_plan_stale");
  assertNotDeleted(stale);
  const staleState = await protectedScope(sqliteBinary, refused.f.storePath);
  assert.deepEqual(staleState.targetRetained, refusalBefore.targetRetained);
  assert.deepEqual(staleState.targetPayload, refusalBefore.targetPayload);
  assert.deepEqual(staleState.nonTarget, refusalBefore.nonTarget);
  assert.deepEqual(staleState.projections, refusalBefore.projections);
  assert.equal(await exists(refused.f.snapshot.json.result.snapshot.path), true);
  assert.equal(await exists(advanced.json.result.snapshot.path), true);
  await assertCanary(refused);
}

test("L10-W03 source gate proves final purge truthfulness, bounded deletion, interruption recovery, and live-authority isolation", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l10-w03-source-"));
  try {
    await exerciseGate(entrypoint, root, sqliteBinary, "source");
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await exists(root), false);
  }
});

test("L10-W03 generated Pi, Codex, and OpenCode copies pass the same final purge truthfulness gate", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l10-w03-generated-"));
  try {
    const generated = await generateAndValidateSandbox({ sandboxRoot: root, sqliteBinary });
    for (const target of generated.results) {
      const generatedEntrypoint = path.join(target.package_root, "variants/sqlite/bin/casebook-persistence.mjs");
      await exerciseGate(generatedEntrypoint, root, sqliteBinary, target.target);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await exists(root), false);
  }
});
