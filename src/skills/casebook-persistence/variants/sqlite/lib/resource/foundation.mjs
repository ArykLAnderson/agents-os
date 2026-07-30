import path from "node:path";
import { validateAuthorityConfiguration } from "../../../../shared/config.mjs";
import { failure, RETRY_DISPOSITIONS, success } from "../../../../shared/protocol.mjs";
import { inspectStore, invokeSubstrateOperation } from "../substrate/index.mjs";
import { rebuildFinalProjections } from "../substrate/cutover.mjs";
import { canonicalCommitRequestDigest, mechanicalDigest } from "../substrate/mechanical.mjs";
import { probeSqlite, selectSqliteBinary, sqlite } from "../substrate/diagnostics.mjs";
import { ResourceCapabilityError } from "./registry.mjs";
import { createOwnerLifecycleRegistry, OwnerLifecycleCapabilityError } from "./owner-lifecycle.mjs";
import { executeBoundedGraph } from "./graph-query.mjs";

const ID = /^[a-z][a-z0-9_-]*:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KIND = /^[a-z][a-z0-9_-]{0,63}$/;
const MAX_RESOURCES = 256;
const MAX_RELATIONSHIPS = 1024;

class FoundationError extends Error {
  constructor(code, message, failureClass = "representation_invalid") {
    super(message);
    this.code = code;
    this.failureClass = failureClass;
  }
}

function sqlText(value) {
  if (value == null) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}
function object(value) { return value && typeof value === "object" && !Array.isArray(value); }
function string(value, field, max = 1024) {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new FoundationError("resource_delta_invalid", `${field} must be a non-empty bounded string.`);
  return value;
}
function id(value, field) {
  string(value, field, 128);
  if (!ID.test(value)) throw new FoundationError("resource_delta_invalid", `${field} must be a stable UUID identity.`);
  return value;
}
function kind(value, field) {
  string(value, field, 64);
  if (!KIND.test(value)) throw new FoundationError("resource_delta_invalid", `${field} is invalid.`);
  return value;
}
function projection(value, field) {
  if (!object(value)) throw new FoundationError("resource_delta_invalid", `${field} must be an object.`);
  return value;
}

function normalizeDelta(registry, envelope, delta) {
  if (!object(delta) || !Array.isArray(delta.resources) || !Array.isArray(delta.relationships)
    || delta.resources.length > MAX_RESOURCES || delta.relationships.length > MAX_RELATIONSHIPS) {
    throw new FoundationError("resource_delta_invalid", "resource_delta must contain bounded resources and relationships arrays.");
  }
  const selections = new Map(envelope.revision.selections.map((item) => [item.family_id, item.version_id]));
  const resources = [];
  const resourceIds = new Set();
  for (const raw of delta.resources) {
    if (!object(raw)) throw new FoundationError("resource_delta_invalid", "Each resource delta must be an object.");
    const resourceKind = kind(raw.resource_kind, "resource_kind");
    registry.resolve(envelope.owner.kind, resourceKind);
    const resourceId = id(raw.resource_id, "resource_id");
    const identityKind = resourceId.slice(0, resourceId.indexOf(":"));
    if (identityKind.replaceAll("-", "_") !== resourceKind || resourceIds.has(resourceId)) throw new FoundationError("resource_delta_invalid", "Resource identities must be kind-prefixed and unique in the delta.");
    resourceIds.add(resourceId);
    const familyId = id(raw.family_id, "family_id");
    const versionId = id(raw.version_id, "version_id");
    if (selections.get(familyId) !== versionId) throw new FoundationError("resource_delta_invalid", "Each resource must bind a version selected by this owner revision.");
    if (!["active", "tombstoned", "hidden"].includes(raw.lifecycle)) throw new FoundationError("resource_delta_invalid", "Resource lifecycle is invalid.");
    let search = null;
    if (raw.search != null) {
      if (!object(raw.search)) throw new FoundationError("resource_delta_invalid", "Resource search document is invalid.");
      search = { text: string(raw.search.text, "search.text", 64 * 1024), metadata: projection(raw.search.metadata, "search.metadata") };
    }
    if (raw.lifecycle !== "active" && search) throw new FoundationError("resource_delta_invalid", "Hidden or tombstoned resources cannot produce search metadata.");
    resources.push({ resource_id: resourceId, resource_kind: resourceKind, family_id: familyId, version_id: versionId, lifecycle: raw.lifecycle, projection: projection(raw.projection, "projection"), search });
  }
  const aggregateResources = resources.filter((resource) => resource.lifecycle === "active");
  for (const resource of aggregateResources) {
    let expected;
    try { expected = registry.projectSearch(envelope.owner.kind, resource.resource_kind, { projection: resource.projection, facets: aggregateResources }); }
    catch (error) {
      if (error instanceof ResourceCapabilityError) throw error;
      throw new FoundationError("resource_delta_invalid", "The aggregate search document could not be derived from the canonical resource projection.");
    }
    // Aggregate schemas may explicitly opt a resource family out of lexical
    // projection by returning null. The foundation still validates that no
    // caller-supplied search document was smuggled in for that family.
    if (expected == null) {
      if (resource.search != null) throw new FoundationError("resource_delta_invalid", "A non-searchable aggregate resource cannot supply a search document.");
      resource.search = null;
    } else {
      if (!resource.search || registry.validateSearch(envelope.owner.kind, resource.resource_kind, { expected, actual: resource.search }) !== true) throw new FoundationError("resource_delta_invalid", "The supplied search document does not exactly match the aggregate-owned projection.");
      resource.search = expected;
    }
  }
  const relationships = [];
  const relationshipIds = new Set();
  for (const raw of delta.relationships) {
    if (!object(raw) || !object(raw.target)) throw new FoundationError("resource_delta_invalid", "Each relationship delta must be explicit and fully identified.");
    const relationshipId = id(raw.relationship_id, "relationship_id");
    const sourceResourceId = id(raw.source_resource_id, "source_resource_id");
    if (relationshipIds.has(relationshipId)) throw new FoundationError("resource_delta_invalid", "Relationships must be unique in this complete resource delta.");
    relationshipIds.add(relationshipId);
    relationships.push({ relationship_id: relationshipId, source_resource_id: sourceResourceId, target: { kind: kind(raw.target.kind, "target.kind"), id: id(raw.target.id, "target.id") }, predicate: string(raw.predicate, "predicate", 256), metadata: projection(raw.metadata, "metadata") });
  }
  return { schema: "casebook-owner-resource-delta@1", resources, relationships };
}

