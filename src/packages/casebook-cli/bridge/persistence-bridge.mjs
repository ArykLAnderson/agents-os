import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeRoot = path.join(root, "bridge", "runtime", "casebook-persistence");
const runtimeManifest = path.join(runtimeRoot, "manifest.json");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const protocol = { id: "casebook-persistence-json", version: 2 };
const TEST_HOOK = "casebook-cli-e2e@1";
const testFault = () => process.env.CASEBOOK_CLI_TEST_HOOK === TEST_HOOK
  ? process.env.CASEBOOK_CLI_TEST_BRIDGE_FAULT
  : null;
const failure = (code, message) => ({ ok: false, failure: { code, message } });
const config = (workspace, store) => ({ source: { kind: "workspace-root", locator: workspace }, authority_mode: "sqlite", sqlite: { database_url: store } });
const provenance = { acting_role: "casebook-cli", authority_basis: "trusted-local standalone CLI invocation" };

async function runtime() {
  const packageMetadata = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const expected = packageMetadata.casebookCli?.provider;
  const manifestBytes = await readFile(runtimeManifest);
  const manifest = JSON.parse(manifestBytes);
  if (expected?.id !== "casebook-persistence@0.19.0-successor"
    || digest(manifestBytes) !== expected.manifest_sha256
    || manifest.package?.id !== "casebook-persistence"
    || manifest.content_digest?.sha256 !== expected.content_digest) throw Error("bridge_runtime_invalid");
  const [{ describeTarget, recentOperations }, { invokeSuccessorCaseOperation }, { invokeSuccessorFrameOperation }, { invokeSuccessorMechanicalOperation }, { organizationalSearch }] = await Promise.all([
    import("./runtime/casebook-persistence/variants/sqlite/lib/cli/index.mjs"),
    import("./runtime/casebook-persistence/variants/sqlite/lib/case/successor.mjs"),
    import("./runtime/casebook-persistence/variants/sqlite/lib/frame/successor.mjs"),
    import("./runtime/casebook-persistence/variants/sqlite/lib/substrate/mechanical-successor.mjs"),
    import("./runtime/casebook-persistence/variants/sqlite/lib/query/search.mjs"),
  ]);
  return { describeTarget, recentOperations, invokeSuccessorCaseOperation, invokeSuccessorFrameOperation, invokeSuccessorMechanicalOperation, organizationalSearch };
}
function common(request) {
  const target = request.target;
  return { protocol, request_version: 1, store_id: target.store_id, workspace_id: target.workspace_id, admission_slot_id: target.admission_slot_id, admission: { kind: "sqlite_profile", binding: { selection_id: target.profile_selection_id, selection_revision_id: target.profile_selection_revision_id, profile_id: target.profile_id, profile_revision_id: target.profile_revision_id, activation_fence: target.activation_fence } }, configuration: config(request.workspace, request.store) };
}
async function dispatch(request) {
  const provider = await runtime();
  if (request.operation === "target.describe") return provider.describeTarget({ protocol, operation: "target.describe", request_version: 1, workspace_locator: request.workspace, configuration: config(request.workspace, request.store) });
  const base = common(request), flags = request.flags ?? {};
  const placement = flags.namespace_id ? { placement: { namespace_id: flags.namespace_id } } : {};
  if (request.operation === "case.create" || request.operation === "case.commit_revision") return provider.invokeSuccessorCaseOperation({ ...base, operation: request.operation, operation_id: request.operation_id ?? `operation:${randomUUID().toLowerCase()}`, expected_revision: request.operation === "case.create" ? 0 : Number(flags.expected_revision), commit_basis: flags.commit_basis, provenance, case: request.aggregate, ...placement });
  if (request.operation === "frame.create" || request.operation === "frame.commit_revision") return provider.invokeSuccessorFrameOperation({ ...base, operation: request.operation, operation_id: request.operation_id ?? `operation:${randomUUID().toLowerCase()}`, expected_revision: request.operation === "frame.create" ? 0 : Number(flags.expected_revision), commit_basis: flags.commit_basis, provenance, frame: request.aggregate, ...(request.operation === "frame.commit_revision" ? { frame_id: flags.frame_id } : {}), ...placement });
  if (request.operation === "case.read") return provider.invokeSuccessorCaseOperation({ ...base, operation: request.operation, case_id: flags.case_id, ...(flags.owner_revision_id ? { revision_id: flags.owner_revision_id } : {}) });
  if (request.operation === "frame.read") return provider.invokeSuccessorFrameOperation({ ...base, operation: request.operation, frame_id: flags.frame_id, ...(flags.owner_revision_id ? { revision_id: flags.owner_revision_id } : {}) });
  if (request.operation === "query.search") return provider.organizationalSearch({ ...base, operation: "query.search", query: flags.query, scope: flags.namespace_id ? "exact_namespace" : "workspace", ...(flags.namespace_id ? { namespace_id: flags.namespace_id } : {}), ...(flags.limit ? { limit: Number(flags.limit) } : {}), ...(flags.cursor ? { cursor: flags.cursor } : {}) });
  if (request.operation === "substrate.get_receipt") return provider.invokeSuccessorMechanicalOperation({ ...base, operation: "substrate.get_receipt", operation_id: flags.operation_id });
  if (request.operation === "operation.recent") return provider.recentOperations({ ...base, operation: "operation.recent", limit: Number(flags.limit ?? 20), ...(flags.before_operation_fence ? { before_operation_fence: Number(flags.before_operation_fence) } : {}) });
  return failure("operation_unsupported", "Operation is not admitted.");
}
let bytes = Buffer.alloc(0);
for await (const chunk of process.stdin) {
  bytes = Buffer.concat([bytes, chunk]);
  if (bytes.length > 1024 * 1024) {
    process.stdout.write(JSON.stringify(failure("bridge_request_too_large", "Bridge input exceeded its public bound.")));
    process.exit(0);
  }
}
try {
  const request = JSON.parse(bytes.toString("utf8"));
  const fault = request.operation === "target.describe" ? null : testFault();
  const response = await dispatch(request);
  if (fault === "exit") process.exitCode = 1;
  else if (fault === "signal") process.kill(process.pid, "SIGTERM");
  else if (fault === "timeout") await new Promise((resolve) => setTimeout(resolve, 60_000));
  else if (fault === "malformed") process.stdout.write("not-json");
  else if (fault === "overflow") process.stdout.write("x".repeat(1024 * 1024 + 1));
  else if (fault === "contradictory") process.stdout.write(JSON.stringify({ ok: true, result: null }));
  else process.stdout.write(JSON.stringify(response));
} catch (error) {
  if (error?.message === "bridge_runtime_invalid") process.exitCode = 1;
  else process.stdout.write(JSON.stringify(failure("bridge_request_invalid", "Bridge request is invalid.")));
}
