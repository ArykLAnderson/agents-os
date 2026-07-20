import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { selectCompatibleSqliteBinary } from "./sandbox-harness.mjs";

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

async function invoke(cwd, request) {
  try {
    const { stdout, stderr } = await execFileWithInput(process.execPath, [entrypoint], {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? "", HOME: cwd },
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
    source: { kind: "synthetic-test", locator: "l07-w01-disposable" },
    authority_mode: "sqlite",
    sqlite: { database_url: storePath, sqlite_bin: sqliteBinary },
  };
}

const authorityClaim = {
  human_authorized: true,
  acting_role: "architect",
  authority_basis: "explicit disposable L07-W01 migration-envelope test",
  human_confirmation_reference: "test-confirmation:l07-w01",
};

function initializationRequest(storePath, sqliteBinary, operationId) {
  return {
    protocol,
    operation: "initialize_store",
    operation_id: operationId,
    authority_claim: {
      human_authorized: true,
      acting_role: authorityClaim.acting_role,
      authority_basis: authorityClaim.authority_basis,
    },
    configuration: configuration(storePath, sqliteBinary),
  };
}

function migrationRequest(storePath, sqliteBinary, initialization, operationId) {
  return {
    protocol,
    operation: "migrate_store",
    operation_id: operationId,
    operation_kind: "migration",
    purpose: "upgrade one named disposable test store",
    store_id: initialization.store_id,
    authority_claim: structuredClone(authorityClaim),
    expected: {
      store_id: initialization.store_id,
      schema: { id: "casebook-persistence-sqlite", version: 1 },
      operation_fence: 1,
    },
    target: {
      schema: { id: "casebook-persistence-sqlite", version: 2 },
    },
    migration: {
      id: "0002-synthetic-envelope-target",
      from_version: 1,
      to_version: 2,
      schema_asset_sha256: "a".repeat(64),
      manifest_sha256: "b".repeat(64),
    },
    canonical_state_effect: "schema-change",
    requested_postcondition_evidence: ["schema_identity", "integrity"],
    configuration: configuration(storePath, sqliteBinary),
  };
}

async function makeInitializedStore(root, sqliteBinary, label) {
  const storePath = path.join(root, `${label}.sqlite3`);
  const initialized = await invoke(root, initializationRequest(storePath, sqliteBinary, `operation:${label}:initialize`));
  assert.equal(initialized.exitCode, 0, initialized.stderr);
  return { storePath, initialization: initialized.json.result.initialization };
}

async function scalar(sqliteBinary, storePath, sql) {
  const { stdout } = await execFileWithInput(sqliteBinary, ["-batch", "-bail", "-json", storePath], {
    encoding: "utf8",
  }, sql);
  return JSON.parse(stdout)[0];
}

test("migrate_store envelope requires explicit human confirmation and exact named store preconditions without mutation", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l07-w01-authority-"));
  try {
    const { storePath, initialization } = await makeInitializedStore(root, sqliteBinary, "authority");
    const baseline = await scalar(sqliteBinary, storePath, "SELECT operation_fence, (SELECT count(*) FROM store_operation_receipts) AS receipts FROM store_fence;");

    const missingConfirmation = migrationRequest(storePath, sqliteBinary, initialization, "operation:migration:missing-confirmation");
    delete missingConfirmation.authority_claim.human_confirmation_reference;
    const authorityRejected = await invoke(root, missingConfirmation);
    assert.equal(authorityRejected.exitCode, 2);
    assert.equal(authorityRejected.json.failure.class, "authority_required");
    assert.equal(authorityRejected.json.failure.code, "human_confirmation_reference_required");

    const wrongStore = migrationRequest(storePath, sqliteBinary, initialization, "operation:migration:wrong-store");
    wrongStore.store_id = "store:00000000-0000-4000-8000-000000000000";
    wrongStore.expected.store_id = wrongStore.store_id;
    const storeRejected = await invoke(root, wrongStore);
    assert.equal(storeRejected.exitCode, 2);
    assert.equal(storeRejected.json.failure.class, "migration_precondition_failed");
    assert.equal(storeRejected.json.failure.code, "expected_store_mismatch");

    assert.deepEqual(
      await scalar(sqliteBinary, storePath, "SELECT operation_fence, (SELECT count(*) FROM store_operation_receipts) AS receipts FROM store_fence;"),
      baseline,
    );

    const wrongSchema = migrationRequest(storePath, sqliteBinary, initialization, "operation:migration:wrong-schema");
    wrongSchema.expected.schema.version = 9;
    wrongSchema.target.schema.version = 10;
    wrongSchema.migration.from_version = 9;
    wrongSchema.migration.to_version = 10;
    const schemaRejected = await invoke(root, wrongSchema);
    assert.equal(schemaRejected.exitCode, 0, schemaRejected.stderr);
    assert.deepEqual(schemaRejected.json.result.terminal, {
      outcome: "rejected",
      code: "expected_schema_mismatch",
      failure_class: "migration_precondition_failed",
      retry_disposition: "never",
      canonical_state_effect: "none",
    });
    assert.deepEqual(await scalar(sqliteBinary, storePath, `
      SELECT
        (SELECT user_version FROM pragma_user_version) AS schema_version,
        (SELECT count(*) FROM schema_migrations) AS migrations,
        (SELECT count(*) FROM store_operation_receipts WHERE operation_kind = 'migration') AS migration_receipts,
        (SELECT operation_fence FROM store_fence) AS operation_fence;
    `), { schema_version: 1, migrations: 1, migration_receipts: 1, operation_fence: 2 });
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await stat(root).then(() => true).catch(() => false), false);
  }
});

