import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { validateAuthorityConfiguration, ConfigurationError } from "../../../../shared/config.mjs";
import { loadAndValidateManifest } from "../../../../shared/manifest.mjs";
import {
  failure,
  PROTOCOL_ID,
  PROTOCOL_VERSION,
  RETRY_DISPOSITIONS,
  SCHEMA_ID,
  SCHEMA_VERSION,
  success,
  unsupported,
} from "../../../../shared/protocol.mjs";
import {
  nodeRuntimeIncompatibility,
  probeSqlite,
  selectSqliteBinary,
  sqlite,
} from "../substrate/diagnostics.mjs";
import {
  createInitializedStore,
  inspectStore,
  readStoreOperationReceipt,
} from "../substrate/index.mjs";

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function digest(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const UUID_ID = new RegExp(`^[a-z][a-z0-9_-]*:${UUID}$`);
const POLICY_KINDS = new Set(["case", "frame"]);

function sqlText(value) {
  if (value == null) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function queryJson(binary, database, query) {
  const { stdout } = await sqlite(binary, database, `PRAGMA query_only = ON;\n${query}`, {
    args: ["-batch", "-bail", "-json"],
    maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(stdout || "[]");
}

function validateUuidId(value, field, prefix) {
  if (!nonEmpty(value) || value.length > 128 || !UUID_ID.test(value)
    || (prefix && !value.startsWith(`${prefix}:`))) {
    throw new ConfigurationError("identity_invalid", `${field} must be a lowercase UUID-based ${prefix ?? "stable"} identity.`);
  }
  return value;
}

function validateRequestVersion(request) {
  if (request.request_version !== 1) {
    throw new ConfigurationError("representation_incompatible", "request_version must be 1.");
  }
}

const POLICY_REQUEST_FIELDS = Object.freeze([
  "protocol", "operation", "request_version", "operation_id", "store_id",
  "context", "authority_claim", "configuration",
]);

function validateExactPolicyRequest(request, additionalFields) {
  const allowed = new Set([...POLICY_REQUEST_FIELDS, ...additionalFields]);
  if (!request || typeof request !== "object" || Array.isArray(request)
    || Object.keys(request).some((key) => !allowed.has(key))) {
    throw new ConfigurationError("view_policy_invalid", "The view-policy request contains unsupported fields.");
  }
}

function validateOperationId(value) {
  if (!nonEmpty(value) || value.length > 256) {
    throw new ConfigurationError("operation_id_invalid", "operation_id must be a non-empty bounded string.");
  }
  return value;
}

function validateAuthorityClaim(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.human_authorized !== true
    || !nonEmpty(value.acting_role)
    || !nonEmpty(value.authority_basis)) {
    throw new ConfigurationError(
      "human_authority_claim_required",
      "Exceptional store and view-policy operations require an explicit human authority claim.",
    );
  }
  const claim = {
    human_authorized: true,
    acting_role: value.acting_role.trim(),
    authority_basis: value.authority_basis.trim(),
  };
  for (const key of ["causation", "correlation", "session"]) {
    if (value[key] != null) {
      if (!nonEmpty(value[key])) throw new ConfigurationError("authority_claim_invalid", `${key} must be a non-empty string when present.`);
      claim[key] = value[key].trim();
    }
  }
  return claim;
}

function initializationRequestDigest(storeId, operationId, authorityClaim) {
  return digest({
    operation: "initialize_store",
    operation_id: operationId,
    store_id: storeId,
    schema: { id: SCHEMA_ID, version: SCHEMA_VERSION },
    protocol: { id: PROTOCOL_ID, version: PROTOCOL_VERSION },
    initial_namespace: { key: "personal", lifecycle: "active" },
    initial_view: { audience_ceiling: "private", lifecycle: "active", namespace_grant: "personal" },
    authority_claim: authorityClaim,
  });
}

async function prepare(request) {
  const runtime = { path: process.execPath, version: process.versions.node };
  const runtimeFailure = nodeRuntimeIncompatibility(runtime);
  if (runtimeFailure) return { failure: runtimeFailure };

  const configuration = validateAuthorityConfiguration(request.configuration);
  if (configuration.authority_mode !== "sqlite") {
    return {
      failure: failure("sqlite_authority_required", "This operation requires explicitly selected sqlite authority.", {
        failureClass: "configuration_or_store_unavailable",
      }),
    };
  }

  const manifestCheck = await loadAndValidateManifest();
  if (!manifestCheck.ok) {
    return {
      failure: failure("asset_incompatible", "Package manifest or asset verification failed.", {
        failureClass: "asset_incompatible",
        retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
        evidence: { problems: manifestCheck.problems },
      }),
    };
  }

  const selected = await selectSqliteBinary(configuration.sqlite.sqlite_bin);
  const probe = await probeSqlite(selected.path, path.dirname(configuration.sqlite.store_path));
  if (!probe.ok) {
    return {
      failure: failure("sqlite_feature_unsupported", "Selected SQLite runtime does not satisfy package requirements.", {
        failureClass: "sqlite_feature_unsupported",
        retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
        evidence: { version: probe.version, features: probe.features, problems: probe.problems },
      }),
    };
  }

  return { configuration, manifestCheck, sqliteBinary: selected.path };
}

function storeStateFailure(state) {
  if (state.status === "migration_required") {
    return failure("schema_migration_required", "The configured store requires an explicit compatible migration.", {
      failureClass: "schema_migration_required",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      correctiveGuidance: "Do not retry ordinary access or initialize over this store. Run a separately authorized migration or restore operation.",
      evidence: state.evidence,
    });
  }
  return failure(state.code ?? "store_unavailable", "The configured store is unavailable and was not modified.", {
    failureClass: "store_unavailable",
    retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
    correctiveGuidance: "Inspect, restore, or explicitly remove the incompatible/partial disposable store before initialization.",
    evidence: state.evidence,
  });
}

function validatePolicyContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !["view_id", "view_policy_revision_id", "purpose", "requested_audience_ceiling"].includes(key))) {
    throw new ConfigurationError("view_context_required", "View-policy operations require an exact active operational view context.");
  }
  return {
    view_id: validateUuidId(value.view_id, "context.view_id", "view"),
    view_policy_revision_id: validateUuidId(value.view_policy_revision_id, "context.view_policy_revision_id", "view-policy"),
    purpose: nonEmpty(value.purpose) && value.purpose.length <= 512
      ? value.purpose
      : (() => { throw new ConfigurationError("view_context_required", "context.purpose must be a non-empty bounded string."); })(),
    ...(value.requested_audience_ceiling == null ? {} : { requested_audience_ceiling: value.requested_audience_ceiling }),
  };
}

