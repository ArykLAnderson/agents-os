import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  failure,
  RETRY_DISPOSITIONS,
  success,
  unsupported,
} from "../../../../shared/protocol.mjs";
import { invokeSubstrateOperation } from "../substrate/index.mjs";
import {
  canonicalCommitRequestDigest,
  deriveInternalCursorSigningKey,
  mechanicalDigest,
} from "../substrate/mechanical.mjs";
import {
  interchangeFrontmatter,
  interchangeJsonSection,
} from "../../../../shared/l01-interchange.mjs";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const uuidId = (prefix) => new RegExp(`^${prefix}:${UUID}$`);
const FRAME_REPRESENTATION = Object.freeze({ id: "frame-canonical", version: 2 });
const LEGACY_FRAME_REPRESENTATION = Object.freeze({ id: "frame-minimal", version: 1 });
const ACTIVE_CATEGORIES = new Set(["fog", "frontier", "blocked", "contested", "deferred", "out_of_scope"]);
const FRAME_STATUSES = new Set(["active", "completed", "abandoned", "superseded"]);
const DISCOVERY_LIFECYCLES = new Set(["active", "settled", "tombstoned"]);
const HUMAN_AUTHORITY = new Set(["required", "not_required", "unclear"]);
const REFERENCE_KINDS = new Set(["case", "knowledge", "source", "evidence", "frame", "artifact", "document", "blueprint", "route", "map"]);
const MAX_DISCOVERY = 128;
const FRAME_FIELDS = new Set([
  "id", "home_namespace_id", "authority_scope_namespace_ids", "status", "title", "outcome",
  "included_scope", "excluded_scope", "limitations", "completion_condition", "case_links", "frame_links",
  "downstream_links", "artifact_links", "authorization_provenance", "discovery",
]);
const DISCOVERY_FIELDS = new Set([
  "id", "display_label", "display_order", "lifecycle", "category", "title", "body",
  "human_authority", "dependencies", "disposition", "resolution", "reopened_from_version", "reopening_basis",
]);
const REFERENCE_FIELDS = new Set(["target_kind", "target_id", "observed_revision_id", "pinned_revision_id", "predicate", "provenance"]);
const ARTIFACT_FIELDS = new Set(["artifact_id", "kind", "title", "summary", "locator", "observed_revision_id", "pinned_revision_id"]);
const LOCATOR_FIELDS = new Set(["uri", "media_type", "audience", "digest"]);
const AUTHORIZATION_FIELDS = new Set(["session", "acting_role", "authority_basis", "human_confirmation", "causation", "correlation"]);
const HUMAN_CONFIRMATION_FIELDS = new Set(["reference", "confirmed_at", "scope", "expires_at"]);
const TARGET_PREFIX = Object.freeze({ case: "case", frame: "frame", artifact: "artifact", document: "document", blueprint: "blueprint", route: "route", map: "map", knowledge: "entry", source: "source", evidence: "evidence" });
const TARGET_REVISION_PREFIX = Object.freeze(Object.fromEntries(
  [...REFERENCE_KINDS].map((kind) => [kind, `${kind}-revision`]),
));
const CONTEXT_FIELDS = new Set(["view_id", "view_policy_revision_id", "purpose", "requested_audience_ceiling"]);
const CREATE_REQUEST_FIELDS = new Set([
  "protocol", "operation", "request_version", "operation_id", "store_id", "context",
  "expected_revision", "commit_basis", "provenance", "frame", "configuration",
]);
const COMMIT_REQUEST_FIELDS = new Set([...CREATE_REQUEST_FIELDS, "frame_id"]);
const READ_REQUEST_FIELDS = new Set([
  "protocol", "operation", "request_version", "store_id", "context", "frame_id", "revision_id", "revision_number", "configuration",
]);
const RESOLVE_REQUEST_FIELDS = new Set([
  "protocol", "operation", "request_version", "store_id", "context", "frame_id", "configuration",
]);
const DISCOVERY_READ_FIELDS = new Set([
  "protocol", "operation", "request_version", "store_id", "context", "frame_id", "discovery_item_id", "version_id", "revision_id", "revision_number", "configuration",
]);
const HISTORY_REQUEST_FIELDS = new Set([
  "protocol", "operation", "request_version", "store_id", "context", "frame_id", "limit", "cursor", "configuration",
]);
const LIST_REQUEST_FIELDS = new Set([
  "protocol", "operation", "request_version", "store_id", "context", "statuses", "limit", "cursor", "configuration",
]);
const CLOSED_STATUSES = new Set(["completed", "abandoned", "superseded"]);
const MAX_PAGE = 100;
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

