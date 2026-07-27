import { createHash } from "node:crypto";
import path from "node:path";
import { validateAuthorityConfiguration, ConfigurationError } from "../../../../shared/config.mjs";
import { loadAndValidateManifest } from "../../../../shared/manifest.mjs";
import { failure, RETRY_DISPOSITIONS, success } from "../../../../shared/protocol.mjs";
import { probeSqlite, selectSqliteBinary, sqlite } from "./diagnostics.mjs";
import {
  AdmissionCapabilityError, FINAL_ADMISSION_REGISTRY, admissionEvidenceInsertSql,
  ownerPolicyPredicate, prepareAdmission, profileAdmissionPredicate, profileBindingPredicate,
} from "../resource/admission-guards.mjs";
import { normalizeExactLocator } from "../resource/normalization.mjs";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const UUID_ID = new RegExp(`^[a-z][a-z0-9_-]*:${UUID}$`);
const DIGEST = /^[0-9a-f]{64}$/;
const OWNER_KINDS = new Set(["namespace", "profile", "profile-selection", "project-default", "chat", "case", "frame", "checkpoint"]);
const MAX_VERSIONS = 257; // 256 aggregate semantic families plus one placement family.
const MAX_SELECTIONS = 257;
const MAX_OUTBOX = 64;

export function successorCanonicalValue(value) {
  if (Array.isArray(value)) return value.map(successorCanonicalValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, successorCanonicalValue(value[key])]));
  return value;
}
export function successorCanonicalJson(value) { return JSON.stringify(successorCanonicalValue(value)); }
export function successorDigest(value) { return createHash("sha256").update(successorCanonicalJson(value)).digest("hex"); }

