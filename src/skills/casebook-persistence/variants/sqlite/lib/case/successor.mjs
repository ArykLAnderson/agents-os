import { createHash } from "node:crypto";
import { failure, RETRY_DISPOSITIONS, success, unsupported } from "../../../../shared/protocol.mjs";
import { assemble, hydrate, normalizeCase } from "./index.mjs";
import {
  completeCaseResourceDelta, applyKnowledgeMask, applyCaseResourceMask,
  deterministicKnowledgeId, deterministicCaseResourceId, tombstoneKnowledgeVersion,
} from "./resources/complete.mjs";
import { createPlacementGenerationFoundation, createSuccessorSqlitePlacementAdapter } from "../placement/index.mjs";
import { authorizeSuccessorOperation, invokeSuccessorMechanicalOperation, successorDigest } from "../substrate/mechanical-successor.mjs";
import { canonicalContextRequestDigest, invokeContextOperation } from "../context/index.mjs";
import { normalizeExactLocator } from "../resource/normalization.mjs";

const ID = /^[a-z][a-z0-9_-]*:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const object = (value) => value && typeof value === "object" && !Array.isArray(value);

export class SuccessorCaseError extends Error {
  constructor(path, rule) { super(rule); this.path = path; this.rule = rule; }
}
function exact(value, fields, path) { if (!object(value) || Object.keys(value).some((key) => !fields.has(key))) throw new SuccessorCaseError(path, "field_unsupported"); }
function id(value, path, prefix) { if (typeof value !== "string" || !ID.test(value) || (prefix && !value.startsWith(`${prefix}:`))) throw new SuccessorCaseError(path, "uuid_identity_required"); return value; }
function text(value, path, max = 2048) { if (typeof value !== "string" || !value.trim() || value.length > max) throw new SuccessorCaseError(path, "required_bounded_string"); return value; }
function uuid(seed) { const bytes = createHash("sha256").update(seed).digest().subarray(0, 16); bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128; const value = bytes.toString("hex"); return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`; }
function allocated(prefix, request, role) { return `${prefix}:${uuid(`${request.store_id}\0${request.case.id}\0${request.operation_id}\0${role}`)}`; }
function typedCaseRevision(value) { return `case-revision:${value.slice(value.indexOf(":") + 1)}`; }
function mechanicalCaseRevision(value, path = "revision_id") { return id(value, path, "case-revision").replace("case-revision:", "owner-revision:"); }
function placementFor(request, prior = null) {
  const supplied = request.placement;
  if (object(supplied) && Object.keys(supplied).length === 1 && supplied.namespace_id) {
    const namespace_id = id(supplied.namespace_id, "placement.namespace_id", "namespace");
    return {
      namespace_id,
      placement_family_id: prior?.placement?.placement_family_id ?? allocated("placement-family", request, "placement-family"),
      placement_version_id: prior?.placement?.namespace_id === namespace_id ? prior.placement.placement_version_id : allocated("version", request, "placement-version"),
      predecessor_version_id: prior?.placement?.namespace_id === namespace_id ? prior.placement.predecessor_version_id ?? null : prior?.placement?.placement_version_id ?? null,
      origin: { schema: "case-placement-origin@1", operation_id: request.operation_id },
      provenance: { commit_basis: request.commit_basis },
    };
  }
  if (!object(supplied) || !["chat_id", "chat_id\u0000chat_revision_id", "chat_id\u0000chat_revision_id\u0000namespace_id"].includes(Object.keys(supplied).sort().join("\u0000"))) throw new SuccessorCaseError("placement", "field_unsupported");
  const chatId = id(supplied.chat_id, "placement.chat_id", "chat");
  // Public invocation always obtains this exact current Chat revision first.
  // The deterministic fallback keeps the pure envelope assembler total.
  const chatRevisionId = supplied.chat_revision_id == null ? allocated("owner-revision", request, "chat-revision") : id(supplied.chat_revision_id, "placement.chat_revision_id", "owner-revision");
  // Reuse an immutable placement selection only when the exact Chat revision
  // observed by the owner-neutral adapter is unchanged. A semantic-only Case
  // revision then leaves P untouched; a Chat rebind receives a fresh version.
  const reuse = prior?.placement && prior?.placement_selection?.kind === "chat_default"
    && prior.placement_selection.chat_id === chatId && prior.placement_selection.chat_revision_id === prior.chat_revision_id;
  return {
    chat_id: chatId,
    placement_family_id: reuse ? prior.placement.placement_family_id : (prior?.placement?.placement_family_id ?? allocated("placement-family", request, "placement-family")),
    chat_revision_id: chatRevisionId,
    placement_version_id: reuse ? prior.placement.placement_version_id : allocated("version", request, "placement-version"),
    predecessor_version_id: reuse ? prior.placement.predecessor_version_id ?? null : prior?.placement?.placement_version_id ?? null,
    origin: { schema: "case-placement-origin@1", operation_id: request.operation_id },
    provenance: { commit_basis: request.commit_basis },
  };
}
function legacyCaseForNormalization(caseValue, namespaceId) {
  // The predecessor normalizer still checks a legacy field.  It is supplied
  // only while validating the complete semantic selection and removed from
  // every retained successor projection below.
  const value = structuredClone(caseValue);
  value.home_namespace_id ??= namespaceId;
  return value;
}
function normalizedAlias(value) { return value.trim().normalize("NFC").toLocaleLowerCase("en-US"); }
function aliasFamily(caseId, value) { return `alias:${uuid(`${caseId}\0${normalizedAlias(value)}`)}`; }
function queryMaterial(normalized, allocations) {
  const delta = completeCaseResourceDelta(normalized, allocations);
  // Exact aliases are a resolver projection, not a shared search/ranking
  // document.  Keeping them in the same canonical material binds them to R.
  const claims = normalized.aliases.map((value) => ({ schema: "owner-exact-claim@1", claim_type: "case-alias", normalized_value: normalizedAlias(value) }));
  const documents = [...delta.resources.filter((resource) => resource.lifecycle === "active").map((resource) => ({
    resource_id: resource.resource_id, resource_kind: resource.resource_kind, search: resource.search,
  })), ...claims].sort((left, right) => successorDigest(left).localeCompare(successorDigest(right)));
  const edges = delta.relationships.map((edge) => ({ relationship_id: edge.relationship_id, source_resource_id: edge.source_resource_id, target: edge.target, predicate: edge.predicate, metadata: edge.metadata }))
    .sort((left, right) => left.relationship_id.localeCompare(right.relationship_id));
  return { documents, edges, digest: successorDigest({ documents, edges }) };
}

/**
 * Case-local complete-envelope assembler. It deliberately knows no SQL: the
 * owner-neutral placement adapter receives one opaque aggregate and publishes
 * Case versions, placement, canonical query documents, edges, event and
 * receipt in its single substrate transaction.
 */
export function assembleSuccessorCaseEnvelope(request, priorPlacement = null) {
  const placementNamespace = request.placement?.namespace_id ?? request.case?.home_namespace_id;
  const normalized = normalizeCase(legacyCaseForNormalization(request.case, placementNamespace), request.expected_revision);
  if (normalized.families.length + 1 > 256) throw new SuccessorCaseError("case", "resource_count_exceeded");
  const assembled = assemble(request, normalized);
  const aliasVersions = normalized.aliases.map((value) => {
    const family_id = aliasFamily(normalized.id, value);
    const content = { schema: "case-alias@1", family_id, state: "active", value, normalized_value: normalizedAlias(value), kind: "name" };
    const version_id = `version:${uuid(`${request.store_id}\0${request.operation_id}\0${family_id}\0alias-version`)}`;
    assembled.allocations.versionIds[family_id] = `case-version:${version_id.slice("version:".length)}`;
    return { family_id, version_id, content, content_digest: successorDigest(content) };
  });
  // The owner envelope has at most 256 selections: no more than 255
  // semantic selections (profile, resources, aliases) plus its placement.
  if (normalized.families.length + normalized.aliases.length + 1 > 255) throw new SuccessorCaseError("case", "resource_count_exceeded");
  const query = queryMaterial(normalized, assembled.allocations);
  const profileVersion = assembled.envelope.revision.versions.find((version) => version.family_id === normalized.id);
  delete profileVersion?.content?.home_namespace_id;
  if (profileVersion) profileVersion.content_digest = successorDigest(profileVersion.content);
  const successorCase = structuredClone(request.case); delete successorCase.home_namespace_id;
  const projection = structuredClone(assembled.envelope.current_projection); delete projection.home_namespace_id;
  const aggregate = {
    normalized: { ...assembled.envelope.revision.normalized, schema: "case-canonical-successor-selection@1", representation: assembled.envelope.representation, case: successorCase },
    current_projection: projection,
    versions: [...assembled.envelope.revision.versions, ...aliasVersions],
    selections: [...assembled.envelope.revision.selections, ...aliasVersions.map(({ family_id, version_id }) => ({ family_id, version_id }))],
    outbox: assembled.envelope.outbox,
    query,
  };
  return { normalized, allocations: assembled.allocations, aggregate, placement: placementFor(request, priorPlacement) };
}

function binding(request) {
  id(request.store_id, "store_id", "store"); id(request.workspace_id, "workspace_id", "workspace"); id(request.admission_slot_id, "admission_slot_id", "admission-slot");
  if (!object(request.admission)) throw new SuccessorCaseError("admission", "object_required");
  return { configuration: request.configuration, store_id: request.store_id, workspace_id: request.workspace_id, admission_slot_id: request.admission_slot_id, admission: request.admission, mechanical_options: undefined };
}
function mechanicalBinding(request) { const value = binding(request); delete value.mechanical_options; return value; }
function rawRevision(request, raw) {
  if (!raw?.normalized?.representation || !Array.isArray(raw.selected_versions)) throw new SuccessorCaseError("stored", "revision_selection_unavailable");
  const placementFamilyId = raw.placement_history?.placement_family_id ?? raw.current_projection?._mechanical_placement?.placement_family_id;
  const selectedVersions = raw.selected_versions.filter((version) => version.family_id !== placementFamilyId);
  const hydrated = hydrate({ owner: raw.owner, revision: { representation: raw.normalized.representation, normalized: raw.normalized, selected_versions: selectedVersions, id: raw.revision_id, number: raw.revision_number, committed_at: raw.committed_at }, applied_view: null });
  hydrated.placement = raw.placement_history?.placement ?? raw.current_projection?._mechanical_placement ?? null;
  hydrated.placement_selection = raw.placement_history?.placement_selection ?? null;
  return hydrated;
}
async function exactNamespace(request, namespaceId, namespacePath) {
  if (namespaceId != null) return id(namespaceId, "namespace_id", "namespace");
  if (!Array.isArray(namespacePath) || !namespacePath.length || namespacePath.length > 32) throw new SuccessorCaseError("namespace_path", "bounded_path_required");
  const port = mechanicalBinding(request);
  const contextRequest = { operation: "namespace.resolve", ...port, path: namespacePath };
  contextRequest.request_digest = canonicalContextRequestDigest(port.store_id, contextRequest);
  const resolved = await invokeContextOperation(contextRequest);
  if (!resolved.ok || resolved.result.status !== "found") return null;
  return resolved.result.namespace.id;
}
function invalid(error) { return failure("case.invalid_representation", "The complete Case representation is structurally invalid.", { failureClass: "case.invalid_representation", retryDisposition: RETRY_DISPOSITIONS.NEVER, evidence: { violations: [{ path: error.path ?? "case", rule: error.rule ?? "invalid" }] } }); }
function selectedCase(hydrated) {
  const record = structuredClone(hydrated.case), versions = hydrated.revision.version_ids;
  const selected = (item) => ({ id: item.id, state: item.state, selected_version_id: versions[item.id] });
  return { ...record, aliases: structuredClone(record.aliases), facets: record.facets.map(selected), entries: record.entries.map(selected), relationships: record.relationships.map(selected), sources: record.sources.map((source) => ({ ...selected(source), display_label: source.display_label, fragments: source.fragments.map(selected) })) };
}
function findResource(record, kind, resourceId) {
  if (kind === "case") return { id: record.id, state: record.state, version: { title: record.title, summary: record.summary, scope: record.scope, ...(record.provenance ? { provenance: record.provenance } : {}) } };
  if (kind === "evidence") for (const source of record.sources) { const item = source.fragments.find((value) => value.id === resourceId); if (item) return { ...structuredClone(item), source_id: source.id }; }
  const collection = kind === "knowledge" ? record.entries : kind === "facet" ? record.facets : kind === "source" ? record.sources : record.relationships;
  return structuredClone(collection?.find((value) => value.id === resourceId) ?? null);
}
async function currentChatPlacement(request, chatId) {
  const port = mechanicalBinding(request), context = { operation: "chat.read", ...port, chat_id: chatId };
  context.request_digest = canonicalContextRequestDigest(port.store_id, context);
  const result = await invokeContextOperation(context);
  const row = result.ok && result.result.status === "visible" ? result.result.revisions?.[0] : null;
  if (!row?.chat_revision_id || !row?.namespace_id) throw new SuccessorCaseError("placement.chat_id", "chat_not_visible");
  return { chat_id: chatId, chat_revision_id: row.chat_revision_id, namespace_id: row.namespace_id };
}
async function selectedPlacement(request, placement) {
  if (placement?.namespace_id) return { namespace_id: id(placement.namespace_id, "placement.namespace_id", "namespace") };
  if (placement?.chat_id) return currentChatPlacement(request, id(placement.chat_id, "placement.chat_id", "chat"));
  throw new SuccessorCaseError("placement", "placement_required");
}
async function rawCase(request, caseId, revisionId = null) {
  const result = await invokeSuccessorMechanicalOperation({ operation: revisionId ? "substrate.read_owner_revision" : "substrate.read_owner_current", ...mechanicalBinding(request), owner: { id: caseId, kind: "case" }, ...(revisionId ? { revision_id: revisionId } : {}) });
  if (!result.ok || result.result.status !== "visible") return null;
  return rawRevision(request, result.result);
}
async function retainedPlacement(request, caseId) {
  const current = await createSuccessorSqlitePlacementAdapter(binding(request)).readCurrent({ owner: { id: caseId, kind: "case" } });
  if (!current.placement?.namespace_id) throw new SuccessorCaseError("placement", "placement_unavailable");
  return current.placement.chat_id ? { chat_id: current.placement.chat_id } : { namespace_id: current.placement.namespace_id };
}
function typedFailure(operation, result) {
  const source = result?.failure ?? {};
  if (source.code === "not_visible") return failure("case.not_found_or_not_visible", "The Case is unknown or not visible.", { failureClass: "case.read_failure", evidence: {} });
  if (source.code === "revision_conflict") return failure(operation === "case.create" ? "case.create_identity_exists" : "case.revision_conflict", "The expected Case revision is no longer current.", { failureClass: "case.mutation_conflict", retryDisposition: source.retry_disposition, evidence: source.evidence ?? {} });
  return failure(source.code === "idempotency_mismatch" ? "case.idempotency_mismatch" : "case.substrate_failure", "The Case adapter could not settle the atomic owner revision.", { failureClass: source.failureClass ?? "case.substrate_failure", retryDisposition: source.retry_disposition, evidence: source.evidence ?? {} });
}

const CASE_COMMON_FIELDS = ["protocol", "operation", "request_version", "store_id", "workspace_id", "admission_slot_id", "admission", "configuration"];
const MODULAR_READ_FIELDS = new Set([...CASE_COMMON_FIELDS, "resource_id", "owner_revision_id"]);
const MODULAR_CREATE_FIELDS = (kind) => new Set([...CASE_COMMON_FIELDS, "operation_id", "case_id", "resource_id", "if_match_revision_id", "commit_basis", "provenance", "placement", kind, ...(kind === "evidence" ? ["source_id"] : [])]);
const MODULAR_UPDATE_FIELDS = new Set([...CASE_COMMON_FIELDS, "operation_id", "resource_id", "if_match_revision_id", "commit_basis", "provenance", "placement", "changes"]);
const MODULAR_TOMBSTONE_FIELDS = new Set([...CASE_COMMON_FIELDS, "operation_id", "resource_id", "if_match_revision_id", "commit_basis", "provenance", "placement", "reason", "replacement"]);
export const CASE_OPERATION_FIELDS = new Map([
  ["case.create", new Set([...CASE_COMMON_FIELDS, "operation_id", "expected_revision", "commit_basis", "provenance", "case", "placement"])],
  ["case.commit_revision", new Set([...CASE_COMMON_FIELDS, "operation_id", "expected_revision", "commit_basis", "provenance", "case", "placement"])],
  ["case.tombstone.commit", new Set([...CASE_COMMON_FIELDS, "operation_id", "expected_revision", "commit_basis", "provenance", "case", "placement"])],
  ["case.read", new Set([...CASE_COMMON_FIELDS, "case_id", "revision_id"])],
  ["case.resolve", new Set([...CASE_COMMON_FIELDS, "alias", "namespace_id", "namespace_path"])],
  ["case.update", MODULAR_UPDATE_FIELDS],
  ["case.tombstone", new Set([...CASE_COMMON_FIELDS, "operation_id", "resource_id", "if_match_revision_id", "commit_basis", "provenance", "placement", "reason"])],
  ["case.move_namespace", new Set([...CASE_COMMON_FIELDS, "operation_id", "resource_id", "if_match_revision_id", "commit_basis", "provenance", "placement"])],
  ...["knowledge", "facet", "source", "evidence", "relationship"].flatMap((kind) => [
    [`case.${kind}.read`, MODULAR_READ_FIELDS],
    [`case.${kind}.create`, MODULAR_CREATE_FIELDS(kind)],
    [`case.${kind}.update`, MODULAR_UPDATE_FIELDS],
    [`case.${kind}.tombstone`, MODULAR_TOMBSTONE_FIELDS],
  ]),
]);
const MODULAR_OPERATION_FIELDS = new Map([...CASE_OPERATION_FIELDS].filter(([operation]) => !["case.create", "case.commit_revision", "case.tombstone.commit", "case.read", "case.resolve"].includes(operation)));

async function invokeModularCaseOperation(request) {
  // Provider-local owner mutations are Case-family operations, unlike the
  // three-part subordinate resource operations.
  const segments = request.operation.split(".");
  const kind = segments.length === 2 ? "case" : segments[1];
  const action = segments.at(-1);
  const fields = MODULAR_OPERATION_FIELDS.get(request.operation);
  if (!fields) return null;
  // Reject a malformed public envelope before version checks, resolver reads,
  // receipt work, or any owner/resource identity can be disclosed.
  exact(request, fields, "request");
  const mutation = action !== "read";
  if (request.request_version !== 1) throw new SuccessorCaseError("request_version", "version_incompatible");
  const resourceId = request.resource_id == null ? null : id(request.resource_id, "resource_id", kind === "case" ? "case" : kind);
  if (action === "read") {
    const revisionId = request.owner_revision_id == null ? null : mechanicalCaseRevision(request.owner_revision_id, "owner_revision_id");
    let caseId = kind === "case" ? resourceId : null;
    if (!caseId) {
      const bound = await invokeSuccessorMechanicalOperation({ operation: "substrate.resolve_family_binding", ...mechanicalBinding(request), owner_kind: "case", family_id: resourceId, selector: revisionId ? { owner_revision_id: revisionId } : { current: true } });
      if (!bound.ok || bound.result.status !== "found") return failure(`case.${kind}.not_found_or_not_visible`, "The Case resource is unknown or not visible.", { failureClass: `case.${kind}.read_failure`, evidence: {} });
      caseId = bound.result.owner.id;
    }
    const loaded = await rawCase(request, caseId, revisionId);
    const resource = loaded && findResource(loaded.case, kind, resourceId);
    if (!resource || (!revisionId && resource.state !== "active")) return failure(`case.${kind}.not_found_or_not_visible`, "The Case resource is unknown or not visible.", { failureClass: `case.${kind}.read_failure`, evidence: {} });
    return success(request.operation, { status: "found", resource, owner: { id: caseId, kind: "case" }, revision: loaded.revision });
  }
  text(request.operation_id, "operation_id", 256); text(request.commit_basis, "commit_basis");
  const expected = mechanicalCaseRevision(request.if_match_revision_id, "if_match_revision_id");
  let caseId = request.case_id == null ? (kind === "case" ? resourceId : null) : id(request.case_id, "case_id", "case");
  if (!caseId) {
    const bound = await invokeSuccessorMechanicalOperation({ operation: "substrate.resolve_family_binding", ...mechanicalBinding(request), owner_kind: "case", family_id: resourceId, selector: { owner_revision_id: expected } });
    if (!bound.ok || bound.result.status !== "found") return failure(`case.${kind}.not_found_or_not_visible`, "The Case resource is unknown or not visible.", { failureClass: `case.${kind}.mutation_failure`, evidence: {} });
    caseId = bound.result.owner.id;
  }
  const base = await rawCase(request, caseId, expected);
  if (!base || base.case.state !== "active") return failure(`case.${kind}.not_found_or_not_visible`, "The Case resource is unknown or not visible.", { failureClass: `case.${kind}.mutation_failure`, evidence: {} });
  const next = selectedCase(base), prior = resourceId ? findResource(base.case, kind, resourceId) : null;
  const collection = kind === "knowledge" ? next.entries : kind === "facet" ? next.facets : kind === "source" ? next.sources : kind === "relationship" ? next.relationships : null;
  if (request.operation === "case.move_namespace") { /* semantic selection is deliberately unchanged */ }
  else if (kind === "case") {
    if (action === "tombstone") { text(request.reason, "reason"); next.state = "tombstoned"; }
    else { const changed = applyCaseResourceMask("case", prior.version, request.changes); Object.assign(next, changed); for (const field of ["title", "summary", "scope", "provenance"]) if (!Object.hasOwn(changed, field)) delete next[field]; }
  } else if (action === "create") {
    const createdId = resourceId ?? (kind === "knowledge" ? deterministicKnowledgeId({ ...request, case_id: caseId }) : deterministicCaseResourceId({ ...request, case_id: caseId }, kind));
    const value = structuredClone(request[kind]); if (!value || typeof value !== "object") throw new SuccessorCaseError(kind, "object_required");
    if (kind === "evidence") { const sourceId = id(request.source_id, "source_id", "source"); const source = next.sources.find((item) => item.id === sourceId); if (!source) throw new SuccessorCaseError("source_id", "source_not_found"); source.fragments.push({ id: createdId, state: "active", version: value }); }
    else if (kind === "source") collection.push({ id: createdId, state: "active", display_label: value.display_label, version: value, fragments: [] });
    else collection.push({ id: createdId, state: "active", version: value });
    return commitModular(request, base, next, caseId, createdId, await selectedPlacement(request, request.placement ?? await retainedPlacement(request, caseId)));
  } else {
    if (!prior || prior.state !== "active") return failure(`case.${kind}.not_found_or_not_visible`, "The Case resource is unknown or not visible.", { failureClass: `case.${kind}.mutation_failure`, evidence: {} });
    const target = kind === "evidence" ? next.sources.find((source) => source.id === prior.source_id).fragments : collection;
    const index = target.findIndex((item) => item.id === resourceId);
    if (action === "update") target[index] = { id: resourceId, state: "active", ...(kind === "source" ? { display_label: prior.display_label } : {}), version: kind === "knowledge" ? applyKnowledgeMask(prior.version, request.changes) : applyCaseResourceMask(kind, prior.version, request.changes), ...(kind === "source" ? { fragments: target[index].fragments } : {}) };
    else { text(request.reason, "reason"); const version = tombstoneKnowledgeVersion({ previousVersionId: base.revision.version_ids[resourceId], reason: request.reason, replacement: request.replacement, operationId: request.operation_id }); target[index] = { id: resourceId, state: "tombstoned", ...(kind === "source" ? { display_label: prior.display_label, fragments: target[index].fragments } : {}), version }; }
  }
  return commitModular(request, base, next, caseId, resourceId, await selectedPlacement(request, request.placement ?? await retainedPlacement(request, caseId)));
}
async function commitModular(request, base, next, caseId, resourceId, placement) {
  const internal = { ...request, case: next, expected_revision: base.revision.number, placement, operation_id: request.operation_id };
  const built = assembleSuccessorCaseEnvelope(internal, { placement: base.placement, placement_selection: base.placement_selection, chat_revision_id: base.placement_selection?.chat_revision_id });
  const settled = await createPlacementGenerationFoundation(createSuccessorSqlitePlacementAdapter(binding(request))).commit({ operation_id: request.operation_id, owner: { id: caseId, kind: "case" }, expected_revision: base.revision.number, revision_id: built.allocations.revision, event: built.allocations.event, placement: built.placement, aggregate: built.aggregate });
  const segments = request.operation.split(".");
  const kind = segments.length === 2 ? "case" : segments[1];
  return success(request.operation, { status: "settled", resource: resourceId ? findResource(next, kind, resourceId) : null, owner: { id: caseId, kind: "case" }, revision: { id: typedCaseRevision(settled.revision_id), number: settled.revision_number, version_ids: built.allocations.versionIds }, receipt: settled.receipt, idempotent_replay: settled.receipt?.idempotent_replay === true, placement: settled.placement, placement_changed: settled.placement_changed, query_changed: settled.query_changed });
}
function publicCaseRead(raw, hydrated) {
  return {
    ...hydrated,
    revision: { ...hydrated.revision, id: typedCaseRevision(hydrated.revision.id) },
    placement: raw.placement_history?.placement ?? raw.current_projection?._mechanical_placement ?? null,
  };
}

async function caseBinding(request) {
  const fields = CASE_OPERATION_FIELDS.get(request.operation);
  if (!fields) throw new SuccessorCaseError("operation", "operation_unsupported");
  // As with Frame, reject an inexact envelope and fence the provider-derived
  // Case purpose before any resolver/read/receipt/disclosure/write path.
  exact(request, fields, "request");
  id(request.store_id, "store_id", "store"); id(request.workspace_id, "workspace_id", "workspace"); id(request.admission_slot_id, "admission_slot_id", "admission-slot");
  if (!object(request.admission)) throw new SuccessorCaseError("admission", "object_required");
  const authorized = await authorizeSuccessorOperation(request, request.operation, "case");
  if (!authorized.ok) throw Object.assign(new SuccessorCaseError("admission", authorized.failure?.code ?? "profile_guard_denied"), { admissionFailure: authorized });
  return mechanicalBinding(request);
}

export async function invokeSuccessorCaseOperation(request) {
  try {
    if (!CASE_OPERATION_FIELDS.has(request?.operation)) return unsupported(request?.operation);
    // Bind every closed public Case operation before any subsequent work.
    await caseBinding(request);
    const modular = await invokeModularCaseOperation(request);
    if (modular) return modular;
    if (request.operation === "case.read") {
      exact(request, new Set(["protocol", "operation", "request_version", "store_id", "workspace_id", "admission_slot_id", "admission", "configuration", "case_id", "revision_id"]), "request");
      const caseId = id(request.case_id, "case_id", "case");
      const raw = await invokeSuccessorMechanicalOperation({ operation: request.revision_id ? "substrate.read_owner_revision" : "substrate.read_owner_current", ...mechanicalBinding(request), owner: { id: caseId, kind: "case" }, ...(request.revision_id ? { revision_id: mechanicalCaseRevision(request.revision_id, "revision_id") } : {}) });
      if (!raw.ok) return typedFailure("case.read", raw);
      if (raw.result.status !== "visible") return failure("case.not_found_or_not_visible", "The Case is unknown or not visible.", { failureClass: "case.read_failure", evidence: {} });
      const hydrated = rawRevision(request, raw.result);
      if (hydrated.case.state !== "active") return failure("case.not_found_or_not_visible", "The Case is unknown or not visible.", { failureClass: "case.read_failure", evidence: {} });
      return success("case.read", publicCaseRead(raw.result, hydrated));
    }
    if (request.operation === "case.resolve") {
      exact(request, new Set(["protocol", "operation", "request_version", "store_id", "workspace_id", "admission_slot_id", "admission", "configuration", "alias", "namespace_id", "namespace_path"]), "request");
      const namespace = await exactNamespace(request, request.namespace_id, request.namespace_path);
      if (!namespace) return success("case.resolve", { status: "not_found" });
      const alias = normalizeExactLocator(text(request.alias, "alias", 256));
      const claim = await invokeSuccessorMechanicalOperation({ operation: "substrate.resolve_current_claim", ...mechanicalBinding(request), owner_kind: "case", claim_type: "case-alias", namespace_id: namespace, normalized_value: alias });
      if (!claim.ok) return typedFailure("case.resolve", claim);
      if (claim.result.status !== "found") return success("case.resolve", { status: "not_found" });
      const owner = await invokeSuccessorMechanicalOperation({ operation: "substrate.read_owner_revision", ...mechanicalBinding(request), owner: claim.result.owner, revision_id: claim.result.owner_revision.id });
      if (!owner.ok || owner.result.status !== "visible") return success("case.resolve", { status: "not_found" });
      const hydrated = rawRevision(request, owner.result);
      if (hydrated.case.state !== "active") return success("case.resolve", { status: "not_found" });
      return success("case.resolve", { status: "found", case: hydrated.case, revision: hydrated.revision, namespace_id: namespace, operation_fence: claim.result.operation_fence });
    }
    if (!new Set(["case.create", "case.commit_revision", "case.tombstone.commit"]).has(request.operation)) return unsupported(request.operation);
    exact(request, new Set(["protocol", "operation", "request_version", "operation_id", "store_id", "workspace_id", "admission_slot_id", "admission", "configuration", "expected_revision", "commit_basis", "provenance", "case", "placement"]), "request");
    if (request.request_version !== 1 || !Number.isInteger(request.expected_revision) || request.expected_revision < 0) throw new SuccessorCaseError("expected_revision", "expected_revision_required");
    text(request.operation_id, "operation_id", 256); text(request.commit_basis, "commit_basis");
    if (request.operation === "case.create" && request.expected_revision !== 0) throw new SuccessorCaseError("expected_revision", "create_requires_absent_revision");
    const port = createSuccessorSqlitePlacementAdapter(binding(request));
    let priorPlacement = null;
    if (request.expected_revision > 0) {
      const current = await port.readCurrent({ owner: { id: request.case.id, kind: "case" } });
      if (current.revision_number === request.expected_revision && current.placement) {
        const history = await port.readRevision({ owner: { id: request.case.id, kind: "case" }, revision_id: current.revision_id });
        const chat = request.placement.chat_id == null ? null : await port.readChat({ chat_id: request.placement.chat_id });
        priorPlacement = { placement: current.placement, placement_selection: history?.placement_selection, chat_revision_id: chat?.chat_revision_id };
      }
    }
    const placement = await selectedPlacement(request, request.placement);
    const built = assembleSuccessorCaseEnvelope({ ...request, placement }, priorPlacement);
    const service = createPlacementGenerationFoundation(port);
    const settled = await service.commit({ operation_id: request.operation_id, owner: { id: built.normalized.id, kind: "case" }, expected_revision: request.expected_revision, revision_id: built.allocations.revision, event: built.allocations.event, placement: built.placement, aggregate: built.aggregate });
    return success(request.operation, { status: "settled", case: structuredClone(request.case), revision: { id: typedCaseRevision(settled.revision_id), number: settled.revision_number, version_ids: built.allocations.versionIds }, event_id: built.allocations.event, receipt: settled.receipt, idempotent_replay: settled.receipt?.idempotent_replay === true, placement: settled.placement, placement_changed: settled.placement_changed, query_changed: settled.query_changed });
  } catch (error) {
    if (error?.admissionFailure) return error.admissionFailure;
    if (error instanceof SuccessorCaseError || error?.path) return invalid(error);
    return typedFailure(request?.operation, { failure: { code: error?.code ?? "internal_failure", retry_disposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR } });
  }
}
