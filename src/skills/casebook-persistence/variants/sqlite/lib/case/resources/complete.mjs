import { createHash } from "node:crypto";
import { mechanicalDigest } from "../../substrate/mechanical.mjs";

export const KNOWLEDGE_CAPABILITY = Object.freeze({ owner_kind: "case", resource_kind: "knowledge", capability_version: 1 });
export const KNOWLEDGE_SCHEMA = "case-knowledge@1";
export const KNOWLEDGE_TOMBSTONE_SCHEMA = "casebook-resource-tombstone@1";
export const KNOWLEDGE_SEARCH_SCHEMA = "case-knowledge-search@1";

const MUTABLE_FIELDS = new Set([
  "display_label", "title", "purpose", "classification", "body", "scope", "visibility",
  "provenance", "support", "authority", "authority_required", "positions", "supersession",
  "relationships", "references",
]);
const REQUIRED_FIELDS = new Set(["display_label", "title", "purpose", "classification", "body", "provenance"]);
const OPTIONAL_FIELDS = new Set([...MUTABLE_FIELDS].filter((field) => !REQUIRED_FIELDS.has(field)));

export class KnowledgeServiceError extends Error {
  constructor(code, path, rule, message = rule) {
    super(message);
    this.name = "KnowledgeServiceError";
    this.code = code;
    this.path = path;
    this.rule = rule;
  }
}

export function deterministicKnowledgeId(request) {
  return `knowledge:${allocatedUuid(`${request.store_id}\0${request.case_id}\0${request.operation_id}\0case.knowledge.create\0knowledge`)}`;
}

export function deterministicReplacementRelationshipId(operationId, resourceId) {
  return `relationship:${allocatedUuid(`${operationId}\0${resourceId}\0replacement`)}`;
}

export function caseRelationshipProjectionsFromCanonicalContent(kind, resourceId, content) {
  if (kind === "relationship" && content.schema === "case-relationship@1" && content.state === "active") {
    return [{
      relationship_id: resourceId,
      source_resource_id: content.subject.id,
      target: structuredClone(content.object),
      predicate: content.predicate,
      metadata: {
        schema: "case-semantic-relationship@1",
        canonical_schema: content.schema,
        kind: "explicit",
        visibility: content.visibility ?? "private",
        declaring_resource_id: resourceId,
      },
    }];
  }
  if (content.schema !== KNOWLEDGE_TOMBSTONE_SCHEMA || !content.replacement) return [];
  return [{
    relationship_id: deterministicReplacementRelationshipId(content.operation_id, resourceId),
    source_resource_id: resourceId,
    target: structuredClone(content.replacement),
    predicate: "replaced-by",
    metadata: { schema: kind === "knowledge" ? "case-knowledge-replacement@1" : "case-resource-replacement@1", canonical_schema: content.schema, kind: "explicit", visibility: "private", operation_id: content.operation_id, declaring_resource_id: resourceId },
  }];
}

export function modularRequestDigest(request) {
  const semantic = structuredClone(request);
  delete semantic.configuration;
  return mechanicalDigest(semantic);
}

export function applyKnowledgeMask(version, changes) {
  if (!object(changes) || Object.keys(changes).some((key) => !["set", "unset"].includes(key))) {
    throw new KnowledgeServiceError("invalid_mask", "changes", "typed_mask_required");
  }
  const set = changes.set ?? {};
  const unset = changes.unset ?? [];
  if (!object(set)) throw new KnowledgeServiceError("invalid_mask", "changes.set", "object_required");
  if (!Array.isArray(unset)) throw new KnowledgeServiceError("invalid_mask", "changes.unset", "array_required");
  const result = structuredClone(version);
  for (const [field, value] of Object.entries(set)) {
    if (!MUTABLE_FIELDS.has(field) || field.includes(".") || /^\d+$/.test(field)) throw new KnowledgeServiceError("invalid_mask", `changes.set.${field}`, "field_unsupported");
    if (value === null) throw new KnowledgeServiceError("invalid_mask", `changes.set.${field}`, "ambiguous_null");
    result[field] = structuredClone(value);
  }
  const seen = new Set();
  for (const [index, field] of unset.entries()) {
    if (typeof field !== "string" || !MUTABLE_FIELDS.has(field) || field.includes(".") || /^\d+$/.test(field)) throw new KnowledgeServiceError("invalid_mask", `changes.unset[${index}]`, "field_unsupported");
    if (seen.has(field) || Object.hasOwn(set, field)) throw new KnowledgeServiceError("invalid_mask", `changes.unset[${index}]`, "mask_field_ambiguous");
    seen.add(field);
    if (REQUIRED_FIELDS.has(field)) throw new KnowledgeServiceError("invalid_mask", `changes.unset[${index}]`, "required_field_unset");
    if (!OPTIONAL_FIELDS.has(field)) throw new KnowledgeServiceError("invalid_mask", `changes.unset[${index}]`, "field_unsupported");
    delete result[field];
  }
  return result;
}

