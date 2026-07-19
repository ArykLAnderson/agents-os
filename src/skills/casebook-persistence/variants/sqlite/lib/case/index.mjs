import { createHash } from "node:crypto";
import {
  failure,
  RETRY_DISPOSITIONS,
  success,
  unsupported,
} from "../../../../shared/protocol.mjs";
import { invokeSubstrateOperation } from "../substrate/index.mjs";
import {
  canonicalCommitRequestDigest,
  mechanicalDigest,
} from "../substrate/mechanical.mjs";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const uuidId = (prefix) => new RegExp(`^${prefix}:${UUID}$`);
const CASE_REPRESENTATION = Object.freeze({ id: "case-minimal", version: 1 });
const CASE_FIELDS = new Set(["id", "home_namespace_id", "state", "title", "summary", "scope"]);
const CONTEXT_FIELDS = new Set(["view_id", "view_policy_revision_id", "purpose", "requested_audience_ceiling"]);
const CREATE_REQUEST_FIELDS = new Set([
  "protocol", "operation", "request_version", "operation_id", "store_id", "context",
  "expected_revision", "commit_basis", "provenance", "case", "configuration",
]);
const READ_REQUEST_FIELDS = new Set([
  "protocol", "operation", "request_version", "store_id", "context", "case_id", "configuration",
]);

class CaseRequestError extends Error {
  constructor(path, rule, message) {
    super(message);
    this.path = path;
    this.rule = rule;
  }
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new CaseRequestError(`${path}.${key}`, "field_unsupported", "Field is outside the exact L-01 Case request shape.");
  }
}

function requiredString(value, path, max = 16_384) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    throw new CaseRequestError(path, "required_bounded_string", "A non-empty bounded string is required.");
  }
  return value;
}

function requiredId(value, path, prefix) {
  requiredString(value, path, 128);
  if (!uuidId(prefix).test(value)) throw new CaseRequestError(path, "uuid_identity_required", `A lowercase UUID-based ${prefix}: identity is required.`);
  return value;
}

function validateContext(value) {
  if (!object(value)) throw new CaseRequestError("context", "view_context_required", "An exact view context is required.");
  exactKeys(value, CONTEXT_FIELDS, "context");
  requiredId(value.view_id, "context.view_id", "view");
  requiredId(value.view_policy_revision_id, "context.view_policy_revision_id", "view-policy");
  requiredString(value.purpose, "context.purpose", 512);
  if (value.requested_audience_ceiling != null && value.requested_audience_ceiling !== "private") {
    throw new CaseRequestError("context.requested_audience_ceiling", "audience_ceiling_invalid", "L-01 permits only the private audience ceiling.");
  }
}

function validateCommonCreate(request) {
  exactKeys(request, CREATE_REQUEST_FIELDS, "request");
  if (request.request_version !== 1) throw new CaseRequestError("request_version", "version_incompatible", "request_version must be 1.");
  requiredString(request.operation_id, "operation_id", 256);
  requiredId(request.store_id, "store_id", "store");
  if (request.expected_revision !== 0) throw new CaseRequestError("expected_revision", "create_requires_absent_revision", "Case create requires expected_revision 0.");
  requiredString(request.commit_basis, "commit_basis", 2_048);
  validateContext(request.context);
}

function normalizeCase(value) {
  if (!object(value)) throw new CaseRequestError("case", "object_required", "case must be an object.");
  exactKeys(value, CASE_FIELDS, "case");
  const normalized = {
    id: requiredId(value.id, "case.id", "case"),
    home_namespace_id: requiredId(value.home_namespace_id, "case.home_namespace_id", "namespace"),
    state: value.state,
    title: requiredString(value.title, "case.title", 512),
    summary: requiredString(value.summary, "case.summary", 4_096),
    scope: requiredString(value.scope, "case.scope", 16_384),
  };
  if (normalized.state !== "active") {
    throw new CaseRequestError("case.state", "create_requires_active_case", "The minimal create operation accepts only an active Case.");
  }
  return normalized;
}

function provenance(request) {
  const supplied = request.provenance;
  if (supplied != null && !object(supplied)) throw new CaseRequestError("provenance", "object_required", "provenance must be an object when present.");
  const result = { commit_basis: request.commit_basis };
  for (const key of ["causation", "correlation", "session", "acting_role", "authority_basis"]) {
    if (supplied?.[key] != null) result[key] = requiredString(supplied[key], `provenance.${key}`, 512);
  }
  if (supplied) exactKeys(supplied, new Set(["causation", "correlation", "session", "acting_role", "authority_basis"]), "provenance");
  return result;
}

function semanticCreateDigest(request, normalized) {
  return mechanicalDigest({
    operation: "case.create",
    request_version: 1,
    store_id: request.store_id,
    context: request.context,
    operation_id: request.operation_id,
    expected_revision: 0,
    commit_basis: request.commit_basis,
    provenance: request.provenance ?? {},
    case: normalized,
  });
}

