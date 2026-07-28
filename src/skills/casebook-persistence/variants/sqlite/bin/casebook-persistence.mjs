import { initializeSuccessorStore } from "../lib/substrate/bootstrap.mjs";
import { invokeSuccessorMechanicalOperation } from "../lib/substrate/mechanical-successor.mjs";
import { invokeProfileOperation } from "../lib/profile/index.mjs";
import { invokeContextOperation } from "../lib/context/index.mjs";
import { hydrateOrganizationalHandoff, organizationalSearch, resolveOrganizationalIdentity } from "../lib/query/search.mjs";
import { graphQuery } from "../lib/query/graph.mjs";
import { snapshotReconcile } from "../lib/query/snapshot-reconcile.mjs";
import { invokeSuccessorCaseOperation } from "../lib/case/successor.mjs";
import { invokeSuccessorFrameOperation } from "../lib/frame/successor.mjs";
import { admitEmbeddedRuntime, diagnose } from "../lib/substrate/diagnostics.mjs";
import { failure, PROTOCOL_ID, PROTOCOL_VERSION, SUPPORTED_OPERATIONS, unsupported } from "../../../shared/protocol.mjs";

const MAX_REQUEST_BYTES = 1024 * 1024;
async function readRequest() {
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) { size += chunk.length; if (size > MAX_REQUEST_BYTES) throw new Error("request_too_large"); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

let result;
try {
  const request = await readRequest();
  if (request?.protocol?.id !== PROTOCOL_ID || request?.protocol?.version !== PROTOCOL_VERSION) {
    result = failure("protocol_incompatible", "Request protocol identity/version is missing or incompatible.", { failureClass: "asset_incompatible", evidence: { expected: { id: PROTOCOL_ID, version: PROTOCOL_VERSION }, received: request?.protocol ?? null } });
  } else {
    const runtimeFailure = await admitEmbeddedRuntime();
    if (runtimeFailure) result = runtimeFailure;
    else if (request.operation === "initialize_store") result = await initializeSuccessorStore(request);
    else if (request.operation === "diagnose") result = await diagnose(request);
    else if (request.operation?.startsWith("profile.")) result = await invokeProfileOperation(request);
    else if (["namespace.", "project_default.", "chat."].some((prefix) => request.operation?.startsWith(prefix))) result = await invokeContextOperation(request);
    else if (request.operation === "query.search") result = await organizationalSearch(request);
    else if (request.operation === "query.resolve") result = await resolveOrganizationalIdentity(request);
    else if (request.operation === "query.hydrate") result = await hydrateOrganizationalHandoff(request);
    else if (["graph.neighbors", "graph.traverse", "graph.path"].includes(request.operation)) result = await graphQuery(request);
    else if (["events.page", "query.snapshot_reconcile.begin", "query.snapshot_reconcile.page", "query.snapshot_reconcile.finish", "query.snapshot_reconcile.checkpoint"].includes(request.operation)) result = await snapshotReconcile(request);
    else if (request.operation?.startsWith("case.")) result = await invokeSuccessorCaseOperation(request);
    else if (request.operation?.startsWith("frame.")) result = await invokeSuccessorFrameOperation(request);
    else if (["substrate.commit_revision", "substrate.get_receipt", "substrate.read_owner_current", "substrate.read_owner_revision", "substrate.resolve_family_binding", "substrate.resolve_current_claim", "integrity.observe", "projection.rebuild"].includes(request.operation)) result = await invokeSuccessorMechanicalOperation(request);
    else result = unsupported(request.operation);
  }
} catch (error) {
  result = failure(error instanceof SyntaxError ? "request_json_invalid" : error.message === "request_too_large" ? "request_too_large" : "internal_failure", error instanceof SyntaxError ? "Request must be one valid JSON document." : "Request could not be processed.", { evidence: {} });
}
if (!SUPPORTED_OPERATIONS.includes(result.operation) && result.ok) result = failure("internal_failure", "The connector returned an undeclared operation.");
process.stderr.write(result.ok ? `casebook-persistence: ${result.operation} completed\n` : `casebook-persistence: ${result.failure.code}: ${result.failure.message}\n`);
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode = result.ok ? 0 : 2;
