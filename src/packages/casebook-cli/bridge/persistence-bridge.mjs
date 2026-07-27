import { randomUUID } from "node:crypto";
import { describeTarget, recentOperations } from "../../../skills/casebook-persistence/variants/sqlite/lib/cli/index.mjs";
import { invokeSuccessorCaseOperation } from "../../../skills/casebook-persistence/variants/sqlite/lib/case/successor.mjs";
import { invokeSuccessorFrameOperation } from "../../../skills/casebook-persistence/variants/sqlite/lib/frame/successor.mjs";
import { invokeSuccessorMechanicalOperation } from "../../../skills/casebook-persistence/variants/sqlite/lib/substrate/mechanical-successor.mjs";
import { organizationalSearch } from "../../../skills/casebook-persistence/variants/sqlite/lib/query/search.mjs";
const protocol = { id: "casebook-persistence-json", version: 2 };
const failure = (code, message) => ({ ok: false, failure: { code, message } });
const config = (workspace, store) => ({ source: { kind: "workspace-root", locator: workspace }, authority_mode: "sqlite", sqlite: { database_url: store } });
const provenance = { acting_role: "casebook-cli", authority_basis: "trusted-local standalone CLI invocation" };
function common(request) { const target = request.target; return { protocol, request_version: 1, store_id: target.store_id, workspace_id: target.workspace_id, admission_slot_id: target.admission_slot_id, admission: { kind: "sqlite_profile", binding: { selection_id: target.profile_selection_id, selection_revision_id: target.profile_selection_revision_id, profile_id: target.profile_id, profile_revision_id: target.profile_revision_id, activation_fence: target.activation_fence } }, configuration: config(request.workspace, request.store) }; }
async function dispatch(request) {
  if (request.operation === "target.describe") return describeTarget({ protocol, operation: "target.describe", request_version: 1, workspace_locator: request.workspace, configuration: config(request.workspace, request.store) });
  const base = common(request), flags = request.flags ?? {}, placement = flags.namespace_id ? { namespace_id: flags.namespace_id } : { namespace_id: request.target.root_namespace_id };
  if (request.operation === "case.create" || request.operation === "case.commit_revision") return invokeSuccessorCaseOperation({ ...base, operation: request.operation, operation_id: request.operation_id ?? `operation:${randomUUID().toLowerCase()}`, expected_revision: request.operation === "case.create" ? 0 : Number(flags.expected_revision), commit_basis: flags.commit_basis, provenance, case: request.aggregate, placement });
  if (request.operation === "frame.create" || request.operation === "frame.commit_revision") return invokeSuccessorFrameOperation({ ...base, operation: request.operation, operation_id: request.operation_id ?? `operation:${randomUUID().toLowerCase()}`, expected_revision: request.operation === "frame.create" ? 0 : Number(flags.expected_revision), commit_basis: flags.commit_basis, provenance, frame: request.aggregate, placement });
  if (request.operation === "case.read") return invokeSuccessorCaseOperation({ ...base, operation: request.operation, case_id: flags.case_id, revision_id: flags.owner_revision_id });
  if (request.operation === "frame.read") return invokeSuccessorFrameOperation({ ...base, operation: request.operation, frame_id: flags.frame_id, revision_id: flags.owner_revision_id });
  if (request.operation === "query.search") return organizationalSearch({ ...base, operation: "query.search", query: flags.query, scope: flags.namespace_id ? "exact_namespace" : "workspace", ...(flags.namespace_id ? { namespace_id: flags.namespace_id } : {}), ...(flags.limit ? { limit: Number(flags.limit) } : {}), ...(flags.cursor ? { cursor: flags.cursor } : {}) });
  if (request.operation === "substrate.get_receipt") return invokeSuccessorMechanicalOperation({ ...base, operation: "substrate.get_receipt", operation_id: flags.operation_id });
  if (request.operation === "operation.recent") return recentOperations({ ...base, operation: "operation.recent", limit: Number(flags.limit ?? 20), ...(flags.before_operation_fence ? { before_operation_fence: Number(flags.before_operation_fence) } : {}) });
  return failure("operation_unsupported", "Operation is not admitted.");
}
let bytes = Buffer.alloc(0); for await (const chunk of process.stdin) { bytes = Buffer.concat([bytes, chunk]); if (bytes.length > 1024 * 1024) { process.stdout.write(JSON.stringify(failure("bridge_request_too_large", "Bridge input exceeded its public bound."))); process.exit(0); } }
try { const request = JSON.parse(bytes.toString("utf8")); process.stdout.write(JSON.stringify(await dispatch(request))); } catch { process.stdout.write(JSON.stringify(failure("bridge_request_invalid", "Bridge request is invalid."))); }
