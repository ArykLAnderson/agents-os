export const PACKAGE_ID = "casebook-persistence";
export const PROTOCOL_ID = "casebook-persistence-json";
export const PROTOCOL_VERSION = 2;
export const SCHEMA_ID = "sqlite_casebook";
export const SCHEMA_VERSION = 2;
export const RESULT_ID = "casebook-cli-result";
export const RESULT_VERSION = 2;
export const TARGET_ID = "casebook-resolved-target";
export const TARGET_VERSION = 1;
export const SELECTION_ID = TARGET_ID;
export const SELECTION_VERSION = TARGET_VERSION;
export const ORDINARY_CLI_OPERATIONS = Object.freeze([
  "target.describe", "case.create", "case.read", "case.commit_revision",
  "frame.create", "frame.read", "frame.commit_revision", "query.search",
  "substrate.get_receipt", "operation.recent",
]);

// The successor currently exposes exceptional bootstrap, the owner-neutral
// substrate, and human-operational Profile admission. Later Work Items add
// Context and provider-local lexical query are admitted here; aggregate semantics, migration, activation, final CLI and Markdown follow later.
export const SUPPORTED_OPERATIONS = Object.freeze([
  "diagnose",
  "initialize_store",
  "profile.create",
  "profile.revise",
  "profile.activate",
  "profile.retire",
  "profile.read",
  "profile.history",
  "namespace.create", "namespace.revise", "namespace.retire", "namespace.read", "namespace.history", "namespace.resolve",
  "project_default.create", "project_default.revise", "project_default.retire", "project_default.read",
  "chat.establish", "chat.resume", "chat.fork", "chat.rebind", "chat.read", "chat.history",
  "substrate.commit_revision",
  "substrate.get_receipt",
  "substrate.read_owner_current",
  "substrate.read_owner_revision",
  "substrate.resolve_family_binding",
  "substrate.resolve_current_claim",
  "integrity.observe",
  "projection.rebuild",
  "case.create",
  "case.commit_revision",
  "case.tombstone.commit",
  "case.read",
  "case.resolve",
  "case.update", "case.tombstone",
  ...["knowledge", "facet", "source", "evidence", "relationship"].flatMap((kind) => ["read", "create", "update", "tombstone"].map((action) => `case.${kind}.${action}`)),
  "frame.create", "frame.commit_revision", "frame.read",
  "frame.profile.read", "frame.profile.update",
  "frame.discovery.create", "frame.discovery.read", "frame.discovery.update", "frame.discovery.settle", "frame.discovery.tombstone", "frame.discovery.reopen",
  "frame.disposition_boundary.read", "frame.disposition_boundary.create", "frame.disposition_boundary.update", "frame.disposition_boundary.close",
  "frame.case_disposition.read", "frame.case_disposition.create", "frame.case_disposition.update", "frame.case_disposition.classify", "frame.case_disposition.settle",
  "query.search", "query.resolve", "query.hydrate",
  "graph.neighbors", "graph.traverse", "graph.path", "events.page",
  "query.snapshot_reconcile.begin", "query.snapshot_reconcile.page", "query.snapshot_reconcile.finish", "query.snapshot_reconcile.checkpoint",
]);

export const RETRY_DISPOSITIONS = Object.freeze({
  NEVER: "never",
  AFTER_RECONCILE: "after_reconcile",
  AFTER_OPERATOR_REPAIR: "after_operator_repair",
});

export function success(operation, result) {
  return { protocol: { id: PROTOCOL_ID, version: PROTOCOL_VERSION }, result_contract: { id: RESULT_ID, version: RESULT_VERSION }, ok: true, operation, result };
}
export function failure(code, message, options = {}) {
  return {
    protocol: { id: PROTOCOL_ID, version: PROTOCOL_VERSION }, result_contract: { id: RESULT_ID, version: RESULT_VERSION }, ok: false,
    failure: {
      class: options.failureClass ?? "configuration_or_asset_incompatible", code, message,
      retry_disposition: options.retryDisposition ?? RETRY_DISPOSITIONS.NEVER,
      corrective_guidance: options.correctiveGuidance ?? "Correct the request or installation and run diagnostics again.",
      evidence: options.evidence ?? {},
    },
  };
}
export function unsupported(operation) {
  return failure("operation_unsupported", `Operation ${JSON.stringify(operation)} is not admitted by the current successor boundary.`, {
    failureClass: "operation_unsupported",
    correctiveGuidance: "Use only the successor manifest operations; later owner Work Items add semantic capabilities.",
    evidence: { supported_operations: SUPPORTED_OPERATIONS, requested_operation: operation ?? null },
  });
}