function validatePolicyShape(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ConfigurationError("view_policy_invalid", "policy must be a complete view-policy object.");
  }
  const allowed = new Set([
    "view_id", "view_policy_revision_id", "home_namespace_id", "audience_ceiling",
    "namespace_ids", "object_kinds", "limits", "store_operation_receipts_visible",
  ]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new ConfigurationError("view_policy_invalid", "policy contains unsupported fields.");
  }
  const viewId = validateUuidId(value.view_id, "policy.view_id", "view");
  const revisionId = validateUuidId(value.view_policy_revision_id, "policy.view_policy_revision_id", "view-policy");
  const homeNamespaceId = validateUuidId(value.home_namespace_id, "policy.home_namespace_id", "namespace");
  if (value.audience_ceiling !== "private") {
    throw new ConfigurationError("view_policy_invalid", "The personal SQLite policy audience ceiling must be private.");
  }
  if (!Array.isArray(value.namespace_ids) || value.namespace_ids.length < 1 || value.namespace_ids.length > 32) {
    throw new ConfigurationError("view_policy_invalid", "policy.namespace_ids must contain 1 to 32 namespace identities.");
  }
  const namespaceIds = [...new Set(value.namespace_ids.map((item) => validateUuidId(item, "policy.namespace_ids[]", "namespace")))].sort();
  if (namespaceIds.length !== value.namespace_ids.length || !namespaceIds.includes(homeNamespaceId)) {
    throw new ConfigurationError("view_policy_invalid", "Policy namespace grants must be unique and include the home namespace.");
  }
  if (!Array.isArray(value.object_kinds) || value.object_kinds.length < 1 || value.object_kinds.length > POLICY_KINDS.size) {
    throw new ConfigurationError("view_policy_invalid", "policy.object_kinds must contain supported owner kinds.");
  }
  const objectKinds = [...new Set(value.object_kinds)].sort();
  if (objectKinds.length !== value.object_kinds.length || objectKinds.some((kind) => !POLICY_KINDS.has(kind))) {
    throw new ConfigurationError("view_policy_invalid", "Policy object kinds must be unique accepted structural owner kinds.");
  }
  if (!value.limits || typeof value.limits !== "object" || Array.isArray(value.limits)
    || Object.keys(value.limits).sort().join(",") !== "max_results,max_traversal_depth"
    || !Number.isInteger(value.limits.max_results) || value.limits.max_results < 1 || value.limits.max_results > 1000
    || !Number.isInteger(value.limits.max_traversal_depth) || value.limits.max_traversal_depth < 0 || value.limits.max_traversal_depth > 16) {
    throw new ConfigurationError("view_policy_invalid", "policy.limits requires bounded max_results and max_traversal_depth integers.");
  }
  if (typeof value.store_operation_receipts_visible !== "boolean") {
    throw new ConfigurationError("view_policy_invalid", "policy.store_operation_receipts_visible must be boolean.");
  }
  return {
    view_id: viewId,
    view_policy_revision_id: revisionId,
    home_namespace_id: homeNamespaceId,
    audience_ceiling: "private",
    namespace_ids: namespaceIds,
    object_kinds: objectKinds,
    limits: { max_results: value.limits.max_results, max_traversal_depth: value.limits.max_traversal_depth },
    store_operation_receipts_visible: value.store_operation_receipts_visible,
  };
}