async function queryJson(binary, database, query) {
  const { stdout } = await sqlite(binary, database, `PRAGMA query_only=ON;\n${query}`, { args: ["-batch", "-bail", "-json", "-cmd", ".timeout 5000"], maxBuffer: 16 * 1024 * 1024 });
  return JSON.parse(stdout || "[]");
}

async function prepare(configuration, minimumSchemaVersion = 1) {
  const selectedConfiguration = validateAuthorityConfiguration(configuration);
  if (selectedConfiguration.authority_mode !== "sqlite") throw new FoundationError("sqlite_authority_required", "Resource operations require SQLite authority.", "configuration_or_store_unavailable");
  const selected = await selectSqliteBinary();
  const probe = await probeSqlite(selected.path, path.dirname(selectedConfiguration.sqlite.store_path));
  if (!probe.ok) throw new FoundationError("sqlite_feature_unsupported", "SQLite does not provide the required resource projection features.", "asset_incompatible");
  const state = await inspectStore(selected.path, selectedConfiguration.sqlite.store_path);
  if (state.status !== "available") throw new FoundationError(state.code ?? "store_unavailable", "The resource store is unavailable.", state.status === "migration_required" ? "schema_migration_required" : "store_unavailable");
  if (state.metadata.schema_version !== minimumSchemaVersion) throw new FoundationError("resource_schema_incompatible", "Resource operations require the exact FINAL schema.", "schema_migration_required");
  return { binary: selected.path, storePath: selectedConfiguration.sqlite.store_path, state };
}

function viewFields(request) {
  if (!object(request.context) || !ID.test(request.context.view_id ?? "") || !ID.test(request.context.view_policy_revision_id ?? "")) throw new FoundationError("view_invalid", "An exact view and policy revision are required.", "view_invalid");
  return request.context;
}

async function exactActiveView(prepared, context) {
  const rows = await queryJson(prepared.binary, prepared.storePath, `SELECT 1 AS valid FROM view_policy_revisions WHERE view_policy_revision_id=${sqlText(context.view_policy_revision_id)} AND view_id=${sqlText(context.view_id)} AND lifecycle='active' AND audience_ceiling='private' LIMIT 1;`);
  return rows.length === 1;
}

function visibleJoin(context, ownerAlias = "o") {
  return `JOIN view_policy_namespace_grants grant ON grant.namespace_id=${ownerAlias}.home_namespace_id AND grant.view_policy_revision_id=${sqlText(context.view_policy_revision_id)}
    JOIN view_policy_revisions policy ON policy.view_policy_revision_id=grant.view_policy_revision_id
      AND policy.view_id=${sqlText(context.view_id)} AND policy.lifecycle='active' AND policy.audience_ceiling='private'
    JOIN json_each(policy.object_kinds_json) allowed_kind ON allowed_kind.value=${ownerAlias}.owner_kind`;
}

function publicResource(row) {
  return {
    id: row.resource_id, kind: row.resource_kind, lifecycle: row.lifecycle,
    owner: { id: row.owner_id, kind: row.owner_kind, home_namespace_id: row.home_namespace_id },
    owner_revision: { id: row.owner_revision_id, number: row.owner_revision },
    family_id: row.family_id, version_id: row.version_id, projection: JSON.parse(row.projection_json),
  };
}

