import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  cleanupSandbox,
  generateAndValidateSandbox,
  selectCompatibleSqliteBinary,
} from "./sandbox-harness.mjs";

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceEntrypoint = path.join(packageRoot, "variants/sqlite/bin/casebook-persistence.mjs");
const fixtures = path.join(packageRoot, "tests/fixtures");
const protocol = { id: "casebook-persistence-json", version: 1 };
const authorityClaim = {
  human_authorized: true,
  acting_role: "architect",
  authority_basis: "explicit synthetic L01-W02 test authorization",
};

function execFileWithInput(file, args, options, input) {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
    child.stdin.end(input);
  });
}

async function invoke(entrypoint, cwd, request) {
  try {
    const { stdout, stderr } = await execFileWithInput(process.execPath, [entrypoint], {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? "", HOME: cwd },
    }, `${JSON.stringify(request)}\n`);
    return { exitCode: 0, stdout, stderr, json: JSON.parse(stdout) };
  } catch (error) {
    const stdout = error.stdout ?? "";
    return {
      exitCode: error.code,
      stdout,
      stderr: error.stderr ?? "",
      json: stdout ? JSON.parse(stdout) : {},
    };
  }
}

function configuration(storePath, sqliteBinary) {
  return {
    source: { kind: "synthetic-test", locator: "w02-disposable" },
    authority_mode: "sqlite",
    sqlite: { database_url: storePath, sqlite_bin: sqliteBinary },
  };
}

function initializeRequest(storePath, sqliteBinary, operationId = "operation:w02-initialize") {
  return {
    protocol,
    operation: "initialize_store",
    operation_id: operationId,
    authority_claim: authorityClaim,
    configuration: configuration(storePath, sqliteBinary),
  };
}

function lookupRequest(storePath, sqliteBinary, initialized, operationId) {
  return {
    protocol,
    operation: "get_store_operation_receipt",
    operation_id: operationId,
    store_id: initialized.store_id,
    authority_claim: authorityClaim,
    context: {
      view_id: initialized.view.id,
      view_policy_revision_id: initialized.view.policy_revision_id,
      purpose: "uncertain initialization recovery",
    },
    configuration: configuration(storePath, sqliteBinary),
  };
}

async function makeRoot(label) {
  return mkdtemp(path.join(os.tmpdir(), `casebook-persistence-${label}-`));
}

async function removeAndVerify(root) {
  await rm(root, { recursive: true, force: true });
  assert.equal(await stat(root).then(() => true).catch(() => false), false);
}

function fileDigest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertOpaqueUnavailable(response, expectedCode, expectedFailureClass = "store_unavailable") {
  assert.equal(response.json.result.status, "store_unavailable");
  assert.deepEqual(Object.keys(response.json.result).sort(), [
    "code",
    "failure_class",
    "retry_disposition",
    "status",
  ]);
  assert.equal(response.json.result.code, expectedCode);
  assert.equal(response.json.result.failure_class, expectedFailureClass);
  assert.equal(response.json.result.retry_disposition, "after_operator_repair");
  const encoded = JSON.stringify(response.json.result);
  for (const forbidden of [
    "evidence",
    "components",
    "namespace_id",
    "view_id",
    "view_policy_revision_id",
    "operation_id",
    "store_id",
    "store_path",
  ]) {
    assert.equal(encoded.includes(forbidden), false, `unavailable union leaked ${forbidden}`);
  }
}

async function applyFixture(sqliteBinary, fixtureName, storePath) {
  await execFileWithInput(sqliteBinary, [storePath], {
    encoding: "utf8",
  }, await readFile(path.join(fixtures, fixtureName), "utf8"));
}

test("initialize_store requires a human authority claim and an absolute configured path", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await makeRoot("w02-authority");
  try {
    const storePath = path.join(root, "authority.sqlite3");
    const missingAuthority = initializeRequest(storePath, sqliteBinary);
    delete missingAuthority.authority_claim;
    const rejected = await invoke(sourceEntrypoint, root, missingAuthority);
    assert.equal(rejected.exitCode, 2);
    assert.equal(rejected.json.failure.class, "authority_required");
    assert.equal(rejected.json.failure.code, "human_authority_claim_required");
    assert.equal(await stat(storePath).then(() => true).catch(() => false), false);

    const relative = initializeRequest("relative.sqlite3", sqliteBinary, "operation:w02-relative");
    const relativeRejected = await invoke(sourceEntrypoint, root, relative);
    assert.equal(relativeRejected.exitCode, 2);
    assert.equal(relativeRejected.json.failure.code, "relative_path_rejected");
    assert.equal(await stat(path.join(root, "relative.sqlite3")).then(() => true).catch(() => false), false);
  } finally {
    await removeAndVerify(root);
  }
});