async function activeOperationalView(binary, storePath, context) {
  if (context.requested_audience_ceiling != null && context.requested_audience_ceiling !== "private") return null;
  const rows = await queryJson(binary, storePath, `
    SELECT vpr.view_policy_revision_id
    FROM view_policy_revisions vpr
    WHERE vpr.view_id=${sqlText(context.view_id)}
      AND vpr.view_policy_revision_id=${sqlText(context.view_policy_revision_id)}
      AND vpr.lifecycle='active' AND vpr.audience_ceiling='private'
      AND vpr.store_operation_receipts_visible=1 LIMIT 1;
  `);
  return rows[0] ?? null;
}

async function readPolicyRevision(binary, storePath, revisionId) {
  const rows = await queryJson(binary, storePath, `
    SELECT vpr.*,vf.home_namespace_id,
      COALESCE((SELECT json_group_array(namespace_id) FROM (
        SELECT namespace_id FROM view_policy_namespace_grants
        WHERE view_policy_revision_id=vpr.view_policy_revision_id ORDER BY namespace_id
      )),json('[]')) namespace_ids_json
    FROM view_policy_revisions vpr JOIN view_families vf ON vf.view_id=vpr.view_id
    WHERE vpr.view_policy_revision_id=${sqlText(revisionId)} LIMIT 1;
  `);
  if (!rows.length) return null;
  const row = rows[0];
  return {
    view_id: row.view_id,
    view_policy_revision_id: row.view_policy_revision_id,
    revision_number: row.revision_number,
    home_namespace_id: row.home_namespace_id,
    audience_ceiling: row.audience_ceiling,
    namespace_ids: JSON.parse(row.namespace_ids_json),
    object_kinds: JSON.parse(row.object_kinds_json),
    limits: JSON.parse(row.limits_json),
    store_operation_receipts_visible: row.store_operation_receipts_visible === 1,
    predecessor_revision_id: row.predecessor_revision_id ?? null,
    lifecycle: row.lifecycle,
    activation_fence: row.activation_fence ?? null,
    superseded_fence: row.superseded_fence ?? null,
    retirement_fence: row.retirement_fence ?? null,
    constructed_at: row.created_at,
    constructing_authority: JSON.parse(row.authority_claim_json),
  };
}

function publicPolicyReceipt(receipt) {
  return {
    operation_id: receipt.operation_id,
    operation_kind: receipt.operation_kind,
    store_id: receipt.store_id,
    request_digest: receipt.request_digest,
    outcome: receipt.outcome,
    result_digest: receipt.result_digest,
    settled_at: receipt.settled_at,
    failure_class: receipt.failure_class,
    retry_disposition: receipt.retry_disposition,
    operation_fence: receipt.operation_fence,
    authority_claim: receipt.authority_claim,
    view_policy_revision_id: receipt.view_policy_revision_id,
  };
}

function policyFailure(code, message, retryDisposition = RETRY_DISPOSITIONS.NEVER) {
  return failure(code, message, {
    failureClass: code === "view_invalid" ? "view_invalid" : "view_policy_invalid",
    retryDisposition,
    evidence: {},
  });
}

async function preparePolicyOperation(request) {
  validateRequestVersion(request);
  const operationId = validateOperationId(request.operation_id);
  const authorityClaim = validateAuthorityClaim(request.authority_claim);
  const context = validatePolicyContext(request.context);
  const storeId = validateUuidId(request.store_id, "store_id", "store");
  const prepared = await prepare(request);
  if (prepared.failure) return { failure: prepared.failure };
  const { configuration, sqliteBinary } = prepared;
  const state = await inspectStore(sqliteBinary, configuration.sqlite.store_path);
  if (state.status !== "available") return { failure: storeStateFailure(state) };
  if (storeId !== state.metadata.store_id || !await activeOperationalView(sqliteBinary, configuration.sqlite.store_path, context)) {
    return { failure: policyFailure("view_invalid", "The exact active operational view-policy revision is invalid or unavailable.", RETRY_DISPOSITIONS.AFTER_RECONCILE) };
  }
  return { operationId, authorityClaim, context, storeId, state, sqliteBinary, storePath: configuration.sqlite.store_path };
}

function policyRequestDigest(prepared, operation, payload) {
  return digest({
    operation,
    operation_id: prepared.operationId,
    resolved_store_id: prepared.storeId,
    context: prepared.context,
    payload,
    authority_claim: prepared.authorityClaim,
  });
}

