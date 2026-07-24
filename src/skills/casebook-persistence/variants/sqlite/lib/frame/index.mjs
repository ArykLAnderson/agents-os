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
import { locatorSafeForAudience, portablePublicLocatorAssessment } from "../../../../shared/locator.mjs";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const uuidId = (prefix) => new RegExp(`^${prefix}:${UUID}$`);
const FRAME_REPRESENTATION = Object.freeze({ id: "frame-canonical", version: 3 });
const PRE_DISPOSITION_FRAME_REPRESENTATION = Object.freeze({ id: "frame-canonical", version: 2 });
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
  "disposition_boundaries", "case_dispositions",
]);
const DISCOVERY_FIELDS = new Set([
  "id", "display_label", "display_order", "lifecycle", "category", "title", "body",
  "human_authority", "dependencies", "scope_namespace_ids", "disposition", "resolution", "reopened_from_version", "reopening_basis",
]);
const REFERENCE_FIELDS = new Set(["target_kind", "target_id", "observed_revision_id", "pinned_revision_id", "predicate", "provenance", "authority_scope"]);
const ARTIFACT_FIELDS = new Set(["artifact_id", "kind", "title", "summary", "locator", "observed_revision_id", "pinned_revision_id"]);
const LOCATOR_FIELDS = new Set(["uri", "media_type", "audience", "digest"]);
const DISPOSITION_BOUNDARY_FIELDS = new Set([
  "id", "display_label", "display_order", "title", "basis", "evidence_locators", "disposition_ids", "closure",
]);
const CASE_DISPOSITION_FIELDS = new Set([
  "id", "boundary_id", "result_summary", "classification_state", "disposition", "rationale", "evidence_locators",
  "pending_reason", "resume_condition", "realization_state", "case_id", "case_operation_id",
  "observed_case_revision_id", "pinned_case_revision_id", "affected_case_entry_display_ids", "no_case_reason",
]);
const CLASSIFICATION_STATES = new Set(["pending_classification", "classified"]);
const CASE_DISPOSITIONS = new Set(["intake", "reconcile", "no_case"]);
const CASE_REALIZATION_STATES = new Set(["awaiting_case", "settled"]);
const BOUNDARY_CLOSURES = new Set(["open", "closed"]);
const AUTHORIZATION_FIELDS = new Set(["session", "acting_role", "authority_basis", "human_confirmation", "causation", "correlation"]);
const HUMAN_CONFIRMATION_FIELDS = new Set(["reference", "confirmed_at", "scope", "expires_at"]);
const TARGET_PREFIX = Object.freeze({ case: "case", frame: "frame", artifact: "artifact", document: "document", blueprint: "blueprint", route: "route", map: "map", knowledge: "entry", source: "source", evidence: "evidence" });
const TARGET_REVISION_PREFIX = Object.freeze(Object.fromEntries(
  [...REFERENCE_KINDS].map((kind) => [kind, `${kind}-revision`]),
));
const CREATE_REQUEST_FIELDS = new Set([
  "protocol", "operation", "request_version", "operation_id", "store_id",
  "expected_revision", "commit_basis", "provenance", "frame", "configuration",
]);
const COMMIT_REQUEST_FIELDS = new Set([...CREATE_REQUEST_FIELDS, "frame_id"]);
const READ_REQUEST_FIELDS = new Set([
  "protocol", "operation", "request_version", "store_id", "frame_id", "revision_id", "revision_number", "include", "configuration",
]);
const RECEIPT_REQUEST_FIELDS = new Set([
  "protocol", "operation", "request_version", "store_id", "frame_id", "operation_id", "configuration",
]);
const RESOLVE_REQUEST_FIELDS = new Set([
  "protocol", "operation", "request_version", "store_id", "frame_id", "configuration",
]);
const DISCOVERY_READ_FIELDS = new Set([
  "protocol", "operation", "request_version", "store_id", "frame_id", "discovery_item_id", "version_id", "revision_id", "revision_number", "configuration",
]);
const DISPOSITION_READ_FIELDS = new Set([
  "protocol", "operation", "request_version", "store_id", "frame_id", "family_id", "revision_id", "revision_number", "configuration",
]);
const HISTORY_REQUEST_FIELDS = new Set([
  "protocol", "operation", "request_version", "store_id", "frame_id", "limit", "cursor", "configuration",
]);
const LIST_REQUEST_FIELDS = new Set([
  "protocol", "operation", "request_version", "store_id", "namespace_ids", "statuses", "limit", "cursor", "configuration",
]);
const PREPARE_REQUEST_FIELDS = new Set(["protocol", "operation", "request_version", "store_id", "frame_id", "base_revision", "documents", "machine_manifest", "configuration"]);
const EXPORT_REQUEST_FIELDS = new Set(["protocol", "operation", "request_version", "store_id", "context", "frame_id", "revision_id", "revision_number", "audience", "configuration"]);
const DISCOVERY_HYDRATE_FIELDS = new Set(["protocol", "operation", "request_version", "store_id", "handoff_token", "query_digest", "candidate_ids", "configuration"]);
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
  if (record.disposition_boundaries != null && record.case_dispositions != null) {
    const dispositionContent = {
      disposition_boundaries: record.disposition_boundaries.map((item, index) => ({
        source_label: `DB-${String(index + 1).padStart(3, "0")}`,
        record: item,
      })),
      case_dispositions: record.case_dispositions.map((item, index) => ({
        source_label: `CD-${String(index + 1).padStart(3, "0")}`,
        record: item,
      })),
    };
    markdown += `\n## Case Dispositions\n\`\`\`json\n${JSON.stringify(dispositionContent)}\n\`\`\`\n`;
  }
  return markdown;
}

export function l01DiscoveryEntries(record) {
  const categoryOrder = Object.keys(L01_CATEGORY_HEADING);
  return record.discovery
    .map((item, sourceIndex) => ({ item, sourceIndex }))
    .sort((left, right) => {
      const leftCategory = categoryOrder.indexOf(left.item.category);
      const rightCategory = categoryOrder.indexOf(right.item.category);
      return (leftCategory < 0 ? categoryOrder.length : leftCategory)
        - (rightCategory < 0 ? categoryOrder.length : rightCategory)
        || left.sourceIndex - right.sourceIndex;
    })
    .map((entry, displayIndex) => ({ ...entry, display_label: l01DiscoveryLabel(displayIndex) }));
}

