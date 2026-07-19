import { createHash } from "node:crypto";
import path from "node:path";
import { validateAuthorityConfiguration, ConfigurationError } from "../../../../shared/config.mjs";
import { loadAndValidateManifest } from "../../../../shared/manifest.mjs";
import {
  failure,
  RETRY_DISPOSITIONS,
  success,
} from "../../../../shared/protocol.mjs";
import {
  nodeRuntimeIncompatibility,
  probeSqlite,
  selectSqliteBinary,
  sqlite,
} from "./diagnostics.mjs";
import { inspectStore, readStoreOperationReceipt } from "./index.mjs";

const MAX_VERSIONS = 256;
const MAX_SELECTIONS = 256;
const MAX_OUTBOX = 64;
const MAX_LIST_SCAN = 256;
const MAX_CURRENT_PAGE = 100;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const UUID_ID = new RegExp(`^[a-z][a-z0-9_-]*:${UUID}$`);
const OWNER_KIND = /^[a-z][a-z0-9_-]{0,63}$/;
const DIGEST = /^[0-9a-f]{64}$/;

class RequestError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.code = code;
    this.failureClass = options.failureClass ?? "representation_invalid";
    this.retryDisposition = options.retryDisposition ?? RETRY_DISPOSITIONS.NEVER;
    this.evidence = options.evidence ?? {};
  }
}