test("initialize_store atomically creates stable identity, private view, ledger, and durable repeat evidence", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await makeRoot("w02-repeat");
  try {
    const storePath = path.join(root, "store.sqlite3");
    const request = initializeRequest(storePath, sqliteBinary);
    const first = await invoke(sourceEntrypoint, root, request);
    assert.equal(first.exitCode, 0, first.stderr);
    assert.equal(first.json.ok, true);
    assert.equal(first.json.result.status, "settled");
    assert.match(first.json.result.initialization.store_id, /^store:[0-9a-f-]{36}$/);
    assert.equal(first.json.result.initialization.namespace.key, "personal");
    assert.equal(first.json.result.initialization.namespace.lifecycle, "active");
    assert.equal(first.json.result.initialization.view.lifecycle, "active");
    assert.equal(first.json.result.initialization.view.audience_ceiling, "private");
    assert.deepEqual(first.json.result.initialization.view.namespace_ids, [first.json.result.initialization.namespace.id]);
    assert.equal(first.json.result.initialization.schema.version, 1);
    assert.equal(first.json.result.initialization.schema.migration.id, "0001-initialize-store");
    assert.equal(first.json.result.receipt.operation_id, request.operation_id);

    const { stdout } = await execFileAsync(sqliteBinary, ["-json", storePath, `
      SELECT
        (SELECT count(*) FROM store_metadata) AS stores,
        (SELECT count(*) FROM namespaces WHERE lifecycle = 'active') AS active_namespaces,
        (SELECT count(*) FROM view_policy_revisions WHERE lifecycle = 'active' AND audience_ceiling = 'private') AS active_private_views,
        (SELECT count(*) FROM schema_migrations) AS migrations,
        (SELECT count(*) FROM store_operation_receipts WHERE operation_kind = 'initialize_store') AS receipts,
        (SELECT user_version FROM pragma_user_version) AS schema_version;
    `], { encoding: "utf8" });
    assert.deepEqual(JSON.parse(stdout)[0], {
      stores: 1,
      active_namespaces: 1,
      active_private_views: 1,
      migrations: 1,
      receipts: 1,
      schema_version: 1,
    });

    const repeated = await invoke(sourceEntrypoint, root, request);
    assert.equal(repeated.exitCode, 0, repeated.stderr);
    assert.deepEqual(repeated.json.result, first.json.result);

    const mismatched = structuredClone(request);
    mismatched.authority_claim.authority_basis = "different request under reused operation identity";
    const mismatchResult = await invoke(sourceEntrypoint, root, mismatched);
    assert.equal(mismatchResult.exitCode, 2);
    assert.equal(mismatchResult.json.failure.code, "idempotency_mismatch");
  } finally {
    await removeAndVerify(root);
  }
});

test("tampered, unactivated, and misbound active-policy grants fail closed without mutation", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const scenarios = [
    {
      label: "grant-on-unactivated-policy",
      sql: `
        INSERT INTO view_policy_revisions
        SELECT 'view-policy:tampered-created', view_id, 2, audience_ceiling, 'created',
          authority_claim_json, object_kinds_json, store_operation_receipts_visible,
          view_policy_revision_id, NULL, created_at
        FROM view_policy_revisions WHERE lifecycle = 'active';
        UPDATE view_policy_namespace_grants
          SET view_policy_revision_id = 'view-policy:tampered-created';
      `,
    },
    {
      label: "misbound-grant",
      sql: `
        INSERT INTO namespaces VALUES ('namespace:tampered-other', 'other', 'active', 'synthetic');
        UPDATE view_policy_namespace_grants SET namespace_id = 'namespace:tampered-other';
      `,
    },
    {
      label: "unactivated-active-policy",
      sql: "UPDATE view_policy_revisions SET lifecycle = 'created' WHERE lifecycle = 'active';",
    },
  ];

  for (const scenario of scenarios) {
    const root = await makeRoot(`w02-${scenario.label}`);
    try {
      const storePath = path.join(root, "store.sqlite3");
      const request = initializeRequest(storePath, sqliteBinary, `operation:w02-${scenario.label}`);
      const initialized = await invoke(sourceEntrypoint, root, request);
      assert.equal(initialized.exitCode, 0, initialized.stderr);
      await execFileWithInput(sqliteBinary, ["-batch", "-bail", storePath], { encoding: "utf8" }, scenario.sql);

      const before = fileDigest(await readFile(storePath));
      const rejected = await invoke(sourceEntrypoint, root, request);
      assert.equal(rejected.exitCode, 2, JSON.stringify(rejected.json));
      assert.equal(rejected.json.failure.code, "store_partial_initialization");
      assert.equal(fileDigest(await readFile(storePath)), before);
      assert.equal((await readdir(root)).some((name) => name.startsWith(".casebook-persistence-init-")), false);

      const lookup = await invoke(
        sourceEntrypoint,
        root,
        lookupRequest(
          storePath,
          sqliteBinary,
          initialized.json.result.initialization,
          request.operation_id,
        ),
      );
      assert.equal(lookup.exitCode, 0, lookup.stderr);
      assertOpaqueUnavailable(lookup, "store_partial_initialization");
      assert.equal(fileDigest(await readFile(storePath)), before);
    } finally {
      await removeAndVerify(root);
    }
  }
});

