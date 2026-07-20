import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { selectCompatibleSqliteBinary } from "./sandbox-harness.mjs";

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
    scope: "synthetic L10-W02 only",
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

async function fixture(root, sqliteBinary) {
  const storePath = path.join(root, "synthetic-disposable.sqlite3");
  const configuration = {
    source: { kind: "synthetic-test", locator: "l10-w02-disposable" },
    authority_mode: "sqlite",
    sqlite: { database_url: storePath, sqlite_bin: sqliteBinary },
  };
  const initialized = await invoke(root, {
    protocol,
    operation: "initialize_store",
    operation_id: "operation:l10-w02:initialize",
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
  const created = await invoke(root, {
    ...common,
    operation: "case.create",
    operation_id: "operation:l10-w02:create-target",
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
    scope: "synthetic L10-W02 only",
    aliases: [], facets: [], entries: [], sources: [], relationships: [],
    references: [{
      target_kind: "case",
      target_id: CASE,
      observed_revision_id: created.json.result.revision.id,
      predicate: "depends_on",
      visibility: "private",
    }],
  };
  const inbound = await invoke(root, {
    ...common,
    operation: "case.create",
    operation_id: "operation:l10-w02:create-inbound",
    expected_revision: 0,
    commit_basis: "create visible inbound dependency",
    provenance: { acting_role: "case-reconcile", authority_basis: "synthetic fixture" },
    case: inboundRecord,
  });
  assert.equal(inbound.exitCode, 0, JSON.stringify(inbound.json));
  const tombstone = await invoke(root, {
    ...common,
    operation: "case.tombstone.commit",
    operation_id: "operation:l10-w02:tombstone",
    expected_revision: 1,
    commit_basis: "semantic owner disposition before purge planning",
    provenance: { acting_role: "case-reconcile", authority_basis: "synthetic semantic-owner decision" },
    case: caseRecord(initialization.namespace.id, "tombstoned"),
  });
  assert.equal(tombstone.exitCode, 0, JSON.stringify(tombstone.json));
  const snapshotPath = path.join(root, "pre-purge.snapshot.sqlite3");
  const snapshot = await invoke(root, {
    protocol,
    operation: "snapshot_store",
    request_version: 1,
    operation_id: "operation:l10-w02:snapshot",
    operation_kind: "snapshot",
    purpose: "retain exact pre-purge synthetic copy",
    store_id: initialization.store_id,
    authority_claim: {
      human_authorized: true,
      acting_role: "snapshot-operator",
      authority_basis: "L10-W02 retained-copy disclosure",
      human_confirmation_reference: "human-confirmation:l10-w02:snapshot",
    },
    safety: { store_class: "disposable", authorization_reference: "disposable:l10-w02" },
    expected: {
      store_id: initialization.store_id,
      schema: { id: "casebook-persistence-sqlite", version: 1 },
      protocol,
      operation_fence: 4,
    },
    snapshot: { path: snapshotPath, owner: "test-owner:l10-w02", retention: "retain_until_explicit_deletion" },
    canonical_state_effect: "none",
    requested_postcondition_evidence: ["store_identity", "schema_identity", "operation_fence", "digest", "size", "consistency", "integrity"],
    configuration,
  });
  assert.equal(snapshot.exitCode, 0, snapshot.stderr || JSON.stringify(snapshot.json));
  assert.equal(snapshot.json.result.terminal.outcome, "snapshotted", JSON.stringify(snapshot.json));
  const projection = await invoke(root, {
    ...common,
    operation: "projection.rebuild",
    operation_id: "operation:l10-w02:projection-rebuild",
    authority_claim: { human_authorized: true, acting_role: "test-operator", authority_basis: "synthetic purge projection scope", human_confirmation_reference: "human-confirmation:l10-w02:projection" },
    safety: { store_class: "disposable", authorization_reference: "disposable:l10-w02:projection" },
    projection_kinds: ["lexical", "reverse_reference", "staleness", "attention"],
    canonical_fence: snapshot.json.result.receipt.operation_fence,
    canonical_state_effect: "none",
    requested_postcondition_evidence: ["source_fence", "projection_digest", "verification", "atomic_selection", "canonical_state_unchanged"],
  });
  assert.equal(projection.exitCode, 0, projection.stderr || JSON.stringify(projection.json));
  assert.equal(projection.json.result.terminal.outcome, "rebuilt");
  const impact = await invoke(root, {
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
    operation_id: "operation:l10-w02:purge-plan",
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
      authorization_reference: "disposable:l10-w02:purge-plan",
    },
    authority_claim: {
      human_authorized: true,
      acting_role: "purge-operator",
      authority_basis: "explicit L10-W02 synthetic planning authority only",
      human_confirmation_reference: "human-confirmation:l10-w02:purge-plan",
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
    operation_id: `operation:l10-w02:${suffix}`,
    purpose: "execute only the exact authorized synthetic Case payload purge plan",
    case_id: CASE,
    plan,
    safety: {
      store_class: "disposable",
      synthetic_case: true,
      store_name: path.basename(f.storePath),
      authorization_reference: "disposable:l10-w02:purge-execute",
    },
    authority_claim: {
      human_authorized: true,
      acting_role: "purge-operator",
      authority_basis: "explicit L10-W02 execution authority for this exact plan",
      human_confirmation_reference: "human-confirmation:l10-w02:purge-execute",
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

async function createPlan(root, f) {
  const planned = await invoke(root, planRequest(f));
  assert.equal(planned.exitCode, 0, planned.stderr || JSON.stringify(planned.json));
  return planned.json.result;
}

test("exact current W01 plan erases only target payload atomically, retains identity/history/audit, and replays from its receipt", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l10-w02-execute-"));
  try {
    const f = await fixture(root, sqliteBinary);
    const plan = await createPlan(root, f);
    const request = executeRequest(f, plan);
    const snapshotBefore = await stat(f.snapshot.json.result.snapshot.path);
    const result = await invoke(root, request);
    assert.equal(result.exitCode, 0, result.stderr || JSON.stringify(result.json));
    assert.equal(result.json.result.status, "settled");
    assert.equal(result.json.result.terminal.outcome, "deleted");
    assert.equal(result.json.result.canonical_payload_deleted, true);
    assert.equal(result.json.result.idempotent_replay, false);
    assert.equal(result.json.result.plan_digest, plan.plan_digest);
    assert.deepEqual(result.json.result.deleted_scope.payload_classes, PAYLOAD_CLASSES);
    assert.deepEqual(result.json.result.deleted_scope.revision_ids, plan.payload_scope.revision_ids);
    assert.deepEqual(result.json.result.retained_non_payload_evidence.revision_ids, plan.payload_scope.revision_ids);
    assert.deepEqual(result.json.result.retained_non_payload_evidence.stable_identity_ids, plan.payload_scope.stable_identity_ids);
    assert.equal(result.json.result.postconditions.canonical_payload_absent, true);
    assert.equal(result.json.result.postconditions.non_payload_identity_retained, true);
    assert.equal(result.json.result.excluded_effects.snapshots, "untouched");
    assert.equal(result.json.result.excluded_effects.external_authorities, "untouched");
    assert.equal((await stat(f.snapshot.json.result.snapshot.path)).size, snapshotBefore.size);

    const counts = (await sqliteRows(sqliteBinary, f.storePath, `
      SELECT
        (SELECT count(*) FROM owners WHERE owner_id='${CASE}') AS owners,
        (SELECT count(*) FROM owner_family_bindings WHERE owner_id='${CASE}') AS identities,
        (SELECT count(*) FROM owner_revisions WHERE owner_id='${CASE}') AS revisions,
        (SELECT count(*) FROM owner_versions WHERE owner_id='${CASE}') AS versions,
        (SELECT count(*) FROM owner_revision_selections WHERE revision_id IN (SELECT revision_id FROM owner_revisions WHERE owner_id='${CASE}')) AS selections,
        (SELECT count(*) FROM owner_current WHERE owner_id='${CASE}') AS current_rows,
        (SELECT count(*) FROM owner_events WHERE owner_id='${CASE}') AS events,
        (SELECT count(*) FROM owner_outbox WHERE owner_id='${CASE}') AS outbox,
        (SELECT count(*) FROM store_operation_receipts WHERE operation_id='${request.operation_id}' AND operation_kind='case_purge' AND outcome='deleted') AS receipts,
        (SELECT count(*) FROM owner_current WHERE owner_id='${INBOUND}') AS inbound_current,
        (SELECT count(*) FROM disposable_projection_entries WHERE json_extract(payload_json,'$.owner.id')='${CASE}' OR json_extract(payload_json,'$.source_owner.id')='${CASE}') AS target_projection_entries,
        (SELECT selection_status FROM disposable_projection_selection WHERE singleton=1) AS projection_status;
    `))[0];
    assert.deepEqual(counts, { owners: 1, identities: plan.payload_scope.stable_identity_ids.length, revisions: 2, versions: 0, selections: 0, current_rows: 0, events: 2, outbox: 0, receipts: 1, inbound_current: 1, target_projection_entries: 0, projection_status: "stale" });

    const replay = await invoke(root, request);
    assert.equal(replay.exitCode, 0, replay.stderr || JSON.stringify(replay.json));
    assert.equal(replay.json.result.terminal.outcome, "deleted");
    assert.equal(replay.json.result.idempotent_replay, true);
    assert.equal(replay.json.result.receipt.result_digest, result.json.result.receipt.result_digest);

    const mismatch = structuredClone(request);
    mismatch.purpose = "different destructive meaning";
    const rejected = await invoke(root, mismatch);
    assert.equal(rejected.exitCode, 2);
    assert.equal(rejected.json.failure.code, "case.purge_idempotency_mismatch");
    assert.equal(rejected.json.failure.evidence.terminal_outcome, "not_deleted");
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await exists(root), false);
  }
});

test("tampered/stale plans and a controlled pre-receipt interruption report not_deleted and preserve canonical payload", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  for (const mode of ["tampered", "stale", "interrupted"]) {
    const root = await mkdtemp(path.join(os.tmpdir(), `casebook-persistence-l10-w02-${mode}-`));
    try {
      const f = await fixture(root, sqliteBinary);
      const plan = await createPlan(root, f);
      const request = executeRequest(f, plan, mode);
      let refused;
      if (mode === "tampered") {
        request.plan.payload_scope.version_ids = request.plan.payload_scope.version_ids.slice(1);
        refused = await invoke(root, request);
        assert.equal(refused.exitCode, 2);
        assert.equal(refused.json.failure.code, "case.purge_plan_invalid");
      } else if (mode === "stale") {
        const extraSnapshot = await invoke(root, {
          protocol,
          operation: "snapshot_store",
          request_version: 1,
          operation_id: "operation:l10-w02:advance-fence",
          operation_kind: "snapshot",
          purpose: "advance the synthetic store fence after W01 planning",
          store_id: f.initialization.store_id,
          authority_claim: { human_authorized: true, acting_role: "test-operator", authority_basis: "stale plan test", human_confirmation_reference: "human-confirmation:l10-w02:stale" },
          safety: { store_class: "disposable", authorization_reference: "disposable:l10-w02:stale" },
          expected: { store_id: f.initialization.store_id, schema: { id: "casebook-persistence-sqlite", version: 1 }, protocol, operation_fence: plan.expected.operation_fence },
          snapshot: { path: path.join(root, "fence-advance.snapshot.sqlite3"), owner: "test-owner:l10-w02", retention: "retain_until_explicit_deletion" },
          canonical_state_effect: "none",
          requested_postcondition_evidence: ["store_identity", "schema_identity", "operation_fence", "digest", "size", "consistency", "integrity"],
          configuration: f.common.configuration,
        });
        assert.equal(extraSnapshot.exitCode, 0, extraSnapshot.stderr || JSON.stringify(extraSnapshot.json));
        refused = await invoke(root, request);
        assert.equal(refused.exitCode, 2);
        assert.equal(refused.json.failure.code, "case.purge_plan_stale");
      } else {
        refused = await invoke(root, request, entrypoint, { CASEBOOK_PERSISTENCE_TEST_FAULT: "purge_after_payload_delete_before_receipt" });
        assert.equal(refused.exitCode, 2);
        assert.equal(refused.json.failure.code, "case.purge_execution_failed");
      }
      assert.equal(refused.json.failure.evidence.terminal_outcome, "not_deleted");
      assert.equal(refused.json.failure.evidence.mutation_performed, false);
      const retained = (await sqliteRows(sqliteBinary, f.storePath, `SELECT
        (SELECT count(*) FROM owner_current WHERE owner_id='${CASE}') AS current_rows,
        (SELECT count(*) FROM owner_versions WHERE owner_id='${CASE}') AS versions,
        (SELECT count(*) FROM store_operation_receipts WHERE operation_id='${request.operation_id}') AS receipts;
      `))[0];
      assert.equal(retained.current_rows, 1);
      assert.ok(retained.versions > 0);
      assert.equal(retained.receipts, 0);
      assert.equal(await exists(f.snapshot.json.result.snapshot.path), true);
    } finally {
      await rm(root, { recursive: true, force: true });
      assert.equal(await exists(root), false);
    }
  }
});
