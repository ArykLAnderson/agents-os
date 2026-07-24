import { createHash } from "node:crypto";
import { copyFile, link, lstat, mkdtemp, readFile, realpath, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROTOCOL_ID, PROTOCOL_VERSION, SCHEMA_ID, SCHEMA_VERSION } from "../../../../shared/protocol.mjs";
import { sqlite } from "./diagnostics.mjs";

export const APPLICATION_ID = 0x43425031; // "CBP1"
export const SUPPORTED_SCHEMA_VERSIONS = Object.freeze([3]);
const SQL_ASSET = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../sql/schema-v3.sql");
const MIGRATION_V3_ASSET = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../migrations/0003-namespace-foundation.sql");
const REQUIRED_TABLES = Object.freeze([
  "event_retention",
  "namespaces",
  "owner_current",
  "owner_family_bindings",
  "owner_events",
  "owner_outbox",
  "owner_placement_events",
  "owner_revision_selections",
  "owner_revisions",
  "owner_versions",
  "owners",
  "schema_migrations",
  "store_authority_binding",
  "store_fence",
  "store_metadata",
  "store_operation_receipts",
  "migration_archives",
]);

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function queryJson(binary, database, sqlTextValue, { readonly = true } = {}) {
  const args = ["-batch", "-bail", "-json", "-cmd", ".timeout 5000"];
  // query_only is WAL-aware and permits SQLite to maintain WAL shared-memory
  // bookkeeping while rejecting every SQL write through this connection.
  const query = readonly ? `PRAGMA query_only = ON;\n${sqlTextValue}` : sqlTextValue;
  const { stdout } = await sqlite(binary, database, query, { args, maxBuffer: 4 * 1024 * 1024 });
  const parsed = JSON.parse(stdout || "[]");
  return parsed;
}

function unavailable(code, evidence = {}) {
  return { status: "unavailable", code, evidence };
}

export async function storeExists(storePath) {
  return lstat(storePath).then((entry) => entry.isFile()).catch(() => false);
}

export async function bindStoreAuthorityIfAuthorized(binary, storePath, configuration, request) {
  if (request?.authority_claim?.human_authorized !== true
    || typeof request.operation_id !== "string" || !request.operation_id.trim()
    || typeof request.store_id !== "string") return false;
  let rows;
  try {
    rows = await queryJson(binary, storePath, `
      SELECT m.store_id,m.schema_id,m.schema_version,m.protocol_id,m.protocol_version,
        (SELECT application_id FROM pragma_application_id) AS application_id,
        (SELECT user_version FROM pragma_user_version) AS user_version,
        (SELECT json_group_array(name) FROM (SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name)) AS tables
      FROM store_metadata m WHERE singleton=1;
    `);
  } catch {
    return false;
  }
  const observed = rows[0];
  const tableValues = typeof observed?.tables === "string" ? JSON.parse(observed.tables) : observed?.tables;
  const tables = new Set(tableValues ?? []);
  const requiredBeforeBinding = REQUIRED_TABLES.filter((table) => table !== "store_authority_binding");
  if (rows.length !== 1 || observed.store_id !== request.store_id
    || observed.schema_id !== SCHEMA_ID || !SUPPORTED_SCHEMA_VERSIONS.includes(observed.schema_version)
    || observed.protocol_id !== PROTOCOL_ID || observed.protocol_version !== PROTOCOL_VERSION
    || observed.application_id !== APPLICATION_ID || observed.user_version !== observed.schema_version
    || requiredBeforeBinding.some((table) => !tables.has(table))) return false;
  if (tables.has("store_authority_binding")) {
    const count = await queryJson(binary, storePath, "SELECT count(*) AS binding_count FROM store_authority_binding;").catch(() => []);
    if (count[0]?.binding_count !== 0) return false;
  }
  const now = new Date().toISOString();
  try {
    await sqlite(binary, storePath, `.bail on\nPRAGMA foreign_keys=ON;\nPRAGMA busy_timeout=5000;\nBEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS store_authority_binding (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        store_id TEXT NOT NULL UNIQUE REFERENCES store_metadata(store_id),
        source_kind TEXT NOT NULL,
        source_locator TEXT NOT NULL,
        authority_mode TEXT NOT NULL CHECK (authority_mode = 'sqlite'),
        bound_at TEXT NOT NULL,
        binding_operation_id TEXT NOT NULL
      ) STRICT;
      CREATE TRIGGER IF NOT EXISTS store_authority_binding_immutable_update
      BEFORE UPDATE ON store_authority_binding
      BEGIN SELECT RAISE(ABORT, 'store authority binding is immutable; switching requires migration'); END;
      CREATE TRIGGER IF NOT EXISTS store_authority_binding_immutable_delete
      BEFORE DELETE ON store_authority_binding
      BEGIN SELECT RAISE(ABORT, 'store authority binding is immutable; switching requires migration'); END;
      INSERT INTO store_authority_binding(singleton,store_id,source_kind,source_locator,authority_mode,bound_at,binding_operation_id)
      SELECT 1,${sqlText(request.store_id)},${sqlText(configuration.source.kind)},${sqlText(configuration.source.locator)},'sqlite',${sqlText(now)},${sqlText(request.operation_id)}
      WHERE NOT EXISTS(SELECT 1 FROM store_authority_binding);
      COMMIT;`, { args: ["-batch", "-bail"], timeout: 20_000, maxBuffer: 4 * 1024 * 1024 });
  } catch {
    return false;
  }
  return true;
}

