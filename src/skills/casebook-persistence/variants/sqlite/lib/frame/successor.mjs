import { createHash } from "node:crypto";
import { completeFrameResourceDelta, applyFrameResourceMask, deterministicFrameResourceId, frameResourceFromHydrated } from "./resources/complete.mjs";
import { assembleFrameEnvelope, hydrateFrame, normalizeFrame } from "./index.mjs";
import { createPlacementGenerationFoundation, createSuccessorSqlitePlacementAdapter } from "../placement/index.mjs";
import { authorizeSuccessorOperation, invokeSuccessorMechanicalOperation, successorDigest } from "../substrate/mechanical-successor.mjs";
import { mechanicalDigest } from "../substrate/mechanical.mjs";
import { failure, RETRY_DISPOSITIONS, success, unsupported } from "../../../../shared/protocol.mjs";
import { inspectSuccessorStore } from "../substrate/bootstrap.mjs";
import { selectSqliteBinary } from "../substrate/diagnostics.mjs";

const ID = /^[a-z][a-z0-9_-]*:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const FRAME_COMMON_FIELDS = ["protocol", "operation", "request_version", "store_id", "admission_slot_id", "admission", "configuration"];
export const FRAME_OPERATION_FIELDS = new Map([
  ["frame.create", new Set([...FRAME_COMMON_FIELDS, "operation_id", "expected_revision", "commit_basis", "provenance", "frame", "placement"])],
  ["frame.commit_revision", new Set([...FRAME_COMMON_FIELDS, "operation_id", "expected_revision", "commit_basis", "provenance", "frame_id", "frame", "placement"])],
  ["frame.read", new Set([...FRAME_COMMON_FIELDS, "frame_id", "revision_id"])],
  ["frame.profile.read", new Set([...FRAME_COMMON_FIELDS, "resource_id", "owner_revision_id"])],
  ["frame.profile.update", new Set([...FRAME_COMMON_FIELDS, "operation_id", "if_match_revision_id", "commit_basis", "provenance", "placement", "resource_id", "changes"])],
  ["frame.discovery.create", new Set([...FRAME_COMMON_FIELDS, "operation_id", "if_match_revision_id", "commit_basis", "provenance", "placement", "frame_id", "resource_id", "discovery"])],
  ["frame.discovery.read", new Set([...FRAME_COMMON_FIELDS, "resource_id", "owner_revision_id"])],
  ["frame.discovery.update", new Set([...FRAME_COMMON_FIELDS, "operation_id", "if_match_revision_id", "commit_basis", "provenance", "placement", "resource_id", "changes"])],
  ["frame.discovery.settle", new Set([...FRAME_COMMON_FIELDS, "operation_id", "if_match_revision_id", "commit_basis", "provenance", "placement", "resource_id", "resolution", "disposition"])],
  ["frame.discovery.tombstone", new Set([...FRAME_COMMON_FIELDS, "operation_id", "if_match_revision_id", "commit_basis", "provenance", "placement", "resource_id"])],
  ["frame.discovery.reopen", new Set([...FRAME_COMMON_FIELDS, "operation_id", "if_match_revision_id", "commit_basis", "provenance", "placement", "resource_id", "reopened_from_version", "reopening_basis", "category"])],
  ["frame.disposition_boundary.read", new Set([...FRAME_COMMON_FIELDS, "resource_id", "owner_revision_id"])],
  ["frame.disposition_boundary.create", new Set([...FRAME_COMMON_FIELDS, "operation_id", "if_match_revision_id", "commit_basis", "provenance", "placement", "frame_id", "resource_id", "disposition_boundary", "case_dispositions"])],
  ["frame.disposition_boundary.update", new Set([...FRAME_COMMON_FIELDS, "operation_id", "if_match_revision_id", "commit_basis", "provenance", "placement", "resource_id", "changes"])],
  ["frame.disposition_boundary.close", new Set([...FRAME_COMMON_FIELDS, "operation_id", "if_match_revision_id", "commit_basis", "provenance", "placement", "resource_id"])],
  ["frame.case_disposition.read", new Set([...FRAME_COMMON_FIELDS, "resource_id", "owner_revision_id"])],
  ["frame.case_disposition.create", new Set([...FRAME_COMMON_FIELDS, "operation_id", "if_match_revision_id", "commit_basis", "provenance", "placement", "frame_id", "resource_id", "case_disposition"])],
  ["frame.case_disposition.update", new Set([...FRAME_COMMON_FIELDS, "operation_id", "if_match_revision_id", "commit_basis", "provenance", "placement", "resource_id", "changes"])],
  ["frame.case_disposition.classify", new Set([...FRAME_COMMON_FIELDS, "operation_id", "if_match_revision_id", "commit_basis", "provenance", "placement", "resource_id", "disposition", "rationale", "no_case_reason", "case_id", "case_operation_id", "affected_case_entry_display_ids"])],
  ["frame.case_disposition.settle", new Set([...FRAME_COMMON_FIELDS, "operation_id", "if_match_revision_id", "commit_basis", "provenance", "placement", "resource_id", "observed_case_revision_id", "pinned_case_revision_id"])],
]);
function exact(value, fields, path) { if (!object(value) || Object.keys(value).some((key) => !fields.has(key))) throw new SuccessorFrameError(path, "field_unsupported"); }

