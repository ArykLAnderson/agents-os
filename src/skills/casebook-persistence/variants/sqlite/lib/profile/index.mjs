import path from "node:path";
import { validateAuthorityConfiguration, ConfigurationError } from "../../../../shared/config.mjs";
import { loadAndValidateManifest } from "../../../../shared/manifest.mjs";
import { failure, RETRY_DISPOSITIONS, success } from "../../../../shared/protocol.mjs";
import { selectSqliteBinary, probeSqlite, sqlite } from "../substrate/diagnostics.mjs";
import { inspectSuccessorStore } from "../substrate/bootstrap.mjs";
import { successorDigest } from "../substrate/mechanical-successor.mjs";
import {
  AdmissionCapabilityError, FINAL_ADMISSION_REGISTRY, admissionEvidenceInsertSql,
  ownerPolicyPredicate, prepareAdmission, profileAdmissionPredicate, profileBindingPredicate,
} from "../resource/admission-guards.mjs";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const ID = new RegExp(`^[a-z][a-z0-9_-]*:${UUID}$`);
const FORBIDDEN_PROFILE_KEYS = new Set([
  "namespace", "namespace_id", "namespace_ids", "chat", "chat_id", "path", "hierarchy",
  "proximity", "cwd", "project", "project_id", "placement", "placement_id", "home_namespace_id",
  "authority_scope_namespace_ids", "view_id", "view_policy_revision_id",
]);
const PROFILE_KEYS = Object.freeze([
  "audience_ceiling", "bounds", "disclosure", "lifecycle", "object_kinds", "predecessor_revision_id",
  "projection", "purposes", "schema",
]);
const BOUND_KEYS = Object.freeze(["max_export_bytes", "max_results", "max_traversal_depth"]);
const PROJECTION_KEYS = Object.freeze(["export", "locator"]);
const DISCLOSURE_KEYS = Object.freeze(["checkpoints", "events", "receipts"]);

export class ProfileOperationError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = "ProfileOperationError";
    this.code = code;
    this.failureClass = options.failureClass ?? "representation_invalid";
    this.retryDisposition = options.retryDisposition ?? RETRY_DISPOSITIONS.NEVER;
    this.evidence = options.evidence ?? {};
  }
}