function searchableStrings(value, output = []) {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) for (const item of value) searchableStrings(item, output);
  else if (object(value)) for (const [key, item] of Object.entries(value)) {
    if (["provenance", "support", "authority", "references", "relationships", "supersession"].includes(key)) continue;
    searchableStrings(item, output);
  }
  return output;
}

export function knowledgeSearchDocument(content, facets = []) {
  const fields = {
    display_label: content.display_label,
    title: content.title,
    purpose: content.purpose,
    classification: content.classification,
    body: content.body,
    ...(content.scope != null ? { scope: content.scope } : {}),
    ...(content.positions != null ? { positions: content.positions } : {}),
  };
  const metadata = {
    schema: KNOWLEDGE_SEARCH_SCHEMA,
    projection_version: 1,
    visibility: content.visibility ?? "private",
    fields,
    facets: facets.filter((facet) => facet?.state === "active" && typeof facet.id === "string")
      .map((facet) => ({ id: facet.id, key: facet.version?.key, value: facet.version?.value, visibility: facet.version?.visibility ?? "private" }))
      .filter((facet) => typeof facet.key === "string" && typeof facet.value === "string")
      .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  };
  const text = searchableStrings(fields).join("\n").normalize("NFC");
  return { text, metadata };
}

function publicProjection(content) {
  if (content.schema === KNOWLEDGE_TOMBSTONE_SCHEMA) {
    return {
      schema: KNOWLEDGE_TOMBSTONE_SCHEMA,
      state: "tombstoned",
      previous_version_id: content.previous_version_id,
      reason: content.reason,
      replacement: content.replacement ?? null,
      operation_id: content.operation_id,
      tombstoned_at: content.tombstoned_at,
    };
  }
  const { schema, family_id: _familyId, state: _state, relationship_ids: _relationshipIds, ...version } = content;
  return { schema, state: content.state, version };
}

export function knowledgeResourceDelta(normalized, allocations, facets = []) {
  const resources = [];
  const relationships = [];
  for (const family of normalized.families ?? []) {
    if (family.kind !== "knowledge") continue;
    const content = family.content ?? family.resolved_content;
    if (!content) throw new KnowledgeServiceError("invalid_representation", "case.entries", "knowledge_content_unavailable");
    const lifecycle = content.state;
    const versionId = allocations.versionIds[family.family_id];
    resources.push({
      resource_id: family.family_id,
      resource_kind: "knowledge",
      family_id: family.family_id,
      version_id: `version:${versionId.slice(versionId.indexOf(":") + 1)}`,
      lifecycle,
      projection: publicProjection(content),
      search: lifecycle === "active" ? knowledgeSearchDocument(content, facets) : null,
    });
    relationships.push(...caseRelationshipProjectionsFromCanonicalContent("knowledge", family.family_id, content));
  }
  resources.sort((left, right) => left.resource_id.localeCompare(right.resource_id));
  relationships.sort((left, right) => left.relationship_id.localeCompare(right.relationship_id));
  return { resources, relationships };
}

export function knowledgeResourceFromCase(hydrated, resourceId) {
  const resource = hydrated.case.entries.find((entry) => entry.id === resourceId);
  if (!resource) return null;
  return structuredClone(resource);
}

