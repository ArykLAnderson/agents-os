import { createHash } from "node:crypto";
import { mechanicalDigest } from "../../substrate/mechanical.mjs";

export const FRAME_RESOURCE_KINDS = Object.freeze(["frame", "discovery", "disposition_boundary", "case_disposition"]);
export const FRAME_RESOURCE_CAPABILITIES = Object.freeze(FRAME_RESOURCE_KINDS.map((resource_kind) => Object.freeze({ owner_kind: "frame", resource_kind, capability_version: 1 })));
export const FRAME_OWNER_LIFECYCLE_ADAPTERS = Object.freeze([Object.freeze({
  owner_kind: "frame",
  current_predicate: ({ owner_alias, revision_expression }) => `EXISTS(
    SELECT 1 FROM owner_revision_selections frame_profile_selection
    JOIN owner_versions frame_profile_version ON frame_profile_version.version_id=frame_profile_selection.version_id
    WHERE frame_profile_selection.revision_id=${revision_expression}
      AND frame_profile_selection.family_id=${owner_alias}.owner_id
      AND json_extract(frame_profile_version.content_json,'$.schema')='frame-profile@1'
      AND json_extract(frame_profile_version.content_json,'$.status') IN ('active','completed','abandoned','superseded')
  )`,
})]);

const DEFINITIONS = Object.freeze({
  frame: {
    mutable: ["status", "title", "outcome", "included_scope", "excluded_scope", "limitations", "completion_condition", "case_links", "frame_links", "downstream_links", "artifact_links", "authorization_provenance"],
    required: ["status"],
  },
  discovery: {
    mutable: ["display_label", "display_order", "category", "title", "body", "human_authority", "dependencies", "scope_namespace_ids"],
    required: ["display_order", "category", "title", "body", "human_authority", "dependencies"],
  },
  disposition_boundary: {
    mutable: ["display_label", "display_order", "title", "basis", "evidence_locators", "disposition_ids"],
    required: ["display_order", "disposition_ids"],
  },
  case_disposition: {
    mutable: ["result_summary", "evidence_locators", "rationale", "pending_reason", "resume_condition", "no_case_reason", "affected_case_entry_display_ids"],
    required: ["result_summary"],
  },
});