const SEARCH_LIMIT_MAX = 100;
const SEARCH_CURSOR_MAX = 8192;
const SEARCH_SORT = "rank_desc_kind_unicode_scalar_asc_id_unicode_scalar_asc";
const GRAPH_NODE_LIMIT_MAX = 100;
const GRAPH_DEPTH_MAX = 8;
const GRAPH_PREDICATE_MAX = 32;
function graphPredicates(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > GRAPH_PREDICATE_MAX) throw new FoundationError("graph_predicate_invalid", "Graph predicates must be a bounded array.");
  const result = value.map((item) => string(item, "predicates[]", 256).normalize("NFC"));
  result.sort(codepointCompare);
  if (result.some((item, index) => index > 0 && item === result[index - 1])) throw new FoundationError("graph_predicate_invalid", "Graph predicates must be unique.");
  return result;
}
function graphNodeLimit(value) {
  const selected = value == null ? GRAPH_NODE_LIMIT_MAX : value;
  if (!Number.isSafeInteger(selected) || selected < 1 || selected > GRAPH_NODE_LIMIT_MAX) throw new FoundationError("graph_node_limit_invalid", `Graph node limit must be between 1 and ${GRAPH_NODE_LIMIT_MAX}.`);
  return selected;
}
function graphDepth(value, required) {
  const selected = value == null ? GRAPH_DEPTH_MAX : value;
  if (!Number.isSafeInteger(selected) || selected < 0 || selected > GRAPH_DEPTH_MAX || (!required && value != null)) throw new FoundationError("graph_depth_invalid", `Graph depth must be between 0 and ${GRAPH_DEPTH_MAX}.`);
  return selected;
}
function searchTokens(value) {
  if (typeof value !== "string" || value.length > 1024) throw new FoundationError("search_query_invalid", "The lexical query must be a bounded string.");
  const tokens = [...new Set(value.normalize("NFKC").toLocaleLowerCase("en-US").match(/[\p{L}\p{N}_-]+/gu) ?? [])];
  if (!tokens.length || tokens.length > 32) throw new FoundationError("search_query_invalid", "The lexical query must contain bounded searchable tokens.");
  return tokens;
}
function ftsQuery(tokens) { return tokens.map((token) => `"${token.replaceAll('"', '""')}"`).join(" AND "); }
function codepointCompare(left, right) {
  const a = Array.from(String(left ?? ""), (value) => value.codePointAt(0));
  const b = Array.from(String(right ?? ""), (value) => value.codePointAt(0));
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  return a.length - b.length;
}
function normalizedFacetFilters(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 16) throw new FoundationError("search_facet_filter_invalid", "Facet filters must be a bounded array.");
  const filters = value.map((facet) => {
    if (!object(facet) || Object.keys(facet).some((key) => !["key", "value"].includes(key))) throw new FoundationError("search_facet_filter_invalid", "Each facet filter must contain only key and value.");
    return { key: string(facet.key, "facets.key", 128).normalize("NFC"), value: string(facet.value, "facets.value", 256).normalize("NFC") };
  });
  filters.sort((left, right) => codepointCompare(left.key, right.key) || codepointCompare(left.value, right.value));
  if (filters.some((facet, index) => index && facet.key === filters[index - 1].key && facet.value === filters[index - 1].value)) throw new FoundationError("search_facet_filter_invalid", "Facet filters must be unique.");
  return filters;
}
function cursorBinding(request, tokens, facets, limit, hydrate, profile) {
  return mechanicalDigest({ store_id: request.store_id, view_id: request.context.view_id, policy_revision_id: request.context.view_policy_revision_id, tokens, resource_kinds: [request.resource_kind], facets, limit, hydrate, sort: SEARCH_SORT, ranking: profile.ranking, projection_schema: profile.projection_schema });
}
function makeSearchCursor(offset, fence, binding) {
  const payload = { v: 1, offset, fence, binding };
  return Buffer.from(JSON.stringify({ payload, integrity: mechanicalDigest(payload) }), "utf8").toString("base64url");
}
function parseSearchCursor(value, binding) {
  if (value == null) return null;
  if (typeof value !== "string" || !value.length || value.length > SEARCH_CURSOR_MAX) throw new FoundationError("search_cursor_invalid", "The search cursor is malformed or oversized.");
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) throw new Error();
    const cursor = JSON.parse(bytes.toString("utf8"));
    if (!object(cursor) || !object(cursor.payload) || Object.keys(cursor).sort().join(",") !== "integrity,payload" || Object.keys(cursor.payload).sort().join(",") !== "binding,fence,offset,v"
      || cursor.payload.v !== 1 || !Number.isSafeInteger(cursor.payload.offset) || cursor.payload.offset < 0 || !Number.isSafeInteger(cursor.payload.fence) || cursor.payload.fence < 0
      || typeof cursor.payload.binding !== "string" || cursor.integrity !== mechanicalDigest(cursor.payload)) throw new Error();
    if (cursor.payload.binding !== binding) throw new FoundationError("search_cursor_mismatch", "The search cursor does not bind this exact query.");
    return cursor.payload;
  } catch (error) {
    if (error instanceof FoundationError) throw error;
    throw new FoundationError("search_cursor_invalid", "The search cursor is malformed or tampered.");
  }
}
function searchableFieldStrings(value, output = []) {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) for (const item of value) searchableFieldStrings(item, output);
  else if (object(value)) for (const item of Object.values(value)) searchableFieldStrings(item, output);
  return output;
}
function canonicalSelectionSets(rows) {
  const selections = new Map();
  for (const row of rows) {
    let canonicalContent;
    try { canonicalContent = JSON.parse(row.canonical_content_json); }
    catch { throw new FoundationError("search_projection_corrupt", "Canonical selected resource content is unreadable.", "projection_corrupt"); }
    if (mechanicalDigest(canonicalContent) !== row.canonical_content_digest) throw new FoundationError("search_projection_corrupt", "Canonical selected resource content digest is invalid.", "projection_corrupt");
    const key = `${row.owner_id}\0${row.owner_revision_id}`;
    const selected = selections.get(key) ?? [];
    if (selected.some((resource) => resource.family_id === row.family_id || resource.version_id === row.version_id)) throw new FoundationError("search_projection_corrupt", "Canonical selected resource identities are duplicated.", "projection_corrupt");
    selected.push({ family_id: row.family_id, version_id: row.version_id, canonical_content: canonicalContent });
    selections.set(key, selected);
  }
  return selections;
}
function validateSearchProjection(registry, row, selectedResources) {
  let metadata;
  try { metadata = JSON.parse(row.metadata_json); }
  catch { throw new FoundationError("search_projection_corrupt", "The searchable projection metadata is unreadable.", "projection_corrupt"); }
  if (!selectedResources?.length) throw new FoundationError("search_projection_corrupt", "Canonical selected resource content is unavailable.", "projection_corrupt");
  const canonical = selectedResources.find((resource) => resource.family_id === row.family_id && resource.version_id === row.version_id);
  if (!canonical) throw new FoundationError("search_projection_corrupt", "The searchable projection is not bound to the exact selected canonical version.", "projection_corrupt");
  let expected;
  try { expected = registry.projectSearch(row.owner_kind, row.resource_kind, { canonical_content: canonical.canonical_content, selected_resources: selectedResources }); }
  catch { throw new FoundationError("search_projection_corrupt", "The canonical searchable projection could not be reconstructed.", "projection_corrupt"); }
  const actual = { text: row.search_text, metadata };
  if (row.fts_text !== row.search_text || registry.validateSearch(row.owner_kind, row.resource_kind, { expected, actual }) !== true) {
    throw new FoundationError("search_projection_corrupt", "The searchable projection does not exactly match canonical selected content.", "projection_corrupt");
  }
  return { metadata, canonicalContent: canonical.canonical_content };
}
function occurrenceRank(fields, tokens) {
  const text = searchableFieldStrings(Object.values(fields)).join("\n").normalize("NFKC").toLocaleLowerCase("en-US");
  return tokens.reduce((score, token) => { let offset = 0; while ((offset = text.indexOf(token, offset)) !== -1) { score += 1; offset += Math.max(token.length, 1); } return score; }, 0);
}
function authorizedSnippet(fields, tokens) {
  for (const [field, raw] of Object.entries(fields)) for (const value of searchableFieldStrings(raw)) {
    const normalized = value.normalize("NFKC");
    const lower = normalized.toLocaleLowerCase("en-US");
    const offsets = tokens.map((token) => lower.indexOf(token)).filter((offset) => offset >= 0);
    if (!offsets.length) continue;
    const at = Math.min(...offsets), start = Math.max(0, at - 40), end = Math.min(normalized.length, at + 120);
    return { field, text: `${start ? "…" : ""}${normalized.slice(start, end)}${end < normalized.length ? "…" : ""}` };
  }
  return null;
}
function emptySearchResult({ fence, context, limit, hydrate, profile }) {
  return { status: "found", matches: [], total: 0, operation_fence: fence, canonical_fence: `sqlite:${fence}`, applied_view: { view_id: context.view_id, view_policy_revision_id: context.view_policy_revision_id }, visibility_context: { audience_ceiling: "private", authorization: "exact-active-policy" }, index_implementation: "sqlite-fts5", projection_schema: profile.projection_schema, ranking: profile.ranking, stable_sort: SEARCH_SORT, bounds: { limit, returned: 0, authorized_total: 0, completeness: "complete" }, hydration: hydrate ? "canonical-current" : "compact", next_cursor: null };
}

