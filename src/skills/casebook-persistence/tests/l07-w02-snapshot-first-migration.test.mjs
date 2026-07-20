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
const entrypoint = path.join(packageRoot, "variants/sqlite/bin/casebook-persistence.mjs");
const protocol = { id: "casebook-persistence-json", version: 1 };

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

async function invoke(cwd, request, extraEnv = {}, selectedEntrypoint = entrypoint) {
  try {
    const { stdout, stderr } = await execFileWithInput(process.execPath, [selectedEntrypoint], {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? "", HOME: cwd, ...extraEnv },
    }, `${JSON.stringify(request)}\n`);
    return { exitCode: 0, stderr, json: JSON.parse(stdout) };
  } catch (error) {
    return {
      exitCode: error.code,
      stderr: error.stderr ?? "",
      json: error.stdout ? JSON.parse(error.stdout) : {},
    };
  }
}

function configuration(storePath, sqliteBinary) {
  return {
    source: { kind: "synthetic-test", locator: "l07-w02-disposable" },
    authority_mode: "sqlite",
    sqlite: { database_url: storePath, sqlite_bin: sqliteBinary },
  };
}

const authorityClaim = {
  human_authorized: true,
  acting_role: "architect",
  authority_basis: "explicit disposable L07-W02 migration test",
  human_confirmation_reference: "test-confirmation:l07-w02",
};

async function initializedStore(root, sqliteBinary, label, selectedEntrypoint = entrypoint) {
  const storePath = path.join(root, `${label}.sqlite3`);
  const initialized = await invoke(root, {
    protocol,
    operation: "initialize_store",
    operation_id: `operation:${label}:initialize`,
    authority_claim: {
      human_authorized: true,
      acting_role: authorityClaim.acting_role,
      authority_basis: authorityClaim.authority_basis,
    },
    configuration: configuration(storePath, sqliteBinary),
  }, {}, selectedEntrypoint);
  assert.equal(initialized.exitCode, 0, initialized.stderr);
  return { storePath, initialization: initialized.json.result.initialization };
}

async function migrationAssets() {
  const manifest = JSON.parse(await readFile(path.join(packageRoot, "manifest.json"), "utf8"));
  const asset = (id) => manifest.assets.find((candidate) => candidate.id === id)?.sha256;
  assert.match(asset("sqlite-migration-v2"), /^[0-9a-f]{64}$/);
  return {
    schemaAsset: asset("sqlite-migration-v2"),
    migrationManifest: asset("sqlite-migrations"),
  };
}

async function migrationRequest(root, sqliteBinary, initialized, label) {
  const targetAssets = await migrationAssets();
  return {
    protocol,
    operation: "migrate_store",
    operation_id: `operation:${label}:migrate`,
    operation_kind: "migration",
    purpose: "upgrade one explicitly named disposable test store",
    store_id: initialized.initialization.store_id,
    safety: {
      store_class: "disposable",
      authorization_reference: `disposable-authorization:${label}`,
    },
    authority_claim: structuredClone(authorityClaim),
    expected: {
      store_id: initialized.initialization.store_id,
      schema: { id: "casebook-persistence-sqlite", version: 1 },
      protocol: { ...protocol },
      assets: {
        schema_asset_sha256: initialized.initialization.schema.asset_sha256,
        migration_manifest_sha256: initialized.initialization.schema.migration.manifest_sha256,
      },
      operation_fence: 1,
    },
    target: {
      schema: { id: "casebook-persistence-sqlite", version: 2 },
      protocol: { ...protocol },
    },
    migration: {
      id: "0002-migration-snapshot-evidence",
      from_version: 1,
      to_version: 2,
      schema_asset_sha256: targetAssets.schemaAsset,
      manifest_sha256: targetAssets.migrationManifest,
    },
    snapshot: {
      path: path.join(root, `${label}.pre-migration.snapshot.sqlite3`),
      on_success: "delete",
      on_failure: "retain",
    },
    canonical_state_effect: "schema-change",
    requested_postcondition_evidence: ["schema_identity", "protocol_identity", "asset_identity", "integrity", "healthy_exposure"],
    configuration: configuration(initialized.storePath, sqliteBinary),
  };
}

