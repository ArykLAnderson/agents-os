import { link, lstat, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PROTOCOL_ID, PROTOCOL_VERSION, SCHEMA_ID, SCHEMA_VERSION } from "../../../../shared/protocol.mjs";
import { sqlite } from "./diagnostics.mjs";

export const APPLICATION_ID = 0x43425031; // "CBP1"
const SQL_ASSET = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../sql/schema-v1.sql");
const REQUIRED_TABLES = Object.freeze([
  "namespaces",
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
  const args = ["-batch", "-bail", "-json"];
  let selectedDatabase = database;
  if (readonly) {
    const immutableUrl = pathToFileURL(database);
    immutableUrl.searchParams.set("immutable", "1");
    selectedDatabase = immutableUrl.href;
  }
  const { stdout } = await sqlite(binary, selectedDatabase, sqlTextValue, { args, maxBuffer: 4 * 1024 * 1024 });
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
  if (header.user_version !== SCHEMA_VERSION || header.application_id !== APPLICATION_ID) {
    return {
      status: "migration_required",
      code: "schema_migration_required",
      evidence: {
        expected: { schema_id: SCHEMA_ID, schema_version: SCHEMA_VERSION, application_id: APPLICATION_ID },
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
          JOIN namespaces granted ON granted.namespace_id = grant.namespace_id
          ORDER BY vf.view_id, grant.namespace_id LIMIT 1),
        'view_family_count', (SELECT count(*) FROM view_families),
        'policy_revision_count', (SELECT count(*) FROM view_policy_revisions),
        'active_view_count', (SELECT count(*) FROM view_policy_revisions WHERE lifecycle = 'active'),
        'active_policy_grant_count', (SELECT count(*)
          FROM view_policy_revisions vpr
          JOIN view_policy_namespace_grants grant
            ON grant.view_policy_revision_id = vpr.view_policy_revision_id
          WHERE vpr.lifecycle = 'active'),
        'grant_count', (SELECT count(*) FROM view_policy_namespace_grants),
        'migration', (SELECT json_object(
          'migration_id', migration_id,
          'schema_id', schema_id,
          'from_version', from_version,
          'to_version', to_version,
          'operation_id', operation_id
        ) FROM schema_migrations ORDER BY migration_id LIMIT 1),
        'migration_count', (SELECT count(*) FROM schema_migrations),
        'receipt_count', (SELECT count(*) FROM store_operation_receipts),
        'operation_fence', (SELECT operation_fence FROM store_fence WHERE singleton = 1),
        'initialization_receipt_present', (SELECT count(*) FROM store_operation_receipts r
          JOIN store_metadata m ON r.operation_id = m.initialization_operation_id
          WHERE r.operation_kind = 'initialize_store' AND r.store_id = m.store_id)
      ) AS inspection_json;
    `);
    detail = JSON.parse(rows[0]?.inspection_json ?? "{}");
    for (const key of ["metadata", "namespace", "view", "migration"]) {
      if (typeof detail[key] === "string") detail[key] = JSON.parse(detail[key]);
    }
  } catch {
    return unavailable("store_partial_initialization", { components_readable: false });
  }

  if (detail.metadata?.schema_id !== SCHEMA_ID
    || detail.metadata?.schema_version !== SCHEMA_VERSION
    || detail.metadata?.protocol_id !== PROTOCOL_ID
    || detail.metadata?.protocol_version !== PROTOCOL_VERSION) {
    return {
      status: "migration_required",
      code: "schema_migration_required",
      evidence: {
        expected: {
          schema_id: SCHEMA_ID,
          schema_version: SCHEMA_VERSION,
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
    && detail.namespace_count === 1
    && detail.namespace?.namespace_key === "personal"
    && detail.namespace?.lifecycle === "active"
    && detail.view_family_count === 1
    && detail.policy_revision_count === 1
    && detail.active_view_count === 1
    && detail.active_policy_grant_count === 1
    && detail.view?.namespace_id === detail.namespace?.namespace_id
    && detail.view?.granted_namespace_id === detail.namespace?.namespace_id
    && detail.view?.granted_namespace_key === "personal"
    && detail.view?.granted_namespace_lifecycle === "active"
    && detail.view?.audience_ceiling === "private"
    && detail.view?.store_operation_receipts_visible === 1
    && detail.grant_count === 1
    && detail.migration_count === 1
    && detail.migration?.migration_id === "0001-initialize-store"
    && detail.migration?.schema_id === SCHEMA_ID
    && detail.migration?.from_version === 0
    && detail.migration?.to_version === SCHEMA_VERSION
    && detail.migration?.operation_id === detail.metadata.initialization_operation_id
    && detail.receipt_count >= 1
    && detail.initialization_receipt_present === 1
    && Number.isInteger(detail.operation_fence)
    && detail.operation_fence >= 1;
  if (!complete) {
    return unavailable("store_partial_initialization", {
      components: {
        metadata: detail.metadata_count,
        namespaces: detail.namespace_count,
        view_families: detail.view_family_count,
        policy_revisions: detail.policy_revision_count,
        active_views: detail.active_view_count,
        active_policy_grants: detail.active_policy_grant_count,
        grants: detail.grant_count,
        migrations: detail.migration_count,
        receipts: detail.receipt_count,
        initialization_receipt: detail.initialization_receipt_present,
        operation_fence: detail.operation_fence ?? null,
        namespace: detail.namespace ?? null,
        view: detail.view ?? null,
        migration: detail.migration ?? null,
      },
    });
  }

  return {
    status: "available",
    metadata: detail.metadata,
    namespace: detail.namespace,
    view: detail.view,
    operation_fence: detail.operation_fence,
  };
}

export async function readStoreOperationReceipt(binary, storePath, operationId) {
  const rows = await queryJson(binary, storePath, `
    SELECT operation_id, operation_kind, store_id, request_digest, outcome,
      result_json, result_digest, authority_claim_json, settled_at,
      failure_class, retry_disposition, operation_fence
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
  };
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
      INSERT INTO view_policy_revisions VALUES (
        ${sqlText(identities.viewPolicyRevisionId)}, ${sqlText(identities.viewId)}, 1,
        'private', 'active', ${sqlText(JSON.stringify(authorityClaim))}, '["case","frame"]',
        1, NULL, 1, ${sqlText(initializedAt)}
      );
      INSERT INTO view_policy_namespace_grants VALUES (
        ${sqlText(identities.viewPolicyRevisionId)}, ${sqlText(identities.namespaceId)}
      );
      INSERT INTO store_fence VALUES (1, 1);
      INSERT INTO store_operation_receipts VALUES (
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
      PRAGMA wal_checkpoint(TRUNCATE);
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