async function replayPolicyReceipt(prepared, requestDigest) {
  const receipt = await readStoreOperationReceipt(prepared.sqliteBinary, prepared.storePath, prepared.operationId);
  if (!receipt) return null;
  if (!receipt.operation_kind.startsWith("view_policy.") || receipt.request_digest !== requestDigest) {
    return failure("idempotency_mismatch", "operation_id is already settled for a different canonical request.", {
      failureClass: "idempotency_mismatch", retryDisposition: RETRY_DISPOSITIONS.NEVER,
      evidence: { operation_id: prepared.operationId },
    });
  }
  return success(receipt.operation_kind, {
    ...receipt.result,
    idempotent_replay: true,
    receipt: publicPolicyReceipt(receipt),
  });
}

async function commitPolicyChange(prepared, operation, payload, coreResult, statements) {
  const requestDigest = policyRequestDigest(prepared, operation, payload);
  const replay = await replayPolicyReceipt(prepared, requestDigest);
  if (replay) return replay;
  const now = new Date().toISOString();
  const nextFence = prepared.state.operation_fence + 1;
  const result = { status: "settled", ...coreResult(nextFence, now) };
  const resultDigest = digest(result);
  const guard = `CREATE TEMP TABLE policy_guard(valid INTEGER CHECK(valid=1));
    INSERT INTO policy_guard VALUES(CASE WHEN EXISTS(
      SELECT 1 FROM view_policy_revisions
      WHERE view_id=${sqlText(prepared.context.view_id)}
        AND view_policy_revision_id=${sqlText(prepared.context.view_policy_revision_id)}
        AND lifecycle='active' AND audience_ceiling='private'
        AND store_operation_receipts_visible=1
    ) THEN 1 ELSE 0 END);
    INSERT INTO policy_guard VALUES(CASE WHEN (SELECT operation_fence FROM store_fence WHERE singleton=1)=${prepared.state.operation_fence} THEN 1 ELSE 0 END);
    INSERT INTO policy_guard VALUES(CASE WHEN NOT EXISTS(SELECT 1 FROM store_operation_receipts WHERE operation_id=${sqlText(prepared.operationId)}) THEN 1 ELSE 0 END);`;
  const command = `.bail on\nPRAGMA foreign_keys=ON;\nPRAGMA busy_timeout=5000;\nBEGIN IMMEDIATE;\n${guard}\n${statements(nextFence, now)}
    UPDATE store_fence SET operation_fence=${nextFence} WHERE singleton=1;
    INSERT INTO store_operation_receipts (
      operation_id,operation_kind,store_id,request_digest,outcome,result_json,result_digest,
      authority_claim_json,settled_at,failure_class,retry_disposition,operation_fence,
      view_policy_revision_id
    ) VALUES (
      ${sqlText(prepared.operationId)},${sqlText(operation)},${sqlText(prepared.storeId)},${sqlText(requestDigest)},
      ${sqlText(operation.slice("view_policy.".length))},${sqlText(JSON.stringify(result))},${sqlText(resultDigest)},
      ${sqlText(JSON.stringify(prepared.authorityClaim))},${sqlText(now)},NULL,'never',${nextFence},
      ${sqlText(prepared.context.view_policy_revision_id)}
    );
    COMMIT;`;
  try {
    await sqlite(prepared.sqliteBinary, prepared.storePath, command, { args: ["-batch", "-bail"], timeout: 20_000, maxBuffer: 4 * 1024 * 1024 });
  } catch {
    const raced = await readStoreOperationReceipt(prepared.sqliteBinary, prepared.storePath, prepared.operationId).catch(() => null);
    if (raced) return raced.request_digest === requestDigest
      ? success(operation, { ...raced.result, idempotent_replay: true, receipt: publicPolicyReceipt(raced) })
      : failure("idempotency_mismatch", "operation_id is already settled for a different canonical request.", { failureClass: "idempotency_mismatch", evidence: {} });
    return policyFailure("view_policy_revision_conflict", "The policy admission fence or exact predecessor changed; reconcile before retrying.", RETRY_DISPOSITIONS.AFTER_RECONCILE);
  }
  const receipt = await readStoreOperationReceipt(prepared.sqliteBinary, prepared.storePath, prepared.operationId);
  return success(operation, { ...result, idempotent_replay: false, receipt: publicPolicyReceipt(receipt) });
}

