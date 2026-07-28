import { failure, RETRY_DISPOSITIONS, success } from "../../../../shared/protocol.mjs";
import { mechanicalDigest } from "../substrate/mechanical.mjs";
import { sqlite } from "../substrate/diagnostics.mjs";

export const GRAPH_AUTHORIZED_EDGE_LIMIT = 1024;
export const GRAPH_RAW_ADJACENCY_WORK_LIMIT = 1536;
const GRAPH_EDGE_SENTINEL_LIMIT = GRAPH_AUTHORIZED_EDGE_LIMIT + 1;
const GRAPH_RAW_ADJACENCY_SENTINEL_LIMIT = GRAPH_RAW_ADJACENCY_WORK_LIMIT + 1;
const GRAPH_SORT = "bfs_depth_asc_full_edge_node_unicode_scalar_tuple_asc";

function sqlText(value) {
  if (value == null) return "NULL";
  return `'${String(value).replaceAll("'", "''")}'`;
}
function key(node) { return `${node.kind}\0${node.id}`; }
function codepointCompare(left, right) {
  const a = Array.from(String(left ?? ""), (value) => value.codePointAt(0));
  const b = Array.from(String(right ?? ""), (value) => value.codePointAt(0));
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  return a.length - b.length;
}
function edgeCompare(left, right) {
  return codepointCompare(left.source.kind, right.source.kind)
    || codepointCompare(left.source.id, right.source.id)
    || codepointCompare(left.predicate, right.predicate)
    || codepointCompare(left.target.kind, right.target.kind)
    || codepointCompare(left.target.id, right.target.id)
    || codepointCompare(left.edge_id, right.edge_id);
}
function exactEdge(value) {
  return { relationship_id: value.relationship_id, source_resource_id: value.source_resource_id, target: { kind: value.target.kind, id: value.target.id }, predicate: value.predicate, metadata: value.metadata };
}
function corrupt() {
  return failure("graph_projection_corrupt", "The explicit graph projection failed canonical integrity validation.", { failureClass: "projection_corrupt", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR, evidence: {} });
}
function workBudgetExceeded() {
  return failure("graph_work_budget_exceeded", "The bounded graph work budget was exceeded.", { failureClass: "graph_work_budget_exceeded", retryDisposition: RETRY_DISPOSITIONS.NEVER, evidence: {} });
}
function notVisible(operation) {
  return failure("case.graph.not_found_or_not_visible", "The graph start is unknown or not visible under the exact view.", { failureClass: "case.graph.not_found_or_not_visible", retryDisposition: RETRY_DISPOSITIONS.NEVER, evidence: {} });
}

function visibleOwner(context, alias) {
  return `EXISTS(SELECT 1 FROM view_policy_namespace_grants graph_grant
    JOIN view_policy_revisions graph_policy ON graph_policy.view_policy_revision_id=graph_grant.view_policy_revision_id
      AND graph_policy.view_id=${sqlText(context.view_id)} AND graph_policy.lifecycle='active' AND graph_policy.audience_ceiling='private'
    JOIN json_each(graph_policy.object_kinds_json) graph_kind ON graph_kind.value=${alias}.owner_kind
    WHERE graph_grant.view_policy_revision_id=${sqlText(context.view_policy_revision_id)} AND graph_grant.namespace_id=${alias}.home_namespace_id)`;
}

function resourceColumns(alias = "r") {
  return `${alias}.resource_id,${alias}.resource_kind,${alias}.lifecycle,${alias}.owner_id,${alias}.owner_revision_id,${alias}.owner_revision,${alias}.family_id,${alias}.version_id,${alias}.projection_json,o.owner_kind,o.home_namespace_id,v.content_json,v.content_digest`;
}

