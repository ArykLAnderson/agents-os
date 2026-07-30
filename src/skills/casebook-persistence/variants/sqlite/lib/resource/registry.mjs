import { CASE_OWNER_LIFECYCLE_ADAPTERS, CASE_RESOURCE_ADAPTERS, CASE_RESOURCE_CAPABILITIES } from "../case/resources/complete.mjs";
import { FRAME_OWNER_LIFECYCLE_ADAPTERS, FRAME_RESOURCE_ADAPTERS, FRAME_RESOURCE_CAPABILITIES } from "../frame/resources/complete.mjs";
import { createOwnerLifecycleRegistry } from "./owner-lifecycle.mjs";

const KIND = /^[a-z][a-z0-9_-]{0,63}$/;
const SCHEMA = /^[a-z][a-z0-9_-]*(?:-[a-z0-9_-]+)*@\d+$/;

export class ResourceCapabilityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ResourceCapabilityError";
    this.code = code;
  }
}

function validateDescriptor(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !["owner_kind", "resource_kind", "capability_version"].includes(key))
    || !KIND.test(value.owner_kind ?? "") || !KIND.test(value.resource_kind ?? "")
    || !Number.isInteger(value.capability_version) || value.capability_version < 1) {
    throw new ResourceCapabilityError("resource_capability_invalid", "A resource capability descriptor is invalid.");
  }
  return Object.freeze({ ...value });
}

function validateSearchMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== "document_schema,projection_schema,ranking"
    || !SCHEMA.test(value.projection_schema ?? "") || !SCHEMA.test(value.document_schema ?? "")
    || !value.ranking || typeof value.ranking !== "object" || Array.isArray(value.ranking)
    || Object.keys(value.ranking).sort().join(",") !== "model,version"
    || !KIND.test(value.ranking.model ?? "") || !Number.isInteger(value.ranking.version) || value.ranking.version < 1) {
    throw new ResourceCapabilityError("resource_adapter_invalid", "A resource search adapter metadata contract is invalid.");
  }
  return Object.freeze({
    projection_schema: value.projection_schema,
    document_schema: value.document_schema,
    ranking: Object.freeze({ ...value.ranking }),
  });
}

function validateAdapter(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !["owner_kind", "resource_kind", "adapter_version", "hydrate", "project_search", "search_metadata", "validate_search", "project_relationships"].includes(key))
    || !KIND.test(value.owner_kind ?? "") || !KIND.test(value.resource_kind ?? "")
    || !Number.isInteger(value.adapter_version) || value.adapter_version < 1
    || typeof value.hydrate !== "function" || typeof value.project_search !== "function"
    || typeof value.validate_search !== "function" || (value.project_relationships != null && typeof value.project_relationships !== "function")) {
    throw new ResourceCapabilityError("resource_adapter_invalid", "A resource read/search adapter is invalid.");
  }
  return Object.freeze({ ...value, search_metadata: validateSearchMetadata(value.search_metadata) });
}

function sameSearchProfile(left, right) {
  return left.projection_schema === right.projection_schema
    && left.ranking.model === right.ranking.model
    && left.ranking.version === right.ranking.version;
}