test("migrate_store envelope durably classifies the W02 execution boundary and exact replay", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l07-w01-settle-"));
  try {
    const { storePath, initialization } = await makeInitializedStore(root, sqliteBinary, "settle");
    const request = migrationRequest(storePath, sqliteBinary, initialization, "operation:migration:settle");
    const first = await invoke(root, request);
    assert.equal(first.exitCode, 0, first.stderr);
    assert.equal(first.json.result.status, "settled");
    assert.deepEqual(first.json.result.terminal, {
      outcome: "blocked",
      code: "migration_execution_not_available",
      failure_class: "operation_unsupported",
      retry_disposition: "never",
      canonical_state_effect: "none",
    });
    assert.equal(first.json.result.receipt.operation_kind, "migration");
    assert.equal(first.json.result.receipt.store_id, initialization.store_id);
    assert.equal(first.json.result.receipt.operation_fence, 2);
    assert.equal(first.json.result.preconditions.expected.schema.version, 1);
    assert.equal(first.json.result.preconditions.observed.schema.version, 1);
    assert.equal(first.json.result.preconditions.target.schema.version, 2);

    const replay = await invoke(root, request);
    assert.equal(replay.exitCode, 0, replay.stderr);
    assert.deepEqual(replay.json.result, first.json.result);

    const changedDigest = structuredClone(request);
    changedDigest.purpose = "different purpose under a reused operation identity";
    const mismatch = await invoke(root, changedDigest);
    assert.equal(mismatch.exitCode, 2);
    assert.equal(mismatch.json.failure.class, "idempotency_mismatch");
    assert.equal(mismatch.json.failure.code, "idempotency_mismatch");

    assert.deepEqual(await scalar(sqliteBinary, storePath, `
      SELECT
        (SELECT user_version FROM pragma_user_version) AS schema_version,
        (SELECT count(*) FROM schema_migrations) AS migrations,
        (SELECT count(*) FROM store_operation_receipts WHERE operation_kind = 'migration') AS migration_receipts,
        (SELECT operation_fence FROM store_fence) AS operation_fence;
    `), { schema_version: 1, migrations: 1, migration_receipts: 1, operation_fence: 2 });
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await stat(root).then(() => true).catch(() => false), false);
  }
});