function resourceJoin(context, ownerCurrent, alias = "r") {
  return `JOIN owners o ON o.owner_id=${alias}.owner_id
    JOIN owner_current current_owner ON current_owner.owner_id=${alias}.owner_id AND current_owner.revision_id=${alias}.owner_revision_id
    JOIN owner_revision_selections selected ON selected.revision_id=${alias}.owner_revision_id AND selected.family_id=${alias}.family_id AND selected.version_id=${alias}.version_id
    JOIN owner_versions v ON v.owner_id=${alias}.owner_id AND v.family_id=${alias}.family_id AND v.version_id=${alias}.version_id
    WHERE o.owner_kind='case' AND ${alias}.lifecycle IN ('active','tombstoned') AND ${ownerCurrent("o", `${alias}.owner_revision_id`)} AND ${visibleOwner(context, "o")}`;
}

export function buildGraphAdjacencyWorkSql({ depth, direction, predicates = [] }) {
  const predicateSql = predicates.length ? `AND e.predicate IN (${predicates.map(sqlText).join(",")})` : "";
  const branches = direction === "both" ? ["outgoing", "incoming"] : [direction];
  return branches.map((branch) => {
    const outgoing = branch === "outgoing";
    const index = outgoing ? "relationship_current_source_adjacency" : "relationship_current_target_adjacency";
    const adjacency = outgoing
      ? "e.source_resource_id=frontier.resource_id AND substr(e.source_resource_id,1,instr(e.source_resource_id,':')-1)=frontier.resource_kind"
      : "e.target_kind=frontier.resource_kind AND e.target_id=frontier.resource_id";
    return `INSERT INTO graph_raw_work(relationship_id,owner_id,owner_revision_id,source_resource_id,target_kind,target_id,predicate,metadata_json,discovery_depth,direction)
      SELECT e.relationship_id,e.owner_id,e.owner_revision_id,e.source_resource_id,e.target_kind,e.target_id,e.predicate,e.metadata_json,${depth},${sqlText(branch)}
      FROM graph_nodes frontier
      CROSS JOIN relationship_current e INDEXED BY ${index}
      WHERE frontier.depth=${depth} AND ${adjacency} ${predicateSql}
      LIMIT max(0,${GRAPH_RAW_ADJACENCY_SENTINEL_LIMIT}-(SELECT count(*) FROM graph_raw_work));`;
  });
}

