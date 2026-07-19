import {
  failure,
  RETRY_DISPOSITIONS,
  success,
  unsupported,
} from "../../../../shared/protocol.mjs";
import {
  canonicalJson,
  interchangeKeyFromId,
  L01_IDENTITY_RULE,
  L01_INTERCHANGE_FORMAT,
  sha256,
} from "../../../../shared/l01-interchange.mjs";
import {
  invokeCaseOperation,
  renderL01CaseMarkdown,
} from "../case/index.mjs";
import {
  invokeFrameOperation,
  l01DiscoveryEntries,
  renderL01DiscoveryMarkdown,
  renderL01FrameMarkdown,
} from "../frame/index.mjs";
import { invokeSubstrateOperation } from "../substrate/index.mjs";

const MAX_SCAN = 256;
const MAX_SEARCH_LIMIT = 50;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const OWNER_ID = new RegExp(`^(case|frame):${UUID}$`);
const STORE_ID = new RegExp(`^store:${UUID}$`);
const VIEW_ID = new RegExp(`^view:${UUID}$`);
const POLICY_ID = new RegExp(`^view-policy:${UUID}$`);
const KINDS = new Set(["case", "frame"]);
const COMMON = new Set(["protocol", "operation", "request_version", "store_id", "context", "configuration"]);

function renderInterchange(records) {
  const files = [];
  const manifestRecords = [];
  const sorted = [...records].sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
  for (const item of sorted) {
    const record = item.record;
    if (item.kind === "case") {
      const relativePath = `cases/${interchangeKeyFromId(record.id)}.md`;
      const content = renderL01CaseMarkdown(record);
      files.push({ path: relativePath, content, sha256: sha256(content) });
      manifestRecords.push({ kind: "case", id: record.id, path: relativePath, sha256: sha256(content) });
      continue;
    }
    const directory = `frames/${interchangeKeyFromId(record.id)}`;
    const framePath = `${directory}/frame.md`;
    const discoveryPath = `${directory}/discovery.md`;
    const frameContent = renderL01FrameMarkdown(record);
    const discoveryContent = renderL01DiscoveryMarkdown(record);
    files.push(
      { path: framePath, content: frameContent, sha256: sha256(frameContent) },
      { path: discoveryPath, content: discoveryContent, sha256: sha256(discoveryContent) },
    );
    manifestRecords.push({
      kind: "frame",
      id: record.id,
      frame_path: framePath,
      frame_sha256: sha256(frameContent),
      discovery_path: discoveryPath,
      discovery_sha256: sha256(discoveryContent),
      discovery_filename: "discovery.md",
      discovery_items: l01DiscoveryEntries(record).map(({ item: discovery, display_label: label }) => ({
        label,
        id: discovery.id,
        display_order: discovery.display_order,
        ...(discovery.display_label == null ? {} : { display_label: discovery.display_label }),
      })),
    });
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  const manifest = {
    manifest_version: 1,
    format: L01_INTERCHANGE_FORMAT,
    identity_rule: L01_IDENTITY_RULE,
    records: manifestRecords,
  };
  const manifestBytes = canonicalJson(manifest);
  return {
    format: L01_INTERCHANGE_FORMAT,
    manifest,
    manifest_bytes: manifestBytes,
    manifest_sha256: sha256(manifestBytes),
    files,
  };
}

class CommonRequestError extends Error {
  constructor(path, rule) {
    super(rule);
    this.path = path;
    this.rule = rule;
  }
}

function exactKeys(request, extra = []) {
  const allowed = new Set([...COMMON, ...extra]);
  for (const key of Object.keys(request ?? {})) {
    if (!allowed.has(key)) throw new CommonRequestError(`request.${key}`, "field_unsupported");
  }
}

function validateBase(request, extra) {
  exactKeys(request, extra);
  if (request.request_version !== 1) throw new CommonRequestError("request_version", "version_incompatible");
  if (typeof request.store_id !== "string" || !STORE_ID.test(request.store_id)) {
    throw new CommonRequestError("store_id", "uuid_identity_required");
  }
  if (!request.context || typeof request.context !== "object" || Array.isArray(request.context)) {
    throw new CommonRequestError("context", "view_context_required");
  }
  const contextFields = new Set(["view_id", "view_policy_revision_id", "purpose", "requested_audience_ceiling"]);
  for (const key of Object.keys(request.context)) {
    if (!contextFields.has(key)) throw new CommonRequestError(`context.${key}`, "field_unsupported");
  }
  if (!VIEW_ID.test(request.context.view_id ?? "") || !POLICY_ID.test(request.context.view_policy_revision_id ?? "")) {
    throw new CommonRequestError("context", "exact_active_view_required");
  }
  if (typeof request.context.purpose !== "string" || !request.context.purpose.trim() || request.context.purpose.length > 512
    || request.context.requested_audience_ceiling !== "private") {
    throw new CommonRequestError("context", "private_view_context_required");
  }
}

function ownerKinds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    throw new CommonRequestError("owner_kinds", "bounded_owner_kinds_required");
  }
  const unique = [...new Set(value)];
  if (unique.length !== value.length || unique.some((kind) => !KINDS.has(kind))) {
    throw new CommonRequestError("owner_kinds", "owner_kinds_invalid");
  }
  return unique.sort();
}