function object(value) { return value && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return object(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0"); }
function sqlText(value) { return value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`; }
function requireString(value, field, max = 512) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new ProfileOperationError("profile_request_invalid", `${field} must be a non-empty bounded string.`);
  return value;
}
function requireId(value, field, prefix = null) {
  requireString(value, field, 128);
  if (!ID.test(value) || (prefix && !value.startsWith(`${prefix}:`))) throw new ProfileOperationError("profile_request_invalid", `${field} must be a supported UUID identity.`);
  return value;
}
function requireInteger(value, field, minimum = 0) {
  if (!Number.isInteger(value) || value < minimum) throw new ProfileOperationError("profile_request_invalid", `${field} must be an integer at least ${minimum}.`);
  return value;
}
function assertNoForbidden(value, pathValue = "profile") {
  if (Array.isArray(value)) { value.forEach((item, index) => assertNoForbidden(item, `${pathValue}[${index}]`)); return; }
  if (!object(value)) return;
  for (const [key, item] of Object.entries(value)) {
    const derivedAuthorityKey = key !== "projection" && /(namespace|placement|chat|hierarchy|proximity|cwd|project|path)/i.test(key);
    if (FORBIDDEN_PROFILE_KEYS.has(key) || derivedAuthorityKey) throw new ProfileOperationError("profile_shape_invalid", `${pathValue}.${key} is organizational or placement authority and cannot appear in a Profile.`);
    assertNoForbidden(item, `${pathValue}.${key}`);
  }
}

export function validateProfileContent(value, { bootstrap = false } = {}) {
  if (!exact(value, PROFILE_KEYS) || value.schema !== "admission-disclosure-profile@1"
    || value.audience_ceiling !== "private" || ![bootstrap ? "active" : "candidate"].includes(value.lifecycle)
    || !Array.isArray(value.object_kinds) || !value.object_kinds.length || new Set(value.object_kinds).size !== value.object_kinds.length
    || !Array.isArray(value.purposes) || !value.purposes.length || new Set(value.purposes).size !== value.purposes.length
    || !exact(value.bounds, BOUND_KEYS) || !exact(value.projection, PROJECTION_KEYS) || !exact(value.disclosure, DISCLOSURE_KEYS)
    || !["redacted", "full"].includes(value.projection.locator) || !["deny", "allow-private"].includes(value.projection.export)
    || Object.values(value.disclosure).some((item) => typeof item !== "boolean")) {
    throw new ProfileOperationError("profile_shape_invalid", "The Profile is incomplete, broad, or incompatible.");
  }
  for (const kind of value.object_kinds) if (typeof kind !== "string" || !/^[a-z][a-z0-9_-]{0,63}$/.test(kind)) throw new ProfileOperationError("profile_shape_invalid", "Profile object kinds must be closed identifiers.");
  for (const purpose of value.purposes) if (typeof purpose !== "string" || !/^[a-z][a-z0-9_.-]{0,127}$/.test(purpose)) throw new ProfileOperationError("profile_shape_invalid", "Profile purposes must be closed identifiers.");
  requireInteger(value.bounds.max_results, "profile.bounds.max_results", 1);
  requireInteger(value.bounds.max_traversal_depth, "profile.bounds.max_traversal_depth", 0);
  requireInteger(value.bounds.max_export_bytes, "profile.bounds.max_export_bytes", 0);
  if (value.predecessor_revision_id != null) requireId(value.predecessor_revision_id, "profile.predecessor_revision_id", "owner-revision");
  assertNoForbidden(value);
  return structuredClone(value);
}

export function canonicalProfileRequestDigest(storeId, request) {
  const semantic = structuredClone(request);
  delete semantic.configuration;
  delete semantic.request_digest;
  return successorDigest({ domain: "casebook-profile-operation@1", resolved_store_id: storeId, request: semantic });
}

async function queryJson(binary, storePath, query) {
  const { stdout } = await sqlite(binary, storePath, `PRAGMA query_only=ON;\n${query}`, { args: ["-batch", "-bail", "-json"], maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(stdout || "[]");
}
async function prepareStore(request) {
  const manifest = await loadAndValidateManifest();
  if (!manifest.ok) return { failure: failure("asset_incompatible", "Profile assets are incompatible.", { failureClass: "asset_incompatible", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR, evidence: { problems: manifest.problems } }) };
  const configuration = validateAuthorityConfiguration(request.configuration);
  if (configuration.authority_mode !== "sqlite") return { failure: failure("sqlite_authority_required", "Profile operations require SQLite authority.") };
  const selected = await selectSqliteBinary();
  const probe = await probeSqlite(selected.path, path.dirname(configuration.sqlite.store_path));
  if (!probe.ok) return { failure: failure("sqlite_feature_unsupported", "The package-owned runtime is incompatible.", { failureClass: "asset_incompatible", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR, evidence: { problems: probe.problems } }) };
  const state = await inspectSuccessorStore(selected.path, configuration.sqlite.store_path);
  if (state.status !== "available") return { failure: failure(state.code ?? "store_unavailable", "The successor store is unavailable.", { failureClass: "store_unavailable", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR, evidence: state.evidence ?? {} }) };
  return { binary: selected.path, storePath: configuration.sqlite.store_path, state };
}
function authority(value) {
  if (!exact(value, ["human_authorized", "human_identity", "provenance"]) || value.human_authorized !== true) throw new ProfileOperationError("human_operational_authority_required", "Profile mutation requires explicit human operational authority.");
  return { human_authorized: true, human_identity: requireString(value.human_identity, "authority_claim.human_identity", 256), provenance: requireString(value.provenance, "authority_claim.provenance", 512) };
}
async function readReceipt(binary, storePath, operationId) {
  const rows = await queryJson(binary, storePath, `SELECT * FROM store_operation_receipts WHERE operation_id=${sqlText(operationId)} LIMIT 1;`);
  if (!rows.length) return null;
  return { ...rows[0], result: JSON.parse(rows[0].result_json) };
}
function publicReceipt(row) { const copy = { ...row }; delete copy.result_json; delete copy.result; return copy; }
function replay(receipt, operation, isReplay) {
  return success(operation, { ...receipt.result, receipt: publicReceipt(receipt), idempotent_replay: isReplay });
}
function mismatch(operationId) { return failure("idempotency_mismatch", "operation_id is settled for different canonical Profile or guard meaning.", { failureClass: "idempotency_mismatch", evidence: { operation_id: operationId } }); }
function profileChanged(code = "profile_changed") {
  return failure(code, code === "profile_selection_unavailable" ? "No active Profile selection is available for this admission slot." : "The exact Profile selection or activation fence changed.", {
    failureClass: code, retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE,
  });
}
async function inspectProfileAdmission(binary, storePath, prepared) {
  const rows = await queryJson(binary, storePath, `SELECT EXISTS(SELECT 1 FROM profile_selection_current WHERE admission_slot_id=${sqlText(prepared.admissionSlotId)}) selection_available,CASE WHEN ${profileBindingPredicate(prepared)} THEN 1 ELSE 0 END binding_ok,CASE WHEN ${profileAdmissionPredicate(prepared)} AND ${ownerPolicyPredicate(prepared)} THEN 1 ELSE 0 END admission_ok;`);
  return rows[0] ?? { selection_available: 0, binding_ok: 0, admission_ok: 0 };
}
function profileAdmissionFailure(status) {
  if (status.selection_available !== 1) return profileChanged("profile_selection_unavailable");
  if (status.binding_ok !== 1) return profileChanged();
  return failure("profile_guard_denied", "The selected Profile does not admit the provider-derived purpose or owner kind.", { failureClass: "profile_guard_denied" });
}
async function admissionFailureIfAny(binary, storePath, prepared) {
  const status = await inspectProfileAdmission(binary, storePath, prepared);
  return status.admission_ok === 1 ? null : profileAdmissionFailure(status);
}
function common(request, operation) {
  requireString(request.operation_id, "operation_id", 256);
  requireId(request.store_id, "store_id", "store");
  requireId(request.admission_slot_id, "admission_slot_id", "admission-slot");
  return prepareAdmission({ registry: FINAL_ADMISSION_REGISTRY, operation, admissionSlotId: request.admission_slot_id, admission: request.admission });
}
function eventSql({ eventId, operationId, ownerId, revisionId, type, payload, next, now }) {
  return `INSERT INTO owner_events VALUES(${sqlText(eventId)},${sqlText(operationId)},${sqlText(ownerId)},${sqlText(revisionId)},${sqlText(type)},${sqlText(JSON.stringify(payload))},${sqlText(successorDigest(payload))},${next},${sqlText(now)});`;
}
function receiptSql({ operationId, operation, storeId, requestDigest, core, next, now, ownerId, expected, observed, committed, eventId }) {
  return `INSERT INTO store_operation_receipts VALUES(${sqlText(operationId)},${sqlText(operation)},${sqlText(storeId)},${sqlText(requestDigest)},'committed',${sqlText(JSON.stringify(core))},${sqlText(successorDigest(core))},${sqlText(now)},'never',${next},${sqlText(ownerId)},${expected ?? "NULL"},${observed ?? "NULL"},${committed ?? "NULL"},${sqlText(eventId)});`;
}
function genericVersionSql({ ownerId, ownerKind, expected, revisionId, versionId, content, operationId, projection, now }) {
  const statements = [];
  if (expected === 0) statements.push(`INSERT INTO owners VALUES(${sqlText(ownerId)},${sqlText(ownerKind)},${sqlText(now)});`, `INSERT INTO owner_family_bindings VALUES(${sqlText(ownerId)},${sqlText(ownerId)},${sqlText(now)});`);
  statements.push(`INSERT INTO owner_versions VALUES(${sqlText(versionId)},${sqlText(ownerId)},${sqlText(ownerId)},${sqlText(JSON.stringify(content))},${sqlText(successorDigest(content))},${sqlText(now)});`);
  const normalized = { owner_normalized: { schema: content.schema, lifecycle: content.lifecycle }, _mechanical_current_projection: projection };
  statements.push(`INSERT INTO owner_revisions VALUES(${sqlText(revisionId)},${sqlText(ownerId)},${expected + 1},${sqlText(JSON.stringify(normalized))},${sqlText(operationId)},${sqlText(now)});`, `INSERT INTO owner_revision_selections VALUES(${sqlText(revisionId)},${sqlText(ownerId)},${sqlText(versionId)});`);
  if (expected === 0) statements.push(`INSERT INTO owner_current VALUES(${sqlText(ownerId)},${sqlText(revisionId)},1,${sqlText(JSON.stringify(projection))},${sqlText(now)});`);
  else statements.push(`UPDATE owner_current SET revision_id=${sqlText(revisionId)},revision_number=${expected + 1},projection_json=${sqlText(JSON.stringify(projection))},updated_at=${sqlText(now)} WHERE owner_id=${sqlText(ownerId)} AND revision_number=${expected};`, "INSERT INTO guard VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END);");
  return statements;
}

async function profileCreateOrRevise(request, operation) {
  const preparedStore = await prepareStore(request); if (preparedStore.failure) return preparedStore.failure;
  const { binary, storePath, state } = preparedStore;
  const prepared = common(request, operation), claim = authority(request.authority_claim);
  const digestValue = canonicalProfileRequestDigest(state.metadata.store_id, request);
  if (request.request_digest !== digestValue) return failure("request_digest_mismatch", "request_digest does not match canonical Profile operation meaning.");
  const existing = await readReceipt(binary, storePath, request.operation_id);
  if (existing) return existing.operation_kind === operation && existing.request_digest === digestValue ? replay(existing, operation, true) : mismatch(request.operation_id);
  { const denied = await admissionFailureIfAny(binary, storePath, prepared); if (denied) return denied; }
  requireId(request.profile_id, "profile_id", "profile"); requireId(request.profile_revision_id, "profile_revision_id", "owner-revision"); requireId(request.version_id, "version_id", "version");
  requireId(request.event_id, "event_id", "event"); requireInteger(request.expected_revision, "expected_revision", 0);
  const content = validateProfileContent(request.profile);
  const currentRows = await queryJson(binary, storePath, `SELECT revision_id,revision_number FROM owner_current WHERE owner_id=${sqlText(request.profile_id)};`);
  const observed = currentRows[0]?.revision_number ?? 0;
  if ((operation === "profile.create" && request.expected_revision !== 0) || observed !== request.expected_revision) return failure("revision_conflict", "Profile expected revision differs.", { failureClass: "revision_conflict", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE, evidence: { observed_revision: observed } });
  if (operation === "profile.create" && content.predecessor_revision_id !== null) throw new ProfileOperationError("profile_shape_invalid", "A new Profile has no predecessor revision.");
  if (operation === "profile.revise" && content.predecessor_revision_id !== currentRows[0]?.revision_id) throw new ProfileOperationError("profile_shape_invalid", "Profile predecessor must be the exact current Profile revision.");
  const now = new Date().toISOString(), next = state.operation_fence + 1;
  const result = { status: "settled", profile: { id: request.profile_id, revision_id: request.profile_revision_id, version_id: request.version_id, revision: request.expected_revision + 1, lifecycle: "candidate" }, admission_evidence: prepared.evidence };
  const statements = [".bail on", "PRAGMA foreign_keys=ON;", "BEGIN IMMEDIATE;", "CREATE TEMP TABLE guard(ok INTEGER CHECK(ok=1));", `INSERT INTO guard VALUES(CASE WHEN ${profileAdmissionPredicate(prepared)} THEN 1 ELSE 0 END);`];
  statements.push(...genericVersionSql({ ownerId: request.profile_id, ownerKind: "profile", expected: request.expected_revision, revisionId: request.profile_revision_id, versionId: request.version_id, content, operationId: request.operation_id, projection: { lifecycle: "candidate" }, now }));
  statements.push(`INSERT INTO profile_revision_records VALUES(${sqlText(request.profile_revision_id)},${sqlText(request.profile_id)},${request.expected_revision + 1},${sqlText(request.version_id)},${sqlText(content.predecessor_revision_id)},${sqlText(JSON.stringify(content))},${sqlText(successorDigest(content))},'candidate',NULL,NULL,${sqlText(JSON.stringify(claim))},${sqlText(now)});`, `UPDATE store_fence SET operation_fence=${next} WHERE singleton=1 AND operation_fence=${state.operation_fence};`, eventSql({ eventId: request.event_id, operationId: request.operation_id, ownerId: request.profile_id, revisionId: request.profile_revision_id, type: operation, payload: { profile_id: request.profile_id, profile_revision_id: request.profile_revision_id, lifecycle: "candidate" }, next, now }), receiptSql({ operationId: request.operation_id, operation, storeId: state.metadata.store_id, requestDigest: digestValue, core: result, next, now, ownerId: request.profile_id, expected: request.expected_revision, observed, committed: request.expected_revision + 1, eventId: request.event_id }), admissionEvidenceInsertSql(request.operation_id, prepared), "COMMIT;");
  try { await sqlite(binary, storePath, statements.join("\n"), { args: ["-batch", "-bail"], timeout: 20_000, maxBuffer: 16 * 1024 * 1024 }); }
  catch {
    { const denied = await admissionFailureIfAny(binary, storePath, prepared).catch(() => profileChanged("profile_selection_unavailable")); if (denied) return denied; }
    const raced = await readReceipt(binary, storePath, request.operation_id).catch(() => null);
    if (raced) return raced.request_digest === digestValue ? replay(raced, operation, true) : mismatch(request.operation_id);
    return failure("revision_conflict", "Profile revision lost its atomic comparison.", { failureClass: "revision_conflict", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
  }
  return replay(await readReceipt(binary, storePath, request.operation_id), operation, false);
}

async function profileActivate(request) {
  const preparedStore = await prepareStore(request); if (preparedStore.failure) return preparedStore.failure;
  const { binary, storePath, state } = preparedStore;
  const prepared = common(request, "profile.activate"), claim = authority(request.authority_claim), digestValue = canonicalProfileRequestDigest(state.metadata.store_id, request);
  if (request.request_digest !== digestValue) return failure("request_digest_mismatch", "request_digest does not match canonical Profile activation meaning.");
  const existing = await readReceipt(binary, storePath, request.operation_id);
  if (existing) return existing.operation_kind === "profile.activate" && existing.request_digest === digestValue ? replay(existing, "profile.activate", true) : mismatch(request.operation_id);
  { const denied = await admissionFailureIfAny(binary, storePath, prepared); if (denied) return denied; }
  for (const [field, prefix] of [["target_profile_id", "profile"], ["target_profile_revision_id", "owner-revision"], ["selection_revision_id", "owner-revision"], ["selection_version_id", "version"], ["event_id", "event"], ["expected_selection_revision_id", "owner-revision"]]) requireId(request[field], field, prefix);
  const rows = await queryJson(binary, storePath, `SELECT s.*,c.revision_number FROM profile_selection_current s JOIN owner_current c ON c.owner_id=s.selection_id WHERE s.admission_slot_id=${sqlText(request.admission_slot_id)};`);
  if (!rows.length) return profileChanged("profile_selection_unavailable");
  const current = rows[0];
  if (current.selection_revision_id !== request.expected_selection_revision_id) return failure("profile_selection_conflict", "The active Profile selection changed.", { failureClass: "revision_conflict", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
  const target = (await queryJson(binary, storePath, `SELECT * FROM profile_revision_records WHERE profile_id=${sqlText(request.target_profile_id)} AND profile_revision_id=${sqlText(request.target_profile_revision_id)};`))[0];
  if (!target || !["candidate", "active"].includes(target.lifecycle)) return failure("profile_revision_unavailable", "The target Profile revision is unavailable for activation.", { failureClass: "admission_unavailable" });
  const now = new Date().toISOString(), next = state.operation_fence + 1;
  const selectionContent = { schema: "profile-selection@1", admission_slot_id: request.admission_slot_id, selected_profile_id: request.target_profile_id, selected_profile_revision_id: request.target_profile_revision_id, lifecycle: "active", activation_fence: next };
  const binding = { selection_id: current.selection_id, selection_revision_id: request.selection_revision_id, profile_id: request.target_profile_id, profile_revision_id: request.target_profile_revision_id, activation_fence: next };
  const result = { status: "settled", profile_selection: binding, admission_evidence: prepared.evidence };
  const statements = [".bail on", "PRAGMA foreign_keys=ON;", "BEGIN IMMEDIATE;", "CREATE TEMP TABLE guard(ok INTEGER CHECK(ok=1));", `INSERT INTO guard VALUES(CASE WHEN ${profileAdmissionPredicate(prepared)} THEN 1 ELSE 0 END);`, `INSERT INTO guard VALUES(CASE WHEN EXISTS(SELECT 1 FROM profile_selection_current WHERE admission_slot_id=${sqlText(request.admission_slot_id)} AND selection_revision_id=${sqlText(request.expected_selection_revision_id)}) THEN 1 ELSE 0 END);`];
  statements.push(...genericVersionSql({ ownerId: current.selection_id, ownerKind: "profile-selection", expected: current.revision_number, revisionId: request.selection_revision_id, versionId: request.selection_version_id, content: selectionContent, operationId: request.operation_id, projection: { lifecycle: "active", activation_fence: next }, now }));
  statements.push(`UPDATE profile_revision_records SET lifecycle='superseded' WHERE profile_revision_id=${sqlText(current.profile_revision_id)} AND profile_revision_id<>${sqlText(request.target_profile_revision_id)} AND lifecycle='active';`, `UPDATE profile_revision_records SET lifecycle='active',activation_fence=${next} WHERE profile_revision_id=${sqlText(request.target_profile_revision_id)} AND lifecycle IN ('candidate','active');`, "INSERT INTO guard VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END);", `INSERT INTO profile_selection_revisions VALUES(${sqlText(request.selection_revision_id)},${sqlText(current.selection_id)},${sqlText(request.admission_slot_id)},${sqlText(request.target_profile_id)},${sqlText(request.target_profile_revision_id)},${sqlText(request.expected_selection_revision_id)},'active',${next},${sqlText(JSON.stringify(claim))},${sqlText(now)});`, `UPDATE profile_selection_current SET selection_revision_id=${sqlText(request.selection_revision_id)},profile_id=${sqlText(request.target_profile_id)},profile_revision_id=${sqlText(request.target_profile_revision_id)},activation_fence=${next},updated_at=${sqlText(now)} WHERE admission_slot_id=${sqlText(request.admission_slot_id)} AND selection_revision_id=${sqlText(request.expected_selection_revision_id)};`, "INSERT INTO guard VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END);", `UPDATE store_fence SET operation_fence=${next} WHERE singleton=1 AND operation_fence=${state.operation_fence};`, eventSql({ eventId: request.event_id, operationId: request.operation_id, ownerId: current.selection_id, revisionId: request.selection_revision_id, type: "profile.activated", payload: binding, next, now }), receiptSql({ operationId: request.operation_id, operation: "profile.activate", storeId: state.metadata.store_id, requestDigest: digestValue, core: result, next, now, ownerId: current.selection_id, expected: current.revision_number, observed: current.revision_number, committed: current.revision_number + 1, eventId: request.event_id }), admissionEvidenceInsertSql(request.operation_id, prepared), "COMMIT;");
  try { await sqlite(binary, storePath, statements.join("\n"), { args: ["-batch", "-bail"], timeout: 20_000, maxBuffer: 16 * 1024 * 1024 }); }
  catch {
    const raced = await readReceipt(binary, storePath, request.operation_id).catch(() => null);
    if (raced) return raced.request_digest === digestValue ? replay(raced, "profile.activate", true) : mismatch(request.operation_id);
    { const denied = await admissionFailureIfAny(binary, storePath, prepared).catch(() => profileChanged("profile_selection_unavailable")); if (denied) return denied; }
    return failure("profile_selection_conflict", "Profile selection lost its atomic comparison.", { failureClass: "revision_conflict", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
  }
  return replay(await readReceipt(binary, storePath, request.operation_id), "profile.activate", false);
}

async function profileRetire(request) {
  const preparedStore = await prepareStore(request); if (preparedStore.failure) return preparedStore.failure;
  const { binary, storePath, state } = preparedStore;
  const prepared = common(request, "profile.retire"), claim = authority(request.authority_claim), digestValue = canonicalProfileRequestDigest(state.metadata.store_id, request);
  if (request.request_digest !== digestValue) return failure("request_digest_mismatch", "request_digest does not match canonical Profile retirement meaning.");
  const existing = await readReceipt(binary, storePath, request.operation_id);
  if (existing) return existing.operation_kind === "profile.retire" && existing.request_digest === digestValue ? replay(existing, "profile.retire", true) : mismatch(request.operation_id);
  { const denied = await admissionFailureIfAny(binary, storePath, prepared); if (denied) return denied; }
  for (const [field, prefix] of [["profile_id", "profile"], ["profile_revision_id", "owner-revision"], ["selection_revision_id", "owner-revision"], ["selection_version_id", "version"], ["event_id", "event"], ["expected_selection_revision_id", "owner-revision"]]) requireId(request[field], field, prefix);
  const current = (await queryJson(binary, storePath, `SELECT s.*,c.revision_number FROM profile_selection_current s JOIN owner_current c ON c.owner_id=s.selection_id WHERE s.admission_slot_id=${sqlText(request.admission_slot_id)};`))[0];
  if (!current) return profileChanged("profile_selection_unavailable");
  if (current.selection_revision_id !== request.expected_selection_revision_id || current.profile_id !== request.profile_id || current.profile_revision_id !== request.profile_revision_id) return failure("profile_selection_conflict", "Retirement must fence the exact selected Profile.", { failureClass: "revision_conflict", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
  let replacement = null;
  if (request.replacement != null) {
    if (!exact(request.replacement, ["profile_id", "profile_revision_id"])) throw new ProfileOperationError("profile_request_invalid", "replacement must be an exact Profile revision handle.");
    requireId(request.replacement.profile_id, "replacement.profile_id", "profile"); requireId(request.replacement.profile_revision_id, "replacement.profile_revision_id", "owner-revision");
    replacement = (await queryJson(binary, storePath, `SELECT * FROM profile_revision_records WHERE profile_id=${sqlText(request.replacement.profile_id)} AND profile_revision_id=${sqlText(request.replacement.profile_revision_id)} AND lifecycle='candidate';`))[0];
    if (!replacement) return failure("profile_revision_unavailable", "The replacement Profile revision is unavailable.", { failureClass: "admission_unavailable" });
  }
  const now = new Date().toISOString(), next = state.operation_fence + 1;
  const selectionContent = replacement ? { schema: "profile-selection@1", admission_slot_id: request.admission_slot_id, selected_profile_id: replacement.profile_id, selected_profile_revision_id: replacement.profile_revision_id, lifecycle: "active", activation_fence: next } : { schema: "profile-selection@1", admission_slot_id: request.admission_slot_id, selected_profile_id: null, selected_profile_revision_id: null, lifecycle: "unavailable", activation_fence: next };
  const result = { status: "settled", retired_profile: { id: request.profile_id, revision_id: request.profile_revision_id, retirement_fence: next }, profile_selection: replacement ? { selection_id: current.selection_id, selection_revision_id: request.selection_revision_id, profile_id: replacement.profile_id, profile_revision_id: replacement.profile_revision_id, activation_fence: next } : { status: "unavailable", selection_id: current.selection_id, selection_revision_id: request.selection_revision_id, activation_fence: next }, admission_evidence: prepared.evidence };
  const statements = [".bail on", "PRAGMA foreign_keys=ON;", "BEGIN IMMEDIATE;", "CREATE TEMP TABLE guard(ok INTEGER CHECK(ok=1));", `INSERT INTO guard VALUES(CASE WHEN ${profileAdmissionPredicate(prepared)} THEN 1 ELSE 0 END);`, `INSERT INTO guard VALUES(CASE WHEN EXISTS(SELECT 1 FROM profile_selection_current WHERE admission_slot_id=${sqlText(request.admission_slot_id)} AND selection_revision_id=${sqlText(request.expected_selection_revision_id)} AND profile_revision_id=${sqlText(request.profile_revision_id)}) THEN 1 ELSE 0 END);`];
  statements.push(...genericVersionSql({ ownerId: current.selection_id, ownerKind: "profile-selection", expected: current.revision_number, revisionId: request.selection_revision_id, versionId: request.selection_version_id, content: selectionContent, operationId: request.operation_id, projection: { lifecycle: replacement ? "active" : "unavailable", activation_fence: next }, now }));
  statements.push(`UPDATE profile_revision_records SET lifecycle='retired',retirement_fence=${next} WHERE profile_id=${sqlText(request.profile_id)} AND profile_revision_id=${sqlText(request.profile_revision_id)} AND lifecycle='active';`, "INSERT INTO guard VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END);", `INSERT INTO profile_selection_revisions VALUES(${sqlText(request.selection_revision_id)},${sqlText(current.selection_id)},${sqlText(request.admission_slot_id)},${sqlText(replacement?.profile_id ?? null)},${sqlText(replacement?.profile_revision_id ?? null)},${sqlText(request.expected_selection_revision_id)},${sqlText(replacement ? "active" : "unavailable")},${next},${sqlText(JSON.stringify(claim))},${sqlText(now)});`);
  if (replacement) statements.push(`UPDATE profile_revision_records SET lifecycle='active',activation_fence=${next} WHERE profile_revision_id=${sqlText(replacement.profile_revision_id)} AND lifecycle='candidate';`, "INSERT INTO guard VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END);", `UPDATE profile_selection_current SET selection_revision_id=${sqlText(request.selection_revision_id)},profile_id=${sqlText(replacement.profile_id)},profile_revision_id=${sqlText(replacement.profile_revision_id)},activation_fence=${next},updated_at=${sqlText(now)} WHERE admission_slot_id=${sqlText(request.admission_slot_id)} AND selection_revision_id=${sqlText(request.expected_selection_revision_id)};`, "INSERT INTO guard VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END);");
  else statements.push(`DELETE FROM profile_selection_current WHERE admission_slot_id=${sqlText(request.admission_slot_id)} AND selection_revision_id=${sqlText(request.expected_selection_revision_id)};`, "INSERT INTO guard VALUES(CASE WHEN changes()=1 THEN 1 ELSE 0 END);");
  statements.push(`UPDATE store_fence SET operation_fence=${next} WHERE singleton=1 AND operation_fence=${state.operation_fence};`, eventSql({ eventId: request.event_id, operationId: request.operation_id, ownerId: current.selection_id, revisionId: request.selection_revision_id, type: "profile.retired", payload: { profile_id: request.profile_id, profile_revision_id: request.profile_revision_id, replacement_profile_revision_id: replacement?.profile_revision_id ?? null }, next, now }), receiptSql({ operationId: request.operation_id, operation: "profile.retire", storeId: state.metadata.store_id, requestDigest: digestValue, core: result, next, now, ownerId: current.selection_id, expected: current.revision_number, observed: current.revision_number, committed: current.revision_number + 1, eventId: request.event_id }), admissionEvidenceInsertSql(request.operation_id, prepared), "COMMIT;");
  try { await sqlite(binary, storePath, statements.join("\n"), { args: ["-batch", "-bail"], timeout: 20_000, maxBuffer: 16 * 1024 * 1024 }); }
  catch {
    const raced = await readReceipt(binary, storePath, request.operation_id).catch(() => null);
    if (raced) return raced.request_digest === digestValue ? replay(raced, "profile.retire", true) : mismatch(request.operation_id);
    { const denied = await admissionFailureIfAny(binary, storePath, prepared).catch(() => profileChanged("profile_selection_unavailable")); if (denied) return denied; }
    return failure("profile_selection_conflict", "Profile retirement lost its atomic selection comparison.", { failureClass: "revision_conflict", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
  }
  return replay(await readReceipt(binary, storePath, request.operation_id), "profile.retire", false);
}

async function profileRead(request, history) {
  const preparedStore = await prepareStore(request); if (preparedStore.failure) return preparedStore.failure;
  const { binary, storePath, state } = preparedStore;
  const operation = history ? "profile.history" : "profile.read", prepared = common(request, operation);
  requireId(request.profile_id, "profile_id", "profile");
  { const denied = await admissionFailureIfAny(binary, storePath, prepared); if (denied) return denied; }
  const selector = history ? "" : "AND r.profile_revision_id=(SELECT revision_id FROM owner_current WHERE owner_id=r.profile_id)";
  const rows = await queryJson(binary, storePath, `SELECT r.profile_id,r.profile_revision_id,r.revision_number,r.predecessor_revision_id,r.lifecycle,r.activation_fence,r.retirement_fence,r.content_json,r.content_digest,r.created_at FROM profile_revision_records r WHERE r.profile_id=${sqlText(request.profile_id)} ${selector} AND ${profileAdmissionPredicate(prepared)} ORDER BY r.revision_number;`);
  if (!rows.length) {
    { const denied = await admissionFailureIfAny(binary, storePath, prepared); if (denied) return denied; }
    return success(operation, { status: "not_visible" });
  }
  return success(operation, { status: "visible", profile_id: request.profile_id, revisions: rows.map((row) => ({ ...row, content: JSON.parse(row.content_json), content_json: undefined })) });
}

export async function invokeProfileOperation(request) {
  try {
    if (request.operation === "profile.create" || request.operation === "profile.revise") return await profileCreateOrRevise(request, request.operation);
    if (request.operation === "profile.activate") return await profileActivate(request);
    if (request.operation === "profile.retire") return await profileRetire(request);
    if (request.operation === "profile.read") return await profileRead(request, false);
    if (request.operation === "profile.history") return await profileRead(request, true);
    return failure("operation_unsupported", "The operation is outside the Profile lifecycle boundary.", { failureClass: "operation_unsupported" });
  } catch (error) {
    if (error instanceof ProfileOperationError || error instanceof AdmissionCapabilityError || error instanceof ConfigurationError) return failure(error.code, error.message, { failureClass: error.failureClass, retryDisposition: error.retryDisposition, evidence: error.evidence });
    return failure("internal_failure", "The Profile operation could not be processed.", { failureClass: "internal_failure" });
  }
}