export function tombstoneKnowledgeVersion({ previousVersionId, reason, replacement, operationId, tombstonedAt }) {
  return {
    previous_version_id: previousVersionId,
    reason,
    ...(replacement ? { replacement: structuredClone(replacement) } : {}),
    operation_id: operationId,
    ...(tombstonedAt ? { tombstoned_at: tombstonedAt } : {}),
  };
}

export const CASE_RESOURCE_KINDS = Object.freeze(["case", "facet", "knowledge", "source", "evidence", "relationship"]);
export const CASE_RESOURCE_CAPABILITIES = Object.freeze(CASE_RESOURCE_KINDS.map((resource_kind) => Object.freeze({ owner_kind: "case", resource_kind, capability_version: 1 })));
export const CASE_OWNER_LIFECYCLE_ADAPTERS = Object.freeze([Object.freeze({
  owner_kind: "case",
  current_predicate: ({ owner_alias, revision_expression }) => `EXISTS(
    SELECT 1 FROM owner_revision_selections case_profile_selection
    JOIN owner_versions case_profile_version ON case_profile_version.version_id=case_profile_selection.version_id
    WHERE case_profile_selection.revision_id=${revision_expression}
      AND case_profile_selection.family_id=${owner_alias}.owner_id
      AND json_extract(case_profile_version.content_json,'$.schema')='case-profile-final@1'
      AND json_extract(case_profile_version.content_json,'$.state')='active'
  )`,
})]);

const DEFINITIONS = Object.freeze({
  facet: { collection: "facets", mutable: ["key", "value", "visibility", "provenance"], required: ["key", "value", "visibility"] },
  source: { collection: "sources", mutable: ["display_label", "title", "author", "accessed_at", "examined_for", "digest", "visibility", "locators", "provenance"], required: ["display_label", "accessed_at", "examined_for", "visibility", "locators"] },
  evidence: { collection: "sources", mutable: ["source_version_id", "excerpt", "purpose", "captured_at", "digest", "visibility", "provenance"], required: ["purpose", "captured_at", "visibility"] },
  relationship: { collection: "relationships", mutable: ["subject", "predicate", "object", "visibility", "provenance"], required: ["subject", "predicate", "object", "visibility"] },
  case: { mutable: ["title", "summary", "scope", "provenance"], required: ["title", "summary", "scope"] },
});