function ownerId(value) {
  if (typeof value !== "string" || !OWNER_ID.test(value)) {
    throw new CommonRequestError("owner_id", "stable_owner_identity_required");
  }
  return value;
}

function normalizedFrame(frame) {
  return {
    ...frame,
    discovery: frame.discovery.map(({ version_id: _versionId, ...item }) => item),
  };
}

async function hydrate(request, id) {
  const base = {
    protocol: request.protocol,
    request_version: 1,
    store_id: request.store_id,
    context: request.context,
    configuration: request.configuration,
  };
  const kind = id.slice(0, id.indexOf(":"));
  const typed = kind === "case"
    ? await invokeCaseOperation({ ...base, operation: "case.read", case_id: id })
    : await invokeFrameOperation({ ...base, operation: "frame.read", frame_id: id });
  if (!typed.ok) {
    if (typed.failure.code.endsWith("not_found_or_not_visible")) {
      return { failure: failure("common.not_found_or_not_visible", "The owner is unknown or not visible under the exact view.", {
        failureClass: "common.read_failure",
        evidence: {},
      }) };
    }
    return { failure: typed };
  }
  const record = kind === "case" ? typed.result.case : normalizedFrame(typed.result.frame);
  return { item: { owner_kind: kind, id, record }, applied_view: typed.result.applied_view };
}

async function identityList(request, kinds) {
  const rows = [];
  let fence = null;
  let appliedView = null;
  for (const kind of kinds) {
    const result = await invokeSubstrateOperation({
      operation: "list_owner_current",
      configuration: request.configuration,
      store_id: request.store_id,
      context: request.context,
      owner_kind: kind,
    });
    if (!result?.ok) return { failure: result };
    if (fence != null && result.result.operation_fence !== fence) {
      return { failure: failure("common.query_changed", "The store changed during the bounded common query.", {
        failureClass: "query_conflict",
        retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE,
        correctiveGuidance: "Retry the read-only common query under the same exact active view.",
        evidence: {},
      }) };
    }
    fence = result.result.operation_fence;
    appliedView = result.result.applied_view;
    for (const row of result.result.items) rows.push({ kind, id: row.owner.id });
  }
  if (rows.length > MAX_SCAN) {
    return { failure: failure("common.bound_exceeded", "The L-01 common query owner bound was exceeded.", {
      failureClass: "capability_unavailable",
      evidence: { maximum_owner_scan: MAX_SCAN },
    }) };
  }
  rows.sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
  return { rows, fence, appliedView };
}

async function loadAll(request, kinds) {
  const listed = await identityList(request, kinds);
  if (listed.failure) return listed;
  const items = [];
  for (const row of listed.rows) {
    const hydrated = await hydrate(request, row.id);
    if (hydrated.failure) return hydrated;
    items.push(hydrated.item);
  }
  // Detect a write racing the identity scan/hydration instead of claiming one
  // common query fence across independently invoked typed owner reads.
  const verified = await identityList(request, kinds);
  if (verified.failure) return verified;
  if (verified.fence !== listed.fence
    || JSON.stringify(verified.rows) !== JSON.stringify(listed.rows)) {
    return { failure: failure("common.query_changed", "The store changed during the bounded common query.", {
      failureClass: "query_conflict",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE,
      correctiveGuidance: "Retry the read-only common query under the same exact active view.",
      evidence: {},
    }) };
  }
  return { items, fence: listed.fence, appliedView: listed.appliedView };
}

function lexicalFields(item) {
  const record = item.record;
  if (item.owner_kind === "case") {
    return { title: record.title, summary: record.summary, scope: record.scope };
  }
  const fields = {};
  for (const key of ["title", "outcome", "limitations", "completion_condition"]) {
    if (record[key] != null) fields[key] = record[key];
  }
  if (record.included_scope) fields.included_scope = record.included_scope.join("\n");
  if (record.excluded_scope) fields.excluded_scope = record.excluded_scope.join("\n");
  fields.discovery = record.discovery.map((entry) => `${entry.title}\n${entry.body}`).join("\n");
  return fields;
}

function tokens(query) {
  if (typeof query !== "string" || query.trim().length === 0 || query.length > 256) {
    throw new CommonRequestError("query", "bounded_lexical_query_required");
  }
  const normalized = [...new Set(query.normalize("NFKC").toLocaleLowerCase("en-US").split(/[^\p{L}\p{N}_-]+/u).filter(Boolean))];
  if (normalized.length === 0) throw new CommonRequestError("query", "lexical_token_required");
  return normalized;
}

