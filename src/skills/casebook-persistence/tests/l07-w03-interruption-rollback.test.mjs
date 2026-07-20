import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { generateAndValidateSandbox, selectCompatibleSqliteBinary } from "./sandbox-harness.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceEntrypoint = path.join(packageRoot, "variants/sqlite/bin/casebook-persistence.mjs");
const protocol = { id: "casebook-persistence-json", version: 1 };
const caseId = "case:6d28970a-591f-4ad3-95eb-40445999e75f";
const authorityClaim = {
  human_authorized: true,
  acting_role: "migration-operator",
  authority_basis: "explicit disposable L07-W03 destructive drill",
  human_confirmation_reference: "test-confirmation:l07-w03",
};

function execFileWithInput(file, args, options, input) {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      } else resolve({ stdout, stderr });
    });
    child.stdin.end(input);
  });
}

async function invoke(entrypoint, cwd, request, extraEnv = {}) {
  try {
    const { stdout, stderr } = await execFileWithInput(process.execPath, [entrypoint], {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? "", HOME: cwd, ...extraEnv },
    }, `${JSON.stringify(request)}\n`);
    return { exitCode: 0, signal: null, stderr, json: JSON.parse(stdout) };
  } catch (error) {
    let json = {};
    try { json = error.stdout ? JSON.parse(error.stdout) : {}; } catch { /* Killed processes have no JSON result. */ }
    return { exitCode: error.code, signal: error.signal ?? null, stderr: error.stderr ?? "", json };
  }
}

function configuration(storePath, sqliteBinary, label) {
  return {
    source: { kind: "synthetic-test", locator: `l07-w03-disposable:${label}` },
    authority_mode: "sqlite",
    sqlite: { database_url: storePath, sqlite_bin: sqliteBinary },
  };
}

async function row(sqliteBinary, storePath, sql) {
  const { stdout } = await execFileWithInput(sqliteBinary, ["-batch", "-bail", "-json", storePath], { encoding: "utf8" }, sql);
  return JSON.parse(stdout)[0];
}

async function exists(candidate) {
  return stat(candidate).then(() => true).catch(() => false);
}

async function migrationAssets(packagePath = packageRoot) {
  const manifest = JSON.parse(await readFile(path.join(packagePath, "manifest.json"), "utf8"));
  return {
    schemaAsset: manifest.assets.find((asset) => asset.id === "sqlite-migration-v2").sha256,
    migrationManifest: manifest.assets.find((asset) => asset.id === "sqlite-migrations").sha256,
  };
}

async function createFixture(root, sqliteBinary, entrypoint, packagePath, label) {
  const storePath = path.join(root, `${label}.sqlite3`);
  const config = configuration(storePath, sqliteBinary, label);
  const initialized = await invoke(entrypoint, root, {
    protocol,
    operation: "initialize_store",
    operation_id: `operation:${label}:initialize`,
    authority_claim: { human_authorized: true, acting_role: "architect", authority_basis: "disposable drill fixture" },
    configuration: config,
  });
  assert.equal(initialized.exitCode, 0, initialized.stderr);
  const initialization = initialized.json.result.initialization;
  const context = {
    view_id: initialization.view.id,
    view_policy_revision_id: initialization.view.policy_revision_id,
    purpose: "retain one canonical owner through the migration drill",
    requested_audience_ceiling: "private",
  };
  const created = await invoke(entrypoint, root, {
    protocol,
    operation: "case.create",
    request_version: 1,
    operation_id: `operation:${label}:case-create`,
    store_id: initialization.store_id,
    context,
    expected_revision: 0,
    commit_basis: "disposable evidence owner",
    provenance: { acting_role: "case-reconcile", authority_basis: "drill fixture" },
    case: {
      id: caseId,
      home_namespace_id: initialization.namespace.id,
      state: "active",
      title: "Migration evidence owner",
      summary: "Must survive interruption without semantic or receipt drift.",
      scope: "L07-W03 disposable drill",
      aliases: [], facets: [], entries: [], sources: [], relationships: [], references: [],
    },
    configuration: config,
  });
  assert.equal(created.exitCode, 0, JSON.stringify(created.json));
  const baseline = await durableEvidence(sqliteBinary, storePath, label);
  return { root, storePath, config, initialization, context, baseline, assets: await migrationAssets(packagePath), label };
}