function normalizeReference(value, path, allowedKinds = REFERENCE_KINDS) {
  if (!object(value)) throw new FrameRequestError(path, "object_required", "A typed reference object is required.");
  exactKeys(value, REFERENCE_FIELDS, path);
  if (!allowedKinds.has(value.target_kind)) throw new FrameRequestError(`${path}.target_kind`, "reference_kind_invalid", "Reference kind is invalid for this link family.");
  const result = {
    target_kind: value.target_kind,
    target_id: requiredId(value.target_id, `${path}.target_id`, TARGET_PREFIX[value.target_kind]),
    predicate: requiredString(value.predicate, `${path}.predicate`, 256),
  };
  for (const key of ["observed_revision_id", "pinned_revision_id"]) {
    const item = optionalString(value[key], `${path}.${key}`, 512);
    if (item != null) {
      if (!uuidId(TARGET_REVISION_PREFIX[value.target_kind]).test(item)) throw new FrameRequestError(`${path}.${key}`, "revision_reference_invalid", `Observed/pinned revision must be a ${TARGET_REVISION_PREFIX[value.target_kind]} UUID identity matching target_kind.`);
      result[key] = item;
    }
  }
  const provenance = optionalString(value.provenance, `${path}.provenance`, 512);
  if (provenance != null) result.provenance = provenance;
  return result;
}

function normalizeArtifact(value, path) {
  if (!object(value)) throw new FrameRequestError(path, "object_required", "An artifact metadata link is required.");
  exactKeys(value, ARTIFACT_FIELDS, path);
  if (!object(value.locator)) throw new FrameRequestError(`${path}.locator`, "object_required", "Artifact locator metadata is required.");
  exactKeys(value.locator, LOCATOR_FIELDS, `${path}.locator`);
  if (!["private", "project", "public"].includes(value.locator.audience)) throw new FrameRequestError(`${path}.locator.audience`, "audience_invalid", "Artifact audience is invalid.");
  const locator = { uri: requiredString(value.locator.uri, `${path}.locator.uri`, 4_096), audience: value.locator.audience };
  for (const key of ["media_type", "digest"]) {
    const item = optionalString(value.locator[key], `${path}.locator.${key}`, 512);
    if (item != null) locator[key] = item;
  }
  const result = {
    artifact_id: requiredId(value.artifact_id, `${path}.artifact_id`, "artifact"),
    kind: requiredString(value.kind, `${path}.kind`, 256),
    title: requiredString(value.title, `${path}.title`, 512),
    locator,
  };
  for (const key of ["summary", "observed_revision_id", "pinned_revision_id"]) {
    const item = optionalString(value[key], `${path}.${key}`, key === "summary" ? 4_096 : 512);
    if (item != null) {
      if (key !== "summary" && !uuidId("artifact-revision").test(item)) throw new FrameRequestError(`${path}.${key}`, "revision_reference_invalid", "Artifact revisions must be typed artifact-revision UUID identities.");
      result[key] = item;
    }
  }
  return result;
}

function normalizeAuthorization(value) {
  if (value == null) return {};
  if (!object(value)) throw new FrameRequestError("frame.authorization_provenance", "object_required", "Authorization provenance must be an object.");
  exactKeys(value, AUTHORIZATION_FIELDS, "frame.authorization_provenance");
  const result = {};
  for (const key of AUTHORIZATION_FIELDS) {
    if (value[key] == null) continue;
    if (key === "human_confirmation") {
      if (!object(value[key])) throw new FrameRequestError(`frame.authorization_provenance.${key}`, "object_required", "Human confirmation must be structured.");
      exactKeys(value[key], HUMAN_CONFIRMATION_FIELDS, `frame.authorization_provenance.${key}`);
      result[key] = {
        reference: requiredString(value[key].reference, `frame.authorization_provenance.${key}.reference`, 512),
        confirmed_at: requiredString(value[key].confirmed_at, `frame.authorization_provenance.${key}.confirmed_at`, 128),
        scope: requiredString(value[key].scope, `frame.authorization_provenance.${key}.scope`, 2_048),
      };
      const expires = optionalString(value[key].expires_at, `frame.authorization_provenance.${key}.expires_at`, 128);
      if (expires != null) result[key].expires_at = expires;
    } else result[key] = requiredString(value[key], `frame.authorization_provenance.${key}`, 2_048);
  }
  return result;
}