async function snapshotRows({ prepared, context, start, target, direction, predicates, nodeLimit, maxDepth, shape, ownerCurrent }) {
  const authorizedAdjacency = direction === "outgoing"
    ? "e.source_resource_id=frontier.resource_id AND e.source_kind=frontier.resource_kind"
    : direction === "incoming"
      ? "e.target_id=frontier.resource_id AND e.target_kind=frontier.resource_kind"
      : "((e.source_resource_id=frontier.resource_id AND e.source_kind=frontier.resource_kind) OR (e.target_id=frontier.resource_id AND e.target_kind=frontier.resource_kind))";
  const edgeSelect = (depth) => `${buildGraphAdjacencyWorkSql({ depth, direction, predicates }).join("\n")}
    INSERT OR IGNORE INTO graph_raw_candidates(relationship_id,owner_id,owner_revision_id,source_resource_id,target_kind,target_id,predicate,metadata_json,discovery_depth)
    SELECT work.relationship_id,work.owner_id,work.owner_revision_id,work.source_resource_id,work.target_kind,work.target_id,work.predicate,work.metadata_json,work.discovery_depth
    FROM graph_raw_work work
    WHERE work.discovery_depth=${depth} AND (SELECT count(*) FROM graph_raw_work)<=${GRAPH_RAW_ADJACENCY_WORK_LIMIT}
    ORDER BY work.source_resource_id,work.predicate,work.target_kind,work.target_id,work.relationship_id,work.direction,work.work_ordinal;
    INSERT OR IGNORE INTO graph_edges(relationship_id,owner_id,owner_revision_id,source_kind,source_resource_id,target_kind,target_id,predicate,metadata_json)
    SELECT e.relationship_id,e.owner_id,e.owner_revision_id,sr.resource_kind,e.source_resource_id,e.target_kind,e.target_id,e.predicate,e.metadata_json
    FROM graph_raw_candidates e
    JOIN owners eo ON eo.owner_id=e.owner_id
    JOIN owner_current eco ON eco.owner_id=e.owner_id AND eco.revision_id=e.owner_revision_id
    JOIN resource_current sr ON sr.resource_id=e.source_resource_id
    JOIN owners so ON so.owner_id=sr.owner_id
    JOIN owner_current sco ON sco.owner_id=sr.owner_id AND sco.revision_id=sr.owner_revision_id
    JOIN resource_current tr ON tr.resource_id=e.target_id AND tr.resource_kind=e.target_kind
    JOIN owners tor ON tor.owner_id=tr.owner_id
    JOIN owner_current tco ON tco.owner_id=tr.owner_id AND tco.revision_id=tr.owner_revision_id
    JOIN resource_current dr ON dr.resource_id=json_extract(e.metadata_json,'$.declaring_resource_id') AND dr.owner_id=e.owner_id AND dr.owner_revision_id=e.owner_revision_id
    WHERE e.discovery_depth=${depth} AND (SELECT count(*) FROM graph_raw_work)<=${GRAPH_RAW_ADJACENCY_WORK_LIMIT}
      AND eo.owner_kind='case' AND so.owner_kind='case' AND tor.owner_kind='case'
      AND ${ownerCurrent("eo", "e.owner_revision_id")} AND ${ownerCurrent("so", "sr.owner_revision_id")} AND ${ownerCurrent("tor", "tr.owner_revision_id")}
      AND ${visibleOwner(context, "eo")} AND ${visibleOwner(context, "so")} AND ${visibleOwner(context, "tor")}
      AND tr.lifecycle='active' AND dr.lifecycle IN ('active','tombstoned')
      AND ((e.predicate='replaced-by' AND sr.lifecycle='tombstoned') OR (e.predicate<>'replaced-by' AND sr.lifecycle='active'))
      AND NOT EXISTS(SELECT 1 FROM graph_edges prior WHERE prior.relationship_id=e.relationship_id)
    ORDER BY sr.resource_kind,e.source_resource_id,e.predicate,e.target_kind,e.target_id,e.relationship_id
    LIMIT max(0,${GRAPH_EDGE_SENTINEL_LIMIT}-(SELECT count(*) FROM graph_edges));`;
  const nodeSelect = (depth) => `WITH candidates AS (
      SELECT CASE WHEN e.source_kind=frontier.resource_kind AND e.source_resource_id=frontier.resource_id THEN e.target_kind ELSE e.source_kind END resource_kind,
        CASE WHEN e.source_kind=frontier.resource_kind AND e.source_resource_id=frontier.resource_id THEN e.target_id ELSE e.source_resource_id END resource_id,
        e.source_kind,e.source_resource_id,e.predicate,e.target_kind,e.target_id,e.relationship_id
      FROM graph_nodes frontier JOIN graph_edges e ON e.work_ordinal<=${GRAPH_AUTHORIZED_EDGE_LIMIT} AND (${authorizedAdjacency})
      WHERE frontier.depth=${depth} AND (SELECT count(*) FROM graph_raw_work)<=${GRAPH_RAW_ADJACENCY_WORK_LIMIT}
    ), ranked AS (
      SELECT *,row_number() OVER (PARTITION BY resource_kind,resource_id ORDER BY source_kind,source_resource_id,predicate,target_kind,target_id,relationship_id) candidate_rank
      FROM candidates
    )
    INSERT OR IGNORE INTO graph_nodes(resource_id,resource_kind,lifecycle,owner_id,owner_revision_id,owner_revision,family_id,version_id,projection_json,owner_kind,home_namespace_id,content_json,content_digest,depth)
    SELECT ${resourceColumns("r")},${depth + 1} FROM ranked candidate
    JOIN resource_current r ON r.resource_id=candidate.resource_id AND r.resource_kind=candidate.resource_kind
    ${resourceJoin(context, ownerCurrent, "r").replace(/^JOIN owners/, "JOIN owners")}
      AND candidate.candidate_rank=1 AND NOT EXISTS(SELECT 1 FROM graph_nodes known WHERE known.resource_kind=candidate.resource_kind AND known.resource_id=candidate.resource_id)
    ORDER BY candidate.source_kind,candidate.source_resource_id,candidate.predicate,candidate.target_kind,candidate.target_id,candidate.relationship_id
    LIMIT max(0,${nodeLimit}-(SELECT count(*) FROM graph_nodes));`;

  const levels = shape === "neighbors" ? [0] : Array.from({ length: maxDepth + 1 }, (_, index) => index);
  const expansions = [];
  for (const depth of levels) {
    expansions.push(edgeSelect(depth));
    if (depth < maxDepth) expansions.push(nodeSelect(depth));
  }
  const targetVisible = target ? `CASE WHEN (SELECT count(*) FROM graph_raw_work)<=${GRAPH_RAW_ADJACENCY_WORK_LIMIT} THEN EXISTS(SELECT 1 FROM resource_current r ${resourceJoin(context, ownerCurrent, "r")} AND r.resource_id=${sqlText(target.id)} AND r.resource_kind=${sqlText(target.kind)} AND r.lifecycle='active') ELSE 0 END` : "1";
  const script = `.bail on
PRAGMA foreign_keys=ON;
PRAGMA busy_timeout=5000;
BEGIN;
CREATE TEMP TABLE graph_nodes(resource_id TEXT NOT NULL,resource_kind TEXT NOT NULL,lifecycle TEXT NOT NULL,owner_id TEXT NOT NULL,owner_revision_id TEXT NOT NULL,owner_revision INTEGER NOT NULL,family_id TEXT NOT NULL,version_id TEXT NOT NULL,projection_json TEXT NOT NULL,owner_kind TEXT NOT NULL,home_namespace_id TEXT NOT NULL,content_json TEXT NOT NULL,content_digest TEXT NOT NULL,depth INTEGER NOT NULL,PRIMARY KEY(resource_kind,resource_id)) WITHOUT ROWID;
CREATE TEMP TABLE graph_raw_work(work_ordinal INTEGER PRIMARY KEY AUTOINCREMENT,relationship_id TEXT NOT NULL,owner_id TEXT NOT NULL,owner_revision_id TEXT NOT NULL,source_resource_id TEXT NOT NULL,target_kind TEXT NOT NULL,target_id TEXT NOT NULL,predicate TEXT NOT NULL,metadata_json TEXT NOT NULL,discovery_depth INTEGER NOT NULL,direction TEXT NOT NULL);
CREATE TEMP TABLE graph_raw_candidates(relationship_id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,owner_revision_id TEXT NOT NULL,source_resource_id TEXT NOT NULL,target_kind TEXT NOT NULL,target_id TEXT NOT NULL,predicate TEXT NOT NULL,metadata_json TEXT NOT NULL,discovery_depth INTEGER NOT NULL) WITHOUT ROWID;
CREATE TEMP TABLE graph_edges(work_ordinal INTEGER PRIMARY KEY AUTOINCREMENT,relationship_id TEXT NOT NULL UNIQUE,owner_id TEXT NOT NULL,owner_revision_id TEXT NOT NULL,source_kind TEXT NOT NULL,source_resource_id TEXT NOT NULL,target_kind TEXT NOT NULL,target_id TEXT NOT NULL,predicate TEXT NOT NULL,metadata_json TEXT NOT NULL);
INSERT INTO graph_nodes(resource_id,resource_kind,lifecycle,owner_id,owner_revision_id,owner_revision,family_id,version_id,projection_json,owner_kind,home_namespace_id,content_json,content_digest,depth)
SELECT ${resourceColumns("r")},0 FROM resource_current r ${resourceJoin(context, ownerCurrent, "r")} AND r.resource_id=${sqlText(start.id)} AND r.resource_kind=${sqlText(start.kind)};
${expansions.join("\n")}
CREATE TEMP TABLE candidate_ids(resource_id TEXT PRIMARY KEY) WITHOUT ROWID;
INSERT OR IGNORE INTO candidate_ids(resource_id)
SELECT source_resource_id FROM graph_edges
UNION SELECT target_id FROM graph_edges
UNION SELECT json_extract(metadata_json,'$.declaring_resource_id') FROM graph_edges;
SELECT 'snapshot' row_type,(SELECT operation_fence FROM store_fence WHERE singleton=1) operation_fence,
  EXISTS(SELECT 1 FROM view_policy_revisions p WHERE p.view_policy_revision_id=${sqlText(context.view_policy_revision_id)} AND p.view_id=${sqlText(context.view_id)} AND p.lifecycle='active' AND p.audience_ceiling='private') view_valid,
  ${targetVisible} target_visible,NULL work_ordinal,NULL resource_id,NULL resource_kind,NULL lifecycle,NULL owner_id,NULL owner_revision_id,NULL owner_revision,NULL family_id,NULL version_id,NULL projection_json,NULL owner_kind,NULL home_namespace_id,NULL content_json,NULL content_digest,NULL depth,NULL relationship_id,NULL source_kind,NULL source_resource_id,NULL target_kind,NULL target_id,NULL predicate,NULL metadata_json,
  (SELECT store_id FROM store_metadata WHERE singleton=1) store_id,
  (SELECT count(*)>${GRAPH_RAW_ADJACENCY_WORK_LIMIT} FROM graph_raw_work) work_budget_exceeded
UNION ALL SELECT 'node',NULL,NULL,NULL,NULL,resource_id,resource_kind,lifecycle,owner_id,owner_revision_id,owner_revision,family_id,version_id,projection_json,owner_kind,home_namespace_id,content_json,content_digest,depth,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL FROM graph_nodes
UNION ALL SELECT 'edge',NULL,NULL,NULL,work_ordinal,NULL,NULL,NULL,owner_id,owner_revision_id,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,relationship_id,source_kind,source_resource_id,target_kind,target_id,predicate,metadata_json,NULL,NULL FROM graph_edges
UNION ALL SELECT 'candidate',NULL,NULL,NULL,NULL,r.resource_id,r.resource_kind,r.lifecycle,r.owner_id,r.owner_revision_id,r.owner_revision,r.family_id,r.version_id,r.projection_json,o.owner_kind,o.home_namespace_id,v.content_json,v.content_digest,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL
FROM candidate_ids candidate
CROSS JOIN resource_current r INDEXED BY sqlite_autoindex_resource_current_1 ON r.resource_id=candidate.resource_id
${resourceJoin(context, ownerCurrent, "r")}
  AND (SELECT count(*) FROM graph_raw_work)<=${GRAPH_RAW_ADJACENCY_WORK_LIMIT}
  AND NOT EXISTS(SELECT 1 FROM graph_nodes n WHERE n.resource_kind=r.resource_kind AND n.resource_id=r.resource_id)
ORDER BY row_type,work_ordinal,depth,resource_kind,resource_id;
COMMIT;`;
  const { stdout } = await sqlite(prepared.binary, prepared.storePath, script, { args: ["-batch", "-bail", "-json"], timeout: 30_000, maxBuffer: 256 * 1024 * 1024 });
  const documents = [];
  let startAt = -1, depth = 0, quoted = false, escaped = false;
  for (let index = 0; index < stdout.length; index += 1) {
    const character = stdout[index];
    if (startAt < 0) { if (character === "[") { startAt = index; depth = 1; } continue; }
    if (quoted) { if (escaped) escaped = false; else if (character === "\\") escaped = true; else if (character === "\"") quoted = false; continue; }
    if (character === "\"") quoted = true;
    else if (character === "[") depth += 1;
    else if (character === "]" && --depth === 0) { documents.push(JSON.parse(stdout.slice(startAt, index + 1))); startAt = -1; }
  }
  return documents.find((document) => document.some((row) => row.row_type === "snapshot")) ?? [];
}