async function durableEvidence(sqliteBinary, storePath, label) {
  return row(sqliteBinary, storePath, `
    SELECT
      (SELECT count(*) FROM owners) AS owners,
      (SELECT count(*) FROM owner_revisions) AS revisions,
      (SELECT count(*) FROM owner_events) AS events,
      (SELECT count(*) FROM owner_outbox) AS outbox,
      (SELECT revision_id FROM owner_current WHERE owner_id = '${caseId}') AS current_revision_id,
      (SELECT result_digest FROM store_operation_receipts WHERE operation_id = 'operation:${label}:initialize') AS initialization_receipt_digest,
      (SELECT result_digest FROM store_operation_receipts WHERE operation_id = 'operation:${label}:case-create') AS owner_receipt_digest,
      (SELECT payload_digest FROM owner_events WHERE operation_id = 'operation:${label}:case-create') AS event_payload_digest;
  `);
}

function migrationRequest(fixture) {
  return {
    protocol,
    operation: "migrate_store",
    operation_id: `operation:${fixture.label}:migrate`,
    operation_kind: "migration",
    purpose: "destructively drill one named disposable store",
    store_id: fixture.initialization.store_id,
    safety: { store_class: "disposable", authorization_reference: `disposable-authorization:${fixture.label}` },
    authority_claim: structuredClone(authorityClaim),
    expected: {
      store_id: fixture.initialization.store_id,
      schema: { id: "casebook-persistence-sqlite", version: 1 },
      protocol: { ...protocol },
      assets: {
        schema_asset_sha256: fixture.initialization.schema.asset_sha256,
        migration_manifest_sha256: fixture.initialization.schema.migration.manifest_sha256,
      },
      operation_fence: 2,
    },
    target: { schema: { id: "casebook-persistence-sqlite", version: 2 }, protocol: { ...protocol } },
    migration: {
      id: "0002-migration-snapshot-evidence",
      from_version: 1,
      to_version: 2,
      schema_asset_sha256: fixture.assets.schemaAsset,
      manifest_sha256: fixture.assets.migrationManifest,
    },
    snapshot: {
      path: path.join(fixture.root, `${fixture.label}.pre-migration.snapshot.sqlite3`),
      on_success: "delete",
      on_failure: "retain",
    },
    canonical_state_effect: "schema-change",
    requested_postcondition_evidence: ["schema_identity", "protocol_identity", "asset_identity", "integrity", "healthy_exposure"],
    configuration: fixture.config,
  };
}

function receiptLookup(fixture) {
  return {
    protocol,
    operation: "get_store_operation_receipt",
    operation_id: `operation:${fixture.label}:migrate`,
    store_id: fixture.initialization.store_id,
    authority_claim: { human_authorized: true, acting_role: "migration-operator", authority_basis: "uncertain-operation recovery" },
    context: { ...fixture.context, purpose: "recover interrupted migration receipt" },
    configuration: fixture.config,
  };
}

async function assertPriorHealth(fixture, expectedFence) {
  assert.deepEqual(await row(fixture.config.sqlite.sqlite_bin, fixture.storePath, `
    SELECT
      (SELECT user_version FROM pragma_user_version) AS schema_version,
      (SELECT schema_version FROM store_metadata) AS metadata_version,
      (SELECT operation_fence FROM store_fence) AS operation_fence,
      (SELECT count(*) FROM schema_migrations) AS migrations,
      (SELECT count(*) FROM pragma_foreign_key_check) AS foreign_key_violations;
  `), { schema_version: 1, metadata_version: 1, operation_fence: expectedFence, migrations: 1, foreign_key_violations: 0 });
  assert.deepEqual(await durableEvidence(fixture.config.sqlite.sqlite_bin, fixture.storePath, fixture.label), fixture.baseline);
}

async function assertSnapshotEvidence(snapshotPath, expectedDigest = null) {
  const bytes = await readFile(snapshotPath);
  const observed = createHash("sha256").update(bytes).digest("hex");
  if (expectedDigest) assert.equal(observed, expectedDigest);
  return observed;
}