test("lost-response recovery queries the store receipt before retry and returns settled/absent/not-visible unions", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await makeRoot("w02-receipt");
  try {
    const storePath = path.join(root, "store.sqlite3");
    const initRequest = initializeRequest(storePath, sqliteBinary, "operation:w02-lost-response");
    const first = await invoke(sourceEntrypoint, root, initRequest);
    assert.equal(first.exitCode, 0, first.stderr);
    const initialized = first.json.result.initialization;

    const lookup = await invoke(
      sourceEntrypoint,
      root,
      lookupRequest(storePath, sqliteBinary, initialized, initRequest.operation_id),
    );
    assert.equal(lookup.exitCode, 0, lookup.stderr);
    assert.equal(lookup.json.result.status, "settled", JSON.stringify(lookup.json));
    assert.equal(lookup.json.result.receipt.operation_id, initRequest.operation_id);
    assert.deepEqual(lookup.json.result.receipt.result, first.json.result);

    const retryAfterLookup = await invoke(sourceEntrypoint, root, initRequest);
    assert.deepEqual(retryAfterLookup.json.result, first.json.result);

    const absentRequest = lookupRequest(storePath, sqliteBinary, initialized, "operation:w02-absent");
    const absent = await invoke(sourceEntrypoint, root, absentRequest);
    assert.equal(absent.json.result.status, "absent_at_fence");
    assert.equal(absent.json.result.operation_fence, 1);

    const hiddenRequest = lookupRequest(storePath, sqliteBinary, initialized, initRequest.operation_id);
    hiddenRequest.context.view_policy_revision_id = "view-policy:stale";
    const hidden = await invoke(sourceEntrypoint, root, hiddenRequest);
    assert.equal(hidden.json.result.status, "not_visible");
  } finally {
    await removeAndVerify(root);
  }
});

test("partial and incompatible fixtures fail closed without mutation or implicit migration", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  for (const [fixtureName, expectedCode] of [
    ["partial-store.sql", "store_partial_initialization"],
    ["incompatible-store.sql", "schema_migration_required"],
  ]) {
    const root = await makeRoot(`w02-${fixtureName.replace(".sql", "")}`);
    try {
      const storePath = path.join(root, "fixture.sqlite3");
      await applyFixture(sqliteBinary, fixtureName, storePath);
      const before = fileDigest(await readFile(storePath));
      const response = await invoke(
        sourceEntrypoint,
        root,
        initializeRequest(storePath, sqliteBinary, `operation:w02-${fixtureName}`),
      );
      assert.equal(response.exitCode, 2);
      assert.equal(response.json.failure.code, expectedCode);
      assert.equal(fileDigest(await readFile(storePath)), before);
      assert.equal((await readdir(root)).some((name) => name.startsWith(".casebook-persistence-init-")), false);

      if (fixtureName === "incompatible-store.sql") {
        const unavailableLookup = await invoke(sourceEntrypoint, root, {
          protocol,
          operation: "get_store_operation_receipt",
          operation_id: "operation:any",
          store_id: "store:any",
          authority_claim: authorityClaim,
          context: { view_id: "view:any", view_policy_revision_id: "view-policy:any", purpose: "ordinary read" },
          configuration: configuration(storePath, sqliteBinary),
        });
        assert.equal(unavailableLookup.exitCode, 0);
        assertOpaqueUnavailable(unavailableLookup, "schema_migration_required", "schema_migration_required");
        assert.equal(fileDigest(await readFile(storePath)), before);
      }
    } finally {
      await removeAndVerify(root);
    }
  }
});

