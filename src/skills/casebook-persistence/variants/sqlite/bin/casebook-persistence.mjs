import { invokeCaseOperation } from "../lib/case/index.mjs";
import { invokeFrameOperation } from "../lib/frame/index.mjs";
import { invokeCommonOperation } from "../lib/common/index.mjs";
import { invokeExportOperation } from "../lib/export/index.mjs";
import { invokeExceptionalOperation } from "../lib/operations/index.mjs";
import { invokeIdentityOperation } from "../lib/substrate/discovery.mjs";
import { invokeObservationOperation } from "../lib/substrate/observation.mjs";
import { invokeImpactOperation } from "../lib/substrate/impact.mjs";
import { diagnose } from "../lib/substrate/diagnostics.mjs";
import { failure, PROTOCOL_ID, PROTOCOL_VERSION } from "../../../shared/protocol.mjs";

const MAX_REQUEST_BYTES = 1024 * 1024;

async function readRequest() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) throw new Error("request_too_large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

let result;
try {
  const request = await readRequest();
  if (request?.protocol?.id !== PROTOCOL_ID || request?.protocol?.version !== PROTOCOL_VERSION) {
    result = failure("protocol_incompatible", "Request protocol identity/version is missing or incompatible.", {
      failureClass: "asset_incompatible",
      evidence: { expected: { id: PROTOCOL_ID, version: PROTOCOL_VERSION }, received: request?.protocol ?? null },
    });
  } else if (request.operation === "diagnose") {
    result = await diagnose(request);
  } else if (request.operation === "identity.discover") {
    result = await invokeIdentityOperation(request);
  } else if (["events.page", "checkpoint.read", "checkpoint.compare_and_set", "reconciliation_snapshot.begin", "reconciliation_snapshot.page", "reconciliation_snapshot.finish"].includes(request.operation)) {
    result = await invokeObservationOperation(request);
  } else if (request.operation === "impact.project") {
    result = await invokeImpactOperation(request);
  } else if (["export.preflight", "export.finalize"].includes(request.operation)) {
    result = await invokeExportOperation(request);
  } else if (["case.create", "case.commit_revision", "case.tombstone.stage", "case.tombstone.commit", "case.purge.inspect", "case.export.fragment", "case.markdown.render", "case.markdown.stage_reconciliation", "case.read", "case.resolve", "case.search", "case.traverse", "case.discovery.hydrate"].includes(request.operation)) {
    result = await invokeCaseOperation(request);
  } else if (["frame.create", "frame.commit_revision", "frame.get_operation_receipt", "frame.resolve", "frame.read", "frame.export.fragment", "frame.discovery.read", "frame.discovery.hydrate", "frame.disposition.read", "frame.history", "frame.list", "frame.legacy.prepare_reconciliation"].includes(request.operation)) {
    result = await invokeFrameOperation(request);
  } else if (["common.resolve", "common.list", "common.search", "interchange.export"].includes(request.operation)) {
    result = await invokeCommonOperation(request);
  } else {
    result = await invokeExceptionalOperation(request);
  }
} catch (error) {
  result = failure(
    error instanceof SyntaxError ? "request_json_invalid" : error.message === "request_too_large" ? "request_too_large" : "internal_failure",
    error instanceof SyntaxError ? "Request must be one valid JSON document." : "Request could not be processed.",
  );
}

process.stderr.write(result.ok
  ? `casebook-persistence: ${result.operation} completed with status ${result.result?.status ?? "passed"}\n`
  : `casebook-persistence: ${result.failure.code}: ${result.failure.message}\n`);
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode = result.ok ? 0 : 2;