async function inspectV3Store(binary, storePath) {
  try {
    const rows = await queryJson(binary, storePath, `
      SELECT json_object(
        'metadata', (SELECT json_object('store_id',store_id,'schema_id',schema_id,'schema_version',schema_version,'protocol_id',protocol_id,'protocol_version',protocol_version,'initialized_at',initialized_at,'initialization_operation_id',initialization_operation_id) FROM store_metadata WHERE singleton=1),
        'authority_binding', (SELECT json_object('store_id',store_id,'source_kind',source_kind,'source_locator',source_locator,'authority_mode',authority_mode,'bound_at',bound_at,'binding_operation_id',binding_operation_id) FROM store_authority_binding WHERE singleton=1),
        'namespace', (SELECT json_object('namespace_id',namespace_id,'namespace_key',namespace_key,'lifecycle',lifecycle) FROM namespaces ORDER BY namespace_id LIMIT 1),
        'operation_fence', (SELECT operation_fence FROM store_fence WHERE singleton=1),
        'migration_count', (SELECT count(*) FROM schema_migrations),
        'latest_migration', (SELECT json_object('migration_id',migration_id,'schema_id',schema_id,'from_version',from_version,'to_version',to_version,'schema_asset_digest',schema_asset_digest,'migration_manifest_digest',migration_manifest_digest,'operation_id',operation_id) FROM schema_migrations ORDER BY to_version DESC LIMIT 1)
      ) AS inspection_json;`);
    const detail = JSON.parse(rows[0]?.inspection_json ?? "{}");
    for (const key of ["metadata", "authority_binding", "namespace", "latest_migration"]) {
      if (typeof detail[key] === "string") detail[key] = JSON.parse(detail[key]);
    }
    const complete = detail.metadata?.schema_id === SCHEMA_ID && detail.metadata?.schema_version === 3
      && detail.metadata?.protocol_id === PROTOCOL_ID && detail.metadata?.protocol_version === PROTOCOL_VERSION
      && detail.authority_binding?.store_id === detail.metadata?.store_id && detail.namespace
      && Number.isInteger(detail.operation_fence) && detail.operation_fence >= 1
      && detail.migration_count >= 1
      && (detail.latest_migration?.migration_id === "0003-namespace-foundation"
        || detail.latest_migration?.migration_id === "0001-initialize-store");
    if (!complete) return unavailable("store_partial_initialization", { components: detail });
    return { status: "available", metadata: detail.metadata, authority_binding: detail.authority_binding,
      namespace: detail.namespace, views: [], operation_fence: detail.operation_fence,
      migrations: { initial: null, latest: detail.latest_migration, count: detail.migration_count },
      integrity: { quick_check: "ok", foreign_key_violations: 0 } };
  } catch {
    return unavailable("store_partial_initialization", { components_readable: false });
  }
}