async function diagnoseStore(request) {
  const selected = await selectSqliteBinary();
  const state = await inspectStore(selected.path, request.store_path);
  if (state.status !== "available" || state.metadata.schema_version !== 1) return { status: "schema_incompatible", components: [state.code ?? state.status] };
  const checks = await queryJson(selected.path, request.store_path, `SELECT
    (SELECT count(*) FROM resource_current r JOIN owner_current c ON c.owner_id=r.owner_id AND c.revision_id=r.owner_revision_id) aligned_current,
    (SELECT count(*) FROM resource_current) current_count,
    (SELECT count(*) FROM resource_search_fts) fts_count,
    (SELECT count(*) FROM resource_search_current) search_count,
    (SELECT count(*) FROM pragma_foreign_key_check) foreign_key_violations,
    (SELECT quick_check FROM pragma_quick_check) quick_check;`);
  const value = checks[0], components = [];
  if (value.aligned_current !== value.current_count) components.push("resource_current");
  if (value.fts_count !== value.search_count) components.push("resource_search_fts");
  if (value.foreign_key_violations !== 0 || value.quick_check !== "ok") components.push("sqlite_integrity");
  return { status: components.length ? "projection_corrupt" : "healthy", components, operation_fence: state.operation_fence };
}

async function rebuildStore(request) {
  if (request?.authority_claim?.human_authorized !== true || typeof request.authority_claim.human_confirmation_reference !== "string" || !request.authority_claim.human_confirmation_reference.trim()) throw new FoundationError("human_authority_claim_required", "Resource projection rebuild requires explicit human confirmation.", "authority_required");
  const selected = await selectSqliteBinary();
  const state = await inspectStore(selected.path, request.store_path);
  if (state.status !== "available" || state.metadata.schema_version !== 1) return { status: "schema_incompatible", components: [state.code ?? state.status] };
  return rebuildFinalProjections(request.store_path, state.operation_fence, { fault: process.env.CASEBOOK_PERSISTENCE_TEST_FAULT === "resource_rebuild_before_commit" });
}

