import path from "node:path";
import { validateAuthorityConfiguration, ConfigurationError } from "../../../../shared/config.mjs";
import { loadAndValidateManifest } from "../../../../shared/manifest.mjs";
import { failure, RETRY_DISPOSITIONS, success } from "../../../../shared/protocol.mjs";
import { selectSqliteBinary, probeSqlite, sqlite } from "../substrate/diagnostics.mjs";
import { inspectSuccessorStore } from "../substrate/bootstrap.mjs";
import { AdmissionCapabilityError, FINAL_ADMISSION_REGISTRY, prepareAdmission, profileAdmissionPredicate } from "../resource/admission-guards.mjs";
import { decodeCursor, encodeCursor, QueryCursorError, queryBinding, readStoreCursorSecret } from "./cursor.mjs";
import { decodeHandoff, encodeHandoff, QueryHandoffError } from "./handoff.mjs";
import { normalizeExactLocator } from "../resource/normalization.mjs";

const ID = /^[a-z][a-z0-9_-]*:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SCOPES = new Set(["chat_default", "global", "workspace", "exact_namespace", "subtree", "ancestors"]);
const LIMIT_MAX = 100;
const object = (v) => v && typeof v === "object" && !Array.isArray(v);
const sql = (v) => v == null ? "NULL" : `'${String(v).replaceAll("'", "''")}'`;
const id = (v, field, prefix = null) => { if (typeof v !== "string" || !ID.test(v) || (prefix && !v.startsWith(`${prefix}:`))) throw new QueryError("query_request_invalid", `${field} must be an exact identity.`); return v; };

export class QueryError extends Error { constructor(code, message, options = {}) { super(message); this.code = code; this.failureClass = options.failureClass ?? "representation_invalid"; this.retryDisposition = options.retryDisposition ?? RETRY_DISPOSITIONS.NEVER; } }