async function row(sqliteBinary, storePath, sql) {
  const { stdout } = await execFileWithInput(sqliteBinary, ["-batch", "-bail", "-json", storePath], { encoding: "utf8" }, sql);
  return JSON.parse(stdout)[0];
}

async function exists(candidate) {
  return stat(candidate).then(() => true).catch(() => false);
}

test("verified snapshot-first migration applies the exact source-controlled step transactionally and exposes healthy schema 2", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l07-w02-success-"));
  try {
    const initialized = await initializedStore(root, sqliteBinary, "success");
    const request = await migrationRequest(root, sqliteBinary, initialized, "success");
    const migrated = await invoke(root, request);
    assert.equal(migrated.exitCode, 0, migrated.stderr);
    assert.equal(migrated.json.result.status, "settled");
    assert.deepEqual(migrated.json.result.terminal, {
      outcome: "migrated",
      code: "migration_completed",
      failure_class: null,
      retry_disposition: "never",
      canonical_state_effect: "schema-change",
    });
    assert.equal(migrated.json.result.snapshot.verified, true);
    assert.match(migrated.json.result.snapshot.sha256, /^[0-9a-f]{64}$/);
    assert.equal(migrated.json.result.snapshot.size_bytes > 0, true);
    assert.equal(migrated.json.result.snapshot.source.operation_fence, 1);
    assert.deepEqual(migrated.json.result.postconditions.schema, { id: "casebook-persistence-sqlite", version: 2 });
    assert.deepEqual(migrated.json.result.postconditions.protocol, protocol);
    assert.deepEqual(migrated.json.result.postconditions.integrity, { quick_check: "ok", foreign_key_violations: 0 });
    assert.equal(migrated.json.result.postconditions.healthy_exposure, true);
    assert.equal(await exists(request.snapshot.path), false);

    assert.deepEqual(await row(sqliteBinary, initialized.storePath, `
      SELECT
        (SELECT user_version FROM pragma_user_version) AS schema_version,
        (SELECT schema_version FROM store_metadata) AS metadata_version,
        (SELECT count(*) FROM schema_migrations) AS migrations,
        (SELECT count(*) FROM store_operation_receipts WHERE operation_kind = 'migration') AS migration_receipts,
        (SELECT operation_fence FROM store_fence) AS operation_fence,
        (SELECT count(*) FROM pragma_foreign_key_check) AS foreign_key_violations,
        (SELECT count(*) FROM pragma_table_info('store_operation_receipts') WHERE name IN ('snapshot_sha256','snapshot_size_bytes')) AS snapshot_columns;
    `), {
      schema_version: 2,
      metadata_version: 2,
      migrations: 2,
      migration_receipts: 1,
      operation_fence: 2,
      foreign_key_violations: 0,
      snapshot_columns: 2,
    });

    const ordinaryRead = await invoke(root, {
      protocol,
      operation: "case.read",
      request_version: 1,
      store_id: initialized.initialization.store_id,
      case_id: "case:00000000-0000-4000-8000-000000000000",
      context: {
        view_id: initialized.initialization.view.id,
        view_policy_revision_id: initialized.initialization.view.policy_revision_id,
        purpose: "prove migrated store is ordinarily healthy",
      },
      configuration: configuration(initialized.storePath, sqliteBinary),
    });
    assert.equal(ordinaryRead.exitCode, 2);
    assert.equal(ordinaryRead.json.failure.code, "case.not_found_or_not_visible");

    const replay = await invoke(root, request);
    assert.equal(replay.exitCode, 0, replay.stderr);
    assert.deepEqual(replay.json.result, migrated.json.result);
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await exists(root), false);
  }
});