function sqlText(value) { return value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`; }
function sqlList(values) { return values.length ? values.map(sqlText).join(",") : "NULL"; }
function object(value) { return value && typeof value === "object" && !Array.isArray(value); }
function requireObject(value, field) { if (!object(value)) throw new MechanicalError("substrate_request_invalid", `${field} must be an object.`); return value; }
function requireString(value, field, max = 512) { if (typeof value !== "string" || !value.trim() || value.length > max) throw new MechanicalError("substrate_request_invalid", `${field} must be a non-empty bounded string.`); return value; }
function requireId(value, field, prefix = null) {
  requireString(value, field, 128);
  if (!UUID_ID.test(value) || (prefix && !value.startsWith(`${prefix}:`))) throw new MechanicalError("identity_invalid", `${field} is not a supported UUID identity.`);
  return value;
}
function requireDigest(value, field) { if (!DIGEST.test(value ?? "")) throw new MechanicalError("substrate_request_invalid", `${field} must be a lowercase SHA-256 digest.`); return value; }
function claimDocuments(documents) {
  for (const document of documents) {
    if (!object(document) || document.schema !== "owner-exact-claim@1") continue;
    if (Object.keys(document).sort().join("\0") !== ["claim_type", "normalized_value", "schema"].join("\0")) throw new MechanicalError("substrate_request_invalid", "Exact claim document is not closed.");
    requireString(document.claim_type, "query.claim_type", 128);
    if (normalizeExactLocator(requireString(document.normalized_value, "query.normalized_value", 256)) !== document.normalized_value) throw new MechanicalError("substrate_request_invalid", "Exact claim value is not canonically normalized.");
  }
}

class MechanicalError extends Error {
  constructor(code, message, options = {}) {
    super(message); this.code = code; this.failureClass = options.failureClass ?? "representation_invalid";
    this.retryDisposition = options.retryDisposition ?? RETRY_DISPOSITIONS.NEVER; this.evidence = options.evidence ?? {};
  }
}

export function canonicalSuccessorCommitDigest(storeId, envelope) {
  const value = structuredClone(envelope); delete value.request_digest;
  return successorDigest({ domain: "casebook-owner-neutral-commit@1", resolved_store_id: storeId, envelope: value });
}

async function queryJson(binary, storePath, query) {
  const { stdout } = await sqlite(binary, storePath, `PRAGMA query_only=ON;\n${query}`, { args: ["-batch", "-bail", "-json"], maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(stdout || "[]");
}

async function prepare(request) {
  const manifest = await loadAndValidateManifest();
  if (!manifest.ok) return { failure: failure("asset_incompatible", "Successor package assets are incompatible.", { failureClass: "asset_incompatible", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR, evidence: { problems: manifest.problems } }) };
  const configuration = validateAuthorityConfiguration(request.configuration);
  if (configuration.authority_mode !== "sqlite") return { failure: failure("sqlite_authority_required", "The owner-neutral substrate requires SQLite authority.") };
  const selected = await selectSqliteBinary();
  const probe = await probeSqlite(selected.path, path.dirname(configuration.sqlite.store_path));
  if (!probe.ok) return { failure: failure("sqlite_feature_unsupported", "The package-owned runtime is incompatible.", { failureClass: "asset_incompatible", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR, evidence: { problems: probe.problems } }) };
  const { inspectSuccessorStore } = await import("./bootstrap.mjs");
  const state = await inspectSuccessorStore(selected.path, configuration.sqlite.store_path);
  if (state.status !== "available") return { failure: failure(state.code ?? "store_unavailable", "The successor store is unavailable.", { failureClass: state.status === "migration_required" ? "schema_migration_required" : "store_unavailable", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR, evidence: state.evidence ?? {} }) };
  return { binary: selected.path, storePath: configuration.sqlite.store_path, state };
}

function placementGuardPredicate(guard) {
  if (!guard) return "1";
  const namespace = `EXISTS(SELECT 1 FROM context_namespace_current n WHERE n.namespace_id=${sqlText(guard.namespace_id)} AND n.namespace_revision_id=${sqlText(guard.namespace_revision_id)} AND n.lifecycle='active')`;
  if (!guard.chat) return namespace;
  return `(${namespace} AND EXISTS(SELECT 1 FROM context_chat_current c WHERE c.chat_id=${sqlText(guard.chat.chat_id)} AND c.chat_revision_id=${sqlText(guard.chat.chat_revision_id)} AND c.namespace_id=${sqlText(guard.namespace_id)}))`;
}

function validateEnvelope(value) {
  requireObject(value, "envelope");
  if (value.envelope_version !== 1) throw new MechanicalError("substrate_request_invalid", "envelope_version must be 1.");
  requireString(value.operation_id, "envelope.operation_id", 256);
  requireId(value.store_id, "envelope.store_id", "store");
  requireId(value.workspace_id, "envelope.workspace_id", "workspace");
  requireId(value.admission_slot_id, "envelope.admission_slot_id", "admission-slot");
  requireObject(value.admission, "envelope.admission");
  if (value.owner_policy_guard != null) requireObject(value.owner_policy_guard, "envelope.owner_policy_guard");
  if (value.placement_request_digest != null) requireDigest(value.placement_request_digest, "envelope.placement_request_digest");
  if (value.placement_guard != null) {
    const guard = requireObject(value.placement_guard, "envelope.placement_guard");
    if (Object.keys(guard).sort().join("\0") !== ["chat", "namespace_id", "namespace_revision_id"].sort().join("\0")) throw new MechanicalError("substrate_request_invalid", "placement_guard must be exact Namespace and optional Chat evidence.");
    requireId(guard.namespace_id, "envelope.placement_guard.namespace_id", "namespace");
    requireId(guard.namespace_revision_id, "envelope.placement_guard.namespace_revision_id", "owner-revision");
    if (guard.chat != null) { const chat = requireObject(guard.chat, "envelope.placement_guard.chat"); if (Object.keys(chat).sort().join("\0") !== ["chat_id", "chat_revision_id"].join("\0")) throw new MechanicalError("substrate_request_invalid", "Chat placement evidence is invalid."); requireId(chat.chat_id, "envelope.placement_guard.chat.chat_id", "chat"); requireId(chat.chat_revision_id, "envelope.placement_guard.chat.chat_revision_id", "owner-revision"); }
  }
  if ((value.query == null) !== (value.generation_effects == null)) throw new MechanicalError("substrate_request_invalid", "query material and generation effects must be supplied together.");
  if (value.query != null) {
    const query = requireObject(value.query, "envelope.query"); if (Object.keys(query).sort().join("\0") !== ["digest", "documents", "edges"].join("\0") || !Array.isArray(query.documents) || !Array.isArray(query.edges) || !DIGEST.test(query.digest) || successorDigest({ documents: query.documents, edges: query.edges }) !== query.digest) throw new MechanicalError("substrate_request_invalid", "query material is not canonical.");
    claimDocuments(query.documents);
    const effects = requireObject(value.generation_effects, "envelope.generation_effects"); if (Object.keys(effects).sort().join("\0") !== ["placement_changed", "query_changed"].join("\0") || typeof effects.placement_changed !== "boolean" || typeof effects.query_changed !== "boolean") throw new MechanicalError("substrate_request_invalid", "generation effects are invalid.");
  }
  const owner = requireObject(value.owner, "envelope.owner");
  requireId(owner.id, "envelope.owner.id", owner.kind);
  requireString(owner.kind, "envelope.owner.kind", 64);
  if (!OWNER_KINDS.has(owner.kind)) throw new MechanicalError("owner_kind_unknown", "The owner kind is not registered by the successor substrate.");
  if (!Number.isInteger(value.expected_revision) || value.expected_revision < 0) throw new MechanicalError("substrate_request_invalid", "expected_revision must be a non-negative integer.");
  const revision = requireObject(value.revision, "envelope.revision");
  requireId(revision.id, "envelope.revision.id", "owner-revision");
  if (revision.number !== value.expected_revision + 1) throw new MechanicalError("substrate_request_invalid", "revision.number must equal expected_revision + 1.");
  requireObject(revision.normalized, "envelope.revision.normalized");
  requireObject(value.current_projection, "envelope.current_projection");
  if (!Array.isArray(revision.versions) || revision.versions.length > MAX_VERSIONS) throw new MechanicalError("substrate_request_invalid", "revision.versions exceeds its closed bound.");
  if (!Array.isArray(revision.selections) || revision.selections.length > MAX_SELECTIONS) throw new MechanicalError("substrate_request_invalid", "revision.selections exceeds its closed bound.");
  const versions = new Map();
  for (const item of revision.versions) {
    requireObject(item, "revision.versions[]"); const family = requireId(item.family_id, "revision.versions[].family_id");
    const version = requireId(item.version_id, "revision.versions[].version_id", "version"); requireObject(item.content, "revision.versions[].content"); requireDigest(item.content_digest, "revision.versions[].content_digest");
    if (successorDigest(item.content) !== item.content_digest || versions.has(version)) throw new MechanicalError("substrate_request_invalid", "A submitted immutable version digest or identity is invalid.");
    versions.set(version, family);
  }
  const families = new Set();
  for (const item of revision.selections) {
    requireObject(item, "revision.selections[]"); const family = requireId(item.family_id, "revision.selections[].family_id"); const version = requireId(item.version_id, "revision.selections[].version_id", "version");
    if (families.has(family) || (versions.has(version) && versions.get(version) !== family)) throw new MechanicalError("substrate_request_invalid", "Revision selections are not one coherent family selection.");
    families.add(family);
  }
  for (const family of versions.values()) if (!families.has(family)) throw new MechanicalError("substrate_request_invalid", "Every new immutable version must be selected.");
  const event = requireObject(value.event, "envelope.event"); requireId(event.id, "envelope.event.id", "event"); requireString(event.type, "envelope.event.type", 128); requireObject(event.payload, "envelope.event.payload"); requireDigest(event.payload_digest, "envelope.event.payload_digest");
  if (successorDigest(event.payload) !== event.payload_digest) throw new MechanicalError("substrate_request_invalid", "event payload digest is invalid.");
  if (!Array.isArray(value.outbox) || value.outbox.length > MAX_OUTBOX) throw new MechanicalError("substrate_request_invalid", "outbox exceeds its closed bound.");
  for (const item of value.outbox) { requireObject(item, "envelope.outbox[]"); requireId(item.id, "envelope.outbox[].id", "outbox"); requireString(item.kind, "envelope.outbox[].kind", 128); requireObject(item.payload, "envelope.outbox[].payload"); requireDigest(item.payload_digest, "envelope.outbox[].payload_digest"); if (successorDigest(item.payload) !== item.payload_digest) throw new MechanicalError("substrate_request_invalid", "outbox payload digest is invalid."); }
  requireDigest(value.request_digest, "envelope.request_digest");
  return value;
}

async function readReceipt(binary, storePath, operationId) {
  const rows = await queryJson(binary, storePath, `SELECT * FROM store_operation_receipts WHERE operation_id=${sqlText(operationId)} LIMIT 1;`);
  if (!rows.length) return null;
  const row = rows[0]; return { ...row, result: JSON.parse(row.result_json) };
}
function publicReceipt(row) { const value = { ...row }; delete value.result_json; delete value.result; return value; }
function replayResponse(receipt, replay) { return receipt.outcome === "rejected" ? JSON.parse(receipt.result_json) : success(receipt.operation_kind, { ...receipt.result, receipt: publicReceipt(receipt), idempotent_replay: replay }); }
function mismatch(operationId) { return failure("idempotency_mismatch", "operation_id is settled for different canonical meaning.", { failureClass: "idempotency_mismatch", evidence: { operation_id: operationId } }); }
function prepareRequestAdmission(request, operation) {
  return prepareAdmission({ registry: FINAL_ADMISSION_REGISTRY, operation, workspaceId: request.workspace_id, admissionSlotId: request.admission_slot_id, admission: request.admission });
}
async function inspectAdmission(binary, storePath, admission) {
  const rows = await queryJson(binary, storePath, `SELECT CASE WHEN ${profileBindingPredicate(admission)} THEN 1 ELSE 0 END binding_ok,CASE WHEN ${profileAdmissionPredicate(admission)} THEN 1 ELSE 0 END admission_ok;`);
  return rows[0] ?? { binding_ok: 0, admission_ok: 0 };
}

async function settleRejected(binary, storePath, state, envelope, response, observed, admission) {
  const now = new Date().toISOString(), next = state.operation_fence + 1;
  try {
    await sqlite(binary, storePath, `.bail on\nPRAGMA foreign_keys=ON;\nBEGIN IMMEDIATE;
      CREATE TEMP TABLE guard(ok INTEGER CHECK(ok=1));
      INSERT INTO guard VALUES(CASE WHEN ${profileAdmissionPredicate(admission)} THEN 1 ELSE 0 END);
      INSERT INTO guard VALUES(CASE WHEN ${ownerPolicyPredicate(admission)} THEN 1 ELSE 0 END);
      INSERT INTO store_operation_receipts(operation_id,operation_kind,store_id,request_digest,outcome,result_json,result_digest,settled_at,retry_disposition,operation_fence,owner_id,expected_revision,observed_revision)
      SELECT ${sqlText(envelope.operation_id)},'substrate.commit_revision',${sqlText(state.metadata.store_id)},${sqlText(envelope.request_digest)},'rejected',${sqlText(JSON.stringify(response))},${sqlText(successorDigest(response))},${sqlText(now)},${sqlText(response.failure.retry_disposition)},${next},${sqlText(envelope.owner.id)},${envelope.expected_revision},${observed}
      WHERE NOT EXISTS(SELECT 1 FROM store_operation_receipts WHERE operation_id=${sqlText(envelope.operation_id)});
      ${admissionEvidenceInsertSql(envelope.operation_id, admission)}
      UPDATE store_fence SET operation_fence=${next} WHERE singleton=1 AND operation_fence=${state.operation_fence};
      COMMIT;`, { args: ["-batch", "-bail"], timeout: 20_000 });
  } catch {
    const status = await queryJson(binary, storePath, `SELECT CASE WHEN ${profileBindingPredicate(admission)} THEN 1 ELSE 0 END binding_ok,CASE WHEN ${profileAdmissionPredicate(admission)} THEN 1 ELSE 0 END admission_ok,CASE WHEN ${ownerPolicyPredicate(admission)} THEN 1 ELSE 0 END policy_ok;`).catch(() => []);
    if (status[0]?.binding_ok !== 1) return failure("profile_changed", "The exact Profile selection changed before rejection could be disclosed.", { failureClass: "profile_changed", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
    if (status[0]?.admission_ok !== 1) return failure("profile_guard_denied", "The selected Profile no longer admits rejection disclosure.", { failureClass: "profile_guard_denied" });
    if (status[0]?.policy_ok !== 1) return failure("authorization_changed", "The aggregate policy changed before target rejection settled.", { failureClass: "authorization_changed", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
    throw new MechanicalError("commit_execution_failed", "The guarded rejection did not settle.", { failureClass: "internal_failure", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
  }
  return response;
}

async function commitRevision(request, admissionRegistry) {
  const envelope = validateEnvelope(request.envelope);
  const admission = prepareAdmission({
    registry: admissionRegistry, operation: "substrate.commit_revision",
    workspaceId: envelope.workspace_id, admissionSlotId: envelope.admission_slot_id,
    admission: envelope.admission, ownerPolicyGuard: envelope.owner_policy_guard ?? null, targetOwnerKind: envelope.owner.kind,
  });
  const prepared = await prepare(request); if (prepared.failure) return prepared.failure;
  const { binary, storePath, state } = prepared;
  const expectedDigest = canonicalSuccessorCommitDigest(state.metadata.store_id, envelope);
  if (envelope.request_digest !== expectedDigest) return failure("request_digest_mismatch", "request_digest does not match canonical resolved-store meaning.", { failureClass: "representation_invalid" });
  const existing = await readReceipt(binary, storePath, envelope.operation_id);
  if (existing) return existing.operation_kind === "substrate.commit_revision" && existing.request_digest === expectedDigest ? replayResponse(existing, true) : mismatch(envelope.operation_id);
  if (envelope.store_id !== state.metadata.store_id || envelope.workspace_id !== state.metadata.workspace_id) return failure("store_target_mismatch", "The immutable resolved store/workspace identity differs.");
  const admissionRows = await queryJson(binary, storePath, `SELECT CASE WHEN ${profileBindingPredicate(admission)} THEN 1 ELSE 0 END binding_ok,CASE WHEN ${profileAdmissionPredicate(admission)} THEN 1 ELSE 0 END profile_ok,CASE WHEN ${ownerPolicyPredicate(admission)} THEN 1 ELSE 0 END policy_ok;`);
  if (admissionRows[0]?.binding_ok !== 1) return failure("profile_changed", "The exact Profile selection or activation fence changed.", { failureClass: "profile_changed", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
  if (admissionRows[0]?.profile_ok !== 1) return failure("profile_guard_denied", "The selected Profile does not admit the provider-derived purpose or target kind.", { failureClass: "profile_guard_denied" });
  if (admissionRows[0]?.policy_ok !== 1) return failure("authorization_changed", "The aggregate-owned policy admission fence changed or was revoked.", { failureClass: "authorization_changed", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
  const currentRows = await queryJson(binary, storePath, `SELECT o.owner_kind,c.revision_number,c.revision_id FROM owners o LEFT JOIN owner_current c ON c.owner_id=o.owner_id WHERE o.owner_id=${sqlText(envelope.owner.id)};`);
  const current = currentRows[0] ?? null, observed = current?.revision_number ?? 0;
  if ((current && current.owner_kind !== envelope.owner.kind) || observed !== envelope.expected_revision) {
    const response = failure("revision_conflict", "expected_revision does not match canonical current state.", { failureClass: "revision_conflict", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE, evidence: { observed_revision: observed } });
    return settleRejected(binary, storePath, state, envelope, response, observed, admission);
  }
  const now = new Date().toISOString(), next = state.operation_fence + 1;
  const core = { status: "settled", owner: envelope.owner, committed_revision: { id: envelope.revision.id, number: envelope.revision.number }, request_digest: expectedDigest, ...(envelope.placement_request_digest ? { placement_request_digest: envelope.placement_request_digest } : {}), admission_evidence: admission.evidence, generations: { placement_changed: envelope.generation_effects?.placement_changed ?? false, query_changed: envelope.generation_effects?.query_changed ?? false } };
  const statements = [".bail on", "PRAGMA foreign_keys=ON;", "BEGIN IMMEDIATE;", "CREATE TEMP TABLE guard(ok INTEGER CHECK(ok=1));", `INSERT INTO guard VALUES(CASE WHEN ${profileAdmissionPredicate(admission)} THEN 1 ELSE 0 END);`, `INSERT INTO guard VALUES(CASE WHEN ${ownerPolicyPredicate(admission)} THEN 1 ELSE 0 END);`, `INSERT INTO guard VALUES(CASE WHEN (SELECT operation_fence FROM store_fence WHERE singleton=1)=${state.operation_fence} THEN 1 ELSE 0 END);`,
    ...(envelope.placement_guard ? [`INSERT INTO guard VALUES(CASE WHEN ${placementGuardPredicate(envelope.placement_guard)} THEN 1 ELSE 0 END);`] : []), `INSERT INTO guard VALUES(CASE WHEN NOT EXISTS(SELECT 1 FROM store_operation_receipts WHERE operation_id=${sqlText(envelope.operation_id)}) THEN 1 ELSE 0 END);`];
  if (envelope.expected_revision === 0) statements.push(`INSERT INTO owners VALUES(${sqlText(envelope.owner.id)},${sqlText(envelope.owner.kind)},${sqlText(now)});`);
  else statements.push(`INSERT INTO guard VALUES(CASE WHEN EXISTS(SELECT 1 FROM owner_current WHERE owner_id=${sqlText(envelope.owner.id)} AND revision_number=${envelope.expected_revision}) THEN 1 ELSE 0 END);`);
  const families = [...new Set([...envelope.revision.versions.map((v) => v.family_id), ...envelope.revision.selections.map((s) => s.family_id)])];
  for (const family of families) statements.push(`INSERT OR IGNORE INTO owner_family_bindings VALUES(${sqlText(family)},${sqlText(envelope.owner.id)},${sqlText(now)});`, `INSERT INTO guard VALUES(CASE WHEN EXISTS(SELECT 1 FROM owner_family_bindings WHERE family_id=${sqlText(family)} AND owner_id=${sqlText(envelope.owner.id)}) THEN 1 ELSE 0 END);`);
  for (const version of envelope.revision.versions) statements.push(`INSERT INTO owner_versions VALUES(${sqlText(version.version_id)},${sqlText(envelope.owner.id)},${sqlText(version.family_id)},${sqlText(JSON.stringify(version.content))},${sqlText(version.content_digest)},${sqlText(now)});`);
  const normalized = { owner_normalized: envelope.revision.normalized, _mechanical_current_projection: envelope.current_projection, ...(envelope.placement_history == null ? {} : { _mechanical_placement_history: envelope.placement_history }) };
  statements.push(`INSERT INTO owner_revisions VALUES(${sqlText(envelope.revision.id)},${sqlText(envelope.owner.id)},${envelope.revision.number},${sqlText(JSON.stringify(normalized))},${sqlText(envelope.operation_id)},${sqlText(now)});`);
  if (envelope.query) {
    const previousQuery = `(SELECT query_digest FROM owner_query_current WHERE owner_id=${sqlText(envelope.owner.id)})`;
    statements.push(`INSERT INTO guard VALUES(CASE WHEN ${envelope.generation_effects.query_changed ? `COALESCE(${previousQuery},'')<>${sqlText(envelope.query.digest)}` : `COALESCE(${previousQuery},${sqlText(envelope.query.digest)})=${sqlText(envelope.query.digest)}`} THEN 1 ELSE 0 END);`);
    statements.push(`INSERT INTO owner_query_material VALUES(${sqlText(envelope.revision.id)},${sqlText(envelope.owner.id)},${sqlText(envelope.query.digest)},${sqlText(JSON.stringify(envelope.query.documents))},${sqlText(JSON.stringify(envelope.query.edges))},${next},${sqlText(now)});`);
    if (envelope.generation_effects.query_changed) statements.push(
      `INSERT INTO owner_query_current(owner_id,revision_id,query_digest,applied_through_fence,updated_at) VALUES(${sqlText(envelope.owner.id)},${sqlText(envelope.revision.id)},${sqlText(envelope.query.digest)},${next},${sqlText(now)}) ON CONFLICT(owner_id) DO UPDATE SET revision_id=excluded.revision_id,query_digest=excluded.query_digest,applied_through_fence=excluded.applied_through_fence,updated_at=excluded.updated_at;`,
      // The FTS table is a disposable R projection. Only canonical documents
      // selected by this same commit are indexed; no historical scan exists.
      `DELETE FROM owner_query_fts WHERE owner_id=${sqlText(envelope.owner.id)};`,
      `INSERT INTO owner_query_fts(owner_id,revision_id,resource_id,resource_kind,document_json,text)
        SELECT ${sqlText(envelope.owner.id)},${sqlText(envelope.revision.id)},json_extract(d.value,'$.resource_id'),json_extract(d.value,'$.resource_kind'),d.value,COALESCE(json_extract(d.value,'$.search.text'),json_extract(d.value,'$.text'))
        FROM json_each(${sqlText(JSON.stringify(envelope.query.documents))}) d
        WHERE json_extract(d.value,'$.resource_id') IS NOT NULL AND json_extract(d.value,'$.resource_kind') IS NOT NULL
          AND COALESCE(json_extract(d.value,'$.search.text'),json_extract(d.value,'$.text')) IS NOT NULL;`
    );
  }
  for (const selection of envelope.revision.selections) statements.push(`INSERT INTO guard VALUES(CASE WHEN EXISTS(SELECT 1 FROM owner_versions WHERE version_id=${sqlText(selection.version_id)} AND family_id=${sqlText(selection.family_id)} AND owner_id=${sqlText(envelope.owner.id)}) THEN 1 ELSE 0 END);`, `INSERT INTO owner_revision_selections VALUES(${sqlText(envelope.revision.id)},${sqlText(selection.family_id)},${sqlText(selection.version_id)});`);
  if (envelope.expected_revision === 0) statements.push(`INSERT INTO owner_current VALUES(${sqlText(envelope.owner.id)},${sqlText(envelope.revision.id)},${envelope.revision.number},${sqlText(JSON.stringify(envelope.current_projection))},${sqlText(now)});`);
  else statements.push(`UPDATE owner_current SET revision_id=${sqlText(envelope.revision.id)},revision_number=${envelope.revision.number},projection_json=${sqlText(JSON.stringify(envelope.current_projection))},updated_at=${sqlText(now)} WHERE owner_id=${sqlText(envelope.owner.id)} AND revision_number=${envelope.expected_revision};`, "INSERT INTO guard VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END);");
  // Claims are a disposable exact projection. Their Namespace is never a
  // semantic home field: it is always the selected current placement.
  statements.push(`DELETE FROM owner_current_claims WHERE owner_id=${sqlText(envelope.owner.id)};`, `INSERT INTO owner_current_claims(owner_kind,claim_type,namespace_id,normalized_value,owner_id,owner_revision_id,operation_fence)
    SELECT o.owner_kind,json_extract(d.value,'$.claim_type'),json_extract(c.projection_json,'$._mechanical_placement.namespace_id'),json_extract(d.value,'$.normalized_value'),o.owner_id,c.revision_id,${next}
    FROM owners o JOIN owner_current c ON c.owner_id=o.owner_id JOIN owner_query_material q ON q.revision_id=c.revision_id JOIN json_each(q.documents_json) d
    WHERE o.owner_id=${sqlText(envelope.owner.id)} AND json_extract(d.value,'$.schema')='owner-exact-claim@1' AND json_extract(c.projection_json,'$._mechanical_placement.namespace_id') IS NOT NULL;`);
  statements.push(`UPDATE store_fence SET operation_fence=${next},placement_generation=placement_generation+${envelope.generation_effects?.placement_changed ? 1 : 0},resource_generation=resource_generation+${envelope.generation_effects?.query_changed ? 1 : 0} WHERE singleton=1 AND operation_fence=${state.operation_fence};`, `INSERT INTO owner_events VALUES(${sqlText(envelope.event.id)},${sqlText(envelope.operation_id)},${sqlText(envelope.owner.id)},${sqlText(envelope.revision.id)},${sqlText(envelope.event.type)},${sqlText(JSON.stringify(envelope.event.payload))},${sqlText(envelope.event.payload_digest)},${next},${sqlText(now)});`);
  for (const item of envelope.outbox) statements.push(`INSERT INTO owner_outbox VALUES(${sqlText(item.id)},${sqlText(envelope.operation_id)},${sqlText(envelope.owner.id)},${sqlText(item.kind)},${sqlText(JSON.stringify(item.payload))},${sqlText(item.payload_digest)},${next},${sqlText(now)});`);
  statements.push(`INSERT INTO store_operation_receipts VALUES(${sqlText(envelope.operation_id)},'substrate.commit_revision',${sqlText(state.metadata.store_id)},${sqlText(expectedDigest)},'committed',${sqlText(JSON.stringify(core))},${sqlText(successorDigest(core))},${sqlText(now)},'never',${next},${sqlText(envelope.owner.id)},${envelope.expected_revision},${observed},${envelope.revision.number},${sqlText(envelope.event.id)});`, admissionEvidenceInsertSql(envelope.operation_id, admission), "COMMIT;");
  try { await sqlite(binary, storePath, statements.join("\n"), { args: ["-batch", "-bail"], timeout: 20_000, maxBuffer: 16 * 1024 * 1024 }); }
  catch {
    const raced = await readReceipt(binary, storePath, envelope.operation_id).catch(() => null);
    if (raced) return raced.request_digest === expectedDigest ? replayResponse(raced, true) : mismatch(envelope.operation_id);
    const guardRows = await queryJson(binary, storePath, `SELECT CASE WHEN ${profileBindingPredicate(admission)} THEN 1 ELSE 0 END binding_ok,CASE WHEN ${profileAdmissionPredicate(admission)} THEN 1 ELSE 0 END profile_ok,CASE WHEN ${ownerPolicyPredicate(admission)} THEN 1 ELSE 0 END policy_ok;`).catch(() => []);
    if (guardRows[0]?.binding_ok !== 1) return failure("profile_changed", "The exact Profile selection or activation fence changed before target commit.", { failureClass: "profile_changed", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
    if (guardRows[0]?.profile_ok !== 1) return failure("profile_guard_denied", "The selected Profile does not admit the provider-derived purpose or target kind.", { failureClass: "profile_guard_denied" });
    if (guardRows[0]?.policy_ok !== 1) return failure("authorization_changed", "The aggregate-owned policy admission fence changed or was revoked before target commit.", { failureClass: "authorization_changed", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
    if (envelope.placement_guard) {
      const placementRows = await queryJson(binary, storePath, `SELECT CASE WHEN ${placementGuardPredicate(envelope.placement_guard)} THEN 1 ELSE 0 END placement_ok;`).catch(() => []);
      if (placementRows[0]?.placement_ok !== 1) return failure("context_stale", "The exact Context placement evidence changed before owner commit.", { failureClass: "revision_conflict", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
    }
    const { inspectSuccessorStore } = await import("./bootstrap.mjs");
    const freshState = await inspectSuccessorStore(binary, storePath).catch(() => null);
    const afterRows = freshState?.status === "available"
      ? await queryJson(binary, storePath, `SELECT o.owner_kind,c.revision_number,c.revision_id FROM owners o LEFT JOIN owner_current c ON c.owner_id=o.owner_id WHERE o.owner_id=${sqlText(envelope.owner.id)};`).catch(() => [])
      : [];
    const after = afterRows[0] ?? null, afterRevision = after?.revision_number ?? 0;
    if (freshState?.status === "available" && (afterRevision !== envelope.expected_revision || (after && after.owner_kind !== envelope.owner.kind))) {
      const conflict = failure("revision_conflict", "expected_revision lost a concurrent atomic comparison.", { failureClass: "revision_conflict", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE, evidence: { observed_revision: afterRevision } });
      return settleRejected(binary, storePath, freshState, envelope, conflict, afterRevision, admission);
    }
    return failure("commit_execution_failed", "The atomic owner-neutral commit did not settle.", { failureClass: "internal_failure", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
  }
  return replayResponse(await readReceipt(binary, storePath, envelope.operation_id), false);
}

async function readOwner(request, exactRevision = false) {
  requireId(request.store_id, "store_id", "store");
  requireId(request.workspace_id, "workspace_id", "workspace");
  requireId(request.admission_slot_id, "admission_slot_id", "admission-slot");
  requireObject(request.owner, "owner");
  requireId(request.owner.id, "owner.id", request.owner.kind);
  requireString(request.owner.kind, "owner.kind", 64);
  if (exactRevision) requireId(request.revision_id, "revision_id", "owner-revision");
  const prepared = await prepare(request); if (prepared.failure) return prepared.failure;
  if (request.store_id !== prepared.state.metadata.store_id || request.workspace_id !== prepared.state.metadata.workspace_id) return success(exactRevision ? "substrate.read_owner_revision" : "substrate.read_owner_current", { status: "not_visible" });
  const operation = exactRevision ? "substrate.read_owner_revision" : "substrate.read_owner_current";
  const admission = prepareRequestAdmission(request, operation);
  const admissionStatus = await inspectAdmission(prepared.binary, prepared.storePath, admission);
  if (admissionStatus.binding_ok !== 1) return failure("profile_changed", "The exact Profile selection changed before owner disclosure.", { failureClass: "profile_changed", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
  if (admissionStatus.admission_ok !== 1) return failure("profile_guard_denied", "The selected Profile does not admit owner disclosure.", { failureClass: "profile_guard_denied" });
  const revisionClause = exactRevision ? `AND r.revision_id=${sqlText(request.revision_id)}` : "AND c.owner_id IS NOT NULL";
  const rows = await queryJson(prepared.binary, prepared.storePath, `SELECT o.owner_id,o.owner_kind,r.revision_id,r.revision_number,r.normalized_json,c.projection_json FROM owners o LEFT JOIN owner_current c ON c.owner_id=o.owner_id LEFT JOIN owner_revisions r ON r.owner_id=o.owner_id ${exactRevision ? "" : "AND r.revision_id=c.revision_id"} WHERE o.owner_id=${sqlText(request.owner.id)} AND o.owner_kind=${sqlText(request.owner.kind)} ${revisionClause} LIMIT 1;`);
  if (!rows.length) return success(operation, { status: "not_visible" });
  const row = rows[0], normalized = JSON.parse(row.normalized_json);
  const selected_versions = await queryJson(prepared.binary, prepared.storePath, `SELECT s.family_id,s.version_id,v.content_json,v.content_digest FROM owner_revision_selections s JOIN owner_versions v ON v.version_id=s.version_id WHERE s.revision_id=${sqlText(row.revision_id)} ORDER BY s.family_id;`);
  return success(operation, {
    status: "visible", owner: { id: row.owner_id, kind: row.owner_kind }, revision_id: row.revision_id,
    revision_number: row.revision_number, current_projection: row.projection_json == null ? null : JSON.parse(row.projection_json),
    normalized: normalized.owner_normalized ?? null, placement_history: normalized._mechanical_placement_history ?? null,
    selected_versions: selected_versions.map((selection) => ({ family_id: selection.family_id, version_id: selection.version_id, content: JSON.parse(selection.content_json), content_digest: selection.content_digest })),
  });
}

async function resolveFamilyBinding(request) {
  requireId(request.store_id, "store_id", "store"); requireId(request.workspace_id, "workspace_id", "workspace"); requireId(request.admission_slot_id, "admission_slot_id", "admission-slot");
  requireString(request.owner_kind, "owner_kind", 64); if (!OWNER_KINDS.has(request.owner_kind)) throw new MechanicalError("owner_kind_unknown", "The owner kind is not registered by the successor substrate.");
  requireId(request.family_id, "family_id"); requireObject(request.selector, "selector");
  const current = Object.keys(request.selector).length === 1 && request.selector.current === true;
  const historical = Object.keys(request.selector).length === 1 && typeof request.selector.owner_revision_id === "string";
  if (!current && !historical) throw new MechanicalError("substrate_request_invalid", "selector must select current or one exact owner revision.");
  if (historical) requireId(request.selector.owner_revision_id, "selector.owner_revision_id", "owner-revision");
  const prepared = await prepare(request); if (prepared.failure) return prepared.failure;
  if (request.store_id !== prepared.state.metadata.store_id || request.workspace_id !== prepared.state.metadata.workspace_id) return success("substrate.resolve_family_binding", { status: "not_visible" });
  const admission = prepareRequestAdmission(request, "substrate.resolve_family_binding"); const status = await inspectAdmission(prepared.binary, prepared.storePath, admission);
  if (status.binding_ok !== 1) return failure("profile_changed", "The exact Profile selection changed before family binding disclosure.", { failureClass: "profile_changed", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
  if (status.admission_ok !== 1) return failure("profile_guard_denied", "The selected Profile does not admit family binding disclosure.", { failureClass: "profile_guard_denied" });
  const revision = current ? "c.revision_id" : sqlText(request.selector.owner_revision_id);
  const rows = await queryJson(prepared.binary, prepared.storePath, `SELECT o.owner_id,o.owner_kind,r.revision_id,r.revision_number,s.version_id,(SELECT operation_fence FROM store_fence WHERE singleton=1) operation_fence FROM owner_family_bindings b JOIN owners o ON o.owner_id=b.owner_id ${current ? "JOIN owner_current c ON c.owner_id=o.owner_id" : ""} JOIN owner_revisions r ON r.owner_id=o.owner_id AND r.revision_id=${revision} JOIN owner_revision_selections s ON s.revision_id=r.revision_id AND s.family_id=b.family_id WHERE b.family_id=${sqlText(request.family_id)} AND o.owner_kind=${sqlText(request.owner_kind)} AND ${profileAdmissionPredicate(admission)} LIMIT 1;`);
  const after = await inspectAdmission(prepared.binary, prepared.storePath, admission); if (after.binding_ok !== 1) return failure("profile_changed", "The exact Profile selection changed before family binding disclosure.", { failureClass: "profile_changed", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
  if (after.admission_ok !== 1) return failure("profile_guard_denied", "The selected Profile does not admit family binding disclosure.", { failureClass: "profile_guard_denied" });
  if (!rows.length) return success("substrate.resolve_family_binding", { status: "not_visible" }); const row = rows[0];
  return success("substrate.resolve_family_binding", { status: "found", owner: { id: row.owner_id, kind: row.owner_kind }, owner_revision: { id: row.revision_id, number: row.revision_number }, family: { id: request.family_id, version_id: row.version_id }, operation_fence: row.operation_fence });
}
async function resolveCurrentClaim(request) {
  requireId(request.store_id, "store_id", "store"); requireId(request.workspace_id, "workspace_id", "workspace"); requireId(request.admission_slot_id, "admission_slot_id", "admission-slot"); requireString(request.owner_kind, "owner_kind", 64); requireString(request.claim_type, "claim_type", 128); requireId(request.namespace_id, "namespace_id", "namespace");
  if (normalizeExactLocator(requireString(request.normalized_value, "normalized_value", 256)) !== request.normalized_value) throw new MechanicalError("substrate_request_invalid", "normalized_value is not canonically normalized.");
  const prepared = await prepare(request); if (prepared.failure) return prepared.failure;
  if (request.store_id !== prepared.state.metadata.store_id || request.workspace_id !== prepared.state.metadata.workspace_id) return success("substrate.resolve_current_claim", { status: "zero" });
  const admission = prepareRequestAdmission(request, "substrate.resolve_current_claim"); const status = await inspectAdmission(prepared.binary, prepared.storePath, admission);
  if (status.binding_ok !== 1) return failure("profile_changed", "The exact Profile selection changed before claim disclosure.", { failureClass: "profile_changed", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE }); if (status.admission_ok !== 1) return failure("profile_guard_denied", "The selected Profile does not admit claim disclosure.", { failureClass: "profile_guard_denied" });
  const rows = await queryJson(prepared.binary, prepared.storePath, `SELECT c.owner_id,c.owner_revision_id,(SELECT revision_number FROM owner_revisions r WHERE r.revision_id=c.owner_revision_id) revision_number,(SELECT operation_fence FROM store_fence WHERE singleton=1) operation_fence FROM owner_current_claims c WHERE c.owner_kind=${sqlText(request.owner_kind)} AND c.claim_type=${sqlText(request.claim_type)} AND c.namespace_id=${sqlText(request.namespace_id)} AND c.normalized_value=${sqlText(request.normalized_value)} AND ${profileAdmissionPredicate(admission)} LIMIT 2;`);
  const after = await inspectAdmission(prepared.binary, prepared.storePath, admission); if (after.binding_ok !== 1) return failure("profile_changed", "The exact Profile selection changed before claim disclosure.", { failureClass: "profile_changed", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE }); if (after.admission_ok !== 1) return failure("profile_guard_denied", "The selected Profile does not admit claim disclosure.", { failureClass: "profile_guard_denied" });
  if (!rows.length) return success("substrate.resolve_current_claim", { status: "zero" }); if (rows.length > 1) return success("substrate.resolve_current_claim", { status: "ambiguous" }); const row = rows[0]; return success("substrate.resolve_current_claim", { status: "found", owner: { id: row.owner_id, kind: request.owner_kind }, owner_revision: { id: row.owner_revision_id, number: row.revision_number }, operation_fence: row.operation_fence });
}
async function getReceipt(request) {
  requireId(request.store_id, "store_id", "store"); requireString(request.operation_id, "operation_id", 256);
  const prepared = await prepare(request); if (prepared.failure) return prepared.failure;
  const admission = prepareRequestAdmission(request, "substrate.get_receipt");
  if (request.store_id !== prepared.state.metadata.store_id || request.workspace_id !== prepared.state.metadata.workspace_id) return success("substrate.get_receipt", { status: "not_visible" });
  const admissionStatus = await inspectAdmission(prepared.binary, prepared.storePath, admission);
  if (admissionStatus.binding_ok !== 1) return failure("profile_changed", "The exact Profile selection or receipt-disclosure fence changed.", { failureClass: "profile_changed", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
  if (admissionStatus.admission_ok !== 1) return failure("profile_guard_denied", "The selected Profile does not admit receipt disclosure.", { failureClass: "profile_guard_denied" });
  const receipt = await readReceipt(prepared.binary, prepared.storePath, request.operation_id);
  return success("substrate.get_receipt", receipt ? { status: "settled", receipt: publicReceipt(receipt), result: receipt.result } : { status: "absent_at_fence", operation_fence: prepared.state.operation_fence });
}

async function observeIntegrity(request) {
  requireId(request.store_id, "store_id", "store"); const prepared = await prepare(request); if (prepared.failure) return prepared.failure;
  const admission = prepareRequestAdmission(request, "integrity.observe");
  if (request.store_id !== prepared.state.metadata.store_id || request.workspace_id !== prepared.state.metadata.workspace_id) return failure("store_target_mismatch", "Store/workspace identity differs.");
  const admissionStatus = await inspectAdmission(prepared.binary, prepared.storePath, admission);
  if (admissionStatus.binding_ok !== 1) return failure("profile_changed", "The exact Profile selection or integrity purpose fence changed.", { failureClass: "profile_changed", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
  if (admissionStatus.admission_ok !== 1) return failure("profile_guard_denied", "The selected Profile does not admit integrity observation.", { failureClass: "profile_guard_denied" });
  const rows = await queryJson(prepared.binary, prepared.storePath, `SELECT
    (SELECT quick_check FROM pragma_quick_check) quick_check,
    (SELECT count(*) FROM pragma_foreign_key_check) foreign_keys,
    (SELECT count(*) FROM owner_current c WHERE NOT EXISTS(SELECT 1 FROM owner_revisions r WHERE r.revision_id=c.revision_id AND r.owner_id=c.owner_id AND r.revision_number=c.revision_number)) current_orphans,
    (SELECT count(*) FROM owner_revision_selections s JOIN owner_versions v ON v.version_id=s.version_id JOIN owner_revisions r ON r.revision_id=s.revision_id WHERE v.owner_id<>r.owner_id OR v.family_id<>s.family_id) selection_mismatch,
    (SELECT count(*) FROM profile_revision_records p WHERE NOT EXISTS(SELECT 1 FROM owner_revision_selections s JOIN owner_versions v ON v.version_id=s.version_id WHERE s.revision_id=p.profile_revision_id AND s.family_id=p.profile_id AND s.version_id=p.version_id AND v.owner_id=p.profile_id AND v.family_id=p.profile_id AND v.content_json=p.content_json AND v.content_digest=p.content_digest)) profile_revision_mismatch,
    (SELECT count(*) FROM profile_selection_current c WHERE NOT EXISTS(SELECT 1 FROM profile_selection_revisions r JOIN owner_current oc ON oc.owner_id=r.selection_id AND oc.revision_id=r.selection_revision_id JOIN profile_revision_records p ON p.profile_revision_id=r.selected_profile_revision_id AND p.profile_id=r.selected_profile_id AND p.lifecycle='active' WHERE r.selection_revision_id=c.selection_revision_id AND r.selection_id=c.selection_id AND r.admission_slot_id=c.admission_slot_id AND r.selected_profile_id=c.profile_id AND r.selected_profile_revision_id=c.profile_revision_id AND r.activation_fence=c.activation_fence AND r.lifecycle='active')) profile_selection_mismatch,
    (SELECT count(*) FROM owner_policy_admission_current a WHERE NOT EXISTS(SELECT 1 FROM owner_current c JOIN owner_revision_selections s ON s.revision_id=c.revision_id JOIN owner_versions v ON v.version_id=s.version_id WHERE c.owner_id=a.policy_owner_id AND c.revision_id=a.policy_owner_revision_id AND s.family_id=a.policy_family_id AND s.version_id=a.policy_version_id AND v.owner_id=a.policy_owner_id AND v.family_id=a.policy_family_id AND v.content_digest=a.policy_content_digest)) owner_policy_projection_mismatch;`);
  const check = rows[0];
  const versions = await queryJson(prepared.binary, prepared.storePath, "SELECT version_id,content_json,content_digest FROM owner_versions ORDER BY version_id;");
  const digestMismatch = versions.filter((row) => { try { return successorDigest(JSON.parse(row.content_json)) !== row.content_digest; } catch { return true; } }).length;
  const anomaly = check.quick_check === "ok" && check.foreign_keys === 0 && check.current_orphans === 0 && check.selection_mismatch === 0
    && check.profile_revision_mismatch === 0 && check.profile_selection_mismatch === 0 && check.owner_policy_projection_mismatch === 0
    && digestMismatch === 0 ? "none" : "canonical_mechanical_unsafe";
  return success("integrity.observe", { status: "observed", anomaly_class: anomaly, operation_fence: prepared.state.operation_fence, checks: { ...check, immutable_version_digest_mismatches: digestMismatch }, canonical_state_effect: "none" });
}

async function rebuildProjection(request) {
  requireId(request.store_id, "store_id", "store"); requireString(request.operation_id, "operation_id", 256);
  if (!Number.isInteger(request.expected_fence) || request.expected_fence < 1) throw new MechanicalError("projection_rebuild_invalid", "expected_fence must be positive.");
  const prepared = await prepare(request); if (prepared.failure) return prepared.failure;
  const { binary, storePath, state } = prepared; if (request.store_id !== state.metadata.store_id || request.workspace_id !== state.metadata.workspace_id) return failure("store_target_mismatch", "Store/workspace identity differs.");
  const admission = prepareRequestAdmission(request, "projection.rebuild");
  const requestDigest = successorDigest({ domain: "casebook-successor-projection-rebuild@1", store_id: request.store_id, workspace_id: request.workspace_id, operation_id: request.operation_id, expected_fence: request.expected_fence, admission_slot_id: request.admission_slot_id, admission: request.admission });
  const existing = await readReceipt(binary, storePath, request.operation_id); if (existing) return existing.request_digest === requestDigest ? replayResponse(existing, true) : mismatch(request.operation_id);
  const admissionStatus = await inspectAdmission(binary, storePath, admission);
  if (admissionStatus.binding_ok !== 1) return failure("profile_changed", "The exact Profile selection or projection purpose fence changed.", { failureClass: "profile_changed", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
  if (admissionStatus.admission_ok !== 1) return failure("profile_guard_denied", "The selected Profile does not admit projection rebuild.", { failureClass: "profile_guard_denied" });
  if (request.expected_fence !== state.operation_fence) return failure("canonical_fence_conflict", "Projection source fence changed.", { failureClass: "revision_conflict", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE, evidence: { observed_fence: state.operation_fence } });
  const now = new Date().toISOString(), next = state.operation_fence + 1;
  const generation = `projection:${createHash("sha256").update(requestDigest).digest("hex").slice(0,8)}-${createHash("sha256").update(requestDigest).digest("hex").slice(8,12)}-5${createHash("sha256").update(requestDigest).digest("hex").slice(13,16)}-8${createHash("sha256").update(requestDigest).digest("hex").slice(17,20)}-${createHash("sha256").update(requestDigest).digest("hex").slice(20,32)}`;
  const result = { status: "settled", source_fence: state.operation_fence, generation_id: generation, canonical_state_effect: "none", admission_evidence: admission.evidence };
  await sqlite(binary, storePath, `.bail on\nPRAGMA foreign_keys=ON;\nBEGIN IMMEDIATE;
    CREATE TEMP TABLE guard(ok INTEGER CHECK(ok=1));
    INSERT INTO guard VALUES(CASE WHEN ${profileAdmissionPredicate(admission)} THEN 1 ELSE 0 END);
    CREATE TEMP TABLE rebuilt AS SELECT r.owner_id,r.revision_id,r.revision_number,json_extract(r.normalized_json,'$._mechanical_current_projection') projection_json,${sqlText(now)} updated_at FROM owner_revisions r WHERE r.revision_number=(SELECT max(x.revision_number) FROM owner_revisions x WHERE x.owner_id=r.owner_id);
    DELETE FROM owner_current; INSERT INTO owner_current SELECT * FROM rebuilt;
    DELETE FROM owner_current_claims;
    INSERT INTO owner_current_claims(owner_kind,claim_type,namespace_id,normalized_value,owner_id,owner_revision_id,operation_fence) SELECT o.owner_kind,json_extract(d.value,'$.claim_type'),json_extract(c.projection_json,'$._mechanical_placement.namespace_id'),json_extract(d.value,'$.normalized_value'),o.owner_id,c.revision_id,${next} FROM owners o JOIN owner_current c ON c.owner_id=o.owner_id JOIN owner_query_material q ON q.revision_id=c.revision_id JOIN json_each(q.documents_json) d WHERE json_extract(d.value,'$.schema')='owner-exact-claim@1' AND json_extract(c.projection_json,'$._mechanical_placement.namespace_id') IS NOT NULL;
    INSERT INTO disposable_projection_generations VALUES(${sqlText(generation)},${state.operation_fence},${sqlText(successorDigest(result))},${sqlText(now)});
    INSERT INTO disposable_projection_selection(singleton,generation_id,source_fence,status) VALUES(1,${sqlText(generation)},${state.operation_fence},'current') ON CONFLICT(singleton) DO UPDATE SET generation_id=excluded.generation_id,source_fence=excluded.source_fence,status='current';
    UPDATE store_fence SET operation_fence=${next} WHERE singleton=1 AND operation_fence=${state.operation_fence};
    INSERT INTO store_operation_receipts VALUES(${sqlText(request.operation_id)},'projection.rebuild',${sqlText(state.metadata.store_id)},${sqlText(requestDigest)},'rebuilt',${sqlText(JSON.stringify(result))},${sqlText(successorDigest(result))},${sqlText(now)},'never',${next},NULL,NULL,NULL,NULL,NULL);
    ${admissionEvidenceInsertSql(request.operation_id, admission)}
    COMMIT;`, { args: ["-batch", "-bail"], timeout: 20_000 });
  return replayResponse(await readReceipt(binary, storePath, request.operation_id), false);
}

// Provider adapters use this narrow preflight before any receipt lookup,
// owner/resource resolution, disclosure, or write.  It deliberately exposes
// no store state: it only fences the exact selected Profile against the
// provider-derived public operation and target owner kind.
export async function authorizeSuccessorOperation(request, operation, targetOwnerKind) {
  try {
    requireId(request.store_id, "store_id", "store");
    requireId(request.workspace_id, "workspace_id", "workspace");
    requireId(request.admission_slot_id, "admission_slot_id", "admission-slot");
    const prepared = await prepare(request); if (prepared.failure) return prepared.failure;
    if (request.store_id !== prepared.state.metadata.store_id || request.workspace_id !== prepared.state.metadata.workspace_id) {
      return failure("store_target_mismatch", "The immutable resolved store/workspace identity differs.", { failureClass: "store_target_mismatch" });
    }
    const admission = prepareAdmission({ registry: FINAL_ADMISSION_REGISTRY, operation, workspaceId: request.workspace_id, admissionSlotId: request.admission_slot_id, admission: request.admission, targetOwnerKind });
    const status = await inspectAdmission(prepared.binary, prepared.storePath, admission);
    if (status.binding_ok !== 1) return failure("profile_changed", "The exact Profile selection changed before operation access.", { failureClass: "profile_changed", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
    if (status.admission_ok !== 1) return failure("profile_guard_denied", "The selected Profile does not admit the provider-derived operation.", { failureClass: "profile_guard_denied" });
    return success(operation, { status: "authorized" });
  } catch (error) {
    if (error instanceof MechanicalError || error instanceof ConfigurationError || error instanceof AdmissionCapabilityError) return failure(error.code, error.message, { failureClass: error.failureClass, retryDisposition: error.retryDisposition, evidence: error.evidence });
    return failure("internal_failure", "The provider operation admission could not be evaluated.", { failureClass: "internal_failure" });
  }
}

export async function invokeSuccessorMechanicalOperation(request, { admissionRegistry = FINAL_ADMISSION_REGISTRY } = {}) {
  try {
    if (request.operation === "substrate.commit_revision") return await commitRevision(request, admissionRegistry);
    if (request.operation === "substrate.resolve_family_binding") return await resolveFamilyBinding(request);
    if (request.operation === "substrate.resolve_current_claim") return await resolveCurrentClaim(request);
    if (request.operation === "substrate.get_receipt") return await getReceipt(request);
    if (request.operation === "substrate.read_owner_current") return await readOwner(request, false);
    if (request.operation === "substrate.read_owner_revision") return await readOwner(request, true);
    if (request.operation === "integrity.observe") return await observeIntegrity(request);
    if (request.operation === "projection.rebuild") return await rebuildProjection(request);
    return failure("operation_unsupported", "The operation is outside the current owner-neutral substrate boundary.", { failureClass: "operation_unsupported" });
  } catch (error) {
    if (error instanceof MechanicalError || error instanceof ConfigurationError || error instanceof AdmissionCapabilityError) return failure(error.code, error.message, { failureClass: error.failureClass, retryDisposition: error.retryDisposition, evidence: error.evidence });
    return failure("internal_failure", "The owner-neutral substrate request could not be processed.", { failureClass: "internal_failure" });
  }
}
