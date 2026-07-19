import { createHash } from "node:crypto";
import {
  failure,
  RETRY_DISPOSITIONS,
  success,
  unsupported,
} from "../../../../shared/protocol.mjs";
import { invokeSubstrateOperation } from "../substrate/index.mjs";
import {
  canonicalCommitRequestDigest,
  mechanicalDigest,
} from "../substrate/mechanical.mjs";
import {
  interchangeFrontmatter,
  interchangeJsonSection,
} from "../../../../shared/l01-interchange.mjs";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const uuidId = (prefix) => new RegExp(`^${prefix}:${UUID}$`);
const FRAME_REPRESENTATION = Object.freeze({ id: "frame-minimal", version: 1 });
const ACTIVE_CATEGORIES = new Set(["fog", "frontier", "blocked", "contested", "deferred", "out_of_scope"]);
const HUMAN_AUTHORITY = new Set(["required", "not_required", "unclear"]);
const MAX_DISCOVERY = 128;
const FRAME_FIELDS = new Set([
  "id", "home_namespace_id", "authority_scope_namespace_ids", "status", "title", "outcome",
  "included_scope", "excluded_scope", "limitations", "completion_condition", "discovery",
]);
const DISCOVERY_FIELDS = new Set([
  "id", "display_label", "display_order", "lifecycle", "category", "title", "body",
  "human_authority", "dependencies",
]);
const CONTEXT_FIELDS = new Set(["view_id", "view_policy_revision_id", "purpose", "requested_audience_ceiling"]);
const CREATE_REQUEST_FIELDS = new Set([
  "protocol", "operation", "request_version", "operation_id", "store_id", "context",
  "expected_revision", "commit_basis", "provenance", "frame", "configuration",
]);
const READ_REQUEST_FIELDS = new Set([
  "protocol", "operation", "request_version", "store_id", "context", "frame_id", "configuration",
]);
const LIST_REQUEST_FIELDS = new Set([
  "protocol", "operation", "request_version", "store_id", "context", "configuration",
]);
const L01_CATEGORY_HEADING = Object.freeze({
  fog: "Fog",
  frontier: "Frontier",
  blocked: "Blocked",
  contested: "Contested",
  deferred: "Deferred",
  out_of_scope: "Out of Scope",
});

export function l01DiscoveryLabel(index) {
  return `AT-${String(index + 1).padStart(3, "0")}`;
}

export function renderL01FrameMarkdown(record) {
  let markdown = interchangeFrontmatter([
    ["type", "frame"],
    ["schema_version", 1],
    ["id", record.id],
    ["home_namespace_id", record.home_namespace_id],
    ["authority_scope_namespace_ids", record.authority_scope_namespace_ids],
    ["status", record.status],
    ["title", record.title],
  ]);
  markdown += interchangeJsonSection("Outcome", record.outcome);
  markdown += interchangeJsonSection("Included Scope", record.included_scope);
  markdown += interchangeJsonSection("Excluded Scope", record.excluded_scope);
  markdown += interchangeJsonSection("Limitations", record.limitations);
  markdown += interchangeJsonSection("Completion Condition", record.completion_condition);
  markdown += "## Discovery\nSee the manifest-selected Discovery file.\n";
  return markdown;
}

export function renderL01DiscoveryMarkdown(record) {
  const groups = new Map();
  record.discovery.forEach((item, index) => {
    const values = groups.get(item.category) ?? [];
    values.push({ item, index });
    groups.set(item.category, values);
  });
  let markdown = "";
  for (const category of Object.keys(L01_CATEGORY_HEADING)) {
    const values = groups.get(category);
    if (!values?.length) continue;
    markdown += `## ${L01_CATEGORY_HEADING[category]}\n\n`;
    for (const { item, index } of values) {
      markdown += `### ${l01DiscoveryLabel(index)}: ${JSON.stringify(item.title)}\n`;
      markdown += `- Human authority: ${item.human_authority}\n\n\`\`\`json\n${JSON.stringify(item.body)}\n\`\`\`\n\n`;
    }
  }
  return markdown;
}

class FrameRequestError extends Error {
  constructor(path, rule, message) {
    super(message);
    this.path = path;
    this.rule = rule;
  }
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new FrameRequestError(`${path}.${key}`, "field_unsupported", "Field is outside the exact L-01 Frame request shape.");
  }
}

