import { createHash } from "node:crypto";
import { link, lstat, mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PROTOCOL_ID, PROTOCOL_VERSION, SCHEMA_ID, SCHEMA_VERSION } from "../../../../shared/protocol.mjs";
import { sqlite } from "./diagnostics.mjs";

export const APPLICATION_ID = 0x43424631; // "CBF1" — distinct FINAL store identity
export const SUPPORTED_SCHEMA_VERSIONS = Object.freeze([SCHEMA_VERSION]);
const SQL_ASSET = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../sql/schema-final.sql");
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
  "store_authority_binding",
  "store_cutovers",
  "store_fence",
  "store_metadata",
  "store_operation_receipts",
  "view_families",
  "view_policy_namespace_grants",
  "view_policy_revisions",
]);
const RESOURCE_FOUNDATION_TABLES = Object.freeze([
  "case_alias_current",
  "relationship_current",
  "resource_current",
  "resource_search_current",
  "resource_search_fts",
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
  const expectedTables = [...REQUIRED_TABLES, ...RESOURCE_FOUNDATION_TABLES];
  const missingTables = expectedTables.filter((table) => !tables.has(table));
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
        'authority_binding', (SELECT json_object(
          'store_id', store_id,
          'source_kind', source_kind,
          'source_locator', source_locator,
          'authority_mode', authority_mode,
          'bound_at', bound_at,
          'binding_operation_id', binding_operation_id
        ) FROM store_authority_binding WHERE singleton = 1),
        'authority_binding_count', (SELECT count(*) FROM store_authority_binding),
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
        'cutover_count', (SELECT count(*) FROM store_cutovers),
        'cutover', (SELECT json_object('cutover_id',cutover_id,'operation_id',operation_id) FROM store_cutovers LIMIT 1),
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
    for (const key of ["metadata", "authority_binding", "namespace", "view", "migration", "latest_migration", "cutover"]) {
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
    && detail.authority_binding_count === 1
    && detail.authority_binding?.store_id === detail.metadata.store_id
    && detail.authority_binding?.authority_mode === "sqlite"
    && typeof detail.authority_binding?.source_kind === "string"
    && detail.authority_binding.source_kind.length > 0
    && typeof detail.authority_binding?.source_locator === "string"
    && detail.authority_binding.source_locator.length > 0
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
    && ((detail.cutover_count === 0
      && detail.migration_count === 1
      && detail.migration?.migration_id === "0001-initialize-final-store"
      && detail.migration?.schema_id === SCHEMA_ID
      && detail.migration?.from_version === 0
      && detail.migration?.to_version === SCHEMA_VERSION
      && detail.migration?.operation_id === detail.metadata.initialization_operation_id)
      || (detail.cutover_count === 1
        && detail.cutover?.cutover_id === "cutover-schema1-predecessor-to-final"
        && detail.migration_count >= 1
        && detail.migration?.migration_id === "0001-initialize-store"
        && detail.migration?.schema_id === "casebook-persistence-sqlite"
        && detail.migration?.from_version === 0
        && detail.migration?.to_version === 1
        && detail.migration?.operation_id === detail.metadata.initialization_operation_id))
    && detail.snapshot_column_count === 2
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
        authority_binding: detail.authority_binding_count,
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
    authority_binding: detail.authority_binding,
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
      failure_class, retry_disposition, operation_fence, view_policy_revision_id
    )
    SELECT
      ${sqlText(receipt.operation_id)}, ${sqlText(receipt.operation_kind)}, ${sqlText(receipt.store_id)},
      ${sqlText(receipt.request_digest)}, ${sqlText(receipt.outcome)}, ${sqlText(JSON.stringify(result))},
      ${sqlText(receipt.result_digest)}, ${sqlText(JSON.stringify(authorityClaim))}, ${sqlText(receipt.settled_at)},
      ${receipt.failure_class == null ? "NULL" : sqlText(receipt.failure_class)}, ${sqlText(receipt.retry_disposition)},
      ${nextFence}, ${settlement.viewPolicyRevisionId == null ? "NULL" : sqlText(settlement.viewPolicyRevisionId)}
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
