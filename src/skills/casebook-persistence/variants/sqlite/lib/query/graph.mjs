import path from "node:path";
import { validateAuthorityConfiguration, ConfigurationError } from "../../../../shared/config.mjs";
import { failure, RETRY_DISPOSITIONS, success } from "../../../../shared/protocol.mjs";
import { selectSqliteBinary, probeSqlite, sqlite } from "../substrate/diagnostics.mjs";
import { inspectSuccessorStore } from "../substrate/bootstrap.mjs";
import { AdmissionCapabilityError, FINAL_ADMISSION_REGISTRY, prepareAdmission, profileAdmissionPredicate } from "../resource/admission-guards.mjs";
import { decodeCursor, QueryCursorError, queryBinding, readStoreCursorSecret } from "./cursor.mjs";
import { isStructuralNamespace, requireNamespaceId } from "../context/namespace.mjs";

const ID = /^[a-z][a-z0-9_-]*:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SCOPES = new Set(["exact_namespace"]);
const MAX_NODES = 100, MAX_DEPTH = 8, MAX_EDGES = 1024;
const object = (v) => v && typeof v === "object" && !Array.isArray(v);
const sql = (v) => `'${String(v).replaceAll("'", "''")}'`;
const key = (n) => `${n.kind}\0${n.id}`;
const compare = (a, b) => String(a).localeCompare(String(b), "en-US", { sensitivity: "variant" });
function identity(v, field) { if (!object(v) || Object.keys(v).sort().join(",") !== "id,kind" || typeof v.kind !== "string" || !ID.test(v.id)) throw new GraphError("graph_request_invalid", `${field} must be an exact resource identity.`); return v; }
class GraphError extends Error { constructor(code, message, options = {}) { super(message); this.code = code; this.failureClass = options.failureClass ?? "representation_invalid"; this.retryDisposition = options.retryDisposition ?? RETRY_DISPOSITIONS.NEVER; } }
async function json(binary, store, statement) { const { stdout } = await sqlite(binary, store, `PRAGMA query_only=ON;\n${statement}`, { args: ["-batch", "-bail", "-json"], maxBuffer: 16 * 1024 * 1024 }); return JSON.parse(stdout || "[]"); }
async function prepared(request) { const configuration = validateAuthorityConfiguration(request.configuration); if (configuration.authority_mode !== "sqlite") return { failure: failure("sqlite_authority_required", "Graph query requires SQLite authority.") }; const selected = await selectSqliteBinary(); const probe = await probeSqlite(selected.path, path.dirname(configuration.sqlite.store_path)); if (!probe.ok) return { failure: failure("sqlite_feature_unsupported", "The package-owned runtime is incompatible.") }; const state = await inspectSuccessorStore(selected.path, configuration.sqlite.store_path); if (state.status !== "available") return { failure: failure(state.code ?? "store_unavailable", "The successor store is unavailable.", { failureClass: "store_unavailable", evidence: state.evidence ?? {} }) }; return { binary: selected.path, store: configuration.sqlite.store_path, state, cursorSecret: await readStoreCursorSecret(selected.path, configuration.sqlite.store_path) }; }
function admission(request) { if (!ID.test(request.store_id ?? "") || !ID.test(request.admission_slot_id ?? "")) throw new GraphError("graph_request_invalid", "store and admission identities are required."); return prepareAdmission({ registry: FINAL_ADMISSION_REGISTRY, operation: "query.graph", admissionSlotId: request.admission_slot_id, admission: request.admission }); }
async function allowed(p, a) { return (await json(p.binary, p.store, `SELECT CASE WHEN ${profileAdmissionPredicate(a)} THEN 1 ELSE 0 END ok;`))[0]?.ok === 1; }
async function material(p, scope, namespace) {
  if (!SCOPES.has(scope)) throw new GraphError("graph_scope_invalid", "graph queries require exact_namespace scope.");
  try { namespace = requireNamespaceId(namespace, "namespace_id"); if (isStructuralNamespace(namespace)) throw new GraphError("namespace_structural_only", "namespace:root is structural and cannot be searched as content."); } catch (error) { if (error instanceof GraphError) throw error; throw new GraphError("graph_scope_invalid", "exact_namespace requires a canonical semantic Namespace."); }
  const clause = `placement.namespace_id=${sql(namespace)}`;
  return json(p.binary, p.store, `SELECT q.owner_id,q.revision_id,q.edges_json,q.documents_json,placement.namespace_id FROM owner_query_current q JOIN owner_query_material m ON m.revision_id=q.revision_id JOIN (SELECT owner_id,json_extract(projection_json,'$._mechanical_placement.namespace_id') namespace_id FROM owner_current) placement ON placement.owner_id=q.owner_id WHERE ${clause};`);
}
export function graphRows(rows) {
  const nodes = new Map(), edges = [];
  for (const row of rows) {
    let docs, rawEdges; try { docs = JSON.parse(row.documents_json); rawEdges = JSON.parse(row.edges_json); } catch { throw new GraphError("graph_projection_corrupt", "Canonical graph material is unreadable.", { failureClass: "projection_corrupt" }); }
    for (const doc of docs) if (doc?.resource_id && doc?.resource_kind) nodes.set(key({ kind: doc.resource_kind, id: doc.resource_id }), { kind: doc.resource_kind, id: doc.resource_id, owner_id: row.owner_id, namespace_id: row.namespace_id });
    for (const raw of rawEdges) {
      const source = raw?.source_resource_id ? { kind: String(raw.source_resource_id).split(":", 1)[0], id: raw.source_resource_id } : raw?.from_resource_id ? { kind: String(raw.from_resource_id).split(":", 1)[0], id: raw.from_resource_id } : null;
      const target = raw?.target?.id ? raw.target : raw?.target_id ? { kind: raw.target_kind, id: raw.target_id } : null;
      if (!source || !target || !raw.predicate || !nodes.has(key(source)) || !nodes.has(key(target))) continue; // endpoint authorization precedes disclosure
      edges.push({ edge_id: raw.relationship_id ?? `edge:${row.owner_id}:${edges.length}`, source, target, predicate: raw.predicate, owner_id: row.owner_id });
    }
  }
  edges.sort((a,b) => compare(key(a.source),key(b.source)) || compare(a.predicate,b.predicate) || compare(key(a.target),key(b.target)) || compare(a.edge_id,b.edge_id));
  return { nodes, edges };
}
export async function graphQuery(request) {
  const p = await prepared(request); if (p.failure) return p.failure;
  try {
    const a = admission(request); if (!await allowed(p, a)) return failure("profile_guard_denied", "The selected Profile does not admit graph disclosure.", { failureClass: "profile_guard_denied" });
    const shape = request.operation?.replace("graph.", ""); if (!["neighbors", "traverse", "path"].includes(shape)) throw new GraphError("graph_request_invalid", "operation must select graph.neighbors, graph.traverse, or graph.path.");
    const start = identity(request.start, "start"), target = shape === "path" ? identity(request.target, "target") : null;
    const direction = request.direction ?? "outgoing"; if (!["outgoing", "incoming", "both"].includes(direction)) throw new GraphError("graph_request_invalid", "direction is invalid.");
    const depth = shape === "neighbors" ? 1 : (request.max_depth ?? MAX_DEPTH); if (!Number.isInteger(depth) || depth < 1 || depth > MAX_DEPTH) throw new GraphError("graph_request_invalid", "max_depth is outside bounds.");
    const limit = request.node_limit ?? MAX_NODES; if (!Number.isInteger(limit) || limit < 1 || limit > MAX_NODES) throw new GraphError("graph_request_invalid", "node_limit is outside bounds.");
    const predicates = request.predicates ?? []; if (!Array.isArray(predicates) || predicates.length > 16 || predicates.some((v) => typeof v !== "string" || !v)) throw new GraphError("graph_request_invalid", "predicates are invalid.");
    const scope = request.scope ?? "exact_namespace", namespace = request.namespace_id ?? null;
    const generations = (await json(p.binary, p.store, "SELECT hierarchy_generation h,placement_generation p,resource_generation r FROM store_fence WHERE singleton=1;"))[0];
    const binding = queryBinding({ graph: shape, start, target, direction, depth, limit, predicates: [...predicates].sort(), scope, namespace }); decodeCursor(request.cursor, binding, generations, p.cursorSecret);
    const { nodes, edges } = graphRows(await material(p, scope, namespace));
    if (!nodes.has(key(start))) return failure("graph.not_found_or_not_visible", "The graph start is unknown or not visible.", { failureClass: "not_visible" });
    const visited = new Map([[key(start), 0]]), retained = [], queue = [start]; let truncated = false;
    while (queue.length) { const current = queue.shift(), currentDepth = visited.get(key(current)); if (currentDepth >= depth) continue; for (const edge of edges) { if (predicates.length && !predicates.includes(edge.predicate)) continue; const forward = key(edge.source) === key(current), backward = key(edge.target) === key(current); if (!((direction !== "incoming" && forward) || (direction !== "outgoing" && backward))) continue; const next = forward ? edge.target : edge.source; if (!nodes.has(key(next))) continue; retained.push(edge); if (!visited.has(key(next))) { if (visited.size >= limit) { truncated = true; continue; } visited.set(key(next), currentDepth + 1); queue.push(next); } if (retained.length >= MAX_EDGES) { truncated = true; break; } } }
    let outputNodes = [...visited.entries()].map(([k, d]) => ({ ...nodes.get(k), depth: d })); let outputEdges = retained.filter((e) => visited.has(key(e.source)) && visited.has(key(e.target)));
    let pathFound = null; if (shape === "path") { pathFound = visited.has(key(target)); if (pathFound) { const selected = [], wanted = new Set([key(target)]); let at = target; while (key(at) !== key(start)) { const candidate = outputEdges.filter((e) => (key(e.source) === key(at) ? visited.get(key(e.target)) : key(e.target) === key(at) ? visited.get(key(e.source)) : -1) === visited.get(key(at)) - 1).sort((x,y) => compare(x.edge_id,y.edge_id))[0]; if (!candidate) throw new GraphError("graph_projection_corrupt", "The deterministic path predecessor is unavailable."); selected.push(candidate); at = key(candidate.source) === key(at) ? candidate.target : candidate.source; wanted.add(key(at)); } outputEdges = selected.reverse(); outputNodes = outputNodes.filter((n) => wanted.has(key(n))); } else { outputNodes = outputNodes.filter((n) => key(n) === key(start)); outputEdges = []; } }
    outputNodes.sort((a,b) => a.depth-b.depth || compare(a.kind,b.kind) || compare(a.id,b.id)); outputEdges.sort((a,b) => compare(a.edge_id,b.edge_id));
    if (!await allowed(p, a)) return failure("profile_changed", "The exact Profile selection changed before graph disclosure.", { failureClass: "profile_changed", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE });
    return success(request.operation, { status: "found", profile: a.evidence, nodes: outputNodes.map(({ owner_id, ...n }) => n), edges: outputEdges.map(({ owner_id, ...e }) => e), ...(shape === "path" ? { path_found: pathFound, distance: pathFound ? outputEdges.length : null } : {}), bounds: { max_depth: depth, node_limit: limit, authorized_edge_limit: MAX_EDGES, completeness: truncated ? "truncated" : "complete_within_bounds" }, generations, stable_order: "bfs_depth_then_unicode_scalar@1", next_cursor: null });
  } catch (e) { if (e instanceof GraphError || e instanceof QueryCursorError || e instanceof AdmissionCapabilityError || e instanceof ConfigurationError) return failure(e.code, e.message, { failureClass: e.failureClass ?? "representation_invalid", retryDisposition: e.retryDisposition ?? RETRY_DISPOSITIONS.NEVER }); throw e; }
}