function allocatedUuid(seed) {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function allocate(prefix, request, semanticDigest, role) {
  return `${prefix}:${allocatedUuid(`${request.store_id}\u0000case\u0000${request.operation_id}\u0000${semanticDigest}\u0000${role}`)}`;
}

function assembleCaseCreateEnvelope(request, normalized) {
  const semanticDigest = semanticCreateDigest(request, normalized);
  const allocations = {
    case_version_id: allocate("version", request, semanticDigest, "case-version"),
    revision_id: allocate("owner-revision", request, semanticDigest, "owner-revision"),
    event_id: allocate("event", request, semanticDigest, "event"),
    outbox_id: allocate("outbox", request, semanticDigest, "outbox"),
  };
  const content = {
    schema: "case-profile@1",
    ...normalized,
  };
  const eventPayload = {
    schema: "case-change@1",
    change: "created",
    case_id: normalized.id,
    changed_family_ids: [normalized.id],
    allocated_version_ids: [allocations.case_version_id],
  };
  const outboxPayload = {
    schema: "case-projection-work@1",
    case_id: normalized.id,
    revision_id: allocations.revision_id,
  };
  const envelope = {
    envelope_version: 1,
    operation_id: request.operation_id,
    store_id: request.store_id,
    request_digest: "0".repeat(64),
    owner: { id: normalized.id, kind: "case", home_namespace_id: normalized.home_namespace_id },
    expected_revision: 0,
    representation: CASE_REPRESENTATION,
    revision: {
      id: allocations.revision_id,
      number: 1,
      normalized: {
        schema: "case-minimal-selection@1",
        semantic_request_digest: semanticDigest,
        case_family_id: normalized.id,
        case_version_id: allocations.case_version_id,
      },
      versions: [{
        family_id: normalized.id,
        version_id: allocations.case_version_id,
        content,
        content_digest: mechanicalDigest(content),
      }],
      selections: [{ family_id: normalized.id, version_id: allocations.case_version_id }],
    },
    current_projection: {
      schema: "case-current@1",
      id: normalized.id,
      home_namespace_id: normalized.home_namespace_id,
      state: normalized.state,
      title: normalized.title,
      summary: normalized.summary,
      case_version_id: allocations.case_version_id,
    },
    event: {
      id: allocations.event_id,
      type: "case.revision.committed",
      schema_version: 1,
      visibility_ceiling: "private",
      payload: eventPayload,
      payload_digest: mechanicalDigest(eventPayload),
    },
    outbox: [{
      id: allocations.outbox_id,
      kind: "case.current_projection.refresh",
      payload: outboxPayload,
      payload_digest: mechanicalDigest(outboxPayload),
    }],
    provenance: provenance(request),
  };
  envelope.request_digest = canonicalCommitRequestDigest(request.store_id, request.context, envelope);
  return { envelope, allocations, semanticDigest };
}

function caseTypedId(prefix, mechanicalId) {
  return `${prefix}:${mechanicalId.slice(mechanicalId.indexOf(":") + 1)}`;
}

function typedFailure(operation, result) {
  const source = result.failure;
  const common = {
    retryDisposition: source.retry_disposition,
    correctiveGuidance: source.corrective_guidance,
  };
  if (source.code === "not_visible") {
    return failure("case.not_found_or_not_visible", "The Case is unknown or not visible under the exact view.", {
      ...common, failureClass: "case.read_failure", evidence: {},
    });
  }
  if (source.code === "revision_conflict") {
    return failure("case.create_identity_exists", "The Case identity already has a current revision.", {
      ...common,
      failureClass: "case.mutation_conflict",
      evidence: {
        current_revision: source.evidence?.current_revision?.id
          ? {
              id: caseTypedId("case-revision", source.evidence.current_revision.id),
              number: source.evidence.current_revision.number,
            }
          : source.evidence?.current_revision ?? null,
      },
    });
  }
  const mapped = {
    idempotency_mismatch: "case.idempotency_mismatch",
    identity_conflict: "case.identity_conflict",
    view_invalid: "case.view_invalid_or_unavailable",
  }[source.code] ?? "case.substrate_failure";
  const safeEvidence = source.code === "idempotency_mismatch"
    ? { operation_id: source.evidence?.operation_id ?? null }
    : {};
  return failure(mapped, `The typed Case ${operation} operation did not complete.`, {
    ...common,
    failureClass: mapped,
    evidence: safeEvidence,
  });
}

function invalidCase(error) {
  return failure("case.invalid_representation", "The minimal Case request is structurally invalid.", {
    failureClass: "case.invalid_representation",
    retryDisposition: RETRY_DISPOSITIONS.NEVER,
    correctiveGuidance: "Correct the typed Case request; do not construct or submit a mechanical envelope.",
    evidence: { violations: [{ path: error.path, rule: error.rule }] },
  });
}

function hydrateCase(mechanical) {
  const revision = mechanical.revision;
  if (revision.representation?.id !== CASE_REPRESENTATION.id || revision.representation?.version !== CASE_REPRESENTATION.version) {
    throw new CaseRequestError("stored.representation", "representation_incompatible", "Stored Case representation is incompatible.");
  }
  const normalized = revision.normalized;
  const selected = revision.selected_versions;
  if (normalized?.schema !== "case-minimal-selection@1" || !Array.isArray(selected) || selected.length !== 1) {
    throw new CaseRequestError("stored.selection", "selection_incomplete", "Stored Case selection is incomplete.");
  }
  const version = selected[0];
  if (version.family_id !== mechanical.owner.id
    || version.version_id !== normalized.case_version_id
    || version.content_digest !== mechanicalDigest(version.content)
    || version.content?.schema !== "case-profile@1") {
    throw new CaseRequestError("stored.case_version", "version_inconsistent", "Stored Case version is inconsistent.");
  }
  const { schema: _schema, ...caseState } = version.content;
  return {
    status: "found",
    case: caseState,
    revision: {
      id: caseTypedId("case-revision", revision.id),
      number: revision.number,
      committed_at: revision.committed_at,
      version_ids: { case: caseTypedId("case-version", version.version_id) },
    },
    applied_view: mechanical.applied_view,
  };
}

function caseCreateReceipt(mechanicalReceipt, normalized, allocations) {
  return {
    operation_id: mechanicalReceipt.operation_id,
    operation: "case.create",
    store_id: mechanicalReceipt.store_id,
    case_id: normalized.id,
    request_digest: mechanicalReceipt.request_digest,
    expected_revision: 0,
    committed_revision: { id: caseTypedId("case-revision", allocations.revision_id), number: 1 },
    outcome: "committed",
    event_id: allocations.event_id,
    result_digest: mechanicalReceipt.result_digest,
    settled_at: mechanicalReceipt.settled_at,
    retry_disposition: mechanicalReceipt.retry_disposition,
    operation_fence: mechanicalReceipt.operation_fence,
  };
}

async function createCase(request) {
  validateCommonCreate(request);
  const normalized = normalizeCase(request.case);
  const { envelope, allocations } = assembleCaseCreateEnvelope(request, normalized);
  const mechanical = await invokeSubstrateOperation({
    operation: "commit_owner_revision",
    configuration: request.configuration,
    context: request.context,
    envelope,
  });
  if (!mechanical?.ok) return typedFailure("create", mechanical);
  return success("case.create", {
    status: "settled",
    case: normalized,
    revision: {
      id: caseTypedId("case-revision", allocations.revision_id),
      number: 1,
      committed_at: mechanical.result.receipt.settled_at,
      version_ids: { case: caseTypedId("case-version", allocations.case_version_id) },
    },
    event_id: allocations.event_id,
    receipt: caseCreateReceipt(mechanical.result.receipt, normalized, allocations),
    idempotent_replay: mechanical.result.idempotent_replay,
    applied_view: mechanical.result.applied_view,
  });
}

async function readCase(request) {
  exactKeys(request, READ_REQUEST_FIELDS, "request");
  if (request.request_version !== 1) throw new CaseRequestError("request_version", "version_incompatible", "request_version must be 1.");
  const caseId = requiredId(request.case_id, "case_id", "case");
  requiredId(request.store_id, "store_id", "store");
  validateContext(request.context);
  const mechanical = await invokeSubstrateOperation({
    operation: "read_owner_current",
    configuration: request.configuration,
    store_id: request.store_id,
    context: request.context,
    owner: { id: caseId, kind: "case" },
  });
  if (!mechanical?.ok) return typedFailure("read", mechanical);
  try {
    return success("case.read", hydrateCase(mechanical.result));
  } catch (error) {
    return failure("case.stored_representation_incompatible", "The stored Case cannot be hydrated through Case representation version 1.", {
      failureClass: "case.stored_representation_incompatible",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      evidence: { violations: [{ path: error.path ?? "stored", rule: error.rule ?? "incompatible" }] },
    });
  }
}

export async function invokeCaseOperation(request) {
  try {
    if (request.operation === "case.create") return await createCase(request);
    if (request.operation === "case.read") return await readCase(request);
    return unsupported(request.operation);
  } catch (error) {
    if (error instanceof CaseRequestError) return invalidCase(error);
    return failure("case.internal_failure", "The typed Case operation failed without exposing owner state.", {
      failureClass: "case.internal_failure",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      evidence: {},
    });
  }
}