function tokens(value) {
  if (typeof value !== "string" || value.length > 1024) throw new QueryError("query_request_invalid", "query must be a bounded string.");
  const result = [...new Set(value.normalize("NFKC").toLocaleLowerCase("en-US").match(/[\p{L}\p{N}_-]+/gu) ?? [])];
  if (!result.length || result.length > 32) throw new QueryError("query_request_invalid", "query must contain bounded lexical tokens.");
  return result;
}
function fts(value) { return value.map((token) => `"${token.replaceAll('"', '""')}"`).join(" AND "); }
function profileBinding(request, operation) {
  id(request.workspace_id, "workspace_id", "workspace"); id(request.store_id, "store_id", "store"); id(request.admission_slot_id, "admission_slot_id", "admission-slot");
  return prepareAdmission({ registry: FINAL_ADMISSION_REGISTRY, operation, workspaceId: request.workspace_id, admissionSlotId: request.admission_slot_id, admission: request.admission });
}
async function queryJson(binary, storePath, statement) { const { stdout } = await sqlite(binary, storePath, `PRAGMA query_only=ON;\n${statement}`, { args: ["-batch", "-bail", "-json"], maxBuffer: 16 * 1024 * 1024 }); return JSON.parse(stdout || "[]"); }
async function preparedStore(request) {
  const manifest = await loadAndValidateManifest();
  if (!manifest.ok) return { failure: failure("asset_incompatible", "Query assets are incompatible.", { failureClass: "asset_incompatible", evidence: { problems: manifest.problems } }) };
  const configuration = validateAuthorityConfiguration(request.configuration);
  if (configuration.authority_mode !== "sqlite") return { failure: failure("sqlite_authority_required", "Organizational query requires SQLite authority.") };
  const selected = await selectSqliteBinary(), probe = await probeSqlite(selected.path, path.dirname(configuration.sqlite.store_path));
  if (!probe.ok) return { failure: failure("sqlite_feature_unsupported", "The package-owned runtime is incompatible.", { failureClass: "asset_incompatible" }) };
  const state = await inspectSuccessorStore(selected.path, configuration.sqlite.store_path);
  if (state.status !== "available") return { failure: failure(state.code ?? "store_unavailable", "The successor store is unavailable.", { failureClass: "store_unavailable", evidence: state.evidence ?? {} }) };
  return { binary: selected.path, storePath: configuration.sqlite.store_path, state, cursorSecret: await readStoreCursorSecret(selected.path, configuration.sqlite.store_path) };
}
async function profileAllowed(binary, storePath, admission) { return (await queryJson(binary, storePath, `SELECT CASE WHEN ${profileAdmissionPredicate(admission)} THEN 1 ELSE 0 END ok;`))[0]?.ok === 1; }
function filterTags(value) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 16) throw new QueryError("query_request_invalid", "tags must be a bounded array.");
  const tags = value.map((tag) => { if (!object(tag) || Object.keys(tag).sort().join(",") !== "key,value" || typeof tag.key !== "string" || typeof tag.value !== "string" || !tag.key || !tag.value || tag.key.length > 128 || tag.value.length > 256) throw new QueryError("query_request_invalid", "tags must contain exact bounded key/value filters."); return { key: tag.key.normalize("NFC"), value: tag.value.normalize("NFC") }; });
  tags.sort((a, b) => a.key.localeCompare(b.key) || a.value.localeCompare(b.value));
  if (tags.some((tag, i) => i && tag.key === tags[i - 1].key && tag.value === tags[i - 1].value)) throw new QueryError("query_request_invalid", "tags must be unique.");
  return tags;
}
async function scopeClause(binary, storePath, scope, request) {
  if (!SCOPES.has(scope)) throw new QueryError("query_scope_invalid", "scope must be one supported organizational scope.");
  // Workspace is deliberately not a Namespace subtree: it selects every
  // otherwise-admissible object in the already-selected persistence authority.
  if (scope === "workspace") return { clause: "1", ranking_origin: null };
  let namespace = request.namespace_id;
  if (scope === "chat_default") {
    const chat = id(request.chat_id, "chat_id", "chat");
    const row = (await queryJson(binary, storePath, `SELECT c.namespace_id,n.lifecycle FROM context_chat_current c LEFT JOIN context_namespace_current n ON n.namespace_id=c.namespace_id WHERE c.chat_id=${sql(chat)};`))[0];
    if (!row || row.lifecycle !== "active") throw new QueryError("context_stale", "The default Chat binding is unavailable or bound to a retired Namespace.", { failureClass: "context_stale", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
    namespace = row.namespace_id;
  } else {
    namespace = id(namespace, "namespace_id", "namespace");
    const row = (await queryJson(binary, storePath, `SELECT lifecycle FROM context_namespace_current WHERE namespace_id=${sql(namespace)};`))[0];
    if (!row || row.lifecycle !== "active") throw new QueryError("context_stale", "The requested Namespace is unavailable or retired.", { failureClass: "context_stale", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
  }
  // Chat-default and global remain globally inclusive. The Namespace is a
  // disclosed ranking origin, never an implicit narrowing or admission grant.
  if (scope === "chat_default" || scope === "global") return { clause: "1", ranking_origin: namespace };
  if (scope === "exact_namespace") return { clause: `placement.namespace_id=${sql(namespace)}`, ranking_origin: namespace };
  if (scope === "subtree") return { clause: `placement.namespace_id IN (WITH RECURSIVE descendants(namespace_id) AS (SELECT ${sql(namespace)} UNION ALL SELECT n.namespace_id FROM context_namespace_current n JOIN descendants d ON n.parent_namespace_id=d.namespace_id WHERE n.lifecycle='active') SELECT namespace_id FROM descendants)`, ranking_origin: namespace };
  return { clause: `placement.namespace_id IN (WITH RECURSIVE ancestors(namespace_id) AS (SELECT ${sql(namespace)} UNION ALL SELECT n.parent_namespace_id FROM context_namespace_current n JOIN ancestors a ON n.namespace_id=a.namespace_id WHERE n.parent_namespace_id IS NOT NULL) SELECT namespace_id FROM ancestors)`, ranking_origin: namespace };
}
function ranking(text, terms) { const haystack = String(text).normalize("NFKC").toLocaleLowerCase("en-US"); return terms.reduce((score, term) => { let i = 0; while ((i = haystack.indexOf(term, i)) !== -1) { score += 1; i += term.length; } return score; }, 0); }
function proximity(namespace, origin, parents) {
  if (!origin) return { rank: 5, distance: 0, value: "none" };
  if (namespace === origin) return { rank: 0, distance: 0, value: "same" };
  const chain = (start) => { const result = []; let current = start; while (current) { result.push(current); current = parents.get(current) ?? null; } return result; };
  const from = chain(namespace), to = chain(origin), originIndex = from.indexOf(origin), namespaceIndex = to.indexOf(namespace);
  if (originIndex >= 0) return { rank: 1, distance: originIndex, value: "descendant" };
  if (namespaceIndex >= 0) return { rank: 2, distance: namespaceIndex, value: "ancestor" };
  const shared = from.findIndex((item) => to.includes(item));
  return shared >= 0 ? { rank: 3, distance: shared + to.indexOf(from[shared]), value: "shared_ancestor" } : { rank: 4, distance: 0, value: "unrelated" };
}
function snippet(text, terms) { const value = String(text).normalize("NFKC"), lower = value.toLocaleLowerCase("en-US"), hits = terms.map((term) => lower.indexOf(term)).filter((n) => n >= 0); if (!hits.length) return null; const start = Math.max(0, Math.min(...hits) - 40), end = Math.min(value.length, start + 160); return `${start ? "…" : ""}${value.slice(start, end)}${end < value.length ? "…" : ""}`; }
function docText(row) { try { const doc = JSON.parse(row.document_json); return doc.search?.text ?? doc.text ?? ""; } catch { throw new QueryError("query_projection_corrupt", "Canonical query document is unreadable.", { failureClass: "projection_corrupt" }); } }

export async function organizationalSearch(request) {
  const prepared = await preparedStore(request); if (prepared.failure) return prepared.failure;
  try {
    if (request.store_id !== prepared.state.metadata.store_id || request.workspace_id !== prepared.state.metadata.workspace_id) return failure("store_target_mismatch", "The immutable store/workspace identity differs.");
    if (request.mode != null && request.mode !== "lexical") return failure("unsupported_capability", "Only lexical organizational search is available.", { failureClass: "operation_unsupported" });
    const admission = profileBinding(request, "query.search");
    // Profile is deliberately proven before candidate identity, count, snippet,
    // ordering, or cursor parsing/disclosure.
    if (!await profileAllowed(prepared.binary, prepared.storePath, admission)) return failure("profile_guard_denied", "The selected Profile does not admit organizational search.", { failureClass: "profile_guard_denied" });
    const terms = tokens(request.query), scope = request.scope ?? "chat_default", tags = filterTags(request.tags), limit = request.limit ?? 25;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > LIMIT_MAX) throw new QueryError("query_request_invalid", `limit must be between 1 and ${LIMIT_MAX}.`);
    const generations = (await queryJson(prepared.binary, prepared.storePath, "SELECT hierarchy_generation h,placement_generation p,resource_generation r FROM store_fence WHERE singleton=1;"))[0];
    const binding = queryBinding({ scope, namespace_id: request.namespace_id ?? null, chat_id: request.chat_id ?? null, terms, tags, limit, order: "organizational@1" });
    const cursor = decodeCursor(request.cursor, binding, generations, prepared.cursorSecret);
    const scopeDefinition = await scopeClause(prepared.binary, prepared.storePath, scope, request);
    const parents = new Map((await queryJson(prepared.binary, prepared.storePath, "SELECT namespace_id,parent_namespace_id FROM context_namespace_current WHERE lifecycle='active';")).map((row) => [row.namespace_id, row.parent_namespace_id]));
    const tagClause = tags.map((tag) => `AND EXISTS(SELECT 1 FROM json_each(fts.document_json,'$.search.metadata.facets') facet WHERE json_extract(facet.value,'$.key')=${sql(tag.key)} AND json_extract(facet.value,'$.value')=${sql(tag.value)})`).join(" ");
    const rows = await queryJson(prepared.binary, prepared.storePath, `SELECT fts.owner_id,fts.revision_id AS owner_revision_id,fts.resource_id,fts.resource_kind,fts.document_json,q.query_digest,placement.namespace_id
      FROM owner_query_fts fts JOIN owner_query_current q ON q.owner_id=fts.owner_id AND q.revision_id=fts.revision_id
      JOIN owner_current owner ON owner.owner_id=fts.owner_id
      JOIN (SELECT owner_id,json_extract(projection_json,'$._mechanical_placement.namespace_id') namespace_id FROM owner_current) placement ON placement.owner_id=fts.owner_id
      WHERE owner_query_fts MATCH ${sql(fts(terms))} AND ${scopeDefinition.clause} ${tagClause};`);
    const matches = rows.map((row) => { const text = docText(row); return { ...row, text, score: ranking(text, terms), proximity: proximity(row.namespace_id, scopeDefinition.ranking_origin, parents), snippet: snippet(text, terms) }; })
      .sort((a, b) => b.score - a.score || a.proximity.rank - b.proximity.rank || a.proximity.distance - b.proximity.distance || a.resource_kind.localeCompare(b.resource_kind) || a.resource_id.localeCompare(b.resource_id));
    const offset = cursor?.offset ?? 0;
    if (offset > matches.length) throw new QueryError("query_cursor_invalid", "The cursor is outside the authorized result set.");
    const page = matches.slice(offset, offset + limit), next = offset + page.length;
    if (!await profileAllowed(prepared.binary, prepared.storePath, admission)) return failure("profile_changed", "The exact Profile selection changed before organizational search disclosure.", { failureClass: "profile_changed", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
    return success("query.search", {
      status: "found", order: "organizational@1", profile: admission.evidence, generations, total: matches.length,
      bounds: { limit, returned: page.length, completeness: next < matches.length ? "page_has_more" : "complete" },
      matches: page.map((row) => ({
        owner: { id: row.owner_id, revision_id: row.owner_revision_id }, resource: { id: row.resource_id, kind: row.resource_kind },
        namespace_id: row.namespace_id, ranking: { origin: "canonical-lexical", score: row.score, proximity: row.proximity.value, hierarchy_distance: row.proximity.distance }, snippet: row.snippet,
        handoff: encodeHandoff({ owner_id: row.owner_id, owner_revision_id: row.owner_revision_id, resource_id: row.resource_id, resource_kind: row.resource_kind, query_digest: row.query_digest, generations }),
      })),
      next_cursor: next < matches.length ? encodeCursor({ offset: next, binding, generations, secret: prepared.cursorSecret }) : null,
    });
  } catch (error) { if (error instanceof QueryError || error instanceof QueryCursorError || error instanceof AdmissionCapabilityError || error instanceof ConfigurationError) return failure(error.code, error.message, { failureClass: error.failureClass ?? "representation_invalid", retryDisposition: error.retryDisposition ?? RETRY_DISPOSITIONS.NEVER }); throw error; }
}

export async function resolveOrganizationalIdentity(request) {
  const prepared = await preparedStore(request); if (prepared.failure) return prepared.failure;
  try {
    if (request.store_id !== prepared.state.metadata.store_id || request.workspace_id !== prepared.state.metadata.workspace_id) return failure("store_target_mismatch", "The immutable store/workspace identity differs.");
    const admission = profileBinding(request, "query.resolve");
    if (!await profileAllowed(prepared.binary, prepared.storePath, admission)) return failure("profile_guard_denied", "The selected Profile does not admit organizational resolution.", { failureClass: "profile_guard_denied" });
    if (!object(request.selector)) throw new QueryError("query_request_invalid", "selector must be an exact stable identity or Namespace alias selector.");
    let rows;
    if (Object.hasOwn(request.selector, "id")) {
      if (Object.keys(request.selector).join(",") !== "id") throw new QueryError("query_request_invalid", "stable selector must contain only id.");
      const owner = id(request.selector.id, "selector.id");
      rows = await queryJson(prepared.binary, prepared.storePath, `SELECT owner_id,revision_id FROM owner_current WHERE owner_id=${sql(owner)};`);
    } else {
      if (Object.keys(request.selector).sort().join(",") !== "alias,namespace_id") throw new QueryError("query_request_invalid", "alias selector must contain Namespace and alias only.");
      const namespace = id(request.selector.namespace_id, "selector.namespace_id", "namespace");
      if (typeof request.selector.alias !== "string" || !request.selector.alias.trim() || request.selector.alias.length > 256) throw new QueryError("query_request_invalid", "selector.alias must be a bounded string.");
      rows = await queryJson(prepared.binary, prepared.storePath, `SELECT owner_id,owner_revision_id AS revision_id FROM owner_current_claims WHERE claim_type='case-alias' AND namespace_id=${sql(namespace)} AND normalized_value=${sql(normalizeExactLocator(request.selector.alias))} ORDER BY owner_id LIMIT 2;`);
    }
    if (!await profileAllowed(prepared.binary, prepared.storePath, admission)) return failure("profile_changed", "The exact Profile selection changed before identity disclosure.", { failureClass: "profile_changed", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
    if (!rows.length) return success("query.resolve", { status: "zero" });
    if (rows.length > 1) return success("query.resolve", { status: "ambiguous" });
    return success("query.resolve", { status: "found", identity: { id: rows[0].owner_id, revision_id: rows[0].revision_id }, profile: admission.evidence });
  } catch (error) { if (error instanceof QueryError || error instanceof AdmissionCapabilityError || error instanceof ConfigurationError) return failure(error.code, error.message, { failureClass: error.failureClass ?? "representation_invalid", retryDisposition: error.retryDisposition ?? RETRY_DISPOSITIONS.NEVER }); throw error; }
}

export async function hydrateOrganizationalHandoff(request) {
  const prepared = await preparedStore(request); if (prepared.failure) return prepared.failure;
  try {
    if (request.store_id !== prepared.state.metadata.store_id || request.workspace_id !== prepared.state.metadata.workspace_id) return failure("store_target_mismatch", "The immutable store/workspace identity differs.");
    const admission = profileBinding(request, "query.hydrate");
    if (!await profileAllowed(prepared.binary, prepared.storePath, admission)) return failure("profile_guard_denied", "The selected Profile does not admit organizational hydration.", { failureClass: "profile_guard_denied" });
    const handoff = decodeHandoff(request.handoff);
    const generations = (await queryJson(prepared.binary, prepared.storePath, "SELECT hierarchy_generation h,placement_generation p,resource_generation r FROM store_fence WHERE singleton=1;"))[0];
    for (const generation of ["h", "p", "r"]) {
      if (handoff[generation] !== generations[generation]) throw new QueryError(`query_handoff_${generation}_stale`, "The compact handoff no longer matches the current organizational generations.", { failureClass: "conflict", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
    }
    const rows = await queryJson(prepared.binary, prepared.storePath, `SELECT document_json FROM owner_query_fts f JOIN owner_query_current q ON q.owner_id=f.owner_id AND q.revision_id=f.revision_id WHERE f.owner_id=${sql(handoff.owner_id)} AND f.revision_id=${sql(handoff.owner_revision_id)} AND f.resource_id=${sql(handoff.resource_id)} AND f.resource_kind=${sql(handoff.resource_kind)} AND q.query_digest=${sql(handoff.query_digest)} LIMIT 1;`);
    if (!rows.length) return failure("query_handoff_stale", "The compact handoff no longer identifies current canonical query material.", { failureClass: "conflict", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
    if (!await profileAllowed(prepared.binary, prepared.storePath, admission)) return failure("profile_changed", "The exact Profile selection changed before hydration disclosure.", { failureClass: "profile_changed", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
    return success("query.hydrate", { status: "found", document: JSON.parse(rows[0].document_json), profile: admission.evidence });
  } catch (error) { if (error instanceof QueryHandoffError || error instanceof QueryError || error instanceof AdmissionCapabilityError || error instanceof ConfigurationError) return failure(error.code, error.message, { failureClass: error.failureClass ?? "representation_invalid", retryDisposition: error.retryDisposition ?? RETRY_DISPOSITIONS.NEVER }); throw error; }
}