export function renderL01DiscoveryMarkdown(record) {
  const entries = l01DiscoveryEntries(record);
  let markdown = "", priorCategory = null;
  for (const { item, display_label: displayLabel } of entries) {
    if (!Object.hasOwn(L01_CATEGORY_HEADING, item.category)) continue;
    if (item.category !== priorCategory) {
      markdown += `## ${L01_CATEGORY_HEADING[item.category]}\n\n`;
      priorCategory = item.category;
    }
    markdown += `### ${displayLabel}: ${JSON.stringify(item.title)}\n`;
    markdown += `- Human authority: ${item.human_authority}\n\n\`\`\`json\n${JSON.stringify(item.body)}\n\`\`\`\n\n`;
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
  if (value.authority_scope != null) {
    if (value.authority_scope !== "external_read_only") throw new FrameRequestError(`${path}.authority_scope`, "external_read_only_marker_invalid", "The only supported authority marker is external_read_only.");
    result.authority_scope = value.authority_scope;
  }
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

function normalizeEvidenceLocator(value, path) {
  if (!object(value)) throw new FrameRequestError(path, "object_required", "An immutable evidence locator is required.");
  exactKeys(value, LOCATOR_FIELDS, path);
  if (!["private", "project", "public"].includes(value.audience)) throw new FrameRequestError(`${path}.audience`, "audience_invalid", "Evidence locator audience is invalid.");
  const result = {
    uri: requiredString(value.uri, `${path}.uri`, 4_096),
    audience: value.audience,
  };
  for (const key of ["media_type", "digest"]) {
    const item = optionalString(value[key], `${path}.${key}`, 512);
    if (item != null) result[key] = item;
  }
  return result;
}

function normalizeEvidenceLocators(value, path) {
  if (value == null) return [];
  if (!Array.isArray(value) || value.length > 32) throw new FrameRequestError(path, "bounded_array_required", "Evidence locators must be a bounded array.");
  return value.map((item, index) => normalizeEvidenceLocator(item, `${path}[${index}]`));
}

function normalizeDispositionBoundary(value, index) {
  const path = `frame.disposition_boundaries[${index}]`;
  if (!object(value)) throw new FrameRequestError(path, "object_required", "A complete disposition boundary is required.");
  exactKeys(value, DISPOSITION_BOUNDARY_FIELDS, path);
  if (!Number.isInteger(value.display_order) || value.display_order < 0 || value.display_order > 1_000_000) throw new FrameRequestError(`${path}.display_order`, "display_order_invalid", "display_order must be a non-negative bounded integer.");
  if (!BOUNDARY_CLOSURES.has(value.closure)) throw new FrameRequestError(`${path}.closure`, "boundary_closure_invalid", "Boundary closure must be open or closed.");
  const title = optionalString(value.title, `${path}.title`, 512);
  const basis = optionalString(value.basis, `${path}.basis`, 4_096);
  if (title == null && basis == null) throw new FrameRequestError(path, "boundary_title_or_basis_required", "A disposition boundary requires a title or bounded basis.");
  if (!Array.isArray(value.disposition_ids) || value.disposition_ids.length < 1 || value.disposition_ids.length > 128) throw new FrameRequestError(`${path}.disposition_ids`, "bounded_array_required", "A declared boundary requires a bounded material-result inventory.");
  const dispositionIds = value.disposition_ids.map((id, dispositionIndex) => requiredId(id, `${path}.disposition_ids[${dispositionIndex}]`, "case-disposition"));
  if (new Set(dispositionIds).size !== dispositionIds.length) throw new FrameRequestError(`${path}.disposition_ids`, "duplicate_disposition_membership", "A boundary inventory cannot repeat a disposition family.");
  const result = {
    id: requiredId(value.id, `${path}.id`, "disposition-boundary"), display_order: value.display_order,
    closure: value.closure, disposition_ids: dispositionIds,
  };
  if (value.display_label != null) result.display_label = requiredString(value.display_label, `${path}.display_label`, 64);
  if (title != null) result.title = title;
  if (basis != null) result.basis = basis;
  if (value.evidence_locators != null) result.evidence_locators = normalizeEvidenceLocators(value.evidence_locators, `${path}.evidence_locators`);
  return result;
}

function normalizeCaseDisposition(value, index) {
  const path = `frame.case_dispositions[${index}]`;
  if (!object(value)) throw new FrameRequestError(path, "object_required", "A complete Case disposition is required.");
  exactKeys(value, CASE_DISPOSITION_FIELDS, path);
  if (!CLASSIFICATION_STATES.has(value.classification_state)) throw new FrameRequestError(`${path}.classification_state`, "classification_state_invalid", "Classification state must be pending_classification or classified.");
  const result = {
    id: requiredId(value.id, `${path}.id`, "case-disposition"),
    boundary_id: requiredId(value.boundary_id, `${path}.boundary_id`, "disposition-boundary"),
    result_summary: requiredString(value.result_summary, `${path}.result_summary`, 4_096),
    classification_state: value.classification_state,
  };
  if (value.evidence_locators != null) result.evidence_locators = normalizeEvidenceLocators(value.evidence_locators, `${path}.evidence_locators`);
  const present = (key) => value[key] != null;
  if (value.classification_state === "pending_classification") {
    const forbidden = ["disposition", "realization_state", "case_id", "case_operation_id", "observed_case_revision_id", "pinned_case_revision_id", "affected_case_entry_display_ids", "no_case_reason"];
    if (forbidden.some(present)) throw new FrameRequestError(path, "pending_classification_shape_invalid", "Pending classification cannot assert a disposition or Case realization.");
    result.pending_reason = requiredString(value.pending_reason, `${path}.pending_reason`, 4_096);
    result.resume_condition = requiredString(value.resume_condition, `${path}.resume_condition`, 4_096);
    if (value.rationale != null) result.rationale = requiredString(value.rationale, `${path}.rationale`, 4_096);
    return result;
  }
  if (present("pending_reason") || present("resume_condition")) throw new FrameRequestError(path, "classified_pending_fields_forbidden", "Classified dispositions cannot retain pending-only fields.");
  if (!CASE_DISPOSITIONS.has(value.disposition)) throw new FrameRequestError(`${path}.disposition`, "classified_disposition_required", "Classified state requires intake, reconcile, or no_case.");
  result.disposition = value.disposition;
  if (value.disposition === "no_case") {
    const forbidden = ["realization_state", "case_id", "case_operation_id", "observed_case_revision_id", "pinned_case_revision_id", "affected_case_entry_display_ids"];
    if (forbidden.some(present)) throw new FrameRequestError(path, "no_case_shape_invalid", "No Case cannot carry Case realization or reference fields.");
    result.no_case_reason = requiredString(value.no_case_reason, `${path}.no_case_reason`, 4_096);
    if (value.rationale != null) result.rationale = requiredString(value.rationale, `${path}.rationale`, 4_096);
    return result;
  }
  if (present("no_case_reason")) throw new FrameRequestError(`${path}.no_case_reason`, "no_case_reason_forbidden", "No Case reason is valid only for no_case.");
  result.rationale = requiredString(value.rationale, `${path}.rationale`, 4_096);
  if (!CASE_REALIZATION_STATES.has(value.realization_state)) throw new FrameRequestError(`${path}.realization_state`, "case_realization_state_required", "Intake/Reconcile requires awaiting_case or settled realization.");
  result.realization_state = value.realization_state;
  result.case_id = requiredId(value.case_id, `${path}.case_id`, "case");
  result.case_operation_id = requiredString(value.case_operation_id, `${path}.case_operation_id`, 256);
  for (const key of ["observed_case_revision_id", "pinned_case_revision_id"]) {
    if (value[key] != null) result[key] = requiredId(value[key], `${path}.${key}`, "case-revision");
  }
  if (value.realization_state === "awaiting_case" && (result.observed_case_revision_id != null || result.pinned_case_revision_id != null)) {
    throw new FrameRequestError(path, "awaiting_case_revision_forbidden", "Awaiting Case realization cannot claim a committed Case revision.");
  }
  if (value.realization_state === "settled" && result.observed_case_revision_id == null && result.pinned_case_revision_id == null) {
    throw new FrameRequestError(path, "settled_case_revision_required", "Settled Case realization requires an observed or pinned committed Case revision.");
  }
  if (value.affected_case_entry_display_ids != null) {
    result.affected_case_entry_display_ids = stringArray(value.affected_case_entry_display_ids, `${path}.affected_case_entry_display_ids`, { max: 128 });
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
  if (value.scope_namespace_ids != null && (!Array.isArray(value.scope_namespace_ids) || value.scope_namespace_ids.length > 64)) throw new FrameRequestError(`${path}.scope_namespace_ids`, "bounded_scope_required", "Discovery scope claims must be a bounded array.");
  const scopeNamespaceIds = value.scope_namespace_ids?.map((id, index) => requiredId(id, `${path}.scope_namespace_ids[${index}]`, "namespace"));
  if (scopeNamespaceIds && new Set(scopeNamespaceIds).size !== scopeNamespaceIds.length) throw new FrameRequestError(`${path}.scope_namespace_ids`, "duplicate_namespace", "Discovery scope claims must be unique.");
  const result = {
    id: requiredId(value.id, `${path}.id`, "discovery"), display_order: value.display_order, lifecycle, category,
    title: requiredString(value.title, `${path}.title`, 512), body: requiredString(value.body, `${path}.body`, 16_384),
    human_authority: value.human_authority,
    dependencies: value.dependencies.map((item, dependencyIndex) => normalizeReference(item, `${path}.dependencies[${dependencyIndex}]`)),
    ...(scopeNamespaceIds == null ? {} : { scope_namespace_ids: scopeNamespaceIds }),
  };
  for (const key of ["display_label", "disposition", "resolution", "reopening_basis"]) {
    const item = optionalString(value[key], `${path}.${key}`, key === "display_label" ? 64 : 4_096);
    if (item != null) result[key] = item;
  }
  if (value.reopened_from_version != null) result.reopened_from_version = requiredId(value.reopened_from_version, `${path}.reopened_from_version`, "discovery-item-version");
  return result;
}

function normalizeFrame(value, { requireDispositionSets = false } = {}) {
  if (!object(value)) throw new FrameRequestError("frame", "object_required", "frame must be an object.");
  exactKeys(value, FRAME_FIELDS, "frame");
  const homeNamespaceId = requiredId(value.home_namespace_id, "frame.home_namespace_id", "namespace");
  if (!Array.isArray(value.authority_scope_namespace_ids) || value.authority_scope_namespace_ids.length < 1 || value.authority_scope_namespace_ids.length > 64) throw new FrameRequestError("frame.authority_scope_namespace_ids", "bounded_scope_required", "Explicit bounded authority scope is required.");
  const authorityScope = value.authority_scope_namespace_ids.map((id, index) => requiredId(id, `frame.authority_scope_namespace_ids[${index}]`, "namespace"));
  if (new Set(authorityScope).size !== authorityScope.length) throw new FrameRequestError("frame.authority_scope_namespace_ids", "duplicate_namespace", "Authority scope namespaces must be unique.");
  if (!authorityScope.includes(homeNamespaceId)) throw new FrameRequestError("frame.authority_scope_namespace_ids", "home_namespace_required", "Authority scope must include the Frame home namespace.");
  if (!FRAME_STATUSES.has(value.status)) throw new FrameRequestError("frame.status", "frame_status_invalid", "Frame descriptive status is invalid.");
  if (!Array.isArray(value.discovery) || value.discovery.length < 1 || value.discovery.length > MAX_DISCOVERY) throw new FrameRequestError("frame.discovery", "complete_discovery_required", `One to ${MAX_DISCOVERY} selected Discovery items are required.`);
  const discovery = value.discovery.map(normalizeDiscoveryItem);
  if (requireDispositionSets && (value.disposition_boundaries == null || value.case_dispositions == null)) {
    throw new FrameRequestError("frame.disposition_boundaries", "complete_disposition_sets_required", "New canonical Frames require explicit complete disposition arrays, including explicit empty arrays.");
  }
  const dispositionBoundaries = value.disposition_boundaries == null ? [] : (() => {
    if (!Array.isArray(value.disposition_boundaries) || value.disposition_boundaries.length > 64) throw new FrameRequestError("frame.disposition_boundaries", "bounded_array_required", "Disposition boundaries must be a bounded array.");
    return value.disposition_boundaries.map(normalizeDispositionBoundary);
  })();
  const caseDispositions = value.case_dispositions == null ? [] : (() => {
    if (!Array.isArray(value.case_dispositions) || value.case_dispositions.length > 128) throw new FrameRequestError("frame.case_dispositions", "bounded_array_required", "Case dispositions must be a bounded array.");
    return value.case_dispositions.map(normalizeCaseDisposition);
  })();
  if ((value.disposition_boundaries == null) !== (value.case_dispositions == null)) throw new FrameRequestError("frame.disposition_boundaries", "complete_disposition_sets_required", "Disposition boundaries and Case dispositions must be supplied together.");
  if (1 + discovery.length + dispositionBoundaries.length + caseDispositions.length > 256) throw new FrameRequestError("frame", "complete_selection_too_large", "The cohesive Frame selection exceeds the bounded owner revision.");
  const boundaryIds = new Set(); const boundaryOrders = new Set(); const memberships = new Map();
  for (const boundary of dispositionBoundaries) {
    if (boundaryIds.has(boundary.id)) throw new FrameRequestError("frame.disposition_boundaries", "duplicate_boundary_id", "Disposition boundary stable IDs must be unique.");
    if (boundaryOrders.has(boundary.display_order)) throw new FrameRequestError("frame.disposition_boundaries", "duplicate_display_order", "Disposition boundary display orders must be unique.");
    boundaryIds.add(boundary.id); boundaryOrders.add(boundary.display_order);
    for (const dispositionId of boundary.disposition_ids) {
      if (memberships.has(dispositionId)) throw new FrameRequestError("frame.disposition_boundaries", "duplicate_disposition_membership", "Each disposition belongs to exactly one selected boundary.");
      memberships.set(dispositionId, boundary.id);
    }
  }
  const dispositionIds = new Set();
  for (const disposition of caseDispositions) {
    if (dispositionIds.has(disposition.id)) throw new FrameRequestError("frame.case_dispositions", "duplicate_case_disposition_id", "Case disposition stable IDs must be unique.");
    dispositionIds.add(disposition.id);
    if (!boundaryIds.has(disposition.boundary_id) || memberships.get(disposition.id) !== disposition.boundary_id) throw new FrameRequestError("frame.case_dispositions", "disposition_membership_incomplete", "Every selected disposition must be selected exactly once by its declared boundary.");
  }
  if (memberships.size !== caseDispositions.length || [...memberships.keys()].some((id) => !dispositionIds.has(id))) throw new FrameRequestError("frame.disposition_boundaries", "disposition_membership_incomplete", "Boundary inventories and selected Case dispositions must be complete and identical.");
  for (const boundary of dispositionBoundaries) {
    const members = caseDispositions.filter((item) => item.boundary_id === boundary.id);
    if (boundary.closure === "closed" && members.some((item) => item.classification_state === "pending_classification" || item.realization_state === "awaiting_case")) throw new FrameRequestError("frame.disposition_boundaries", "closed_boundary_unsettled", "A closed boundary cannot retain pending classification or awaiting Case realization.");
  }
  if (value.status === "completed" && caseDispositions.some((item) => item.classification_state === "pending_classification" || item.realization_state === "awaiting_case")) throw new FrameRequestError("frame.case_dispositions", "completed_frame_unsettled_disposition", "A completed Frame cannot retain pending classification or awaiting Case realization.");
  const ids = new Set(); const orders = new Set();
  for (const item of discovery) {
    if (ids.has(item.id)) throw new FrameRequestError("frame.discovery", "duplicate_discovery_id", "Discovery stable IDs must be unique in a Frame revision.");
    if (orders.has(item.display_order)) throw new FrameRequestError("frame.discovery", "duplicate_display_order", "Discovery display orders must be unique in a Frame revision.");
    ids.add(item.id); orders.add(item.display_order);
  }
  const result = {
    id: requiredId(value.id, "frame.id", "frame"), home_namespace_id: homeNamespaceId,
    authority_scope_namespace_ids: authorityScope, status: value.status, discovery,
    ...(value.disposition_boundaries == null ? {} : { disposition_boundaries: dispositionBoundaries, case_dispositions: caseDispositions }),
  };
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

function validateContext(_value) {}

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
  return mechanicalDigest({ operation: request.operation, request_version: 1, store_id: request.store_id,
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

function frameIdentityProjectionLinks(frame) {
  const links = [];
  const add = (reference, from = { kind: "frame", id: frame.id }) => {
    if (!reference?.target_kind || !reference?.target_id) return;
    links.push({
      from,
      to: { kind: reference.target_kind, id: reference.target_id },
      predicate: reference.predicate,
      direction: "outgoing",
      ...(reference.observed_revision_id == null ? {} : { observed_revision_id: reference.observed_revision_id }),
      ...(reference.pinned_revision_id == null ? {} : { pinned_revision_id: reference.pinned_revision_id }),
    });
  };
  for (const key of ["case_links", "frame_links", "downstream_links"]) for (const reference of frame[key] ?? []) add(reference);
  for (const item of frame.discovery ?? []) for (const reference of item.dependencies ?? []) add(reference, { kind: "discovery", id: item.id });
  return links;
}

function assembleFrameEnvelope(request, frame, priorSelected = new Map(), replayAllocated = new Set()) {
  const semanticDigest = semanticMutationDigest(request, frame);
  const selectVersion = (familyId, content, role) => {
    const prior = priorSelected.get(familyId);
    if (prior && replayAllocated.has(prior.version_id)) return { version_id: allocate("version", request, semanticDigest, role), changed: true };
    return prior?.content_digest === mechanicalDigest(content) ? { version_id: prior.version_id, changed: false }
      : { version_id: allocate("version", request, semanticDigest, role), changed: true };
  };
  const { discovery, disposition_boundaries: dispositionBoundaries = [], case_dispositions: caseDispositions = [], ...metadata } = frame;
  const metadataContent = { schema: "frame-profile@1", ...metadata };
  const frameSelection = selectVersion(frame.id, metadataContent, "frame-version");
  const frameVersionId = frameSelection.version_id;
  const discoverySelections = discovery.map((item) => {
    const content = { schema: "frame-discovery-item@1", ...item };
    return { discovery_item_id: item.id, content, ...selectVersion(item.id, content, `discovery-version:${item.id}`) };
  });
  const boundarySelections = dispositionBoundaries.map((item) => {
    const content = { schema: "frame-disposition-boundary@1", ...item };
    return { disposition_boundary_id: item.id, content, ...selectVersion(item.id, content, `disposition-boundary-version:${item.id}`) };
  });
  const caseDispositionSelections = caseDispositions.map((item) => {
    const content = { schema: "frame-case-disposition@1", ...item };
    return { case_disposition_id: item.id, content, ...selectVersion(item.id, content, `case-disposition-version:${item.id}`) };
  });
  const discoveryAllocations = discoverySelections.map(({ discovery_item_id, version_id }) => ({ discovery_item_id, version_id }));
  const boundaryAllocations = boundarySelections.map(({ disposition_boundary_id, version_id }) => ({ disposition_boundary_id, version_id }));
  const caseDispositionAllocations = caseDispositionSelections.map(({ case_disposition_id, version_id }) => ({ case_disposition_id, version_id }));
  const allocations = {
    frame_version_id: frameVersionId,
    discovery_item_version_ids: discoveryAllocations,
    disposition_boundary_version_ids: boundaryAllocations,
    case_disposition_version_ids: caseDispositionAllocations,
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
  for (const item of boundarySelections) {
    if (item.changed) versions.push({ family_id: item.disposition_boundary_id, version_id: item.version_id, content: item.content, content_digest: mechanicalDigest(item.content) });
    selections.push({ family_id: item.disposition_boundary_id, version_id: item.version_id });
  }
  for (const item of caseDispositionSelections) {
    if (item.changed) versions.push({ family_id: item.case_disposition_id, version_id: item.version_id, content: item.content, content_digest: mechanicalDigest(item.content) });
    selections.push({ family_id: item.case_disposition_id, version_id: item.version_id });
  }
  const eventPayload = {
    schema: "frame-change@1",
    change: request.expected_revision === 0 ? "created" : "revised",
    frame_id: frame.id,
    changed_discovery_item_ids: discoverySelections.filter((item) => item.changed).map((item) => item.discovery_item_id),
    changed_disposition_boundary_ids: boundarySelections.filter((item) => item.changed).map((item) => item.disposition_boundary_id),
    changed_case_disposition_ids: caseDispositionSelections.filter((item) => item.changed).map((item) => item.case_disposition_id),
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
        schema: "frame-canonical-selection@3",
        semantic_request_digest: semanticDigest,
        frame_family_id: frame.id,
        frame_version_id: frameVersionId,
        discovery_selections: discoveryAllocations,
        disposition_boundary_selections: boundaryAllocations,
        case_disposition_selections: caseDispositionAllocations,
      },
      versions,
      selections,
    },
    current_projection: {
      schema: "frame-current@1",
      id: frame.id,
      home_namespace_id: frame.home_namespace_id,
      authority_scope_namespace_ids: frame.authority_scope_namespace_ids,
      linked_case_ids: frame.case_links?.filter((link) => link.target_kind === "case").map((link) => link.target_id) ?? [],
      identity_discoverable: frame.status === "active",
      identity_links: frameIdentityProjectionLinks(frame),
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
    const code = operation === "discovery.read" ? "frame.discovery_not_found_or_not_visible"
      : operation === "disposition.read" ? "frame.disposition_not_found_or_not_visible"
      : operation === "read_revision" ? "frame.revision_not_found_or_not_visible"
      : "frame.not_found_or_not_visible";
    return failure(code, operation === "read_revision"
      ? "The selected Frame revision is unknown or not visible under the exact view."
      : operation === "discovery.read"
        ? "The Discovery item or selected version is unknown or not visible."
        : operation === "disposition.read"
          ? "The disposition family or selected version is unknown or not visible."
          : "The Frame is unknown or not visible under the exact view.", {
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
    || (revision.representation?.id === PRE_DISPOSITION_FRAME_REPRESENTATION.id && revision.representation?.version === PRE_DISPOSITION_FRAME_REPRESENTATION.version)
    || (revision.representation?.id === LEGACY_FRAME_REPRESENTATION.id && revision.representation?.version === LEGACY_FRAME_REPRESENTATION.version);
  if (!representationCompatible) throw new FrameRequestError("stored.representation", "representation_incompatible", "Stored Frame representation is incompatible.");
  const normalized = revision.normalized;
  if (!new Set(["frame-minimal-selection@1", "frame-canonical-selection@2", "frame-canonical-selection@3"]).has(normalized?.schema) || !Array.isArray(normalized.discovery_selections)) {
    throw new FrameRequestError("stored.selection", "selection_incomplete", "Stored Frame selection is incomplete.");
  }
  const dispositionBoundarySelections = normalized.disposition_boundary_selections ?? [];
  const caseDispositionSelections = normalized.case_disposition_selections ?? [];
  if (!Array.isArray(dispositionBoundarySelections) || !Array.isArray(caseDispositionSelections)
    || (normalized.schema === "frame-canonical-selection@3" && (!Object.hasOwn(normalized, "disposition_boundary_selections") || !Object.hasOwn(normalized, "case_disposition_selections")))) {
    throw new FrameRequestError("stored.selection", "disposition_selection_incomplete", "Stored disposition selections are incomplete.");
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
  const dispositionBoundaries = dispositionBoundarySelections.map((selection) => {
    const version = selected.get(selection.disposition_boundary_id);
    if (!version || version.version_id !== selection.version_id
      || version.content_digest !== mechanicalDigest(version.content)
      || version.content?.schema !== "frame-disposition-boundary@1") {
      throw new FrameRequestError("stored.disposition_boundary_version", "version_inconsistent", "Stored disposition boundary version is inconsistent.");
    }
    const { schema: _schema, ...item } = version.content;
    return { ...item, version_id: frameTypedId("disposition-boundary-version", version.version_id) };
  });
  const caseDispositions = caseDispositionSelections.map((selection) => {
    const version = selected.get(selection.case_disposition_id);
    if (!version || version.version_id !== selection.version_id
      || version.content_digest !== mechanicalDigest(version.content)
      || version.content?.schema !== "frame-case-disposition@1") {
      throw new FrameRequestError("stored.case_disposition_version", "version_inconsistent", "Stored Case disposition version is inconsistent.");
    }
    const { schema: _schema, ...item } = version.content;
    return { ...item, version_id: frameTypedId("case-disposition-version", version.version_id) };
  });
  if (selected.size !== discovery.length + dispositionBoundaries.length + caseDispositions.length + 1) {
    throw new FrameRequestError("stored.selection", "unexpected_family", "Stored Frame contains an unexpected selected family.");
  }
  const { schema: _schema, ...metadata } = frameVersion.content;
  if (!FRAME_STATUSES.has(metadata.status)) throw new FrameRequestError("stored.frame_version", "status_invalid", "Stored Frame status is invalid.");
  const withoutVersionId = ({ version_id: _versionId, ...item }) => item;
  const dispositionStatePresent = normalized.schema === "frame-canonical-selection@3"
    || dispositionBoundaries.length > 0 || caseDispositions.length > 0;
  const storedFrame = {
    ...metadata,
    discovery: discovery.map(withoutVersionId),
    ...(dispositionStatePresent ? {
      disposition_boundaries: dispositionBoundaries.map(withoutVersionId),
      case_dispositions: caseDispositions.map(withoutVersionId),
    } : {}),
  };
  // Immutable rows can still be externally damaged after trigger removal or an
  // unsafe restore. Reapply the complete owner representation invariants while
  // hydrating so coherent digests do not make impossible Frame policy visible.
  const normalizedStoredFrame = normalizeFrame(storedFrame);
  if (normalizedStoredFrame.id !== mechanical.owner.id) {
    throw new FrameRequestError("stored.frame_version", "owner_identity_mismatch", "Stored Frame identity does not match its mechanical owner.");
  }
  return {
    status: "found",
    frame: {
      ...normalizedStoredFrame,
      discovery: normalizedStoredFrame.discovery.map((item, index) => ({ ...item, version_id: discovery[index].version_id })),
      ...(dispositionStatePresent ? {
        disposition_boundaries: normalizedStoredFrame.disposition_boundaries.map((item, index) => ({ ...item, version_id: dispositionBoundaries[index].version_id })),
        case_dispositions: normalizedStoredFrame.case_dispositions.map((item, index) => ({ ...item, version_id: caseDispositions[index].version_id })),
      } : {}),
    },
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
        disposition_boundaries: dispositionBoundarySelections.map((selection) => ({
          disposition_boundary_id: selection.disposition_boundary_id,
          version_id: frameTypedId("disposition-boundary-version", selection.version_id),
        })),
        case_dispositions: caseDispositionSelections.map((selection) => ({
          case_disposition_id: selection.case_disposition_id,
          version_id: frameTypedId("case-disposition-version", selection.version_id),
        })),
      },
    },
  };
}

async function linkedCaseIdsForListCandidate(request, item) {
  // frame-current@1 predates this optional acceleration field. Hydrate the
  // candidate revision selected by the fenced page, rather than a potentially
  // newer current revision, so filtering and continuation remain snapshot-true.
  const mechanical = await invokeSubstrateOperation({
    operation: "read_owner_revision",
    configuration: request.configuration,
    store_id: request.store_id,
    owner: { id: item.owner.id, kind: "frame" },
    revision_id: item.revision.id,
  });
  if (!mechanical?.ok) return { failure: typedFailure("list", mechanical) };
  const frame = hydrateFrame(mechanical.result).frame;
  return { ids: frame.case_links?.filter((link) => link.target_kind === "case").map((link) => link.target_id) ?? [] };
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

function projectAuthorityScope(record, visibleNamespaceIds) {
  const complete = record.authority_scope_namespace_ids ?? [];
  const hiddenIds = new Set(complete.filter((namespaceId) => !visibleNamespaceIds.has(namespaceId)));
  const redact = (value, key = "") => {
    if (typeof value === "string") return hiddenIds.has(value) ? "[hidden_namespace]" : value;
    if (Array.isArray(value)) {
      if (key === "authority_scope_namespace_ids" || key === "scope_namespace_ids") return value.filter((item) => !hiddenIds.has(item)).map((item) => redact(item));
      return value.map((item) => redact(item));
    }
    if (!object(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey)]));
  };
  const projected = redact(record);
  return { ...projected, ...(hiddenIds.size === 0 ? {} : { hidden_authority_scope_count: hiddenIds.size }) };
}

async function projectFrameForView(_request, record) { return { frame: record }; }

async function visibleNamespaceSet(request) {
  return { ids: new Set() };
}

// Case references may name either the Case owner or one of its selected semantic
// families. Resolve them through the same cohesive, bounded Case selection scan
// used by the Case facade rather than mistaking every target for an owner ID.
async function visibleReferenceTarget(request, link) {
  const direct = await invokeSubstrateOperation({ operation: "read_owner_current", configuration: request.configuration, store_id: request.store_id, owner: { id: link.target_id, kind: link.target_kind } });
  if (direct?.ok) return direct.result;
  if (!["case", "knowledge", "source", "evidence"].includes(link.target_kind)) return null;
  const corpus = await invokeSubstrateOperation({ operation: "read_owner_current_corpus", configuration: request.configuration, store_id: request.store_id, owner_kind: "case" });
  if (!corpus?.ok) return null;
  return corpus.result.items.find((item) => item.revision.selected_versions.some((version) => version.family_id === link.target_id)) ?? null;
}

function completionEvidence(frame) {
  const activeDiscovery = frame.discovery.filter((item) => item.lifecycle === "active").length;
  const boundaries = frame.disposition_boundaries ?? [];
  const dispositions = frame.case_dispositions ?? [];
  const pendingIds = dispositions.filter((item) => item.classification_state === "pending_classification").map((item) => item.id);
  const awaitingIds = dispositions.filter((item) => item.realization_state === "awaiting_case").map((item) => item.id);
  const settledIds = dispositions.filter((item) => item.realization_state === "settled").map((item) => item.id);
  const completionBlocks = [
    ...(pendingIds.length ? [{ kind: "pending_classification", case_disposition_ids: pendingIds }] : []),
    ...(awaitingIds.length ? [{ kind: "awaiting_case", case_disposition_ids: awaitingIds }] : []),
  ];
  const caseRealizationStatus = awaitingIds.length
    ? (settledIds.length ? "partially_settled" : "awaiting_case")
    : (settledIds.length ? "settled" : "not_applicable");
  return {
    frame: {
      descriptive_status: frame.status,
      closed: CLOSED_STATUSES.has(frame.status),
      active_discovery_items: activeDiscovery,
      open_disposition_boundaries: boundaries.filter((item) => item.closure === "open").length,
      pending_case_dispositions: pendingIds.length,
      awaiting_case_realizations: awaitingIds.length,
      completion_blocked: completionBlocks.length > 0,
    },
    case_reconciliation: {
      status: caseRealizationStatus,
      linked_cases: frame.case_links?.filter((link) => link.target_kind === "case").length ?? 0,
      awaiting_case_realizations: awaitingIds.length,
      settled_case_realizations: settledIds.length,
    },
    cross_owner_completion: {
      state: completionBlocks.length ? "partial" : "settled",
      independent_owner_transactions: true,
    },
    completion_blocks: completionBlocks,
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

async function validateCaseRealizationEvidence(request, frame) {
  for (const [index, disposition] of (frame.case_dispositions ?? []).entries()) {
    if (disposition.realization_state !== "settled") continue;
    const revisionIds = [disposition.observed_case_revision_id, disposition.pinned_case_revision_id].filter(Boolean);
    let owner = null;
    for (const revisionId of revisionIds) {
      const mechanical = await invokeSubstrateOperation({
        operation: "read_owner_revision", configuration: request.configuration, store_id: request.store_id,
        owner: { id: disposition.case_id, kind: "case" },
        revision_id: `owner-revision:${revisionId.slice("case-revision:".length)}`,
      });
      if (!mechanical?.ok || mechanical.result.owner.id !== disposition.case_id) {
        throw new FrameRequestError(`frame.case_dispositions[${index}]`, "case_realization_evidence_not_visible", "Settled Case realization evidence is not visible or committed under the exact view.");
      }
      owner = mechanical.result.owner;
    }
    const receipt = await invokeSubstrateOperation({
      operation: "get_owner_operation_receipt", configuration: request.configuration, store_id: request.store_id,
      operation_id: disposition.case_operation_id,
      owner: { id: disposition.case_id, kind: "case", home_namespace_id: owner.home_namespace_id },
    });
    const committedId = receipt?.result?.committed_revision_state?.id;
    if (!receipt?.ok || receipt.result.status !== "settled" || receipt.result.receipt?.outcome !== "committed"
      || !revisionIds.some((revisionId) => committedId === `owner-revision:${revisionId.slice("case-revision:".length)}`)) {
      throw new FrameRequestError(`frame.case_dispositions[${index}]`, "case_realization_evidence_not_visible", "Settled Case realization evidence is not visible or committed under the exact view.");
    }
  }
}

async function mutateFrame(request, create) {
  validateMutation(request, create);
  const frame = normalizeFrame(request.frame, { requireDispositionSets: create });
  if (!create && request.frame_id !== frame.id) throw new FrameRequestError("frame.id", "frame_identity_mismatch", "frame.id must match frame_id.");
  let priorSelected = new Map();
  let replayAllocated = new Set();
  if (create) {
    const illegalReopen = frame.discovery.find((item) => item.reopened_from_version != null);
    if (illegalReopen) throw new FrameRequestError("frame.discovery", "reopen_requires_prior_settlement", "A newly created Discovery family cannot be reopened.");
  } else {
    const priorReceipt = await invokeSubstrateOperation({ operation: "get_owner_operation_receipt", configuration: request.configuration, store_id: request.store_id, operation_id: request.operation_id, owner: { id: frame.id, kind: "frame", home_namespace_id: frame.home_namespace_id } });
    if (priorReceipt?.ok && priorReceipt.result.status === "settled") {
      priorSelected = new Map(priorReceipt.result.recovery_selection.map((version) => [version.family_id, version]));
      replayAllocated = new Set(priorReceipt.result.receipt.result?.allocations?.version_ids ?? []);
    } else {
      const current = await invokeSubstrateOperation({ operation: "read_owner_current", configuration: request.configuration, store_id: request.store_id, owner: { id: frame.id, kind: "frame" } });
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
  if (!create) {
    const priorBoundaryIds = [...priorSelected.values()]
      .filter((version) => version.content?.schema === "frame-disposition-boundary@1")
      .map((version) => version.family_id);
    const priorDispositionIds = [...priorSelected.values()]
      .filter((version) => version.content?.schema === "frame-case-disposition@1")
      .map((version) => version.family_id);
    if (frame.disposition_boundaries == null && (priorBoundaryIds.length > 0 || priorDispositionIds.length > 0)) {
      throw new FrameRequestError("frame.disposition_boundaries", "complete_disposition_sets_required", "A Frame with declared disposition state must explicitly submit both complete disposition sets.");
    }
    const submittedBoundaryIds = new Set(frame.disposition_boundaries?.map((boundary) => boundary.id));
    if (priorBoundaryIds.some((id) => !submittedBoundaryIds.has(id))) {
      throw new FrameRequestError("frame.disposition_boundaries", "selected_boundary_family_omitted", "Every previously selected disposition boundary family must remain explicitly selected.");
    }
    const submittedDispositionIds = new Set(frame.case_dispositions?.map((disposition) => disposition.id));
    if (priorDispositionIds.some((id) => !submittedDispositionIds.has(id))) {
      throw new FrameRequestError("frame.case_dispositions", "selected_disposition_family_omitted", "Every previously selected material-result disposition family must remain explicitly selected.");
    }
  }
  // Scope is a semantic claim, validated against the preceding complete revision.
  let priorScope = [];
  if (!create) {
    const current = await invokeSubstrateOperation({ operation: "read_owner_current", configuration: request.configuration, store_id: request.store_id, owner: { id: frame.id, kind: "frame" } });
    if (!current?.ok) return typedFailure("commit_revision", current);
    priorScope = hydrateFrame(current.result).frame.authority_scope_namespace_ids;
  }
  const priorSet = new Set(priorScope);
  const added = frame.authority_scope_namespace_ids.filter((namespaceId) => !priorSet.has(namespaceId));
  const removed = priorScope.filter((namespaceId) => !frame.authority_scope_namespace_ids.includes(namespaceId));
  if (added.length && (request.provenance?.authority_basis == null || request.provenance.authority_basis.trim() === "")) throw new FrameRequestError("provenance.authority_basis", "scope_addition_authority_basis_required", "Authority-scope additions require an explicit authority-basis claim.");
  if (removed.length && frame.discovery.some((item) => item.lifecycle === "active" && item.category !== "deferred" && item.scope_namespace_ids?.some((namespaceId) => removed.includes(namespaceId)))) {
    throw new FrameRequestError("frame.discovery", "removed_scope_has_active_discovery", "Active Discovery claiming removed scope must be settled, deferred, or revised in the same complete revision.");
  }
  const frameScope = new Set(frame.authority_scope_namespace_ids);
  if (frame.discovery.some((item) => item.scope_namespace_ids?.some((namespaceId) => !frameScope.has(namespaceId)))) throw new FrameRequestError("frame.discovery", "discovery_scope_outside_frame", "Discovery scope claims must remain within Frame authority scope.");
  const links = [...(frame.case_links ?? []), ...(frame.frame_links ?? []), ...(frame.downstream_links ?? []), ...frame.discovery.flatMap((item) => item.dependencies)];
  await validateCaseRealizationEvidence(request, frame);
  const { envelope, allocations } = assembleFrameEnvelope(request, frame, priorSelected, replayAllocated);
  const mechanical = await invokeSubstrateOperation({ operation: "commit_owner_revision", configuration: request.configuration, envelope });
  if (!mechanical?.ok) return typedFailure(create ? "create" : "commit_revision", mechanical);
  const versions = new Map(allocations.discovery_item_version_ids.map((item) => [item.discovery_item_id, frameTypedId("discovery-item-version", item.version_id)]));
  const boundaryVersions = new Map(allocations.disposition_boundary_version_ids.map((item) => [item.disposition_boundary_id, frameTypedId("disposition-boundary-version", item.version_id)]));
  const caseDispositionVersions = new Map(allocations.case_disposition_version_ids.map((item) => [item.case_disposition_id, frameTypedId("case-disposition-version", item.version_id)]));
  const operation = create ? "frame.create" : "frame.commit_revision";
  return success(operation, {
    status: "settled", frame: {
      ...frame,
      discovery: frame.discovery.map((item) => ({ ...item, version_id: versions.get(item.id) })),
      ...(frame.disposition_boundaries == null ? {} : {
        disposition_boundaries: frame.disposition_boundaries.map((item) => ({ ...item, version_id: boundaryVersions.get(item.id) })),
        case_dispositions: frame.case_dispositions.map((item) => ({ ...item, version_id: caseDispositionVersions.get(item.id) })),
      }),
    },
    revision: { id: frameTypedId("frame-revision", allocations.revision_id), number: request.expected_revision + 1,
      committed_at: mechanical.result.receipt.settled_at,
      version_ids: {
        frame: frameTypedId("frame-version", allocations.frame_version_id),
        discovery_items: allocations.discovery_item_version_ids.map((item) => ({ discovery_item_id: item.discovery_item_id, version_id: frameTypedId("discovery-item-version", item.version_id) })),
        disposition_boundaries: allocations.disposition_boundary_version_ids.map((item) => ({ disposition_boundary_id: item.disposition_boundary_id, version_id: frameTypedId("disposition-boundary-version", item.version_id) })),
        case_dispositions: allocations.case_disposition_version_ids.map((item) => ({ case_disposition_id: item.case_disposition_id, version_id: frameTypedId("case-disposition-version", item.version_id) })),
      } },
    event_id: allocations.event_id, receipt: frameMutationReceipt(mechanical.result.receipt, mechanical.result, request, frame),
    completion_evidence: completionEvidence(frame),
    idempotent_replay: mechanical.result.idempotent_replay,
  });
}

function frameIncludes(request) {
  if (request.include == null) return { discovery: "active_only", case_dispositions: "all_selected" };
  if (!object(request.include) || Object.keys(request.include).length < 1
    || Object.keys(request.include).some((key) => !["discovery", "case_dispositions"].includes(key))) {
    throw new FrameRequestError("include", "frame_include_invalid", "include accepts only Discovery and Case-disposition scopes.");
  }
  const discovery = request.include.discovery ?? "active_only";
  const caseDispositions = request.include.case_dispositions ?? "all_selected";
  if (!["active_only", "all_selected"].includes(discovery)) {
    throw new FrameRequestError("include.discovery", "discovery_include_invalid", "include.discovery must be active_only or all_selected.");
  }
  if (!["current", "all_selected"].includes(caseDispositions)) {
    throw new FrameRequestError("include.case_dispositions", "case_disposition_include_invalid", "include.case_dispositions must be current or all_selected.");
  }
  return { discovery, case_dispositions: caseDispositions };
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
  const include = frameIncludes(request);
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
  if (!mechanical?.ok) return typedFailure(historical ? "read_revision" : "read", mechanical);
  try {
    const hydrated = hydrateFrame(mechanical.result);
    const completeFrame = hydrated.frame;
    const completion = completionEvidence(completeFrame);
    if (include.discovery === "active_only") hydrated.frame.discovery = hydrated.frame.discovery.filter((item) => item.lifecycle === "active");
    if (include.case_dispositions === "current" && hydrated.frame.disposition_boundaries != null) {
      const currentBoundaryIds = new Set(hydrated.frame.disposition_boundaries.filter((item) => item.closure === "open").map((item) => item.id));
      hydrated.frame.disposition_boundaries = hydrated.frame.disposition_boundaries.filter((item) => currentBoundaryIds.has(item.id));
      hydrated.frame.case_dispositions = hydrated.frame.case_dispositions.filter((item) => currentBoundaryIds.has(item.boundary_id));
    }
    const projection = await projectFrameForView(request, hydrated.frame);
    if (projection.failure) return projection.failure;
    return success("frame.read", {
      ...hydrated,
      frame: projection.frame,
      applied_discovery_scope: include.discovery,
      applied_case_disposition_scope: include.case_dispositions,
      completion_evidence: completion,
    });
  } catch (error) {
    return failure("frame.stored_representation_incompatible", "The stored Frame cannot be hydrated through Frame representation version 1.", {
      failureClass: "frame.stored_representation_incompatible",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      evidence: { violations: [{ path: error.path ?? "stored", rule: error.rule ?? "incompatible" }] },
    });
  }
}

const EXPORT_AUDIENCE_RANK = Object.freeze({ private: 0, internal: 1, restricted: 2, portable: 3, public: 4 });
const FRAME_LOCATOR_AUDIENCE_RANK = Object.freeze({ private: 0, project: 1, public: 4 });
function exportCodepointCompare(left, right) {
  const a = Array.from(String(left ?? ""), (value) => value.codePointAt(0));
  const b = Array.from(String(right ?? ""), (value) => value.codePointAt(0));
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return a.length - b.length;
}

function exportAudience(value) {
  if (!Object.hasOwn(EXPORT_AUDIENCE_RANK, value)) {
    throw new FrameRequestError("audience", "audience_invalid", "A supported export audience is required.");
  }
  return value;
}

function frameLocatorSafe(locator, audience) {
  return locatorSafeForAudience(locator, audience,
    (locatorAudience, targetAudience) => FRAME_LOCATOR_AUDIENCE_RANK[locatorAudience] >= EXPORT_AUDIENCE_RANK[targetAudience]);
}

function unsafeFrameLocatorReason(locator, audience) {
  if (["portable", "public"].includes(audience) && !portablePublicLocatorAssessment(locator.uri).safe) {
    return locator.uri.startsWith("file:") ? "machine_local_locator_prohibited" : "unsafe_public_locator_prohibited";
  }
  return "audience_incompatible";
}

function frameStableIdentities(frame, revision) {
  const identities = [{ kind: "frame", stable_id: frame.id, version_id: revision.version_ids.frame }];
  for (const item of revision.version_ids.discovery_items) {
    identities.push({ kind: "discovery", stable_id: item.discovery_item_id, version_id: item.version_id });
  }
  for (const item of revision.version_ids.disposition_boundaries ?? []) {
    identities.push({ kind: "disposition_boundary", stable_id: item.disposition_boundary_id, version_id: item.version_id });
  }
  for (const item of revision.version_ids.case_dispositions ?? []) {
    identities.push({ kind: "case_disposition", stable_id: item.case_disposition_id, version_id: item.version_id });
  }
  return identities.sort((left, right) => exportCodepointCompare(left.stable_id, right.stable_id));
}

function projectFrameExport(frame, audience) {
  const projected = structuredClone(frame);
  const redactions = [];
  const locators = [];
  const evidenceLocators = [];
  const redact = (kind, stableId, path, reason, consequential) => {
    redactions.push({ kind, stable_id: stableId, path, reason, consequential });
  };
  const retainLocator = (locator, descriptor, consequential) => {
    if (!frameLocatorSafe(locator, audience)) {
      redact(descriptor.kind, descriptor.stable_id, descriptor.path,
        unsafeFrameLocatorReason(locator, audience), consequential);
      return false;
    }
    const safe = { ...descriptor, ...locator };
    delete safe.kind;
    delete safe.stable_id;
    delete safe.path;
    locators.push(safe);
    if (descriptor.locator_role === "disposition_evidence") evidenceLocators.push(safe);
    return true;
  };

  projected.artifact_links = (projected.artifact_links ?? []).filter((artifact, index) => retainLocator(
    artifact.locator,
    {
      kind: "artifact_locator",
      stable_id: artifact.artifact_id,
      path: `artifact_links/${index}/locator`,
      locator_role: "artifact",
      artifact_id: artifact.artifact_id,
    },
    false,
  ));

  for (const [familyName, familyKind] of [["disposition_boundaries", "disposition_boundary"], ["case_dispositions", "case_disposition"]]) {
    for (const [index, item] of (projected[familyName] ?? []).entries()) {
      item.evidence_locators = (item.evidence_locators ?? []).filter((locator, locatorIndex) => retainLocator(
        locator,
        {
          kind: "evidence_locator",
          stable_id: item.id,
          path: `${familyName}/${index}/evidence_locators/${locatorIndex}`,
          locator_role: "disposition_evidence",
          owner_kind: familyKind,
          owner_id: item.id,
        },
        true,
      ));
    }
  }

  if (projected.hidden_authority_scope_count) {
    redact("authority_scope", projected.id, "authority_scope_namespace_ids", "not_visible_under_exact_policy", false);
  }
  if (projected.hidden_reference_count) {
    redact("reference", projected.id, "references", "not_visible_under_exact_policy", true);
  }
  locators.sort((left, right) => exportCodepointCompare(left.locator_role, right.locator_role)
    || exportCodepointCompare(left.owner_id ?? left.artifact_id, right.owner_id ?? right.artifact_id)
    || exportCodepointCompare(left.uri, right.uri));
  evidenceLocators.sort((left, right) => exportCodepointCompare(left.owner_id, right.owner_id) || exportCodepointCompare(left.uri, right.uri));
  const status = redactions.some((item) => item.consequential)
    ? "blocked"
    : redactions.length ? "partial_nonconsequential" : "ready";
  return { projected, redactions, locators, evidenceLocators, status };
}

async function produceFrameFragment(request) {
  exactKeys(request, EXPORT_REQUEST_FIELDS, "request");
  if (request.request_version !== 1) throw new FrameRequestError("request_version", "version_incompatible", "request_version must be 1.");
  requiredId(request.frame_id, "frame_id", "frame");
  requiredId(request.store_id, "store_id", "store");
  validateContext(request.context);
  exportAudience(request.audience);
  if (request.revision_id != null && request.revision_number != null) {
    throw new FrameRequestError("revision_id", "revision_selector_ambiguous", "Select a revision by ID or number, not both.");
  }
  if (request.revision_id != null) requiredId(request.revision_id, "revision_id", "frame-revision");
  if (request.revision_number != null && (!Number.isInteger(request.revision_number) || request.revision_number < 1)) {
    throw new FrameRequestError("revision_number", "positive_revision_required", "revision_number must be positive.");
  }
  const readRequest = {
    protocol: request.protocol,
    operation: "frame.read",
    request_version: 1,
    store_id: request.store_id,
    context: request.context,
    frame_id: request.frame_id,
    include: { discovery: "all_selected", case_dispositions: "all_selected" },
    configuration: request.configuration,
  };
  const selected = await readFrame({
    ...readRequest,
    ...(request.revision_id == null ? {} : { revision_id: request.revision_id }),
    ...(request.revision_number == null ? {} : { revision_number: request.revision_number }),
  });
  if (!selected.ok) return selected;
  const current = await readFrame(readRequest);
  if (!current.ok) return current;
  const projection = projectFrameExport(selected.result.frame, request.audience);
  const selectedRevision = selected.result.revision;
  const currentRevision = current.result.revision;
  const driftStatus = selectedRevision.id === currentRevision.id ? "current" : "historical";
  const identities = frameStableIdentities(projection.projected, selectedRevision);
  const core = {
    fragment_schema: "frame-owner-export-fragment@1",
    renderer: { id: "frame-owner-fragment", version: 1 },
    owner: { kind: "frame", id: request.frame_id },
    owner_status: projection.projected.status,
    selected_revision: selectedRevision,
    observed_current_revision: currentRevision,
    drift: {
      status: driftStatus,
      selected_revision_id: selectedRevision.id,
      observed_current_revision_id: currentRevision.id,
    },
    applied_policy: { ...selected.result.applied_view, audience: request.audience },
    stable_identities: identities,
    stable_ids: identities.map((item) => item.stable_id),
    locators: projection.locators,
    redactions: projection.redactions,
    omissions: projection.redactions.map(({ kind, stable_id, path, reason, consequential }) => ({ kind, stable_id, path, reason, consequential })),
    trace_gaps: projection.redactions.map(({ stable_id, path, reason }) => ({ stable_id, path, reason })),
    evidence: { locators: projection.evidenceLocators },
    status: projection.status,
    completion_evidence: selected.result.completion_evidence,
    frame: projection.projected,
    authority: { publication: "not_granted", canonical_mutation: "not_granted" },
    mutation_performed: false,
    publication_performed: false,
  };
  const fragment = { ...core, digest: mechanicalDigest(core) };
  return success("frame.export.fragment", { status: projection.status, fragment });
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
  const namespaceIds = request.namespace_ids == null ? [] : stringArray(request.namespace_ids, "namespace_ids", { min: 1, max: 64 });
  namespaceIds.forEach((id, index) => requiredId(id, `namespace_ids[${index}]`, "namespace"));
  if (new Set(namespaceIds).size !== namespaceIds.length) throw new FrameRequestError("namespace_ids", "namespace_filter_duplicate", "namespace_ids must be unique.");
  const statuses = request.statuses == null ? ["active"] : stringArray(request.statuses, "statuses", { min: 1, max: 4 });
  if (statuses.some((status) => !FRAME_STATUSES.has(status)) || new Set(statuses).size !== statuses.length) throw new FrameRequestError("statuses", "frame_status_filter_invalid", "statuses must contain unique descriptive Frame statuses.");
  const limit = pageLimit(request.limit);
  const selectors = { statuses: [...statuses].sort(), namespace_ids: [...namespaceIds].sort() };
  const binding = mechanicalDigest({ operation: "frame.list", store_id: request.store_id, selectors, limit });
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
      for (const raw of mechanical.result.items) {
        const projection = raw.current_projection;
        const selected = !namespaceIds.length || namespaceIds.includes(projection.home_namespace_id);
        const item = selected ? hydrateListItem(raw, statusSet) : null;
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
      applied_namespace_filter: namespaceIds.length ? namespaceIds : null,
      next_cursor: hasMore && pageItems.length ? encodeCursor(cursorKey, binding, fence, listSortKey(pageItems.at(-1))) : null,
      index_state: "current",
      result_completeness: "complete_within_bounds",
      stable_sort: "updated_desc_id_asc",
      snapshot_query_fence: fence,
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

async function getFrameOperationReceipt(request) {
  exactKeys(request, RECEIPT_REQUEST_FIELDS, "request");
  if (request.request_version !== 1) throw new FrameRequestError("request_version", "version_incompatible", "request_version must be 1.");
  const frameId = requiredId(request.frame_id, "frame_id", "frame");
  requiredId(request.store_id, "store_id", "store");
  requiredString(request.operation_id, "operation_id", 256);
  validateContext(request.context);
  const current = await invokeSubstrateOperation({ operation: "read_owner_current", configuration: request.configuration,
    store_id: request.store_id, context: request.context, owner: { id: frameId, kind: "frame" } });
  if (!current?.ok) {
    // Only the substrate's privacy-preserving visibility failure denotes an
    // unknown/hidden Frame. Configuration, process, asset, and store failures
    // must remain distinguishable as unavailable to make receipt-first retry safe.
    return success("frame.get_operation_receipt", {
      status: current?.failure?.code === "not_visible" ? "not_visible" : "store_unavailable",
    });
  }
  const homeNamespaceId = current.result.owner.home_namespace_id;
  const mechanical = await invokeSubstrateOperation({ operation: "get_owner_operation_receipt", configuration: request.configuration,
    store_id: request.store_id, context: request.context, operation_id: request.operation_id,
    owner: { id: frameId, kind: "frame", home_namespace_id: homeNamespaceId } });
  if (!mechanical?.ok || mechanical.result.status === "store_unavailable") return success("frame.get_operation_receipt", { status: "store_unavailable" });
  if (mechanical.result.status !== "settled") return success("frame.get_operation_receipt", mechanical.result.status === "absent_at_fence"
    ? { status: "absent_at_fence", operation_fence: mechanical.result.operation_fence }
    : { status: "not_visible" });
  const receipt = mechanical.result.receipt;
  if (receipt.operation_kind !== "commit_owner_revision") return success("frame.get_operation_receipt", { status: "not_visible" });
  const originalOperation = receipt.expected_revision === 0 ? "frame.create" : "frame.commit_revision";
  const hydrateState = async (state) => {
    if (state == null) return null;
    const hydrated = hydrateFrame({ owner: current.result.owner, revision: state, applied_view: current.result.applied_view });
    const projection = await projectFrameForView(request, hydrated.frame);
    if (projection.failure) return null;
    return { frame: projection.frame, revision: hydrated.revision };
  };
  const committed = await hydrateState(mechanical.result.committed_revision_state);
  const observed = await hydrateState(mechanical.result.observed_revision_state);
  const expected = await hydrateState(mechanical.result.expected_revision_state);
  const originalResult = receipt.outcome === "committed" && committed ? {
    status: "settled", frame: committed.frame, revision: committed.revision,
    completion_evidence: completionEvidence(committed.frame),
  } : receipt.outcome === "rejected" ? {
    status: "rejected", failure: { code: "frame.revision_conflict" },
    observed_revision: observed?.revision ?? null, expected_revision: expected?.revision ?? null,
  } : null;
  return success("frame.get_operation_receipt", {
    status: "settled",
    receipt: {
      operation_id: receipt.operation_id, operation: originalOperation, frame_id: frameId,
      outcome: receipt.outcome, expected_revision: receipt.expected_revision,
      observed_revision: observed?.revision ?? null, committed_revision: committed?.revision ?? null,
      settled_at: receipt.settled_at, retry_disposition: receipt.retry_disposition,
      operation_fence: receipt.operation_fence, request_digest: receipt.request_digest, result_digest: receipt.result_digest,
    },
    original_result: originalResult,
  });
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
    include: { discovery: "all_selected" },
  });
  if (!frameRead.ok) return frameRead;
  const item = frameRead.result.frame.discovery.find((candidate) => candidate.id === request.discovery_item_id
    && (request.version_id == null || candidate.version_id === request.version_id));
  if (!item) return failure("frame.discovery_not_found_or_not_visible", "The Discovery item or selected version is unknown or not visible.", { failureClass: "frame.read_failure", evidence: {} });
  return success("frame.discovery.read", { status: "found", frame_id: request.frame_id, discovery_item: item, frame_revision: frameRead.result.revision, ...(frameRead.result.frame.hidden_authority_scope_count == null ? {} : { hidden_authority_scope_count: frameRead.result.frame.hidden_authority_scope_count }), ...(frameRead.result.frame.hidden_reference_count == null ? {} : { hidden_reference_count: frameRead.result.frame.hidden_reference_count }), applied_view: frameRead.result.applied_view });
}

async function readDisposition(request) {
  exactKeys(request, DISPOSITION_READ_FIELDS, "request");
  if (request.request_version !== 1) throw new FrameRequestError("request_version", "version_incompatible", "request_version must be 1.");
  requiredId(request.store_id, "store_id", "store");
  requiredId(request.frame_id, "frame_id", "frame");
  validateContext(request.context);
  if (request.revision_id != null && request.revision_number != null) throw new FrameRequestError("revision_id", "revision_selector_ambiguous", "Select a revision by ID or number, not both.");
  if (request.revision_id != null) requiredId(request.revision_id, "revision_id", "frame-revision");
  if (request.revision_number != null && (!Number.isInteger(request.revision_number) || request.revision_number < 1)) throw new FrameRequestError("revision_number", "positive_revision_required", "revision_number must be positive.");
  const familyId = requiredString(request.family_id, "family_id", 128);
  const familyKind = uuidId("disposition-boundary").test(familyId) ? "disposition_boundary"
    : uuidId("case-disposition").test(familyId) ? "case_disposition"
      : null;
  if (familyKind == null) throw new FrameRequestError("family_id", "disposition_family_id_required", "family_id must identify a disposition boundary or Case disposition family.");
  const frameRead = await readFrame({
    protocol: request.protocol,
    operation: "frame.read",
    request_version: request.request_version,
    store_id: request.store_id,
    context: request.context,
    frame_id: request.frame_id,
    ...(request.revision_id == null ? {} : { revision_id: request.revision_id }),
    ...(request.revision_number == null ? {} : { revision_number: request.revision_number }),
    include: { discovery: "all_selected", case_dispositions: "all_selected" },
    configuration: request.configuration,
  });
  if (!frameRead.ok) return frameRead;
  const value = familyKind === "disposition_boundary"
    ? frameRead.result.frame.disposition_boundaries?.find((item) => item.id === familyId)
    : frameRead.result.frame.case_dispositions?.find((item) => item.id === familyId);
  if (!value) return failure("frame.disposition_not_found_or_not_visible", "The disposition family or selected version is unknown or not visible.", {
    failureClass: "frame.read_failure", evidence: {},
  });
  return success("frame.disposition.read", {
    status: "found",
    frame_id: request.frame_id,
    family_kind: familyKind,
    ...(familyKind === "disposition_boundary" ? { disposition_boundary: value } : { case_disposition: value }),
    frame_revision: frameRead.result.revision,
    completion_evidence: frameRead.result.completion_evidence,
    applied_view: frameRead.result.applied_view,
  });
}

async function frameHistory(request) {
  exactKeys(request, HISTORY_REQUEST_FIELDS, "request");
  if (request.request_version !== 1) throw new FrameRequestError("request_version", "version_incompatible", "request_version must be 1.");
  requiredId(request.frame_id, "frame_id", "frame"); requiredId(request.store_id, "store_id", "store"); validateContext(request.context);
  const limit=pageLimit(request.limit);
  const binding=mechanicalDigest({operation:"frame.history",store_id:request.store_id,view:request.context,frame_id:request.frame_id,limit});
  const current=await readFrame({protocol:request.protocol,operation:"frame.read",request_version:1,store_id:request.store_id,context:request.context,frame_id:request.frame_id,include:{discovery:"all_selected"},configuration:request.configuration});
  if(!current.ok)return current;
  const cursorKey=await deriveInternalCursorSigningKey(request.configuration,request.store_id);
  if(!cursorKey)throw new Error("verified store cursor key unavailable");
  const decoded=request.cursor==null?null:decodeCursor(request.cursor,binding,cursorKey);
  const fence=current.result.revision.number;
  if(decoded&&decoded.f!==fence)throw new FrameRequestError("cursor","cursor_fence_expired","The Frame changed; restart history pagination.");
  const start=decoded==null?fence:Number(decoded.k[0])-1;
  if(!Number.isInteger(start)||start<1)throw new FrameRequestError("cursor","cursor_invalid_or_query_mismatch","The history cursor sort key is invalid.");
  const items=[];
  for(let number=start;number>=1&&items.length<limit;number--){const result=await readFrame({protocol:request.protocol,operation:"frame.read",request_version:1,store_id:request.store_id,context:request.context,frame_id:request.frame_id,revision_number:number,include:{discovery:"all_selected"},configuration:request.configuration});if(!result.ok)return result;items.push(result.result);}
  const lastNumber=items.at(-1)?.revision.number??0;
  return success("frame.history",{status:"found",items,index_state:"current",stable_sort:"revision_desc",snapshot_revision_fence:fence,next_cursor:lastNumber>1?encodeCursor(cursorKey,binding,fence,[String(lastNumber),request.frame_id]):null,result_completeness:"complete_within_bounds",applied_view:current.result.applied_view});
}

function decodeSnapshotText(bytes, path) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { throw new FrameRequestError(path, "utf8_required", "Legacy snapshots must be valid UTF-8."); }
}

async function immutableSnapshot(descriptor, path, allowedFields) {
  if (!object(descriptor) || Object.keys(descriptor).some((key) => !allowedFields.has(key))) throw new FrameRequestError(path, "snapshot_descriptor_invalid", "Immutable snapshot descriptors are closed records.");
  const digest = requiredString(descriptor.digest, `${path}.digest`, 80);
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) throw new FrameRequestError(`${path}.digest`, "digest_invalid", "A lowercase sha256 digest is required.");
  if (descriptor.bytes_base64 == null) throw new FrameRequestError(`${path}.bytes_base64`, "immutable_bytes_required", "Callers must supply the immutable bytes; locators alone are not reconciliation evidence.");
  let bytes;
  try {
    const encoded = requiredString(descriptor.bytes_base64, `${path}.bytes_base64`, 2 * 1024 * 1024);
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) throw new Error("invalid base64");
    bytes = Buffer.from(encoded, "base64");
    if (bytes.toString("base64") !== encoded) throw new Error("non-canonical base64");
  } catch { throw new FrameRequestError(`${path}.bytes_base64`, "base64_invalid", "Snapshot bytes must use canonical base64."); }
  if (`sha256:${createHash("sha256").update(bytes).digest("hex")}` !== digest) throw new FrameRequestError(`${path}.digest`, "digest_mismatch", "Snapshot bytes do not match the claimed digest.");
  return { ...(descriptor.filename == null ? {} : { filename: descriptor.filename }), ...(descriptor.locator == null ? {} : { locator: requiredString(descriptor.locator, `${path}.locator`, 4096) }), digest, bytes };
}

function parseLegacyDispositionSection(text) {
  const violations = [], dispositionBoundaries = [], caseDispositions = [];
  let source;
  try { source = JSON.parse(text); }
  catch { return { disposition_boundaries: [], case_dispositions: [], violations: [{ path: "documents.frame.md.case_dispositions", rule: "json_value_invalid" }] }; }
  if (!object(source) || Object.keys(source).some((key) => !["disposition_boundaries", "case_dispositions"].includes(key))
    || !Array.isArray(source.disposition_boundaries) || !Array.isArray(source.case_dispositions)
    || source.disposition_boundaries.length > 64 || source.case_dispositions.length > 128) {
    return { disposition_boundaries: [], case_dispositions: [], violations: [{ path: "documents.frame.md.case_dispositions", rule: "disposition_section_schema_invalid" }] };
  }
  const parseCandidates = (items, kind) => {
    const output = kind === "boundary" ? dispositionBoundaries : caseDispositions;
    const prefix = kind === "boundary" ? "DB" : "CD";
    const versionPrefix = kind === "boundary" ? "disposition-boundary-version" : "case-disposition-version";
    const pathFamily = kind === "boundary" ? "disposition_boundaries" : "case_dispositions";
    for (const [index, wrapper] of items.entries()) {
      const path = `documents.frame.md.case_dispositions.${pathFamily}[${index}]`;
      if (!object(wrapper) || Object.keys(wrapper).some((key) => !["source_label", "record"].includes(key)) || !object(wrapper.record)) {
        violations.push({ path, rule: "disposition_candidate_schema_invalid" });
        continue;
      }
      const expectedLabel = `${prefix}-${String(index + 1).padStart(3, "0")}`;
      if (wrapper.source_label !== expectedLabel) violations.push({ path: `${path}.source_label`, rule: "source_label_invalid" });
      const { version_id: versionId, ...content } = wrapper.record;
      if (typeof versionId !== "string" || !uuidId(versionPrefix).test(versionId)) {
        violations.push({ path: `${path}.record.version_id`, rule: "base_version_id_required" });
      }
      try {
        const normalized = kind === "boundary" ? normalizeDispositionBoundary(content, index) : normalizeCaseDisposition(content, index);
        output.push({ source_index: index, source_label: wrapper.source_label, ...normalized, ...(versionId == null ? {} : { version_id: versionId }) });
      } catch (error) {
        violations.push({ path, rule: error instanceof FrameRequestError ? error.rule : "disposition_candidate_schema_invalid" });
      }
    }
  };
  parseCandidates(source.disposition_boundaries, "boundary");
  parseCandidates(source.case_dispositions, "case_disposition");
  const memberships = new Map(dispositionBoundaries.flatMap((boundary) => boundary.disposition_ids.map((id) => [id, boundary.id])));
  if (caseDispositions.some((item) => memberships.get(item.id) !== item.boundary_id)
    || memberships.size !== caseDispositions.length) {
    violations.push({ path: "documents.frame.md.case_dispositions", rule: "disposition_membership_incomplete" });
  }
  return { disposition_boundaries: dispositionBoundaries, case_dispositions: caseDispositions, violations };
}

export function parseLegacyFrameMarkdown(text) {
  const violations = [];
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!match) return { disposition_state: "absent_in_legacy", disposition_boundaries: [], case_dispositions: [], violations: [{ path: "documents.frame.md", rule: "frontmatter_required" }] };
  const frontmatter = {};
  for (const [index, line] of match[1].split("\n").entries()) {
    const field = /^([a-z_]+): (.+)$/.exec(line);
    if (!field) { violations.push({ path: `documents.frame.md.frontmatter[${index}]`, rule: "frontmatter_line_invalid" }); continue; }
    if (Object.hasOwn(frontmatter, field[1])) { violations.push({ path: `documents.frame.md.frontmatter.${field[1]}`, rule: "duplicate_field" }); continue; }
    try { frontmatter[field[1]] = JSON.parse(field[2]); } catch { violations.push({ path: `documents.frame.md.frontmatter.${field[1]}`, rule: "json_scalar_invalid" }); }
  }
  const allowed = new Set(["type", "schema_version", "id", "home_namespace_id", "authority_scope_namespace_ids", "status", "title"]);
  for (const key of Object.keys(frontmatter)) if (!allowed.has(key)) violations.push({ path: `documents.frame.md.frontmatter.${key}`, rule: "field_unsupported" });
  if (frontmatter.type !== "frame") violations.push({ path: "documents.frame.md.frontmatter.type", rule: "frame_type_required" });
  if (frontmatter.schema_version !== 1) violations.push({ path: "documents.frame.md.frontmatter.schema_version", rule: "schema_version_unsupported" });
  const sectionMarker = "\n## Case Dispositions\n";
  const markerIndex = match[2].indexOf(sectionMarker);
  const dispositionPresent = markerIndex >= 0;
  const frameBody = dispositionPresent ? match[2].slice(0, markerIndex) : match[2];
  const dispositionBody = dispositionPresent ? match[2].slice(markerIndex + sectionMarker.length) : null;
  const bodyPattern = /^(?:## Outcome\n```json\n([^\n]*)\n```\n\n)?(?:## Included Scope\n```json\n([^\n]*)\n```\n\n)?(?:## Excluded Scope\n```json\n([^\n]*)\n```\n\n)?(?:## Limitations\n```json\n([^\n]*)\n```\n\n)?(?:## Completion Condition\n```json\n([^\n]*)\n```\n\n)?## Discovery\nSee the manifest-selected Discovery file\.\n$/;
  const body = bodyPattern.exec(frameBody);
  if (!body) violations.push({ path: "documents.frame.md.body", rule: "renderer_structure_invalid" });
  const parsed = { ...frontmatter };
  if (body) for (const [index, key] of ["outcome", "included_scope", "excluded_scope", "limitations", "completion_condition"].entries()) {
    if (body[index + 1] == null) continue;
    try { parsed[key] = JSON.parse(body[index + 1]); } catch { violations.push({ path: `documents.frame.md.${key}`, rule: "json_value_invalid" }); }
  }
  let disposition = { disposition_boundaries: [], case_dispositions: [], violations: [] };
  if (dispositionPresent) {
    const section = /^```json\n([^\n]*)\n```\n$/.exec(dispositionBody);
    if (!section) violations.push({ path: "documents.frame.md.case_dispositions", rule: "renderer_structure_invalid" });
    else disposition = parseLegacyDispositionSection(section[1]);
    violations.push(...disposition.violations);
  }
  const idFields = [["id", "frame"], ["home_namespace_id", "namespace"]];
  for (const [key, prefix] of idFields) if (typeof parsed[key] !== "string" || !uuidId(prefix).test(parsed[key])) violations.push({ path: `documents.frame.md.frontmatter.${key}`, rule: `${prefix}_id_required` });
  if (!Array.isArray(parsed.authority_scope_namespace_ids) || parsed.authority_scope_namespace_ids.length < 1 || parsed.authority_scope_namespace_ids.length > 64 || parsed.authority_scope_namespace_ids.some((id) => typeof id !== "string" || !uuidId("namespace").test(id)) || new Set(parsed.authority_scope_namespace_ids).size !== parsed.authority_scope_namespace_ids.length) violations.push({ path: "documents.frame.md.frontmatter.authority_scope_namespace_ids", rule: "bounded_unique_namespace_ids_required" });
  if (!FRAME_STATUSES.has(parsed.status)) violations.push({ path: "documents.frame.md.frontmatter.status", rule: "frame_status_invalid" });
  if (parsed.title != null && typeof parsed.title !== "string") violations.push({ path: "documents.frame.md.frontmatter.title", rule: "optional_string_required" });
  for (const key of ["outcome", "limitations", "completion_condition"]) if (parsed[key] != null && typeof parsed[key] !== "string") violations.push({ path: `documents.frame.md.${key}`, rule: "optional_string_required" });
  for (const key of ["included_scope", "excluded_scope"]) if (parsed[key] != null && (!Array.isArray(parsed[key]) || parsed[key].some((item) => typeof item !== "string"))) violations.push({ path: `documents.frame.md.${key}`, rule: "optional_string_array_required" });
  return {
    value: parsed,
    disposition_state: dispositionPresent ? "present" : "absent_in_legacy",
    disposition_boundaries: disposition.disposition_boundaries,
    case_dispositions: disposition.case_dispositions,
    violations,
  };
}

export function parseLegacyDiscoveryMarkdown(text) {
  const violations = [], items = [];
  const categoryByHeading = new Map(Object.entries(L01_CATEGORY_HEADING).map(([key, heading]) => [heading, key]));
  const lines = text.split("\n"); let index = 0, category, lastCategoryIndex = -1; const seenLabels = new Set();
  // Renderer output always ends with exactly one empty line after the final
  // item and never begins with or inserts an otherwise unconsumed blank.
  if (lines[0] === "" || lines.at(-1) !== "" || lines.at(-2) !== "") violations.push({ path: "documents.discovery", rule: "renderer_structure_invalid" });
  while (index < lines.length - 2) {
    if (lines[index] === "") { violations.push({ path: `documents.discovery.line[${index + 1}]`, rule: "renderer_structure_invalid" }); break; }
    const group = /^## (.+)$/.exec(lines[index]);
    if (group) {
      category = categoryByHeading.get(group[1]);
      const categoryIndex = Object.keys(L01_CATEGORY_HEADING).indexOf(category);
      if (!category) violations.push({ path: `documents.discovery.line[${index + 1}]`, rule: "category_heading_unsupported" });
      else if (categoryIndex <= lastCategoryIndex) violations.push({ path: `documents.discovery.line[${index + 1}]`, rule: "category_order_or_duplicate_invalid" });
      else lastCategoryIndex = categoryIndex;
      if (lines[index + 1] !== "") violations.push({ path: `documents.discovery.line[${index + 2}]`, rule: "renderer_structure_invalid" });
      index += 2; continue;
    }
    const heading = /^### (AT-\d{3}): (.+)$/.exec(lines[index]);
    if (!heading || !category) { violations.push({ path: `documents.discovery.line[${index + 1}]`, rule: "renderer_structure_invalid" }); break; }
    let title; try { title = JSON.parse(heading[2]); if (typeof title !== "string") throw new Error(); } catch { violations.push({ path: `documents.discovery.line[${index + 1}]`, rule: "title_json_string_required" }); }
    if (heading[1] !== l01DiscoveryLabel(items.length) || seenLabels.has(heading[1])) violations.push({ path: `documents.discovery.${heading[1]}`, rule: "display_label_sequence_invalid" });
    seenLabels.add(heading[1]);
    const authority = /^- Human authority: (required|not_required|unclear)$/.exec(lines[index + 1] ?? "");
    if (!authority || lines[index + 2] !== "" || lines[index + 3] !== "```json" || lines[index + 5] !== "```") { violations.push({ path: `documents.discovery.${heading[1]}`, rule: "renderer_structure_invalid" }); break; }
    let body; try { body = JSON.parse(lines[index + 4]); if (typeof body !== "string") throw new Error(); } catch { violations.push({ path: `documents.discovery.${heading[1]}.body`, rule: "json_string_required" }); }
    items.push({ source_index: items.length, display_label: heading[1], title, body, human_authority: authority?.[1], category });
    index += 6;
    if (lines[index] !== "") { violations.push({ path: `documents.discovery.line[${index + 1}]`, rule: "renderer_structure_invalid" }); break; }
    index++;
  }
  if (index !== lines.length - 1) violations.push({ path: "documents.discovery", rule: "renderer_structure_invalid" });
  if (!items.length) violations.push({ path: "documents.discovery", rule: "discovery_items_required" });
  return { items, violations };
}

function structuralDiff(baseFrame, parsedFrame, parsedDiscovery, discoveryMatches, parsedBoundaries, boundaryMatches, parsedCaseDispositions, caseDispositionMatches) {
  const changed = [];
  for (const key of ["id", "home_namespace_id", "authority_scope_namespace_ids", "status", "title", "outcome", "included_scope", "excluded_scope", "limitations", "completion_condition"])
    if (JSON.stringify(baseFrame[key] ?? null) !== JSON.stringify(parsedFrame[key] ?? null)) changed.push({ path: `frame.${key}`, before: baseFrame[key] ?? null, after: parsedFrame[key] ?? null });
  const compareExact = (baseItems, parsedItems, matches, idKey, pathPrefix, fields) => {
    const matched = new Set();
    for (const match of matches.filter((item) => item.match === "exact")) {
      const id = match[idKey];
      matched.add(id);
      const before = baseItems.find((item) => item.id === id);
      const after = parsedItems.find((item) => item.source_index === match.source_index);
      for (const key of fields) {
        if (JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null)) {
          changed.push({ path: `${pathPrefix}.${id}.${key}`, before: before?.[key] ?? null, after: after?.[key] ?? null });
        }
      }
    }
    return matched;
  };
  const matchedDiscovery = compareExact(baseFrame.discovery, parsedDiscovery, discoveryMatches, "discovery_item_id", "discovery", ["title", "body", "human_authority", "category"]);
  const baseBoundaries = baseFrame.disposition_boundaries ?? [];
  const baseCaseDispositions = baseFrame.case_dispositions ?? [];
  const matchedBoundaries = compareExact(baseBoundaries, parsedBoundaries, boundaryMatches, "disposition_boundary_id", "disposition_boundaries", [...DISPOSITION_BOUNDARY_FIELDS, "version_id"]);
  const matchedCaseDispositions = compareExact(baseCaseDispositions, parsedCaseDispositions, caseDispositionMatches, "case_disposition_id", "case_dispositions", [...CASE_DISPOSITION_FIELDS, "version_id"]);
  return {
    additions: [
      ...discoveryMatches.filter((item) => item.match === "unmatched"),
      ...boundaryMatches.filter((item) => item.match === "unmatched").map((item) => ({ family_kind: "disposition_boundary", ...item })),
      ...caseDispositionMatches.filter((item) => item.match === "unmatched").map((item) => ({ family_kind: "case_disposition", ...item })),
    ],
    changes: changed,
    removals: [
      ...baseFrame.discovery.filter((item) => !matchedDiscovery.has(item.id)).map((item) => ({ discovery_item_id: item.id })),
      ...baseBoundaries.filter((item) => !matchedBoundaries.has(item.id)).map((item) => ({ disposition_boundary_id: item.id })),
      ...baseCaseDispositions.filter((item) => !matchedCaseDispositions.has(item.id)).map((item) => ({ case_disposition_id: item.id })),
    ],
  };
}

async function prepareLegacyReconciliation(request) {
  exactKeys(request, PREPARE_REQUEST_FIELDS, "request");
  if (request.request_version !== 1) throw new FrameRequestError("request_version", "version_incompatible", "request_version must be 1.");
  requiredId(request.store_id, "store_id", "store"); requiredId(request.frame_id, "frame_id", "frame"); validateContext(request.context);
  if (!object(request.base_revision) || !Number.isInteger(request.base_revision.number) || request.base_revision.number < 1 || Object.keys(request.base_revision).some((key) => !["id", "number"].includes(key))) throw new FrameRequestError("base_revision", "explicit_base_revision_required", "An explicit base revision is required.");
  if (request.base_revision.id != null) requiredId(request.base_revision.id, "base_revision.id", "frame-revision");
  const base = await readFrame({ protocol: request.protocol, operation: "frame.read", request_version: 1, store_id: request.store_id, context: request.context, frame_id: request.frame_id, revision_number: request.base_revision.number, include: { discovery: "all_selected", case_dispositions: "all_selected" }, configuration: request.configuration });
  if (!base.ok) return base;
  if (request.base_revision.id != null && base.result.revision.id !== request.base_revision.id) throw new FrameRequestError("base_revision.id", "requested_base_identity_mismatch", "The requested revision number and ID do not identify the same historical revision.");
  const current = await readFrame({ protocol: request.protocol, operation: "frame.read", request_version: 1, store_id: request.store_id, context: request.context, frame_id: request.frame_id, include: { discovery: "all_selected", case_dispositions: "all_selected" }, configuration: request.configuration });
  if (!current.ok) return current;
  const baseCurrent = current.result.revision.id === base.result.revision.id;
  const baseStale = !baseCurrent;
  if (!Array.isArray(request.documents) || request.documents.length !== 2) throw new FrameRequestError("documents", "frame_and_discovery_required", "Exactly frame.md and one selected Discovery document are required.");
  const snapshots = [];
  for (let index = 0; index < request.documents.length; index++) snapshots.push(await immutableSnapshot(request.documents[index], `documents[${index}]`, new Set(["filename", "locator", "digest", "bytes_base64"])));
  const names = snapshots.map((document) => document.filename);
  if (names.filter((name) => name === "frame.md").length !== 1 || names.filter((name) => ["discovery.md", "discovery-map.md"].includes(name)).length !== 1) throw new FrameRequestError("documents", "legacy_document_selection_invalid", "Select frame.md and exactly one of discovery.md or discovery-map.md; dual Discovery files are rejected.");
  if (request.machine_manifest == null) throw new FrameRequestError("machine_manifest", "verified_manifest_required", "Exact machine identity requires a digest-verified immutable manifest snapshot.");
  const manifestSnapshot = await immutableSnapshot(request.machine_manifest, "machine_manifest", new Set(["locator", "digest", "bytes_base64"]));
  let manifest; try { manifest = JSON.parse(decodeSnapshotText(manifestSnapshot.bytes, "machine_manifest.bytes")); } catch (error) { if (error instanceof FrameRequestError) throw error; throw new FrameRequestError("machine_manifest.bytes", "manifest_json_invalid", "Manifest bytes must contain one JSON value."); }
  const manifestFields = new Set([
    "schema", "renderer", "frame_id", "frame_version_id", "base_revision_id", "base_revision_number", "documents",
    "discovery_items", "disposition_boundaries", "case_dispositions",
  ]);
  if (!object(manifest) || Object.keys(manifest).some((key) => !manifestFields.has(key)) || manifest.schema !== "casebook-frame-legacy-manifest@1") throw new FrameRequestError("machine_manifest", "manifest_schema_invalid", "The verified manifest must use the closed supported schema.");
  if (!object(manifest.renderer) || manifest.renderer.id !== "casebook-l01-frame-markdown" || manifest.renderer.version !== 1 || Object.keys(manifest.renderer).some((key) => !["id", "version"].includes(key))) throw new FrameRequestError("machine_manifest.renderer", "renderer_incompatible", "The manifest renderer is unsupported.");
  if (manifest.frame_id !== request.frame_id) throw new FrameRequestError("machine_manifest.frame_id", "manifest_frame_mismatch", "Manifest Frame identity differs from the request.");
  if (manifest.frame_version_id != null && manifest.frame_version_id !== base.result.revision.version_ids.frame) throw new FrameRequestError("machine_manifest.frame_version_id", "manifest_base_drift", "Manifest Frame base version differs from the exact requested revision.");
  if (manifest.base_revision_id !== base.result.revision.id || manifest.base_revision_number !== base.result.revision.number) throw new FrameRequestError("machine_manifest.base_revision", "manifest_base_drift", "Manifest base differs from the exact requested revision.");
  if (!object(manifest.documents) || Object.keys(manifest.documents).length !== 2 || snapshots.some((snapshot) => manifest.documents[snapshot.filename] !== snapshot.digest)) throw new FrameRequestError("machine_manifest.documents", "manifest_document_binding_invalid", "Manifest must bind both selected filenames to their verified byte digests.");
  const frameParsed = parseLegacyFrameMarkdown(decodeSnapshotText(snapshots.find((item) => item.filename === "frame.md").bytes, "documents.frame.md"));
  const discoveryParsed = parseLegacyDiscoveryMarkdown(decodeSnapshotText(snapshots.find((item) => item.filename !== "frame.md").bytes, "documents.discovery"));
  const violations = [...frameParsed.violations, ...discoveryParsed.violations];
  if ((manifest.disposition_boundaries == null) !== (manifest.case_dispositions == null)) {
    violations.push({ path: "machine_manifest", rule: "disposition_identity_bindings_incomplete" });
  }

  const readBindings = ({ manifestKey, sourceKey, sourcePattern, idPrefix, versionPrefix, baseItems, expectedLabels, expectedItems = baseItems, max, required }) => {
    const supplied = manifest[manifestKey];
    const identities = new Map(), boundIds = new Set(), known = new Map(baseItems.map((item) => [item.id, item]));
    if (supplied == null && !required) return { identities, known };
    if (!Array.isArray(supplied) || supplied.length > max) {
      violations.push({ path: `machine_manifest.${manifestKey}`, rule: "bounded_array_required" });
      return { identities, known };
    }
    for (const [index, item] of supplied.entries()) {
      let valid = object(item) && !Object.keys(item).some((key) => ![sourceKey, "id", "version_id"].includes(key)) && sourcePattern.test(item?.[sourceKey] ?? "");
      try {
        requiredId(item?.id, `machine_manifest.${manifestKey}[${index}].id`, idPrefix);
        requiredId(item?.version_id, `machine_manifest.${manifestKey}[${index}].version_id`, versionPrefix);
      } catch { valid = false; }
      const label = item?.[sourceKey];
      if (!valid || identities.has(label) || boundIds.has(item?.id)) violations.push({ path: `machine_manifest.${manifestKey}[${index}]`, rule: "identity_binding_invalid" });
      else { identities.set(label, item); boundIds.add(item.id); }
    }
    const expectedByLabel = new Map(expectedLabels.map((label, index) => [label, expectedItems[index]]));
    for (const [label, identity] of identities) {
      const selected = known.get(identity.id), expected = expectedByLabel.get(label);
      if (!selected || !expected) violations.push({ path: `machine_manifest.${manifestKey}.${label}`, rule: "identity_binding_extra" });
      else if (selected.version_id !== identity.version_id) violations.push({ path: `machine_manifest.${manifestKey}.${label}`, rule: "identity_binding_stale" });
      else if (identity.id !== expected.id || identity.version_id !== expected.version_id) violations.push({ path: `machine_manifest.${manifestKey}.${label}`, rule: "identity_binding_changed" });
    }
    if (identities.size !== baseItems.length || [...known.keys()].some((id) => !boundIds.has(id))) violations.push({ path: `machine_manifest.${manifestKey}`, rule: "identity_binding_not_one_to_one" });
    return { identities, known };
  };

  const discoveryBindings = readBindings({
    manifestKey: "discovery_items", sourceKey: "display_label", sourcePattern: /^AT-\d{3}$/, idPrefix: "discovery",
    versionPrefix: "discovery-item-version", baseItems: base.result.frame.discovery,
    expectedLabels: l01DiscoveryEntries(base.result.frame).map(({ display_label: label }) => label),
    expectedItems: l01DiscoveryEntries(base.result.frame).map(({ item }) => item), max: MAX_DISCOVERY, required: true,
  });
  const baseBoundaries = base.result.frame.disposition_boundaries ?? [];
  const baseCaseDispositions = base.result.frame.case_dispositions ?? [];
  const boundaryBindings = readBindings({
    manifestKey: "disposition_boundaries", sourceKey: "source_label", sourcePattern: /^DB-\d{3}$/, idPrefix: "disposition-boundary",
    versionPrefix: "disposition-boundary-version", baseItems: baseBoundaries,
    expectedLabels: baseBoundaries.map((_, index) => `DB-${String(index + 1).padStart(3, "0")}`), max: 64, required: false,
  });
  const caseDispositionBindings = readBindings({
    manifestKey: "case_dispositions", sourceKey: "source_label", sourcePattern: /^CD-\d{3}$/, idPrefix: "case-disposition",
    versionPrefix: "case-disposition-version", baseItems: baseCaseDispositions,
    expectedLabels: baseCaseDispositions.map((_, index) => `CD-${String(index + 1).padStart(3, "0")}`), max: 128, required: false,
  });

  const candidateMatch = ({ item, label, bindings, idKey, versionKey, candidateKey, heuristic }) => {
    const identity = bindings.identities.get(label), selected = identity == null ? null : bindings.known.get(identity.id);
    if (identity != null && selected?.version_id === identity.version_id) {
      return { source_index: item.source_index, [label.startsWith("AT-") ? "display_label" : "source_label"]: label, match: "exact", [idKey]: selected.id, [versionKey]: selected.version_id };
    }
    const candidates = new Set(selected == null ? [] : [selected.id]);
    for (const baseItem of bindings.known.values()) if (heuristic(item, baseItem)) candidates.add(baseItem.id);
    return {
      source_index: item.source_index,
      [label.startsWith("AT-") ? "display_label" : "source_label"]: label,
      match: candidates.size ? "ambiguous" : "unmatched",
      [candidateKey]: [...candidates],
    };
  };
  const matches = discoveryParsed.items.map((item) => candidateMatch({
    item, label: item.display_label, bindings: discoveryBindings, idKey: "discovery_item_id", versionKey: "discovery_item_version_id",
    candidateKey: "candidate_discovery_item_ids", heuristic: (candidate, baseItem) => candidate.title === baseItem.title || candidate.body === baseItem.body,
  }));
  const boundaryMatches = frameParsed.disposition_boundaries.map((item) => candidateMatch({
    item, label: item.source_label, bindings: boundaryBindings, idKey: "disposition_boundary_id", versionKey: "disposition_boundary_version_id",
    candidateKey: "candidate_disposition_boundary_ids", heuristic: (candidate, baseItem) => candidate.display_label === baseItem.display_label || candidate.title === baseItem.title || (candidate.basis != null && candidate.basis === baseItem.basis),
  }));
  const caseDispositionMatches = frameParsed.case_dispositions.map((item) => candidateMatch({
    item, label: item.source_label, bindings: caseDispositionBindings, idKey: "case_disposition_id", versionKey: "case_disposition_version_id",
    candidateKey: "candidate_case_disposition_ids", heuristic: (candidate, baseItem) => candidate.result_summary === baseItem.result_summary,
  }));
  const frameMatch = manifest.frame_version_id == null
    ? { match: "ambiguous", candidate_frame_ids: [request.frame_id] }
    : { match: "exact", frame_id: request.frame_id, frame_version_id: manifest.frame_version_id };
  const diff = structuralDiff(
    base.result.frame, frameParsed.value ?? {}, discoveryParsed.items, matches,
    frameParsed.disposition_boundaries, boundaryMatches, frameParsed.case_dispositions, caseDispositionMatches,
  );
  const absentInLegacy = frameParsed.disposition_state === "absent_in_legacy";
  return success("frame.legacy.prepare_reconciliation", {
    status: violations.length ? "invalid" : "prepared",
    frame_id: request.frame_id,
    requested_base_revision: { id: base.result.revision.id, number: request.base_revision.number },
    base_revision: base.result.revision,
    current_revision: current.result.revision,
    base_current: baseCurrent,
    base_stale: baseStale,
    selected_discovery_filename: names.find((name) => name !== "frame.md"),
    absent_in_legacy: absentInLegacy,
    legacy_disposition_state: frameParsed.disposition_state,
    requires_semantic_reconcile: true,
    immutable_documents: snapshots.map(({ bytes: _bytes, ...snapshot }) => snapshot),
    immutable_manifest: { ...(manifestSnapshot.locator == null ? {} : { locator: manifestSnapshot.locator }), digest: manifestSnapshot.digest },
    violations,
    parsed: {
      frame: frameParsed.value,
      discovery: discoveryParsed.items,
      disposition_boundaries: frameParsed.disposition_boundaries,
      case_dispositions: frameParsed.case_dispositions,
    },
    structural_diff: diff,
    frame_match: frameMatch,
    matches,
    disposition_boundary_matches: boundaryMatches,
    case_disposition_matches: caseDispositionMatches,
    mutation_performed: false,
    watch_started: false,
    rename_performed: false,
    writeback_performed: false,
    applied_view: base.result.applied_view,
  });
}

function handoffNotVisible() {
  return failure("frame.not_found_or_not_visible", "The Frame is unknown or not visible under the exact discovery handoff.", {
    failureClass: "frame.read_failure", retryDisposition: RETRY_DISPOSITIONS.NEVER, evidence: {},
  });
}

async function hydrateDiscoveryCandidates(request) {
  exactKeys(request, DISCOVERY_HYDRATE_FIELDS, "request");
  if (request.request_version !== 1) throw new FrameRequestError("request_version", "version_incompatible", "request_version must be 1.");
  requiredId(request.store_id, "store_id", "store");
  validateContext(request.context);
  requiredString(request.handoff_token, "handoff_token", 64 * 1024);
  if (!/^[0-9a-f]{64}$/.test(request.query_digest ?? "") || !Array.isArray(request.candidate_ids) || request.candidate_ids.length < 1 || request.candidate_ids.length > 100) return handoffNotVisible();
  const validated = await invokeSubstrateOperation({ operation: "validate_identity_handoff", configuration: request.configuration, store_id: request.store_id, context: request.context, owner_kind: "frame", handoff_token: request.handoff_token, query_digest: request.query_digest, candidate_ids: request.candidate_ids });
  if (!validated?.ok) return handoffNotVisible();
  const items = [];
  for (const candidate of validated.result.candidates) {
    const mechanical = await invokeSubstrateOperation({ operation: "read_owner_revision", configuration: request.configuration, store_id: request.store_id, context: request.context, owner: { id: candidate.id, kind: "frame" }, revision_id: candidate.revision_id });
    if (!mechanical?.ok) return handoffNotVisible();
    try {
      const hydrated = hydrateFrame(mechanical.result);
      if (hydrated.frame.status !== "active") return handoffNotVisible();
      const projection = await projectFrameForView(request, hydrated.frame);
      if (projection.failure) return projection.failure;
      items.push({ ...hydrated, frame: projection.frame });
    } catch { return handoffNotVisible(); }
  }
  return success("frame.discovery.hydrate", { status: "found", items, query_digest: validated.result.query_digest, snapshot_query_fence: validated.result.snapshot_query_fence, audience_ceiling: validated.result.audience_ceiling, applied_bounds: validated.result.applied_bounds, applied_view: validated.result.applied_view });
}

export async function invokeFrameOperation(request) {
  try {
    if (request.operation === "frame.create") return await mutateFrame(request, true);
    if (request.operation === "frame.commit_revision") return await mutateFrame(request, false);
    if (request.operation === "frame.get_operation_receipt") return await getFrameOperationReceipt(request);
    if (request.operation === "frame.resolve") return await resolveFrame(request);
    if (request.operation === "frame.read") return await readFrame(request);
    if (request.operation === "frame.export.fragment") return await produceFrameFragment(request);
    if (request.operation === "frame.discovery.read") return await readDiscovery(request);
    if (request.operation === "frame.discovery.hydrate") return await hydrateDiscoveryCandidates(request);
    if (request.operation === "frame.disposition.read") return await readDisposition(request);
    if (request.operation === "frame.history") return await frameHistory(request);
    if (request.operation === "frame.list") return await listFrames(request);
    if (request.operation === "frame.legacy.prepare_reconciliation") return await prepareLegacyReconciliation(request);
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
