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

function invoke(cwd, request, binary = entrypoint) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [binary], {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? "", HOME: cwd },
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
    scope: "synthetic L10-W01 only",
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
    source: { kind: "synthetic-test", locator: "l10-w01-disposable" },
    authority_mode: "sqlite",
    sqlite: { database_url: storePath, sqlite_bin: sqliteBinary },
  };
  const initialized = await invoke(root, {
    protocol,
    operation: "initialize_store",
    operation_id: "operation:l10-w01:initialize",
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
    operation_id: "operation:l10-w01:create-target",
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
    scope: "synthetic L10-W01 only",
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
    operation_id: "operation:l10-w01:create-inbound",
    expected_revision: 0,
    commit_basis: "create visible inbound dependency",
    provenance: { acting_role: "case-reconcile", authority_basis: "synthetic fixture" },
    case: inboundRecord,
  });
  assert.equal(inbound.exitCode, 0, JSON.stringify(inbound.json));
  const tombstone = await invoke(root, {
    ...common,
    operation: "case.tombstone.commit",
    operation_id: "operation:l10-w01:tombstone",
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
    operation_id: "operation:l10-w01:snapshot",
    operation_kind: "snapshot",
    purpose: "retain exact pre-purge synthetic copy",
    store_id: initialization.store_id,
    authority_claim: {
      human_authorized: true,
      acting_role: "snapshot-operator",
      authority_basis: "L10-W01 retained-copy disclosure",
      human_confirmation_reference: "human-confirmation:l10-w01:snapshot",
    },
    safety: { store_class: "disposable", authorization_reference: "disposable:l10-w01" },
    expected: {
      store_id: initialization.store_id,
      schema: { id: "casebook-persistence-sqlite", version: 1 },
      protocol,
      operation_fence: 4,
    },
    snapshot: { path: snapshotPath, owner: "test-owner:l10-w01", retention: "retain_until_explicit_deletion" },
    canonical_state_effect: "none",
    requested_postcondition_evidence: ["store_identity", "schema_identity", "operation_fence", "digest", "size", "consistency", "integrity"],
    configuration,
  });
  assert.equal(snapshot.exitCode, 0, snapshot.stderr || JSON.stringify(snapshot.json));
  assert.equal(snapshot.json.result.terminal.outcome, "snapshotted", JSON.stringify(snapshot.json));
  const impact = await invoke(root, {
    ...common,
    operation: "case.purge.inspect",
    case_id: CASE,
    expected_revision: 2,
    rationale: "inspect exact synthetic impact after retained snapshot",
  });
  assert.equal(impact.exitCode, 0, JSON.stringify(impact.json));
  return { root, storePath, common, initialization, tombstone, inbound, snapshot, impact };
}