async function createViewPolicy(request) {
  validateExactPolicyRequest(request, ["policy"]);
  const policy = validatePolicyShape(request.policy);
  const prepared = await preparePolicyOperation(request);
  if (prepared.failure) return prepared.failure;
  const namespaces = await queryJson(prepared.sqliteBinary, prepared.storePath, `SELECT namespace_id FROM namespaces WHERE lifecycle='active' AND namespace_id IN (${policy.namespace_ids.map(sqlText).join(",")});`);
  if (namespaces.length !== policy.namespace_ids.length) return policyFailure("view_policy_invalid", "One or more policy namespace grants are unavailable.");
  const payload = { policy };
  const existingFamily = await queryJson(prepared.sqliteBinary, prepared.storePath, `SELECT 1 present FROM view_families WHERE view_id=${sqlText(policy.view_id)} LIMIT 1;`);
  if (existingFamily.length) {
    const requestDigest = policyRequestDigest(prepared, "view_policy.create", payload);
    return await replayPolicyReceipt(prepared, requestDigest)
      ?? policyFailure("view_policy_revision_conflict", "The stable view family already exists.", RETRY_DISPOSITIONS.AFTER_RECONCILE);
  }
  return commitPolicyChange(prepared, "view_policy.create", payload,
    (_fence, now) => ({ policy: { ...policy, revision_number: 1, predecessor_revision_id: null, lifecycle: "created", activation_fence: null, superseded_fence: null, retirement_fence: null, constructed_at: now, constructing_authority: prepared.authorityClaim } }),
    (_fence, now) => `
      INSERT INTO policy_guard VALUES(CASE WHEN NOT EXISTS(SELECT 1 FROM view_families WHERE view_id=${sqlText(policy.view_id)}) THEN 1 ELSE 0 END);
      INSERT INTO policy_guard VALUES(CASE WHEN NOT EXISTS(SELECT 1 FROM view_policy_revisions WHERE view_policy_revision_id=${sqlText(policy.view_policy_revision_id)}) THEN 1 ELSE 0 END);
      INSERT INTO view_families VALUES(${sqlText(policy.view_id)},${sqlText(policy.home_namespace_id)},${sqlText(now)});
      INSERT INTO view_policy_revisions (
        view_policy_revision_id,view_id,revision_number,audience_ceiling,lifecycle,
        authority_claim_json,object_kinds_json,store_operation_receipts_visible,
        predecessor_revision_id,activation_fence,created_at,limits_json,superseded_fence,retirement_fence
      ) VALUES (
        ${sqlText(policy.view_policy_revision_id)},${sqlText(policy.view_id)},1,'private','created',
        ${sqlText(JSON.stringify(prepared.authorityClaim))},${sqlText(JSON.stringify(policy.object_kinds))},${policy.store_operation_receipts_visible ? 1 : 0},
        NULL,NULL,${sqlText(now)},${sqlText(JSON.stringify(policy.limits))},NULL,NULL
      );
      ${policy.namespace_ids.map((namespaceId) => `INSERT INTO view_policy_namespace_grants VALUES(${sqlText(policy.view_policy_revision_id)},${sqlText(namespaceId)});`).join("\n")}`);
}

async function reviseViewPolicy(request) {
  validateExactPolicyRequest(request, ["predecessor_revision_id", "policy"]);
  const policy = validatePolicyShape(request.policy);
  const predecessorId = validateUuidId(request.predecessor_revision_id, "predecessor_revision_id", "view-policy");
  const prepared = await preparePolicyOperation(request);
  if (prepared.failure) return prepared.failure;
  const payload = { predecessor_revision_id: predecessorId, policy };
  const replay = await replayPolicyReceipt(prepared, policyRequestDigest(prepared, "view_policy.revise", payload));
  if (replay) return replay;
  const predecessor = await readPolicyRevision(prepared.sqliteBinary, prepared.storePath, predecessorId);
  const latest = await queryJson(prepared.sqliteBinary, prepared.storePath, `SELECT view_policy_revision_id,revision_number FROM view_policy_revisions WHERE view_id=${sqlText(policy.view_id)} ORDER BY revision_number DESC LIMIT 1;`);
  const namespaces = await queryJson(prepared.sqliteBinary, prepared.storePath, `SELECT namespace_id FROM namespaces WHERE lifecycle='active' AND namespace_id IN (${policy.namespace_ids.map(sqlText).join(",")});`);
  if (!predecessor || predecessor.view_id !== policy.view_id || predecessor.lifecycle === "retired"
    || latest[0]?.view_policy_revision_id !== predecessorId || namespaces.length !== policy.namespace_ids.length) {
    return policyFailure("view_policy_revision_conflict", "The exact latest non-retired predecessor and active namespace grants are required.", RETRY_DISPOSITIONS.AFTER_RECONCILE);
  }
  const revisionNumber = predecessor.revision_number + 1;
  return commitPolicyChange(prepared, "view_policy.revise", payload,
    (_fence, now) => ({ policy: { ...policy, revision_number: revisionNumber, predecessor_revision_id: predecessorId, lifecycle: "created", activation_fence: null, superseded_fence: null, retirement_fence: null, constructed_at: now, constructing_authority: prepared.authorityClaim } }),
    (fence, now) => `
      INSERT INTO policy_guard VALUES(CASE WHEN EXISTS(SELECT 1 FROM view_policy_revisions WHERE view_policy_revision_id=${sqlText(predecessorId)} AND view_id=${sqlText(policy.view_id)} AND revision_number=${predecessor.revision_number} AND lifecycle<>'retired') THEN 1 ELSE 0 END);
      INSERT INTO policy_guard VALUES(CASE WHEN ${predecessor.revision_number}=(SELECT max(revision_number) FROM view_policy_revisions WHERE view_id=${sqlText(policy.view_id)}) THEN 1 ELSE 0 END);
      ${predecessor.lifecycle === "created" ? `UPDATE view_policy_revisions SET lifecycle='superseded',superseded_fence=${fence} WHERE view_policy_revision_id=${sqlText(predecessorId)} AND lifecycle='created';` : ""}
      INSERT INTO view_policy_revisions (
        view_policy_revision_id,view_id,revision_number,audience_ceiling,lifecycle,
        authority_claim_json,object_kinds_json,store_operation_receipts_visible,
        predecessor_revision_id,activation_fence,created_at,limits_json,superseded_fence,retirement_fence
      ) VALUES (
        ${sqlText(policy.view_policy_revision_id)},${sqlText(policy.view_id)},${revisionNumber},'private','created',
        ${sqlText(JSON.stringify(prepared.authorityClaim))},${sqlText(JSON.stringify(policy.object_kinds))},${policy.store_operation_receipts_visible ? 1 : 0},
        ${sqlText(predecessorId)},NULL,${sqlText(now)},${sqlText(JSON.stringify(policy.limits))},NULL,NULL
      );
      ${policy.namespace_ids.map((namespaceId) => `INSERT INTO view_policy_namespace_grants VALUES(${sqlText(policy.view_policy_revision_id)},${sqlText(namespaceId)});`).join("\n")}`);
}

