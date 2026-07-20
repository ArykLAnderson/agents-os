import { createHash, createHmac, timingSafeEqual } from "node:crypto";
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
const MAX_IDENTITY_CORPUS = 256;
const MAX_HANDOFF_BYTES = 64 * 1024;
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
  const identityLinks = value.current_projection.identity_links ?? [];
  if (!Array.isArray(identityLinks) || identityLinks.length > 512) {
    throw new RequestError("representation_invalid", "envelope.current_projection.identity_links must be a bounded array.");
  }
  for (const link of identityLinks) {
    requireObject(link, "envelope.current_projection.identity_links[]");
    for (const endpointName of ["from", "to"]) {
      const endpoint = requireObject(link[endpointName], `envelope.current_projection.identity_links[].${endpointName}`);
      const endpointKind = requireString(endpoint.kind, `envelope.current_projection.identity_links[].${endpointName}.kind`, 64);
      if (!OWNER_KIND.test(endpointKind)) throw new RequestError("identity_invalid", "identity link endpoint kind is invalid.");
      requireUuidId(endpoint.id, `envelope.current_projection.identity_links[].${endpointName}.id`, endpointKind);
    }
    requireString(link.predicate, "envelope.current_projection.identity_links[].predicate", 256);
    if (link.direction !== "outgoing") throw new RequestError("representation_invalid", "identity links use canonical outgoing direction.");
    for (const key of ["observed_revision_id", "pinned_revision_id"]) if (link[key] != null) requireUuidId(link[key], `envelope.current_projection.identity_links[].${key}`);
  }
  if (value.current_projection.identity_discoverable != null && typeof value.current_projection.identity_discoverable !== "boolean") {
    throw new RequestError("representation_invalid", "envelope.current_projection.identity_discoverable must be boolean.");
  }
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
      vpr.object_kinds_json, vpr.limits_json, vf.home_namespace_id
    FROM view_families vf
    JOIN view_policy_revisions vpr ON vpr.view_id = vf.view_id
    WHERE vf.view_id = ${sqlText(context.view_id)}
      AND vpr.view_policy_revision_id = ${sqlText(context.view_policy_revision_id)}
      AND vpr.lifecycle = 'active'
      AND vpr.audience_ceiling = 'private'
    LIMIT 1;
  `);
  if (!rows.length) {
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
        (SELECT operation_fence FROM store_operation_receipts receipt WHERE receipt.operation_id=r.operation_id) revision_operation_fence,
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
    items.push({owner:{id:row.owner_id,kind:row.owner_kind,home_namespace_id:row.home_namespace_id},current_projection:JSON.parse(row.projection_json),revision:{id:row.revision_id,number:row.revision_number,operation_fence:row.revision_operation_fence,normalized:JSON.parse(row.normalized_json),representation:{id:row.representation_id,version:row.representation_version},committed_at:row.committed_at,selected_versions:selected.map(x=>({family_id:x.family_id,version_id:x.version_id,content:JSON.parse(x.content_json),content_digest:x.content_digest}))}});
  }
  return success("read_owner_current_corpus",{status:"found",items,store:{id:state.metadata.store_id,schema:{id:state.metadata.schema_id,version:state.metadata.schema_version},protocol:{id:state.metadata.protocol_id,version:state.metadata.protocol_version}},operation_fence:rows[0].operation_fence,applied_view:{view_id:context.view_id,view_policy_revision_id:context.view_policy_revision_id}});
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

function identitySigningKey(state) {
  return createHash("sha256").update(canonicalJson({
    domain: "casebook-identity-handoff-key@1",
    store_id: state.metadata.store_id,
    initialization_operation_id: state.metadata.initialization_operation_id,
  })).digest();
}

function signedIdentityState(state, value) {
  const payload = canonicalJson(value);
  const signature = createHmac("sha256", identitySigningKey(state)).update(`casebook-identity-state@1\0${payload}`).digest("hex");
  return Buffer.from(JSON.stringify({ payload, signature }), "utf8").toString("base64url");
}

function parseSignedIdentityState(state, value) {
  try {
    if (!nonEmpty(value, MAX_HANDOFF_BYTES) || Buffer.byteLength(value) > MAX_HANDOFF_BYTES) throw new Error();
    const envelope = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof envelope.payload !== "string" || typeof envelope.signature !== "string") throw new Error();
    const expected = createHmac("sha256", identitySigningKey(state)).update(`casebook-identity-state@1\0${envelope.payload}`).digest("hex");
    if (expected.length !== envelope.signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(envelope.signature))) throw new Error();
    return JSON.parse(envelope.payload);
  } catch {
    throw new RequestError("not_visible", "The identity handoff is unknown or not visible.", { failureClass: "not_visible", evidence: {} });
  }
}

function identityRevisionId(kind, mechanicalId) {
  return `${kind}-revision:${mechanicalId.slice(mechanicalId.indexOf(":") + 1)}`;
}

function normalizedIdentityQuery(value) {
  requireObject(value, "query");
  const keys = Object.keys(value);
  if (keys.length !== 1 || !["text", "identity", "alias", "relationship"].includes(keys[0])) {
    throw new RequestError("representation_invalid", "query must contain exactly one supported identity selector.");
  }
  if (keys[0] === "text") {
    const text = requireString(value.text, "query.text", 256).normalize("NFKC").toLocaleLowerCase("en-US");
    const tokens = [...new Set(text.split(/[^\p{L}\p{N}_-]+/u).filter(Boolean))];
    if (!tokens.length) throw new RequestError("representation_invalid", "query.text requires a lexical token.");
    return { text: tokens };
  }
  if (keys[0] === "identity") {
    const selector = requireObject(value.identity, "query.identity");
    const kind = requireString(selector.kind, "query.identity.kind", 64);
    if (Object.keys(selector).length !== 2 || !OWNER_KIND.test(kind)) throw new RequestError("representation_invalid", "query.identity has an invalid shape.");
    return { identity: { kind, id: requireUuidId(selector.id, "query.identity.id", kind) } };
  }
  if (keys[0] === "alias") {
    const selector = requireObject(value.alias, "query.alias");
    if (Object.keys(selector).some((key) => !["namespace_id", "kind", "value"].includes(key)) || Object.keys(selector).length !== 3) throw new RequestError("representation_invalid", "query.alias has an invalid shape.");
    return { alias: {
      namespace_id: requireUuidId(selector.namespace_id, "query.alias.namespace_id", "namespace"),
      kind: requireString(selector.kind, "query.alias.kind", 64),
      value: requireString(selector.value, "query.alias.value", 256).trim().normalize("NFKC").toLocaleLowerCase("en-US"),
    } };
  }
  const relationship = requireObject(value.relationship, "query.relationship");
  if (Object.keys(relationship).some((key) => !["start", "predicates", "direction"].includes(key)) || Object.keys(relationship).length !== 3) throw new RequestError("representation_invalid", "query.relationship has an invalid shape.");
  if (!Array.isArray(relationship.start) || relationship.start.length < 1 || relationship.start.length > 32) throw new RequestError("representation_invalid", "query.relationship.start must be bounded and non-empty.");
  const start = relationship.start.map((item) => {
    const endpoint = requireObject(item, "query.relationship.start[]");
    const kind = requireString(endpoint.kind, "query.relationship.start[].kind", 64);
    if (Object.keys(endpoint).length !== 2 || !OWNER_KIND.test(kind)) throw new RequestError("representation_invalid", "query.relationship.start endpoint is invalid.");
    return { kind, id: requireUuidId(endpoint.id, "query.relationship.start[].id", kind) };
  });
  if (new Set(start.map((item) => `${item.kind}\0${item.id}`)).size !== start.length) throw new RequestError("representation_invalid", "query.relationship.start must be unique.");
  if (!Array.isArray(relationship.predicates) || relationship.predicates.length > 32) throw new RequestError("representation_invalid", "query.relationship.predicates must be bounded.");
  const predicates = relationship.predicates.map((item) => requireString(item, "query.relationship.predicates[]", 256));
  if (!["outgoing", "incoming", "both"].includes(relationship.direction)) throw new RequestError("representation_invalid", "query.relationship.direction is invalid.");
  return { relationship: { start, predicates: [...new Set(predicates)].sort(), direction: relationship.direction } };
}

function visibleProjectionText(projection) {
  return [projection.title, projection.summary, projection.outcome].filter((value) => typeof value === "string").join("\n").normalize("NFKC").toLocaleLowerCase("en-US");
}

function identityCodepointCompare(left, right) {
  return left === right ? 0 : left < right ? -1 : 1;
}

async function discoverIdentities(request) {
  const context = contextShape(request.context);
  const storeId = requireUuidId(request.store_id, "store_id", "store");
  if (!Array.isArray(request.owner_kinds) || request.owner_kinds.length < 1 || request.owner_kinds.length > 2) throw new RequestError("representation_invalid", "owner_kinds must select Case and/or Frame.");
  const ownerKinds = [...new Set(request.owner_kinds.map((kind) => requireString(kind, "owner_kinds[]", 64)))].sort();
  if (ownerKinds.length !== request.owner_kinds.length || ownerKinds.some((kind) => !["case", "frame"].includes(kind))) throw new RequestError("representation_invalid", "owner_kinds must be unique supported semantic owner kinds.");
  const query = normalizedIdentityQuery(request.query);
  if (!Number.isInteger(request.limit) || request.limit < 1) throw new RequestError("representation_invalid", "limit must be a positive integer.");
  if (!Number.isInteger(request.max_depth) || request.max_depth < 0) throw new RequestError("representation_invalid", "max_depth must be a non-negative integer.");
  const prepared = await prepare(request);
  if (prepared.failure) return prepared.failure;
  const { binary, storePath, state } = prepared;
  if (storeId !== state.metadata.store_id) return failure("not_visible", "The requested identity is unknown or not visible.", { failureClass: "not_visible", evidence: {} });
  const active = await validateActiveView(binary, storePath, state, context);
  if (active.failure) return active.failure;
  const limits = JSON.parse(active.policy.limits_json);
  if (request.limit > limits.max_results || request.max_depth > limits.max_traversal_depth) throw new RequestError("representation_invalid", "The requested bounds widen the exact active policy.");
  const kindsSql = ownerKinds.map(sqlText).join(",");
  const rows = await queryJson(binary, storePath, `
    SELECT visible.*, fence.operation_fence
    FROM store_fence fence LEFT JOIN (
      SELECT o.owner_id, o.owner_kind, o.home_namespace_id, r.revision_id, r.revision_number,
        c.projection_json
      FROM owners o JOIN owner_current c ON c.owner_id = o.owner_id
      JOIN owner_revisions r ON r.revision_id = c.revision_id
      JOIN view_policy_namespace_grants grant ON grant.namespace_id = o.home_namespace_id
        AND grant.view_policy_revision_id = ${sqlText(context.view_policy_revision_id)}
      JOIN view_policy_revisions policy ON policy.view_policy_revision_id = grant.view_policy_revision_id
        AND policy.view_id = ${sqlText(context.view_id)} AND policy.lifecycle = 'active'
      JOIN json_each(policy.object_kinds_json) object_kind ON object_kind.value = o.owner_kind
      WHERE o.owner_kind IN (${kindsSql})
      ORDER BY o.owner_kind, o.owner_id LIMIT ${MAX_IDENTITY_CORPUS + 1}
    ) visible ON 1 = 1 ORDER BY visible.owner_kind, visible.owner_id;
  `);
  const ownerRows = rows.filter((row) => row.owner_id != null);
  if (ownerRows.length > MAX_IDENTITY_CORPUS) return failure("capability_unavailable", "The bounded identity corpus limit was exceeded.", { failureClass: "capability_unavailable", retryDisposition: RETRY_DISPOSITIONS.NEVER, evidence: { maximum_owner_scan: MAX_IDENTITY_CORPUS } });
  const corpus = ownerRows.map((row) => ({ ...row, projection: JSON.parse(row.projection_json) })).filter((row) => row.projection.identity_discoverable !== false);
  const byKey = new Map(corpus.map((row) => [`${row.owner_kind}\0${row.owner_id}`, row]));
  const allLinks = [];
  for (const row of corpus) for (const link of row.projection.identity_links ?? []) {
    const fromOwner = byKey.get(`${link.from.kind}\0${link.from.id}`) ?? (link.from.kind === row.owner_kind && link.from.id === row.owner_id ? row : null);
    const toOwner = byKey.get(`${link.to.kind}\0${link.to.id}`);
    if (fromOwner && toOwner) allLinks.push({ row, link });
  }
  const selected = new Map();
  const retainedLinks = [];
  if (query.text) {
    for (const row of corpus) if (query.text.every((token) => visibleProjectionText(row.projection).includes(token))) selected.set(`${row.owner_kind}\0${row.owner_id}`, { row, depth: 0 });
  } else if (query.identity) {
    const row = byKey.get(`${query.identity.kind}\0${query.identity.id}`);
    if (row) selected.set(`${row.owner_kind}\0${row.owner_id}`, { row, depth: 0 });
  } else if (query.alias) {
    for (const row of corpus) if (row.home_namespace_id === query.alias.namespace_id && (row.projection.aliases ?? []).some((alias) => alias.type === query.alias.kind && alias.normalized_value === query.alias.value)) selected.set(`${row.owner_kind}\0${row.owner_id}`, { row, depth: 0 });
  } else {
    const predicates = new Set(query.relationship.predicates);
    const queue = [];
    for (const endpoint of query.relationship.start) {
      const key = `${endpoint.kind}\0${endpoint.id}`, row = byKey.get(key);
      if (row) selected.set(key, { row, depth: 0 }), queue.push(key);
    }
    const retained = new Set();
    while (queue.length) {
      const currentKey = queue.shift(), depth = selected.get(currentKey).depth;
      if (depth >= request.max_depth) continue;
      for (const { link } of allLinks) {
        if (predicates.size && !predicates.has(link.predicate)) continue;
        const from = `${link.from.kind}\0${link.from.id}`, to = `${link.to.kind}\0${link.to.id}`;
        const forward = from === currentKey && query.relationship.direction !== "incoming";
        const reverse = to === currentKey && query.relationship.direction !== "outgoing";
        if (!forward && !reverse) continue;
        const next = forward ? to : from;
        if (!retained.has(`${from}\0${link.predicate}\0${to}`)) {
          retained.add(`${from}\0${link.predicate}\0${to}`);
          retainedLinks.push({ ...link, depth: depth + 1 });
        }
        if (!selected.has(next)) selected.set(next, { row: byKey.get(next), depth: depth + 1 }), queue.push(next);
      }
    }
  }
  const ordered = [...selected.values()].sort((left, right) => left.depth - right.depth || identityCodepointCompare(left.row.owner_kind, right.row.owner_kind) || identityCodepointCompare(left.row.owner_id, right.row.owner_id));
  const queryDigest = mechanicalDigest({ domain: "identity-discovery-query@1", store_id: storeId, view_id: context.view_id, view_policy_revision_id: context.view_policy_revision_id, audience_ceiling: "private", owner_kinds: ownerKinds, query, bounds: { result_limit: request.limit, max_depth: request.max_depth } });
  const fence = rows[0].operation_fence;
  let offset = 0;
  if (request.cursor != null) {
    const cursor = parseSignedIdentityState(state, request.cursor);
    if (cursor.domain !== "identity-discovery-cursor@1" || cursor.store_id !== storeId || cursor.view_policy_revision_id !== context.view_policy_revision_id || cursor.query_digest !== queryDigest || cursor.fence !== fence || !Number.isInteger(cursor.offset) || cursor.offset < 0) throw new RequestError("representation_invalid", "The opaque cursor is invalid or belongs to another query.");
    offset = cursor.offset;
  }
  if (offset > ordered.length) throw new RequestError("representation_invalid", "The opaque cursor is stale.");
  const page = ordered.slice(offset, offset + request.limit), pageKeys = new Set(page.map(({ row }) => `${row.owner_kind}\0${row.owner_id}`));
  const more = offset + page.length < ordered.length;
  const candidates = page.map(({ row }) => ({ stable_id: row.owner_id, owner_kind: row.owner_kind, home_namespace_id: row.home_namespace_id, current_owner_revision: { id: identityRevisionId(row.owner_kind, row.revision_id), number: row.revision_number } }));
  const links = retainedLinks.filter((link) => pageKeys.has(`${link.from.kind}\0${link.from.id}`) && pageKeys.has(`${link.to.kind}\0${link.to.id}`)).map((link) => ({ from: link.from, to: link.to, predicate: link.predicate, direction: link.direction, ...(link.observed_revision_id == null ? {} : { observed_revision_id: link.observed_revision_id }), ...(link.pinned_revision_id == null ? {} : { pinned_revision_id: link.pinned_revision_id }), depth: link.depth }));
  const handoff = { domain: "identity-discovery-handoff@1", store_id: storeId, view_id: context.view_id, view_policy_revision_id: context.view_policy_revision_id, query_digest: queryDigest, fence, audience_ceiling: "private", bounds: { result_limit: request.limit, max_depth: request.max_depth }, candidates: page.map(({ row }) => ({ id: row.owner_id, kind: row.owner_kind, home_namespace_id: row.home_namespace_id, revision_id: row.revision_id, revision_number: row.revision_number })) };
  return success("discover_identities", { status: "found", candidates, links, query_digest: queryDigest, snapshot_query_fence: `sqlite:${fence}`, result_completeness: more ? "truncated" : "complete_within_bounds", stable_sort: "depth_asc_owner_kind_asc_stable_id_asc", next_cursor: more ? signedIdentityState(state, { domain: "identity-discovery-cursor@1", store_id: storeId, view_policy_revision_id: context.view_policy_revision_id, query_digest: queryDigest, fence, offset: offset + page.length }) : null, handoff_token: signedIdentityState(state, handoff), applied_bounds: handoff.bounds, audience_ceiling: "private", applied_view: { view_id: context.view_id, view_policy_revision_id: context.view_policy_revision_id } });
}

async function validateIdentityHandoff(request) {
  const context = contextShape(request.context);
  const storeId = requireUuidId(request.store_id, "store_id", "store");
  const ownerKind = requireString(request.owner_kind, "owner_kind", 64);
  if (!["case", "frame"].includes(ownerKind)) throw new RequestError("not_visible", "The identity handoff is unknown or not visible.", { failureClass: "not_visible", evidence: {} });
  requireDigest(request.query_digest, "query_digest");
  if (!Array.isArray(request.candidate_ids) || request.candidate_ids.length < 1 || request.candidate_ids.length > MAX_CURRENT_PAGE) throw new RequestError("not_visible", "The identity handoff is unknown or not visible.", { failureClass: "not_visible", evidence: {} });
  const candidateIds = request.candidate_ids.map((candidateId) => requireUuidId(candidateId, "candidate_ids[]", ownerKind));
  if (new Set(candidateIds).size !== candidateIds.length) throw new RequestError("not_visible", "The identity handoff is unknown or not visible.", { failureClass: "not_visible", evidence: {} });
  const prepared = await prepare(request);
  if (prepared.failure) return prepared.failure;
  const { binary, storePath, state } = prepared;
  if (storeId !== state.metadata.store_id) return failure("not_visible", "The identity handoff is unknown or not visible.", { failureClass: "not_visible", evidence: {} });
  const active = await validateActiveView(binary, storePath, state, context);
  if (active.failure) return failure("not_visible", "The identity handoff is unknown or not visible.", { failureClass: "not_visible", evidence: {} });
  const handoff = parseSignedIdentityState(state, request.handoff_token);
  if (handoff.domain !== "identity-discovery-handoff@1" || handoff.store_id !== storeId || handoff.view_id !== context.view_id || handoff.view_policy_revision_id !== context.view_policy_revision_id || handoff.query_digest !== request.query_digest || handoff.audience_ceiling !== "private" || !Array.isArray(handoff.candidates)) return failure("not_visible", "The identity handoff is unknown or not visible.", { failureClass: "not_visible", evidence: {} });
  const bound = new Map(handoff.candidates.filter((item) => item.kind === ownerKind).map((item) => [item.id, item]));
  if (candidateIds.some((candidateId) => !bound.has(candidateId))) return failure("not_visible", "The identity handoff is unknown or not visible.", { failureClass: "not_visible", evidence: {} });
  return success("validate_identity_handoff", { status: "validated", candidates: candidateIds.map((candidateId) => bound.get(candidateId)), query_digest: handoff.query_digest, snapshot_query_fence: `sqlite:${handoff.fence}`, audience_ceiling: handoff.audience_ceiling, applied_bounds: handoff.bounds, applied_view: { view_id: context.view_id, view_policy_revision_id: context.view_policy_revision_id } });
}

async function readActiveViewScope(request) {
  const available = await prepare(request);
  if (available.failure) return available.failure;
  const { binary, storePath, state } = available;
  const active = await validateActiveView(binary, storePath, state, request.context);
  if (active.failure) return active.failure;
  const rows = await queryJson(binary, storePath, `
    SELECT grant.namespace_id
    FROM view_policy_namespace_grants grant
    JOIN namespaces ns ON ns.namespace_id = grant.namespace_id AND ns.lifecycle = 'active'
    WHERE grant.view_policy_revision_id = ${sqlText(request.context.view_policy_revision_id)}
    ORDER BY grant.namespace_id;
  `);
  return success("read_active_view_scope", {
    status: "found",
    namespace_ids: rows.map((row) => row.namespace_id),
    applied_view: { id: request.context.view_id, policy_revision_id: request.context.view_policy_revision_id },
  });
}

function canonicalCaseRevisionId(value) {
  return value.startsWith("case-revision:") ? `owner-revision:${value.slice("case-revision:".length)}` : value;
}

function canonicalCaseVersionId(value) {
  return value.startsWith("case-version:") ? `version:${value.slice("case-version:".length)}` : value;
}

function purgeProjectionTargets(payload, targetCaseId) {
  return payload?.owner?.id === targetCaseId || payload?.source_owner?.id === targetCaseId;
}

async function purgeProjectionChanges(binary, storePath, targetCaseId) {
  const present = await queryJson(binary, storePath, "SELECT count(*) AS count FROM sqlite_schema WHERE type='table' AND name IN ('disposable_projection_generations','disposable_projection_entries','disposable_projection_selection');");
  if (present[0]?.count !== 3) return { statements: [], removed: 0 };
  const rows = await queryJson(binary, storePath, `SELECT e.generation_id,e.projection_kind,e.entry_key,e.payload_json,e.payload_digest,g.source_fence,g.projection_kinds_json
    FROM disposable_projection_entries e JOIN disposable_projection_generations g ON g.generation_id=e.generation_id
    ORDER BY e.generation_id,e.projection_kind,e.entry_key;`);
  const byGeneration = new Map();
  for (const row of rows) {
    const payload = JSON.parse(row.payload_json);
    const group = byGeneration.get(row.generation_id) ?? { sourceFence: row.source_fence, kinds: JSON.parse(row.projection_kinds_json), retained: [], removed: [] };
    const item = { kind: row.projection_kind, key: row.entry_key, payload, digest: row.payload_digest };
    (purgeProjectionTargets(payload, targetCaseId) ? group.removed : group.retained).push(item);
    byGeneration.set(row.generation_id, group);
  }
  const statements = [];
  let removed = 0;
  for (const [generationId, group] of byGeneration) {
    if (!group.removed.length) continue;
    removed += group.removed.length;
    for (const item of group.removed) statements.push(`DELETE FROM disposable_projection_entries WHERE generation_id=${sqlText(generationId)} AND projection_kind=${sqlText(item.kind)} AND entry_key=${sqlText(item.key)};`);
    const projectionDigest = mechanicalDigest({ domain: "casebook-disposable-projection-generation@1", generation_id: generationId, source_fence: group.sourceFence, projection_kinds: group.kinds, entries: group.retained });
    statements.push(`UPDATE disposable_projection_generations SET projection_digest=${sqlText(projectionDigest)},entry_count=${group.retained.length} WHERE generation_id=${sqlText(generationId)};`);
  }
  if (removed) statements.push("UPDATE disposable_projection_selection SET selection_status='stale';");
  return { statements, removed };
}

async function purgeCasePayload(request) {
  const context = contextShape(request.context);
  const storeId = requireUuidId(request.store_id, "store_id", "store");
  const operationId = requireString(request.operation_id, "operation_id", 256);
  const targetCaseId = requireUuidId(request.target_case_id, "target_case_id", "case");
  const requestDigest = requireDigest(request.request_digest, "request_digest");
  const planDigest = requireDigest(request.plan_digest, "plan_digest");
  const prepared = await prepare(request);
  if (prepared.failure) return prepared.failure;
  const { binary, storePath, state } = prepared;
  const notDeleted = (code, message, retryDisposition = RETRY_DISPOSITIONS.NEVER) => failure(code, message, {
    failureClass: code, retryDisposition,
    correctiveGuidance: "Inspect the durable receipt first; if absent, obtain a fresh exact W01 plan before retrying.",
    evidence: { terminal_outcome: "not_deleted", canonical_payload_deleted: false, full_erasure_claimed: false, mutation_performed: false },
  });
  if (storeId !== state.metadata.store_id || request.expected?.store_id !== storeId) return notDeleted("case.purge_store_mismatch", "The purge request does not name the resolved immutable store.");
  if (path.basename(storePath) !== request.store_name) return notDeleted("case.purge_store_mismatch", "The named disposable store does not match the configured SQLite store.");
  const prior = await readStoreOperationReceipt(binary, storePath, operationId);
  if (prior) {
    if (prior.operation_kind !== "case_purge" || prior.request_digest !== requestDigest) return notDeleted("case.purge_idempotency_mismatch", "The operation ID is already settled for a different request.");
    return success("case.purge.execute", { ...prior.result, idempotent_replay: true, receipt: publicReceipt(prior) });
  }
  const view = await validateActiveView(binary, storePath, state, context);
  if (view.failure) return view.failure;
  if (state.operation_fence !== request.expected?.operation_fence
    || state.metadata.schema_id !== request.expected?.schema?.id
    || state.metadata.schema_version !== request.expected?.schema?.version) {
    return notDeleted("case.purge_plan_stale", "The exact store, schema, or operation fence has advanced.", RETRY_DISPOSITIONS.AFTER_RECONCILE);
  }
  const revisionIds = request.payload_scope.revision_ids.map((item) => canonicalCaseRevisionId(item.id));
  const stableIds = request.payload_scope.stable_identity_ids;
  const versionIds = request.payload_scope.version_ids.map(canonicalCaseVersionId);
  const owner = await ownerState(binary, storePath, targetCaseId);
  if (!owner || owner.owner_kind !== "case" || owner.revision_id !== canonicalCaseRevisionId(request.expected.case_revision.id) || owner.revision_number !== request.expected.case_revision.number) {
    return notDeleted("case.purge_plan_stale", "The exact current Case revision is absent or changed.", RETRY_DISPOSITIONS.AFTER_RECONCILE);
  }
  const projection = await purgeProjectionChanges(binary, storePath, targetCaseId);
  const settledAt = new Date().toISOString();
  const nextFence = state.operation_fence + 1;
  const coreResult = {
    status: "settled", operation_id: operationId, case_id: targetCaseId, plan_digest: planDigest,
    terminal: { outcome: "deleted", code: "case_payload_purge_completed", canonical_state_effect: "payload-erasure", retry_disposition: RETRY_DISPOSITIONS.NEVER },
    canonical_payload_deleted: true,
    full_erasure_claimed: false,
    deleted_scope: { payload_classes: request.payload_scope.payload_classes, revision_ids: request.payload_scope.revision_ids, stable_identity_ids: stableIds, version_ids: request.payload_scope.version_ids, disposable_projection_entries: projection.removed },
    retained_copy_disclosure: request.retained_copy_disclosure,
    retained_non_payload_evidence: { owner_identity: { id: targetCaseId, kind: "case", home_namespace_id: owner.home_namespace_id }, revision_ids: request.payload_scope.revision_ids, stable_identity_ids: stableIds, audit_receipt: { operation_id: operationId, operation_kind: "case_purge", operation_fence: nextFence } },
    postconditions: { canonical_payload_absent: true, non_payload_identity_retained: true, revision_history_retained: true, audit_receipt_durable: true, snapshots_untouched: true, external_authorities_untouched: true, integrity: "verified" },
    excluded_effects: { snapshots: "untouched", external_authorities: "untouched", independent_files: "untouched", independent_resources: "untouched", remote_publications: "untouched", retained_snapshots: "untouched" },
    applied_view: { view_id: context.view_id, view_policy_revision_id: context.view_policy_revision_id },
  };
  const resultDigest = mechanicalDigest(coreResult);
  let controlledFaultAfterDelete = "";
  let controlledFaultAfterReceipt = "";
  if (process.env.CASEBOOK_PERSISTENCE_TEST_FAULT === "purge_after_payload_delete_before_receipt") controlledFaultAfterDelete = "SELECT * FROM casebook_controlled_fault_after_purge_delete;";
  if (process.env.CASEBOOK_PERSISTENCE_TEST_FAULT === "purge_kill_executor_after_payload_delete_before_receipt") controlledFaultAfterDelete = ".shell kill -9 $PPID";
  if (process.env.CASEBOOK_PERSISTENCE_TEST_FAULT === "purge_after_receipt_before_commit") controlledFaultAfterReceipt = "SELECT * FROM casebook_controlled_fault_after_purge_receipt;";
  if (process.env.CASEBOOK_PERSISTENCE_TEST_FAULT === "purge_kill_executor_after_receipt_before_commit") controlledFaultAfterReceipt = ".shell kill -9 $PPID";
  const command = `.bail on
    PRAGMA busy_timeout=5000;
    PRAGMA foreign_keys=ON;
    PRAGMA secure_delete=ON;
    BEGIN IMMEDIATE;
    CREATE TEMP TABLE purge_guard(valid INTEGER NOT NULL CHECK(valid=1));
    INSERT INTO purge_guard VALUES(CASE WHEN (SELECT operation_fence FROM store_fence WHERE singleton=1)=${state.operation_fence} THEN 1 ELSE 0 END);
    INSERT INTO purge_guard VALUES(CASE WHEN EXISTS(SELECT 1 FROM owner_current WHERE owner_id=${sqlText(targetCaseId)} AND revision_id=${sqlText(owner.revision_id)} AND revision_number=${owner.revision_number} AND json_extract(projection_json,'$.state')='tombstoned') THEN 1 ELSE 0 END);
    INSERT INTO purge_guard VALUES(CASE WHEN (SELECT count(*) FROM owner_revisions WHERE owner_id=${sqlText(targetCaseId)} AND revision_id IN (${sqlList(revisionIds)}))=${revisionIds.length} AND (SELECT count(*) FROM owner_revisions WHERE owner_id=${sqlText(targetCaseId)})=${revisionIds.length} THEN 1 ELSE 0 END);
    INSERT INTO purge_guard VALUES(CASE WHEN (SELECT count(*) FROM owner_family_bindings WHERE owner_id=${sqlText(targetCaseId)} AND family_id IN (${sqlList(stableIds)}))=${stableIds.length} AND (SELECT count(*) FROM owner_family_bindings WHERE owner_id=${sqlText(targetCaseId)})=${stableIds.length} THEN 1 ELSE 0 END);
    INSERT INTO purge_guard VALUES(CASE WHEN (SELECT count(*) FROM owner_versions WHERE owner_id=${sqlText(targetCaseId)} AND version_id IN (${sqlList(versionIds)}))=${versionIds.length} AND (SELECT count(*) FROM owner_versions WHERE owner_id=${sqlText(targetCaseId)})=${versionIds.length} THEN 1 ELSE 0 END);
    DROP TRIGGER owner_revision_selections_immutable_delete;
    DROP TRIGGER owner_versions_immutable_delete;
    DROP TRIGGER owner_outbox_immutable_delete;
    DELETE FROM owner_revision_selections WHERE revision_id IN (${sqlList(revisionIds)});
    DELETE FROM owner_versions WHERE owner_id=${sqlText(targetCaseId)} AND version_id IN (${sqlList(versionIds)});
    DELETE FROM owner_current WHERE owner_id=${sqlText(targetCaseId)};
    DELETE FROM owner_outbox WHERE owner_id=${sqlText(targetCaseId)};
    ${projection.statements.join("\n")}
    ${controlledFaultAfterDelete}
    CREATE TRIGGER owner_revision_selections_immutable_delete BEFORE DELETE ON owner_revision_selections BEGIN SELECT RAISE(ABORT, 'owner revision selections are immutable'); END;
    CREATE TRIGGER owner_versions_immutable_delete BEFORE DELETE ON owner_versions BEGIN SELECT RAISE(ABORT, 'owner versions are immutable'); END;
    CREATE TRIGGER owner_outbox_immutable_delete BEFORE DELETE ON owner_outbox BEGIN SELECT RAISE(ABORT, 'owner outbox is immutable'); END;
    UPDATE store_fence SET operation_fence=${nextFence} WHERE singleton=1 AND operation_fence=${state.operation_fence};
    INSERT INTO store_operation_receipts(operation_id,operation_kind,store_id,request_digest,outcome,result_json,result_digest,authority_claim_json,settled_at,failure_class,retry_disposition,operation_fence,owner_id,owner_kind,owner_home_namespace_id,view_policy_revision_id,expected_revision,observed_revision,committed_revision,event_id)
    VALUES(${sqlText(operationId)},'case_purge',${sqlText(storeId)},${sqlText(requestDigest)},'deleted',${sqlText(JSON.stringify(coreResult))},${sqlText(resultDigest)},${sqlText(JSON.stringify(request.authority_claim))},${sqlText(settledAt)},NULL,'never',${nextFence},${sqlText(targetCaseId)},'case',${sqlText(owner.home_namespace_id)},${sqlText(context.view_policy_revision_id)},${owner.revision_number},${owner.revision_number},NULL,NULL);
    ${controlledFaultAfterReceipt}
    DELETE FROM purge_guard;
    INSERT INTO purge_guard VALUES(CASE WHEN
      NOT EXISTS(SELECT 1 FROM owner_current WHERE owner_id=${sqlText(targetCaseId)})
      AND NOT EXISTS(SELECT 1 FROM owner_versions WHERE owner_id=${sqlText(targetCaseId)})
      AND NOT EXISTS(SELECT 1 FROM owner_revision_selections WHERE revision_id IN (${sqlList(revisionIds)}))
      AND NOT EXISTS(SELECT 1 FROM owner_outbox WHERE owner_id=${sqlText(targetCaseId)})
      AND (SELECT count(*) FROM owners WHERE owner_id=${sqlText(targetCaseId)} AND owner_kind='case')=1
      AND (SELECT count(*) FROM owner_revisions WHERE owner_id=${sqlText(targetCaseId)})=${revisionIds.length}
      AND (SELECT count(*) FROM owner_family_bindings WHERE owner_id=${sqlText(targetCaseId)})=${stableIds.length}
      AND (SELECT count(*) FROM store_operation_receipts WHERE operation_id=${sqlText(operationId)} AND operation_kind='case_purge' AND outcome='deleted')=1
      AND (SELECT count(*) FROM pragma_foreign_key_check)=0
      AND (SELECT count(*) FROM pragma_quick_check WHERE quick_check<>'ok')=0
      THEN 1 ELSE 0 END);
    DROP TABLE purge_guard;
    COMMIT;`;
  try {
    await sqlite(binary, storePath, command, { args: ["-batch", "-bail"], timeout: 30_000, maxBuffer: 16 * 1024 * 1024 });
  } catch {
    const raced = await readStoreOperationReceipt(binary, storePath, operationId).catch(() => null);
    if (raced) return raced.operation_kind === "case_purge" && raced.request_digest === requestDigest
      ? success("case.purge.execute", { ...raced.result, idempotent_replay: true, receipt: publicReceipt(raced) })
      : notDeleted("case.purge_idempotency_mismatch", "The operation ID raced with a different request.");
    return notDeleted("case.purge_execution_failed", "The atomic purge transaction did not commit any deletion.", RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR);
  }
  if (process.env.CASEBOOK_PERSISTENCE_TEST_FAULT === "purge_kill_executor_after_commit_before_response") process.kill(process.pid, "SIGKILL");
  const receipt = await readStoreOperationReceipt(binary, storePath, operationId);
  return success("case.purge.execute", { ...coreResult, idempotent_replay: false, receipt: publicReceipt(receipt) });
}

async function readStoreOperationReceiptForFacade(request) {
  const context = contextShape(request.context);
  const storeId = requireUuidId(request.store_id, "store_id", "store");
  const operationId = requireString(request.operation_id, "operation_id", 256);
  const prepared = await prepare(request);
  if (prepared.failure) return prepared.failure;
  const { binary, storePath, state } = prepared;
  if (storeId !== state.metadata.store_id) return failure("not_visible", "The requested receipt is unknown or not visible.", { failureClass: "not_visible", evidence: {} });
  const view = await validateActiveView(binary, storePath, state, context);
  if (view.failure) return view.failure;
  const receipt = await readStoreOperationReceipt(binary, storePath, operationId);
  return success("read_store_operation_receipt_for_facade", {
    status: receipt ? "settled" : "absent_at_fence",
    receipt,
    operation_fence: state.operation_fence,
    applied_view: { view_id: context.view_id, view_policy_revision_id: context.view_policy_revision_id },
  });
}

export async function invokeMechanicalOperation(request) {
  try {
    if (request.operation === "read_active_view_scope") return await readActiveViewScope(request);
    if (request.operation === "commit_owner_revision") return await commitOwnerRevision(request);
    if (request.operation === "get_owner_operation_receipt") return await getOwnerOperationReceipt(request);
    if (request.operation === "read_store_operation_receipt_for_facade") return await readStoreOperationReceiptForFacade(request);
    if (request.operation === "purge_case_payload") return await purgeCasePayload(request);
    if (request.operation === "read_owner_current") return await readOwnerCurrent(request);
    if (request.operation === "read_owner_revision") return await readOwnerRevision(request);
    if (request.operation === "read_owner_current_corpus") return await readOwnerCurrentCorpus(request);
    if (request.operation === "discover_identities") return await discoverIdentities(request);
    if (request.operation === "validate_identity_handoff") return await validateIdentityHandoff(request);
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
