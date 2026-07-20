import path from "node:path";
import { validateAuthorityConfiguration, ConfigurationError } from "../../../../shared/config.mjs";
import { failure, RETRY_DISPOSITIONS, success } from "../../../../shared/protocol.mjs";
import { probeSqlite, selectSqliteBinary, sqlite } from "./diagnostics.mjs";
import { inspectStore, invokeSubstrateOperation } from "./index.mjs";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const UUID_ID = new RegExp(`^[a-z][a-z0-9_-]*:${UUID}$`);
const REVISION_ID = new RegExp(`^[a-z][a-z0-9_-]*-revision:${UUID}$`);
const MAX_RESULTS = 100;
const SEMANTIC_DEPENDENCY_PREDICATES = new Set([
  "depends-on", "depends_on", "requires", "governed-by", "governed_by", "implements", "realizes",
]);
const REQUEST_FIELDS = new Set([
  "protocol", "operation", "request_version", "store_id", "context", "root", "limit", "configuration",
]);
const CONTEXT_FIELDS = new Set(["view_id", "view_policy_revision_id", "purpose", "requested_audience_ceiling"]);
const ROOT_FIELDS = new Set(["family_id", "old_revision_id", "new_revision_id"]);

class ImpactError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.code = code;
    this.failureClass = options.failureClass ?? code;
    this.retryDisposition = options.retryDisposition ?? RETRY_DISPOSITIONS.NEVER;
    this.evidence = options.evidence ?? {};
  }
}

function exact(value, allowed, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !allowed.has(key))) {
    throw new ImpactError("impact.request_invalid", `${field} contains unsupported or invalid fields.`);
  }
}

function requireId(value, field) {
  if (typeof value !== "string" || !UUID_ID.test(value)) throw new ImpactError("impact.request_invalid", `${field} must be a lowercase UUID-based identity.`);
  return value;
}

function requireRevision(value, field) {
  if (typeof value !== "string" || !REVISION_ID.test(value)) throw new ImpactError("impact.request_invalid", `${field} must be a typed lowercase UUID revision identity.`);
  return value;
}

function mechanicalRevision(value) {
  return `owner-revision:${value.slice(value.indexOf(":") + 1)}`;
}

