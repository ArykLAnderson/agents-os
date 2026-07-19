export const PACKAGE_ID = "casebook-persistence";
export const PROTOCOL_ID = "casebook-persistence-json";
export const PROTOCOL_VERSION = 1;
export const SCHEMA_ID = "casebook-persistence-sqlite";
export const SCHEMA_VERSION = 1;
export const RESULT_VERSION = 1;

export const RETRY_DISPOSITIONS = Object.freeze({
  NEVER: "never",
  AFTER_RECONCILE: "after_reconcile",
  AFTER_OPERATOR_REPAIR: "after_operator_repair",
});

export function success(operation, result) {
  return {
    protocol: { id: PROTOCOL_ID, version: PROTOCOL_VERSION },
    result_version: RESULT_VERSION,
    ok: true,
    operation,
    result,
  };
}

export function failure(code, message, options = {}) {
  return {
    protocol: { id: PROTOCOL_ID, version: PROTOCOL_VERSION },
    result_version: RESULT_VERSION,
    ok: false,
    failure: {
      class: options.failureClass ?? "configuration_or_asset_incompatible",
      code,
      message,
      retry_disposition: options.retryDisposition ?? RETRY_DISPOSITIONS.NEVER,
      corrective_guidance: options.correctiveGuidance ?? "Correct the request or installation and run diagnostics again.",
      evidence: options.evidence ?? {},
    },
  };
}

export function unsupported(operation) {
  return failure(
    "not_yet_implemented",
    `Operation ${JSON.stringify(operation)} is outside the current accepted delivery slice and is not implemented.`,
    {
      failureClass: "operation_unsupported",
      correctiveGuidance: "Do not retry this operation. Complete and accept its owning later work item first.",
      evidence: {
        supported_operations: ["diagnose", "initialize_store", "get_store_operation_receipt"],
        requested_operation: operation ?? null,
      },
    },
  );
}