function normalizeDiscoveryItem(value, index) {
  const path = `frame.discovery[${index}]`;
  if (!object(value)) throw new FrameRequestError(path, "object_required", "A complete Discovery item is required.");
  exactKeys(value, DISCOVERY_FIELDS, path);
  const lifecycle = value.lifecycle;
  const category = value.category;
  if (!DISCOVERY_LIFECYCLES.has(lifecycle)) throw new FrameRequestError(`${path}.lifecycle`, "discovery_lifecycle_invalid", "Discovery lifecycle is invalid.");
  if (lifecycle === "active" && !ACTIVE_CATEGORIES.has(category)) throw new FrameRequestError(`${path}.category`, "active_category_invariant", "Active Discovery cannot use settled or unknown category.");
  if (lifecycle === "settled" && category !== "settled") throw new FrameRequestError(`${path}.category`, "settled_category_required", "Settled Discovery requires the settled category.");
  if (lifecycle === "tombstoned" && category !== "settled") throw new FrameRequestError(`${path}.category`, "tombstone_category_required", "Tombstoned Discovery preserves a settled category.");
  if (lifecycle !== "active" && value.disposition == null && value.resolution == null) throw new FrameRequestError(`${path}.disposition`, "disposition_or_resolution_required", "Settled/tombstoned Discovery requires disposition or resolution.");
  if (lifecycle !== "active" && (value.reopened_from_version != null || value.reopening_basis != null)) throw new FrameRequestError(`${path}.reopened_from_version`, "reopen_fields_active_only", "Reopening metadata is valid only on an active version.");
  if ((value.reopened_from_version == null) !== (value.reopening_basis == null)) throw new FrameRequestError(`${path}.reopened_from_version`, "reopen_pair_required", "reopened_from_version and reopening_basis must appear together.");
  if (!Number.isInteger(value.display_order) || value.display_order < 0 || value.display_order > 1_000_000) throw new FrameRequestError(`${path}.display_order`, "display_order_invalid", "display_order must be a non-negative bounded integer.");
  if (!HUMAN_AUTHORITY.has(value.human_authority)) throw new FrameRequestError(`${path}.human_authority`, "human_authority_invalid", "human_authority is invalid.");
  if (!Array.isArray(value.dependencies) || value.dependencies.length > 128) throw new FrameRequestError(`${path}.dependencies`, "dependencies_invalid", "dependencies must be a bounded array.");
  const result = {
    id: requiredId(value.id, `${path}.id`, "discovery"), display_order: value.display_order, lifecycle, category,
    title: requiredString(value.title, `${path}.title`, 512), body: requiredString(value.body, `${path}.body`, 16_384),
    human_authority: value.human_authority,
    dependencies: value.dependencies.map((item, dependencyIndex) => normalizeReference(item, `${path}.dependencies[${dependencyIndex}]`)),
  };
  for (const key of ["display_label", "disposition", "resolution", "reopening_basis"]) {
    const item = optionalString(value[key], `${path}.${key}`, key === "display_label" ? 64 : 4_096);
    if (item != null) result[key] = item;
  }
  if (value.reopened_from_version != null) result.reopened_from_version = requiredId(value.reopened_from_version, `${path}.reopened_from_version`, "discovery-item-version");
  return result;
}