async function activateViewPolicy(request) {
  validateExactPolicyRequest(request, ["view_id", "view_policy_revision_id"]);
  const viewId = validateUuidId(request.view_id, "view_id", "view");
  const revisionId = validateUuidId(request.view_policy_revision_id, "view_policy_revision_id", "view-policy");
  const prepared = await preparePolicyOperation(request);
  if (prepared.failure) return prepared.failure;
  const payload = { view_id: viewId, view_policy_revision_id: revisionId };
  const replay = await replayPolicyReceipt(prepared, policyRequestDigest(prepared, "view_policy.activate", payload));
  if (replay) return replay;
  const candidate = await readPolicyRevision(prepared.sqliteBinary, prepared.storePath, revisionId);
  const latest = await queryJson(prepared.sqliteBinary, prepared.storePath, `SELECT max(revision_number) revision_number FROM view_policy_revisions WHERE view_id=${sqlText(viewId)};`);
  if (!candidate || candidate.view_id !== viewId || candidate.lifecycle !== "created" || candidate.revision_number !== latest[0]?.revision_number) {
    return policyFailure("view_policy_revision_conflict", "Only the exact latest created policy revision can be activated.", RETRY_DISPOSITIONS.AFTER_RECONCILE);
  }
  const activeRows = await queryJson(prepared.sqliteBinary, prepared.storePath, `SELECT view_policy_revision_id FROM view_policy_revisions WHERE view_id=${sqlText(viewId)} AND lifecycle='active' LIMIT 1;`);
  const supersededId = activeRows[0]?.view_policy_revision_id ?? null;
  return commitPolicyChange(prepared, "view_policy.activate", payload,
    (fence) => ({ policy: { ...candidate, lifecycle: "active", activation_fence: fence }, superseded_revision_id: supersededId }),
    (fence) => `
      INSERT INTO policy_guard VALUES(CASE WHEN EXISTS(SELECT 1 FROM view_policy_revisions WHERE view_policy_revision_id=${sqlText(revisionId)} AND view_id=${sqlText(viewId)} AND lifecycle='created' AND revision_number=(SELECT max(revision_number) FROM view_policy_revisions WHERE view_id=${sqlText(viewId)})) THEN 1 ELSE 0 END);
      ${supersededId == null ? "" : `UPDATE view_policy_revisions SET lifecycle='superseded',superseded_fence=${fence} WHERE view_policy_revision_id=${sqlText(supersededId)} AND lifecycle='active';`}
      UPDATE view_policy_revisions SET lifecycle='active',activation_fence=${fence} WHERE view_policy_revision_id=${sqlText(revisionId)} AND lifecycle='created';
      INSERT INTO policy_guard VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END);`);
}