test("migration rejects mismatched source/target assets or protocol before snapshot/schema mutation and durably receipts each result", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l07-w02-assets-"));
  try {
    const scenarios = [
      ["source-asset", "expected_source_asset_mismatch", (request) => { request.expected.assets.schema_asset_sha256 = "0".repeat(64); }],
      ["target-asset", "migration_asset_mismatch", (request) => { request.migration.schema_asset_sha256 = "0".repeat(64); }],
      ["protocol", "expected_protocol_mismatch", (request) => { request.target.protocol.version = 2; }],
    ];
    for (const [label, expectedCode, mutate] of scenarios) {
      const initialized = await initializedStore(root, sqliteBinary, label);
      const request = await migrationRequest(root, sqliteBinary, initialized, label);
      mutate(request);
      const rejected = await invoke(root, request);
      assert.equal(rejected.exitCode, 0, `${label}: ${rejected.stderr}`);
      assert.equal(rejected.json.result.terminal.outcome, "rejected", label);
      assert.equal(rejected.json.result.terminal.code, expectedCode, label);
      assert.equal(rejected.json.result.terminal.canonical_state_effect, "none", label);
      assert.equal(await exists(request.snapshot.path), false, label);
      assert.deepEqual(await row(sqliteBinary, initialized.storePath, `
        SELECT
          (SELECT user_version FROM pragma_user_version) AS schema_version,
          (SELECT count(*) FROM schema_migrations) AS migrations,
          (SELECT count(*) FROM store_operation_receipts WHERE operation_kind = 'migration') AS migration_receipts,
          (SELECT operation_fence FROM store_fence) AS operation_fence;
      `), { schema_version: 1, migrations: 1, migration_receipts: 1, operation_fence: 2 }, label);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await exists(root), false);
  }
});

test("a controlled transactional migration fault retains the verified snapshot and prior healthy schema", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l07-w02-fault-"));
  try {
    const initialized = await initializedStore(root, sqliteBinary, "fault");
    const request = await migrationRequest(root, sqliteBinary, initialized, "fault");
    const failed = await invoke(root, request, { CASEBOOK_PERSISTENCE_TEST_FAULT: "migration_after_apply_before_commit" });
    assert.equal(failed.exitCode, 0, failed.stderr);
    assert.equal(failed.json.result.terminal.outcome, "failed");
    assert.equal(failed.json.result.terminal.code, "migration_execution_failed_prior_health_retained");
    assert.equal(failed.json.result.terminal.canonical_state_effect, "none");
    assert.equal(failed.json.result.recovery.disposition, "prior_health_retained");
    assert.equal(failed.json.result.snapshot.verified, true);
    assert.equal(await exists(request.snapshot.path), true);
    const retainedSnapshot = await readFile(request.snapshot.path);
    assert.equal(createHash("sha256").update(retainedSnapshot).digest("hex"), failed.json.result.snapshot.sha256);
    assert.equal(retainedSnapshot.length, failed.json.result.snapshot.size_bytes);
    assert.deepEqual(await row(sqliteBinary, initialized.storePath, `
      SELECT
        (SELECT user_version FROM pragma_user_version) AS schema_version,
        (SELECT schema_version FROM store_metadata) AS metadata_version,
        (SELECT count(*) FROM schema_migrations) AS migrations,
        (SELECT operation_fence FROM store_fence) AS operation_fence,
        (SELECT count(*) FROM pragma_foreign_key_check) AS foreign_key_violations;
    `), { schema_version: 1, metadata_version: 1, migrations: 1, operation_fence: 2, foreign_key_violations: 0 });
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await exists(root), false);
  }
});

test("sandbox-generated Pi, Codex, and OpenCode packages execute and clean the verified migration", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l07-w02-generated-"));
  try {
    const sandbox = await generateAndValidateSandbox({ sandboxRoot: root, sqliteBinary });
    for (const generated of sandbox.results) {
      const generatedEntrypoint = path.join(generated.package_root, "variants/sqlite/bin/casebook-persistence.mjs");
      const initialized = await initializedStore(root, sqliteBinary, `generated-${generated.target}`, generatedEntrypoint);
      const request = await migrationRequest(root, sqliteBinary, initialized, `generated-${generated.target}`);
      const migrated = await invoke(root, request, {}, generatedEntrypoint);
      assert.equal(migrated.exitCode, 0, `${generated.target}: ${migrated.stderr}`);
      assert.equal(migrated.json.result.terminal.outcome, "migrated", generated.target);
      assert.equal(migrated.json.result.postconditions.healthy_exposure, true, generated.target);
      assert.equal(await exists(request.snapshot.path), false, `${generated.target} snapshot cleanup`);
      assert.equal((await row(sqliteBinary, initialized.storePath, "SELECT user_version AS schema_version FROM pragma_user_version;")).schema_version, 2);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await exists(root), false);
  }
});