export function createResourceCapabilityRegistry(descriptors, adapters = []) {
  if (!Array.isArray(descriptors) || !Array.isArray(adapters)) throw new ResourceCapabilityError("resource_capability_invalid", "Resource capabilities and adapters must be closed arrays.");
  const capabilities = new Map();
  for (const raw of descriptors) {
    const descriptor = validateDescriptor(raw);
    const key = `${descriptor.owner_kind}\0${descriptor.resource_kind}`;
    if (capabilities.has(key)) throw new ResourceCapabilityError("resource_capability_invalid", "A duplicate resource capability was registered.");
    capabilities.set(key, descriptor);
  }
  const registeredAdapters = new Map();
  for (const raw of adapters) {
    const adapter = validateAdapter(raw);
    const key = `${adapter.owner_kind}\0${adapter.resource_kind}`;
    if (!capabilities.has(key) || registeredAdapters.has(key)) throw new ResourceCapabilityError("resource_adapter_invalid", "A resource adapter is unbound or duplicated.");
    registeredAdapters.set(key, adapter);
  }
  const capabilitiesForKind = (resourceKind) => [...capabilities.values()].filter((item) => item.resource_kind === resourceKind);
  const assertResourceKind = (resourceKind) => {
    if (!capabilitiesForKind(resourceKind).length) throw new ResourceCapabilityError("resource_kind_unsupported", "The requested resource capability is unsupported.");
    return resourceKind;
  };
  const resolve = (ownerKind, resourceKind) => {
    const descriptor = capabilities.get(`${ownerKind}\0${resourceKind}`);
    if (!descriptor) {
      // Deliberately omit registered kinds and counts: unsupported requests must
      // not turn the closed registry into an enumeration oracle.
      throw new ResourceCapabilityError("resource_kind_unsupported", "The requested resource capability is unsupported.");
    }
    return descriptor;
  };
  const adapter = (ownerKind, resourceKind) => {
    resolve(ownerKind, resourceKind);
    const selected = registeredAdapters.get(`${ownerKind}\0${resourceKind}`);
    if (!selected) throw new ResourceCapabilityError("resource_search_adapter_unsupported", "The requested resource search adapter is unavailable.");
    return selected;
  };
  const searchProfile = (resourceKind) => {
    const candidates = capabilitiesForKind(assertResourceKind(resourceKind));
    const selected = candidates.map((descriptor) => registeredAdapters.get(`${descriptor.owner_kind}\0${descriptor.resource_kind}`));
    if (selected.some((item) => !item)) throw new ResourceCapabilityError("resource_search_adapter_unsupported", "The requested resource kind is not closed over searchable adapters.");
    const profile = selected[0].search_metadata;
    if (selected.some((item) => !sameSearchProfile(profile, item.search_metadata))) throw new ResourceCapabilityError("resource_search_profile_incompatible", "Registered search adapters disagree on the resource-kind search profile.");
    return profile;
  };
  return Object.freeze({
    resolve,
    assertResourceKind,
    searchProfile,
    hydrate: (ownerKind, resourceKind, value) => adapter(ownerKind, resourceKind).hydrate(value),
    projectSearch: (ownerKind, resourceKind, value) => adapter(ownerKind, resourceKind).project_search(value),
    validateSearch: (ownerKind, resourceKind, value) => adapter(ownerKind, resourceKind).validate_search(value),
    projectRelationships: (ownerKind, resourceKind, value) => {
      const selected = adapter(ownerKind, resourceKind);
      if (typeof selected.project_relationships !== "function") throw new ResourceCapabilityError("relationship_adapter_unsupported", "The requested resource relationship adapter is unavailable.");
      return selected.project_relationships(value);
    },
  });
}

export const FINAL_RESOURCE_CAPABILITIES = Object.freeze([...CASE_RESOURCE_CAPABILITIES, ...FRAME_RESOURCE_CAPABILITIES]);
export const FINAL_RESOURCE_ADAPTERS = Object.freeze([...CASE_RESOURCE_ADAPTERS, ...FRAME_RESOURCE_ADAPTERS]);
export const FINAL_OWNER_LIFECYCLE_ADAPTERS = Object.freeze([...CASE_OWNER_LIFECYCLE_ADAPTERS, ...FRAME_OWNER_LIFECYCLE_ADAPTERS]);
export function createFinalResourceRegistry() { return createResourceCapabilityRegistry(FINAL_RESOURCE_CAPABILITIES, FINAL_RESOURCE_ADAPTERS); }
export function createFinalOwnerLifecycleRegistry() { return createOwnerLifecycleRegistry(FINAL_OWNER_LIFECYCLE_ADAPTERS); }