async function retireViewPolicy(request) {
  validateExactPolicyRequest(request, ["view_id", "view_policy_revision_id"]);
  const viewId = validateUuidId(request.view_id, "view_id", "view");
  const revisionId = validateUuidId(request.view_policy_revision_id, "view_policy_revision_id", "view-policy");
  const prepared = await preparePolicyOperation(request);
  if (prepared.failure) return prepared.failure;
  const payload = { view_id: viewId, view_policy_revision_id: revisionId };
  const replay = await replayPolicyReceipt(prepared, policyRequestDigest(prepared, "view_policy.retire", payload));
  if (replay) return replay;
  const candidate = await readPolicyRevision(prepared.sqliteBinary, prepared.storePath, revisionId);
  if (!candidate || candidate.view_id !== viewId || candidate.lifecycle !== "active") {
    return policyFailure("view_policy_revision_conflict", "Only the exact active policy revision can be retired.", RETRY_DISPOSITIONS.AFTER_RECONCILE);
  }
  return commitPolicyChange(prepared, "view_policy.retire", payload,
    (fence) => ({ policy: { ...candidate, lifecycle: "retired", retirement_fence: fence } }),
    (fence) => `
      UPDATE view_policy_revisions SET lifecycle='retired',retirement_fence=${fence} WHERE view_policy_revision_id=${sqlText(revisionId)} AND view_id=${sqlText(viewId)} AND lifecycle='active';
      INSERT INTO policy_guard VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END);`);
}

function assetDigest(manifest, assetId) {
  return manifest.assets.find((asset) => asset.id === assetId)?.sha256 ?? null;
}

async function initializeStore(request) {
  const operationId = validateOperationId(request.operation_id);
  const authorityClaim = validateAuthorityClaim(request.authority_claim);
  const prepared = await prepare(request);
  if (prepared.failure) return prepared.failure;

  const { configuration, manifestCheck, sqliteBinary } = prepared;
  const storePath = configuration.sqlite.store_path;
  const state = await inspectStore(sqliteBinary, storePath);

  if (state.status === "available") {
    // Receipt-first recovery: the requested operation receipt is examined before
    // any attempt to reinterpret or repeat initialization.
    const requestReceipt = await readStoreOperationReceipt(sqliteBinary, storePath, operationId);
    if (requestReceipt) {
      const expectedDigest = initializationRequestDigest(state.metadata.store_id, operationId, authorityClaim);
      if (requestReceipt.operation_kind !== "initialize_store" || requestReceipt.request_digest !== expectedDigest) {
        return failure("idempotency_mismatch", "operation_id is already settled for a different canonical request.", {
          failureClass: "idempotency_mismatch",
          retryDisposition: RETRY_DISPOSITIONS.NEVER,
          correctiveGuidance: "Do not retry with this operation_id. Reconcile against the settled receipt.",
          evidence: { operation_id: operationId, settled_kind: requestReceipt.operation_kind },
        });
      }
      return success("initialize_store", requestReceipt.result);
    }

    const original = await readStoreOperationReceipt(
      sqliteBinary,
      storePath,
      state.metadata.initialization_operation_id,
    );
    if (!original || original.operation_kind !== "initialize_store") {
      return storeStateFailure({ status: "unavailable", code: "store_partial_initialization", evidence: { initialization_receipt: "unavailable" } });
    }
    return success("initialize_store", original.result);
  }

  if (state.status !== "absent") return storeStateFailure(state);

  const initializedAt = new Date().toISOString();
  const identities = {
    storeId: `store:${randomUUID()}`,
    namespaceId: `namespace:${randomUUID()}`,
    viewId: `view:${randomUUID()}`,
    viewPolicyRevisionId: `view-policy:${randomUUID()}`,
  };
  const requestDigest = initializationRequestDigest(identities.storeId, operationId, authorityClaim);
  const migration = {
    id: "0001-initialize-store",
    schema_asset_sha256: assetDigest(manifestCheck.manifest, "sqlite-schema"),
    manifest_sha256: assetDigest(manifestCheck.manifest, "sqlite-migrations"),
  };
  const initialization = {
    store_id: identities.storeId,
    namespace: { id: identities.namespaceId, key: "personal", lifecycle: "active" },
    view: {
      id: identities.viewId,
      policy_revision_id: identities.viewPolicyRevisionId,
      policy_revision: 1,
      lifecycle: "active",
      audience_ceiling: "private",
      namespace_ids: [identities.namespaceId],
    },
    schema: {
      id: SCHEMA_ID,
      version: SCHEMA_VERSION,
      asset_sha256: migration.schema_asset_sha256,
      migration: { id: migration.id, manifest_sha256: migration.manifest_sha256 },
    },
    protocol: { id: PROTOCOL_ID, version: PROTOCOL_VERSION },
    package: {
      manifest_sha256: manifestCheck.manifest_sha256,
      content_digest: manifestCheck.manifest.content_digest.sha256,
    },
    initialized_at: initializedAt,
  };
  const resultDigest = digest(initialization);
  const result = {
    status: "settled",
    initialization,
    receipt: {
      operation_id: operationId,
      operation_kind: "initialize_store",
      store_id: identities.storeId,
      request_digest: requestDigest,
      outcome: "initialized",
      result_digest: resultDigest,
      settled_at: initializedAt,
      failure_class: null,
      retry_disposition: RETRY_DISPOSITIONS.NEVER,
      operation_fence: 1,
    },
  };

  try {
    await createInitializedStore(sqliteBinary, storePath, {
      identities,
      initializedAt,
      authorityClaim,
      protocol: { id: PROTOCOL_ID, version: PROTOCOL_VERSION },
      migration,
      receipt: {
        operation_id: operationId,
        request_digest: requestDigest,
        result_digest: resultDigest,
        result,
      },
    });
  } catch (error) {
    return failure("initialization_unavailable", "Atomic store initialization did not complete and no partial store is exposed as usable.", {
      failureClass: "store_unavailable",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE,
      correctiveGuidance: "Query the store-operation receipt before any retry. Inspect any existing target through explicit operator action.",
      evidence: { target_previously_absent: true, failure: error?.code ?? "initialization_failed" },
    });
  }
  return success("initialize_store", result);
}