async function inspectV1MigrationSource(binary, storePath) {
  try {
    const rows = await queryJson(binary, storePath, `
      SELECT json_object(
        'metadata', (SELECT json_object('store_id',store_id,'schema_id',schema_id,'schema_version',schema_version,'protocol_id',protocol_id,'protocol_version',protocol_version,'initialized_at',initialized_at,'initialization_operation_id',initialization_operation_id) FROM store_metadata WHERE singleton=1),
        'authority_binding', (SELECT json_object('store_id',store_id,'source_kind',source_kind,'source_locator',source_locator,'authority_mode',authority_mode,'bound_at',bound_at,'binding_operation_id',binding_operation_id) FROM store_authority_binding WHERE singleton=1),
        'operation_fence', (SELECT operation_fence FROM store_fence WHERE singleton=1),
        'migration_count', (SELECT count(*) FROM schema_migrations),
        'initial_migration', (SELECT json_object('migration_id',migration_id,'schema_id',schema_id,'from_version',from_version,'to_version',to_version,'schema_asset_digest',schema_asset_digest,'migration_manifest_digest',migration_manifest_digest,'operation_id',operation_id) FROM schema_migrations ORDER BY to_version LIMIT 1),
        'receipt_count', (SELECT count(*) FROM store_operation_receipts),
        'event_retention_count', (SELECT count(*) FROM event_retention WHERE singleton=1),
        'retained_after_sequence', (SELECT retained_after_sequence FROM event_retention WHERE singleton=1)
      ) AS inspection_json;`);
    const detail = JSON.parse(rows[0]?.inspection_json ?? "{}");
    for (const key of ["metadata", "authority_binding", "initial_migration"]) {
      if (typeof detail[key] === "string") detail[key] = JSON.parse(detail[key]);
    }
    const complete = detail.metadata?.schema_id === SCHEMA_ID && detail.metadata?.schema_version === 1
      && detail.metadata?.protocol_id === PROTOCOL_ID && detail.metadata?.protocol_version === PROTOCOL_VERSION
      && detail.metadata.store_id?.startsWith("store:")
      && detail.authority_binding?.store_id === detail.metadata.store_id
      && detail.authority_binding?.authority_mode === "sqlite"
      && detail.migration_count === 1 && detail.initial_migration?.migration_id === "0001-initialize-store"
      && detail.initial_migration?.from_version === 0 && detail.initial_migration?.to_version === 1
      && detail.initial_migration?.operation_id === detail.metadata.initialization_operation_id
      && detail.receipt_count >= 1 && Number.isInteger(detail.operation_fence) && detail.operation_fence >= 1
      && detail.event_retention_count === 1 && Number.isInteger(detail.retained_after_sequence) && detail.retained_after_sequence >= 0;
    if (!complete) return unavailable("store_partial_initialization", { components: detail });
    return {
      status: "available", metadata: detail.metadata, authority_binding: detail.authority_binding,
      namespace: null, views: [], operation_fence: detail.operation_fence,
      migrations: { initial: detail.initial_migration, latest: detail.initial_migration, count: detail.migration_count },
      integrity: { quick_check: "ok", foreign_key_violations: 0 },
    };
  } catch {
    return unavailable("store_partial_initialization", { components_readable: false });
  }
}

