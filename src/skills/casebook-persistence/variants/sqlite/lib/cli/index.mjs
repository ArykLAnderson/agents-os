import path from "node:path";
import { lstat } from "node:fs/promises";
import { validateAuthorityConfiguration } from "../../../../shared/config.mjs";
import { loadAndValidateManifest } from "../../../../shared/manifest.mjs";
import { failure, success } from "../../../../shared/protocol.mjs";
import { selectSqliteBinary, probeSqlite, sqlite } from "../substrate/diagnostics.mjs";
import { inspectSuccessorStore } from "../substrate/bootstrap.mjs";
import { prepareAdmission, profileAdmissionPredicate } from "../resource/admission-guards.mjs";

const sql = (value) => `'${String(value).replaceAll("'", "''")}'`;
async function rows(binary, store, statement) {
  const { stdout } = await sqlite(binary, store, `PRAGMA query_only=ON;\n${statement}`, { args: ["-batch", "-bail", "-json"] });
  return JSON.parse(stdout || "[]");
}
async function checkedStore(pathname) {
  const record = await lstat(pathname);
  if (!record.isFile() || record.isSymbolicLink()) throw Error("store_unsafe");
  return { dev: record.dev, ino: record.ino, size: record.size };
}
async function prepared(configuration) {
  const config = validateAuthorityConfiguration(configuration);
  if (config.authority_mode !== "sqlite") return { failure: failure("sqlite_authority_required", "The connected CLI requires SQLite authority.") };
  const initialStore = await checkedStore(config.sqlite.store_path);
  const manifest = await loadAndValidateManifest();
  if (!manifest.ok) return { failure: failure("asset_incompatible", "Package assets are incompatible.", { evidence: { problems: manifest.problems } }) };
  const selected = await selectSqliteBinary();
  if (!(await probeSqlite(selected.path, path.dirname(config.sqlite.store_path))).ok) return { failure: failure("sqlite_feature_unsupported", "The package-owned SQLite runtime is incompatible.") };
  const state = await inspectSuccessorStore(selected.path, config.sqlite.store_path);
  const finalStore = await checkedStore(config.sqlite.store_path);
  if (initialStore.dev !== finalStore.dev || initialStore.ino !== finalStore.ino || initialStore.size !== finalStore.size) return { failure: failure("store_changed", "The resolved store changed during admission.") };
  if (state.status !== "available") return { failure: failure(state.code ?? "store_unavailable", "The resolved store is unavailable.", { evidence: state.evidence ?? {} }) };
  return { config, manifest, binary: selected.path, store: config.sqlite.store_path, state };
}
function targetFailure(code, message) { return failure(code, message, { failureClass: "target_admission_refused" }); }
export async function describeTarget(request) {
  try {
    if (!request || Object.keys(request).sort().join("\0") !== ["configuration", "operation", "protocol", "request_version"].join("\0") || request.operation !== "target.describe" || request.request_version !== 1 || request.protocol?.id !== "casebook-persistence-json" || request.protocol?.version !== 2) return targetFailure("target_request_invalid", "target.describe has an invalid closed request.");
    const ready = await prepared(request.configuration); if (ready.failure) return ready.failure;
    const slots = await rows(ready.binary, ready.store, `SELECT admission_slot_id,selection_id,selection_revision_id,profile_id,profile_revision_id,activation_fence FROM profile_selection_current ORDER BY admission_slot_id;`);
    if (slots.length !== 1) return targetFailure(slots.length ? "multiple_admission_slots" : "admission_slot_missing", "Exactly one active Profile selection is required.");
    const slot = slots[0];
    const target = { schema: "casebook-resolved-target@1", store_id: ready.state.metadata.store_id, root_namespace_id: ready.state.bootstrap.root_namespace_id, admission_slot_id: slot.admission_slot_id, profile_selection_id: slot.selection_id, profile_selection_revision_id: slot.selection_revision_id, profile_id: slot.profile_id, profile_revision_id: slot.profile_revision_id, activation_fence: slot.activation_fence, observed_operation_fence: ready.state.operation_fence, sqlite_schema: { id: ready.state.metadata.schema_id, version: ready.state.metadata.schema_version }, package: { manifest_sha256: ready.state.metadata.package_manifest_sha256, content_digest: ready.manifest.manifest.content_digest.sha256 } };
    return success("target.describe", target);
  } catch { return targetFailure("store_unavailable", "The resolved store is unavailable."); }
}
export async function recentOperations(request) {
  try {
    const ready = await prepared(request.configuration); if (ready.failure) return ready.failure;
    const admission = prepareAdmission({ operation: "substrate.get_receipt", admissionSlotId: request.admission_slot_id, admission: request.admission });
    if (request.store_id !== ready.state.metadata.store_id) return targetFailure("store_target_mismatch", "The resolved target changed.");
    if ((await rows(ready.binary, ready.store, `SELECT CASE WHEN ${profileAdmissionPredicate(admission)} THEN 1 ELSE 0 END ok;`))[0]?.ok !== 1) return targetFailure("profile_guard_denied", "The selected Profile no longer admits the request.");
    const limit = request.limit, before = request.before_operation_fence ?? null;
    if (!Number.isInteger(limit) || limit < 1 || limit > 20 || (before != null && (!Number.isInteger(before) || before < 1))) return targetFailure("recent_request_invalid", "Recent operation bounds are invalid.");
    const page = await rows(ready.binary, ready.store, `SELECT operation_id,operation_kind,request_digest,outcome,result_digest,settled_at,retry_disposition,operation_fence,owner_id,committed_revision AS owner_revision_id,event_id FROM store_operation_receipts WHERE ${before == null ? "1" : `operation_fence < ${before}`} ORDER BY operation_fence DESC LIMIT ${limit + 1};`);
    const operations = page.slice(0, limit).map((row) => ({ ...row, owner_id: row.owner_id ?? null, owner_revision_id: row.owner_revision_id ?? null, event_id: row.event_id ?? null }));
    return success("operation.recent", { observed_operation_fence: ready.state.operation_fence, operations, next_before_operation_fence: page.length > limit ? operations.at(-1).operation_fence : null });
  } catch { return targetFailure("profile_guard_denied", "The selected Profile no longer admits the request."); }
}