function typedRevision(ownerKind, value) {
  return `${ownerKind}-revision:${value.slice(value.indexOf(":") + 1)}`;
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

async function queryJson(binary, database, query) {
  const { stdout } = await sqlite(binary, database, `PRAGMA query_only = ON;\n${query}`, {
    args: ["-batch", "-bail", "-json"], maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(stdout || "[]");
}

function validateRequest(request) {
  exact(request, REQUEST_FIELDS, "request");
  if (request.request_version !== 1) throw new ImpactError("impact.request_invalid", "request_version must be 1.");
  requireId(request.store_id, "store_id");
  exact(request.context, CONTEXT_FIELDS, "context");
  requireId(request.context.view_id, "context.view_id");
  requireId(request.context.view_policy_revision_id, "context.view_policy_revision_id");
  if (typeof request.context.purpose !== "string" || !request.context.purpose.trim()) throw new ImpactError("impact.request_invalid", "context.purpose is required.");
  if (request.context.requested_audience_ceiling != null && request.context.requested_audience_ceiling !== "private") {
    throw new ImpactError("impact.view_invalid_or_unavailable", "The impact request cannot widen the exact active view.");
  }
  exact(request.root, ROOT_FIELDS, "root");
  requireId(request.root.family_id, "root.family_id");
  requireRevision(request.root.old_revision_id, "root.old_revision_id");
  requireRevision(request.root.new_revision_id, "root.new_revision_id");
  if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > MAX_RESULTS) {
    throw new ImpactError("impact.request_invalid", `limit must be between 1 and ${MAX_RESULTS}.`);
  }
}

async function prepare(request) {
  const configuration = validateAuthorityConfiguration(request.configuration);
  if (configuration.authority_mode !== "sqlite") {
    return { failure: failure("sqlite_authority_required", "This operation requires explicitly selected sqlite authority.", { failureClass: "configuration_or_store_unavailable" }) };
  }
  const selected = await selectSqliteBinary(configuration.sqlite.sqlite_bin);
  const probe = await probeSqlite(selected.path, path.dirname(configuration.sqlite.store_path));
  if (!probe.ok) return { failure: failure("sqlite_feature_unsupported", "Selected SQLite runtime is incompatible.", { failureClass: "sqlite_feature_unsupported", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR }) };
  const state = await inspectStore(selected.path, configuration.sqlite.store_path);
  if (state.status !== "available") return { failure: failure(state.code ?? "store_unavailable", "The configured store is unavailable.", { failureClass: state.code ?? "store_unavailable", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR, evidence: state.evidence ?? {} }) };
  if (state.metadata.store_id !== request.store_id) return { failure: rootNotVisible() };
  const view = await invokeSubstrateOperation({ operation: "read_active_view_scope", configuration: request.configuration, context: request.context });
  if (!view?.ok) return { failure: failure("impact.view_invalid_or_unavailable", "The exact active view-policy revision is invalid or unavailable.", { failureClass: "impact.view_invalid_or_unavailable", retryDisposition: view?.failure?.retry_disposition ?? RETRY_DISPOSITIONS.NEVER, evidence: {} }) };
  const policies = await queryJson(selected.path, configuration.sqlite.store_path, `
    SELECT limits_json FROM view_policy_revisions
    WHERE view_id=${sqlText(request.context.view_id)}
      AND view_policy_revision_id=${sqlText(request.context.view_policy_revision_id)} AND lifecycle='active' LIMIT 1;
  `);
  if (!policies.length) return { failure: failure("impact.view_invalid_or_unavailable", "The exact active view-policy revision is invalid or unavailable.", { failureClass: "impact.view_invalid_or_unavailable", evidence: {} }) };
  return { binary: selected.path, storePath: configuration.sqlite.store_path, state, policyLimits: JSON.parse(policies[0].limits_json) };
}

function rootNotVisible() {
  return failure("impact.root_not_found_or_not_visible", "The root family or requested revision lineage is unknown or not visible under the exact view.", {
    failureClass: "impact.root_not_found_or_not_visible", retryDisposition: RETRY_DISPOSITIONS.NEVER, evidence: {},
  });
}

async function rootState(prepared, request) {
  const rows = await queryJson(prepared.binary, prepared.storePath, `
    SELECT binding.owner_id,o.owner_kind,o.home_namespace_id,current.revision_id,current.revision_number
    FROM owner_family_bindings binding
    JOIN owners o ON o.owner_id=binding.owner_id
    JOIN owner_current current ON current.owner_id=o.owner_id
    JOIN view_policy_namespace_grants grant ON grant.namespace_id=o.home_namespace_id
      AND grant.view_policy_revision_id=${sqlText(request.context.view_policy_revision_id)}
    JOIN view_policy_revisions policy ON policy.view_policy_revision_id=grant.view_policy_revision_id
      AND policy.view_id=${sqlText(request.context.view_id)} AND policy.lifecycle='active'
    JOIN json_each(policy.object_kinds_json) kind ON kind.value=o.owner_kind
    WHERE binding.family_id=${sqlText(request.root.family_id)} LIMIT 1;
  `);
  if (!rows.length) return null;
  const row = rows[0];
  if (!request.root.old_revision_id.startsWith(`${row.owner_kind}-revision:`)
    || !request.root.new_revision_id.startsWith(`${row.owner_kind}-revision:`)) return null;
  const revisions = await queryJson(prepared.binary, prepared.storePath, `
    SELECT revision.revision_id,revision.revision_number
    FROM owner_revisions revision
    JOIN owner_revision_selections selected ON selected.revision_id=revision.revision_id
    WHERE revision.owner_id=${sqlText(row.owner_id)} AND selected.family_id=${sqlText(request.root.family_id)}
      AND revision.revision_id IN (${sqlText(mechanicalRevision(request.root.old_revision_id))},${sqlText(mechanicalRevision(request.root.new_revision_id))});
  `);
  if (new Set(revisions.map((item) => item.revision_id)).size !== 2
    || !revisions.some((item) => item.revision_id === mechanicalRevision(request.root.old_revision_id))
    || !revisions.some((item) => item.revision_id === mechanicalRevision(request.root.new_revision_id))) return null;
  const oldNumber = revisions.find((item) => item.revision_id === mechanicalRevision(request.root.old_revision_id)).revision_number;
  const requestedNewNumber = revisions.find((item) => item.revision_id === mechanicalRevision(request.root.new_revision_id)).revision_number;
  if (oldNumber >= requestedNewNumber || requestedNewNumber > row.revision_number) return null;
  return { ...row, oldNumber, requestedNewNumber };
}

function isSemanticDependency(link) {
  return link?.from?.kind === "discovery" || SEMANTIC_DEPENDENCY_PREDICATES.has(link?.predicate);
}

function matchingDependencies(projection, familyId) {
  return (projection.identity_links ?? [])
    .filter((link) => link?.to?.id === familyId && isSemanticDependency(link))
    .map((link) => ({
      kind: link.from.kind === "discovery" ? "discovery_dependency" : link.from.kind === projection.id ? "owner_dependency" : "component_dependency",
      path: { from: link.from, predicate: link.predicate, to: link.to },
      observed_revision_id: link.observed_revision_id ?? null,
      pinned_revision_id: link.pinned_revision_id ?? null,
    }))
    .sort((left, right) => left.path.from.kind.localeCompare(right.path.from.kind)
      || left.path.from.id.localeCompare(right.path.from.id)
      || left.path.predicate.localeCompare(right.path.predicate));
}

function lifecycleFor(projection, component) {
  if (projection.schema === "frame-current@1") {
    if (projection.status === "abandoned") return { classification: "abandoned", leaves_reconciliation_frontier: true, lineage_defect: false };
    if (projection.status === "superseded") return { classification: "superseded", leaves_reconciliation_frontier: true, lineage_defect: false };
    if (projection.status === "completed") return { classification: "historical/published-immutable", leaves_reconciliation_frontier: true, lineage_defect: false };
    if (projection.status !== "active") return { classification: "unknown", leaves_reconciliation_frontier: false, lineage_defect: true };
  } else if (projection.schema === "case-current@2") {
    if (projection.state === "tombstoned") return { classification: "historical/published-immutable", leaves_reconciliation_frontier: true, lineage_defect: false };
    if (projection.state !== "active") return { classification: "unknown", leaves_reconciliation_frontier: false, lineage_defect: true };
  } else return { classification: "unknown", leaves_reconciliation_frontier: false, lineage_defect: true };

  if (component?.schema === "frame-discovery-item@1") {
    if (["settled", "tombstoned"].includes(component.lifecycle)) return { classification: "historical/published-immutable", leaves_reconciliation_frontier: true, lineage_defect: false };
    if (component.lifecycle !== "active") return { classification: "unknown", leaves_reconciliation_frontier: false, lineage_defect: true };
  }
  if (component?.schema === "case-knowledge@1" && component.classification === "superseded") {
    const successor = component.supersession?.successor;
    return { classification: "superseded", leaves_reconciliation_frontier: true, lineage_defect: !successor?.target_id };
  }
  return { classification: "active", leaves_reconciliation_frontier: false, lineage_defect: false };
}

function ownerDisposition(projection, component, componentId) {
  if (projection.schema === "frame-current@1") return {
    status: projection.status,
    ...(component?.schema === "frame-discovery-item@1" ? { component: { kind: "discovery", id: componentId, lifecycle: component.lifecycle, category: component.category } } : {}),
  };
  if (projection.schema === "case-current@2") return {
    state: projection.state,
    ...(component?.schema === "case-knowledge@1" ? { component: { kind: "knowledge", id: componentId, state: component.state, classification: component.classification } } : {}),
  };
  return null;
}

function earliestRevision(values, revisionNumbers) {
  const unique = [...new Set(values.filter(Boolean))];
  if (!unique.length) return null;
  return unique.sort((left, right) => (revisionNumbers.get(mechanicalRevision(left)) ?? Number.MAX_SAFE_INTEGER)
    - (revisionNumbers.get(mechanicalRevision(right)) ?? Number.MAX_SAFE_INTEGER) || left.localeCompare(right))[0];
}

async function projectImpact(request) {
  validateRequest(request);
  const prepared = await prepare(request);
  if (prepared.failure) return prepared.failure;
  if (request.limit > Math.min(MAX_RESULTS, prepared.policyLimits.max_results)) {
    throw new ImpactError("impact.request_invalid", "limit exceeds the exact active view-policy result bound.");
  }
  const root = await rootState(prepared, request);
  if (!root) return rootNotVisible();

  const visibleDependents = `
    FROM owners o JOIN owner_current current ON current.owner_id=o.owner_id
    JOIN view_policy_namespace_grants grant ON grant.namespace_id=o.home_namespace_id
      AND grant.view_policy_revision_id=${sqlText(request.context.view_policy_revision_id)}
    JOIN view_policy_revisions policy ON policy.view_policy_revision_id=grant.view_policy_revision_id
      AND policy.view_id=${sqlText(request.context.view_id)} AND policy.lifecycle='active'
    JOIN json_each(policy.object_kinds_json) allowed ON allowed.value=o.owner_kind
    WHERE EXISTS (
      SELECT 1 FROM json_each(current.projection_json,'$.identity_links') edge
      WHERE json_extract(edge.value,'$.to.id')=${sqlText(request.root.family_id)}
        AND (json_extract(edge.value,'$.from.kind')='discovery'
          OR json_extract(edge.value,'$.predicate') IN (${[...SEMANTIC_DEPENDENCY_PREDICATES].map(sqlText).join(",")}))
    )`;
  const total = (await queryJson(prepared.binary, prepared.storePath, `SELECT count(*) AS count ${visibleDependents};`))[0].count;
  const rows = await queryJson(prepared.binary, prepared.storePath, `
    SELECT o.owner_id,o.owner_kind,o.home_namespace_id,current.revision_id,current.revision_number,current.projection_json
    ${visibleDependents} ORDER BY o.owner_kind,o.owner_id LIMIT ${request.limit};
  `);
  const ownerIds = rows.map((row) => row.owner_id);
  const selected = ownerIds.length ? await queryJson(prepared.binary, prepared.storePath, `
    SELECT revision.owner_id,selection.family_id,version.content_json
    FROM owner_revisions revision
    JOIN owner_revision_selections selection ON selection.revision_id=revision.revision_id
    JOIN owner_versions version ON version.version_id=selection.version_id
    WHERE revision.revision_id IN (${rows.map((row) => sqlText(row.revision_id)).join(",")});
  `) : [];
  const components = new Map(selected.map((item) => [`${item.owner_id}\0${item.family_id}`, JSON.parse(item.content_json)]));
  const parsedRows = rows.map((row) => ({ ...row, projection: JSON.parse(row.projection_json) }));
  const allDependencies = parsedRows.flatMap((row) => matchingDependencies(row.projection, request.root.family_id));
  const referencedRevisions = [...new Set(allDependencies.flatMap((item) => [item.observed_revision_id, item.pinned_revision_id]).filter(Boolean).map(mechanicalRevision))];
  const revisionRows = referencedRevisions.length ? await queryJson(prepared.binary, prepared.storePath, `SELECT revision_id,revision_number FROM owner_revisions WHERE revision_id IN (${referencedRevisions.map(sqlText).join(",")});`) : [];
  const revisionNumbers = new Map(revisionRows.map((item) => [item.revision_id, item.revision_number]));
  const currentRootRevision = typedRevision(root.owner_kind, root.revision_id);

  const dependents = parsedRows.map((row) => {
    const dependencies = matchingDependencies(row.projection, request.root.family_id);
    const componentId = dependencies[0]?.path.from.id;
    const component = components.get(`${row.owner_id}\0${componentId}`) ?? null;
    const lifecycle = lifecycleFor(row.projection, component);
    const observed = earliestRevision(dependencies.map((item) => item.observed_revision_id), revisionNumbers);
    const pinned = earliestRevision(dependencies.map((item) => item.pinned_revision_id), revisionNumbers);
    const deferredByComponent = component?.schema === "frame-discovery-item@1" && ["deferred", "out_of_scope"].includes(component.category);
    let impact;
    if (lifecycle.classification === "unknown" || observed == null) impact = "unknown";
    else if (lifecycle.leaves_reconciliation_frontier || deferredByComponent) impact = "deferred";
    else if (observed === currentRootRevision && (pinned == null || pinned === currentRootRevision)) impact = "unchanged";
    else impact = "affected";
    return {
      owner: { id: row.owner_id, kind: row.owner_kind, home_namespace_id: row.home_namespace_id },
      current_owner_revision: { id: typedRevision(row.owner_kind, row.revision_id), number: row.revision_number },
      recorded_revision: { observed_revision_id: observed, pinned_revision_id: pinned },
      dependencies: dependencies.map(({ observed_revision_id: _observed, pinned_revision_id: _pinned, ...dependency }) => dependency),
      current_owner_disposition: ownerDisposition(row.projection, component, componentId),
      lifecycle, impact,
      reconciliation: impact === "unchanged" ? "not_required" : impact === "deferred" ? "outside_live_frontier" : "owner_action_required",
    };
  });
  const counts = { examined: dependents.length, affected: 0, unchanged: 0, deferred: 0, unknown: 0, overflow: total - dependents.length };
  for (const item of dependents) counts[item.impact] += 1;
  const stopReason = counts.overflow ? "result_limit"
    : dependents.some((item) => item.lifecycle.classification === "realized-current") ? "consequential_realized_current"
      : counts.unknown ? "unknown_dependency_state" : "direct_frontier_complete";
  return success("impact.project", {
    status: "projected",
    root: {
      family_id: request.root.family_id,
      owning_owner: { id: root.owner_id, kind: root.owner_kind, home_namespace_id: root.home_namespace_id },
      requested_change: { old_revision_id: request.root.old_revision_id, new_revision_id: request.root.new_revision_id },
      current_revision: { id: currentRootRevision, number: root.revision_number },
      resolution: root.requestedNewNumber < root.revision_number ? "coalesced_to_latest_current" : "requested_new_is_current",
    },
    dependents, counts, stop_reason: stopReason,
    result_completeness: counts.overflow ? "truncated" : "complete_within_bounds",
    stable_sort: "owner_kind_asc_owner_id_asc",
    traversal: "direct_only_cycle_safe",
    deduplication_key: { root_family_id: request.root.family_id, new_root_revision_id: currentRootRevision, dependent_owner: "per-result-owner" },
    projection: { disposition: "disposable_replaceable", canonical_semantic_authority: false },
    authority: { semantic_owner_mutation: "not_granted", executive_assistant_effects: "not_granted" },
    mutation_performed: false,
    applied_view: { view_id: request.context.view_id, view_policy_revision_id: request.context.view_policy_revision_id },
    operation_fence: prepared.state.operation_fence,
  });
}

export async function invokeImpactOperation(request) {
  try {
    if (request.operation !== "impact.project") return null;
    return await projectImpact(request);
  } catch (error) {
    if (error instanceof ImpactError || error instanceof ConfigurationError) {
      return failure(error.code, error.message, { failureClass: error.failureClass ?? "impact.request_invalid", retryDisposition: error.retryDisposition ?? RETRY_DISPOSITIONS.NEVER, evidence: error.evidence ?? {} });
    }
    return failure("impact.unavailable", "The disposable impact projection is unavailable without exposing owner state.", { failureClass: "impact.unavailable", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR, evidence: {} });
  }
}

export const impactLimits = Object.freeze({ maximum_results: MAX_RESULTS });
