import { invokeCaseOperation } from "../lib/case/index.mjs";
import { invokeFrameOperation } from "../lib/frame/index.mjs";
import { invokeCommonOperation } from "../lib/common/index.mjs";
import { invokeExportOperation } from "../lib/export/index.mjs";
import { invokeExceptionalOperation } from "../lib/operations/index.mjs";
import { invokeIdentityOperation } from "../lib/substrate/discovery.mjs";
import { invokeObservationOperation } from "../lib/substrate/observation.mjs";
import { invokeImpactOperation } from "../lib/substrate/impact.mjs";
import { invokeIntegrityOperation } from "../lib/substrate/integrity.mjs";
import { invokeProjectionOperation } from "../lib/substrate/projection.mjs";
import { diagnose, selectSqliteBinary } from "../lib/substrate/diagnostics.mjs";
import { bindStoreAuthorityIfAuthorized, inspectStore } from "../lib/substrate/index.mjs";
import { ConfigurationError, validateAuthorityConfiguration } from "../../../shared/config.mjs";
import { failure, PROTOCOL_ID, PROTOCOL_VERSION, RETRY_DISPOSITIONS } from "../../../shared/protocol.mjs";

const MAX_REQUEST_BYTES = 1024 * 1024;
const RETIRED_OPERATIONS = new Set(["events.page", "checkpoint.read", "checkpoint.compare_and_set", "reconciliation_snapshot.begin", "reconciliation_snapshot.page", "reconciliation_snapshot.finish", "impact.project", "integrity.observe", "projection.rebuild", "export.preflight", "export.finalize", "case.export.fragment", "case.markdown.render", "case.markdown.stage_reconciliation", "case.purge.inspect", "case.purge.plan", "case.purge.execute", "frame.export.fragment", "view_policy.create", "view_policy.revise", "view_policy.activate", "view_policy.retire"]);

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

let authorityStoreAccessed = false;

async function authorityAdmission(request) {
  let configuration;
  try {
    configuration = validateAuthorityConfiguration(request.configuration);
  } catch (error) {
    if (error instanceof ConfigurationError) return failure(error.code, error.message, { evidence: error.evidence });
    throw error;
  }
  if (configuration.authority_mode !== "sqlite") return null;
  let binary;
  try {
    binary = (await selectSqliteBinary(configuration.sqlite.sqlite_bin)).path;
  } catch (error) {
    if (error instanceof ConfigurationError) return failure(error.code, error.message, { evidence: error.evidence });
    throw error;
  }
  // Only snapshot and migration can inspect a healthy v1 source. All ordinary
  // operations retain the migration-required boundary at the public entrypoint.
  const allowMigrationSource = request.operation === "snapshot_store" || request.operation === "migrate_store";
  let state = await inspectStore(binary, configuration.sqlite.store_path, { allowMigrationSource });
  if (state.status !== "available" && state.code === "store_partial_initialization") {
    const bound = await bindStoreAuthorityIfAuthorized(binary, configuration.sqlite.store_path, configuration, request);
    if (bound) state = await inspectStore(binary, configuration.sqlite.store_path);
  }
  if (state.status !== "available") return null;
  authorityStoreAccessed = true;
  const binding = state.authority_binding;
  const storeIdentityMatches = request.store_id == null || request.store_id === state.metadata.store_id;
  if (binding?.authority_mode === "sqlite"
    && binding.store_id === state.metadata.store_id
    && binding.source_kind === configuration.source.kind
    && binding.source_locator === configuration.source.locator
    && storeIdentityMatches) return null;
  return failure("authority_binding_mismatch", "The configured workspace authority does not match this store's immutable binding.", {
    failureClass: "authority_binding_mismatch",
    retryDisposition: RETRY_DISPOSITIONS.NEVER,
    correctiveGuidance: "Do not substitute a locator, authority mode, or store identity. Authority switching requires a separately authorized migration.",
    evidence: {},
  });
}

let result;
let admission;
try {
  const request = await readRequest();
  if (request?.protocol?.id !== PROTOCOL_ID || request?.protocol?.version !== PROTOCOL_VERSION) {
    result = failure("protocol_incompatible", "Request protocol identity/version is missing or incompatible.", {
      failureClass: "asset_incompatible",
      evidence: { expected: { id: PROTOCOL_ID, version: PROTOCOL_VERSION }, received: request?.protocol ?? null },
    });
  } else if (RETIRED_OPERATIONS.has(request.operation)) {
    result = failure("operation_unsupported", "This operation is retired for schema-v3 local access.", {
      failureClass: "operation_unsupported",
      retryDisposition: RETRY_DISPOSITIONS.NEVER,
      correctiveGuidance: "Use an explicitly supported ordinary local access operation.",
      evidence: { requested_operation: request.operation },
    });
  } else if ((admission = await authorityAdmission(request)) != null) {
    result = admission;
  } else if (request.operation === "diagnose") {
    result = await diagnose(request);
    if (result.ok && result.result?.bounded_runtime_probe) {
      result.result.bounded_runtime_probe.configured_store_accessed = authorityStoreAccessed;
    }
  } else if (["case.create", "case.commit_revision", "case.read", "case.resolve", "case.search", "case.traverse", "case.discovery.hydrate"].includes(request.operation)) {
    const configuration = validateAuthorityConfiguration(request.configuration);
    const state = await inspectStore((await selectSqliteBinary(configuration.sqlite.sqlite_bin)).path, configuration.sqlite.store_path);
    result = state.status === "migration_required" ? failure("schema_migration_required", "The configured store requires an explicit compatible migration.", { failureClass: "schema_migration_required", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR, evidence: state.evidence }) : await invokeCaseOperation(request);
  } else if (["frame.create", "frame.commit_revision", "frame.resolve", "frame.read", "frame.list"].includes(request.operation)) {
    result = await invokeFrameOperation(request);
  } else if (request.operation === "identity.discover") {
    result = await invokeIdentityOperation(request);
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
