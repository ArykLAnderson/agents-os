import { createHash, randomBytes } from "node:crypto";
import {
  constants, chmodSync, closeSync, fstatSync, fsyncSync, linkSync, lstatSync, openSync, readFileSync, realpathSync,
  renameSync, statSync, unlinkSync, writeSync,
} from "node:fs";
import { lstat, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateAuthorityConfiguration, ConfigurationError } from "../../../../shared/config.mjs";
import { loadAndValidateManifest, sha256 } from "../../../../shared/manifest.mjs";
import { failure, PROTOCOL_ID, PROTOCOL_VERSION, RETRY_DISPOSITIONS, SCHEMA_ID, SCHEMA_VERSION, success } from "../../../../shared/protocol.mjs";
import { probeSqlite, selectSqliteBinary, sqlite } from "./diagnostics.mjs";
import { successorCanonicalJson, successorDigest } from "./mechanical-successor.mjs";
import { normalizeExactLocator } from "../resource/normalization.mjs";

export const SUCCESSOR_APPLICATION_ID = 0x43424632;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(HERE, "../../sql/schema-successor.sql");
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const UUID_ID = new RegExp(`^[a-z][a-z0-9_-]*:${UUID}$`);
const DIGEST = /^[0-9a-f]{64}$/;
const BASENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const REQUIRED_TABLES = Object.freeze([
  "bootstrap_state", "disposable_projection_generations", "disposable_projection_selection", "operation_admission_evidence",
  "owner_current", "owner_events", "owner_family_bindings", "owner_outbox", "owner_policy_admission_current",
  "context_namespace_revisions", "context_namespace_current", "owner_current_claims", "context_project_default_revisions", "context_project_default_current", "context_chat_revisions", "context_chat_current", "context_correlation_claims",
  "owner_revision_selections", "owner_revisions", "owner_versions", "owners", "profile_revision_records",
  "profile_selection_current", "profile_selection_revisions", "store_fence", "store_metadata",
  "store_operation_receipts", "reconciliation_cursor_keys", "reconciliation_snapshot_policy", "reconciliation_snapshots", "reconciliation_event_retention", "reconciliation_checkpoints",
]);
let temporarySequence = 0;