export async function inspectStore(binary, storePath, { allowMigrationSource = false } = {}) {
  let entry;
  try {
    entry = await lstat(storePath);
  } catch (error) {
    return error?.code === "ENOENT"
      ? { status: "absent", code: "store_unavailable", evidence: { store_present: false } }
      : unavailable("store_unavailable", { store_present: "unknown" });
  }
  if (!entry.isFile()) return unavailable("store_unavailable", { store_present: true, regular_file: false });

  let header;
  try {
    const rows = await queryJson(binary, storePath, `
      SELECT json_object(
        'application_id', (SELECT application_id FROM pragma_application_id),
        'user_version', (SELECT user_version FROM pragma_user_version),
        'quick_check', (SELECT quick_check FROM pragma_quick_check),
        'foreign_key_violations', (SELECT count(*) FROM pragma_foreign_key_check),
        'tables', (SELECT json_group_array(name) FROM (SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name))
      ) AS inspection_json;
    `);
    header = JSON.parse(rows[0]?.inspection_json ?? "{}");
  } catch {
    return unavailable("store_unavailable", { store_present: true, readable: false });
  }

  if (header.quick_check !== "ok" || header.foreign_key_violations !== 0) {
    return unavailable("schema_integrity_unsafe", {
      integrity: header.quick_check ?? "unknown",
      foreign_key_violations: header.foreign_key_violations ?? "unknown",
    });
  }
  const legacyMigrationSource = allowMigrationSource && header.user_version === 1;
  if ((!SUPPORTED_SCHEMA_VERSIONS.includes(header.user_version) && !legacyMigrationSource) || header.application_id !== APPLICATION_ID) {
    return {
      status: "migration_required",
      code: "schema_migration_required",
      evidence: {
        expected: { schema_id: SCHEMA_ID, compatible_schema_versions: SUPPORTED_SCHEMA_VERSIONS, application_id: APPLICATION_ID },
        observed: { schema_version: header.user_version ?? null, application_id: header.application_id ?? null },
      },
    };
  }

  const tables = new Set(header.tables ?? []);
  const requiredTables = header.user_version === 1
    ? ["store_metadata", "store_authority_binding", "store_fence", "store_operation_receipts", "schema_migrations", "event_retention"]
    : REQUIRED_TABLES;
  const missingTables = requiredTables.filter((table) => !tables.has(table));
  if (missingTables.length) {
    return unavailable("store_partial_initialization", { missing_components: missingTables });
  }
  if (header.user_version === 3) return inspectV3Store(binary, storePath);
  if (header.user_version === 1) return inspectV1MigrationSource(binary, storePath);
  return unavailable("store_partial_initialization", { components_readable: false });
}

export async function readStoreOperationReceipt(binary, storePath, operationId) {
  const rows = await queryJson(binary, storePath, `
    SELECT operation_id, operation_kind, store_id, request_digest, outcome,
      result_json, result_digest, authority_claim_json, settled_at,
      failure_class, retry_disposition, operation_fence, owner_id, owner_kind,
      owner_home_namespace_id, expected_revision, observed_revision,
      committed_revision, event_id
    FROM store_operation_receipts
    WHERE operation_id = ${sqlText(operationId)}
    LIMIT 1;
  `);
  if (!rows.length) return null;
  const row = rows[0];
  return {
    operation_id: row.operation_id,
    operation_kind: row.operation_kind,
    store_id: row.store_id,
    request_digest: row.request_digest,
    outcome: row.outcome,
    result: JSON.parse(row.result_json),
    result_digest: row.result_digest,
    authority_claim: JSON.parse(row.authority_claim_json),
    settled_at: row.settled_at,
    failure_class: row.failure_class ?? null,
    retry_disposition: row.retry_disposition,
    operation_fence: row.operation_fence,
    owner_id: row.owner_id ?? null,
    owner_kind: row.owner_kind ?? null,
    owner_home_namespace_id: row.owner_home_namespace_id ?? null,
    expected_revision: row.expected_revision ?? null,
    observed_revision: row.observed_revision ?? null,
    committed_revision: row.committed_revision ?? null,
    event_id: row.event_id ?? null,
  };
}