test("concurrent exact migration-envelope retries converge on one durable receipt", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l07-w01-concurrent-"));
  try {
    const { storePath, initialization } = await makeInitializedStore(root, sqliteBinary, "concurrent");
    const request = migrationRequest(storePath, sqliteBinary, initialization, "operation:migration:concurrent");
    const responses = await Promise.all([
      invoke(root, structuredClone(request)),
      invoke(root, structuredClone(request)),
      invoke(root, structuredClone(request)),
    ]);
    for (const response of responses) assert.equal(response.exitCode, 0, response.stderr);
    assert.deepEqual(responses[1].json.result, responses[0].json.result);
    assert.deepEqual(responses[2].json.result, responses[0].json.result);
    assert.deepEqual(await scalar(sqliteBinary, storePath, `
      SELECT
        (SELECT count(*) FROM store_operation_receipts WHERE operation_id = 'operation:migration:concurrent') AS receipts,
        (SELECT operation_fence FROM store_fence) AS operation_fence;
    `), { receipts: 1, operation_fence: 2 });
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await stat(root).then(() => true).catch(() => false), false);
  }
});

test("migration receipts are lookup-visible only under the exact store and active view", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l07-w01-lookup-"));
  try {
    const one = await makeInitializedStore(root, sqliteBinary, "lookup-one");
    const two = await makeInitializedStore(root, sqliteBinary, "lookup-two");
    const operationId = "operation:migration:store-scoped";
    const oneSettled = await invoke(root, migrationRequest(one.storePath, sqliteBinary, one.initialization, operationId));
    const twoSettled = await invoke(root, migrationRequest(two.storePath, sqliteBinary, two.initialization, operationId));
    assert.equal(oneSettled.exitCode, 0, oneSettled.stderr);
    assert.equal(twoSettled.exitCode, 0, twoSettled.stderr);
    assert.notEqual(oneSettled.json.result.receipt.request_digest, twoSettled.json.result.receipt.request_digest);

    const lookup = await invoke(root, {
      protocol,
      operation: "get_store_operation_receipt",
      operation_id: operationId,
      store_id: one.initialization.store_id,
      authority_claim: authorityClaim,
      context: {
        view_id: one.initialization.view.id,
        view_policy_revision_id: one.initialization.view.policy_revision_id,
        purpose: "recover uncertain exceptional migration result",
      },
      configuration: configuration(one.storePath, sqliteBinary),
    });
    assert.equal(lookup.exitCode, 0, lookup.stderr);
    assert.equal(lookup.json.result.status, "settled");
    assert.equal(lookup.json.result.receipt.operation_kind, "migration");
    assert.deepEqual(lookup.json.result.receipt.result, oneSettled.json.result);

    const crossStore = structuredClone(lookup.json.result);
    assert.equal(crossStore.receipt.store_id, one.initialization.store_id);
    const hidden = await invoke(root, {
      protocol,
      operation: "get_store_operation_receipt",
      operation_id: operationId,
      store_id: two.initialization.store_id,
      authority_claim: authorityClaim,
      context: {
        view_id: one.initialization.view.id,
        view_policy_revision_id: one.initialization.view.policy_revision_id,
        purpose: "attempt cross-store lookup",
      },
      configuration: configuration(one.storePath, sqliteBinary),
    });
    assert.equal(hidden.json.result.status, "not_visible");
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await stat(root).then(() => true).catch(() => false), false);
  }
});

test("ordinary access reports migration required without invoking the exceptional envelope", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l07-w01-ordinary-"));
  try {
    const { storePath, initialization } = await makeInitializedStore(root, sqliteBinary, "ordinary");
    await execFileWithInput(sqliteBinary, ["-batch", "-bail", storePath], { encoding: "utf8" }, "PRAGMA user_version = 2;");
    const before = await readFile(storePath);
    const ordinary = await invoke(root, {
      protocol,
      operation: "case.read",
      request_version: 1,
      store_id: initialization.store_id,
      case_id: "case:00000000-0000-4000-8000-000000000000",
      context: {
        view_id: initialization.view.id,
        view_policy_revision_id: initialization.view.policy_revision_id,
        purpose: "ordinary read must not migrate",
      },
      configuration: configuration(storePath, sqliteBinary),
    });
    assert.equal(ordinary.exitCode, 2);
    assert.equal(ordinary.json.failure.code, "case.substrate_failure");
    assert.equal(ordinary.json.failure.class, "case.substrate_failure");
    assert.deepEqual(await readFile(storePath), before);
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await stat(root).then(() => true).catch(() => false), false);
  }
});
