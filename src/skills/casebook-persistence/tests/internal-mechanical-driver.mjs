// Test-only driver for disposable L01-W03 substrate evidence. This file is not
// listed in either runtime manifest and is never dispatched by the connector.
import { invokeMechanicalOperation } from "../variants/sqlite/lib/substrate/mechanical.mjs";
import { failure, PROTOCOL_ID, PROTOCOL_VERSION } from "../shared/protocol.mjs";

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
  } else {
    result = await invokeMechanicalOperation(request);
    if (result == null) {
      result = failure("test_driver_operation_unsupported", "The internal driver accepts only L01-W03 mechanical operations.", {
        failureClass: "operation_unsupported",
      });
    }
  }
} catch (error) {
  result = failure(
    error instanceof SyntaxError ? "request_json_invalid" : error.message === "request_too_large" ? "request_too_large" : "internal_failure",
    "Internal mechanical test request could not be processed.",
  );
}

process.stderr.write(result.ok
  ? `casebook-persistence-internal-test: ${result.operation} completed with status ${result.result?.status ?? "passed"}\n`
  : `casebook-persistence-internal-test: ${result.failure.code}: ${result.failure.message}\n`);
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode = result.ok ? 0 : 2;