test("integrity-unsafe fixture fails closed without repair, migration, mutation, or receipt-lookup leakage", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await makeRoot("w02-integrity-unsafe");
  try {
    const storePath = path.join(root, "integrity-unsafe.sqlite3");
    await applyFixture(sqliteBinary, "integrity-unsafe-store.sql", storePath);
    const before = fileDigest(await readFile(storePath));

    const initialization = await invoke(
      sourceEntrypoint,
      root,
      initializeRequest(storePath, sqliteBinary, "operation:w02-integrity-unsafe"),
    );
    assert.equal(initialization.exitCode, 2);
    assert.equal(initialization.json.failure.code, "schema_integrity_unsafe");
    assert.equal(fileDigest(await readFile(storePath)), before);

    const lookup = await invoke(sourceEntrypoint, root, {
      protocol,
      operation: "get_store_operation_receipt",
      operation_id: "operation:secret-integrity-probe",
      store_id: "store:unauthorized-probe",
      authority_claim: authorityClaim,
      context: {
        view_id: "view:unauthorized-probe",
        view_policy_revision_id: "view-policy:unauthorized-probe",
        purpose: "integrity recovery probe",
      },
      configuration: configuration(storePath, sqliteBinary),
    });
    assert.equal(lookup.exitCode, 0, lookup.stderr);
    assertOpaqueUnavailable(lookup, "schema_integrity_unsafe");
    assert.equal(JSON.stringify(lookup.json.result).includes(storePath), false);
    assert.equal(fileDigest(await readFile(storePath)), before);

    const { stdout } = await execFileAsync(sqliteBinary, ["-json", storePath, `
      SELECT
        (SELECT count(*) FROM pragma_foreign_key_check) AS foreign_key_violations,
        (SELECT count(*) FROM sqlite_schema WHERE name = 'schema_migrations') AS migration_tables,
        (SELECT count(*) FROM sqlite_schema WHERE name = 'store_metadata') AS metadata_tables,
        (SELECT user_version FROM pragma_user_version) AS user_version;
    `], { encoding: "utf8" });
    assert.deepEqual(JSON.parse(stdout)[0], {
      foreign_key_violations: 1,
      migration_tables: 0,
      metadata_tables: 0,
      user_version: 1,
    });
    assert.equal((await readdir(root)).some((name) => name.startsWith(".casebook-persistence-init-")), false);
  } finally {
    await removeAndVerify(root);
  }
});

test("receipt lookup and unsupported ordinary access do not implicitly initialize an absent store", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await makeRoot("w02-no-implicit-init");
  try {
    const storePath = path.join(root, "absent.sqlite3");
    const lookup = await invoke(sourceEntrypoint, root, {
      protocol,
      operation: "get_store_operation_receipt",
      operation_id: "operation:absent",
      store_id: "store:absent",
      authority_claim: authorityClaim,
      context: { view_id: "view:absent", view_policy_revision_id: "view-policy:absent", purpose: "ordinary read" },
      configuration: configuration(storePath, sqliteBinary),
    });
    assert.equal(lookup.exitCode, 0);
    assertOpaqueUnavailable(lookup, "store_unavailable");
    assert.equal(await stat(storePath).then(() => true).catch(() => false), false);

    const unsupported = await invoke(sourceEntrypoint, root, {
      protocol,
      operation: "case.stage_tombstone",
      configuration: configuration(storePath, sqliteBinary),
    });
    assert.equal(unsupported.exitCode, 2);
    assert.equal(unsupported.json.failure.code, "not_yet_implemented");
    assert.equal(await stat(storePath).then(() => true).catch(() => false), false);
  } finally {
    await removeAndVerify(root);
  }
});

test("generated Pi, Codex, and OpenCode copies initialize, recover receipts, and clean every disposable resource", async () => {
  const root = await makeRoot("w02-generated");
  try {
    const report = await generateAndValidateSandbox({ sandboxRoot: root });
    for (const generated of report.results) {
      const entrypoint = path.join(generated.package_root, "variants/sqlite/bin/casebook-persistence.mjs");
      const storePath = path.join(root, "synthetic-data", `${generated.target}-w02.sqlite3`);
      const request = initializeRequest(storePath, report.sqlite_binary, `operation:w02-generated-${generated.target}`);
      const initialized = await invoke(entrypoint, path.join(root, "unrelated-cwd"), request);
      assert.equal(initialized.exitCode, 0, `${generated.target}: ${initialized.stderr}`);
      assert.equal(initialized.json.result.status, "settled");
      const lookup = await invoke(
        entrypoint,
        path.join(root, "unrelated-cwd"),
        lookupRequest(storePath, report.sqlite_binary, initialized.json.result.initialization, request.operation_id),
      );
      assert.equal(lookup.json.result.status, "settled");
      assert.equal(initialized.json.result.initialization.package.content_digest, generated.content_digest);
    }
  } finally {
    assert.equal(await cleanupSandbox(root), true);
  }
  assert.equal(await stat(root).then(() => true).catch(() => false), false);
});