async function runSourceDrill(root, sqliteBinary, entrypoint = sourceEntrypoint, packagePath = packageRoot, prefix = "source") {
  const preflight = await createFixture(root, sqliteBinary, entrypoint, packagePath, `${prefix}-preflight`);
  const rejectedRequest = migrationRequest(preflight);
  rejectedRequest.migration.schema_asset_sha256 = "0".repeat(64);
  const rejected = await invoke(entrypoint, root, rejectedRequest);
  assert.equal(rejected.exitCode, 0, rejected.stderr);
  assert.equal(rejected.json.result.terminal.code, "migration_asset_mismatch");
  assert.equal(await exists(rejectedRequest.snapshot.path), false);
  await assertPriorHealth(preflight, 3);
  const rejectedLookup = await invoke(entrypoint, root, receiptLookup(preflight));
  assert.equal(rejectedLookup.json.result.status, "settled");
  assert.equal(rejectedLookup.json.result.receipt.outcome, "rejected");

  const snapKilled = await createFixture(root, sqliteBinary, entrypoint, packagePath, `${prefix}-snapshot-kill`);
  const snapKilledRequest = migrationRequest(snapKilled);
  const killedAfterSnapshot = await invoke(entrypoint, root, snapKilledRequest, { CASEBOOK_PERSISTENCE_TEST_FAULT: "migration_after_snapshot_verified" });
  assert.equal(killedAfterSnapshot.signal, "SIGKILL");
  assert.equal(await exists(snapKilledRequest.snapshot.path), true);
  await assertSnapshotEvidence(snapKilledRequest.snapshot.path);
  await assertPriorHealth(snapKilled, 2);
  const absent = await invoke(entrypoint, root, receiptLookup(snapKilled));
  assert.deepEqual(absent.json.result, { status: "absent_at_fence", operation_fence: 2 });

  const transactionKilled = await createFixture(root, sqliteBinary, entrypoint, packagePath, `${prefix}-transaction-kill`);
  const transactionRequest = migrationRequest(transactionKilled);
  const rolledBack = await invoke(entrypoint, root, transactionRequest, { CASEBOOK_PERSISTENCE_TEST_FAULT: "migration_kill_executor_after_apply_before_commit" });
  assert.equal(rolledBack.exitCode, 0, rolledBack.stderr);
  assert.equal(rolledBack.json.result.terminal.code, "migration_execution_failed_prior_health_retained");
  assert.equal(rolledBack.json.result.recovery.disposition, "prior_health_retained");
  assert.equal(rolledBack.json.result.recovery.evidence_owner, authorityClaim.acting_role);
  assert.equal(rolledBack.json.result.recovery.retained_evidence[0].path, transactionRequest.snapshot.path);
  await assertSnapshotEvidence(transactionRequest.snapshot.path, rolledBack.json.result.snapshot.sha256);
  await assertPriorHealth(transactionKilled, 3);
  const rolledBackLookup = await invoke(entrypoint, root, receiptLookup(transactionKilled));
  assert.equal(rolledBackLookup.json.result.receipt.outcome, "failed");
  assert.deepEqual(rolledBackLookup.json.result.receipt.result, rolledBack.json.result);

  const committed = await createFixture(root, sqliteBinary, entrypoint, packagePath, `${prefix}-commit-kill`);
  const committedRequest = migrationRequest(committed);
  const killedAfterCommit = await invoke(entrypoint, root, committedRequest, { CASEBOOK_PERSISTENCE_TEST_FAULT: "migration_after_commit_before_health_verification" });
  assert.equal(killedAfterCommit.signal, "SIGKILL");
  assert.equal(await exists(committedRequest.snapshot.path), true);
  const committedSnapshotDigest = await assertSnapshotEvidence(committedRequest.snapshot.path);
  const selected = await row(sqliteBinary, committed.storePath, `
    SELECT
      (SELECT user_version FROM pragma_user_version) AS schema_version,
      (SELECT schema_version FROM store_metadata) AS metadata_version,
      (SELECT operation_fence FROM store_fence) AS operation_fence,
      (SELECT count(*) FROM schema_migrations) AS migrations,
      (SELECT count(*) FROM pragma_foreign_key_check) AS foreign_key_violations;
  `);
  assert.deepEqual(selected, { schema_version: 2, metadata_version: 2, operation_fence: 3, migrations: 2, foreign_key_violations: 0 });
  assert.deepEqual(await durableEvidence(sqliteBinary, committed.storePath, committed.label), committed.baseline);
  const committedLookup = await invoke(entrypoint, root, receiptLookup(committed));
  assert.equal(committedLookup.json.result.status, "settled");
  assert.equal(committedLookup.json.result.receipt.outcome, "migrated");
  assert.equal(committedLookup.json.result.receipt.result.snapshot.sha256, committedSnapshotDigest);
  const replayed = await invoke(entrypoint, root, committedRequest);
  assert.equal(replayed.exitCode, 0, replayed.stderr);
  assert.equal(replayed.json.result.terminal.outcome, "migrated");
  assert.equal(await exists(committedRequest.snapshot.path), false, "receipt-first replay must finish successful snapshot cleanup");

  const restored = await createFixture(root, sqliteBinary, entrypoint, packagePath, `${prefix}-restore`);
  const restoredRequest = migrationRequest(restored);
  const restoreResult = await invoke(entrypoint, root, restoredRequest, { CASEBOOK_PERSISTENCE_TEST_FAULT: "migration_fail_after_commit_before_health_verification" });
  assert.equal(restoreResult.exitCode, 0, restoreResult.stderr);
  assert.equal(restoreResult.json.result.terminal.code, "migration_execution_failed_prior_health_restored");
  assert.equal(restoreResult.json.result.recovery.disposition, "prior_health_restored");
  assert.equal(restoreResult.json.result.recovery.evidence_owner, authorityClaim.acting_role);
  await assertPriorHealth(restored, 3);
  await assertSnapshotEvidence(restoredRequest.snapshot.path, restoreResult.json.result.snapshot.sha256);
  assert.equal((await invoke(entrypoint, root, receiptLookup(restored))).json.result.receipt.outcome, "failed");

  const quarantined = await createFixture(root, sqliteBinary, entrypoint, packagePath, `${prefix}-quarantine`);
  const quarantinedRequest = migrationRequest(quarantined);
  const quarantineResult = await invoke(entrypoint, root, quarantinedRequest, { CASEBOOK_PERSISTENCE_TEST_FAULT: "migration_restore_fail_after_quarantine" });
  assert.equal(quarantineResult.exitCode, 2, quarantineResult.stderr);
  assert.equal(quarantineResult.json.failure.code, "migration_failed_store_quarantined");
  assert.equal(await exists(quarantined.storePath), false);
  const retained = quarantineResult.json.failure.evidence.retained_evidence;
  assert.equal(retained.length, 2);
  assert.equal(retained.every((item) => item.owner === authorityClaim.acting_role), true);
  assert.equal(retained.every((item) => item.authoritative === false), true);
  const snapshotEvidence = retained.find((item) => item.kind === "pre_migration_snapshot");
  const quarantineEvidence = retained.find((item) => item.kind === "quarantined_migrated_store");
  assert.equal(snapshotEvidence.path, quarantinedRequest.snapshot.path);
  await assertSnapshotEvidence(snapshotEvidence.path, snapshotEvidence.sha256);
  assert.equal(await exists(quarantineEvidence.path), true);
  assert.deepEqual(await durableEvidence(sqliteBinary, quarantineEvidence.path, quarantined.label), quarantined.baseline);
  assert.deepEqual(await row(sqliteBinary, quarantineEvidence.path, `
    SELECT
      (SELECT user_version FROM pragma_user_version) AS schema_version,
      (SELECT schema_version FROM store_metadata) AS metadata_version,
      (SELECT count(*) FROM pragma_foreign_key_check) AS foreign_key_violations,
      (SELECT count(*) FROM store_operation_receipts WHERE operation_kind = 'migration') AS migration_receipts,
      (SELECT outcome FROM store_operation_receipts WHERE operation_id = 'operation:${quarantined.label}:migrate') AS quarantined_artifact_outcome;
  `), {
    schema_version: 2,
    metadata_version: 2,
    foreign_key_violations: 0,
    migration_receipts: 1,
    quarantined_artifact_outcome: "migrated",
  });
  const unavailable = await invoke(entrypoint, root, receiptLookup(quarantined));
  assert.equal(unavailable.json.result.status, "store_unavailable");
}

test("independent interruption drill proves pre-snapshot rejection, transaction rollback, post-commit recovery, restore, and quarantine", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l07-w03-source-"));
  try {
    await runSourceDrill(root, sqliteBinary);
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await exists(root), false);
  }
});

test("generated Pi, Codex, and OpenCode packages preserve the interruption and recovery contract", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l07-w03-generated-"));
  try {
    const sandbox = await generateAndValidateSandbox({ sandboxRoot: root, sqliteBinary });
    for (const generated of sandbox.results) {
      const generatedEntrypoint = path.join(generated.package_root, "variants/sqlite/bin/casebook-persistence.mjs");
      await runSourceDrill(root, sqliteBinary, generatedEntrypoint, generated.package_root, generated.target);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await exists(root), false);
  }
});