function requiredString(value, path, max = 16_384) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    throw new FrameRequestError(path, "required_bounded_string", "A non-empty bounded string is required.");
  }
  return value;
}

function optionalString(value, path, max = 16_384) {
  return value == null ? undefined : requiredString(value, path, max);
}

function requiredId(value, path, prefix) {
  requiredString(value, path, 128);
  if (!uuidId(prefix).test(value)) throw new FrameRequestError(path, "uuid_identity_required", `A lowercase UUID-based ${prefix}: identity is required.`);
  return value;
}

function stringArray(value, path, { min = 0, max = 64 } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new FrameRequestError(path, "bounded_array_required", `An array of ${min} to ${max} strings is required.`);
  }
  return value.map((item, index) => requiredString(item, `${path}[${index}]`, 4_096));
}

function normalizeDiscoveryItem(value, index) {
  const path = `frame.discovery[${index}]`;
  if (!object(value)) throw new FrameRequestError(path, "object_required", "A complete Discovery item is required.");
  exactKeys(value, DISCOVERY_FIELDS, path);
  const lifecycle = value.lifecycle;
  const category = value.category;
  if (lifecycle !== "active") {
    throw new FrameRequestError(`${path}.lifecycle`, "active_discovery_only_l01", "L-01 accepts only active Discovery items.");
  }
  if (!ACTIVE_CATEGORIES.has(category)) {
    throw new FrameRequestError(`${path}.category`, "active_category_invariant", "Active Discovery cannot use a settled or unknown category.");
  }
  if (!Number.isInteger(value.display_order) || value.display_order < 0 || value.display_order > 1_000_000) {
    throw new FrameRequestError(`${path}.display_order`, "display_order_invalid", "display_order must be a non-negative bounded integer.");
  }
  if (!HUMAN_AUTHORITY.has(value.human_authority)) {
    throw new FrameRequestError(`${path}.human_authority`, "human_authority_invalid", "human_authority is invalid.");
  }
  if (!Array.isArray(value.dependencies)) {
    throw new FrameRequestError(`${path}.dependencies`, "dependencies_invalid", "dependencies must be an array.");
  }
  if (value.dependencies.length !== 0) {
    throw new FrameRequestError(`${path}.dependencies`, "dependencies_unsupported_until_l03", "Non-empty Discovery dependencies remain unsupported until L-03.");
  }
  const result = {
    id: requiredId(value.id, `${path}.id`, "discovery"),
    display_order: value.display_order,
    lifecycle,
    category,
    title: requiredString(value.title, `${path}.title`, 512),
    body: requiredString(value.body, `${path}.body`, 16_384),
    human_authority: value.human_authority,
    dependencies: [],
  };
  const displayLabel = optionalString(value.display_label, `${path}.display_label`, 64);
  if (displayLabel != null) result.display_label = displayLabel;
  return result;
}

function normalizeFrame(value) {
  if (!object(value)) throw new FrameRequestError("frame", "object_required", "frame must be an object.");
  exactKeys(value, FRAME_FIELDS, "frame");
  const homeNamespaceId = requiredId(value.home_namespace_id, "frame.home_namespace_id", "namespace");
  if (!Array.isArray(value.authority_scope_namespace_ids) || value.authority_scope_namespace_ids.length !== 1
    || value.authority_scope_namespace_ids[0] !== homeNamespaceId) {
    throw new FrameRequestError(
      "frame.authority_scope_namespace_ids",
      "cross_namespace_scope_unsupported",
      "The L-01 minimal Frame supports exactly its visible home namespace; cross-namespace scope remains unsupported.",
    );
  }
  if (value.status !== "active") throw new FrameRequestError("frame.status", "active_frame_only_l01", "L-01 accepts only active Frames.");
  if (!Array.isArray(value.discovery) || value.discovery.length < 1 || value.discovery.length > MAX_DISCOVERY) {
    throw new FrameRequestError("frame.discovery", "complete_discovery_required", `One to ${MAX_DISCOVERY} selected Discovery items are required.`);
  }
  const discovery = value.discovery.map(normalizeDiscoveryItem);
  const ids = new Set();
  const orders = new Set();
  for (const item of discovery) {
    if (ids.has(item.id)) throw new FrameRequestError("frame.discovery", "duplicate_discovery_id", "Discovery stable IDs must be unique in a Frame revision.");
    if (orders.has(item.display_order)) throw new FrameRequestError("frame.discovery", "duplicate_display_order", "Discovery display orders must be unique in a Frame revision.");
    ids.add(item.id);
    orders.add(item.display_order);
  }
  const result = {
    id: requiredId(value.id, "frame.id", "frame"),
    home_namespace_id: homeNamespaceId,
    authority_scope_namespace_ids: [homeNamespaceId],
    status: value.status,
    discovery,
  };
  for (const key of ["title", "outcome", "limitations", "completion_condition"]) {
    const normalized = optionalString(value[key], `frame.${key}`, key === "title" ? 512 : 4_096);
    if (normalized != null) result[key] = normalized;
  }
  for (const key of ["included_scope", "excluded_scope"]) {
    if (value[key] != null) result[key] = stringArray(value[key], `frame.${key}`);
  }
  return result;
}