export class CompleteCaseResourceError extends Error {
  constructor(code, path, rule, message = rule) { super(message); this.name = "CompleteCaseResourceError"; this.code = code; this.path = path; this.rule = rule; }
}
function object(value) { return value && typeof value === "object" && !Array.isArray(value); }
function allocatedUuid(seed) { const bytes = createHash("sha256").update(seed).digest().subarray(0, 16); bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128; const h = bytes.toString("hex"); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`; }
export function deterministicCaseResourceId(request, kind) { return `${kind}:${allocatedUuid(`${request.store_id}\0${request.case_id}\0${request.operation_id}\0case.${kind}.create\0${kind}`)}`; }
export function completeResourceRequestDigest(request) { const semantic = structuredClone(request); delete semantic.configuration; return mechanicalDigest(semantic); }
export function definitionFor(kind) { const definition = DEFINITIONS[kind]; if (!definition) throw new CompleteCaseResourceError("invalid_request", "resource_kind", "resource_kind_unsupported"); return definition; }

export function applyCaseResourceMask(kind, resource, changes) {
  const definition = definitionFor(kind);
  if (!object(changes) || Object.keys(changes).some((key) => !["set", "unset"].includes(key))) throw new CompleteCaseResourceError("invalid_mask", "changes", "typed_mask_required");
  const set = changes.set ?? {}, unset = changes.unset ?? [];
  if (!object(set)) throw new CompleteCaseResourceError("invalid_mask", "changes.set", "object_required");
  if (!Array.isArray(unset)) throw new CompleteCaseResourceError("invalid_mask", "changes.unset", "array_required");
  const mutable = new Set(definition.mutable), required = new Set(definition.required), result = structuredClone(resource), seen = new Set();
  for (const [field, value] of Object.entries(set)) { if (!mutable.has(field) || field.includes(".") || /^\d+$/.test(field)) throw new CompleteCaseResourceError("invalid_mask", `changes.set.${field}`, "field_unsupported"); if (value === null) throw new CompleteCaseResourceError("invalid_mask", `changes.set.${field}`, "ambiguous_null"); result[field] = structuredClone(value); }
  for (const [index, field] of unset.entries()) { if (typeof field !== "string" || !mutable.has(field) || field.includes(".") || /^\d+$/.test(field)) throw new CompleteCaseResourceError("invalid_mask", `changes.unset[${index}]`, "field_unsupported"); if (seen.has(field) || Object.hasOwn(set, field)) throw new CompleteCaseResourceError("invalid_mask", `changes.unset[${index}]`, "mask_field_ambiguous"); if (required.has(field)) throw new CompleteCaseResourceError("invalid_mask", `changes.unset[${index}]`, "required_field_unset"); seen.add(field); delete result[field]; }
  return result;
}

export function caseResourceProjectionFromCanonicalContent(kind, content) {
  if (content.schema === KNOWLEDGE_TOMBSTONE_SCHEMA) {
    return { schema: content.schema, state: "tombstoned", previous_version_id: content.previous_version_id, reason: content.reason, replacement: content.replacement ?? null, operation_id: content.operation_id, tombstoned_at: content.tombstoned_at };
  }
  const { schema, family_id: _family, state, namespace_id: _namespace, normalized_value: _normalized, relationship_ids: _relationshipIds, source_family_id: _sourceFamily, ...version } = content;
  return { schema, state, version };
}
function publicVersion(content) {
  if (content.schema !== KNOWLEDGE_TOMBSTONE_SCHEMA) return caseResourceProjectionFromCanonicalContent(null, content).version;
  return { previous_version_id: content.previous_version_id, reason: content.reason, ...(content.replacement ? { replacement: structuredClone(content.replacement) } : {}), operation_id: content.operation_id, ...(content.tombstoned_at ? { tombstoned_at: content.tombstoned_at } : {}) };
}
function sourceResource(record, resourceId) { const source = record.sources.find((item) => item.id === resourceId); return source ? structuredClone(source) : null; }
function evidenceResource(record, resourceId) { for (const source of record.sources) { const evidence = source.fragments.find((item) => item.id === resourceId); if (evidence) return { ...structuredClone(evidence), source_id: source.id }; } return null; }
export function caseResourceFromHydrated(hydrated, kind, resourceId) {
  const record = hydrated.case;
  if (kind === "case") return resourceId === record.id ? { id: record.id, state: record.state, version: { title: record.title, summary: record.summary, scope: record.scope, ...(record.provenance ? { provenance: structuredClone(record.provenance) } : {}) } } : null;
  if (kind === "source") return sourceResource(record, resourceId);
  if (kind === "evidence") return evidenceResource(record, resourceId);
  const collection = kind === "facet" ? record.facets : kind === "relationship" ? record.relationships : record.entries;
  return structuredClone(collection.find((item) => item.id === resourceId) ?? null);
}
export function caseResourceFromNormalized(normalized, kind, resourceId) {
  if (kind === "case") return { id: normalized.id, state: normalized.state, version: { title: normalized.title, summary: normalized.summary, scope: normalized.scope, ...(normalized.provenance ? { provenance: structuredClone(normalized.provenance) } : {}) } };
  const family = normalized.families.find((item) => item.kind === kind && item.family_id === resourceId), content = family?.content ?? family?.resolved_content;
  if (!content) return null;
  if (kind === "knowledge") return null;
  const version = publicVersion(content);
  if (kind === "source") return { id: resourceId, state: content.state, display_label: content.display_label ?? content.source_display_label, version, fragments: [] };
  return { id: resourceId, state: content.state, version, ...(kind === "evidence" ? { source_id: content.source_family_id } : {}) };
}

function searchStrings(value, output = []) {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) for (const item of value) searchStrings(item, output);
  else if (object(value)) for (const item of Object.values(value)) searchStrings(item, output);
  return output;
}
function activeFacetBindings(facets = []) {
  return facets.filter((facet) => facet?.state === "active" && typeof facet.id === "string")
    .map((facet) => ({ id: facet.id, key: facet.version?.key, value: facet.version?.value, visibility: facet.version?.visibility ?? "private" }))
    .filter((facet) => typeof facet.key === "string" && typeof facet.value === "string")
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
}

export function caseSearchDocument(kind, content, facets = []) {
  if (!CASE_RESOURCE_KINDS.includes(kind)) throw new CompleteCaseResourceError("invalid_request", "resource_kind", "resource_kind_unsupported");
  const positions = Array.isArray(content.positions) ? content.positions.map((position) => object(position)
    ? Object.fromEntries(["title", "body", "scope"].filter((field) => typeof position[field] === "string").map((field) => [field, position[field]]))
    : position).filter((position) => typeof position === "string" || (object(position) && Object.keys(position).length)) : undefined;
  const fields = kind === "case" ? { title: content.title, summary: content.summary, scope: content.scope }
    : kind === "facet" ? { key: content.key, value: content.value }
        : kind === "knowledge" ? { display_label: content.display_label, title: content.title, purpose: content.purpose, classification: content.classification, body: content.body, scope: content.scope, positions }
          : kind === "source" ? { display_label: content.display_label ?? content.source_display_label, title: content.title, author: content.author, examined_for: content.examined_for }
            : kind === "evidence" ? { excerpt: content.excerpt, purpose: content.purpose }
              : { predicate: content.predicate };
  const normalizedFields = Object.fromEntries(Object.entries(fields).filter(([, value]) => typeof value === "string" || Array.isArray(value)));
  const text = searchStrings(Object.values(normalizedFields)).join("\n").normalize("NFC");
  if (!text.trim()) throw new CompleteCaseResourceError("invalid_representation", `case.${kind}`, "searchable_fields_required");
  return {
    text,
    metadata: {
      schema: `case-${kind}-search@1`,
      projection_version: 1,
      visibility: content.visibility ?? "private",
      fields: normalizedFields,
      facets: activeFacetBindings(facets),
    },
  };
}

function canonicalContentFromProjection(kind, projection) {
  if (!object(projection) || projection.state !== "active" || !object(projection.version)) throw new CompleteCaseResourceError("invalid_representation", `case.${kind}`, "active_projection_required");
  return projection.version;
}

export function caseSearchDocumentFromProjection(kind, projection, facetResources = []) {
  const facets = facetResources.map((facet) => ({ id: facet.resource_id, state: facet.lifecycle, version: canonicalContentFromProjection("facet", facet.projection) }));
  return caseSearchDocument(kind, canonicalContentFromProjection(kind, projection), facets);
}

export function caseResourceFromCanonicalContent(kind, resourceId, content) {
  if (!object(content) || content.state == null) throw new CompleteCaseResourceError("invalid_representation", `case.${kind}`, "canonical_content_required");
  if (kind === "case") return { id: resourceId, state: content.state, version: { title: content.title, summary: content.summary, scope: content.scope, ...(content.provenance ? { provenance: structuredClone(content.provenance) } : {}) } };
  if (content.schema === KNOWLEDGE_TOMBSTONE_SCHEMA) return { id: resourceId, state: content.state, version: publicVersion(content), ...(kind === "source" ? { display_label: content.source_display_label, fragments: [] } : {}), ...(kind === "evidence" ? { source_id: content.source_family_id } : {}) };
  const { schema: _schema, family_id: _family, state: _state, ...stored } = content;
  if (kind === "knowledge") { const { relationship_ids, ...version } = stored; return { id: resourceId, state: content.state, version: { ...version, relationships: relationship_ids ?? [] } }; }
  if (kind === "source") { const { display_label, ...version } = stored; return { id: resourceId, state: content.state, display_label, version, fragments: [] }; }
  if (kind === "evidence") { const { source_family_id, ...version } = stored; return { id: resourceId, state: content.state, source_id: source_family_id, version }; }
  if (kind === "relationship") { const endpoint = (value) => Object.fromEntries(Object.entries(value).filter(([key]) => key !== "external")); return { id: resourceId, state: content.state, version: { ...stored, subject: endpoint(stored.subject), object: endpoint(stored.object) } }; }
  return { id: resourceId, state: content.state, version: stored };
}

const CASE_SEARCH_PROJECTION_SCHEMA = "case-search-projection@1";
const CASE_SEARCH_RANKING = Object.freeze({ model: "case-lexical-occurrence", version: 1 });
function canonicalFacetSelections(selectedResources = []) {
  return selectedResources.filter((resource) => resource.family_id.startsWith("facet:") && resource.canonical_content?.state === "active")
    .map((resource) => ({ id: resource.family_id, state: resource.canonical_content.state, version: resource.canonical_content }));
}
function exactCaseSearchDocument(resourceKind, expected, actual) {
  return typeof actual?.text === "string" && actual.text === actual.text.normalize("NFC") && actual.text === expected.text
    && actual.metadata?.schema === `case-${resourceKind}-search@1`
    && actual.metadata?.projection_version === 1 && actual.metadata?.visibility === expected.metadata?.visibility
    && mechanicalDigest(actual.metadata) === mechanicalDigest(expected.metadata);
}

export const CASE_RESOURCE_ADAPTERS = Object.freeze(CASE_RESOURCE_KINDS.map((resource_kind) => Object.freeze({
  owner_kind: "case",
  resource_kind,
  adapter_version: 1,
  search_metadata: Object.freeze({ projection_schema: CASE_SEARCH_PROJECTION_SCHEMA, document_schema: `case-${resource_kind}-search@1`, ranking: CASE_SEARCH_RANKING }),
  hydrate: ({ resource_id, canonical_content }) => caseResourceFromCanonicalContent(resource_kind, resource_id, canonical_content),
  project_search: ({ canonical_content, selected_resources, projection, facets }) => canonical_content
    ? caseSearchDocument(resource_kind, canonical_content, canonicalFacetSelections(selected_resources))
    : caseSearchDocumentFromProjection(resource_kind, projection, facets.filter((resource) => resource.resource_kind === "facet")),
  validate_search: ({ expected, actual }) => exactCaseSearchDocument(resource_kind, expected, actual),
  project_relationships: ({ resource_id, canonical_content }) => caseRelationshipProjectionsFromCanonicalContent(resource_kind, resource_id, canonical_content),
})));

export function completeCaseResourceDelta(normalized, allocations) {
  const facets = (normalized.families ?? []).filter((family) => family.kind === "facet").map((family) => {
    const content = family.content ?? family.resolved_content;
    return { id: family.family_id, state: content?.state, version: content };
  });
  const knowledge = knowledgeResourceDelta(normalized, allocations, facets);
  const resources = [...knowledge.resources], relationships = [...knowledge.relationships];
  const profileVersion = allocations.versionIds.case;
  const profile = { title: normalized.title, summary: normalized.summary, scope: normalized.scope, provenance: normalized.provenance ?? null };
  resources.push({ resource_id: normalized.id, resource_kind: "case", family_id: normalized.id, version_id: `version:${profileVersion.slice(profileVersion.indexOf(":") + 1)}`, lifecycle: normalized.state, projection: { schema: "case-profile-resource@1", state: normalized.state, version: profile }, search: normalized.state === "active" ? caseSearchDocument("case", profile, facets) : null });
  for (const family of normalized.families ?? []) {
    if (family.kind === "knowledge") continue;
    const content = family.content ?? family.resolved_content;
    if (!content) throw new CompleteCaseResourceError("invalid_representation", `case.${family.kind}`, "resource_content_unavailable");
    const typedVersion = allocations.versionIds[family.family_id];
    resources.push({ resource_id: family.family_id, resource_kind: family.kind, family_id: family.family_id, version_id: `version:${typedVersion.slice(typedVersion.indexOf(":") + 1)}`, lifecycle: content.state, projection: caseResourceProjectionFromCanonicalContent(family.kind, content), search: content.state === "active" ? caseSearchDocument(family.kind, content, facets) : null });
    relationships.push(...caseRelationshipProjectionsFromCanonicalContent(family.kind, family.family_id, content));
  }
  resources.sort((a, b) => a.resource_id.localeCompare(b.resource_id)); relationships.sort((a, b) => a.relationship_id.localeCompare(b.relationship_id));
  return { resources, relationships };
}