class BootstrapError extends Error {
  constructor(code, message, options = {}) { super(message); this.code = code; this.failureClass = options.failureClass ?? "bootstrap_authorization_invalid"; this.retryDisposition = options.retryDisposition ?? RETRY_DISPOSITIONS.NEVER; this.evidence = options.evidence ?? {}; }
}
function exact(value, keys, field) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")) throw new BootstrapError("bootstrap_request_invalid", `${field} must contain exactly ${keys.join(", ")}.`);
  return value;
}
function requireString(value, field, max = 512) { if (typeof value !== "string" || !value.trim() || value.length > max) throw new BootstrapError("bootstrap_request_invalid", `${field} must be a non-empty bounded string.`); return value; }
function requireId(value, field, prefix = null) { requireString(value, field, 128); if (!UUID_ID.test(value) || (prefix && !value.startsWith(`${prefix}:`))) throw new BootstrapError("bootstrap_request_invalid", `${field} must be a lowercase UUID identity.`); return value; }
function requireDigest(value, field) { if (!DIGEST.test(value ?? "")) throw new BootstrapError("bootstrap_request_invalid", `${field} must be a lowercase SHA-256 digest.`); return value; }
function sqlText(value) { return value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`; }
function fileDigest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function recordShape(value, field, ownerPrefix) {
  exact(value, ["owner_id", "revision_id", "version_id", "content", "content_digest"], field);
  requireId(value.owner_id, `${field}.owner_id`, ownerPrefix); requireId(value.revision_id, `${field}.revision_id`, "owner-revision"); requireId(value.version_id, `${field}.version_id`, "version");
  if (!value.content || typeof value.content !== "object" || Array.isArray(value.content) || successorDigest(value.content) !== requireDigest(value.content_digest, `${field}.content_digest`)) throw new BootstrapError("bootstrap_request_invalid", `${field} content digest is invalid.`);
  return value;
}
function validateInitial(initial) {
  exact(initial, ["root_namespace", "private_profile", "profile_selection", "project_default", "initialization_event_id"], "initial");
  const namespace = recordShape(initial.root_namespace, "initial.root_namespace", "namespace");
  const profile = recordShape(initial.private_profile, "initial.private_profile", "profile");
  const selection = recordShape(initial.profile_selection, "initial.profile_selection", "profile-selection");
  const project = initial.project_default == null ? null : recordShape(initial.project_default, "initial.project_default", "project-default");
  requireId(initial.initialization_event_id, "initial.initialization_event_id", "event");
  if (namespace.content.schema !== "namespace-bootstrap@1" || namespace.content.lifecycle !== "active" || namespace.content.parent_id !== null || !requireString(namespace.content.display_name, "initial.root_namespace.content.display_name", 128)) throw new BootstrapError("bootstrap_request_invalid", "The root Namespace bootstrap record is not a closed active root.");
  const profileKeys = ["audience_ceiling", "bounds", "disclosure", "lifecycle", "object_kinds", "predecessor_revision_id", "projection", "purposes", "schema"];
  const forbiddenProfile = /namespace|placement|chat|cwd|^project(?:_|$)|view_policy|authority_scope/;
  if (profile.content.schema !== "admission-disclosure-profile@1" || profile.content.audience_ceiling !== "private"
    || profile.content.lifecycle !== "active" || profile.content.predecessor_revision_id !== null
    || Object.keys(profile.content).sort().join("\0") !== profileKeys.sort().join("\0")
    || !Array.isArray(profile.content.object_kinds) || !profile.content.object_kinds.length || new Set(profile.content.object_kinds).size !== profile.content.object_kinds.length
    || profile.content.object_kinds.some((kind) => typeof kind !== "string" || !/^[a-z][a-z0-9_-]{0,63}$/.test(kind))
    || !["profile", "profile-selection"].every((kind) => profile.content.object_kinds.includes(kind))
    || !Array.isArray(profile.content.purposes) || !profile.content.purposes.length || new Set(profile.content.purposes).size !== profile.content.purposes.length
    || profile.content.purposes.some((purpose) => typeof purpose !== "string" || !/^[a-z][a-z0-9_.-]{0,127}$/.test(purpose))
    || !["profile.manage", "profile.read"].every((purpose) => profile.content.purposes.includes(purpose))
    || Object.keys(profile.content.bounds ?? {}).sort().join("\0") !== ["max_export_bytes", "max_results", "max_traversal_depth"].join("\0")
    || !Number.isInteger(profile.content.bounds.max_results) || profile.content.bounds.max_results < 1
    || !Number.isInteger(profile.content.bounds.max_traversal_depth) || profile.content.bounds.max_traversal_depth < 0
    || !Number.isInteger(profile.content.bounds.max_export_bytes) || profile.content.bounds.max_export_bytes < 0
    || Object.keys(profile.content.projection ?? {}).sort().join("\0") !== ["export", "locator"].join("\0")
    || !["redacted", "full"].includes(profile.content.projection.locator) || !["deny", "allow-private"].includes(profile.content.projection.export)
    || Object.keys(profile.content.disclosure ?? {}).sort().join("\0") !== ["checkpoints", "events", "receipts"].join("\0")
    || Object.values(profile.content.disclosure).some((item) => typeof item !== "boolean")
    || Object.keys(profile.content).some((key) => forbiddenProfile.test(key))) throw new BootstrapError("bootstrap_request_invalid", "The initial Profile must be a complete Namespace-free private Profile record.");
  requireId(selection.content.admission_slot_id, "initial.profile_selection.content.admission_slot_id", "admission-slot");
  if (selection.content.schema !== "profile-selection@1" || selection.content.lifecycle !== "active" || selection.content.activation_fence !== 1
    || selection.content.selected_profile_id !== profile.owner_id || selection.content.selected_profile_revision_id !== profile.revision_id
    || Object.keys(selection.content).sort().join("\0") !== ["activation_fence", "admission_slot_id", "lifecycle", "schema", "selected_profile_id", "selected_profile_revision_id"].join("\0")) throw new BootstrapError("bootstrap_request_invalid", "The initial Profile selection does not select the supplied private Profile revision.");
  return { root_namespace: namespace, private_profile: profile, profile_selection: selection, project_default: project, initialization_event_id: initial.initialization_event_id };
}
function validateAuthorityClaim(value) {
  exact(value, ["human_authorized", "local_uid", "human_identity", "provenance"], "authority_claim");
  if (value.human_authorized !== true || !Number.isInteger(value.local_uid) || value.local_uid < 0 || value.local_uid !== process.getuid()) throw new BootstrapError("bootstrap_local_uid_mismatch", "Bootstrap authority must bind the selected current local UID.");
  return { human_authorized: true, local_uid: value.local_uid, human_identity: requireString(value.human_identity, "authority_claim.human_identity", 256), provenance: requireString(value.provenance, "authority_claim.provenance", 512) };
}
async function destinationBinding(configuration) {
  const storePath = configuration.sqlite.store_path, basename = path.basename(storePath);
  if (!BASENAME.test(basename) || basename === "." || basename === "..") throw new BootstrapError("bootstrap_destination_basename_invalid", "The absent destination basename is not in the closed safe form.");
  const suppliedParent = path.dirname(storePath), parentRealpath = await realpath(suppliedParent);
  const info = statSync(parentRealpath, { bigint: true });
  if (!info.isDirectory()) throw new BootstrapError("bootstrap_parent_invalid", "The resolved destination parent is not a directory.");
  return { store_path: path.join(parentRealpath, basename), supplied_parent: suppliedParent, parent_realpath: parentRealpath, parent_device: String(info.dev), parent_inode: String(info.ino), basename };
}
async function packageBinding() {
  const manifest = await loadAndValidateManifest();
  if (!manifest.ok) throw new BootstrapError("asset_incompatible", "Package manifest or assets are incompatible.", { failureClass: "asset_incompatible", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR, evidence: { problems: manifest.problems } });
  const schemaBytes = await readFile(SCHEMA_PATH);
  return { manifest_sha256: manifest.manifest_sha256, content_digest: manifest.manifest.content_digest.sha256, schema: { id: SCHEMA_ID, version: SCHEMA_VERSION, sha256: sha256(schemaBytes) } };
}
function canonicalRequestBinding(request, configuration, destination, initial, packageValue, authority) {
  return {
    operation: "initialize_store", request_version: 1, operation_id: requireString(request.operation_id, "operation_id", 256),
    store_id: requireId(request.store_id, "store_id", "store"),
    destination: { parent_realpath: destination.parent_realpath, parent_device: destination.parent_device, parent_inode: destination.parent_inode, basename: destination.basename },
    authority_claim: authority,
    initial: {
      root_namespace: initial.root_namespace, private_profile: initial.private_profile, profile_selection: initial.profile_selection,
      project_default: initial.project_default, initialization_event_id: initial.initialization_event_id,
    },
    package: packageValue,
  };
}

export async function createBootstrapAuthorizationDocument(request, options = {}) {
  if (request.request_version !== 1) throw new BootstrapError("bootstrap_request_invalid", "request_version must be 1.");
  const configuration = validateAuthorityConfiguration(request.configuration);
  if (configuration.authority_mode !== "sqlite") throw new BootstrapError("sqlite_authority_required", "Bootstrap requires SQLite authority.");
  const [destination, packageValue] = await Promise.all([destinationBinding(configuration), packageBinding()]);
  const initial = validateInitial(request.initial), authority = validateAuthorityClaim(request.authority_claim);
  const grantPath = path.resolve(requireString(options.grant_path, "grant_path", 4096));
  const grantParent = await realpath(path.dirname(grantPath));
  if (grantParent !== destination.parent_realpath) throw new BootstrapError("bootstrap_grant_directory_invalid", "The grant must be in the retained destination parent directory.");
  const binding = canonicalRequestBinding(request, configuration, destination, initial, packageValue, authority);
  const requestDigest = successorDigest({ domain: "casebook-bootstrap-request@1", binding });
  const document = { authorization_schema: "bootstrap-authorization@1", operation_id: binding.operation_id, request_digest: requestDigest, binding };
  const bytes = Buffer.from(`${JSON.stringify(document)}\n`);
  return { document, bytes, sha256: fileDigest(bytes), request_digest: requestDigest };
}

function syncDirectory(directory) { const fd = openSync(directory, constants.O_RDONLY); try { fsyncSync(fd); } finally { closeSync(fd); } }
// Immutable grant reservations and store publication use exclusive creation or a
// hard-link no-replace step. This helper never replaces an existing identity.
function safeWriteNoReplace(target, bytes) {
  const fd = openSync(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { let offset = 0; while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset); fsyncSync(fd); } finally { closeSync(fd); }
  chmodSync(target, 0o600); syncDirectory(path.dirname(target));
}
// Publish a fully written record with no replacement. Concurrent readers can
// observe either absence or complete bytes, never the exclusive-create write gap.
function atomicWriteNoReplace(target, bytes, testHooksAllowed = false) {
  const temporary = `${target}.create-${process.pid}-${temporarySequence += 1}`;
  try {
    safeWriteNoReplace(temporary, bytes);
    runBootstrapTestStage("before_reservation_publication", testHooksAllowed);
    linkSync(temporary, target); syncDirectory(path.dirname(target));
  } finally {
    try { unlinkSync(temporary); syncDirectory(path.dirname(target)); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  }
}
// After the caller has validated the exact operation/request binding, a durable
// record may atomically advance from consumed to published. This same-operation
// phase transition intentionally replaces the prior phase record; it is distinct
// from immutable no-replace grant consumption, reservation, and store publication.
function atomicReplaceMatchingPhaseRecord(target, document) {
  const temporary = `${target}.transition-${process.pid}-${temporarySequence += 1}`;
  safeWriteNoReplace(temporary, Buffer.from(`${JSON.stringify(document)}\n`));
  renameSync(temporary, target); syncDirectory(path.dirname(target));
}

const testSleepCell = new Int32Array(new SharedArrayBuffer(4));
function runBootstrapTestStage(stage, allowed) {
  if (!allowed || process.env.CASEBOOK_BOOTSTRAP_TEST_MODE !== "1") return;
  if (process.env.CASEBOOK_BOOTSTRAP_TEST_PAUSE_STAGE === stage) {
    const ready = process.env.CASEBOOK_BOOTSTRAP_TEST_READY_PATH;
    const release = process.env.CASEBOOK_BOOTSTRAP_TEST_RELEASE_PATH;
    if (!path.isAbsolute(ready ?? "") || !path.isAbsolute(release ?? "")) throw new BootstrapError("bootstrap_test_hook_invalid", "Bootstrap test coordination paths must be absolute.");
    safeWriteNoReplace(ready, Buffer.from(`${stage}\n`));
    const deadline = Date.now() + 15_000;
    while (!lstatSync(release, { throwIfNoEntry: false })) {
      if (Date.now() >= deadline) throw new BootstrapError("bootstrap_test_hook_timeout", "Bootstrap test stage release timed out.");
      Atomics.wait(testSleepCell, 0, 0, 10);
    }
  }
  if (process.env.CASEBOOK_BOOTSTRAP_TEST_FAULT === stage) throw new BootstrapError("bootstrap_interrupted", `Injected interruption at ${stage}.`, { retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
}
function recordPaths(parent, basename, operationId) {
  const operationKey = createHash("sha256").update(operationId).digest("hex").slice(0, 24);
  const destinationKey = createHash("sha256").update(basename).digest("hex").slice(0, 24);
  return { consumed: path.join(parent, `.casebook-bootstrap-${operationKey}.consumed.json`), reservation: path.join(parent, `.casebook-bootstrap-${destinationKey}.destination.json`) };
}
function parseRecord(bytes) {
  const parsed = JSON.parse(bytes.toString("utf8"));
  if (parsed?.record_schema === "bootstrap-consumed-record@1") return parsed;
  if (parsed?.authorization_schema === "bootstrap-authorization@1") return { record_schema: "bootstrap-consumed-record@1", phase: "consumed", grant_sha256: fileDigest(bytes), grant: parsed, receipt: null };
  throw new BootstrapError("bootstrap_consumed_record_invalid", "The durable consumed record has an unknown schema.");
}
function readRecord(recordPath) { try { return parseRecord(readFileSync(recordPath)); } catch (error) { if (error?.code === "ENOENT") return null; throw error; } }
function assertParentStable(parentFd, destination) {
  const held = fstatSync(parentFd, { bigint: true });
  let resolved;
  try { resolved = realpathSync(destination.supplied_parent); } catch { throw new BootstrapError("bootstrap_parent_identity_changed", "The destination parent path changed after authorization."); }
  const current = statSync(resolved, { bigint: true });
  if (resolved !== destination.parent_realpath || String(held.dev) !== destination.parent_device || String(held.ino) !== destination.parent_inode || String(current.dev) !== destination.parent_device || String(current.ino) !== destination.parent_inode) throw new BootstrapError("bootstrap_parent_identity_changed", "The retained destination parent identity changed.");
}

async function queryJson(binary, storePath, query) {
  const { stdout } = await sqlite(binary, storePath, `PRAGMA query_only=ON;\n${query}`, { args: ["-batch", "-bail", "-json"], maxBuffer: 8 * 1024 * 1024 });
  return JSON.parse(stdout || "[]");
}

export async function inspectSuccessorStore(binary, storePath) {
  let entry;
  try { entry = lstatSync(storePath); } catch (error) { return error?.code === "ENOENT" ? { status: "absent", code: "store_unavailable", evidence: { store_present: false } } : { status: "unavailable", code: "store_unavailable", evidence: {} }; }
  if (!entry.isFile() || entry.isSymbolicLink()) return { status: "unavailable", code: "store_unavailable", evidence: { regular_file: false } };
  let header;
  try {
    const rows = await queryJson(binary, storePath, `SELECT json_object('application_id',(SELECT application_id FROM pragma_application_id),'user_version',(SELECT user_version FROM pragma_user_version),'quick_check',(SELECT quick_check FROM pragma_quick_check),'foreign_keys',(SELECT count(*) FROM pragma_foreign_key_check),'tables',(SELECT json_group_array(name) FROM (SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name))) inspection;`);
    header = JSON.parse(rows[0]?.inspection ?? "{}");
  } catch { return { status: "unavailable", code: "store_unavailable", evidence: { readable: false } }; }
  if (header.application_id !== SUCCESSOR_APPLICATION_ID || header.user_version !== SCHEMA_VERSION) return { status: "migration_required", code: "schema_migration_required", evidence: { expected: { application_id: SUCCESSOR_APPLICATION_ID, schema_id: SCHEMA_ID, schema_version: SCHEMA_VERSION }, observed: { application_id: header.application_id ?? null, schema_version: header.user_version ?? null } } };
  if (header.quick_check !== "ok" || header.foreign_keys !== 0) return { status: "unavailable", code: "schema_integrity_unsafe", evidence: { quick_check: header.quick_check, foreign_keys: header.foreign_keys } };
  const tables = new Set(header.tables ?? []), missing = REQUIRED_TABLES.filter((name) => !tables.has(name));
  if (missing.length) return { status: "unavailable", code: "store_partial_initialization", evidence: { missing_components: missing } };
  try {
    const rows = await queryJson(binary, storePath, `SELECT json_object(
      'metadata',(SELECT json_object('store_id',store_id,'schema_id',schema_id,'schema_version',schema_version,'protocol_id',protocol_id,'protocol_version',protocol_version,'package_manifest_sha256',package_manifest_sha256,'schema_asset_sha256',schema_asset_sha256,'initialized_at',initialized_at,'initialization_operation_id',initialization_operation_id) FROM store_metadata WHERE singleton=1),
      'metadata_count',(SELECT count(*) FROM store_metadata),
      'bootstrap',(SELECT json_object('root_namespace_id',b.root_namespace_id,'initial_profile_id',b.initial_profile_id,'initial_profile_revision_id',b.initial_profile_revision_id,'profile_selection_id',b.profile_selection_id,'admission_slot_id',b.admission_slot_id,'project_default_id',b.project_default_id,'initialization_event_id',b.initialization_event_id,'request_digest',b.request_digest,'published_receipt_digest',b.published_receipt_digest,'initial_owner_count',(SELECT count(*) FROM owners o WHERE o.owner_id IN (b.root_namespace_id,b.initial_profile_id,b.profile_selection_id,b.project_default_id))) FROM bootstrap_state b WHERE singleton=1),
      'bootstrap_count',(SELECT count(*) FROM bootstrap_state),
      'receipt_count',(SELECT count(*) FROM store_operation_receipts r JOIN store_metadata m ON m.initialization_operation_id=r.operation_id WHERE r.operation_kind='initialize_store' AND r.outcome='initialized'),
      'event_count',(SELECT count(*) FROM owner_events e JOIN bootstrap_state b ON b.initialization_event_id=e.event_id WHERE e.event_type='store.initialized'),
      'operation_fence',(SELECT operation_fence FROM store_fence WHERE singleton=1)
    ) detail;`);
    const detail = JSON.parse(rows[0]?.detail ?? "{}");
    if (typeof detail.metadata === "string") detail.metadata = JSON.parse(detail.metadata);
    if (typeof detail.bootstrap === "string") detail.bootstrap = JSON.parse(detail.bootstrap);
    const expectedOwners = detail.bootstrap?.project_default_id == null ? 3 : 4;
    const complete = detail.metadata_count === 1 && detail.bootstrap_count === 1 && detail.receipt_count === 1 && detail.event_count === 1 && detail.bootstrap?.initial_owner_count === expectedOwners && detail.metadata?.schema_id === SCHEMA_ID && detail.metadata?.schema_version === SCHEMA_VERSION && detail.metadata?.protocol_id === PROTOCOL_ID && detail.metadata?.protocol_version === PROTOCOL_VERSION && Number.isInteger(detail.operation_fence) && detail.operation_fence >= 1;
    if (!complete) return { status: "unavailable", code: "store_partial_initialization", evidence: { components: detail } };
    return { status: "available", metadata: detail.metadata, bootstrap: detail.bootstrap, operation_fence: detail.operation_fence, integrity: { quick_check: "ok", foreign_key_violations: 0 } };
  } catch { return { status: "unavailable", code: "store_partial_initialization", evidence: { components_readable: false } }; }
}

function initialInsert(record, ownerKind, operationId, now) {
  const projection = { lifecycle: record.content.lifecycle ?? "active", bootstrap: true };
  const normalized = { owner_normalized: { bootstrap: true }, _mechanical_current_projection: projection };
  return `
    INSERT INTO owners VALUES(${sqlText(record.owner_id)},${sqlText(ownerKind)},${sqlText(now)});
    INSERT INTO owner_family_bindings VALUES(${sqlText(record.owner_id)},${sqlText(record.owner_id)},${sqlText(now)});
    INSERT INTO owner_versions VALUES(${sqlText(record.version_id)},${sqlText(record.owner_id)},${sqlText(record.owner_id)},${sqlText(JSON.stringify(record.content))},${sqlText(record.content_digest)},${sqlText(now)});
    INSERT INTO owner_revisions VALUES(${sqlText(record.revision_id)},${sqlText(record.owner_id)},1,${sqlText(JSON.stringify(normalized))},${sqlText(`${operationId}#${ownerKind}`)},${sqlText(now)});
    INSERT INTO owner_revision_selections VALUES(${sqlText(record.revision_id)},${sqlText(record.owner_id)},${sqlText(record.version_id)});
    INSERT INTO owner_current VALUES(${sqlText(record.owner_id)},${sqlText(record.revision_id)},1,${sqlText(JSON.stringify(projection))},${sqlText(now)});`;
}

function initializationResult(binding, initializedAt) {
  const initial = binding.initial;
  return {
    status: "settled",
    initialization: {
      store_id: binding.store_id,
      root_namespace: { id: initial.root_namespace.owner_id, revision_id: initial.root_namespace.revision_id, version_id: initial.root_namespace.version_id },
      profile: { id: initial.private_profile.owner_id, revision_id: initial.private_profile.revision_id, version_id: initial.private_profile.version_id, audience_ceiling: "private" },
      profile_selection: { id: initial.profile_selection.owner_id, revision_id: initial.profile_selection.revision_id, version_id: initial.profile_selection.version_id, admission_slot_id: initial.profile_selection.content.admission_slot_id, activation_fence: 1 },
      project_default: initial.project_default == null ? null : { id: initial.project_default.owner_id, revision_id: initial.project_default.revision_id, version_id: initial.project_default.version_id },
      schema: binding.package.schema, protocol: { id: PROTOCOL_ID, version: PROTOCOL_VERSION },
      package: { manifest_sha256: binding.package.manifest_sha256, content_digest: binding.package.content_digest },
      initialized_at: initializedAt,
    },
  };
}

async function createCompleteTemporaryStore(binary, temporaryStore, binding, grantSha256) {
  const fd = openSync(temporaryStore, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); closeSync(fd);
  const schema = readFileSync(SCHEMA_PATH, "utf8"), now = new Date().toISOString();
  const core = initializationResult(binding, now), resultDigest = successorDigest(core.initialization);
  const receipt = { operation_id: binding.operation_id, operation_kind: "initialize_store", store_id: binding.store_id, request_digest: binding.request_digest, outcome: "initialized", result_digest: resultDigest, settled_at: now, retry_disposition: "never", operation_fence: 1 };
  const response = { ...core, receipt, idempotent_replay: false };
  const records = [initialInsert(binding.initial.root_namespace, "namespace", binding.operation_id, now), initialInsert(binding.initial.private_profile, "profile", binding.operation_id, now), initialInsert(binding.initial.profile_selection, "profile-selection", binding.operation_id, now)];
  if (binding.initial.project_default) records.push(initialInsert(binding.initial.project_default, "project-default", binding.operation_id, now));
  const projectId = binding.initial.project_default?.owner_id ?? null;
  const command = `.bail on\nPRAGMA foreign_keys=ON;\nPRAGMA application_id=${SUCCESSOR_APPLICATION_ID};\nBEGIN IMMEDIATE;\n${schema}
    INSERT INTO store_metadata VALUES(1,${sqlText(binding.store_id)},${sqlText(SCHEMA_ID)},${SCHEMA_VERSION},${sqlText(PROTOCOL_ID)},${PROTOCOL_VERSION},${sqlText(binding.package.manifest_sha256)},${sqlText(binding.package.schema.sha256)},${sqlText(now)},${sqlText(binding.operation_id)});
    INSERT INTO store_fence VALUES(1,1,1,0,0);
    INSERT INTO reconciliation_cursor_keys VALUES(1,${sqlText(randomBytes(32).toString("hex"))});
    ${records.join("\n")}
    INSERT INTO context_namespace_revisions VALUES(${sqlText(binding.initial.root_namespace.revision_id)},${sqlText(binding.initial.root_namespace.owner_id)},1,NULL,'active',${sqlText(binding.initial.root_namespace.content.display_name)},${sqlText(normalizeExactLocator(binding.initial.root_namespace.content.display_name))},'[]',1,${sqlText(now)});
    INSERT INTO context_namespace_current VALUES(${sqlText(binding.initial.root_namespace.owner_id)},${sqlText(binding.initial.root_namespace.revision_id)},NULL,'active',1,${sqlText(now)});
    INSERT INTO profile_revision_records VALUES(${sqlText(binding.initial.private_profile.revision_id)},${sqlText(binding.initial.private_profile.owner_id)},1,${sqlText(binding.initial.private_profile.version_id)},NULL,${sqlText(JSON.stringify(binding.initial.private_profile.content))},${sqlText(binding.initial.private_profile.content_digest)},'active',1,NULL,${sqlText(JSON.stringify(binding.authority_claim))},${sqlText(now)});
    INSERT INTO profile_selection_revisions VALUES(${sqlText(binding.initial.profile_selection.revision_id)},${sqlText(binding.initial.profile_selection.owner_id)},${sqlText(binding.initial.profile_selection.content.admission_slot_id)},${sqlText(binding.initial.private_profile.owner_id)},${sqlText(binding.initial.private_profile.revision_id)},NULL,'active',1,${sqlText(JSON.stringify(binding.authority_claim))},${sqlText(now)});
    INSERT INTO profile_selection_current VALUES(${sqlText(binding.initial.profile_selection.content.admission_slot_id)},${sqlText(binding.initial.profile_selection.owner_id)},${sqlText(binding.initial.profile_selection.revision_id)},${sqlText(binding.initial.private_profile.owner_id)},${sqlText(binding.initial.private_profile.revision_id)},1,${sqlText(now)});
    INSERT INTO bootstrap_state VALUES(1,${sqlText(binding.initial.root_namespace.owner_id)},${sqlText(binding.initial.private_profile.owner_id)},${sqlText(binding.initial.private_profile.revision_id)},${sqlText(binding.initial.profile_selection.owner_id)},${sqlText(binding.initial.profile_selection.content.admission_slot_id)},${sqlText(projectId)},${sqlText(binding.initial.initialization_event_id)},${sqlText(binding.request_digest)},${sqlText(resultDigest)});
    INSERT INTO store_operation_receipts VALUES(${sqlText(binding.operation_id)},'initialize_store',${sqlText(binding.store_id)},${sqlText(binding.request_digest)},'initialized',${sqlText(JSON.stringify(core))},${sqlText(resultDigest)},${sqlText(now)},'never',1,NULL,NULL,NULL,NULL,${sqlText(binding.initial.initialization_event_id)});
    INSERT INTO owner_events VALUES(${sqlText(binding.initial.initialization_event_id)},${sqlText(binding.operation_id)},NULL,NULL,'store.initialized',${sqlText(JSON.stringify({ store_id: binding.store_id }))},${sqlText(successorDigest({ store_id: binding.store_id }))},1,${sqlText(now)});
    PRAGMA user_version=${SCHEMA_VERSION};
    COMMIT;`;
  try { await sqlite(binary, temporaryStore, command, { args: ["-batch", "-bail"], timeout: 20_000, maxBuffer: 16 * 1024 * 1024 }); }
  catch (error) { try { unlinkSync(temporaryStore); } catch {} throw error; }
  const inspected = await inspectSuccessorStore(binary, temporaryStore);
  if (inspected.status !== "available") { try { unlinkSync(temporaryStore); } catch {} throw new BootstrapError("bootstrap_temporary_store_invalid", "The private complete store failed verification.", { evidence: inspected.evidence ?? {} }); }
  return { response, inspected };
}

async function readInitializationResponse(binary, storePath, operationId, requestDigest) {
  const rows = await queryJson(binary, storePath, `SELECT request_digest,result_json,result_digest,settled_at,operation_fence FROM store_operation_receipts WHERE operation_id=${sqlText(operationId)} AND operation_kind='initialize_store' LIMIT 1;`);
  if (!rows.length || rows[0].request_digest !== requestDigest) return null;
  const core = JSON.parse(rows[0].result_json);
  return { ...core, receipt: { operation_id: operationId, operation_kind: "initialize_store", store_id: core.initialization.store_id, request_digest: requestDigest, outcome: "initialized", result_digest: rows[0].result_digest, settled_at: rows[0].settled_at, retry_disposition: "never", operation_fence: rows[0].operation_fence }, idempotent_replay: true };
}

function validateRecordMatch(record, expectedGrant, pinnedDigest) {
  if (!record || record.grant_sha256 !== pinnedDigest || successorCanonicalJson(record.grant) !== successorCanonicalJson(expectedGrant)) throw new BootstrapError("bootstrap_resume_mismatch", "Consumed bootstrap authority does not exactly match operation, request, destination, and grant digest.");
}

export async function initializeSuccessorStore(request) {
  let parentFd;
  try {
    if (request.request_version !== 1) throw new BootstrapError("bootstrap_request_invalid", "request_version must be 1.");
    exact(request.bootstrap_authorization, ["path", "sha256"], "bootstrap_authorization");
    requireDigest(request.bootstrap_authorization.sha256, "bootstrap_authorization.sha256");
    const grantPath = path.resolve(requireString(request.bootstrap_authorization.path, "bootstrap_authorization.path", 4096));
    const expected = await createBootstrapAuthorizationDocument(request, { grant_path: grantPath });
    if (request.request_digest !== expected.request_digest) throw new BootstrapError("bootstrap_request_digest_mismatch", "The request digest does not match the exact resolved initialization request.");
    if (expected.sha256 !== request.bootstrap_authorization.sha256) throw new BootstrapError("bootstrap_grant_digest_mismatch", "The external grant digest pin does not match the canonical grant document.");
    const configuration = validateAuthorityConfiguration(request.configuration), destination = await destinationBinding(configuration);
    parentFd = openSync(destination.parent_realpath, constants.O_RDONLY | constants.O_DIRECTORY);
    assertParentStable(parentFd, destination);
    const paths = recordPaths(destination.parent_realpath, destination.basename, request.operation_id);
    let record = readRecord(paths.consumed);
    if (record && lstatSync(grantPath, { throwIfNoEntry: false })) throw new BootstrapError("bootstrap_duplicate_grant", "A second physical grant cannot resume an already consumed operation.");
    let grantBytes = null;
    if (!record) {
      let grantFd;
      try {
        grantFd = openSync(grantPath, constants.O_RDONLY | constants.O_NOFOLLOW);
        const info = fstatSync(grantFd, { bigint: true });
        if (!info.isFile()) throw new BootstrapError("bootstrap_grant_invalid", "Bootstrap grant is not a regular file.");
        if ((Number(info.mode) & 0o777) !== 0o600) throw new BootstrapError("bootstrap_grant_mode_invalid", "Bootstrap grant mode must be exactly 0600.");
        if (Number(info.uid) !== request.authority_claim.local_uid) throw new BootstrapError("bootstrap_grant_owner_invalid", "Bootstrap grant owner does not match the selected local UID.");
        grantBytes = readFileSync(grantFd);
        if (fileDigest(grantBytes) !== request.bootstrap_authorization.sha256) throw new BootstrapError("bootstrap_grant_digest_mismatch", "Bootstrap grant bytes do not match the external SHA-256 pin.");
        const parsed = JSON.parse(grantBytes.toString("utf8"));
        if (successorCanonicalJson(parsed) !== successorCanonicalJson(expected.document)) throw new BootstrapError("bootstrap_grant_binding_mismatch", "Bootstrap grant bindings do not exactly match the request.");
        const pathInfo = lstatSync(grantPath, { bigint: true });
        if (pathInfo.isSymbolicLink() || pathInfo.dev !== info.dev || pathInfo.ino !== info.ino) throw new BootstrapError("bootstrap_grant_identity_changed", "Bootstrap grant identity changed during verification.");
      } finally { if (grantFd != null) closeSync(grantFd); }
      if (lstatSync(destination.store_path, { throwIfNoEntry: false })) throw new BootstrapError("bootstrap_destination_exists", "Initialization publishes only to an absent destination with no replacement.");
      assertParentStable(parentFd, destination);
      runBootstrapTestStage("before_grant_consumption", configuration.source?.kind === "synthetic-test");
      assertParentStable(parentFd, destination);
      try { linkSync(grantPath, paths.consumed); }
      catch (error) {
        if (error?.code === "EEXIST" && lstatSync(grantPath, { throwIfNoEntry: false })) throw new BootstrapError("bootstrap_duplicate_grant", "A duplicate physical grant lost atomic consumption.");
        if (error?.code !== "EEXIST" && error?.code !== "ENOENT") throw error;
      }
      try { unlinkSync(grantPath); } catch (error) { if (error?.code !== "ENOENT") throw error; }
      syncDirectory(destination.parent_realpath);
      record = readRecord(paths.consumed);
    }
    const consumedInfo = lstatSync(paths.consumed);
    if (!consumedInfo.isFile() || consumedInfo.isSymbolicLink() || (consumedInfo.mode & 0o777) !== 0o600 || consumedInfo.uid !== request.authority_claim.local_uid) throw new BootstrapError("bootstrap_consumed_record_invalid", "The durable consumed record owner or mode is invalid.");
    validateRecordMatch(record, expected.document, request.bootstrap_authorization.sha256);
    runBootstrapTestStage("after_grant_consumption", configuration.source?.kind === "synthetic-test");

    const reservation = { record_schema: "bootstrap-destination-reservation@1", operation_id: request.operation_id, request_digest: request.request_digest, grant_sha256: request.bootstrap_authorization.sha256, parent_device: destination.parent_device, parent_inode: destination.parent_inode, destination_basename: destination.basename };
    try { atomicWriteNoReplace(paths.reservation, Buffer.from(`${JSON.stringify(reservation)}\n`), configuration.source?.kind === "synthetic-test"); }
    catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let existing;
      try { existing = JSON.parse(readFileSync(paths.reservation, "utf8")); } catch { throw new BootstrapError("bootstrap_destination_reserved", "The destination has an unreadable prior bootstrap reservation."); }
      const existingBinding = Object.fromEntries(Object.keys(reservation).map((key) => [key, existing[key]]));
      if (successorCanonicalJson(existingBinding) !== successorCanonicalJson(reservation)) throw new BootstrapError("bootstrap_destination_reserved", "The destination was already bound to a different bootstrap request.");
    }

    const destinationEntry = lstatSync(destination.store_path, { throwIfNoEntry: false });
    if (destinationEntry) {
      const selected = await selectSqliteBinary();
      const state = await inspectSuccessorStore(selected.path, destination.store_path);
      const recovered = state.status === "available" ? await readInitializationResponse(selected.path, destination.store_path, request.operation_id, request.request_digest) : null;
      if (!recovered) throw new BootstrapError("bootstrap_destination_exists", "The existing destination is not the exact published result of this bootstrap request.");
      const published = { ...record, phase: "published", receipt: recovered.receipt };
      atomicReplaceMatchingPhaseRecord(paths.consumed, published); atomicReplaceMatchingPhaseRecord(paths.reservation, { ...reservation, phase: "published", receipt: recovered.receipt });
      return success("initialize_store", recovered);
    }
    if (record.phase === "published") throw new BootstrapError("bootstrap_published_destination_missing", "A successfully published bootstrap destination cannot be reinitialized after removal.");

    const manifest = await loadAndValidateManifest();
    if (!manifest.ok) throw new BootstrapError("asset_incompatible", "Package assets changed after grant verification.", { failureClass: "asset_incompatible" });
    const selected = await selectSqliteBinary(), probe = await probeSqlite(selected.path, destination.parent_realpath);
    if (!probe.ok) throw new BootstrapError("sqlite_feature_unsupported", "The package-owned SQLite runtime is incompatible.", { failureClass: "asset_incompatible", evidence: { problems: probe.problems } });
    assertParentStable(parentFd, destination);
    const temporary = path.join(destination.parent_realpath, `.casebook-init-${createHash("sha256").update(request.operation_id).digest("hex").slice(0,16)}-${process.pid}-${temporarySequence += 1}`);
    let built;
    try {
      built = await createCompleteTemporaryStore(selected.path, temporary, { ...expected.document.binding, request_digest: expected.document.request_digest }, request.bootstrap_authorization.sha256);
      assertParentStable(parentFd, destination);
      runBootstrapTestStage("before_publication", configuration.source?.kind === "synthetic-test");
      assertParentStable(parentFd, destination);
      try { linkSync(temporary, destination.store_path); }
      catch (error) {
        if (error?.code !== "EEXIST") throw error;
        const state = await inspectSuccessorStore(selected.path, destination.store_path);
        const recovered = state.status === "available" ? await readInitializationResponse(selected.path, destination.store_path, request.operation_id, request.request_digest) : null;
        if (!recovered) throw error;
        built = { response: recovered, inspected: state };
      }
      syncDirectory(destination.parent_realpath); unlinkSync(temporary); syncDirectory(destination.parent_realpath);
    } finally { try { unlinkSync(temporary); } catch {} }
    runBootstrapTestStage("after_publication", configuration.source?.kind === "synthetic-test");
    const published = { ...record, phase: "published", receipt: built.response.receipt };
    atomicReplaceMatchingPhaseRecord(paths.consumed, published); atomicReplaceMatchingPhaseRecord(paths.reservation, { ...reservation, phase: "published", receipt: built.response.receipt });
    return success("initialize_store", built.response);
  } catch (error) {
    if (error instanceof BootstrapError || error instanceof ConfigurationError) return failure(error.code, error.message, { failureClass: error.failureClass, retryDisposition: error.retryDisposition, evidence: error.evidence });
    return failure("initialization_unavailable", "Atomic successor initialization did not expose ordinary half-state.", { failureClass: "store_unavailable", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE, evidence: { failure: error?.code ?? "initialization_failed" } });
  } finally { if (parentFd != null) closeSync(parentFd); }
}