function validateContext(value) {
  if (!object(value)) throw new FrameRequestError("context", "view_context_required", "An exact view context is required.");
  exactKeys(value, CONTEXT_FIELDS, "context");
  requiredId(value.view_id, "context.view_id", "view");
  requiredId(value.view_policy_revision_id, "context.view_policy_revision_id", "view-policy");
  requiredString(value.purpose, "context.purpose", 512);
  if (value.requested_audience_ceiling != null && value.requested_audience_ceiling !== "private") {
    throw new FrameRequestError("context.requested_audience_ceiling", "audience_ceiling_invalid", "L-01 permits only the private audience ceiling.");
  }
}

function validateCreate(request) {
  exactKeys(request, CREATE_REQUEST_FIELDS, "request");
  if (request.request_version !== 1) throw new FrameRequestError("request_version", "version_incompatible", "request_version must be 1.");
  requiredString(request.operation_id, "operation_id", 256);
  requiredId(request.store_id, "store_id", "store");
  if (request.expected_revision !== 0) throw new FrameRequestError("expected_revision", "create_requires_absent_revision", "Frame create requires expected_revision 0.");
  requiredString(request.commit_basis, "commit_basis", 2_048);
  validateContext(request.context);
}

function normalizedProvenance(request) {
  const supplied = request.provenance;
  if (supplied != null && !object(supplied)) throw new FrameRequestError("provenance", "object_required", "provenance must be an object when present.");
  const allowed = new Set(["causation", "correlation", "session", "acting_role", "authority_basis"]);
  if (supplied) exactKeys(supplied, allowed, "provenance");
  const result = { commit_basis: request.commit_basis };
  for (const key of allowed) {
    if (supplied?.[key] != null) result[key] = requiredString(supplied[key], `provenance.${key}`, 512);
  }
  return result;
}

function semanticCreateDigest(request, normalized) {
  return mechanicalDigest({
    operation: "frame.create",
    request_version: 1,
    store_id: request.store_id,
    context: request.context,
    operation_id: request.operation_id,
    expected_revision: 0,
    commit_basis: request.commit_basis,
    provenance: request.provenance ?? {},
    frame: normalized,
  });
}