export async function executeBoundedGraph({ request, prepared, registry, ownerCurrent, context, shape, direction, predicates, nodeLimit, maxDepth, target }) {
  const rows = await snapshotRows({ prepared, context, start: request.start, target, direction, predicates, nodeLimit, maxDepth, shape, ownerCurrent });
  const snapshot = rows.find((row) => row.row_type === "snapshot");
  if (!snapshot || request.store_id !== snapshot.store_id) return notVisible(request.operation);
  if (snapshot.view_valid !== 1) return failure("view_invalid", "The exact active view-policy revision is unavailable.", { failureClass: "view_invalid", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE, evidence: {} });
  if (snapshot.work_budget_exceeded === 1) return workBudgetExceeded();
  const fence = snapshot.operation_fence;
  if (snapshot.target_visible !== 1) return notVisible(request.operation);
  const nodeRows = rows.filter((row) => row.row_type === "node");
  const rawStart = nodeRows.find((row) => row.resource_kind === request.start.kind && row.resource_id === request.start.id);
  if (!rawStart) return notVisible(request.operation);
  const candidateRows = [...nodeRows, ...rows.filter((row) => row.row_type === "candidate")];
  const resources = new Map();
  try {
    for (const row of candidateRows) {
      registry.resolve(row.owner_kind, row.resource_kind);
      const canonicalContent = JSON.parse(row.content_json);
      const projection = JSON.parse(row.projection_json);
      if (mechanicalDigest(canonicalContent) !== row.content_digest || row.family_id !== row.resource_id || canonicalContent.state !== row.lifecycle) throw new Error("canonical binding");
      const resourceKey = key({ kind: row.resource_kind, id: row.resource_id });
      if (resources.has(resourceKey)) throw new Error("duplicate resource");
      resources.set(resourceKey, { row, canonicalContent, projection });
    }
    const startResource = resources.get(key(request.start));
    const startRelationships = registry.projectRelationships("case", rawStart.resource_kind, { resource_id: rawStart.resource_id, canonical_content: startResource.canonicalContent });
    if (rawStart.lifecycle !== "active" && !startRelationships.some((edge) => edge.predicate === "replaced-by")) return notVisible(request.operation);
  } catch { return corrupt(); }

  const projectedRows = rows.filter((row) => row.row_type === "edge");
  const authorizedEdges = [];
  try {
    for (const row of projectedRows) {
      const metadata = JSON.parse(row.metadata_json);
      const declaringKind = String(metadata.declaring_resource_id ?? "").split(":", 1)[0];
      const declaring = resources.get(key({ kind: declaringKind, id: metadata.declaring_resource_id }));
      const source = resources.get(key({ kind: row.source_kind, id: row.source_resource_id }));
      const endpoint = resources.get(key({ kind: row.target_kind, id: row.target_id }));
      if (!declaring || !source || !endpoint || declaring.row.owner_id !== row.owner_id || declaring.row.owner_revision_id !== row.owner_revision_id) throw new Error("edge binding");
      const expected = registry.projectRelationships(declaring.row.owner_kind, declaring.row.resource_kind, { resource_id: declaring.row.resource_id, canonical_content: declaring.canonicalContent }).find((edge) => edge.relationship_id === row.relationship_id);
      const actual = { relationship_id: row.relationship_id, source_resource_id: row.source_resource_id, target: { kind: row.target_kind, id: row.target_id }, predicate: row.predicate, metadata };
      if (!expected || mechanicalDigest(exactEdge(expected)) !== mechanicalDigest(exactEdge(actual))) throw new Error("edge projection");
      authorizedEdges.push({ workOrdinal: row.work_ordinal, edge_id: row.relationship_id, source: { kind: row.source_kind, id: row.source_resource_id }, target: { kind: row.target_kind, id: row.target_id }, predicate: row.predicate, authority: { kind: "explicit", edge_id: row.relationship_id, declaring_owner: { id: row.owner_id, revision_id: row.owner_revision_id }, declaring_resource: { id: declaring.row.resource_id, version_id: declaring.row.version_id, schema: metadata.canonical_schema }, projection_schema: metadata.schema } });
    }
  } catch { return corrupt(); }

  const nodes = new Map(nodeRows.map((row) => [key({ kind: row.resource_kind, id: row.resource_id }), { kind: row.resource_kind, id: row.resource_id, lifecycle: row.lifecycle, owner: { id: row.owner_id, kind: row.owner_kind, home_namespace_id: row.home_namespace_id }, owner_revision: { id: row.owner_revision_id, number: row.owner_revision }, version_id: row.version_id, depth: row.depth }]));
  const selectedEdges = authorizedEdges.filter((edge) => edge.workOrdinal <= GRAPH_AUTHORIZED_EDGE_LIMIT);
  const adjacent = (nodeKey) => selectedEdges.filter((edge) => (direction !== "incoming" && key(edge.source) === nodeKey) || (direction !== "outgoing" && key(edge.target) === nodeKey));
  const opposite = (edge, nodeKey) => key(edge.source) === nodeKey ? edge.target : edge.source;
  const retained = new Map();
  const truncationReasons = [];
  if (authorizedEdges.length > GRAPH_AUTHORIZED_EDGE_LIMIT) truncationReasons.push("authorized_edge_limit");
  for (const [nodeKey, node] of nodes) {
    for (const edge of adjacent(nodeKey)) {
      const otherKey = key(opposite(edge, nodeKey));
      if (nodes.has(otherKey)) retained.set(edge.edge_id, edge);
      else if (node.depth >= maxDepth) { if (!truncationReasons.includes("max_depth")) truncationReasons.push("max_depth"); }
      else if (!truncationReasons.includes("node_limit")) truncationReasons.push("node_limit");
    }
  }
  let foundTarget = shape === "path" && nodes.has(key(target));
  let outputEdges = [...retained.values()];
  let outputNodes = [...nodes.values()];
  if (shape === "path") {
    if (!foundTarget || key(request.start) === key(target)) { outputEdges = []; outputNodes = [nodes.get(key(request.start))]; }
    else {
      const reverse = []; let cursor = key(target);
      while (cursor !== key(request.start)) {
        const cursorDepth = nodes.get(cursor).depth;
        const edge = outputEdges.filter((item) => {
          const previous = key(opposite(item, cursor));
          return nodes.get(previous)?.depth === cursorDepth - 1;
        }).sort(edgeCompare)[0];
        if (!edge) return corrupt();
        reverse.push(edge); cursor = key(opposite(edge, cursor));
      }
      outputEdges = reverse.reverse();
      const pathKeys = new Set([key(request.start)]); let at = key(request.start);
      for (const edge of outputEdges) { at = key(opposite(edge, at)); pathKeys.add(at); }
      outputNodes = outputNodes.filter((node) => pathKeys.has(key(node)));
    }
  }
  outputNodes.sort((left, right) => left.depth - right.depth || codepointCompare(left.kind, right.kind) || codepointCompare(left.id, right.id));
  outputEdges.sort(edgeCompare);
  const candidateResourcesValidated = new Set(candidateRows.map((row) => key({ kind: row.resource_kind, id: row.resource_id }))).size;
  return success(request.operation, {
    status: "found", shape, nodes: outputNodes, edges: outputEdges,
    ...(shape === "path" ? { path_found: foundTarget, distance: foundTarget ? outputEdges.length : null } : {}),
    operation_fence: fence, canonical_fence: `sqlite:${fence}`,
    applied_view: { view_id: context.view_id, view_policy_revision_id: context.view_policy_revision_id },
    visibility_context: { audience_ceiling: "private", authorization: "exact-active-policy-source-target-edge" },
    index_implementation: "canonical-explicit-relationship-current", stable_sort: GRAPH_SORT,
    bounds: { direction, predicates, max_depth: shape === "neighbors" ? 1 : maxDepth, node_limit: nodeLimit, authorized_edge_limit: GRAPH_AUTHORIZED_EDGE_LIMIT, authorized_edges_examined: authorizedEdges.length, candidate_resources_validated: candidateResourcesValidated, returned_nodes: outputNodes.length, completeness: truncationReasons.length ? "truncated" : "complete_within_bounds", truncation_reason: truncationReasons[0] ?? null, truncation_reasons: truncationReasons },
  });
}
