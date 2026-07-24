import { failure, RETRY_DISPOSITIONS, success, unsupported } from "../../../../shared/protocol.mjs";
import { invokeSubstrateOperation } from "./index.mjs";

const REQUEST_FIELDS = new Set([
  "protocol", "operation", "request_version", "store_id", "owner_kinds",
  "query", "limit", "max_depth", "cursor", "namespace_ids", "configuration",
]);

function invalid(message = "The bounded identity discovery request is invalid.") {
  return failure("identity.discovery_invalid", message, {
    failureClass: "identity.discovery_invalid",
    retryDisposition: RETRY_DISPOSITIONS.NEVER,
    evidence: {},
  });
}

export async function invokeIdentityOperation(request) {
  if (request.operation !== "identity.discover") return unsupported(request.operation);
  if (request.request_version !== 1 || Object.keys(request).some((key) => !REQUEST_FIELDS.has(key))) return invalid();
  const mechanical = await invokeSubstrateOperation({ ...request, operation: "discover_identities" });
  if (mechanical?.ok) return success("identity.discover", mechanical.result);
  if (mechanical?.failure?.code === "representation_invalid" || mechanical?.failure?.code === "identity_invalid") return invalid();
  if (mechanical?.failure?.code === "not_visible") {
    return success("identity.discover", {
      status: "found", candidates: [], links: [], query_digest: null,
      snapshot_query_fence: null, result_completeness: "complete_within_bounds",
      stable_sort: "depth_asc_owner_kind_asc_stable_id_asc", next_cursor: null,
      handoff_token: null, applied_bounds: { result_limit: request.limit, max_depth: request.max_depth },
      applied_namespace_filter: request.namespace_ids?.slice().sort() ?? null,
    });
  }
  return failure("identity.discovery_unavailable", "Constrained identity discovery is unavailable without exposing owner state.", {
    failureClass: "identity.discovery_unavailable",
    retryDisposition: mechanical?.failure?.retry_disposition ?? RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
    evidence: {},
  });
}