function lexicalMatch(item, queryTokens) {
  const matches = [];
  let score = 0;
  for (const [field, raw] of Object.entries(lexicalFields(item))) {
    const value = raw.normalize("NFKC").toLocaleLowerCase("en-US");
    const matched = queryTokens.filter((token) => value.includes(token));
    if (matched.length) {
      matches.push(field);
      score += matched.length + (field === "title" ? 1 : 0);
    }
  }
  if (!queryTokens.every((token) => Object.values(lexicalFields(item)).some((raw) => raw.normalize("NFKC").toLocaleLowerCase("en-US").includes(token)))) {
    return null;
  }
  return { ...item, matched_fields: matches.sort(), lexical_score: score };
}

function queryResult(items, loaded, stableSort, completeness = "complete_within_bounds") {
  return {
    status: "found",
    items,
    index_state: "current",
    result_completeness: completeness,
    stable_sort: stableSort,
    snapshot_query_fence: `sqlite:${loaded.fence}`,
    applied_view: loaded.appliedView,
  };
}

async function resolve(request) {
  validateBase(request, ["owner_id"]);
  const resolved = await hydrate(request, ownerId(request.owner_id));
  if (resolved.failure) return resolved.failure;
  return success("common.resolve", {
    status: "found",
    item: resolved.item,
    index_state: "current",
    result_completeness: "complete_within_bounds",
    applied_view: resolved.applied_view,
  });
}

async function list(request) {
  validateBase(request, ["owner_kinds"]);
  const loaded = await loadAll(request, ownerKinds(request.owner_kinds));
  if (loaded.failure) return loaded.failure;
  return success("common.list", queryResult(loaded.items, loaded, "owner_kind_asc_id_asc"));
}

async function search(request) {
  validateBase(request, ["owner_kinds", "query", "limit"]);
  const kinds = ownerKinds(request.owner_kinds);
  const queryTokens = tokens(request.query);
  if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > MAX_SEARCH_LIMIT) {
    throw new CommonRequestError("limit", "bounded_search_limit_required");
  }
  const loaded = await loadAll(request, kinds);
  if (loaded.failure) return loaded.failure;
  const matches = loaded.items.map((item) => lexicalMatch(item, queryTokens)).filter(Boolean);
  matches.sort((left, right) => right.lexical_score - left.lexical_score
    || left.owner_kind.localeCompare(right.owner_kind) || left.id.localeCompare(right.id));
  const completeness = matches.length > request.limit ? "truncated" : "complete_within_bounds";
  return success("common.search", {
    ...queryResult(matches.slice(0, request.limit), loaded, "lexical_score_desc_owner_kind_asc_id_asc", completeness),
    normalized_query_tokens: queryTokens,
    applied_limit: request.limit,
  });
}

async function exportInterchange(request) {
  validateBase(request, ["owner_ids"]);
  if (!Array.isArray(request.owner_ids) || request.owner_ids.length < 1 || request.owner_ids.length > MAX_SCAN) {
    throw new CommonRequestError("owner_ids", "bounded_owner_ids_required");
  }
  const ids = [...new Set(request.owner_ids.map(ownerId))].sort();
  if (ids.length !== request.owner_ids.length) throw new CommonRequestError("owner_ids", "duplicate_owner_identity");
  const items = [];
  let appliedView;
  for (const id of ids) {
    const hydrated = await hydrate(request, id);
    if (hydrated.failure) return hydrated.failure;
    items.push({ kind: hydrated.item.owner_kind, id, record: hydrated.item.record });
    appliedView = hydrated.applied_view;
  }
  const interchange = renderInterchange(items);
  return success("interchange.export", {
    status: "rendered",
    ...interchange,
    authority_selected: false,
    applied_view: appliedView,
    limitations: [
      "l01_synthetic_interchange_only",
      "not_l05_markdown_authority_format",
      "no_history_events_checkpoints_snapshots_or_global_search",
    ],
  });
}

function invalid(error) {
  return failure("common.invalid_request", "The L-01 common-subset request is structurally invalid.", {
    failureClass: "common.invalid_request",
    evidence: { violations: [{ path: error.path, rule: error.rule }] },
  });
}

export async function invokeCommonOperation(request) {
  try {
    if (request.operation === "common.resolve") return await resolve(request);
    if (request.operation === "common.list") return await list(request);
    if (request.operation === "common.search") return await search(request);
    if (request.operation === "interchange.export") return await exportInterchange(request);
    return unsupported(request.operation);
  } catch (error) {
    if (error instanceof CommonRequestError) return invalid(error);
    return failure("common.internal_failure", "The L-01 common-subset operation failed without exposing owner state.", {
      failureClass: "common.internal_failure",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      evidence: {},
    });
  }
}