export class SuccessorFrameError extends Error {
  constructor(path, rule) { super(rule); this.path = path; this.rule = rule; }
}
function id(value, path, prefix) {
  if (typeof value !== "string" || !ID.test(value) || (prefix && !value.startsWith(`${prefix}:`))) throw new SuccessorFrameError(path, "uuid_identity_required");
  return value;
}
function uuid(seed) {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function allocated(prefix, request, role) { return `${prefix}:${uuid(`${request.store_id}\0${request.frame.id}\0${request.operation_id}\0${role}`)}`; }

function placementFor(request, prior = null) {
  const supplied = request.placement;
  if (!object(supplied)) throw new SuccessorFrameError("placement", "placement_required");
  if (Object.keys(supplied).length === 1 && supplied.namespace_id) {
    const namespace_id = id(supplied.namespace_id, "placement.namespace_id", "namespace");
    return {
      namespace_id,
      placement_family_id: prior?.placement?.placement_family_id ?? allocated("placement-family", request, "placement-family"),
      placement_version_id: prior?.placement?.namespace_id === namespace_id ? prior.placement.placement_version_id : allocated("version", request, "placement-version"),
      predecessor_version_id: prior?.placement?.namespace_id === namespace_id ? prior.placement.predecessor_version_id ?? null : prior?.placement?.placement_version_id ?? null,
      origin: { schema: "frame-placement-origin@1", operation_id: request.operation_id },
      provenance: { commit_basis: request.commit_basis },
    };
  }
  if (Object.keys(supplied).sort().join("\0") !== "chat_id\0chat_revision_id") throw new SuccessorFrameError("placement", "field_unsupported");
  const chat_id = id(supplied.chat_id, "placement.chat_id", "chat");
  const chat_revision_id = id(supplied.chat_revision_id, "placement.chat_revision_id", "owner-revision");
  const reuse = prior?.placement && prior?.placement_selection?.kind === "chat_default"
    && prior.placement_selection.chat_id === chat_id && prior.placement_selection.chat_revision_id === chat_revision_id;
  return {
    chat_id, chat_revision_id,
    placement_family_id: reuse ? prior.placement.placement_family_id : (prior?.placement?.placement_family_id ?? allocated("placement-family", request, "placement-family")),
    placement_version_id: reuse ? prior.placement.placement_version_id : allocated("version", request, "placement-version"),
    predecessor_version_id: reuse ? prior.placement.predecessor_version_id ?? null : prior?.placement?.placement_version_id ?? null,
    origin: { schema: "frame-placement-origin@1", operation_id: request.operation_id },
    provenance: { commit_basis: request.commit_basis },
  };
}

// The predecessor normalizer is used only to validate the complete selected
// Frame. Placement supplies the former namespace field and it is removed from
// every successor version, projection, and query artifact below.
function frameForNormalization(frame, namespaceId) {
  const value = structuredClone(frame);
  value.home_namespace_id ??= namespaceId;
  return value;
}
function searchableResource(resource) {
  if (resource.resource_kind === "frame") {
    const profile = resource.projection.profile;
    return { status: profile.status, title: profile.title ?? null, outcome: profile.outcome ?? null, included_scope: profile.included_scope ?? [], excluded_scope: profile.excluded_scope ?? [], limitations: profile.limitations ?? null, completion_condition: profile.completion_condition ?? null };
  }
  const value = resource.projection.version;
  if (resource.resource_kind === "discovery") return { lifecycle: value.lifecycle, category: value.category, title: value.title, body: value.body, human_authority: value.human_authority };
  if (resource.resource_kind === "disposition_boundary") return { closure: value.closure, title: value.title ?? null, basis: value.basis ?? null };
  return { classification_state: value.classification_state, disposition: value.disposition ?? null, result_summary: value.result_summary, rationale: value.rationale ?? null, pending_reason: value.pending_reason ?? null, resume_condition: value.resume_condition ?? null, no_case_reason: value.no_case_reason ?? null };
}
function queryMaterial(frame, allocations) {
  const delta = completeFrameResourceDelta(frame, allocations);
  const documents = delta.resources
    .filter((resource) => resource.lifecycle === "active")
    .map((resource) => ({
      schema: "frame-resource-search@1", resource_id: resource.resource_id,
      resource_kind: resource.resource_kind, text: JSON.stringify(searchableResource(resource)),
    }))
    .sort((left, right) => left.resource_id.localeCompare(right.resource_id));
  const links = [];
  const add = (from, reference) => {
    if (!reference?.target_kind || !reference?.target_id) return;
    links.push({ from_resource_id: from, target_kind: reference.target_kind, target_id: reference.target_id, predicate: reference.predicate });
  };
  for (const key of ["case_links", "frame_links", "downstream_links"]) for (const link of frame[key] ?? []) add(frame.id, link);
  for (const item of frame.discovery ?? []) for (const link of item.dependencies ?? []) add(item.id, link);
  links.sort((left, right) => successorDigest(left).localeCompare(successorDigest(right)));
  return { documents, edges: links, digest: successorDigest({ documents, edges: links }) };
}

/**
 * Complete Frame aggregate assembly for the successor placement boundary.
 * It owns only Frame-local semantic selection and query material: the shared
 * placement foundation owns P/R fences and the one owner-neutral transaction.
 */
export function assembleSuccessorFrameEnvelope(request, priorPlacement = null) {
  const explicitNamespace = request.placement?.namespace_id;
  // Chat placement is resolved by the placement foundation; this temporary
  // validation identity never enters successor output.
  const placementNamespace = explicitNamespace ?? "namespace:00000000-0000-4000-8000-000000000000";
  const normalized = normalizeFrame(frameForNormalization(request.frame, placementNamespace), { requireDispositionSets: true });
  if (explicitNamespace != null && normalized.home_namespace_id !== explicitNamespace) throw new SuccessorFrameError("frame.home_namespace_id", "placement_namespace_mismatch");
  if (1 + normalized.discovery.length + (normalized.disposition_boundaries?.length ?? 0) + (normalized.case_dispositions?.length ?? 0) > 256) throw new SuccessorFrameError("frame", "resource_count_exceeded");
  const legacy = assembleFrameEnvelope({ ...request, frame: normalized }, normalized);
  const versions = legacy.envelope.revision.versions.map((version) => {
    const content = structuredClone(version.content);
    if (version.family_id === normalized.id) delete content.home_namespace_id;
    return { ...version, content, content_digest: successorDigest(content) };
  });
  const successorFrame = structuredClone(normalized); delete successorFrame.home_namespace_id;
  const projection = structuredClone(legacy.envelope.current_projection); delete projection.home_namespace_id;
  const query = queryMaterial(normalized, legacy.allocations);
  return {
    normalized,
    allocations: legacy.allocations,
    placement: placementFor(request, priorPlacement),
    aggregate: {
      normalized: {
        schema: "frame-canonical-successor-selection@1",
        representation: legacy.envelope.representation,
        frame: successorFrame,
        frame_family_id: normalized.id,
        frame_version_id: legacy.allocations.frame_version_id,
        discovery_selections: legacy.allocations.discovery_item_version_ids,
        disposition_boundary_selections: legacy.allocations.disposition_boundary_version_ids,
        case_disposition_selections: legacy.allocations.case_disposition_version_ids,
      },
      current_projection: projection,
      versions,
      selections: structuredClone(legacy.envelope.revision.selections),
      outbox: structuredClone(legacy.envelope.outbox),
      query,
    },
  };
}

// Successor Frame operations deliberately use the same owner-neutral P/R
// foundation as Case.  The legacy Frame service is not consulted: successor
// reads hydrate its own canonical selection and every mutation settles one
// Frame receipt in the substrate transaction.
async function frameBinding(request) {
  const fields = FRAME_OPERATION_FIELDS.get(request.operation);
  if (!fields) throw new SuccessorFrameError("operation", "operation_unsupported");
  // This exact envelope check and provider-derived Profile gate precede every
  // resolver/read/receipt/disclosure/write path in the Frame adapter.
  exact(request, fields, "request");
  id(request.store_id, "store_id", "store"); id(request.admission_slot_id, "admission_slot_id", "admission-slot");
  if (!object(request.admission)) throw new SuccessorFrameError("admission", "object_required");
  const authorized = await authorizeSuccessorOperation(request, request.operation, "frame");
  if (!authorized.ok) throw Object.assign(new SuccessorFrameError("admission", authorized.failure?.code ?? "profile_guard_denied"), { admissionFailure: authorized });
  return { configuration: request.configuration, store_id: request.store_id, admission_slot_id: request.admission_slot_id, admission: request.admission, mechanical_options: undefined };
}
async function frameMechanicalBinding(request) { const value = await frameBinding(request); delete value.mechanical_options; return value; }
function frameRevision(value, path = "revision_id") { return id(value, path, "frame-revision").replace("frame-revision:", "owner-revision:"); }
function typedFrameRevision(value) { return `frame-revision:${value.slice(value.indexOf(":") + 1)}`; }
function invalidFrame(error) { return failure("frame.invalid_representation", "The complete Frame representation is structurally invalid.", { failureClass: "frame.invalid_representation", retryDisposition: RETRY_DISPOSITIONS.NEVER, evidence: { violations: [{ path: error.path ?? "frame", rule: error.rule ?? "invalid" }] } }); }
function frameFailure(operation, result) {
  const source = result?.failure ?? {};
  if (source.code === "not_visible") return failure("frame.not_found_or_not_visible", "The Frame is unknown or not visible.", { failureClass: "frame.read_failure", evidence: {} });
  if (source.code === "revision_conflict") return failure(operation === "frame.create" ? "frame.create_identity_exists" : "frame.revision_conflict", "The expected Frame revision is no longer current.", { failureClass: "frame.mutation_conflict", retryDisposition: source.retry_disposition, evidence: source.evidence ?? {} });
  return failure(source.code === "idempotency_mismatch" ? "frame.idempotency_mismatch" : "frame.substrate_failure", "The Frame adapter could not settle the atomic owner revision.", { failureClass: source.failureClass ?? "frame.substrate_failure", retryDisposition: source.retry_disposition, evidence: source.evidence ?? {} });
}

// hydrateFrame predates the successor's explicit placement family.  Adapt the
// stored successor selection at this boundary only; placement remains outside
// semantic Frame content and is never re-persisted by this conversion.
function hydrateSuccessorFrame(raw) {
  const normalized = raw.normalized;
  if (normalized?.schema !== "frame-canonical-successor-selection@1") throw new SuccessorFrameError("stored.normalized.schema", "representation_incompatible");
  const placement = raw.placement_history?.placement ?? raw.current_projection?._mechanical_placement;
  if (!placement?.namespace_id) throw new SuccessorFrameError("stored.placement", "placement_unavailable");
  const placementFamily = raw.placement_history?.placement_family_id ?? placement.placement_family_id;
  const selected = raw.selected_versions.filter((version) => version.family_id !== placementFamily).map((version) => {
    const value = structuredClone(version);
    if (value.family_id === normalized.frame_family_id) {
      value.content.home_namespace_id = placement.namespace_id;
      value.content_digest = mechanicalDigest(value.content);
    }
    return value;
  });
  const legacy = hydrateFrame({
    owner: raw.owner,
    revision: { id: raw.revision_id, number: raw.revision_number, committed_at: raw.committed_at, normalized: { ...normalized, schema: "frame-canonical-selection@3" }, representation: normalized.representation, selected_versions: selected },
    applied_view: null,
  });
  legacy.placement = placement;
  legacy.placement_selection = raw.placement_history?.placement_selection ?? null;
  return legacy;
}
async function rawFrame(request, frameId, revisionId = null) {
  const result = await invokeSuccessorMechanicalOperation({ operation: revisionId ? "substrate.read_owner_revision" : "substrate.read_owner_current", ...await frameMechanicalBinding(request), owner: { id: frameId, kind: "frame" }, ...(revisionId ? { revision_id: revisionId } : {}) });
  if (!result.ok || result.result.status !== "visible") return null;
  return { raw: result.result, hydrated: hydrateSuccessorFrame(result.result) };
}
async function selectedFramePlacement(request, placement) {
  if (placement?.namespace_id) return { namespace_id: id(placement.namespace_id, "placement.namespace_id", "namespace") };
  if (placement?.chat_id && placement?.chat_revision_id) return { chat_id: id(placement.chat_id, "placement.chat_id", "chat"), chat_revision_id: id(placement.chat_revision_id, "placement.chat_revision_id", "owner-revision") };
  throw new SuccessorFrameError("placement", "placement_required");
}
async function defaultFrameCreatePlacement(request) {
  const binary = await selectSqliteBinary();
  const state = await inspectSuccessorStore(binary.path, request.configuration?.sqlite?.database_url);
  if (state.status !== "available" || !state.bootstrap?.root_namespace_id) throw new SuccessorFrameError("placement", "placement_unavailable");
  return { namespace_id: state.bootstrap.root_namespace_id };
}
async function framePlacementForMutation(request, port) {
  if (request.placement != null) return selectedFramePlacement(request, request.placement);
  if (request.operation === "frame.create") return defaultFrameCreatePlacement(request);
  const current = await port.readCurrent({ owner: { id: request.frame.id, kind: "frame" } });
  if (!current.placement) throw new SuccessorFrameError("placement", "placement_unavailable");
  const history = await port.readRevision({ owner: { id: request.frame.id, kind: "frame" }, revision_id: current.revision_id });
  return history?.placement_selection?.kind === "chat_default"
    ? { chat_id: history.placement_selection.chat_id, chat_revision_id: history.placement_selection.chat_revision_id }
    : { namespace_id: current.placement.namespace_id };
}
function publicFrame(loaded) { return { ...loaded.hydrated, revision: { ...loaded.hydrated.revision, id: typedFrameRevision(loaded.hydrated.revision.id) }, placement: loaded.hydrated.placement }; }
function resourceKind(operation) { const parts = operation.split("."); return parts.length === 2 || parts[1] === "profile" ? "frame" : parts[1]; }
function resourcePrefix(kind) { return kind === "frame" ? "frame" : kind === "discovery" ? "discovery" : kind === "disposition_boundary" ? "disposition-boundary" : "case-disposition"; }
function findFrameResource(frame, kind, resourceId) { return frameResourceFromHydrated({ frame }, kind, resourceId); }
function selectedComplete(frame) { return structuredClone(frame); }
function retainedPlacement(loaded) {
  const placement = loaded.hydrated.placement;
  if (loaded.hydrated.placement_selection?.kind === "chat_default") return { chat_id: loaded.hydrated.placement_selection.chat_id, chat_revision_id: loaded.hydrated.placement_selection.chat_revision_id };
  return { namespace_id: placement.namespace_id };
}
async function commitSuccessorFrame(request, base, next, frameId, placement) {
  const internal = { ...request, frame: next, expected_revision: base.hydrated.revision.number, placement, operation_id: request.operation_id };
  const built = assembleSuccessorFrameEnvelope(internal, { placement: base.hydrated.placement, placement_selection: base.hydrated.placement_selection });
  const settled = await createPlacementGenerationFoundation(createSuccessorSqlitePlacementAdapter(await frameBinding(request))).commit({ operation_id: request.operation_id, owner: { id: frameId, kind: "frame" }, expected_revision: base.hydrated.revision.number, revision_id: built.allocations.revision_id, event: built.allocations.event_id, placement: built.placement, aggregate: built.aggregate });
  return { built, settled };
}
function cleanTypedVersion(value, prefix, path) { return id(value, path, prefix).replace(`${prefix}:`, "version:"); }
async function invokeModularFrameOperation(request) {
  const supported = new Set(["frame.profile.read", "frame.profile.update", "frame.discovery.create", "frame.discovery.update", "frame.discovery.settle", "frame.discovery.tombstone", "frame.discovery.reopen", "frame.disposition_boundary.read", "frame.disposition_boundary.create", "frame.disposition_boundary.update", "frame.disposition_boundary.close", "frame.case_disposition.read", "frame.case_disposition.create", "frame.case_disposition.update", "frame.case_disposition.classify", "frame.case_disposition.settle"]);
  if (!supported.has(request.operation)) return null;
  if (request.request_version !== 1) throw new SuccessorFrameError("request_version", "version_incompatible");
  const kind = resourceKind(request.operation), action = request.operation.split(".").at(-1);
  const resourceId = request.resource_id == null ? null : id(request.resource_id, "resource_id", resourcePrefix(kind));
  if (action === "read") {
    const revisionId = request.owner_revision_id == null ? null : frameRevision(request.owner_revision_id, "owner_revision_id");
    let frameId = kind === "frame" ? resourceId : null;
    if (!frameId) {
      const bound = await invokeSuccessorMechanicalOperation({ operation: "substrate.resolve_family_binding", ...await frameMechanicalBinding(request), owner_kind: "frame", family_id: resourceId, selector: revisionId ? { owner_revision_id: revisionId } : { current: true } });
      if (!bound.ok || bound.result.status !== "found") return failure(`frame.${kind}.not_found_or_not_visible`, "The Frame resource is unknown or not visible.", { failureClass: "frame.read_failure", evidence: {} });
      frameId = bound.result.owner.id;
    }
    const loaded = await rawFrame(request, frameId, revisionId);
    const resource = loaded && findFrameResource(loaded.hydrated.frame, kind, resourceId);
    if (!resource || (!revisionId && kind === "discovery" && resource.lifecycle === "tombstoned")) return failure(`frame.${kind}.not_found_or_not_visible`, "The Frame resource is unknown or not visible.", { failureClass: "frame.read_failure", evidence: {} });
    return success(request.operation, { status: "found", resource, owner: { id: frameId, kind: "frame" }, revision: loaded.hydrated.revision, placement: loaded.hydrated.placement });
  }
  if (typeof request.operation_id !== "string" || !request.operation_id) throw new SuccessorFrameError("operation_id", "required_bounded_string");
  if (typeof request.commit_basis !== "string" || !request.commit_basis) throw new SuccessorFrameError("commit_basis", "required_bounded_string");
  const expected = frameRevision(request.if_match_revision_id, "if_match_revision_id");
  let frameId = request.frame_id == null ? (kind === "frame" ? resourceId : null) : id(request.frame_id, "frame_id", "frame");
  if (!frameId) {
    const bound = await invokeSuccessorMechanicalOperation({ operation: "substrate.resolve_family_binding", ...await frameMechanicalBinding(request), owner_kind: "frame", family_id: resourceId, selector: { owner_revision_id: expected } });
    if (!bound.ok || bound.result.status !== "found") return failure(`frame.${kind}.not_found_or_not_visible`, "The Frame resource is unknown or not visible.", { failureClass: "frame.mutation_failure", evidence: {} });
    frameId = bound.result.owner.id;
  }
  const base = await rawFrame(request, frameId, expected);
  if (!base) return failure(`frame.${kind}.not_found_or_not_visible`, "The Frame resource is unknown or not visible.", { failureClass: "frame.mutation_failure", evidence: {} });
  let next = selectedComplete(base.hydrated.frame);
  const collection = kind === "discovery" ? next.discovery : kind === "disposition_boundary" ? next.disposition_boundaries : kind === "case_disposition" ? next.case_dispositions : null;
  let returnedId = resourceId;
  if (kind === "frame") next = Object.assign(next, applyFrameResourceMask("frame", next, request.changes));
  else if (action === "create") {
    returnedId = resourceId ?? deterministicFrameResourceId({ ...request, frame_id: frameId }, kind);
    const supplied = structuredClone(request[kind]); if (!object(supplied)) throw new SuccessorFrameError(kind, "object_required");
    collection.push({ id: returnedId, ...supplied });
    if (kind === "case_disposition") {
      const boundary = next.disposition_boundaries.find((item) => item.id === supplied.boundary_id);
      if (!boundary) throw new SuccessorFrameError("case_disposition.boundary_id", "boundary_not_found");
      boundary.disposition_ids = [...boundary.disposition_ids, returnedId];
    }
    if (kind === "disposition_boundary" && Array.isArray(request.case_dispositions)) next.case_dispositions.push(...structuredClone(request.case_dispositions));
  } else {
    const index = collection.findIndex((item) => item.id === resourceId);
    if (index < 0) return failure(`frame.${kind}.not_found_or_not_visible`, "The Frame resource is unknown or not visible.", { failureClass: "frame.mutation_failure", evidence: {} });
    const prior = collection[index];
    if (action === "update") collection[index] = { ...prior, ...applyFrameResourceMask(kind, prior, request.changes) };
    else if (action === "settle" && kind === "discovery") collection[index] = { ...prior, lifecycle: "settled", category: "settled", resolution: request.resolution ?? prior.resolution, disposition: request.disposition ?? prior.disposition };
    else if (action === "tombstone") collection[index] = { ...prior, lifecycle: "tombstoned", category: "settled", resolution: prior.resolution ?? "tombstoned", disposition: prior.disposition ?? "tombstoned" };
    else if (action === "reopen") collection[index] = { ...prior, lifecycle: "active", category: request.category, reopened_from_version: request.reopened_from_version ?? prior.version_id, reopening_basis: request.reopening_basis, resolution: undefined, disposition: undefined };
    else if (action === "close") collection[index] = { ...prior, closure: "closed" };
    else if (action === "classify") {
      const classified = { ...prior, classification_state: "classified", disposition: request.disposition, rationale: request.rationale };
      for (const key of ["pending_reason", "resume_condition", "no_case_reason", "realization_state", "case_id", "case_operation_id", "affected_case_entry_display_ids", "observed_case_revision_id", "pinned_case_revision_id"]) delete classified[key];
      if (request.disposition === "no_case") classified.no_case_reason = request.no_case_reason;
      else Object.assign(classified, { realization_state: "awaiting_case", case_id: request.case_id, case_operation_id: request.case_operation_id, ...(request.affected_case_entry_display_ids ? { affected_case_entry_display_ids: request.affected_case_entry_display_ids } : {}) });
      collection[index] = classified;
    } else if (action === "settle" && kind === "case_disposition") collection[index] = { ...prior, realization_state: "settled", ...(request.observed_case_revision_id ? { observed_case_revision_id: request.observed_case_revision_id } : {}), ...(request.pinned_case_revision_id ? { pinned_case_revision_id: request.pinned_case_revision_id } : {}) };
  }
  const { built, settled } = await commitSuccessorFrame(request, base, next, frameId, await selectedFramePlacement(request, request.placement ?? retainedPlacement(base)));
  return success(request.operation, { status: "settled", resource: findFrameResource(next, kind, returnedId), owner: { id: frameId, kind: "frame" }, revision: { id: typedFrameRevision(settled.revision_id), number: settled.revision_number, version_ids: built.allocations }, receipt: settled.receipt, idempotent_replay: settled.receipt?.idempotent_replay === true, placement: settled.placement, placement_changed: settled.placement_changed, query_changed: settled.query_changed });
}

export async function invokeSuccessorFrameOperation(request) {
  try {
    // Bind the exact public operation before any version check, resolver,
    // receipt, read, disclosure, or mutation work.
    await frameBinding(request);
    const modular = await invokeModularFrameOperation(request); if (modular) return modular;
    if (request.operation === "frame.read") {
      const frameId = id(request.frame_id, "frame_id", "frame");
      const loaded = await rawFrame(request, frameId, request.revision_id == null ? null : frameRevision(request.revision_id));
      if (!loaded || loaded.hydrated.frame.status === "tombstoned") return failure("frame.not_found_or_not_visible", "The Frame is unknown or not visible.", { failureClass: "frame.read_failure", evidence: {} });
      return success("frame.read", publicFrame(loaded));
    }
    if (!new Set(["frame.create", "frame.commit_revision"]).has(request.operation)) return unsupported(request.operation);
    if (request.request_version !== 1 || !Number.isInteger(request.expected_revision) || request.expected_revision < 0) throw new SuccessorFrameError("expected_revision", "expected_revision_required");
    if (request.operation === "frame.create" && request.expected_revision !== 0) throw new SuccessorFrameError("expected_revision", "create_requires_absent_revision");
    if (request.operation === "frame.commit_revision" && request.frame_id !== request.frame?.id) throw new SuccessorFrameError("frame_id", "frame_identity_mismatch");
    if (typeof request.operation_id !== "string" || !request.operation_id || typeof request.commit_basis !== "string" || !request.commit_basis) throw new SuccessorFrameError("request", "required_bounded_string");
    let prior = null;
    if (request.expected_revision > 0) { const loaded = await rawFrame(request, request.frame.id); if (loaded?.hydrated.revision.number === request.expected_revision) prior = { placement: loaded.hydrated.placement, placement_selection: loaded.hydrated.placement_selection }; }
    const placement = await framePlacementForMutation(request, createSuccessorSqlitePlacementAdapter(await frameBinding(request)));
    const built = assembleSuccessorFrameEnvelope({ ...request, placement }, prior);
    const settled = await createPlacementGenerationFoundation(createSuccessorSqlitePlacementAdapter(await frameBinding(request))).commit({ operation_id: request.operation_id, owner: { id: built.normalized.id, kind: "frame" }, expected_revision: request.expected_revision, revision_id: built.allocations.revision_id, event: built.allocations.event_id, placement: built.placement, aggregate: built.aggregate });
    return success(request.operation, { status: "settled", frame: structuredClone(built.normalized), revision: { id: typedFrameRevision(settled.revision_id), number: settled.revision_number, version_ids: built.allocations }, event_id: built.allocations.event_id, receipt: settled.receipt, idempotent_replay: settled.receipt?.idempotent_replay === true, placement: settled.placement, placement_changed: settled.placement_changed, query_changed: settled.query_changed });
  } catch (error) {
    if (error?.admissionFailure) return error.admissionFailure;
    if (error instanceof SuccessorFrameError || error?.path) return invalidFrame(error);
    return frameFailure(request?.operation, { failure: { code: error?.code ?? "internal_failure", retry_disposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR } });
  }
}