export async function settleStoreOperationReceipt(binary, storePath, settlement) {
  const { receipt, authorityClaim, result, expectedOperationFence } = settlement;
  const nextFence = expectedOperationFence + 1;
  const command = `.bail on
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    BEGIN IMMEDIATE;
    INSERT INTO store_operation_receipts (
      operation_id, operation_kind, store_id, request_digest, outcome,
      result_json, result_digest, authority_claim_json, settled_at,
      failure_class, retry_disposition, operation_fence
    )
    SELECT
      ${sqlText(receipt.operation_id)}, ${sqlText(receipt.operation_kind)}, ${sqlText(receipt.store_id)},
      ${sqlText(receipt.request_digest)}, ${sqlText(receipt.outcome)}, ${sqlText(JSON.stringify(result))},
      ${sqlText(receipt.result_digest)}, ${sqlText(JSON.stringify(authorityClaim))}, ${sqlText(receipt.settled_at)},
      ${receipt.failure_class == null ? "NULL" : sqlText(receipt.failure_class)}, ${sqlText(receipt.retry_disposition)},
      ${nextFence}
    FROM store_fence
    WHERE singleton = 1 AND operation_fence = ${expectedOperationFence};
    UPDATE store_fence
      SET operation_fence = ${nextFence}
      WHERE singleton = 1
        AND operation_fence = ${expectedOperationFence}
        AND EXISTS (
          SELECT 1 FROM store_operation_receipts
          WHERE operation_id = ${sqlText(receipt.operation_id)} AND operation_fence = ${nextFence}
        );
    COMMIT;
  `;
  await sqlite(binary, storePath, command, {
    args: ["-batch", "-bail"],
    timeout: 20_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return readStoreOperationReceipt(binary, storePath, receipt.operation_id);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function verifiedSnapshotResult(snapshotPath, bytes, info, inspected) {
  return {
    path: snapshotPath,
    sha256: sha256(bytes),
    size_bytes: info.size,
    verified: true,
    method: "sqlite_vacuum_into",
    source: {
      store_id: inspected.metadata.store_id,
      schema: { id: inspected.metadata.schema_id, version: inspected.metadata.schema_version },
      protocol: { id: inspected.metadata.protocol_id, version: inspected.metadata.protocol_version },
      operation_fence: inspected.operation_fence,
    },
  };
}

export async function verifyExactStoreSnapshot(binary, snapshotPath, expected) {
  const inspected = await inspectStore(binary, snapshotPath, { allowMigrationSource: [1, 2].includes(expected.schema?.version) });
  if (inspected.status !== "available"
    || inspected.metadata.store_id !== expected.store_id
    || inspected.metadata.schema_id !== expected.schema.id
    || inspected.metadata.schema_version !== expected.schema.version
    || inspected.metadata.protocol_id !== expected.protocol.id
    || inspected.metadata.protocol_version !== expected.protocol.version
    || inspected.operation_fence !== expected.operation_fence) {
    throw Object.assign(new Error("snapshot verification did not reproduce exact source conditions"), {
      code: "snapshot_verification_failed",
      evidence: { status: inspected.status, metadata: inspected.metadata ?? null, operation_fence: inspected.operation_fence ?? null },
    });
  }
  const [bytes, info] = await Promise.all([readFile(snapshotPath), stat(snapshotPath)]);
  if (!info.isFile() || info.size < 1) {
    throw Object.assign(new Error("snapshot target is not a non-empty regular file"), { code: "snapshot_verification_failed" });
  }
  return verifiedSnapshotResult(snapshotPath, bytes, info, inspected);
}

export async function createVerifiedStoreSnapshot(binary, storePath, snapshotPath, expected) {
  const snapshotParent = await realpath(path.dirname(snapshotPath));
  if (await lstat(snapshotPath).then(() => true).catch(() => false)) {
    throw Object.assign(new Error("snapshot target already exists"), { code: "snapshot_target_exists" });
  }
  if (snapshotParent !== await realpath(path.dirname(snapshotPath))) {
    throw Object.assign(new Error("snapshot parent changed during resolution"), { code: "snapshot_parent_changed" });
  }
  await sqlite(binary, storePath, `.bail on\nPRAGMA busy_timeout = 5000;\nVACUUM INTO ${sqlText(snapshotPath)};`, {
    args: ["-batch", "-bail"],
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return verifyExactStoreSnapshot(binary, snapshotPath, expected);
}

export async function createVerifiedMigrationSnapshot(binary, storePath, snapshotPath, expected) {
  return createVerifiedStoreSnapshot(binary, storePath, snapshotPath, expected);
}

export async function applyMigrationV3(binary, storePath, application) {
  const asset = await readFile(MIGRATION_V3_ASSET, "utf8");
  const { receipt, authorityClaim, result, expectedOperationFence, migration, snapshot } = application;
  const nextFence = expectedOperationFence + 1;
  await sqlite(binary, storePath, `.bail on
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = OFF;
    BEGIN IMMEDIATE;
    CREATE TEMP TABLE migration_precondition_guard (valid INTEGER NOT NULL CHECK (valid = 1));
    INSERT INTO migration_precondition_guard(valid)
      SELECT CASE WHEN operation_fence = ${expectedOperationFence} THEN 1 ELSE 0 END
      FROM store_fence WHERE singleton = 1;
    ${asset.replace("DROP TRIGGER store_metadata_immutable_update;", "DROP TRIGGER store_metadata_immutable_update;\nDROP TRIGGER store_operation_receipts_immutable_update;\nDROP TRIGGER store_operation_receipts_immutable_delete;")}
    ${process.env.CASEBOOK_PERSISTENCE_TEST_FAULT === "migration_kill_executor_after_apply_before_commit" ? ".shell kill -9 $PPID" : ""}
    DELETE FROM migration_precondition_guard;
    INSERT INTO migration_precondition_guard(valid)
      SELECT CASE WHEN
        (SELECT count(*) FROM pragma_quick_check WHERE quick_check <> 'ok') = 0
        AND (SELECT count(*) FROM pragma_foreign_key_check) = 0
        AND (SELECT schema_version FROM store_metadata WHERE singleton = 1) = 3
        THEN 1 ELSE 0 END;
    INSERT INTO store_operation_receipts (operation_id,operation_kind,store_id,request_digest,outcome,result_json,result_digest,authority_claim_json,settled_at,failure_class,retry_disposition,operation_fence,snapshot_sha256,snapshot_size_bytes)
    VALUES (${sqlText(receipt.operation_id)},'migration',${sqlText(receipt.store_id)},${sqlText(receipt.request_digest)},'migrated',${sqlText(JSON.stringify(result))},${sqlText(receipt.result_digest)},${sqlText(JSON.stringify(authorityClaim))},${sqlText(receipt.settled_at)},NULL,'never',${nextFence},${sqlText(snapshot.sha256)},${snapshot.size_bytes});
    INSERT INTO schema_migrations VALUES (${sqlText(migration.id)},${sqlText(SCHEMA_ID)},1,3,${sqlText(migration.schema_asset_sha256)},${sqlText(migration.manifest_sha256)},${sqlText(receipt.operation_id)},${sqlText(receipt.settled_at)});
    UPDATE store_fence SET operation_fence=${nextFence} WHERE singleton=1 AND operation_fence=${expectedOperationFence};
    PRAGMA user_version = 3;
    DROP TABLE migration_precondition_guard;
    COMMIT;
    PRAGMA foreign_keys = ON;`, { args: ["-batch", "-bail"], timeout: 30_000, maxBuffer: 4 * 1024 * 1024 });
  return { committed: true };
}

export async function restoreVerifiedMigrationSnapshot(binary, storePath, snapshotPath, operationId) {
  const token = sha256(Buffer.from(operationId)).slice(0, 16);
  const restorePath = `${storePath}.restore-${token}`;
  const quarantinePath = `${storePath}.quarantine-${token}`;
  await rm(restorePath, { force: true });
  try {
    await copyFile(snapshotPath, restorePath);
    const candidate = await inspectStore(binary, restorePath, { allowMigrationSource: true });
    if (candidate.status !== "available") throw Object.assign(new Error("restore candidate is not healthy"), { code: "restore_candidate_unhealthy" });
    await rm(quarantinePath, { force: true });
    await rename(storePath, quarantinePath);
    if (process.env.CASEBOOK_PERSISTENCE_TEST_FAULT === "migration_restore_fail_after_quarantine") {
      throw Object.assign(new Error("controlled restore failure after quarantine"), { code: "restore_after_quarantine_fault" });
    }
    await rename(restorePath, storePath);
    await rm(`${storePath}-wal`, { force: true });
    await rm(`${storePath}-shm`, { force: true });
    const restored = await inspectStore(binary, storePath, { allowMigrationSource: true });
    if (restored.status !== "available") throw Object.assign(new Error("restored store is not healthy"), { code: "restored_store_unhealthy" });
    await rm(quarantinePath, { force: true });
    return { disposition: "prior_health_restored", restored, quarantine_path: null };
  } catch (error) {
    await rm(restorePath, { force: true });
    if (await lstat(storePath).then(() => true).catch(() => false)) {
      await rm(quarantinePath, { force: true });
      await rename(storePath, quarantinePath).catch(() => {});
    }
    return { disposition: "quarantined_unavailable", restored: null, quarantine_path: quarantinePath, error_code: error?.code ?? "restore_failed" };
  }
}

// Private façade-to-substrate dispatch. Dynamic loading avoids making the
// owner-neutral store module depend on either typed owner façade.
export async function invokeSubstrateOperation(request) {
  const { invokeMechanicalOperation } = await import("./mechanical.mjs");
  return invokeMechanicalOperation(request);
}

export async function createInitializedStore(binary, storePath, initialization) {
  const parent = await realpath(path.dirname(storePath));
  const temporaryDirectory = await mkdtemp(path.join(parent, ".casebook-persistence-init-"));
  const temporaryStore = path.join(temporaryDirectory, "store.sqlite3");
  try {
    const schema = await readFile(SQL_ASSET, "utf8");
    const { identities, receipt, migration, authorityClaim, authorityBinding, initializedAt } = initialization;
    const command = `.bail on\nPRAGMA busy_timeout = 5000;\nPRAGMA journal_mode = WAL;\nPRAGMA application_id = ${APPLICATION_ID};\nBEGIN IMMEDIATE;\n${schema}\n
      INSERT INTO store_metadata VALUES (
        1, ${sqlText(identities.storeId)}, ${sqlText(SCHEMA_ID)}, ${SCHEMA_VERSION},
        ${sqlText(initialization.protocol.id)}, ${initialization.protocol.version},
        ${sqlText(initializedAt)}, ${sqlText(receipt.operation_id)}
      );
      INSERT INTO store_authority_binding VALUES (
        1, ${sqlText(identities.storeId)}, ${sqlText(authorityBinding.source.kind)},
        ${sqlText(authorityBinding.source.locator)}, 'sqlite', ${sqlText(initializedAt)},
        ${sqlText(receipt.operation_id)}
      );
       INSERT INTO namespaces VALUES (${sqlText(identities.namespaceId)}, 'casebook', 'active', ${sqlText(initializedAt)});
      INSERT INTO store_fence VALUES (1, 1);
      INSERT INTO event_retention VALUES (1, 0);
      INSERT INTO store_operation_receipts (
        operation_id, operation_kind, store_id, request_digest, outcome,
        result_json, result_digest, authority_claim_json, settled_at,
        failure_class, retry_disposition, operation_fence
      ) VALUES (
        ${sqlText(receipt.operation_id)}, 'initialize_store', ${sqlText(identities.storeId)},
        ${sqlText(receipt.request_digest)}, 'initialized', ${sqlText(JSON.stringify(receipt.result))},
        ${sqlText(receipt.result_digest)}, ${sqlText(JSON.stringify(authorityClaim))},
        ${sqlText(initializedAt)}, NULL, 'never', 1
      );
      INSERT INTO schema_migrations VALUES (
        ${sqlText(migration.id)}, ${sqlText(SCHEMA_ID)}, 0, ${SCHEMA_VERSION},
        ${sqlText(migration.schema_asset_sha256)}, ${sqlText(migration.manifest_sha256)},
        ${sqlText(receipt.operation_id)}, ${sqlText(initializedAt)}
      );
      PRAGMA user_version = ${SCHEMA_VERSION};
      COMMIT;
      PRAGMA wal_checkpoint(FULL);
    `;
    await sqlite(binary, temporaryStore, command, {
      args: ["-batch", "-bail"],
      timeout: 20_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const inspected = await inspectStore(binary, temporaryStore);
    if (inspected.status !== "available") {
      throw new Error(`new_store_verification_failed:${inspected.code ?? inspected.status}:${JSON.stringify(inspected.evidence ?? {})}`);
    }
    await link(temporaryStore, storePath);
    return inspected;
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