export class FrameResourceError extends Error {
  constructor(code, path, rule, message = rule) { super(message); this.name = "FrameResourceError"; this.code = code; this.path = path; this.rule = rule; }
}
function object(value) { return value && typeof value === "object" && !Array.isArray(value); }
function allocatedUuid(seed) { const bytes = createHash("sha256").update(seed).digest().subarray(0, 16); bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128; const h = bytes.toString("hex"); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`; }
export function deterministicFrameResourceId(request, kind) { return `${kind === "disposition_boundary" ? "disposition-boundary" : kind === "case_disposition" ? "case-disposition" : kind}:${allocatedUuid(`${request.store_id}\0${request.frame_id}\0${request.operation_id}\0frame.${kind}.create\0${kind}`)}`; }
export function frameResourceRequestDigest(request) { const semantic = structuredClone(request); delete semantic.configuration; return mechanicalDigest(semantic); }

export function applyFrameResourceMask(kind, resource, changes) {
  const definition = DEFINITIONS[kind];
  if (!definition) throw new FrameResourceError("invalid_request", "resource_kind", "resource_kind_unsupported");
  if (!object(changes) || Object.keys(changes).some((key) => !["set", "unset"].includes(key))) throw new FrameResourceError("invalid_mask", "changes", "typed_mask_required");
  const set = changes.set ?? {}, unset = changes.unset ?? [];
  if (!object(set)) throw new FrameResourceError("invalid_mask", "changes.set", "object_required");
  if (!Array.isArray(unset)) throw new FrameResourceError("invalid_mask", "changes.unset", "array_required");
  const mutable = new Set(definition.mutable), required = new Set(definition.required), result = structuredClone(resource), seen = new Set();
  for (const [field, value] of Object.entries(set)) {
    if (!mutable.has(field) || field.includes(".") || /^\d+$/.test(field)) throw new FrameResourceError("invalid_mask", `changes.set.${field}`, "field_unsupported");
    if (value === null) throw new FrameResourceError("invalid_mask", `changes.set.${field}`, "ambiguous_null");
    result[field] = structuredClone(value);
  }
  for (const [index, field] of unset.entries()) {
    if (typeof field !== "string" || !mutable.has(field) || field.includes(".") || /^\d+$/.test(field)) throw new FrameResourceError("invalid_mask", `changes.unset[${index}]`, "field_unsupported");
    if (seen.has(field) || Object.hasOwn(set, field)) throw new FrameResourceError("invalid_mask", `changes.unset[${index}]`, "mask_field_ambiguous");
    if (required.has(field)) throw new FrameResourceError("invalid_mask", `changes.unset[${index}]`, "required_field_unset");
    seen.add(field); delete result[field];
  }
  return result;
}

function profile(frame) {
  const { discovery: _discovery, disposition_boundaries: _boundaries, case_dispositions: _dispositions, ...value } = frame;
  return value;
}
export function frameResourceFromHydrated(hydrated, kind, resourceId) {
  const frame = hydrated.frame;
  if (kind === "frame") return resourceId === frame.id ? { id: frame.id, profile: profile(frame) } : null;
  const collection = kind === "discovery" ? frame.discovery : kind === "disposition_boundary" ? frame.disposition_boundaries : frame.case_dispositions;
  return structuredClone(collection?.find((item) => item.id === resourceId) ?? null);
}
export function frameResourceFromNormalized(frame, kind, resourceId, allocations = null) {
  const resource = frameResourceFromHydrated({ frame }, kind, resourceId);
  if (!resource || !allocations) return resource;
  if (kind === "discovery") resource.version_id = allocations.discovery_item_version_ids.find((item) => item.discovery_item_id === resourceId)?.version_id;
  else if (kind === "disposition_boundary") resource.version_id = allocations.disposition_boundary_version_ids.find((item) => item.disposition_boundary_id === resourceId)?.version_id;
  else if (kind === "case_disposition") resource.version_id = allocations.case_disposition_version_ids.find((item) => item.case_disposition_id === resourceId)?.version_id;
  return resource;
}

function contentFor(kind, item) {
  if (kind === "frame") return { schema: "frame-profile-resource@1", profile: profile(item) };
  const { version_id: _version, ...version } = item;
  return { schema: `frame-${kind.replaceAll("_", "-")}-resource@1`, version };
}
function versionFor(kind, allocations, id) {
  if (kind === "frame") return allocations.frame_version_id;
  if (kind === "discovery") return allocations.discovery_item_version_ids.find((item) => item.discovery_item_id === id)?.version_id;
  if (kind === "disposition_boundary") return allocations.disposition_boundary_version_ids.find((item) => item.disposition_boundary_id === id)?.version_id;
  return allocations.case_disposition_version_ids.find((item) => item.case_disposition_id === id)?.version_id;
}
export function completeFrameResourceDelta(frame, allocations) {
  const resources = [];
  const add = (kind, item, lifecycle = "active") => resources.push({ resource_id: item.id, resource_kind: kind, family_id: item.id, version_id: versionFor(kind, allocations, item.id), lifecycle, projection: contentFor(kind, item), search: null });
  add("frame", frame);
  for (const item of frame.discovery) add("discovery", item, item.lifecycle === "tombstoned" ? "tombstoned" : "active");
  for (const item of frame.disposition_boundaries ?? []) add("disposition_boundary", item);
  for (const item of frame.case_dispositions ?? []) add("case_disposition", item);
  resources.sort((left, right) => left.resource_id.localeCompare(right.resource_id));
  return { resources, relationships: [] };
}

const SEARCH_PROFILE = Object.freeze({ projection_schema: "frame-resource-projection@1", document_schema: "frame-resource-null-search@1", ranking: Object.freeze({ model: "frame-none", version: 1 }) });
export const FRAME_RESOURCE_ADAPTERS = Object.freeze(FRAME_RESOURCE_KINDS.map((resource_kind) => Object.freeze({
  owner_kind: "frame", resource_kind, adapter_version: 1, search_metadata: SEARCH_PROFILE,
  hydrate: ({ resource_id, canonical_content }) => ({ id: resource_id, ...structuredClone(canonical_content) }),
  project_search: () => null,
  validate_search: ({ expected, actual }) => expected == null && actual == null,
})));