function allocatedUuid(seed) {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function allocate(prefix, request, semanticDigest, role) {
  return `${prefix}:${allocatedUuid(`${request.store_id}\u0000frame\u0000${request.operation_id}\u0000${semanticDigest}\u0000${role}`)}`;
}

function assembleFrameCreateEnvelope(request, frame) {
  const semanticDigest = semanticCreateDigest(request, frame);
  const frameVersionId = allocate("version", request, semanticDigest, "frame-version");
  const discoveryAllocations = frame.discovery.map((item) => ({
    discovery_item_id: item.id,
    version_id: allocate("version", request, semanticDigest, `discovery-version:${item.id}`),
  }));
  const allocations = {
    frame_version_id: frameVersionId,
    discovery_item_version_ids: discoveryAllocations,
    revision_id: allocate("owner-revision", request, semanticDigest, "owner-revision"),
    event_id: allocate("event", request, semanticDigest, "event"),
    outbox_id: allocate("outbox", request, semanticDigest, "outbox"),
  };
  const { discovery, ...metadata } = frame;
  const metadataContent = { schema: "frame-profile@1", ...metadata };
  const versions = [{
    family_id: frame.id,
    version_id: frameVersionId,
    content: metadataContent,
    content_digest: mechanicalDigest(metadataContent),
  }];
  const selections = [{ family_id: frame.id, version_id: frameVersionId }];
  for (let index = 0; index < discovery.length; index += 1) {
    const content = { schema: "frame-discovery-item@1", ...discovery[index] };
    versions.push({
      family_id: discovery[index].id,
      version_id: discoveryAllocations[index].version_id,
      content,
      content_digest: mechanicalDigest(content),
    });
    selections.push({ family_id: discovery[index].id, version_id: discoveryAllocations[index].version_id });
  }
  const eventPayload = {
    schema: "frame-change@1",
    change: "created",
    frame_id: frame.id,
    changed_discovery_item_ids: discovery.map((item) => item.id),
    allocated_version_ids: versions.map((version) => version.version_id),
  };
  const outboxPayload = {
    schema: "frame-projection-work@1",
    frame_id: frame.id,
    revision_id: allocations.revision_id,
  };
  const envelope = {
    envelope_version: 1,
    operation_id: request.operation_id,
    store_id: request.store_id,
    request_digest: "0".repeat(64),
    owner: { id: frame.id, kind: "frame", home_namespace_id: frame.home_namespace_id },
    expected_revision: 0,
    representation: FRAME_REPRESENTATION,
    revision: {
      id: allocations.revision_id,
      number: 1,
      normalized: {
        schema: "frame-minimal-selection@1",
        semantic_request_digest: semanticDigest,
        frame_family_id: frame.id,
        frame_version_id: frameVersionId,
        discovery_selections: discoveryAllocations,
      },
      versions,
      selections,
    },
    current_projection: {
      schema: "frame-current@1",
      id: frame.id,
      home_namespace_id: frame.home_namespace_id,
      authority_scope_namespace_ids: frame.authority_scope_namespace_ids,
      status: frame.status,
      ...(frame.title == null ? {} : { title: frame.title }),
      ...(frame.outcome == null ? {} : { outcome: frame.outcome }),
      frame_version_id: frameVersionId,
    },
    event: {
      id: allocations.event_id,
      type: "frame.revision.committed",
      schema_version: 1,
      visibility_ceiling: "private",
      payload: eventPayload,
      payload_digest: mechanicalDigest(eventPayload),
    },
    outbox: [{
      id: allocations.outbox_id,
      kind: "frame.current_projection.refresh",
      payload: outboxPayload,
      payload_digest: mechanicalDigest(outboxPayload),
    }],
    provenance: normalizedProvenance(request),
  };
  envelope.request_digest = canonicalCommitRequestDigest(request.store_id, request.context, envelope);
  return { envelope, allocations };
}

function frameTypedId(prefix, mechanicalId) {
  return `${prefix}:${mechanicalId.slice(mechanicalId.indexOf(":") + 1)}`;
}

function typedFailure(operation, result) {
  const source = result.failure;
  const common = { retryDisposition: source.retry_disposition, correctiveGuidance: source.corrective_guidance };
  if (source.code === "not_visible") {
    return failure("frame.not_found_or_not_visible", "The Frame is unknown or not visible under the exact view.", {
      ...common, failureClass: "frame.read_failure", evidence: {},
    });
  }
  if (source.code === "revision_conflict") {
    return failure("frame.create_identity_exists", "The Frame identity already has a current revision.", {
      ...common,
      failureClass: "frame.mutation_conflict",
      evidence: {
        current_revision: source.evidence?.current_revision?.id
          ? {
              id: frameTypedId("frame-revision", source.evidence.current_revision.id),
              number: source.evidence.current_revision.number,
            }
          : source.evidence?.current_revision ?? null,
      },
    });
  }
  const mapped = {
    idempotency_mismatch: "frame.idempotency_mismatch",
    identity_conflict: "frame.identity_conflict",
    view_invalid: "frame.view_invalid_or_unavailable",
  }[source.code] ?? "frame.substrate_failure";
  return failure(mapped, `The typed Frame ${operation} operation did not complete.`, {
    ...common, failureClass: mapped,
    evidence: source.code === "idempotency_mismatch" ? { operation_id: source.evidence?.operation_id ?? null } : {},
  });
}

function invalidFrame(error) {
  return failure("frame.invalid_representation", "The minimal Frame request is structurally invalid.", {
    failureClass: "frame.invalid_representation",
    retryDisposition: RETRY_DISPOSITIONS.NEVER,
    correctiveGuidance: "Correct the typed Frame request; do not construct or submit a mechanical envelope.",
    evidence: { violations: [{ path: error.path, rule: error.rule }] },
  });
}

function hydrateFrame(mechanical) {
  const revision = mechanical.revision;
  if (revision.representation?.id !== FRAME_REPRESENTATION.id || revision.representation?.version !== FRAME_REPRESENTATION.version) {
    throw new FrameRequestError("stored.representation", "representation_incompatible", "Stored Frame representation is incompatible.");
  }
  const normalized = revision.normalized;
  if (normalized?.schema !== "frame-minimal-selection@1" || !Array.isArray(normalized.discovery_selections)) {
    throw new FrameRequestError("stored.selection", "selection_incomplete", "Stored Frame selection is incomplete.");
  }
  const selected = new Map(revision.selected_versions.map((version) => [version.family_id, version]));
  const frameVersion = selected.get(mechanical.owner.id);
  if (!frameVersion || frameVersion.version_id !== normalized.frame_version_id
    || frameVersion.content_digest !== mechanicalDigest(frameVersion.content)
    || frameVersion.content?.schema !== "frame-profile@1") {
    throw new FrameRequestError("stored.frame_version", "version_inconsistent", "Stored Frame version is inconsistent.");
  }
  const discovery = normalized.discovery_selections.map((selection) => {
    const version = selected.get(selection.discovery_item_id);
    if (!version || version.version_id !== selection.version_id
      || version.content_digest !== mechanicalDigest(version.content)
      || version.content?.schema !== "frame-discovery-item@1") {
      throw new FrameRequestError("stored.discovery_version", "version_inconsistent", "Stored Discovery version is inconsistent.");
    }
    const { schema: _schema, ...item } = version.content;
    if (item.lifecycle !== "active" || !ACTIVE_CATEGORIES.has(item.category)
      || !Array.isArray(item.dependencies) || item.dependencies.length !== 0) {
      throw new FrameRequestError("stored.discovery_version", "lifecycle_outside_l01", "Stored Discovery is outside the active L-01 representation.");
    }
    return { ...item, version_id: frameTypedId("discovery-item-version", version.version_id) };
  });
  if (selected.size !== discovery.length + 1) {
    throw new FrameRequestError("stored.selection", "unexpected_family", "Stored Frame contains an unexpected selected family.");
  }
  const { schema: _schema, ...metadata } = frameVersion.content;
  if (metadata.status !== "active") {
    throw new FrameRequestError("stored.frame_version", "lifecycle_outside_l01", "Stored Frame is outside the active L-01 representation.");
  }
  return {
    status: "found",
    frame: { ...metadata, discovery },
    revision: {
      id: frameTypedId("frame-revision", revision.id),
      number: revision.number,
      committed_at: revision.committed_at,
      version_ids: {
        frame: frameTypedId("frame-version", frameVersion.version_id),
        discovery_items: normalized.discovery_selections.map((selection) => ({
          discovery_item_id: selection.discovery_item_id,
          version_id: frameTypedId("discovery-item-version", selection.version_id),
        })),
      },
    },
    applied_view: mechanical.applied_view,
  };
}

function hydrateListItem(item) {
  const projection = item.current_projection;
  if (projection?.schema !== "frame-current@1" || projection.id !== item.owner.id) {
    throw new FrameRequestError("stored.current_projection", "projection_incompatible", "Stored Frame projection is incompatible.");
  }
  if (projection.status !== "active") return null;
  return {
    id: projection.id,
    home_namespace_id: projection.home_namespace_id,
    authority_scope_namespace_ids: projection.authority_scope_namespace_ids,
    status: projection.status,
    ...(projection.title == null ? {} : { title: projection.title }),
    ...(projection.outcome == null ? {} : { outcome: projection.outcome }),
    current_revision: {
      id: frameTypedId("frame-revision", item.revision.id),
      number: item.revision.number,
      committed_at: item.revision.committed_at,
    },
  };
}

function frameCreateReceipt(mechanicalReceipt, frame, allocations) {
  return {
    operation_id: mechanicalReceipt.operation_id,
    operation: "frame.create",
    store_id: mechanicalReceipt.store_id,
    frame_id: frame.id,
    request_digest: mechanicalReceipt.request_digest,
    expected_revision: 0,
    committed_revision: { id: frameTypedId("frame-revision", allocations.revision_id), number: 1 },
    outcome: "committed",
    event_id: allocations.event_id,
    result_digest: mechanicalReceipt.result_digest,
    settled_at: mechanicalReceipt.settled_at,
    retry_disposition: mechanicalReceipt.retry_disposition,
    operation_fence: mechanicalReceipt.operation_fence,
  };
}

async function createFrame(request) {
  validateCreate(request);
  const frame = normalizeFrame(request.frame);
  const { envelope, allocations } = assembleFrameCreateEnvelope(request, frame);
  const mechanical = await invokeSubstrateOperation({
    operation: "commit_owner_revision",
    configuration: request.configuration,
    context: request.context,
    envelope,
  });
  if (!mechanical?.ok) return typedFailure("create", mechanical);
  const versions = new Map(allocations.discovery_item_version_ids.map((item) => [
    item.discovery_item_id,
    frameTypedId("discovery-item-version", item.version_id),
  ]));
  return success("frame.create", {
    status: "settled",
    frame: {
      ...frame,
      discovery: frame.discovery.map((item) => ({ ...item, version_id: versions.get(item.id) })),
    },
    revision: {
      id: frameTypedId("frame-revision", allocations.revision_id),
      number: 1,
      committed_at: mechanical.result.receipt.settled_at,
      version_ids: {
        frame: frameTypedId("frame-version", allocations.frame_version_id),
        discovery_items: allocations.discovery_item_version_ids.map((item) => ({
          discovery_item_id: item.discovery_item_id,
          version_id: frameTypedId("discovery-item-version", item.version_id),
        })),
      },
    },
    event_id: allocations.event_id,
    receipt: frameCreateReceipt(mechanical.result.receipt, frame, allocations),
    idempotent_replay: mechanical.result.idempotent_replay,
    applied_view: mechanical.result.applied_view,
  });
}

async function readFrame(request) {
  exactKeys(request, READ_REQUEST_FIELDS, "request");
  if (request.request_version !== 1) throw new FrameRequestError("request_version", "version_incompatible", "request_version must be 1.");
  const frameId = requiredId(request.frame_id, "frame_id", "frame");
  requiredId(request.store_id, "store_id", "store");
  validateContext(request.context);
  const mechanical = await invokeSubstrateOperation({
    operation: "read_owner_current",
    configuration: request.configuration,
    store_id: request.store_id,
    context: request.context,
    owner: { id: frameId, kind: "frame" },
  });
  if (!mechanical?.ok) return typedFailure("read", mechanical);
  try {
    return success("frame.read", hydrateFrame(mechanical.result));
  } catch (error) {
    return failure("frame.stored_representation_incompatible", "The stored Frame cannot be hydrated through Frame representation version 1.", {
      failureClass: "frame.stored_representation_incompatible",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      evidence: { violations: [{ path: error.path ?? "stored", rule: error.rule ?? "incompatible" }] },
    });
  }
}

async function listFrames(request) {
  exactKeys(request, LIST_REQUEST_FIELDS, "request");
  if (request.request_version !== 1) throw new FrameRequestError("request_version", "version_incompatible", "request_version must be 1.");
  requiredId(request.store_id, "store_id", "store");
  validateContext(request.context);
  const mechanical = await invokeSubstrateOperation({
    operation: "list_owner_current",
    configuration: request.configuration,
    store_id: request.store_id,
    context: request.context,
    owner_kind: "frame",
  });
  if (!mechanical?.ok) return typedFailure("list", mechanical);
  try {
    const eligible = mechanical.result.items.map(hydrateListItem).filter((item) => item != null);
    return success("frame.list", {
      status: "found",
      items: eligible,
      applied_lifecycle_scope: "active_only",
      index_state: "current",
      result_completeness: "complete_within_bounds",
      stable_sort: "updated_desc_id_asc",
      snapshot_query_fence: mechanical.result.operation_fence,
      applied_view: mechanical.result.applied_view,
    });
  } catch (error) {
    return failure("frame.stored_representation_incompatible", "A stored Frame list projection is incompatible with Frame representation version 1.", {
      failureClass: "frame.stored_representation_incompatible",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      evidence: { violations: [{ path: error.path ?? "stored", rule: error.rule ?? "incompatible" }] },
    });
  }
}

export async function invokeFrameOperation(request) {
  try {
    if (request.operation === "frame.create") return await createFrame(request);
    if (request.operation === "frame.read") return await readFrame(request);
    if (request.operation === "frame.list") return await listFrames(request);
    return unsupported(request.operation);
  } catch (error) {
    if (error instanceof FrameRequestError) return invalidFrame(error);
    return failure("frame.internal_failure", "The typed Frame operation failed without exposing owner state.", {
      failureClass: "frame.internal_failure",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      evidence: {},
    });
  }
}