function planRequest(f) {
  const current = f.tombstone.json.result.revision;
  const impact = f.impact.json.result;
  const snapshot = f.snapshot.json.result.snapshot;
  return {
    ...f.common,
    operation: "case.purge.plan",
    operation_id: "operation:l10-w01:purge-plan",
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
      authorization_reference: "disposable:l10-w01:purge-plan",
    },
    authority_claim: {
      human_authorized: true,
      acting_role: "purge-operator",
      authority_basis: "explicit L10-W01 synthetic planning authority only",
      human_confirmation_reference: "human-confirmation:l10-w01:purge-plan",
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

test("purge plan binds exact synthetic payload, disposition, impact, retained copies, exclusions, audit evidence, and performs no deletion", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l10-w01-plan-"));
  try {
    const f = await fixture(root, sqliteBinary);
    const request = planRequest(f);
    const before = await stat(f.storePath);
    const planned = await invoke(root, request);
    assert.equal(planned.exitCode, 0, planned.stderr || JSON.stringify(planned.json));
    const result = planned.json.result;
    assert.equal(result.status, "staged-only");
    assert.equal(result.operation_id, request.operation_id);
    assert.equal(result.mutation_performed, false);
    assert.equal(result.execution_authorized, false);
    assert.equal(result.canonical_payload_deleted, false);
    assert.equal(result.full_erasure_claimed, false);
    assert.deepEqual(result.expected, request.expected);
    assert.deepEqual(result.payload_scope.payload_classes, PAYLOAD_CLASSES);
    assert.deepEqual(result.payload_scope.revision_ids.map((x) => x.number), [1, 2]);
    assert.equal(result.payload_scope.revision_ids.at(-1).id, request.expected.case_revision.id);
    assert.ok(result.payload_scope.stable_identity_ids.includes(CASE));
    assert.ok(result.payload_scope.stable_identity_ids.includes(EVIDENCE));
    assert.ok(result.payload_scope.version_ids.length >= 4);
    assert.deepEqual(result.semantic_owner_disposition, request.semantic_owner_disposition);
    assert.deepEqual(result.dependency_impact.visible_inbound_references, f.impact.json.result.visible_inbound_references);
    assert.deepEqual(result.snapshot_disclosure, request.snapshot_disclosure);
    assert.deepEqual(result.external_copy_disclosure, request.external_copy_disclosure);
    assert.deepEqual(result.exclusions, EXCLUSIONS);
    assert.deepEqual(result.retained_non_payload_audit_evidence, RETAINED_AUDIT);
    assert.match(result.plan_digest, /^[0-9a-f]{64}$/);
    assert.equal((await stat(f.storePath)).size, before.size);
    assert.equal(await exists(f.snapshot.json.result.snapshot.path), true);
    const stillTombstoned = await invoke(root, {
      ...f.common,
      operation: "case.purge.inspect",
      case_id: CASE,
      expected_revision: 2,
      rationale: "prove plan did not delete payload",
    });
    assert.equal(stillTombstoned.exitCode, 0, JSON.stringify(stillTombstoned.json));
    assert.equal(stillTombstoned.json.result.current_revision.id, request.expected.case_revision.id);
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await exists(root), false);
  }
});

test("purge plan refuses incomplete claims and stale exact preconditions without mutation", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l10-w01-refusal-"));
  try {
    const f = await fixture(root, sqliteBinary);
    const valid = planRequest(f);
    for (const field of [
      "authority_claim",
      "payload_scope",
      "semantic_owner_disposition",
      "impact_inspection",
      "snapshot_disclosure",
      "external_copy_disclosure",
      "exclusions",
      "retained_audit_evidence",
    ]) {
      const incomplete = structuredClone(valid);
      delete incomplete[field];
      const refused = await invoke(root, incomplete);
      assert.equal(refused.exitCode, 2, `${field}: ${JSON.stringify(refused.json)}`);
      assert.equal(refused.json.ok, false);
    }
    const noHumanConfirmation = structuredClone(valid);
    delete noHumanConfirmation.authority_claim.human_confirmation_reference;
    const denied = await invoke(root, noHumanConfirmation);
    assert.equal(denied.exitCode, 2);
    assert.equal(denied.json.failure.code, "case.purge_authority_required");

    const falseSnapshot = structuredClone(valid);
    falseSnapshot.snapshot_disclosure.copies[0].sha256 = "0".repeat(64);
    const snapshotRefused = await invoke(root, falseSnapshot);
    assert.equal(snapshotRefused.exitCode, 2);
    assert.equal(snapshotRefused.json.failure.code, "case.purge_preconditions_incomplete");

    const staleFence = structuredClone(valid);
    staleFence.expected.operation_fence -= 1;
    const conflict = await invoke(root, staleFence);
    assert.equal(conflict.exitCode, 2);
    assert.equal(conflict.json.failure.code, "case.purge_precondition_conflict");
    assert.equal(conflict.json.failure.evidence.mutation_performed, false);

    const stillPresent = await invoke(root, {
      ...f.common,
      operation: "case.purge.inspect",
      case_id: CASE,
      expected_revision: 2,
      rationale: "all plan refusals are non-mutating",
    });
    assert.equal(stillPresent.exitCode, 0, JSON.stringify(stillPresent.json));
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await exists(root), false);
  }
});
