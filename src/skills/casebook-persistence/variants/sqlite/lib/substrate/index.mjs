import { createHash } from "node:crypto";
import { copyFile, link, lstat, mkdtemp, readFile, realpath, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROTOCOL_ID, PROTOCOL_VERSION, SCHEMA_ID, SCHEMA_VERSION } from "../../../../shared/protocol.mjs";
import { sqlite } from "./diagnostics.mjs";

export const APPLICATION_ID = 0x43425031; // "CBP1"
export const SUPPORTED_SCHEMA_VERSIONS = Object.freeze([1, 2]);
const SQL_ASSET = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../sql/schema-v1.sql");
const MIGRATION_V2_ASSET = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../migrations/0002-migration-snapshot-evidence.sql");
const REQUIRED_TABLES = Object.freeze([
  "consumer_checkpoints",
  "event_retention",
  "namespaces",
  "owner_current",
  "owner_family_bindings",
  "owner_events",
  "owner_outbox",
  "owner_revision_selections",
  "owner_revisions",
  "owner_versions",
  "owners",
  "schema_migrations",
  "store_fence",
  "store_metadata",
  "store_operation_receipts",
  "view_families",
  "view_policy_namespace_grants",
  "view_policy_revisions",
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

export async function inspectStore(binary, storePath) {
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
  if (!SUPPORTED_SCHEMA_VERSIONS.includes(header.user_version) || header.application_id !== APPLICATION_ID) {
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
  const missingTables = REQUIRED_TABLES.filter((table) => !tables.has(table));
  if (missingTables.length) {
    return unavailable("store_partial_initialization", { missing_components: missingTables });
  }

  let detail;
  try {
    const rows = await queryJson(binary, storePath, `
      SELECT json_object(
        'metadata', (SELECT json_object(
          'store_id', store_id,
          'schema_id', schema_id,
          'schema_version', schema_version,
          'protocol_id', protocol_id,
          'protocol_version', protocol_version,
          'initialized_at', initialized_at,
          'initialization_operation_id', initialization_operation_id
        ) FROM store_metadata WHERE singleton = 1),
        'metadata_count', (SELECT count(*) FROM store_metadata),
        'namespace', (SELECT json_object(
          'namespace_id', namespace_id,
          'namespace_key', namespace_key,
          'lifecycle', lifecycle
        ) FROM namespaces ORDER BY namespace_id LIMIT 1),
        'namespace_count', (SELECT count(*) FROM namespaces),
        'active_namespace_count', (SELECT count(*) FROM namespaces WHERE lifecycle = 'active'),
        'view', (SELECT json_object(
          'view_id', vf.view_id,
          'view_policy_revision_id', vpr.view_policy_revision_id,
          'view_policy_revision', vpr.revision_number,
          'audience_ceiling', vpr.audience_ceiling,
          'lifecycle', vpr.lifecycle,
          'store_operation_receipts_visible', vpr.store_operation_receipts_visible,
          'namespace_id', vf.home_namespace_id,
          'granted_namespace_id', grant.namespace_id,
          'granted_namespace_key', granted.namespace_key,
          'granted_namespace_lifecycle', granted.lifecycle
        ) FROM view_families vf
          JOIN view_policy_revisions vpr
            ON vpr.view_id = vf.view_id AND vpr.lifecycle = 'active'
          JOIN view_policy_namespace_grants grant
            ON grant.view_policy_revision_id = vpr.view_policy_revision_id
              AND grant.namespace_id = vf.home_namespace_id
          JOIN namespaces granted ON granted.namespace_id = grant.namespace_id
          ORDER BY vpr.activation_fence, vf.view_id LIMIT 1),
        'view_family_count', (SELECT count(*) FROM view_families),
        'policy_revision_count', (SELECT count(*) FROM view_policy_revisions),
        'active_view_count', (SELECT count(*) FROM view_policy_revisions WHERE lifecycle = 'active'),
        'fenced_retired_policy_count', (SELECT count(*) FROM view_policy_revisions
          WHERE lifecycle = 'retired' AND retirement_fence IS NOT NULL),
        'active_policy_grant_count', (SELECT count(*)
          FROM view_policy_revisions vpr
          JOIN view_policy_namespace_grants grant
            ON grant.view_policy_revision_id = vpr.view_policy_revision_id
          JOIN namespaces ns ON ns.namespace_id = grant.namespace_id AND ns.lifecycle = 'active'
          WHERE vpr.lifecycle = 'active'),
        'active_policy_total_grant_count', (SELECT count(*)
          FROM view_policy_revisions vpr
          JOIN view_policy_namespace_grants grant
            ON grant.view_policy_revision_id = vpr.view_policy_revision_id
          WHERE vpr.lifecycle = 'active'),
        'active_home_grant_count', (SELECT count(*)
          FROM view_families vf
          JOIN view_policy_revisions vpr ON vpr.view_id = vf.view_id AND vpr.lifecycle = 'active'
          JOIN view_policy_namespace_grants grant ON grant.view_policy_revision_id = vpr.view_policy_revision_id
            AND grant.namespace_id = vf.home_namespace_id
          JOIN namespaces ns ON ns.namespace_id = grant.namespace_id AND ns.lifecycle = 'active'),
        'grant_count', (SELECT count(*) FROM view_policy_namespace_grants),
        'migration', (SELECT json_object(
          'migration_id', migration_id,
          'schema_id', schema_id,
          'from_version', from_version,
          'to_version', to_version,
          'schema_asset_digest', schema_asset_digest,
          'migration_manifest_digest', migration_manifest_digest,
          'operation_id', operation_id
        ) FROM schema_migrations ORDER BY to_version LIMIT 1),
        'latest_migration', (SELECT json_object(
          'migration_id', migration_id,
          'schema_id', schema_id,
          'from_version', from_version,
          'to_version', to_version,
          'schema_asset_digest', schema_asset_digest,
          'migration_manifest_digest', migration_manifest_digest,
          'operation_id', operation_id
        ) FROM schema_migrations ORDER BY to_version DESC LIMIT 1),
        'migration_count', (SELECT count(*) FROM schema_migrations),
        'snapshot_column_count', (SELECT count(*) FROM pragma_table_info('store_operation_receipts')
          WHERE name IN ('snapshot_sha256', 'snapshot_size_bytes')),
        'receipt_count', (SELECT count(*) FROM store_operation_receipts),
        'operation_fence', (SELECT operation_fence FROM store_fence WHERE singleton = 1),
        'event_retention_count', (SELECT count(*) FROM event_retention WHERE singleton = 1),
        'retained_after_sequence', (SELECT retained_after_sequence FROM event_retention WHERE singleton = 1),
        'initialization_receipt_present', (SELECT count(*) FROM store_operation_receipts r
          JOIN store_metadata m ON r.operation_id = m.initialization_operation_id
          WHERE r.operation_kind = 'initialize_store' AND r.store_id = m.store_id)
      ) AS inspection_json;
    `);
    detail = JSON.parse(rows[0]?.inspection_json ?? "{}");
    for (const key of ["metadata", "namespace", "view", "migration", "latest_migration"]) {
      if (typeof detail[key] === "string") detail[key] = JSON.parse(detail[key]);
    }
  } catch {
    return unavailable("store_partial_initialization", { components_readable: false });
  }

  if (detail.metadata?.schema_id !== SCHEMA_ID
    || detail.metadata?.schema_version !== header.user_version
    || !SUPPORTED_SCHEMA_VERSIONS.includes(detail.metadata?.schema_version)
    || detail.metadata?.protocol_id !== PROTOCOL_ID
    || detail.metadata?.protocol_version !== PROTOCOL_VERSION) {
    return {
      status: "migration_required",
      code: "schema_migration_required",
      evidence: {
        expected: {
          schema_id: SCHEMA_ID,
          compatible_schema_versions: SUPPORTED_SCHEMA_VERSIONS,
          protocol_id: PROTOCOL_ID,
          protocol_version: PROTOCOL_VERSION,
        },
        observed: {
          schema_id: detail.metadata?.schema_id ?? null,
          schema_version: detail.metadata?.schema_version ?? null,
          protocol_id: detail.metadata?.protocol_id ?? null,
          protocol_version: detail.metadata?.protocol_version ?? null,
        },
      },
    };
  }

  const complete = detail.metadata_count === 1
    && detail.metadata.store_id?.startsWith("store:")
    && detail.namespace_count >= 1
    && detail.active_namespace_count >= 1
    && detail.view_family_count >= 1
    && detail.policy_revision_count >= detail.view_family_count
    && detail.active_view_count >= 0
    && detail.active_view_count <= detail.view_family_count
    && (detail.active_view_count > 0 || detail.fenced_retired_policy_count > 0)
    && detail.active_policy_grant_count >= detail.active_view_count
    && detail.active_policy_grant_count === detail.active_policy_total_grant_count
    && detail.active_home_grant_count === detail.active_view_count
    && (detail.active_view_count === 0 || (
      detail.view?.granted_namespace_lifecycle === "active"
      && detail.view?.audience_ceiling === "private"
    ))
    && detail.grant_count >= 1
    && detail.migration_count === detail.metadata.schema_version
    && detail.migration?.migration_id === "0001-initialize-store"
    && detail.migration?.schema_id === SCHEMA_ID
    && detail.migration?.from_version === 0
    && detail.migration?.to_version === SCHEMA_VERSION
    && detail.migration?.operation_id === detail.metadata.initialization_operation_id
    && (detail.metadata.schema_version === 1 || (
      detail.latest_migration?.migration_id === "0002-migration-snapshot-evidence"
      && detail.latest_migration?.schema_id === SCHEMA_ID
      && detail.latest_migration?.from_version === 1
      && detail.latest_migration?.to_version === 2
      && detail.snapshot_column_count === 2
    ))
    && detail.receipt_count >= 1
    && detail.initialization_receipt_present === 1
    && Number.isInteger(detail.operation_fence)
    && detail.operation_fence >= 1
    && detail.event_retention_count === 1
    && Number.isInteger(detail.retained_after_sequence)
    && detail.retained_after_sequence >= 0;
  if (!complete) {
    return unavailable("store_partial_initialization", {
      components: {
        metadata: detail.metadata_count,
        namespaces: detail.namespace_count,
        view_families: detail.view_family_count,
        policy_revisions: detail.policy_revision_count,
        active_views: detail.active_view_count,
        fenced_retired_policies: detail.fenced_retired_policy_count,
        active_policy_grants: detail.active_policy_grant_count,
        active_policy_total_grants: detail.active_policy_total_grant_count,
        active_home_grants: detail.active_home_grant_count,
        grants: detail.grant_count,
        migrations: detail.migration_count,
        receipts: detail.receipt_count,
        initialization_receipt: detail.initialization_receipt_present,
        operation_fence: detail.operation_fence ?? null,
        event_retention: { count: detail.event_retention_count ?? 0, retained_after_sequence: detail.retained_after_sequence ?? null },
        namespace: detail.namespace ?? null,
        view: detail.view ?? null,
        migration: detail.migration ?? null,
        latest_migration: detail.latest_migration ?? null,
        snapshot_columns: detail.snapshot_column_count ?? null,
      },
    });
  }

  return {
    status: "available",
    metadata: detail.metadata,
    namespace: detail.namespace,
    view: detail.view,
    operation_fence: detail.operation_fence,
    migrations: {
      initial: detail.migration,
      latest: detail.latest_migration,
      count: detail.migration_count,
    },
    integrity: { quick_check: "ok", foreign_key_violations: 0 },
  };
}

export async function readStoreOperationReceipt(binary, storePath, operationId) {
  const rows = await queryJson(binary, storePath, `
    SELECT operation_id, operation_kind, store_id, request_digest, outcome,
      result_json, result_digest, authority_claim_json, settled_at,
      failure_class, retry_disposition, operation_fence, owner_id, owner_kind,
      owner_home_namespace_id, view_policy_revision_id, expected_revision, observed_revision,
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
    view_policy_revision_id: row.view_policy_revision_id ?? null,
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
  const inspected = await inspectStore(binary, snapshotPath);
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

export async function applyMigrationV2(binary, storePath, application) {
  const asset = await readFile(MIGRATION_V2_ASSET, "utf8");
  const { receipt, authorityClaim, result, expectedOperationFence, migration, snapshot } = application;
  const nextFence = expectedOperationFence + 1;
  let controlledFault = "";
  if (process.env.CASEBOOK_PERSISTENCE_TEST_FAULT === "migration_after_apply_before_commit") {
    controlledFault = "SELECT * FROM casebook_controlled_fault_after_migration_apply;";
  } else if (process.env.CASEBOOK_PERSISTENCE_TEST_FAULT === "migration_kill_executor_after_apply_before_commit") {
    // W03-only kill boundary: terminate the SQLite executor while its schema
    // transaction is open so an independent drill can prove rollback-on-exit.
    controlledFault = ".shell kill -9 $PPID";
  }
  const command = `.bail on
    PRAGMA busy_timeout = 5000;
    PRAGMA foreign_keys = ON;
    BEGIN IMMEDIATE;
    CREATE TEMP TABLE migration_precondition_guard (valid INTEGER NOT NULL CHECK (valid = 1));
    INSERT INTO migration_precondition_guard(valid)
      SELECT CASE WHEN operation_fence = ${expectedOperationFence} THEN 1 ELSE 0 END
      FROM store_fence WHERE singleton = 1;
    ${asset}
    ${controlledFault}
    DELETE FROM migration_precondition_guard;
    INSERT INTO migration_precondition_guard(valid)
      SELECT CASE WHEN
        (SELECT count(*) FROM pragma_quick_check WHERE quick_check <> 'ok') = 0
        AND (SELECT count(*) FROM pragma_foreign_key_check) = 0
        AND (SELECT schema_version FROM store_metadata WHERE singleton = 1) = 2
        THEN 1 ELSE 0 END;
    INSERT INTO store_operation_receipts (
      operation_id, operation_kind, store_id, request_digest, outcome,
      result_json, result_digest, authority_claim_json, settled_at,
      failure_class, retry_disposition, operation_fence, snapshot_sha256, snapshot_size_bytes
    ) VALUES (
      ${sqlText(receipt.operation_id)}, 'migration', ${sqlText(receipt.store_id)},
      ${sqlText(receipt.request_digest)}, 'migrated', ${sqlText(JSON.stringify(result))},
      ${sqlText(receipt.result_digest)}, ${sqlText(JSON.stringify(authorityClaim))}, ${sqlText(receipt.settled_at)},
      NULL, 'never', ${nextFence}, ${sqlText(snapshot.sha256)}, ${snapshot.size_bytes}
    );
    INSERT INTO schema_migrations VALUES (
      ${sqlText(migration.id)}, ${sqlText(SCHEMA_ID)}, 1, 2,
      ${sqlText(migration.schema_asset_sha256)}, ${sqlText(migration.manifest_sha256)},
      ${sqlText(receipt.operation_id)}, ${sqlText(receipt.settled_at)}
    );
    UPDATE store_fence SET operation_fence = ${nextFence}
      WHERE singleton = 1 AND operation_fence = ${expectedOperationFence};
    PRAGMA user_version = 2;
    DROP TABLE migration_precondition_guard;
    COMMIT;
  `;
  await sqlite(binary, storePath, command, {
    args: ["-batch", "-bail"],
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  return { committed: true };
}

export async function restoreVerifiedMigrationSnapshot(binary, storePath, snapshotPath, operationId) {
  const token = sha256(Buffer.from(operationId)).slice(0, 16);
  const restorePath = `${storePath}.restore-${token}`;
  const quarantinePath = `${storePath}.quarantine-${token}`;
  await rm(restorePath, { force: true });
  try {
    await copyFile(snapshotPath, restorePath);
    const candidate = await inspectStore(binary, restorePath);
    if (candidate.status !== "available") throw Object.assign(new Error("restore candidate is not healthy"), { code: "restore_candidate_unhealthy" });
    await rm(quarantinePath, { force: true });
    await rename(storePath, quarantinePath);
    if (process.env.CASEBOOK_PERSISTENCE_TEST_FAULT === "migration_restore_fail_after_quarantine") {
      throw Object.assign(new Error("controlled restore failure after quarantine"), { code: "restore_after_quarantine_fault" });
    }
    await rename(restorePath, storePath);
    await rm(`${storePath}-wal`, { force: true });
    await rm(`${storePath}-shm`, { force: true });
    const restored = await inspectStore(binary, storePath);
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
    const { identities, receipt, migration, authorityClaim, initializedAt } = initialization;
    const command = `.bail on\nPRAGMA busy_timeout = 5000;\nPRAGMA journal_mode = WAL;\nPRAGMA application_id = ${APPLICATION_ID};\nBEGIN IMMEDIATE;\n${schema}\n
      INSERT INTO store_metadata VALUES (
        1, ${sqlText(identities.storeId)}, ${sqlText(SCHEMA_ID)}, ${SCHEMA_VERSION},
        ${sqlText(initialization.protocol.id)}, ${initialization.protocol.version},
        ${sqlText(initializedAt)}, ${sqlText(receipt.operation_id)}
      );
      INSERT INTO namespaces VALUES (
        ${sqlText(identities.namespaceId)}, 'personal', 'active', ${sqlText(initializedAt)}
      );
      INSERT INTO view_families VALUES (
        ${sqlText(identities.viewId)}, ${sqlText(identities.namespaceId)}, ${sqlText(initializedAt)}
      );
      INSERT INTO view_policy_revisions (
        view_policy_revision_id, view_id, revision_number, audience_ceiling, lifecycle,
        authority_claim_json, object_kinds_json, store_operation_receipts_visible,
        predecessor_revision_id, activation_fence, created_at, limits_json,
        superseded_fence, retirement_fence
      ) VALUES (
        ${sqlText(identities.viewPolicyRevisionId)}, ${sqlText(identities.viewId)}, 1,
        'private', 'created', ${sqlText(JSON.stringify(authorityClaim))}, '["case","frame"]',
        1, NULL, NULL, ${sqlText(initializedAt)},
        '{"max_results":100,"max_traversal_depth":8}', NULL, NULL
      );
      INSERT INTO view_policy_namespace_grants VALUES (
        ${sqlText(identities.viewPolicyRevisionId)}, ${sqlText(identities.namespaceId)}
      );
      UPDATE view_policy_revisions SET lifecycle = 'active', activation_fence = 1
      WHERE view_policy_revision_id = ${sqlText(identities.viewPolicyRevisionId)} AND lifecycle = 'created';
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