export function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function mechanicalDigest(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

// This key is intentionally available only to in-process persistence façades. It is
// derived from immutable, verified store identity metadata and is never returned by
// a mechanical or semantic operation.
export async function deriveInternalCursorSigningKey(configuration, storeId) {
  const prepared = await prepare({ configuration });
  if (prepared.failure || prepared.state.metadata.store_id !== storeId) return null;
  return createHash("sha256").update(canonicalJson({
    domain: "casebook-internal-cursor-signing-key@1",
    store_id: prepared.state.metadata.store_id,
    initialization_operation_id: prepared.state.metadata.initialization_operation_id,
  })).digest();
}


export function canonicalCommitRequestDigest(storeId, context, envelope) {
  const canonicalEnvelope = { ...envelope };
  delete canonicalEnvelope.request_digest;
  return mechanicalDigest({
    operation: "commit_owner_revision",
    resolved_store_id: storeId,
    context,
    envelope: canonicalEnvelope,
  });
}

function sqlText(value) {
  if (value == null) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}

function nonEmpty(value, max = 512) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function requireObject(value, field) {
  if (!object(value)) throw new RequestError("representation_invalid", `${field} must be an object.`);
  return value;
}

function requireString(value, field, max = 512) {
  if (!nonEmpty(value, max)) throw new RequestError("representation_invalid", `${field} must be a non-empty bounded string.`);
  return value;
}

function requireUuidId(value, field, prefix = null) {
  requireString(value, field, 128);
  if (!UUID_ID.test(value) || (prefix && !value.startsWith(`${prefix}:`))) {
    throw new RequestError("identity_invalid", `${field} must be a lowercase UUID-based identity${prefix ? ` with ${prefix}: prefix` : ""}.`);
  }
  return value;
}

function requireDigest(value, field) {
  if (!DIGEST.test(value ?? "")) throw new RequestError("representation_invalid", `${field} must be a lowercase sha256 digest.`);
  return value;
}

function contextShape(value) {
  requireObject(value, "context");
  const context = {
    view_id: requireUuidId(value.view_id, "context.view_id", "view"),
    view_policy_revision_id: requireUuidId(value.view_policy_revision_id, "context.view_policy_revision_id", "view-policy"),
    purpose: requireString(value.purpose, "context.purpose"),
  };
  if (value.requested_audience_ceiling != null) {
    context.requested_audience_ceiling = requireString(value.requested_audience_ceiling, "context.requested_audience_ceiling", 64);
  }
  return context;
}

function provenanceShape(value) {
  if (value == null) return {};
  requireObject(value, "envelope.provenance");
  const result = {};
  for (const key of ["causation", "correlation", "session", "acting_role", "authority_basis", "commit_basis"]) {
    if (value[key] != null) result[key] = requireString(value[key], `envelope.provenance.${key}`);
  }
  return result;
}

function validateEnvelope(value) {
  requireObject(value, "envelope");
  if (value.envelope_version !== 1) throw new RequestError("representation_incompatible", "envelope_version must be 1.");
  const operationId = requireString(value.operation_id, "envelope.operation_id", 256);
  const storeId = requireUuidId(value.store_id, "envelope.store_id", "store");
  const owner = requireObject(value.owner, "envelope.owner");
  const kind = requireString(owner.kind, "envelope.owner.kind", 64);
  if (!OWNER_KIND.test(kind)) throw new RequestError("identity_invalid", "envelope.owner.kind has invalid syntax.");
  const ownerId = requireUuidId(owner.id, "envelope.owner.id", kind);
  const homeNamespaceId = requireUuidId(owner.home_namespace_id, "envelope.owner.home_namespace_id", "namespace");
  if (!Number.isInteger(value.expected_revision) || value.expected_revision < 0) {
    throw new RequestError("representation_invalid", "envelope.expected_revision must be an integer at least 0.");
  }
  const representation = requireObject(value.representation, "envelope.representation");
  requireString(representation.id, "envelope.representation.id", 128);
  if (!Number.isInteger(representation.version) || representation.version < 1) {
    throw new RequestError("representation_invalid", "envelope.representation.version must be a positive integer.");
  }
  const revision = requireObject(value.revision, "envelope.revision");
  requireUuidId(revision.id, "envelope.revision.id", "owner-revision");
  if (revision.number !== value.expected_revision + 1) {
    throw new RequestError("representation_invalid", "revision.number must be exactly expected_revision + 1.");
  }
  requireObject(revision.normalized, "envelope.revision.normalized");
  requireObject(value.current_projection, "envelope.current_projection");
  const structuralClaims = value.current_projection.structural_claims ?? [];
  if (!Array.isArray(structuralClaims) || structuralClaims.length > MAX_SELECTIONS) {
    throw new RequestError("representation_invalid", "envelope.current_projection.structural_claims must be a bounded array.");
  }
  const claimKeys = new Set();
  for (const claim of structuralClaims) {
    requireObject(claim, "envelope.current_projection.structural_claims[]");
    const namespaceId = requireUuidId(claim.namespace_id, "envelope.current_projection.structural_claims[].namespace_id", "namespace");
    const claimType = requireString(claim.claim_type, "envelope.current_projection.structural_claims[].claim_type", 128);
    const normalizedValue = requireString(claim.normalized_value, "envelope.current_projection.structural_claims[].normalized_value", 512);
    const key = `${namespaceId}\u0000${claimType}\u0000${normalizedValue}`;
    if (claimKeys.has(key)) throw new RequestError("representation_invalid", "envelope.current_projection.structural_claims contains a duplicate claim.");
    claimKeys.add(key);
  }
  if (!Array.isArray(revision.versions) || revision.versions.length > MAX_VERSIONS) {
    throw new RequestError("representation_invalid", `revision.versions must be an array of at most ${MAX_VERSIONS} items.`);
  }
  if (!Array.isArray(revision.selections) || revision.selections.length > MAX_SELECTIONS) {
    throw new RequestError("representation_invalid", `revision.selections must be an array of at most ${MAX_SELECTIONS} items.`);
  }

  const versionIds = new Set();
  const newVersions = new Map();
  for (const version of revision.versions) {
    requireObject(version, "revision.versions[]");
    const versionId = requireUuidId(version.version_id, "revision.versions[].version_id", "version");
    const familyId = requireUuidId(version.family_id, "revision.versions[].family_id");
    requireObject(version.content, "revision.versions[].content");
    requireDigest(version.content_digest, "revision.versions[].content_digest");
    if (version.content_digest !== mechanicalDigest(version.content)) {
      throw new RequestError("representation_invalid", "A version content_digest does not match its canonical content.");
    }
    if (versionIds.has(versionId)) throw new RequestError("representation_invalid", "revision.versions contains a duplicate version_id.");
    versionIds.add(versionId);
    newVersions.set(versionId, { familyId, version });
  }

  const selectedFamilies = new Set();
  for (const selection of revision.selections) {
    requireObject(selection, "revision.selections[]");
    const familyId = requireUuidId(selection.family_id, "revision.selections[].family_id");
    const versionId = requireUuidId(selection.version_id, "revision.selections[].version_id", "version");
    if (selectedFamilies.has(familyId)) throw new RequestError("representation_invalid", "revision.selections contains a duplicate family_id.");
    selectedFamilies.add(familyId);
    if (newVersions.has(versionId) && newVersions.get(versionId).familyId !== familyId) {
      throw new RequestError("representation_invalid", "A selected new version does not belong to its selected family.");
    }
  }
  for (const { familyId } of newVersions.values()) {
    if (!selectedFamilies.has(familyId)) {
      throw new RequestError("representation_invalid", "Every submitted immutable version must be selected by the complete revision.");
    }
  }

  const event = requireObject(value.event, "envelope.event");
  requireUuidId(event.id, "envelope.event.id", "event");
  requireString(event.type, "envelope.event.type", 128);
  if (!Number.isInteger(event.schema_version) || event.schema_version < 1) {
    throw new RequestError("representation_invalid", "envelope.event.schema_version must be a positive integer.");
  }
  requireObject(event.payload, "envelope.event.payload");
  requireDigest(event.payload_digest, "envelope.event.payload_digest");
  if (event.payload_digest !== mechanicalDigest(event.payload)) {
    throw new RequestError("representation_invalid", "event.payload_digest does not match its canonical payload.");
  }
  if (event.visibility_ceiling !== "private") {
    throw new RequestError("representation_invalid", "The minimal envelope supports only a private event visibility ceiling.");
  }

  if (!Array.isArray(value.outbox) || value.outbox.length > MAX_OUTBOX) {
    throw new RequestError("representation_invalid", `envelope.outbox must be an array of at most ${MAX_OUTBOX} items.`);
  }
  const outboxIds = new Set();
  for (const item of value.outbox) {
    requireObject(item, "envelope.outbox[]");
    const id = requireUuidId(item.id, "envelope.outbox[].id", "outbox");
    if (outboxIds.has(id)) throw new RequestError("representation_invalid", "envelope.outbox contains a duplicate id.");
    outboxIds.add(id);
    requireString(item.kind, "envelope.outbox[].kind", 128);
    requireObject(item.payload, "envelope.outbox[].payload");
    requireDigest(item.payload_digest, "envelope.outbox[].payload_digest");
    if (item.payload_digest !== mechanicalDigest(item.payload)) {
      throw new RequestError("representation_invalid", "An outbox payload_digest does not match its canonical payload.");
    }
  }

  requireDigest(value.request_digest, "envelope.request_digest");
  return {
    ...value,
    operation_id: operationId,
    store_id: storeId,
    owner: { id: ownerId, kind, home_namespace_id: homeNamespaceId },
    provenance: provenanceShape(value.provenance),
  };
}

async function queryJson(binary, database, query) {
  // query_only is WAL-aware and blocks SQL mutation without hiding committed
  // frames in the mutable store's WAL file.
  const { stdout } = await sqlite(binary, database, `PRAGMA query_only = ON;\n${query}`, {
    args: ["-batch", "-bail", "-json"],
    maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(stdout || "[]");
}

function stateFailure(state) {
  const migration = state.status === "migration_required";
  return failure(state.code ?? "store_unavailable", "The configured store is unavailable and was not modified.", {
    failureClass: migration ? "schema_migration_required" : "store_unavailable",
    retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
    correctiveGuidance: "Run diagnostics and an explicitly authorized repair, restore, or migration operation.",
    evidence: migration ? state.evidence : {},
  });
}

async function prepare(request) {
  const runtimeFailure = nodeRuntimeIncompatibility({ path: process.execPath, version: process.versions.node });
  if (runtimeFailure) return { failure: runtimeFailure };
  const configuration = validateAuthorityConfiguration(request.configuration);
  if (configuration.authority_mode !== "sqlite") {
    return { failure: failure("sqlite_authority_required", "This operation requires explicitly selected sqlite authority.", {
      failureClass: "configuration_or_store_unavailable",
    }) };
  }
  const manifest = await loadAndValidateManifest();
  if (!manifest.ok) {
    return { failure: failure("asset_incompatible", "Package manifest or asset verification failed.", {
      failureClass: "asset_incompatible",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      evidence: { problems: manifest.problems },
    }) };
  }
  const selected = await selectSqliteBinary(configuration.sqlite.sqlite_bin);
  const probe = await probeSqlite(selected.path, path.dirname(configuration.sqlite.store_path));
  if (!probe.ok) {
    return { failure: failure("sqlite_feature_unsupported", "Selected SQLite runtime does not satisfy package requirements.", {
      failureClass: "sqlite_feature_unsupported",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      evidence: { version: probe.version, features: probe.features, problems: probe.problems },
    }) };
  }
  const state = await inspectStore(selected.path, configuration.sqlite.store_path);
  if (state.status !== "available") return { failure: stateFailure(state) };
  return { binary: selected.path, storePath: configuration.sqlite.store_path, state };
}

async function validateActiveView(binary, storePath, state, context, owner = null) {
  if (context.requested_audience_ceiling != null && context.requested_audience_ceiling !== "private") {
    return { failure: failure("view_invalid", "The requested view context cannot widen the active policy.", {
      failureClass: "view_invalid",
      retryDisposition: RETRY_DISPOSITIONS.NEVER,
    }) };
  }
  const rows = await queryJson(binary, storePath, `
    SELECT vf.view_id, vpr.view_policy_revision_id, vpr.audience_ceiling,
      vpr.object_kinds_json, vf.home_namespace_id
    FROM view_families vf
    JOIN view_policy_revisions vpr ON vpr.view_id = vf.view_id
    WHERE vf.view_id = ${sqlText(context.view_id)}
      AND vpr.view_policy_revision_id = ${sqlText(context.view_policy_revision_id)}
      AND vpr.lifecycle = 'active'
      AND vpr.audience_ceiling = 'private'
    LIMIT 1;
  `);
  if (!rows.length || context.view_id !== state.view.view_id || context.view_policy_revision_id !== state.view.view_policy_revision_id) {
    return { failure: failure("view_invalid", "The exact active view-policy revision is invalid or unavailable.", {
      failureClass: "view_invalid",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE,
      evidence: {},
    }) };
  }
  if (!owner) return { policy: rows[0] };
  const visibility = await queryJson(binary, storePath, `
    SELECT EXISTS(
      SELECT 1
      FROM view_policy_namespace_grants grant
      JOIN namespaces ns ON ns.namespace_id = grant.namespace_id AND ns.lifecycle = 'active'
      JOIN view_policy_revisions vpr ON vpr.view_policy_revision_id = grant.view_policy_revision_id
      JOIN json_each(vpr.object_kinds_json) kind
      WHERE grant.view_policy_revision_id = ${sqlText(context.view_policy_revision_id)}
        AND grant.namespace_id = ${sqlText(owner.home_namespace_id)}
        AND kind.value = ${sqlText(owner.kind)}
    ) AS visible;
  `);
  if (visibility[0]?.visible !== 1) {
    return { failure: failure("not_visible", "The requested owner target is unknown or not visible under the active policy.", {
      failureClass: "not_visible",
      retryDisposition: RETRY_DISPOSITIONS.NEVER,
      evidence: {},
    }) };
  }
  return { policy: rows[0] };
}

function publicReceipt(receipt) {
  return {
    operation_id: receipt.operation_id,
    operation_kind: receipt.operation_kind,
    store_id: receipt.store_id,
    owner_id: receipt.owner_id,
    owner_kind: receipt.owner_kind,
    owner_home_namespace_id: receipt.owner_home_namespace_id,
    request_digest: receipt.request_digest,
    expected_revision: receipt.expected_revision,
    observed_revision: receipt.observed_revision,
    committed_revision: receipt.committed_revision,
    outcome: receipt.outcome,
    result_digest: receipt.result_digest,
    event_id: receipt.event_id,
    settled_at: receipt.settled_at,
    failure_class: receipt.failure_class,
    retry_disposition: receipt.retry_disposition,
    operation_fence: receipt.operation_fence,
    authority_claim: receipt.authority_claim,
  };
}

function responseFromReceipt(receipt, replay) {
  if (receipt.outcome !== "committed") return receipt.result;
  return success("commit_owner_revision", {
    ...receipt.result,
    idempotent_replay: replay,
    receipt: publicReceipt(receipt),
  });
}

function idempotencyMismatch(operationId) {
  return failure("idempotency_mismatch", "operation_id is already settled for a different canonical request in this store.", {
    failureClass: "idempotency_mismatch",
    retryDisposition: RETRY_DISPOSITIONS.NEVER,
    correctiveGuidance: "Do not retry with this operation_id. Reconcile against the settled receipt.",
    evidence: { operation_id: operationId },
  });
}

function identityConflict() {
  return failure("identity_conflict", "One or more submitted stable identities are already allocated incompatibly in this store.", {
    failureClass: "identity_conflict",
    retryDisposition: RETRY_DISPOSITIONS.NEVER,
    correctiveGuidance: "Do not retry with the colliding identities. Reconcile and allocate new identities through the owning typed facade.",
    evidence: {},
  });
}

function sqlList(values) {
  return values.length ? values.map(sqlText).join(", ") : "NULL";
}

async function hasStructuralClaimConflict(binary, storePath, envelope) {
  const claims = envelope.current_projection.structural_claims ?? [];
  for (const claim of claims) {
    const rows = await queryJson(binary, storePath, `SELECT EXISTS(
      SELECT 1 FROM owner_current other
      JOIN json_each(other.projection_json, '$.structural_claims') existing
      WHERE other.owner_id <> ${sqlText(envelope.owner.id)}
        AND json_extract(existing.value, '$.namespace_id') = ${sqlText(claim.namespace_id)}
        AND json_extract(existing.value, '$.claim_type') = ${sqlText(claim.claim_type)}
        AND json_extract(existing.value, '$.normalized_value') = ${sqlText(claim.normalized_value)}
    ) AS claim_conflict;`);
    if (rows[0]?.claim_conflict === 1) return true;
  }
  return false;
}

async function hasAllocatedIdentityConflict(binary, storePath, envelope) {
  const versionIds = envelope.revision.versions.map((item) => item.version_id);
  const familyIds = [...new Set([
    ...envelope.revision.versions.map((item) => item.family_id),
    ...envelope.revision.selections.map((item) => item.family_id),
  ])];
  const outboxIds = envelope.outbox.map((item) => item.id);
  const rows = await queryJson(binary, storePath, `
    SELECT
      EXISTS(SELECT 1 FROM owner_revisions WHERE revision_id = ${sqlText(envelope.revision.id)})
      OR EXISTS(SELECT 1 FROM owner_events WHERE event_id = ${sqlText(envelope.event.id)})
      OR EXISTS(SELECT 1 FROM owner_versions WHERE version_id IN (${sqlList(versionIds)}))
      OR EXISTS(SELECT 1 FROM owner_outbox WHERE outbox_id IN (${sqlList(outboxIds)}))
      OR EXISTS(
        SELECT 1 FROM owner_family_bindings
        WHERE family_id IN (${sqlList(familyIds)}) AND owner_id <> ${sqlText(envelope.owner.id)}
      ) AS identity_conflict;
  `);
  return rows[0]?.identity_conflict === 1;
}

async function settleFailure(binary, storePath, state, envelope, context, response, observedRevision) {
  const now = new Date().toISOString();
  const resultDigest = mechanicalDigest(response);
  const command = `.bail on\nPRAGMA foreign_keys = ON;\nPRAGMA busy_timeout = 5000;\nBEGIN IMMEDIATE;\n
    CREATE TEMP TABLE commit_guard (valid INTEGER CHECK (valid = 1));
    INSERT INTO commit_guard VALUES (CASE WHEN NOT EXISTS(
      SELECT 1 FROM store_operation_receipts WHERE operation_id = ${sqlText(envelope.operation_id)}
    ) THEN 1 ELSE 0 END);
    UPDATE store_fence SET operation_fence = operation_fence + 1 WHERE singleton = 1;
    INSERT INTO store_operation_receipts (
      operation_id, operation_kind, store_id, request_digest, outcome, result_json,
      result_digest, authority_claim_json, settled_at, failure_class, retry_disposition,
      operation_fence, owner_id, owner_kind, owner_home_namespace_id, view_policy_revision_id,
      expected_revision, observed_revision, committed_revision, event_id
    ) VALUES (
      ${sqlText(envelope.operation_id)}, 'commit_owner_revision', ${sqlText(state.metadata.store_id)},
      ${sqlText(envelope.request_digest)}, 'rejected', ${sqlText(JSON.stringify(response))},
      ${sqlText(resultDigest)}, ${sqlText(JSON.stringify(envelope.provenance))}, ${sqlText(now)},
      ${sqlText(response.failure.class)}, ${sqlText(response.failure.retry_disposition)},
      (SELECT operation_fence FROM store_fence WHERE singleton = 1),
      ${sqlText(envelope.owner.id)}, ${sqlText(envelope.owner.kind)}, ${sqlText(envelope.owner.home_namespace_id)},
      ${sqlText(context.view_policy_revision_id)}, ${envelope.expected_revision}, ${observedRevision}, NULL, NULL
    );
    COMMIT;
  `;
  await sqlite(binary, storePath, command, { args: ["-batch", "-bail"], timeout: 20_000, maxBuffer: 4 * 1024 * 1024 });
  return response;
}

async function ownerState(binary, storePath, ownerId) {
  const rows = await queryJson(binary, storePath, `
    SELECT o.owner_id, o.owner_kind, o.home_namespace_id,
      c.revision_id, c.revision_number
    FROM owners o
    LEFT JOIN owner_current c ON c.owner_id = o.owner_id
    WHERE o.owner_id = ${sqlText(ownerId)}
    LIMIT 1;
  `);
  return rows[0] ?? null;
}

function buildCommitSql(state, context, envelope, coreResult, now) {
  const owner = envelope.owner;
  const revision = envelope.revision;
  const familyIds = [...new Set([
    ...revision.versions.map((item) => item.family_id),
    ...revision.selections.map((item) => item.family_id),
  ])];
  const statements = [
    ".bail on",
    "PRAGMA foreign_keys = ON;",
    "PRAGMA busy_timeout = 5000;",
    "BEGIN IMMEDIATE;",
    "CREATE TEMP TABLE commit_guard (valid INTEGER CHECK (valid = 1));",
    `INSERT INTO commit_guard VALUES (CASE WHEN NOT EXISTS(SELECT 1 FROM store_operation_receipts WHERE operation_id = ${sqlText(envelope.operation_id)}) THEN 1 ELSE 0 END);`,
    `INSERT INTO commit_guard VALUES (CASE WHEN EXISTS(
      SELECT 1 FROM view_policy_revisions vpr
      JOIN view_policy_namespace_grants grant ON grant.view_policy_revision_id = vpr.view_policy_revision_id
      JOIN namespaces ns ON ns.namespace_id = grant.namespace_id AND ns.lifecycle = 'active'
      JOIN json_each(vpr.object_kinds_json) kind
      WHERE vpr.view_policy_revision_id = ${sqlText(context.view_policy_revision_id)}
        AND vpr.view_id = ${sqlText(context.view_id)} AND vpr.lifecycle = 'active'
        AND grant.namespace_id = ${sqlText(owner.home_namespace_id)} AND kind.value = ${sqlText(owner.kind)}
    ) THEN 1 ELSE 0 END);`,
    `INSERT INTO commit_guard VALUES (CASE WHEN NOT EXISTS(
      SELECT 1 FROM owner_revisions WHERE revision_id = ${sqlText(revision.id)}
    ) THEN 1 ELSE 0 END);`,
    `INSERT INTO commit_guard VALUES (CASE WHEN NOT EXISTS(
      SELECT 1 FROM owner_events WHERE event_id = ${sqlText(envelope.event.id)}
    ) THEN 1 ELSE 0 END);`,
    `INSERT INTO commit_guard VALUES (CASE WHEN NOT EXISTS(
      SELECT 1 FROM owner_versions WHERE version_id IN (${sqlList(revision.versions.map((item) => item.version_id))})
    ) THEN 1 ELSE 0 END);`,
    `INSERT INTO commit_guard VALUES (CASE WHEN NOT EXISTS(
      SELECT 1 FROM owner_outbox WHERE outbox_id IN (${sqlList(envelope.outbox.map((item) => item.id))})
    ) THEN 1 ELSE 0 END);`,
    `INSERT INTO commit_guard VALUES (CASE WHEN NOT EXISTS(
      SELECT 1 FROM owner_family_bindings
      WHERE family_id IN (${sqlList(familyIds)}) AND owner_id <> ${sqlText(owner.id)}
    ) THEN 1 ELSE 0 END);`,
  ];
  if (envelope.expected_revision === 0) {
    statements.push(
      `INSERT INTO commit_guard VALUES (CASE WHEN NOT EXISTS(SELECT 1 FROM owners WHERE owner_id = ${sqlText(owner.id)}) THEN 1 ELSE 0 END);`,
      `INSERT INTO owners VALUES (${sqlText(owner.id)}, ${sqlText(owner.kind)}, ${sqlText(owner.home_namespace_id)}, ${sqlText(now)});`,
    );
  } else {
    statements.push(`INSERT INTO commit_guard VALUES (CASE WHEN EXISTS(
      SELECT 1 FROM owners o JOIN owner_current c ON c.owner_id = o.owner_id
      WHERE o.owner_id = ${sqlText(owner.id)} AND o.owner_kind = ${sqlText(owner.kind)}
        AND o.home_namespace_id = ${sqlText(owner.home_namespace_id)}
        AND c.revision_number = ${envelope.expected_revision}
    ) THEN 1 ELSE 0 END);`);
  }
  for (const familyId of familyIds) {
    statements.push(
      `INSERT OR IGNORE INTO owner_family_bindings VALUES (${sqlText(familyId)}, ${sqlText(owner.id)}, ${sqlText(now)});`,
      `INSERT INTO commit_guard VALUES (CASE WHEN EXISTS(
        SELECT 1 FROM owner_family_bindings
        WHERE family_id = ${sqlText(familyId)} AND owner_id = ${sqlText(owner.id)}
      ) THEN 1 ELSE 0 END);`,
    );
  }
  for (const version of revision.versions) {
    statements.push(`INSERT INTO owner_versions VALUES (
      ${sqlText(version.version_id)}, ${sqlText(owner.id)}, ${sqlText(version.family_id)},
      ${sqlText(JSON.stringify(version.content))}, ${sqlText(version.content_digest)}, ${sqlText(now)}
    );`);
  }
  statements.push(`INSERT INTO owner_revisions VALUES (
    ${sqlText(revision.id)}, ${sqlText(owner.id)}, ${revision.number},
    ${sqlText(JSON.stringify(revision.normalized))}, ${sqlText(envelope.representation.id)},
    ${envelope.representation.version}, ${sqlText(envelope.operation_id)}, ${sqlText(now)}
  );`);
  for (const selection of revision.selections) {
    statements.push(
      `INSERT INTO commit_guard VALUES (CASE WHEN EXISTS(
        SELECT 1 FROM owner_versions WHERE version_id = ${sqlText(selection.version_id)}
          AND owner_id = ${sqlText(owner.id)} AND family_id = ${sqlText(selection.family_id)}
      ) THEN 1 ELSE 0 END);`,
      `INSERT INTO owner_revision_selections VALUES (${sqlText(revision.id)}, ${sqlText(selection.family_id)}, ${sqlText(selection.version_id)});`,
    );
  }
  for (const claim of envelope.current_projection.structural_claims ?? []) {
    statements.push(`INSERT INTO commit_guard VALUES (CASE WHEN NOT EXISTS(
      SELECT 1 FROM owner_current other
      JOIN json_each(other.projection_json, '$.structural_claims') existing
      WHERE other.owner_id <> ${sqlText(owner.id)}
        AND json_extract(existing.value, '$.namespace_id') = ${sqlText(claim.namespace_id)}
        AND json_extract(existing.value, '$.claim_type') = ${sqlText(claim.claim_type)}
        AND json_extract(existing.value, '$.normalized_value') = ${sqlText(claim.normalized_value)}
    ) THEN 1 ELSE 0 END);`);
  }
  if (envelope.expected_revision === 0) {
    statements.push(`INSERT INTO owner_current VALUES (
      ${sqlText(owner.id)}, ${sqlText(revision.id)}, ${revision.number},
      ${sqlText(JSON.stringify(envelope.current_projection))}, ${sqlText(now)}
    );`);
  } else {
    statements.push(
      `UPDATE owner_current SET revision_id = ${sqlText(revision.id)}, revision_number = ${revision.number},
        projection_json = ${sqlText(JSON.stringify(envelope.current_projection))}, updated_at = ${sqlText(now)}
       WHERE owner_id = ${sqlText(owner.id)} AND revision_number = ${envelope.expected_revision};`,
      "INSERT INTO commit_guard VALUES (CASE WHEN changes() = 1 THEN 1 ELSE 0 END);",
    );
  }
  statements.push(
    "UPDATE store_fence SET operation_fence = operation_fence + 1 WHERE singleton = 1;",
    `INSERT INTO owner_events VALUES (
      ${sqlText(envelope.event.id)}, ${sqlText(owner.id)}, ${sqlText(owner.kind)}, ${sqlText(revision.id)},
      ${revision.number}, ${sqlText(owner.home_namespace_id)}, ${sqlText(envelope.event.type)},
      ${envelope.event.schema_version}, ${sqlText(envelope.operation_id)},
      ${sqlText(envelope.provenance.causation)}, ${sqlText(envelope.provenance.correlation)},
      (SELECT operation_fence FROM store_fence WHERE singleton = 1), ${sqlText(now)},
      'private', ${sqlText(JSON.stringify(envelope.event.payload))}, ${sqlText(envelope.event.payload_digest)}
    );`,
  );
  if (process.env.CASEBOOK_PERSISTENCE_TEST_FAULT === "after_event_before_outbox_receipt") {
    statements.push("INSERT INTO synthetic_fault_table VALUES (1);");
  }
  for (const item of envelope.outbox) {
    statements.push(`INSERT INTO owner_outbox VALUES (
      ${sqlText(item.id)}, ${sqlText(envelope.operation_id)}, ${sqlText(owner.id)}, ${sqlText(item.kind)},
      ${sqlText(JSON.stringify(item.payload))}, ${sqlText(item.payload_digest)},
      (SELECT operation_fence FROM store_fence WHERE singleton = 1), ${sqlText(now)}
    );`);
  }
  statements.push(`INSERT INTO store_operation_receipts (
    operation_id, operation_kind, store_id, request_digest, outcome, result_json,
    result_digest, authority_claim_json, settled_at, failure_class, retry_disposition,
    operation_fence, owner_id, owner_kind, owner_home_namespace_id, view_policy_revision_id,
    expected_revision, observed_revision, committed_revision, event_id
  ) VALUES (
    ${sqlText(envelope.operation_id)}, 'commit_owner_revision', ${sqlText(state.metadata.store_id)},
    ${sqlText(envelope.request_digest)}, 'committed', ${sqlText(JSON.stringify(coreResult))},
    ${sqlText(mechanicalDigest(coreResult))}, ${sqlText(JSON.stringify(envelope.provenance))}, ${sqlText(now)},
    NULL, 'never', (SELECT operation_fence FROM store_fence WHERE singleton = 1),
    ${sqlText(owner.id)}, ${sqlText(owner.kind)}, ${sqlText(owner.home_namespace_id)},
    ${sqlText(context.view_policy_revision_id)}, ${envelope.expected_revision}, ${envelope.expected_revision},
    ${revision.number}, ${sqlText(envelope.event.id)}
  );`);
  statements.push("COMMIT;");
  return `${statements.join("\n")}\n`;
}

async function commitOwnerRevision(request) {
  const context = contextShape(request.context);
  const envelope = validateEnvelope(request.envelope);
  const prepared = await prepare(request);
  if (prepared.failure) return prepared.failure;
  const { binary, storePath, state } = prepared;

  const expectedDigest = canonicalCommitRequestDigest(state.metadata.store_id, context, envelope);
  const existingReceipt = await readStoreOperationReceipt(binary, storePath, envelope.operation_id);
  if (existingReceipt) {
    if (envelope.request_digest !== expectedDigest) {
      return failure("request_digest_mismatch", "request_digest does not match the canonical resolved-store request.", {
        failureClass: "representation_invalid",
        retryDisposition: RETRY_DISPOSITIONS.NEVER,
        evidence: {},
      });
    }
    if (existingReceipt.operation_kind !== "commit_owner_revision" || existingReceipt.request_digest !== expectedDigest) {
      return idempotencyMismatch(envelope.operation_id);
    }
    const replayView = await validateActiveView(binary, storePath, state, context, envelope.owner);
    if (replayView.failure) return replayView.failure;
    return responseFromReceipt(existingReceipt, true);
  }
  if (envelope.store_id !== state.metadata.store_id) {
    return failure("store_target_mismatch", "The request does not target the resolved immutable store identity.", {
      failureClass: "configuration_or_store_unavailable",
      retryDisposition: RETRY_DISPOSITIONS.NEVER,
      evidence: {},
    });
  }
  if (envelope.request_digest !== expectedDigest) {
    return failure("request_digest_mismatch", "request_digest does not match the canonical resolved-store request.", {
      failureClass: "representation_invalid",
      retryDisposition: RETRY_DISPOSITIONS.NEVER,
      evidence: {},
    });
  }
  const view = await validateActiveView(binary, storePath, state, context, envelope.owner);
  if (view.failure) return view.failure;

  const current = await ownerState(binary, storePath, envelope.owner.id);
  if (current && (current.owner_kind !== envelope.owner.kind || current.home_namespace_id !== envelope.owner.home_namespace_id)) {
    return failure("not_visible", "The requested owner target is unknown or not visible under the active policy.", {
      failureClass: "not_visible",
      retryDisposition: RETRY_DISPOSITIONS.NEVER,
      evidence: {},
    });
  }
  const observedRevision = current?.revision_number ?? 0;
  if (observedRevision !== envelope.expected_revision) {
    const rejected = failure("revision_conflict", "expected_revision does not match the current owner revision.", {
      failureClass: "revision_conflict",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE,
      correctiveGuidance: "Read the authorized current owner revision and reconcile; do not merge or retry automatically.",
      evidence: current ? { current_revision: { id: current.revision_id, number: observedRevision } } : { current_revision: { number: 0 } },
    });
    return settleFailure(binary, storePath, state, envelope, context, rejected, observedRevision);
  }
  if (await hasAllocatedIdentityConflict(binary, storePath, envelope)
      || await hasStructuralClaimConflict(binary, storePath, envelope)) {
    return settleFailure(binary, storePath, state, envelope, context, identityConflict(), observedRevision);
  }

  const coreResult = {
    status: "settled",
    owner: envelope.owner,
    observed_revision: current == null ? null : { id: current.revision_id, number: observedRevision },
    committed_revision: { id: envelope.revision.id, number: envelope.revision.number },
    allocations: {
      version_ids: envelope.revision.versions.map((item) => item.version_id),
      event_id: envelope.event.id,
      outbox_ids: envelope.outbox.map((item) => item.id),
    },
    request_digest: envelope.request_digest,
    applied_view: { view_id: context.view_id, view_policy_revision_id: context.view_policy_revision_id },
  };
  const now = new Date().toISOString();
  try {
    await sqlite(binary, storePath, buildCommitSql(state, context, envelope, coreResult, now), {
      args: ["-batch", "-bail"], timeout: 20_000, maxBuffer: 4 * 1024 * 1024,
    });
  } catch {
    const racedReceipt = await readStoreOperationReceipt(binary, storePath, envelope.operation_id).catch(() => null);
    if (racedReceipt) {
      return racedReceipt.request_digest === expectedDigest
        ? responseFromReceipt(racedReceipt, true)
        : idempotencyMismatch(envelope.operation_id);
    }
    const afterFailure = await ownerState(binary, storePath, envelope.owner.id).catch(() => null);
    const concurrentConflict = afterFailure
      && afterFailure.owner_kind === envelope.owner.kind
      && afterFailure.home_namespace_id === envelope.owner.home_namespace_id
      && afterFailure.revision_number !== envelope.expected_revision;
    const allocatedCollision = !concurrentConflict
      && (await hasAllocatedIdentityConflict(binary, storePath, envelope).catch(() => false)
        || await hasStructuralClaimConflict(binary, storePath, envelope).catch(() => false));
    const rejected = concurrentConflict
      ? failure("revision_conflict", "expected_revision does not match the current owner revision.", {
        failureClass: "revision_conflict",
        retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE,
        correctiveGuidance: "Read the authorized current owner revision and reconcile; do not merge or retry automatically.",
        evidence: { current_revision: { id: afterFailure.revision_id, number: afterFailure.revision_number } },
      })
      : allocatedCollision
        ? identityConflict()
        : failure("commit_execution_failed", "The one-owner transaction did not settle any owner revision state.", {
          failureClass: "internal_failure",
          retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE,
          correctiveGuidance: "Query the owner operation receipt before issuing any new request.",
          evidence: {},
        });
    try {
      return await settleFailure(
        binary, storePath, state, envelope, context, rejected,
        concurrentConflict ? afterFailure.revision_number : observedRevision,
      );
    } catch {
      return rejected;
    }
  }
  const receipt = await readStoreOperationReceipt(binary, storePath, envelope.operation_id);
  return responseFromReceipt(receipt, false);
}

async function getOwnerOperationReceipt(request) {
  const context = contextShape(request.context);
  const operationId = requireString(request.operation_id, "operation_id", 256);
  const owner = requireObject(request.owner, "owner");
  const kind = requireString(owner.kind, "owner.kind", 64);
  const target = {
    id: requireUuidId(owner.id, "owner.id", kind),
    kind,
    home_namespace_id: requireUuidId(owner.home_namespace_id, "owner.home_namespace_id", "namespace"),
  };
  const prepared = await prepare(request);
  if (prepared.failure) {
    return success("get_owner_operation_receipt", {
      status: "store_unavailable",
      failure_class: prepared.failure.failure.class,
      code: prepared.failure.failure.code,
      retry_disposition: prepared.failure.failure.retry_disposition,
    });
  }
  const { binary, storePath, state } = prepared;
  if (request.store_id !== state.metadata.store_id) return success("get_owner_operation_receipt", { status: "not_visible" });
  const view = await validateActiveView(binary, storePath, state, context, target);
  if (view.failure) return success("get_owner_operation_receipt", { status: "not_visible" });
  const receipt = await readStoreOperationReceipt(binary, storePath, operationId);
  if (!receipt) return success("get_owner_operation_receipt", { status: "absent_at_fence", operation_fence: state.operation_fence });
  if (receipt.owner_id !== target.id || receipt.owner_kind !== target.kind) {
    return success("get_owner_operation_receipt", { status: "not_visible" });
  }
  if (receipt.owner_home_namespace_id !== target.home_namespace_id) {
    return success("get_owner_operation_receipt", { status: "not_visible" });
  }
  let committed_revision_state = null;
  let observed_revision_state = null;
  let expected_revision_state = null;
  const loadRevisionState = async (revisionNumber) => {
    const revisions = await queryJson(binary, storePath, `
      SELECT revision_id, revision_number, normalized_json, representation_id, representation_version, committed_at
      FROM owner_revisions
      WHERE owner_id = ${sqlText(target.id)} AND revision_number = ${revisionNumber}
      LIMIT 1;
    `);
    if (!revisions.length) return null;
    const selections = await queryJson(binary, storePath, `
      SELECT s.family_id, v.version_id, v.content_json, v.content_digest
      FROM owner_revision_selections s JOIN owner_versions v ON v.version_id = s.version_id
      WHERE s.revision_id = ${sqlText(revisions[0].revision_id)} ORDER BY s.family_id;
    `);
    return {
      id: revisions[0].revision_id,
      number: revisions[0].revision_number,
      normalized: JSON.parse(revisions[0].normalized_json),
      representation: { id: revisions[0].representation_id, version: revisions[0].representation_version },
      committed_at: revisions[0].committed_at,
      selected_versions: selections.map((item) => ({
        family_id: item.family_id,
        version_id: item.version_id,
        content: JSON.parse(item.content_json),
        content_digest: item.content_digest,
      })),
    };
  };
  if (receipt.outcome === "committed" && receipt.committed_revision != null) {
    committed_revision_state = await loadRevisionState(receipt.committed_revision);
  } else if (receipt.outcome === "rejected") {
    if (receipt.observed_revision > 0) observed_revision_state = await loadRevisionState(receipt.observed_revision);
    if (receipt.expected_revision > 0) expected_revision_state = receipt.expected_revision === receipt.observed_revision
      ? observed_revision_state
      : await loadRevisionState(receipt.expected_revision);
  }
  return success("get_owner_operation_receipt", {
    status: "settled",
    receipt,
    committed_revision_state,
    observed_revision_state,
    expected_revision_state,
    recovery_selection: committed_revision_state?.selected_versions ?? observed_revision_state?.selected_versions ?? [],
  });
}

async function readOwnerCurrent(request) {
  const context = contextShape(request.context);
  const owner = requireObject(request.owner, "owner");
  const kind = requireString(owner.kind, "owner.kind", 64);
  const target = {
    id: requireUuidId(owner.id, "owner.id", kind),
    kind,
    ...(owner.home_namespace_id == null
      ? {}
      : { home_namespace_id: requireUuidId(owner.home_namespace_id, "owner.home_namespace_id", "namespace") }),
  };
  const prepared = await prepare(request);
  if (prepared.failure) return prepared.failure;
  const { binary, storePath, state } = prepared;
  if (request.store_id !== state.metadata.store_id) {
    return failure("not_visible", "The requested owner is unknown or not visible.", { failureClass: "not_visible", evidence: {} });
  }
  const view = await validateActiveView(binary, storePath, state, context);
  if (view.failure) return view.failure;
  const namespaceConstraint = target.home_namespace_id == null
    ? ""
    : `AND o.home_namespace_id = ${sqlText(target.home_namespace_id)}`;
  const rows = await queryJson(binary, storePath, `
    SELECT o.owner_id, o.owner_kind, o.home_namespace_id,
      r.revision_id, r.revision_number, r.normalized_json,
      r.representation_id, r.representation_version,
      c.projection_json, r.committed_at
    FROM owners o
    JOIN owner_current c ON c.owner_id = o.owner_id
    JOIN owner_revisions r ON r.revision_id = c.revision_id
    JOIN view_policy_namespace_grants grant
      ON grant.namespace_id = o.home_namespace_id
      AND grant.view_policy_revision_id = ${sqlText(context.view_policy_revision_id)}
    JOIN view_policy_revisions vpr
      ON vpr.view_policy_revision_id = grant.view_policy_revision_id
      AND vpr.view_id = ${sqlText(context.view_id)} AND vpr.lifecycle = 'active'
    JOIN json_each(vpr.object_kinds_json) object_kind ON object_kind.value = o.owner_kind
    WHERE o.owner_id = ${sqlText(target.id)} AND o.owner_kind = ${sqlText(target.kind)}
      ${namespaceConstraint}
    LIMIT 1;
  `);
  if (!rows.length) {
    return failure("not_visible", "The requested owner is unknown or not visible.", {
      failureClass: "not_visible", retryDisposition: RETRY_DISPOSITIONS.NEVER, evidence: {},
    });
  }
  const row = rows[0];
  const selected = await queryJson(binary, storePath, `
    SELECT s.family_id, v.version_id, v.content_json, v.content_digest
    FROM owner_revision_selections s
    JOIN owner_versions v ON v.version_id = s.version_id
    WHERE s.revision_id = ${sqlText(row.revision_id)}
    ORDER BY s.family_id
    LIMIT ${MAX_SELECTIONS + 1};
  `);
  if (selected.length > MAX_SELECTIONS) {
    return failure("representation_invalid", "The current owner revision exceeds the bounded common read shape.", {
      failureClass: "representation_invalid", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR, evidence: {},
    });
  }
  return success("read_owner_current", {
    status: "found",
    owner: { id: row.owner_id, kind: row.owner_kind, home_namespace_id: row.home_namespace_id },
    revision: {
      id: row.revision_id,
      number: row.revision_number,
      normalized: JSON.parse(row.normalized_json),
      representation: { id: row.representation_id, version: row.representation_version },
      selected_versions: selected.map((item) => ({
        family_id: item.family_id,
        version_id: item.version_id,
        content: JSON.parse(item.content_json),
        content_digest: item.content_digest,
      })),
      committed_at: row.committed_at,
    },
    current_projection: JSON.parse(row.projection_json),
    applied_view: { view_id: context.view_id, view_policy_revision_id: context.view_policy_revision_id },
  });
}

async function readOwnerRevision(request) {
  const context = contextShape(request.context);
  const owner = requireObject(request.owner, "owner");
  const kind = requireString(owner.kind, "owner.kind", 64);
  const target = { id: requireUuidId(owner.id, "owner.id", kind), kind };
  const hasNumber = request.revision_number != null;
  const hasId = request.revision_id != null;
  if (hasNumber === hasId) throw new RequestError("identity_invalid", "Exactly one historical revision selector is required.");
  if (hasNumber && (!Number.isInteger(request.revision_number) || request.revision_number < 1)) throw new RequestError("identity_invalid", "revision_number must be positive.");
  const revisionId = hasId ? requireUuidId(request.revision_id, "revision_id", "owner-revision") : null;
  const prepared = await prepare(request);
  if (prepared.failure) return prepared.failure;
  const { binary, storePath, state } = prepared;
  if (request.store_id !== state.metadata.store_id) return failure("not_visible", "The requested owner is unknown or not visible.", { failureClass: "not_visible", evidence: {} });
  const view = await validateActiveView(binary, storePath, state, context);
  if (view.failure) return view.failure;
  const selector = hasNumber ? `r.revision_number = ${request.revision_number}` : `r.revision_id = ${sqlText(revisionId)}`;
  const rows = await queryJson(binary, storePath, `
    SELECT o.owner_id,o.owner_kind,o.home_namespace_id,r.revision_id,r.revision_number,
      r.normalized_json,r.representation_id,r.representation_version,r.committed_at
    FROM owners o JOIN owner_revisions r ON r.owner_id=o.owner_id
    JOIN view_policy_namespace_grants g ON g.namespace_id=o.home_namespace_id AND g.view_policy_revision_id=${sqlText(context.view_policy_revision_id)}
    JOIN view_policy_revisions p ON p.view_policy_revision_id=g.view_policy_revision_id AND p.view_id=${sqlText(context.view_id)} AND p.lifecycle='active'
    JOIN json_each(p.object_kinds_json) k ON k.value=o.owner_kind
    WHERE o.owner_id=${sqlText(target.id)} AND o.owner_kind=${sqlText(target.kind)} AND ${selector} LIMIT 1;`);
  if (!rows.length) return failure("not_visible", "The requested owner is unknown or not visible.", { failureClass: "not_visible", retryDisposition: RETRY_DISPOSITIONS.NEVER, evidence: {} });
  const row=rows[0];
  const selected=await queryJson(binary,storePath,`SELECT s.family_id,v.version_id,v.content_json,v.content_digest FROM owner_revision_selections s JOIN owner_versions v ON v.version_id=s.version_id WHERE s.revision_id=${sqlText(row.revision_id)} ORDER BY s.family_id LIMIT ${MAX_SELECTIONS+1};`);
  if(selected.length>MAX_SELECTIONS)return failure("representation_invalid","The owner revision exceeds the bounded read shape.",{failureClass:"representation_invalid",evidence:{}});
  return success("read_owner_revision",{status:"found",owner:{id:row.owner_id,kind:row.owner_kind,home_namespace_id:row.home_namespace_id},revision:{id:row.revision_id,number:row.revision_number,normalized:JSON.parse(row.normalized_json),representation:{id:row.representation_id,version:row.representation_version},selected_versions:selected.map(x=>({family_id:x.family_id,version_id:x.version_id,content:JSON.parse(x.content_json),content_digest:x.content_digest})),committed_at:row.committed_at},applied_view:{view_id:context.view_id,view_policy_revision_id:context.view_policy_revision_id},operation_fence:state.operation_fence});
}

async function readOwnerCurrentCorpus(request) {
  const context = contextShape(request.context);
  const kind = requireString(request.owner_kind, "owner_kind", 64);
  if (!OWNER_KIND.test(kind)) throw new RequestError("identity_invalid", "owner_kind has invalid syntax.");
  const storeId = requireUuidId(request.store_id, "store_id", "store");
  const prepared = await prepare(request);
  if (prepared.failure) return prepared.failure;
  const { binary, storePath, state } = prepared;
  if (storeId !== state.metadata.store_id) return failure("not_visible", "The requested owners are unknown or not visible.", { failureClass: "not_visible", retryDisposition: RETRY_DISPOSITIONS.NEVER, evidence: {} });
  const view = await validateActiveView(binary, storePath, state, context);
  if (view.failure) return view.failure;
  // This single SELECT is the read snapshot: fence, visibility, current pointer,
  // revision, selections, and immutable versions cannot come from different commits.
  if (process.env.CASEBOOK_PERSISTENCE_TEST_FAULT === "advance_fence_after_corpus_prepare") await sqlite(binary,storePath,"UPDATE store_fence SET operation_fence=operation_fence+1 WHERE singleton=1;",{args:["-batch","-bail"]});
  const rows = await queryJson(binary, storePath, `
    SELECT corpus.*,f.operation_fence
    FROM store_fence f LEFT JOIN (
      SELECT o.owner_id,o.owner_kind,o.home_namespace_id,c.projection_json,
        r.revision_id,r.revision_number,r.normalized_json,r.representation_id,
        r.representation_version,r.committed_at,
        COALESCE((SELECT json_group_array(json_object(
          'family_id',selected.family_id,'version_id',selected.version_id,
          'content_json',selected.content_json,'content_digest',selected.content_digest))
          FROM (SELECT s.family_id,v.version_id,v.content_json,v.content_digest
            FROM owner_revision_selections s JOIN owner_versions v ON v.version_id=s.version_id
            WHERE s.revision_id=r.revision_id ORDER BY s.family_id LIMIT ${MAX_SELECTIONS + 1}) selected),'[]') selected_json
      FROM owners o JOIN owner_current c ON c.owner_id=o.owner_id
      JOIN owner_revisions r ON r.revision_id=c.revision_id
      JOIN view_policy_namespace_grants g ON g.namespace_id=o.home_namespace_id AND g.view_policy_revision_id=${sqlText(context.view_policy_revision_id)}
      JOIN view_policy_revisions p ON p.view_policy_revision_id=g.view_policy_revision_id AND p.view_id=${sqlText(context.view_id)} AND p.lifecycle='active'
      JOIN json_each(p.object_kinds_json) k ON k.value=o.owner_kind
      WHERE o.owner_kind=${sqlText(kind)}
      ORDER BY o.owner_id LIMIT ${MAX_LIST_SCAN + 1}
    ) corpus ON 1=1
    ORDER BY corpus.owner_id;`);
  const ownerRows=rows.filter(row=>row.owner_id!=null);
  if (ownerRows.length > MAX_LIST_SCAN) return failure("capability_unavailable", "The bounded cohesive owner corpus scan limit was exceeded.", { failureClass: "capability_unavailable", retryDisposition: RETRY_DISPOSITIONS.NEVER, evidence: { maximum_owner_scan: MAX_LIST_SCAN } });
  const items=[];
  for(const row of ownerRows){
    const selected=JSON.parse(row.selected_json);
    if(selected.length>MAX_SELECTIONS)return failure("representation_invalid","A current owner revision exceeds the bounded corpus read shape.",{failureClass:"representation_invalid",retryDisposition:RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,evidence:{}});
    items.push({owner:{id:row.owner_id,kind:row.owner_kind,home_namespace_id:row.home_namespace_id},current_projection:JSON.parse(row.projection_json),revision:{id:row.revision_id,number:row.revision_number,normalized:JSON.parse(row.normalized_json),representation:{id:row.representation_id,version:row.representation_version},committed_at:row.committed_at,selected_versions:selected.map(x=>({family_id:x.family_id,version_id:x.version_id,content:JSON.parse(x.content_json),content_digest:x.content_digest}))}});
  }
  return success("read_owner_current_corpus",{status:"found",items,operation_fence:rows[0].operation_fence,applied_view:{view_id:context.view_id,view_policy_revision_id:context.view_policy_revision_id}});
}

async function pageOwnerCurrent(request) {
  const context = contextShape(request.context);
  const kind = requireString(request.owner_kind, "owner_kind", 64);
  if (!OWNER_KIND.test(kind)) throw new RequestError("identity_invalid", "owner_kind has invalid syntax.");
  const storeId = requireUuidId(request.store_id, "store_id", "store");
  const limit = request.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_CURRENT_PAGE) {
    throw new RequestError("representation_invalid", `limit must be 1 to ${MAX_CURRENT_PAGE}.`);
  }
  let afterKey = null;
  if (request.after_key != null) {
    if (!Array.isArray(request.after_key) || request.after_key.length !== 2
      || request.after_key.some((part) => !nonEmpty(part, 512))) {
      throw new RequestError("representation_invalid", "after_key must be a stable [updated_at, owner_id] key.");
    }
    afterKey = request.after_key;
  }
  if (request.expected_fence != null && (!Number.isInteger(request.expected_fence) || request.expected_fence < 1)) {
    throw new RequestError("representation_invalid", "expected_fence must be a positive integer.");
  }
  const prepared = await prepare(request);
  if (prepared.failure) return prepared.failure;
  const { binary, storePath, state } = prepared;
  if (storeId !== state.metadata.store_id) return failure("not_visible", "The requested owners are unknown or not visible.", { failureClass: "not_visible", retryDisposition: RETRY_DISPOSITIONS.NEVER, evidence: {} });
  const view = await validateActiveView(binary, storePath, state, context);
  if (view.failure) return view.failure;
  const after = afterKey == null ? "" : `AND (c.updated_at < ${sqlText(afterKey[0])} OR (c.updated_at = ${sqlText(afterKey[0])} AND o.owner_id > ${sqlText(afterKey[1])}))`;
  // Fence and page are read by one SQLite statement, hence from one read snapshot.
  const result = await queryJson(binary, storePath, `
    WITH visible AS (
      SELECT o.owner_id, o.owner_kind, o.home_namespace_id, r.revision_id,
        r.revision_number, r.committed_at, c.updated_at, c.projection_json
      FROM owners o
      JOIN owner_current c ON c.owner_id = o.owner_id
      JOIN owner_revisions r ON r.revision_id = c.revision_id
      JOIN view_policy_namespace_grants grant ON grant.namespace_id = o.home_namespace_id
        AND grant.view_policy_revision_id = ${sqlText(context.view_policy_revision_id)}
      JOIN view_policy_revisions vpr ON vpr.view_policy_revision_id = grant.view_policy_revision_id
        AND vpr.view_id = ${sqlText(context.view_id)} AND vpr.lifecycle = 'active'
      JOIN json_each(vpr.object_kinds_json) object_kind ON object_kind.value = o.owner_kind
      WHERE o.owner_kind = ${sqlText(kind)} ${after}
      ORDER BY c.updated_at DESC, o.owner_id ASC LIMIT ${limit + 1}
    )
    SELECT (SELECT operation_fence FROM store_fence WHERE singleton = 1) AS operation_fence,
      COALESCE(json_group_array(json_object(
        'owner_id', owner_id, 'owner_kind', owner_kind, 'home_namespace_id', home_namespace_id,
        'revision_id', revision_id, 'revision_number', revision_number, 'committed_at', committed_at,
        'updated_at', updated_at, 'projection_json', json(projection_json)
      )) FILTER (WHERE owner_id IS NOT NULL), json('[]')) AS items_json
    FROM visible;
  `);
  const fence = result[0].operation_fence;
  if (request.expected_fence != null && request.expected_fence !== fence) {
    return failure("snapshot_fence_changed", "The current projection fence changed; restart pagination.", {
      failureClass: "snapshot_fence_changed", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE,
      evidence: { restart_required: true, current_fence: fence },
    });
  }
  const rows = JSON.parse(result[0].items_json);
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return success("page_owner_current", {
    status: "found",
    items: page.map((row) => ({
      owner: { id: row.owner_id, kind: row.owner_kind, home_namespace_id: row.home_namespace_id },
      revision: { id: row.revision_id, number: row.revision_number, committed_at: row.committed_at },
      current_projection: row.projection_json,
    })),
    operation_fence: fence,
    has_more: hasMore,
    next_after_key: hasMore ? [page.at(-1).updated_at, page.at(-1).owner_id] : null,
    applied_view: { view_id: context.view_id, view_policy_revision_id: context.view_policy_revision_id },
  });
}

// Compatibility primitive for the existing bounded common-subset façade. Frame
// pagination intentionally uses page_owner_current directly and has no scan cap.
async function listOwnerCurrent(request) {
  const items = [];
  let afterKey = null;
  let fence = null;
  let appliedView = null;
  do {
    const page = await pageOwnerCurrent({ ...request, limit: MAX_CURRENT_PAGE, ...(afterKey == null ? {} : { after_key: afterKey }), ...(fence == null ? {} : { expected_fence: fence }) });
    if (!page.ok) return page;
    fence ??= page.result.operation_fence;
    appliedView = page.result.applied_view;
    items.push(...page.result.items);
    if (items.length > 256) return failure("capability_unavailable", "The bounded common owner list scan limit was exceeded.", { failureClass: "capability_unavailable", retryDisposition: RETRY_DISPOSITIONS.NEVER, evidence: { maximum_owner_scan: 256 } });
    afterKey = page.result.next_after_key;
  } while (afterKey != null);
  return success("list_owner_current", { status: "found", items, operation_fence: fence, applied_view: appliedView });
}

export async function invokeMechanicalOperation(request) {
  try {
    if (request.operation === "commit_owner_revision") return await commitOwnerRevision(request);
    if (request.operation === "get_owner_operation_receipt") return await getOwnerOperationReceipt(request);
    if (request.operation === "read_owner_current") return await readOwnerCurrent(request);
    if (request.operation === "read_owner_revision") return await readOwnerRevision(request);
    if (request.operation === "read_owner_current_corpus") return await readOwnerCurrentCorpus(request);
    if (request.operation === "page_owner_current") return await pageOwnerCurrent(request);
    if (request.operation === "list_owner_current") return await listOwnerCurrent(request);
    return null;
  } catch (error) {
    if (error instanceof RequestError || error instanceof ConfigurationError) {
      return failure(error.code, error.message, {
        failureClass: error.failureClass ?? "configuration_or_store_unavailable",
        retryDisposition: error.retryDisposition ?? RETRY_DISPOSITIONS.NEVER,
        evidence: error.evidence ?? {},
      });
    }
    return failure("internal_failure", "The mechanical operation failed without exposing owner state.", {
      failureClass: "internal_failure",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      evidence: {},
    });
  }
}
