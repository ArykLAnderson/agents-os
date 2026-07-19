import { invokeMarkdownOperation } from "../lib/workspace.mjs";
import { loadAndValidateManifest } from "../../../shared/manifest.mjs";
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
  } else if (Number(process.versions.node.split(".")[0]) < 22) {
    result = failure("node_version_unsupported", "Node.js 22 or newer is required.", {
      failureClass: "runtime_incompatible",
      evidence: { actual: process.versions.node, minimum_major: 22 },
    });
  } else {
    const manifest = await loadAndValidateManifest();
    result = manifest.ok
      ? await invokeMarkdownOperation(request)
      : failure("asset_incompatible", "Package manifest or asset verification failed.", {
          failureClass: "asset_incompatible",
          evidence: { problems: manifest.problems },
        });
  }
} catch (error) {
  result = failure(
    error instanceof SyntaxError ? "request_json_invalid" : error.message === "request_too_large" ? "request_too_large" : "internal_failure",
    error instanceof SyntaxError ? "Request must be one valid JSON document." : "Request could not be processed.",
  );
}

process.stderr.write(result.ok
  ? `casebook-persistence-markdown: ${result.operation} completed with status ${result.result?.status ?? "passed"}\n`
  : `casebook-persistence-markdown: ${result.failure.code}: ${result.failure.message}\n`);
process.stdout.write(`${JSON.stringify(result)}\n`);
process.exitCode = result.ok ? 0 : 2;