function normalizeFrame(value) {
  if (!object(value)) throw new FrameRequestError("frame", "object_required", "frame must be an object.");
  exactKeys(value, FRAME_FIELDS, "frame");
  const homeNamespaceId = requiredId(value.home_namespace_id, "frame.home_namespace_id", "namespace");
  if (!Array.isArray(value.authority_scope_namespace_ids) || value.authority_scope_namespace_ids.length < 1 || value.authority_scope_namespace_ids.length > 64) throw new FrameRequestError("frame.authority_scope_namespace_ids", "bounded_scope_required", "Explicit bounded authority scope is required.");
  const authorityScope = value.authority_scope_namespace_ids.map((id, index) => requiredId(id, `frame.authority_scope_namespace_ids[${index}]`, "namespace"));
  if (authorityScope.length !== 1 || authorityScope[0] !== homeNamespaceId) throw new FrameRequestError("frame.authority_scope_namespace_ids", "cross_namespace_scope_unsupported", "Until L03-W03 scope policy exists, authority scope is exactly the Frame home namespace.");
  if (!FRAME_STATUSES.has(value.status)) throw new FrameRequestError("frame.status", "frame_status_invalid", "Frame descriptive status is invalid.");
  if (!Array.isArray(value.discovery) || value.discovery.length < 1 || value.discovery.length > MAX_DISCOVERY) throw new FrameRequestError("frame.discovery", "complete_discovery_required", `One to ${MAX_DISCOVERY} selected Discovery items are required.`);
  const discovery = value.discovery.map(normalizeDiscoveryItem);
  const ids = new Set(); const orders = new Set();
  for (const item of discovery) {
    if (ids.has(item.id)) throw new FrameRequestError("frame.discovery", "duplicate_discovery_id", "Discovery stable IDs must be unique in a Frame revision.");
    if (orders.has(item.display_order)) throw new FrameRequestError("frame.discovery", "duplicate_display_order", "Discovery display orders must be unique in a Frame revision.");
    ids.add(item.id); orders.add(item.display_order);
  }
  const result = { id: requiredId(value.id, "frame.id", "frame"), home_namespace_id: homeNamespaceId, authority_scope_namespace_ids: authorityScope, status: value.status, discovery };
  for (const key of ["title", "outcome", "limitations", "completion_condition"]) { const item = optionalString(value[key], `frame.${key}`, key === "title" ? 512 : 4_096); if (item != null) result[key] = item; }
  for (const key of ["included_scope", "excluded_scope"]) if (value[key] != null) result[key] = stringArray(value[key], `frame.${key}`);
  const linkKinds = { case_links: new Set(["case", "knowledge", "source", "evidence"]), frame_links: new Set(["frame"]), downstream_links: new Set(["document", "blueprint", "route", "map", "frame"]) };
  for (const [key, kinds] of Object.entries(linkKinds)) {
    if (value[key] == null) continue;
    if (!Array.isArray(value[key])) throw new FrameRequestError(`frame.${key}`, "array_required", `${key} must be an array.`);
    result[key] = value[key].map((item, index) => normalizeReference(item, `frame.${key}[${index}]`, kinds));
  }
  if (value.artifact_links != null) {
    if (!Array.isArray(value.artifact_links)) throw new FrameRequestError("frame.artifact_links", "array_required", "artifact_links must be an array.");
    result.artifact_links = value.artifact_links.map((item, index) => normalizeArtifact(item, `frame.artifact_links[${index}]`));
  }
  if (value.authorization_provenance != null) result.authorization_provenance = normalizeAuthorization(value.authorization_provenance);
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

function validateMutation(request, create) {
  exactKeys(request, create ? CREATE_REQUEST_FIELDS : COMMIT_REQUEST_FIELDS, "request");
  if (request.request_version !== 1) throw new FrameRequestError("request_version", "version_incompatible", "request_version must be 1.");
  requiredString(request.operation_id, "operation_id", 256);
  requiredId(request.store_id, "store_id", "store");
  if (!Number.isInteger(request.expected_revision) || (create ? request.expected_revision !== 0 : request.expected_revision < 1)) throw new FrameRequestError("expected_revision", create ? "create_requires_absent_revision" : "positive_expected_revision_required", "Expected revision is invalid for this mutation.");
  if (!create) requiredId(request.frame_id, "frame_id", "frame");
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

function semanticMutationDigest(request, normalized) {
  return mechanicalDigest({ operation: request.operation, request_version: 1, store_id: request.store_id, context: request.context,
    operation_id: request.operation_id, expected_revision: request.expected_revision, commit_basis: request.commit_basis,
    provenance: request.provenance ?? {}, frame: normalized });
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

function assembleFrameEnvelope(request, frame, priorSelected = new Map(), replayAllocated = new Set()) {
  const semanticDigest = semanticMutationDigest(request, frame);
  const selectVersion = (familyId, content, role) => {
    const prior = priorSelected.get(familyId);
    if (prior && replayAllocated.has(prior.version_id)) return { version_id: allocate("version", request, semanticDigest, role), changed: true };
    return prior?.content_digest === mechanicalDigest(content) ? { version_id: prior.version_id, changed: false }
      : { version_id: allocate("version", request, semanticDigest, role), changed: true };
  };
  const { discovery, ...metadata } = frame;
  const metadataContent = { schema: "frame-profile@1", ...metadata };
  const frameSelection = selectVersion(frame.id, metadataContent, "frame-version");
  const frameVersionId = frameSelection.version_id;
  const discoverySelections = discovery.map((item) => {
    const content = { schema: "frame-discovery-item@1", ...item };
    return { discovery_item_id: item.id, content, ...selectVersion(item.id, content, `discovery-version:${item.id}`) };
  });
  const discoveryAllocations = discoverySelections.map(({ discovery_item_id, version_id }) => ({ discovery_item_id, version_id }));
  const allocations = {
    frame_version_id: frameVersionId,
    discovery_item_version_ids: discoveryAllocations,
    revision_id: allocate("owner-revision", request, semanticDigest, "owner-revision"),
    event_id: allocate("event", request, semanticDigest, "event"),
    outbox_id: allocate("outbox", request, semanticDigest, "outbox"),
  };
  const versions = [];
  if (frameSelection.changed) versions.push({ family_id: frame.id, version_id: frameVersionId, content: metadataContent, content_digest: mechanicalDigest(metadataContent) });
  const selections = [{ family_id: frame.id, version_id: frameVersionId }];
  for (const item of discoverySelections) {
    if (item.changed) versions.push({ family_id: item.discovery_item_id, version_id: item.version_id, content: item.content, content_digest: mechanicalDigest(item.content) });
    selections.push({ family_id: item.discovery_item_id, version_id: item.version_id });
  }
  const eventPayload = {
    schema: "frame-change@1",
    change: request.expected_revision === 0 ? "created" : "revised",
    frame_id: frame.id,
    changed_discovery_item_ids: discoverySelections.filter((item) => item.changed).map((item) => item.discovery_item_id),
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
    expected_revision: request.expected_revision,
    representation: FRAME_REPRESENTATION,
    revision: {
      id: allocations.revision_id,
      number: request.expected_revision + 1,
      normalized: {
        schema: "frame-canonical-selection@2",
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
  return { envelope, allocations, semanticDigest };
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
    const code = operation === "create" ? "frame.create_identity_exists" : "frame.revision_conflict";
    return failure(code, "The Frame expected revision does not match current state.", {
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
  const representationCompatible = (revision.representation?.id === FRAME_REPRESENTATION.id && revision.representation?.version === FRAME_REPRESENTATION.version)
    || (revision.representation?.id === LEGACY_FRAME_REPRESENTATION.id && revision.representation?.version === LEGACY_FRAME_REPRESENTATION.version);
  if (!representationCompatible) throw new FrameRequestError("stored.representation", "representation_incompatible", "Stored Frame representation is incompatible.");
  const normalized = revision.normalized;
  if (!new Set(["frame-minimal-selection@1", "frame-canonical-selection@2"]).has(normalized?.schema) || !Array.isArray(normalized.discovery_selections)) {
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
    if (!DISCOVERY_LIFECYCLES.has(item.lifecycle) || !Array.isArray(item.dependencies)) {
      throw new FrameRequestError("stored.discovery_version", "lifecycle_invalid", "Stored Discovery lifecycle is invalid.");
    }
    return { ...item, version_id: frameTypedId("discovery-item-version", version.version_id) };
  });
  if (selected.size !== discovery.length + 1) {
    throw new FrameRequestError("stored.selection", "unexpected_family", "Stored Frame contains an unexpected selected family.");
  }
  const { schema: _schema, ...metadata } = frameVersion.content;
  if (!FRAME_STATUSES.has(metadata.status)) throw new FrameRequestError("stored.frame_version", "status_invalid", "Stored Frame status is invalid.");
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

function hydrateListItem(item, statuses = new Set(["active"])) {
  const projection = item.current_projection;
  if (projection?.schema !== "frame-current@1" || projection.id !== item.owner.id) {
    throw new FrameRequestError("stored.current_projection", "projection_incompatible", "Stored Frame projection is incompatible.");
  }
  if (!statuses.has(projection.status)) return null;
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

function completionEvidence(frame) {
  const activeDiscovery = frame.discovery.filter((item) => item.lifecycle === "active").length;
  return {
    frame: { descriptive_status: frame.status, closed: CLOSED_STATUSES.has(frame.status), active_discovery_items: activeDiscovery },
    case_reconciliation: { status: "not_evaluated", linked_cases: frame.case_links?.filter((link) => link.target_kind === "case").length ?? 0 },
    overall_completion_asserted: false,
  };
}

function frameMutationReceipt(mechanicalReceipt, mechanicalResult, request, frame) {
  const observed = mechanicalResult.observed_revision;
  const committed = mechanicalResult.committed_revision;
  return {
    operation_id: mechanicalReceipt.operation_id, operation: request.operation, store_id: mechanicalReceipt.store_id,
    frame_id: frame.id, request_digest: mechanicalReceipt.request_digest, expected_revision: mechanicalReceipt.expected_revision,
    observed_revision: observed == null ? null : { id: frameTypedId("frame-revision", observed.id), number: observed.number },
    committed_revision: { id: frameTypedId("frame-revision", committed.id), number: committed.number },
    outcome: "committed", event_id: mechanicalReceipt.event_id, result_digest: mechanicalReceipt.result_digest,
    settled_at: mechanicalReceipt.settled_at, retry_disposition: mechanicalReceipt.retry_disposition, operation_fence: mechanicalReceipt.operation_fence,
  };
}

async function mutateFrame(request, create) {
  validateMutation(request, create);
  const frame = normalizeFrame(request.frame);
  if (!create && request.frame_id !== frame.id) throw new FrameRequestError("frame.id", "frame_identity_mismatch", "frame.id must match frame_id.");
  let priorSelected = new Map();
  let replayAllocated = new Set();
  if (create) {
    const illegalReopen = frame.discovery.find((item) => item.reopened_from_version != null);
    if (illegalReopen) throw new FrameRequestError("frame.discovery", "reopen_requires_prior_settlement", "A newly created Discovery family cannot be reopened.");
  } else {
    const priorReceipt = await invokeSubstrateOperation({ operation: "get_owner_operation_receipt", configuration: request.configuration, store_id: request.store_id, context: request.context, operation_id: request.operation_id, owner: { id: frame.id, kind: "frame", home_namespace_id: frame.home_namespace_id } });
    if (priorReceipt?.ok && priorReceipt.result.status === "settled") {
      priorSelected = new Map(priorReceipt.result.recovery_selection.map((version) => [version.family_id, version]));
      replayAllocated = new Set(priorReceipt.result.receipt.result?.allocations?.version_ids ?? []);
    } else {
      const current = await invokeSubstrateOperation({ operation: "read_owner_current", configuration: request.configuration, store_id: request.store_id, context: request.context, owner: { id: frame.id, kind: "frame" } });
      if (!current?.ok) return typedFailure("commit_revision", current);
      const hydrated = hydrateFrame(current.result);
      priorSelected = new Map(current.result.revision.selected_versions.map((version) => [version.family_id, version]));
      const submitted = new Set(frame.discovery.map((item) => item.id));
      const omitted = hydrated.frame.discovery.find((item) => !submitted.has(item.id));
      if (omitted) throw new FrameRequestError("frame.discovery", "selected_family_omitted", "Every previously selected Discovery family must remain explicitly selected with an active, settled, or tombstoned version.");
      for (const item of frame.discovery) {
        const prior = hydrated.frame.discovery.find((candidate) => candidate.id === item.id);
        if (!prior && item.reopened_from_version != null) throw new FrameRequestError("frame.discovery", "reopen_requires_prior_settlement", "A newly added Discovery family cannot be reopened.");
        if (prior && prior.lifecycle !== "active" && item.lifecycle === "active") {
          if (item.reopened_from_version !== prior.version_id || item.reopening_basis == null) throw new FrameRequestError("frame.discovery", "reopen_reference_required", "Reopening requires the exact prior selected settled/tombstoned version and a basis.");
        }
        if (prior?.lifecycle === "active" && item.reopened_from_version != null) {
          const { version_id: _versionId, ...priorContent } = prior;
          if (mechanicalDigest(priorContent) !== mechanicalDigest(item)) throw new FrameRequestError("frame.discovery", "active_to_active_reopen_invalid", "Reopening metadata cannot be introduced or changed on an active-to-active transition.");
        }
        if (prior?.lifecycle !== "active" && item.lifecycle === "tombstoned"
          && (item.disposition !== prior.disposition || item.resolution !== prior.resolution)) {
          throw new FrameRequestError("frame.discovery", "tombstone_disposition_must_be_preserved", "Tombstoning a settled family preserves its last disposition and resolution.");
        }
      }
    }
  }
  const { envelope, allocations } = assembleFrameEnvelope(request, frame, priorSelected, replayAllocated);
  const mechanical = await invokeSubstrateOperation({ operation: "commit_owner_revision", configuration: request.configuration, context: request.context, envelope });
  if (!mechanical?.ok) return typedFailure(create ? "create" : "commit_revision", mechanical);
  const versions = new Map(allocations.discovery_item_version_ids.map((item) => [item.discovery_item_id, frameTypedId("discovery-item-version", item.version_id)]));
  const operation = create ? "frame.create" : "frame.commit_revision";
  return success(operation, {
    status: "settled", frame: { ...frame, discovery: frame.discovery.map((item) => ({ ...item, version_id: versions.get(item.id) })) },
    revision: { id: frameTypedId("frame-revision", allocations.revision_id), number: request.expected_revision + 1,
      committed_at: mechanical.result.receipt.settled_at,
      version_ids: { frame: frameTypedId("frame-version", allocations.frame_version_id), discovery_items: allocations.discovery_item_version_ids.map((item) => ({ discovery_item_id: item.discovery_item_id, version_id: frameTypedId("discovery-item-version", item.version_id) })) } },
    event_id: allocations.event_id, receipt: frameMutationReceipt(mechanical.result.receipt, mechanical.result, request, frame),
    completion_evidence: completionEvidence(frame),
    idempotent_replay: mechanical.result.idempotent_replay, applied_view: mechanical.result.applied_view,
  });
}

async function readFrame(request) {
  exactKeys(request, READ_REQUEST_FIELDS, "request");
  if (request.request_version !== 1) throw new FrameRequestError("request_version", "version_incompatible", "request_version must be 1.");
  const frameId = requiredId(request.frame_id, "frame_id", "frame");
  requiredId(request.store_id, "store_id", "store");
  validateContext(request.context);
  if (request.revision_id != null && request.revision_number != null) throw new FrameRequestError("revision_id", "revision_selector_ambiguous", "Select a revision by ID or number, not both.");
  if (request.revision_id != null) requiredId(request.revision_id, "revision_id", "frame-revision");
  if (request.revision_number != null && (!Number.isInteger(request.revision_number) || request.revision_number < 1)) throw new FrameRequestError("revision_number", "positive_revision_required", "revision_number must be positive.");
  const historical = request.revision_id != null || request.revision_number != null;
  const mechanical = await invokeSubstrateOperation({
    operation: historical ? "read_owner_revision" : "read_owner_current",
    configuration: request.configuration,
    store_id: request.store_id,
    context: request.context,
    owner: { id: frameId, kind: "frame" },
    ...(request.revision_id == null ? {} : { revision_id: `owner-revision:${request.revision_id.slice(15)}` }),
    ...(request.revision_number == null ? {} : { revision_number: request.revision_number }),
  });
  if (!mechanical?.ok) return typedFailure("read", mechanical);
  try {
    const hydrated = hydrateFrame(mechanical.result);
    return success("frame.read", { ...hydrated, completion_evidence: completionEvidence(hydrated.frame) });
  } catch (error) {
    return failure("frame.stored_representation_incompatible", "The stored Frame cannot be hydrated through Frame representation version 1.", {
      failureClass: "frame.stored_representation_incompatible",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      evidence: { violations: [{ path: error.path ?? "stored", rule: error.rule ?? "incompatible" }] },
    });
  }
}

function pageLimit(value) {
  if (value == null) return 50;
  if (!Number.isInteger(value) || value < 1 || value > MAX_PAGE) throw new FrameRequestError("limit", "page_limit_invalid", `limit must be 1 to ${MAX_PAGE}.`);
  return value;
}
const MAX_CURSOR_BYTES = 1024;
// Cursors are opaque trusted-local continuation state. The checksum and derived
// signature detect accidental edits in normal use; they are integrity checks, not
// authentication or an access-control boundary against a source-aware caller.
function cursorDigest(value) { return createHash("sha256").update(`casebook-frame-cursor@1\0${value}`).digest("hex"); }
function cursorSignature(key, payload, digest) { return createHmac("sha256", key).update(`casebook-frame-cursor-signature@1\0${payload}\0${digest}`).digest("hex"); }
function encodeCursor(key, binding, fence, lastKey) {
  const payload = JSON.stringify({ v: 1, q: binding, f: fence, k: lastKey });
  const digest = cursorDigest(payload);
  return Buffer.from(JSON.stringify({ p: payload, d: digest, s: cursorSignature(key, payload, digest) })).toString("base64url");
}
function decodeCursor(value, binding, key) {
  try {
    const encoded = requiredString(value, "cursor", MAX_CURSOR_BYTES);
    if (Buffer.byteLength(encoded) > MAX_CURSOR_BYTES) throw new Error();
    const envelope = JSON.parse(Buffer.from(encoded, "base64url").toString());
    if (Object.keys(envelope).length !== 3 || typeof envelope.p !== "string" || typeof envelope.d !== "string" || typeof envelope.s !== "string") throw new Error();
    const expectedDigest = cursorDigest(envelope.p);
    const expectedSignature = cursorSignature(key, envelope.p, envelope.d);
    if (envelope.d !== expectedDigest || envelope.s.length !== expectedSignature.length || !timingSafeEqual(Buffer.from(envelope.s), Buffer.from(expectedSignature))) throw new Error();
    const parsed = JSON.parse(envelope.p);
    if (Object.keys(parsed).length !== 4 || parsed.v !== 1 || parsed.q !== binding || !Number.isInteger(parsed.f) || parsed.f < 1 || !Array.isArray(parsed.k) || parsed.k.length !== 2 || parsed.k.some((part) => typeof part !== "string")) throw new Error();
    return parsed;
  } catch { throw new FrameRequestError("cursor", "cursor_invalid_or_query_mismatch", "The opaque cursor is invalid or belongs to another query."); }
}
function listSortKey(item) { return [item.current_revision.committed_at, item.id]; }

async function listFrames(request) {
  exactKeys(request, LIST_REQUEST_FIELDS, "request");
  if (request.request_version !== 1) throw new FrameRequestError("request_version", "version_incompatible", "request_version must be 1.");
  requiredId(request.store_id, "store_id", "store");
  validateContext(request.context);
  const statuses = request.statuses == null ? ["active"] : stringArray(request.statuses, "statuses", { min: 1, max: 4 });
  if (statuses.some((status) => !FRAME_STATUSES.has(status)) || new Set(statuses).size !== statuses.length) throw new FrameRequestError("statuses", "frame_status_filter_invalid", "statuses must contain unique descriptive Frame statuses.");
  const limit = pageLimit(request.limit);
  const binding = mechanicalDigest({ operation: "frame.list", store_id: request.store_id, view: request.context, statuses: [...statuses].sort(), limit });
  try {
    const cursorKey = await deriveInternalCursorSigningKey(request.configuration, request.store_id);
    if (!cursorKey) throw new Error("verified store cursor key unavailable");
    const decoded = request.cursor == null ? null : decodeCursor(request.cursor, binding, cursorKey);
    const statusSet = new Set(statuses);
    const items = [];
    let afterKey = decoded?.k ?? null;
    let fence = decoded?.f ?? null;
    let appliedView = null;
    let hasMore = true;
    while (hasMore && items.length <= limit) {
      const mechanical = await invokeSubstrateOperation({
        operation: "page_owner_current",
        configuration: request.configuration,
        store_id: request.store_id,
        context: request.context,
        owner_kind: "frame",
        limit: MAX_PAGE,
        ...(afterKey == null ? {} : { after_key: afterKey }),
        ...(fence == null ? {} : { expected_fence: fence }),
      });
      if (!mechanical?.ok) {
        if (mechanical?.failure?.code === "snapshot_fence_changed") {
          throw new FrameRequestError("cursor", "cursor_fence_expired", "The store changed; restart Frame pagination.");
        }
        return typedFailure("list", mechanical);
      }
      fence ??= mechanical.result.operation_fence;
      appliedView = mechanical.result.applied_view;
      for (const raw of mechanical.result.items) {
        const item = hydrateListItem(raw, statusSet);
        if (item != null) items.push(item);
        afterKey = [raw.revision.committed_at, raw.owner.id];
        if (items.length > limit) break;
      }
      hasMore = items.length > limit || mechanical.result.has_more;
      if (items.length <= limit && mechanical.result.has_more) afterKey = mechanical.result.next_after_key;
    }
    const pageItems = items.slice(0, limit);
    return success("frame.list", {
      status: "found",
      items: pageItems,
      applied_lifecycle_scope: statuses.length === 1 && statuses[0] === "active" ? "active_only" : "explicit_statuses",
      applied_statuses: statuses,
      next_cursor: hasMore ? encodeCursor(cursorKey, binding, fence, listSortKey(pageItems.at(-1))) : null,
      index_state: "current",
      result_completeness: "complete_within_bounds",
      stable_sort: "updated_desc_id_asc",
      snapshot_query_fence: fence,
      applied_view: appliedView,
    });
  } catch (error) {
    if (error instanceof FrameRequestError) throw error;
    return failure("frame.stored_representation_incompatible", "A stored Frame list projection is incompatible with Frame representation version 1.", {
      failureClass: "frame.stored_representation_incompatible",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      evidence: { violations: [{ path: error.path ?? "stored", rule: error.rule ?? "incompatible" }] },
    });
  }
}

async function resolveFrame(request) {
  exactKeys(request, RESOLVE_REQUEST_FIELDS, "request");
  const read = await readFrame({ ...request, operation: "frame.read" });
  if (!read.ok) return read;
  return success("frame.resolve", { status: "resolved", frame_id: read.result.frame.id, current_revision: read.result.revision, status_value: read.result.frame.status, applied_view: read.result.applied_view });
}

async function readDiscovery(request) {
  exactKeys(request, DISCOVERY_READ_FIELDS, "request");
  requiredId(request.discovery_item_id, "discovery_item_id", "discovery");
  if (request.version_id != null) requiredId(request.version_id, "version_id", "discovery-item-version");
  const frameRead = await readFrame({ protocol: request.protocol, operation: "frame.read", request_version: request.request_version,
    store_id: request.store_id, context: request.context, frame_id: request.frame_id, configuration: request.configuration,
    ...(request.revision_id == null ? {} : { revision_id: request.revision_id }),
    ...(request.revision_number == null ? {} : { revision_number: request.revision_number }),
  });
  if (!frameRead.ok) return frameRead;
  const item = frameRead.result.frame.discovery.find((candidate) => candidate.id === request.discovery_item_id
    && (request.version_id == null || candidate.version_id === request.version_id));
  if (!item) return failure("frame.discovery_not_found_or_not_visible", "The Discovery item or selected version is unknown or not visible.", { failureClass: "frame.read_failure", evidence: {} });
  return success("frame.discovery.read", { status: "found", frame_id: request.frame_id, discovery_item: item, frame_revision: frameRead.result.revision, applied_view: frameRead.result.applied_view });
}

async function frameHistory(request) {
  exactKeys(request, HISTORY_REQUEST_FIELDS, "request");
  if (request.request_version !== 1) throw new FrameRequestError("request_version", "version_incompatible", "request_version must be 1.");
  requiredId(request.frame_id, "frame_id", "frame"); requiredId(request.store_id, "store_id", "store"); validateContext(request.context);
  const limit=pageLimit(request.limit);
  const binding=mechanicalDigest({operation:"frame.history",store_id:request.store_id,view:request.context,frame_id:request.frame_id,limit});
  const current=await readFrame({protocol:request.protocol,operation:"frame.read",request_version:1,store_id:request.store_id,context:request.context,frame_id:request.frame_id,configuration:request.configuration});
  if(!current.ok)return current;
  const cursorKey=await deriveInternalCursorSigningKey(request.configuration,request.store_id);
  if(!cursorKey)throw new Error("verified store cursor key unavailable");
  const decoded=request.cursor==null?null:decodeCursor(request.cursor,binding,cursorKey);
  const fence=current.result.revision.number;
  if(decoded&&decoded.f!==fence)throw new FrameRequestError("cursor","cursor_fence_expired","The Frame changed; restart history pagination.");
  const start=decoded==null?fence:Number(decoded.k[0])-1;
  if(!Number.isInteger(start)||start<1)throw new FrameRequestError("cursor","cursor_invalid_or_query_mismatch","The history cursor sort key is invalid.");
  const items=[];
  for(let number=start;number>=1&&items.length<limit;number--){const result=await readFrame({protocol:request.protocol,operation:"frame.read",request_version:1,store_id:request.store_id,context:request.context,frame_id:request.frame_id,revision_number:number,configuration:request.configuration});if(!result.ok)return result;items.push(result.result);}
  const lastNumber=items.at(-1)?.revision.number??0;
  return success("frame.history",{status:"found",items,index_state:"current",stable_sort:"revision_desc",snapshot_revision_fence:fence,next_cursor:lastNumber>1?encodeCursor(cursorKey,binding,fence,[String(lastNumber),request.frame_id]):null,result_completeness:"complete_within_bounds",applied_view:current.result.applied_view});
}

export async function invokeFrameOperation(request) {
  try {
    if (request.operation === "frame.create") return await mutateFrame(request, true);
    if (request.operation === "frame.commit_revision") return await mutateFrame(request, false);
    if (request.operation === "frame.resolve") return await resolveFrame(request);
    if (request.operation === "frame.read") return await readFrame(request);
    if (request.operation === "frame.discovery.read") return await readDiscovery(request);
    if (request.operation === "frame.history") return await frameHistory(request);
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