export function createResourceFoundation({ registry, ownerLifecycles = createOwnerLifecycleRegistry(), minimumSchemaVersion = 1 }) {
  if (!registry || typeof registry.resolve !== "function" || typeof registry.assertResourceKind !== "function") throw new FoundationError("resource_capability_invalid", "A closed resource capability registry is required.");
  if (!ownerLifecycles || typeof ownerLifecycles.currentPredicate !== "function") throw new FoundationError("owner_lifecycle_capability_invalid", "A closed owner lifecycle registry is required.");
  const ownerCurrent = (ownerAlias, revisionExpression) => ownerLifecycles.currentPredicate({ ownerAlias, revisionExpression });
  const implementation = {
    async admit(request) {
      const context = viewFields(request);
      const prepared = await prepare(request.configuration, minimumSchemaVersion);
      if (!await exactActiveView(prepared, context)) return failure("view_invalid", "The exact active view-policy revision is unavailable.", { failureClass: "view_invalid", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE, evidence: {} });
      if (request.store_id !== prepared.state.metadata.store_id) return failure("store_target_mismatch", "The request does not target the resolved immutable store identity.", { failureClass: "configuration_or_store_unavailable", retryDisposition: RETRY_DISPOSITIONS.NEVER, evidence: {} });
      return success("resource.admit", { status: "available", operation_fence: prepared.state.operation_fence });
    },
    async commit(request) {
      const delta = normalizeDelta(registry, request.envelope, request.resource_delta);
      const envelope = { ...structuredClone(request.envelope), resource_delta: delta };
      envelope.request_digest = canonicalCommitRequestDigest(envelope.store_id, request.context, envelope);
      const response = await invokeSubstrateOperation({ ...request, envelope });
      return response;
    },
    async resolveCaseAlias(request) {
      const context = viewFields(request);
      const prepared = await prepare(request.configuration, minimumSchemaVersion);
      if (!await exactActiveView(prepared, context)) return failure("view_invalid", "The exact active view-policy revision is unavailable.", { failureClass: "view_invalid", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE, evidence: {} });
      if (request.store_id !== prepared.state.metadata.store_id) return success("case.resolve", { status: "not_visible", operation_fence: prepared.state.operation_fence });
      const namespaceId = id(request.namespace_id, "namespace_id");
      const alias = string(request.alias, "alias", 256).normalize("NFC");
      const normalized = alias.trim().toLocaleLowerCase("en-US");
      const rows = await queryJson(prepared.binary, prepared.storePath, `SELECT a.case_id,a.owner_revision_id,c.revision_number,o.owner_kind,o.home_namespace_id
        FROM case_alias_current a JOIN owners o ON o.owner_id=a.case_id ${visibleJoin(context)}
        JOIN owner_current c ON c.owner_id=o.owner_id AND c.revision_id=a.owner_revision_id
        WHERE a.namespace_id=${sqlText(namespaceId)} AND a.normalized_alias=${sqlText(normalized)}
          AND o.owner_kind='case' AND ${ownerCurrent("o", "a.owner_revision_id")} LIMIT 1;`);
      if (!rows.length) return success("case.resolve", { status: "not_visible", operation_fence: prepared.state.operation_fence });
      return success("case.resolve", { status: "found", identity: { id: rows[0].case_id, kind: "case" }, owner: { id: rows[0].case_id, kind: "case", home_namespace_id: rows[0].home_namespace_id }, owner_revision: { id: rows[0].owner_revision_id, number: rows[0].revision_number }, lifecycle: "active", operation_fence: prepared.state.operation_fence, applied_view: { view_id: context.view_id, view_policy_revision_id: context.view_policy_revision_id } });
    },
    async resolve(request) {
      registry.assertResourceKind(request.resource_kind);
      id(request.resource_id, "resource_id");
      const context = viewFields(request);
      const prepared = await prepare(request.configuration, minimumSchemaVersion);
      if (!await exactActiveView(prepared, context)) return failure("view_invalid", "The exact active view-policy revision is unavailable.", { failureClass: "view_invalid", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE, evidence: {} });
      if (request.store_id !== prepared.state.metadata.store_id) return success("resource.resolve", { status: "not_visible", operation_fence: prepared.state.operation_fence });
      const selector = request.selector;
      if (!object(selector) || (selector.current === true) === (typeof selector.owner_revision_id === "string" || typeof selector.version_id === "string")) throw new FoundationError("resource_selector_invalid", "Select current or exact immutable history.");
      const current = selector.current === true;
      let rows;
      if (current) {
        rows = await queryJson(prepared.binary, prepared.storePath, `SELECT r.*,o.owner_kind,o.home_namespace_id FROM resource_current r JOIN owners o ON o.owner_id=r.owner_id ${visibleJoin(context)} WHERE r.resource_id=${sqlText(request.resource_id)} AND r.resource_kind=${sqlText(request.resource_kind)} AND r.lifecycle='active' AND ${ownerCurrent("o", "r.owner_revision_id")} LIMIT 1;`);
      } else {
        const revisionFilter = selector.owner_revision_id == null ? "" : `AND r.revision_id=${sqlText(id(selector.owner_revision_id, "owner_revision_id"))}`;
        const versionFilter = selector.version_id == null ? "" : `AND v.version_id=${sqlText(id(selector.version_id, "version_id"))}`;
        rows = await queryJson(prepared.binary, prepared.storePath, `SELECT b.family_id AS resource_id,${sqlText(request.resource_kind)} AS resource_kind,o.owner_id,r.revision_id AS owner_revision_id,r.revision_number AS owner_revision,b.family_id,s.version_id,
          CASE WHEN json_extract(v.content_json,'$.state')='tombstoned' OR json_extract(v.content_json,'$.lifecycle')='tombstoned' THEN 'tombstoned' ELSE 'active' END AS lifecycle,
          v.content_json AS canonical_content_json,o.owner_kind,o.home_namespace_id
          FROM owner_family_bindings b JOIN owners o ON o.owner_id=b.owner_id ${visibleJoin(context)}
          JOIN owner_revisions r ON r.owner_id=o.owner_id ${revisionFilter}
          JOIN owner_revision_selections s ON s.revision_id=r.revision_id AND s.family_id=b.family_id
          JOIN owner_versions v ON v.version_id=s.version_id AND v.owner_id=o.owner_id AND v.family_id=b.family_id
          WHERE b.family_id=${sqlText(request.resource_id)} ${versionFilter} ORDER BY r.revision_number DESC LIMIT 1;`);
        if (rows.length) {
          registry.resolve(rows[0].owner_kind, rows[0].resource_kind);
          const canonical = JSON.parse(rows[0].canonical_content_json);
          rows[0].projection_json = JSON.stringify(registry.hydrate(rows[0].owner_kind, rows[0].resource_kind, { resource_id: rows[0].resource_id, canonical_content: canonical }));
        }
      }
      if (!rows.length || rows[0].lifecycle === "hidden") return success("resource.resolve", { status: "not_visible", operation_fence: prepared.state.operation_fence });
      registry.resolve(rows[0].owner_kind, rows[0].resource_kind);
      return success("resource.resolve", { status: "found", resource: publicResource(rows[0]), operation_fence: prepared.state.operation_fence, applied_view: { view_id: context.view_id, view_policy_revision_id: context.view_policy_revision_id } });
    },
    async resolveBinding(request) {
      registry.assertResourceKind(request.resource_kind);
      id(request.resource_id, "resource_id");
      const context = viewFields(request);
      const prepared = await prepare(request.configuration, minimumSchemaVersion);
      if (!await exactActiveView(prepared, context)) return failure("view_invalid", "The exact active view-policy revision is unavailable.", { failureClass: "view_invalid", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE, evidence: {} });
      if (request.store_id !== prepared.state.metadata.store_id) return success("resource.resolve_binding", { status: "not_visible", operation_fence: prepared.state.operation_fence });
      const selector = request.selector;
      if (!object(selector) || ((selector.current === true) === (typeof selector.owner_revision_id === "string"))) throw new FoundationError("resource_selector_invalid", "Select current or one exact owner revision.");
      const current = selector.current === true;
      const revisionJoin = current
        ? "JOIN owner_current revision ON revision.owner_id=b.owner_id"
        : `JOIN owner_revisions revision ON revision.owner_id=b.owner_id AND revision.revision_id=${sqlText(id(selector.owner_revision_id, "owner_revision_id"))}`;
      const ownerLifecycle = current ? `AND ${ownerCurrent("o", "revision.revision_id")}` : "";
      const rows = await queryJson(prepared.binary, prepared.storePath, `SELECT b.family_id,o.owner_id,o.owner_kind,o.home_namespace_id,revision.revision_id,revision.revision_number,selection.version_id,
          (SELECT operation_fence FROM store_fence WHERE singleton=1) AS operation_fence
        FROM owner_family_bindings b JOIN owners o ON o.owner_id=b.owner_id ${visibleJoin(context)} ${revisionJoin}
        JOIN owner_revision_selections selection ON selection.revision_id=revision.revision_id AND selection.family_id=b.family_id
        WHERE b.family_id=${sqlText(request.resource_id)} ${ownerLifecycle} LIMIT 1;`);
      if (!rows.length) return success("resource.resolve_binding", { status: "not_visible", operation_fence: prepared.state.operation_fence });
      registry.resolve(rows[0].owner_kind, request.resource_kind);
      return success("resource.resolve_binding", { status: "found", binding: { resource_id: request.resource_id, resource_kind: request.resource_kind, owner: { id: rows[0].owner_id, kind: rows[0].owner_kind, home_namespace_id: rows[0].home_namespace_id }, owner_revision: { id: rows[0].revision_id, number: rows[0].revision_number }, family_id: rows[0].family_id, version_id: rows[0].version_id }, operation_fence: rows[0].operation_fence, applied_view: { view_id: context.view_id, view_policy_revision_id: context.view_policy_revision_id } });
    },
    async search(request) {
      const profile = registry.searchProfile(request.resource_kind);
      const context = viewFields(request);
      if (request.mode != null && request.mode !== "lexical") return failure("unsupported_capability", "Semantic and hybrid search are not available.", { failureClass: "operation_unsupported", retryDisposition: RETRY_DISPOSITIONS.NEVER, evidence: { requested_mode: request.mode } });
      const tokens = searchTokens(request.query);
      const limit = request.limit == null ? 25 : request.limit;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > SEARCH_LIMIT_MAX) throw new FoundationError("search_limit_invalid", `Search limit must be between 1 and ${SEARCH_LIMIT_MAX}.`);
      const hydrate = request.hydrate === true;
      if (request.hydrate != null && typeof request.hydrate !== "boolean") throw new FoundationError("search_hydration_invalid", "Search hydration must be explicit boolean state.");
      const facets = normalizedFacetFilters(request.facets);
      const binding = cursorBinding(request, tokens, facets, limit, hydrate, profile);
      const cursor = parseSearchCursor(request.cursor, binding);
      const prepared = await prepare(request.configuration, minimumSchemaVersion);
      const rows = await queryJson(prepared.binary, prepared.storePath, `WITH candidates AS MATERIALIZED (
          SELECT snapshot.operation_fence,s.resource_id,s.resource_kind,s.metadata_json,s.search_text,f.search_text AS fts_text,
            o.owner_id,o.owner_kind,o.home_namespace_id,r.owner_revision_id,r.owner_revision,r.family_id,r.version_id,r.projection_json,r.lifecycle
          FROM resource_search_fts f
          JOIN resource_search_current s ON s.resource_id=f.resource_id
          JOIN resource_current r ON r.resource_id=s.resource_id AND r.owner_id=s.owner_id AND r.owner_revision_id=s.owner_revision_id AND r.resource_kind=s.resource_kind AND r.lifecycle='active'
          JOIN owner_current current_owner ON current_owner.owner_id=r.owner_id AND current_owner.revision_id=r.owner_revision_id
          JOIN owner_revision_selections canonical_selection ON canonical_selection.revision_id=r.owner_revision_id AND canonical_selection.family_id=r.family_id AND canonical_selection.version_id=r.version_id
          JOIN owner_versions canonical ON canonical.version_id=canonical_selection.version_id AND canonical.family_id=r.family_id AND canonical.owner_id=r.owner_id
          JOIN owners o ON o.owner_id=s.owner_id
          ${visibleJoin(context)} CROSS JOIN store_fence snapshot
          WHERE resource_search_fts MATCH ${sqlText(ftsQuery(tokens))} AND s.resource_kind=${sqlText(request.resource_kind)} AND ${ownerCurrent("o", "r.owner_revision_id")}
        )
        SELECT 'snapshot' AS row_type,snapshot.operation_fence,
          EXISTS(SELECT 1 FROM view_policy_revisions p WHERE p.view_policy_revision_id=${sqlText(context.view_policy_revision_id)} AND p.view_id=${sqlText(context.view_id)} AND p.lifecycle='active' AND p.audience_ceiling='private') AS view_valid,
          (NOT EXISTS(SELECT 1 FROM resource_search_fts fts_integrity LEFT JOIN resource_search_current document ON document.resource_id=fts_integrity.resource_id WHERE document.resource_id IS NULL)
            AND NOT EXISTS(SELECT 1 FROM resource_search_current document
              LEFT JOIN resource_current selected ON selected.resource_id=document.resource_id
              WHERE selected.resource_id IS NULL OR selected.owner_id<>document.owner_id OR selected.owner_revision_id<>document.owner_revision_id OR selected.resource_kind<>document.resource_kind OR selected.lifecycle<>'active'
                OR NOT EXISTS(SELECT 1 FROM owner_current current_owner WHERE current_owner.owner_id=selected.owner_id AND current_owner.revision_id=selected.owner_revision_id)
                OR NOT EXISTS(SELECT 1 FROM owner_revision_selections canonical_selection JOIN owner_versions canonical ON canonical.version_id=canonical_selection.version_id AND canonical.family_id=canonical_selection.family_id AND canonical.owner_id=selected.owner_id WHERE canonical_selection.revision_id=selected.owner_revision_id AND canonical_selection.family_id=selected.family_id AND canonical_selection.version_id=selected.version_id)
                OR (SELECT count(*) FROM resource_search_fts indexed_row WHERE indexed_row.resource_id=document.resource_id)<>1
                OR (SELECT min(indexed_row.search_text) FROM resource_search_fts indexed_row WHERE indexed_row.resource_id=document.resource_id)<>document.search_text)) AS projection_valid,
          NULL AS resource_id,NULL AS resource_kind,NULL AS metadata_json,NULL AS search_text,NULL AS fts_text,NULL AS owner_id,NULL AS owner_kind,NULL AS home_namespace_id,NULL AS owner_revision_id,NULL AS owner_revision,NULL AS family_id,NULL AS version_id,NULL AS projection_json,NULL AS lifecycle,NULL AS canonical_content_json,NULL AS canonical_content_digest
        FROM store_fence snapshot WHERE snapshot.singleton=1
        UNION ALL
        SELECT 'candidate',operation_fence,1,1,resource_id,resource_kind,metadata_json,search_text,fts_text,owner_id,owner_kind,home_namespace_id,owner_revision_id,owner_revision,family_id,version_id,projection_json,lifecycle,NULL,NULL
        FROM candidates
        UNION ALL
        SELECT 'canonical',observation.operation_fence,1,1,NULL,NULL,NULL,NULL,NULL,observation.owner_id,observation.owner_kind,NULL,observation.owner_revision_id,NULL,selected.family_id,selected.version_id,NULL,NULL,version.content_json,version.content_digest
        FROM (SELECT DISTINCT operation_fence,owner_id,owner_kind,owner_revision_id FROM candidates) observation
        JOIN owner_revision_selections selected ON selected.revision_id=observation.owner_revision_id
        JOIN owner_versions version ON version.version_id=selected.version_id AND version.family_id=selected.family_id AND version.owner_id=observation.owner_id;`);
      const snapshot = rows.find((row) => row.row_type === "snapshot");
      if (!snapshot || snapshot.view_valid !== 1) return failure("view_invalid", "The exact active view-policy revision is unavailable.", { failureClass: "view_invalid", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE, evidence: {} });
      if (snapshot.projection_valid !== 1) return failure("search_projection_corrupt", "The searchable projection failed integrity validation.", { failureClass: "projection_corrupt", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR, evidence: {} });
      const fence = snapshot.operation_fence;
      if (cursor && cursor.fence !== fence) throw new FoundationError("search_cursor_fence_advanced", "The canonical store fence advanced after this cursor was issued.", "conflict");
      if (request.store_id !== prepared.state.metadata.store_id) return success("resource.search", emptySearchResult({ fence, context, limit, hydrate, profile }));
      const candidates = rows.filter((row) => row.row_type === "candidate");
      const canonicalByOwnerRevision = canonicalSelectionSets(rows.filter((row) => row.row_type === "canonical"));
      const identities = new Set();
      const authorized = [];
      for (const row of candidates) {
        registry.resolve(row.owner_kind, row.resource_kind);
        if (identities.has(row.resource_id)) throw new FoundationError("search_projection_corrupt", "The FTS projection contains duplicate candidate identities.", "projection_corrupt");
        identities.add(row.resource_id);
        const selectedResources = canonicalByOwnerRevision.get(`${row.owner_id}\0${row.owner_revision_id}`);
        const { metadata, canonicalContent } = validateSearchProjection(registry, row, selectedResources);
        if (!object(metadata.fields) || !Array.isArray(metadata.facets)) throw new FoundationError("search_projection_corrupt", "The searchable projection mechanics are incompatible.", "projection_corrupt");
        if (!facets.every((filter) => metadata.facets.some((facet) => facet.key === filter.key && facet.value === filter.value && facet.visibility === "private"))) continue;
        const rank = occurrenceRank(metadata.fields, tokens);
        authorized.push({ row, metadata, canonicalContent, rank, snippet: authorizedSnippet(metadata.fields, tokens) });
      }
      authorized.sort((left, right) => right.rank - left.rank || codepointCompare(left.row.resource_kind, right.row.resource_kind) || codepointCompare(left.row.resource_id, right.row.resource_id));
      const offset = cursor?.offset ?? 0;
      if (offset > authorized.length) throw new FoundationError("search_cursor_invalid", "The search cursor is outside the authorized result set.");
      const page = authorized.slice(offset, offset + limit);
      const nextOffset = offset + page.length;
      const nextCursor = nextOffset < authorized.length ? makeSearchCursor(nextOffset, fence, binding) : null;
      const matches = page.map(({ row, metadata, canonicalContent, rank, snippet }) => ({
        resource_id: row.resource_id,
        resource_kind: row.resource_kind,
        owner: { id: row.owner_id, kind: row.owner_kind, home_namespace_id: row.home_namespace_id },
        owner_revision: { id: row.owner_revision_id, number: row.owner_revision },
        family_id: row.family_id,
        version_id: row.version_id,
        lifecycle: row.lifecycle,
        visibility: metadata.visibility,
        projection_schema: metadata.schema,
        ranking: { ...profile.ranking, score: rank },
        snippet,
        ...(hydrate ? { resource: registry.hydrate(row.owner_kind, row.resource_kind, { resource_id: row.resource_id, family_id: row.family_id, version_id: row.version_id, owner_revision_id: row.owner_revision_id, canonical_content: canonicalContent }) } : {}),
      }));
      return success("resource.search", { status: "found", matches, total: authorized.length, operation_fence: fence, canonical_fence: `sqlite:${fence}`, applied_view: { view_id: context.view_id, view_policy_revision_id: context.view_policy_revision_id }, visibility_context: { audience_ceiling: "private", authorization: "exact-active-policy" }, index_implementation: "sqlite-fts5", projection_schema: profile.projection_schema, ranking: profile.ranking, stable_sort: SEARCH_SORT, bounds: { limit, returned: matches.length, authorized_total: authorized.length, completeness: nextCursor ? "page_has_more" : "complete" }, hydration: hydrate ? "canonical-current" : "compact", next_cursor: nextCursor });
    },
    async graph(request) {
      registry.resolve("case", request.start?.kind);
      id(request.start?.id, "start.id");
      const shape = request.shape;
      if (!["neighbors", "traverse", "path"].includes(shape)) throw new FoundationError("graph_shape_invalid", "Graph shape is invalid.");
      if (request.mode != null && request.mode !== "explicit") return failure("unsupported_capability", "Computed, similarity, inferred, and semantic graph modes are unavailable.", { failureClass: "operation_unsupported", retryDisposition: RETRY_DISPOSITIONS.NEVER, evidence: { requested_mode: request.mode } });
      if (!["outgoing", "incoming", "both"].includes(request.direction ?? "outgoing")) throw new FoundationError("graph_direction_invalid", "Graph direction is invalid.");
      const direction = request.direction ?? "outgoing";
      const predicates = graphPredicates(request.predicates);
      const nodeLimit = graphNodeLimit(request.node_limit);
      const maxDepth = shape === "neighbors" ? 1 : graphDepth(request.max_depth, true);
      let target = null;
      if (shape === "path") {
        registry.resolve("case", request.target?.kind);
        id(request.target?.id, "target.id");
        target = request.target;
      } else if (request.target != null) throw new FoundationError("graph_target_invalid", "Only graph path accepts a target.");
      const context = viewFields(request);
      const prepared = await prepare(request.configuration, minimumSchemaVersion);
      return executeBoundedGraph({ request, prepared, registry, ownerCurrent, context, shape, direction, predicates, nodeLimit, maxDepth, target });
    },
    async diagnose(request) { return diagnoseStore(request, registry); },
    async rebuild(request) { return rebuildStore(request, registry); },
    async relationships(request) {
      registry.assertResourceKind(request.resource_kind);
      const context = viewFields(request);
      const prepared = await prepare(request.configuration, minimumSchemaVersion);
      if (!await exactActiveView(prepared, context)) return failure("view_invalid", "The exact active view-policy revision is unavailable.", { failureClass: "view_invalid", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE, evidence: {} });
      const rows = await queryJson(prepared.binary, prepared.storePath, `SELECT edge.*,r.resource_kind,o.owner_kind,o.home_namespace_id FROM relationship_current edge JOIN resource_current r ON r.resource_id=edge.source_resource_id AND r.lifecycle='active' JOIN owners o ON o.owner_id=edge.owner_id ${visibleJoin(context)} WHERE edge.source_resource_id=${sqlText(request.resource_id)} AND r.resource_kind=${sqlText(request.resource_kind)} AND ${ownerCurrent("o", "edge.owner_revision_id")} AND (
        EXISTS(SELECT 1 FROM owners target JOIN owner_current target_revision ON target_revision.owner_id=target.owner_id ${visibleJoin(context, "target")} WHERE target.owner_id=edge.target_id AND target.owner_kind=edge.target_kind AND ${ownerCurrent("target", "target_revision.revision_id")})
        OR EXISTS(SELECT 1 FROM resource_current target_resource JOIN owners target ON target.owner_id=target_resource.owner_id ${visibleJoin(context, "target")} WHERE target_resource.resource_id=edge.target_id AND target_resource.resource_kind=edge.target_kind AND target_resource.lifecycle='active' AND ${ownerCurrent("target", "target_resource.owner_revision_id")})
      ) ORDER BY edge.relationship_id LIMIT 256;`);
      for (const row of rows) registry.resolve(row.owner_kind, row.resource_kind);
      return success("resource.relationships", { relationships: rows.map((row) => ({ relationship_id: row.relationship_id, source_resource_id: row.source_resource_id, target: { kind: row.target_kind, id: row.target_id }, predicate: row.predicate, metadata: JSON.parse(row.metadata_json), owner_revision_id: row.owner_revision_id })), operation_fence: prepared.state.operation_fence });
    },
  };
  const guarded = Object.fromEntries(Object.entries(implementation).map(([name, operation]) => [name, async (...args) => {
    try { return await operation(...args); }
    catch (error) {
      if (error instanceof FoundationError || error instanceof ResourceCapabilityError || error instanceof OwnerLifecycleCapabilityError) {
        return failure(error.code, error.message, { failureClass: error.failureClass ?? "operation_unsupported", retryDisposition: RETRY_DISPOSITIONS.NEVER, evidence: {} });
      }
      return failure("resource_foundation_unavailable", "The resource foundation could not complete the operation.", { failureClass: "internal_failure", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR, evidence: {} });
    }
  }]));
  return Object.freeze(guarded);
}

export async function invokeResourceFoundation(operation) {
  try { return await operation(); }
  catch (error) {
    if (error instanceof FoundationError || error instanceof ResourceCapabilityError || error instanceof OwnerLifecycleCapabilityError) return failure(error.code, error.message, { failureClass: error.failureClass ?? "operation_unsupported", retryDisposition: RETRY_DISPOSITIONS.NEVER, evidence: {} });
    return failure("resource_foundation_unavailable", "The resource foundation could not complete the operation.", { failureClass: "internal_failure", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR, evidence: {} });
  }
}
