export const PACKAGE_ID = "casebook-persistence";
export const PROTOCOL_ID = "casebook-persistence-json";
export const PROTOCOL_VERSION = 1;
export const SCHEMA_ID = "casebook-persistence-sqlite";
export const SCHEMA_VERSION = 1;
export const RESULT_VERSION = 1;

export const SUPPORTED_OPERATIONS = Object.freeze([
  "diagnose",
  "initialize_store",
  "migrate_store",
  "snapshot_store",
  "restore_store",
  "get_store_operation_receipt",
  "events.page",
  "checkpoint.read",
  "checkpoint.compare_and_set",
  "reconciliation_snapshot.begin",
  "reconciliation_snapshot.page",
  "reconciliation_snapshot.finish",
  "case.create",
  "case.commit_revision",
  "case.read",
  "case.resolve",
  "case.search",
  "case.traverse",
  "case.tombstone.stage",
  "case.tombstone.commit",
  "case.purge.inspect",
  "case.export.fragment",
  "case.markdown.render",
  "case.markdown.stage_reconciliation",
  "frame.create",
  "frame.commit_revision",
  "frame.get_operation_receipt",
  "frame.resolve",
  "frame.read",
  "frame.discovery.read",
  "frame.disposition.read",
  "frame.history",
  "frame.list",
  "frame.legacy.prepare_reconciliation",
  "common.resolve",
  "common.list",
  "common.search",
  "interchange.export (sqlite)",
  "interchange.parse (markdown)",
]);

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
        supported_operations: SUPPORTED_OPERATIONS,
        requested_operation: operation ?? null,
      },
    },
  );
}