function validateLookupContext(context) {
  if (!context || typeof context !== "object"
    || !nonEmpty(context.view_id)
    || !nonEmpty(context.view_policy_revision_id)
    || !nonEmpty(context.purpose)) {
    throw new ConfigurationError(
      "view_context_required",
      "Receipt lookup requires view_id, exact view_policy_revision_id, and purpose.",
    );
  }
  return {
    view_id: context.view_id,
    view_policy_revision_id: context.view_policy_revision_id,
    purpose: context.purpose,
  };
}

async function getStoreOperationReceipt(request) {
  const operationId = validateOperationId(request.operation_id);
  const authorityClaim = validateAuthorityClaim(request.authority_claim);
  const context = validateLookupContext(request.context);
  if (!nonEmpty(request.store_id)) {
    throw new ConfigurationError("store_id_invalid", "store_id is required for store-operation receipt lookup.");
  }
  const prepared = await prepare(request);
  if (prepared.failure) return prepared.failure;

  const { configuration, sqliteBinary } = prepared;
  const state = await inspectStore(sqliteBinary, configuration.sqlite.store_path);
  if (state.status !== "available") {
    // Receipt lookup has not established visibility yet. Keep this unavailable
    // union deliberately opaque; detailed store inspection belongs only in an
    // explicitly authorized operator diagnostic, never this recovery surface.
    return success("get_store_operation_receipt", {
      status: "store_unavailable",
      failure_class: state.status === "migration_required" ? "schema_migration_required" : "store_unavailable",
      code: state.code ?? "store_unavailable",
      retry_disposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
    });
  }

  const visible = request.store_id === state.metadata.store_id
    && await activeOperationalView(sqliteBinary, configuration.sqlite.store_path, context);
  if (!visible) return success("get_store_operation_receipt", { status: "not_visible" });

  const receipt = await readStoreOperationReceipt(sqliteBinary, configuration.sqlite.store_path, operationId);
  if (!receipt) {
    return success("get_store_operation_receipt", {
      status: "absent_at_fence",
      operation_fence: state.operation_fence,
    });
  }
  // This public exceptional recovery surface is deliberately restricted to
  // accepted exceptional operation kinds. Owner commit receipts are private
  // mechanical material and must be recovered only through a future typed
  // owner façade operation, not leaked through store-operation lookup.
  if (receipt.operation_kind !== "initialize_store" && !receipt.operation_kind.startsWith("view_policy.")) {
    return success("get_store_operation_receipt", { status: "not_visible" });
  }
  return success("get_store_operation_receipt", {
    status: "settled",
    receipt,
    lookup_authority_claim: authorityClaim,
  });
}

export async function invokeExceptionalOperation(request) {
  try {
    if (request.operation === "initialize_store") return await initializeStore(request);
    if (request.operation === "get_store_operation_receipt") return await getStoreOperationReceipt(request);
    if (request.operation === "view_policy.create") return await createViewPolicy(request);
    if (request.operation === "view_policy.revise") return await reviseViewPolicy(request);
    if (request.operation === "view_policy.activate") return await activateViewPolicy(request);
    if (request.operation === "view_policy.retire") return await retireViewPolicy(request);
    return unsupported(request.operation);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      const authorityError = error.code === "human_authority_claim_required" || error.code === "authority_claim_invalid";
      return failure(error.code, error.message, {
        failureClass: authorityError ? "authority_required" : "configuration_or_store_unavailable",
        evidence: error.evidence,
      });
    }
    return failure("internal_failure", "Exceptional operation failed without mutating accepted store state.", {
      failureClass: "internal_failure",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      correctiveGuidance: "Inspect diagnostics and query any uncertain operation receipt before retrying.",
      evidence: { error_code: "unexpected_exception" },
    });
  }
}
