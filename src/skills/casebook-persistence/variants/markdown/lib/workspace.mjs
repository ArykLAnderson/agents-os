import { constants as fsConstants } from "node:fs";
import { randomBytes } from "node:crypto";
import {
  access,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { validateAuthorityConfiguration, ConfigurationError } from "../../../shared/config.mjs";
import {
  canonicalJson,
  INTERCHANGE_MANIFEST,
  L01_IDENTITY_RULE,
  L01_INTERCHANGE_FORMAT,
  L01_WORKSPACE_PROFILE,
  sha256,
  WORKSPACE_MARKER,
} from "../../../shared/l01-interchange.mjs";
import { renderInterchange } from "./interchange.mjs";
import {
  failure,
  RETRY_DISPOSITIONS,
  success,
  unsupported,
} from "../../../shared/protocol.mjs";

const MAX_FILE_BYTES = 256 * 1024;
const MAX_RECORDS = 256;
const MAX_SEARCH_LIMIT = 50;
const FILE_AUTHORITY_PROFILE = "file-authoritative-markdown-v1";
const CASE_STAGE_PREFIX = ".casebook-owned-case-stage-";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const idPattern = (prefix) => new RegExp(`^${prefix}:${UUID}$`);
const OWNER_ID = new RegExp(`^(case|frame):${UUID}$`);
const KINDS = new Set(["case", "frame"]);
const ACTIVE_CATEGORIES = new Set(["fog", "frontier", "blocked", "contested", "deferred", "out_of_scope"]);
const HUMAN_AUTHORITY = new Set(["required", "not_required", "unclear"]);
const CATEGORY = Object.freeze({
  "Fog": "fog",
  "Frontier": "frontier",
  "Blocked": "blocked",
  "Contested": "contested",
  "Deferred": "deferred",
  "Out of Scope": "out_of_scope",
});
const BASE_FIELDS = new Set(["protocol", "operation", "request_version", "store_id", "context", "configuration"]);
const DIGEST = /^[0-9a-f]{64}$/;

export class MarkdownError extends Error {
  constructor(code, pathName, rule, message, evidence = {}) {
    super(message);
    this.code = code;
    this.pathName = pathName;
    this.rule = rule;
    this.evidence = evidence;
  }
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, allowed, pathName) {
  for (const key of Object.keys(value ?? {})) {
    if (!allowed.has(key)) throw new MarkdownError("markdown.invalid_request", `${pathName}.${key}`, "field_unsupported", "Field is outside the exact L-01 Markdown request shape.");
  }
}

function requiredString(value, pathName, max = 16_384) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max) {
    throw new MarkdownError("markdown.invalid_request", pathName, "required_bounded_string", "A non-empty bounded string is required.");
  }
  return value;
}

function requiredId(value, pathName, prefix) {
  requiredString(value, pathName, 128);
  if (!idPattern(prefix).test(value)) {
    throw new MarkdownError("markdown.identity_unverified", pathName, "uuid_identity_required", "A verified UUID-based stable identity is required.");
  }
  return value;
}

function ownerKinds(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) {
    throw new MarkdownError("markdown.invalid_request", "owner_kinds", "bounded_owner_kinds_required", "One or two owner kinds are required.");
  }
  const unique = [...new Set(value)];
  if (unique.length !== value.length || unique.some((kind) => !KINDS.has(kind))) {
    throw new MarkdownError("markdown.invalid_request", "owner_kinds", "owner_kinds_invalid", "Only unique case/frame owner kinds are supported.");
  }
  return unique.sort();
}

function assertChild(root, candidate, label) {
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new MarkdownError("markdown.path_invalid", label, "workspace_root_escape", "A Markdown asset path escaped the configured workspace root.");
  }
}

function assertWithinRoot(root, candidate, label) {
  if (candidate === root) return;
  assertChild(root, candidate, label);
}

async function secureWriteParent(root, relativePath, label) {
  const rootEntry = await lstat(root);
  if (rootEntry.isSymbolicLink() || !rootEntry.isDirectory() || await realpath(root) !== root) {
    throw new MarkdownError("markdown.path_invalid", label, "real_workspace_root_required", "Markdown writes require the unchanged real workspace root directory.");
  }
  const destination = path.resolve(root, relativePath);
  assertChild(root, destination, label);
  const parent = path.dirname(destination);
  const relativeParent = path.relative(root, parent);
  if (relativeParent.startsWith("..") || path.isAbsolute(relativeParent)) {
    throw new MarkdownError("markdown.path_invalid", label, "workspace_root_escape", "A Markdown write parent escaped the configured workspace root.");
  }
  let current = root;
  const components = relativeParent ? relativeParent.split(path.sep) : [];
  for (const component of components) {
    current = path.join(current, component);
    let entry;
    try {
      entry = await lstat(current);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      try { await mkdir(current); } catch (mkdirError) {
        if (mkdirError.code !== "EEXIST") throw mkdirError;
      }
      entry = await lstat(current);
    }
    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new MarkdownError("markdown.path_invalid", label, "real_directory_parent_required", "Every Markdown write parent must be a real workspace directory, not a symlink or another file type.");
    }
    const resolved = await realpath(current);
    assertWithinRoot(root, resolved, label);
  }
  const parentEntry = await lstat(parent);
  if (parentEntry.isSymbolicLink() || !parentEntry.isDirectory()) {
    throw new MarkdownError("markdown.path_invalid", label, "real_directory_parent_required", "The final Markdown write parent must be a real workspace directory.");
  }
  const resolvedParent = await realpath(parent);
  assertWithinRoot(root, resolvedParent, label);
  return destination;
}

async function boundedMetadataRead(root, relativePath, label, {
  required = true,
  code = "markdown.workspace_unavailable",
  missingRule = "metadata_missing",
  boundedRule = "bounded_regular_metadata_required",
} = {}) {
  const candidate = path.resolve(root, relativePath);
  assertChild(root, candidate, label);
  const resolved = await realpath(candidate).catch(() => null);
  if (!resolved) {
    if (!required) return null;
    throw new MarkdownError(code, label, missingRule, "A required workspace file is missing.");
  }
  assertChild(root, resolved, label);
  const fileStat = await stat(resolved);
  if (!fileStat.isFile() || fileStat.size > MAX_FILE_BYTES) {
    throw new MarkdownError(code, label, boundedRule, "A bounded regular workspace file is required.");
  }
  return readFile(resolved, "utf8");
}

async function boundedRead(root, relativePath, expectedDigest, label) {
  if (typeof relativePath !== "string" || relativePath.length === 0 || path.isAbsolute(relativePath)) {
    throw new MarkdownError("markdown.manifest_incompatible", label, "relative_path_required", "Manifest paths must be relative.");
  }
  const bytes = await boundedMetadataRead(root, relativePath, label, {
    code: "markdown.manifest_incompatible",
    missingRule: "selected_file_missing",
    boundedRule: "bounded_regular_file_required",
  });
  if (!/^[0-9a-f]{64}$/.test(expectedDigest) || sha256(bytes) !== expectedDigest) {
    throw new MarkdownError("markdown.manifest_incompatible", label, "content_digest_mismatch", "Selected Markdown bytes do not match the machine-readable manifest.");
  }
  return bytes;
}

function parseScalar(value) {
  const trimmed = value.trim();
  try { return JSON.parse(trimmed); } catch { return trimmed; }
}

function parseFrontmatter(bytes, label) {
  const match = bytes.match(/^---\n([\s\S]*?)\n---\n(?:\n)?/);
  if (!match) throw new MarkdownError("markdown.parse_invalid", label, "frontmatter_required", "Verified frontmatter is required.");
  const fields = {};
  for (const [index, line] of match[1].split("\n").entries()) {
    const separator = line.indexOf(":");
    if (separator <= 0) throw new MarkdownError("markdown.parse_invalid", `${label}.frontmatter[${index}]`, "frontmatter_scalar_invalid", "Only scalar L-01 frontmatter is accepted.");
    const key = line.slice(0, separator).trim();
    if (key in fields) throw new MarkdownError("markdown.parse_invalid", `${label}.${key}`, "frontmatter_duplicate", "Frontmatter keys must be unique.");
    fields[key] = parseScalar(line.slice(separator + 1));
  }
  return { fields, body: bytes.slice(match[0].length) };
}

function sections(body, label, allowed, { required = [], ordered = allowed } = {}) {
  const result = new Map();
  const matches = [...body.matchAll(/^## ([^\n]+)\n/gm)];
  if (body.slice(0, matches[0]?.index ?? body.length).trim()) {
    throw new MarkdownError("markdown.parse_invalid", label, "body_outside_section", "L-01 Markdown permits no body outside its exact sections.");
  }
  let previousOrder = -1;
  for (let index = 0; index < matches.length; index += 1) {
    const name = matches[index][1].trim();
    if (!allowed.includes(name)) {
      throw new MarkdownError("markdown.parse_invalid", `${label}.heading.${name}`, "heading_unsupported", "The heading is outside the exact L-01 Markdown grammar.");
    }
    if (result.has(name)) throw new MarkdownError("markdown.parse_invalid", `${label}.heading.${name}`, "heading_duplicate", "L-01 headings must be unique.");
    const order = ordered.indexOf(name);
    if (order <= previousOrder) {
      throw new MarkdownError("markdown.parse_invalid", `${label}.heading.${name}`, "heading_order_invalid", "L-01 headings must use canonical order.");
    }
    previousOrder = order;
    const start = matches[index].index + matches[index][0].length;
    const end = matches[index + 1]?.index ?? body.length;
    result.set(name, body.slice(start, end).trim());
  }
  for (const name of required) {
    if (!result.has(name)) throw new MarkdownError("markdown.parse_invalid", `${label}.heading.${name}`, "heading_required", "The exact L-01 Markdown grammar requires this heading.");
  }
  return result;
}

function requireEmptySection(map, name, label) {
  if (map.get(name) !== "") {
    throw new MarkdownError("markdown.parse_invalid", `${label}.${name}`, "section_body_unsupported", "This L-01 section must remain empty.");
  }
}

function optionalSection(map, name) {
  const value = map.get(name);
  if (value == null || value.length === 0) return undefined;
  const match = value.match(/^```json\n([\s\S]*)\n```$/);
  if (!match) throw new MarkdownError("markdown.parse_invalid", `section.${name}`, "canonical_json_block_required", "L-01 interchange sections require one canonical JSON block.");
  try { return JSON.parse(match[1]); } catch {
    throw new MarkdownError("markdown.parse_invalid", `section.${name}`, "section_json_invalid", "The section JSON value is invalid.");
  }
}

function parseCase(bytes, manifestRecord) {
  const { fields, body } = parseFrontmatter(bytes, manifestRecord.path);
  exactKeys(fields, new Set(["type", "schema_version", "id", "home_namespace_id", "state", "title", "summary"]), "frontmatter");
  if (fields.type !== "case" || fields.schema_version !== 1) {
    throw new MarkdownError("markdown.parse_invalid", manifestRecord.path, "case_schema_incompatible", "The minimal Case schema is incompatible.");
  }
  const id = requiredId(fields.id, "frontmatter.id", "case");
  if (id !== manifestRecord.id) throw new MarkdownError("markdown.identity_unverified", "frontmatter.id", "manifest_identity_mismatch", "Case identity differs from the verified manifest.");
  const map = sections(body, manifestRecord.path, ["Scope", "Knowledge", "Sources"], {
    required: ["Scope", "Knowledge", "Sources"],
  });
  const scope = requiredString(optionalSection(map, "Scope"), "section.Scope");
  requireEmptySection(map, "Knowledge", manifestRecord.path);
  requireEmptySection(map, "Sources", manifestRecord.path);
  if (fields.state !== "active") throw new MarkdownError("markdown.parse_invalid", "frontmatter.state", "active_case_only_l01", "Only active minimal Cases are supported.");
  return {
    id,
    home_namespace_id: requiredId(fields.home_namespace_id, "frontmatter.home_namespace_id", "namespace"),
    state: fields.state,
    title: requiredString(fields.title, "frontmatter.title", 512),
    summary: requiredString(fields.summary, "frontmatter.summary", 4_096),
    scope,
  };
}

function parseDiscovery(bytes, manifestRecord) {
  if (!Array.isArray(manifestRecord.discovery_items) || manifestRecord.discovery_items.length < 1 || manifestRecord.discovery_items.length > 128) {
    throw new MarkdownError("markdown.identity_unverified", "manifest.discovery_items", "complete_identity_manifest_required", "A complete bounded Discovery identity manifest is required.");
  }
  const byLabel = new Map();
  for (const [index, identity] of manifestRecord.discovery_items.entries()) {
    if (!object(identity)) throw new MarkdownError("markdown.identity_unverified", `manifest.discovery_items[${index}]`, "identity_entry_required", "A machine-readable identity entry is required.");
    exactKeys(identity, new Set(["label", "id", "display_order", "display_label"]), `manifest.discovery_items[${index}]`);
    requiredString(identity.label, `manifest.discovery_items[${index}].label`, 64);
    requiredId(identity.id, `manifest.discovery_items[${index}].id`, "discovery");
    if (!Number.isInteger(identity.display_order) || identity.display_order < 0 || identity.display_order > 1_000_000) {
      throw new MarkdownError("markdown.identity_unverified", `manifest.discovery_items[${index}].display_order`, "display_order_invalid", "A stable bounded display order is required.");
    }
    if (byLabel.has(identity.label)) {
      throw new MarkdownError("markdown.identity_ambiguous", "manifest.discovery_items", "duplicate_display_label", "Human-readable labels cannot select between multiple stable identities.");
    }
    byLabel.set(identity.label, identity);
  }
  const categoryNames = Object.keys(CATEGORY);
  const categorySections = sections(bytes, manifestRecord.discovery_path, categoryNames, { ordered: categoryNames });
  if (categorySections.size === 0) {
    throw new MarkdownError("markdown.parse_invalid", manifestRecord.discovery_path, "discovery_category_required", "At least one exact Discovery category is required.");
  }
  const items = [];
  for (const [categoryName, block] of categorySections) {
    const category = CATEGORY[categoryName];
    const itemMatches = [...block.matchAll(/^### ([^:\n]+): ([^\n]+)\n/gm)];
    if (block.slice(0, itemMatches[0]?.index ?? block.length).trim()) {
      throw new MarkdownError("markdown.parse_invalid", `discovery.${categoryName}`, "discovery_body_outside_item", "Discovery category prose must be contained in exact items.");
    }
    for (let itemIndex = 0; itemIndex < itemMatches.length; itemIndex += 1) {
      const match = itemMatches[itemIndex];
      const label = match[1].trim();
      const identity = byLabel.get(label);
      if (!identity) {
        throw new MarkdownError("markdown.identity_unverified", `discovery.${label}`, "manifest_identity_required", "Text labels or similarity cannot establish exact Discovery identity.");
      }
      const bodyStart = match.index + match[0].length;
      const bodyEnd = itemMatches[itemIndex + 1]?.index ?? block.length;
      const itemBody = block.slice(bodyStart, bodyEnd).trim();
      const authorityMatch = itemBody.match(/^- Human authority: (required|not_required|unclear)\n\n```json\n([^\n]+)\n```$/);
      if (!authorityMatch) throw new MarkdownError("markdown.parse_invalid", `discovery.${label}`, "discovery_shape_invalid", "A human-authority line and canonical JSON body are required.");
      let title;
      let discoveryBody;
      try {
        title = JSON.parse(match[2]);
        discoveryBody = JSON.parse(authorityMatch[2]);
      } catch {
        throw new MarkdownError("markdown.parse_invalid", `discovery.${label}`, "discovery_json_invalid", "Discovery title/body JSON is invalid.");
      }
      const item = {
        id: identity.id,
        display_order: identity.display_order,
        lifecycle: "active",
        category,
        title: requiredString(title, `discovery.${label}.title`, 512),
        body: requiredString(discoveryBody, `discovery.${label}.body`),
        human_authority: authorityMatch[1],
        dependencies: [],
      };
      if (identity.display_label != null) item.display_label = requiredString(identity.display_label, `manifest.discovery_items.${label}.display_label`, 64);
      items.push(item);
      byLabel.delete(label);
    }
  }
  if (items.length === 0 || byLabel.size !== 0) {
    throw new MarkdownError("markdown.identity_unverified", "manifest.discovery_items", "manifest_content_identity_mismatch", "Manifest identities and parsed Discovery items must match exactly.");
  }
  const ids = new Set(items.map((item) => item.id));
  const orders = new Set(items.map((item) => item.display_order));
  if (ids.size !== items.length || orders.size !== items.length) {
    throw new MarkdownError("markdown.identity_ambiguous", "manifest.discovery_items", "duplicate_stable_identity", "Discovery stable identities and display orders must be unique.");
  }
  items.sort((left, right) => left.display_order - right.display_order || left.id.localeCompare(right.id));
  return items;
}

function parseFrame(frameBytes, discoveryBytes, manifestRecord) {
  const { fields, body } = parseFrontmatter(frameBytes, manifestRecord.frame_path);
  exactKeys(fields, new Set([
    "type", "schema_version", "id", "home_namespace_id", "authority_scope_namespace_ids", "status", "title",
  ]), "frontmatter");
  if (fields.type !== "frame" || fields.schema_version !== 1) {
    throw new MarkdownError("markdown.parse_invalid", manifestRecord.frame_path, "frame_schema_incompatible", "The minimal Frame schema is incompatible.");
  }
  const id = requiredId(fields.id, "frontmatter.id", "frame");
  if (id !== manifestRecord.id) throw new MarkdownError("markdown.identity_unverified", "frontmatter.id", "manifest_identity_mismatch", "Frame identity differs from the verified manifest.");
  const home = requiredId(fields.home_namespace_id, "frontmatter.home_namespace_id", "namespace");
  if (!Array.isArray(fields.authority_scope_namespace_ids) || fields.authority_scope_namespace_ids.length !== 1 || fields.authority_scope_namespace_ids[0] !== home) {
    throw new MarkdownError("markdown.parse_invalid", "frontmatter.authority_scope_namespace_ids", "cross_namespace_scope_unsupported", "L-01 supports exactly the home namespace.");
  }
  if (fields.status !== "active") throw new MarkdownError("markdown.parse_invalid", "frontmatter.status", "active_frame_only_l01", "Only active minimal Frames are supported.");
  const frameHeadings = ["Outcome", "Included Scope", "Excluded Scope", "Limitations", "Completion Condition", "Discovery"];
  const map = sections(body, manifestRecord.frame_path, frameHeadings, { required: ["Discovery"] });
  if (map.get("Discovery") !== "See the manifest-selected Discovery file.") {
    throw new MarkdownError("markdown.parse_invalid", "section.Discovery", "discovery_reference_invalid", "The synthetic Frame must contain only its exact manifest-selected Discovery reference.");
  }
  const record = {
    id,
    home_namespace_id: home,
    authority_scope_namespace_ids: [home],
    status: fields.status,
    discovery: parseDiscovery(discoveryBytes, manifestRecord),
  };
  if (fields.title != null) record.title = requiredString(fields.title, "frontmatter.title", 512);
  for (const [key, heading] of [["outcome", "Outcome"], ["limitations", "Limitations"], ["completion_condition", "Completion Condition"]]) {
    const value = optionalSection(map, heading);
    if (value != null) record[key] = requiredString(value, `section.${heading}`, 4_096);
  }
  for (const [key, heading] of [["included_scope", "Included Scope"], ["excluded_scope", "Excluded Scope"]]) {
    const value = optionalSection(map, heading);
    if (value != null) {
      if (!Array.isArray(value) || value.length > 64) throw new MarkdownError("markdown.parse_invalid", `section.${heading}`, "bounded_string_array_required", "A bounded string array is required.");
      record[key] = value.map((entry, index) => requiredString(entry, `section.${heading}[${index}]`, 4_096));
    }
  }
  return record;
}

async function loadAuthorityWorkspace(request) {
  const configuration = validateAuthorityConfiguration(request.configuration);
  if (configuration.authority_mode !== "markdown") {
    throw new MarkdownError("markdown_authority_required", "configuration.authority_mode", "explicit_markdown_selection_required", "This connector requires explicitly selected Markdown authority.");
  }
  const configuredRoot = path.resolve(configuration.markdown.workspace_root);
  const configuredEntry = await lstat(configuredRoot).catch(() => null);
  if (!configuredEntry) throw new MarkdownError("markdown.workspace_unavailable", "configuration.markdown.workspace_root", "workspace_missing", "The configured Markdown workspace does not exist.");
  if (configuredEntry.isSymbolicLink() || !configuredEntry.isDirectory()) {
    throw new MarkdownError("markdown.path_invalid", "configuration.markdown.workspace_root", "real_workspace_root_required", "The configured Markdown workspace root must be a real directory, not a symlink or another file type.");
  }
  const root = await realpath(configuredRoot);
  const markerPath = path.join(root, WORKSPACE_MARKER);
  const markerEntry = await lstat(markerPath).catch(() => null);
  if (!markerEntry) throw new MarkdownError("markdown.workspace_unavailable", WORKSPACE_MARKER, "authority_marker_required", "An explicit Markdown authority marker is required; no fallback is attempted.");
  if (markerEntry.isSymbolicLink() || !markerEntry.isFile()) {
    throw new MarkdownError("markdown.path_invalid", WORKSPACE_MARKER, "regular_authority_marker_required", "The authority marker must be a real file in the workspace root.");
  }
  if (markerEntry.size > MAX_FILE_BYTES) {
    throw new MarkdownError("markdown.workspace_unavailable", WORKSPACE_MARKER, "bounded_authority_marker_required", "The authority marker must remain bounded.");
  }
  const markerBytes = await readFile(markerPath, "utf8");
  let marker;
  try { marker = JSON.parse(markerBytes); } catch { throw new MarkdownError("markdown.workspace_unavailable", WORKSPACE_MARKER, "authority_marker_invalid", "The authority marker is invalid."); }
  exactKeys(marker, new Set(["configuration_version", "authority_mode", "profile", "workspace_id", "view", "interchange_manifest_sha256"]), "workspace_marker");
  if (marker.authority_mode == null) {
    throw new MarkdownError("authority_state_missing", `${WORKSPACE_MARKER}.authority_mode`, "installed_authority_required", "The workspace has no explicit installed authority; no fallback is attempted.");
  }
  if (marker.authority_mode === "sqlite") {
    throw new MarkdownError("authority_switch_requires_migration", `${WORKSPACE_MARKER}.authority_mode`, "ordinary_hot_switch_rejected", "Changing an installed workspace authority is migration work, not an ordinary configuration switch.");
  }
  if (marker.authority_mode !== "markdown") {
    throw new MarkdownError("authority_state_ambiguous", `${WORKSPACE_MARKER}.authority_mode`, "one_installed_authority_required", "The workspace authority marker must select exactly one Markdown authority.");
  }
  if (marker.configuration_version !== 1) {
    throw new MarkdownError("markdown.workspace_unavailable", WORKSPACE_MARKER, "workspace_profile_incompatible", "The Markdown authority workspace profile is incompatible.");
  }
  requiredId(marker.workspace_id, "workspace_marker.workspace_id", "store");
  if (request.store_id !== marker.workspace_id) throw new MarkdownError("markdown.not_visible", "store_id", "workspace_identity_mismatch", "The requested workspace is not visible.");
  if (!object(marker.view)) throw new MarkdownError("markdown.workspace_unavailable", "workspace_marker.view", "view_marker_required", "A private workspace view marker is required.");
  exactKeys(marker.view, new Set(["id", "policy_revision_id", "audience_ceiling"]), "workspace_marker.view");
  const viewId = requiredId(marker.view.id, "workspace_marker.view.id", "view");
  const policyId = requiredId(marker.view.policy_revision_id, "workspace_marker.view.policy_revision_id", "view-policy");
  if (marker.view.audience_ceiling !== "private") throw new MarkdownError("markdown.workspace_unavailable", "workspace_marker.view.audience_ceiling", "private_view_required", "Only a private view is supported.");
  if (!object(request.context)) {
    throw new MarkdownError("markdown.not_visible", "context", "exact_active_view_required", "The exact selected private view is required.");
  }
  exactKeys(request.context, new Set(["view_id", "view_policy_revision_id", "purpose", "requested_audience_ceiling"]), "context");
  if (request.context.view_id !== viewId || request.context.view_policy_revision_id !== policyId
    || request.context.requested_audience_ceiling !== "private" || typeof request.context.purpose !== "string"
    || !request.context.purpose.trim() || request.context.purpose.length > 512) {
    throw new MarkdownError("markdown.not_visible", "context", "exact_active_view_required", "The exact selected private view is required.");
  }
  return { configuration, root, marker, markerPath, appliedView: { view_id: viewId, view_policy_revision_id: policyId } };
}

async function loadWorkspace(request, { allowEmpty = false } = {}) {
  const authority = await loadAuthorityWorkspace(request);
  const { configuration, root, marker, markerPath, appliedView } = authority;
  if (marker.profile !== L01_WORKSPACE_PROFILE) {
    throw new MarkdownError("markdown.workspace_unavailable", WORKSPACE_MARKER, "synthetic_profile_required", "This operation requires the explicitly selected L-01 synthetic Markdown profile.");
  }
  const manifestPath = path.join(root, INTERCHANGE_MANIFEST);
  let manifestBytes = await boundedMetadataRead(root, INTERCHANGE_MANIFEST, INTERCHANGE_MANIFEST, { required: false });
  if (!manifestBytes && allowEmpty) {
    const empty = { manifest_version: 1, format: L01_INTERCHANGE_FORMAT, identity_rule: L01_IDENTITY_RULE, records: [] };
    manifestBytes = canonicalJson(empty);
  }
  if (!manifestBytes) throw new MarkdownError("markdown.workspace_unavailable", INTERCHANGE_MANIFEST, "interchange_manifest_required", "The identity manifest is required.");
  if (!/^[0-9a-f]{64}$/.test(marker.interchange_manifest_sha256)
    || sha256(manifestBytes) !== marker.interchange_manifest_sha256) {
    throw new MarkdownError("markdown.manifest_incompatible", INTERCHANGE_MANIFEST, "manifest_digest_mismatch", "The selected identity manifest digest does not match the authority marker.");
  }
  let manifest;
  try { manifest = JSON.parse(manifestBytes); } catch { throw new MarkdownError("markdown.manifest_incompatible", INTERCHANGE_MANIFEST, "manifest_json_invalid", "The identity manifest is invalid."); }
  exactKeys(manifest, new Set(["manifest_version", "format", "identity_rule", "records"]), "manifest");
  if (manifest.manifest_version !== 1 || manifest.format !== L01_INTERCHANGE_FORMAT
    || manifest.identity_rule !== L01_IDENTITY_RULE || !Array.isArray(manifest.records)
    || manifest.records.length > MAX_RECORDS) {
    throw new MarkdownError("markdown.manifest_incompatible", INTERCHANGE_MANIFEST, "manifest_schema_incompatible", "The L-01 identity manifest is incompatible.");
  }
  return { configuration, root, marker, markerPath, manifest, manifestBytes, manifestPath, appliedView };
}

async function parseRecords(workspace) {
  const records = [];
  const seen = new Set();
  for (const [index, manifestRecord] of workspace.manifest.records.entries()) {
    if (!object(manifestRecord) || !KINDS.has(manifestRecord.kind) || !OWNER_ID.test(manifestRecord.id)) {
      throw new MarkdownError("markdown.manifest_incompatible", `manifest.records[${index}]`, "owner_identity_invalid", "A typed stable owner identity is required.");
    }
    const identityKey = `${manifestRecord.kind}:${manifestRecord.id}`;
    if (seen.has(identityKey)) throw new MarkdownError("markdown.identity_ambiguous", "manifest.records", "duplicate_owner_identity", "Owner identity must be unique.");
    seen.add(identityKey);
    const ownerKey = manifestRecord.id.slice(manifestRecord.id.indexOf(":") + 1);
    if (manifestRecord.kind === "case") {
      exactKeys(manifestRecord, new Set(["kind", "id", "path", "sha256"]), `manifest.records[${index}]`);
      if (manifestRecord.path !== `cases/${ownerKey}.md`) {
        throw new MarkdownError("markdown.manifest_incompatible", `manifest.records[${index}].path`, "canonical_case_path_required", "The Case path is outside the L-01 canonical interchange layout.");
      }
      const bytes = await boundedRead(workspace.root, manifestRecord.path, manifestRecord.sha256, `manifest.records[${index}].path`);
      records.push({ owner_kind: "case", id: manifestRecord.id, record: parseCase(bytes, manifestRecord) });
      continue;
    }
    exactKeys(manifestRecord, new Set([
      "kind", "id", "frame_path", "frame_sha256", "discovery_path", "discovery_sha256",
      "discovery_filename", "discovery_items",
    ]), `manifest.records[${index}]`);
    const expectedDirectory = `frames/${ownerKey}`;
    if (!["discovery.md", "discovery-map.md"].includes(manifestRecord.discovery_filename)
      || manifestRecord.frame_path !== `${expectedDirectory}/frame.md`
      || manifestRecord.discovery_path !== `${expectedDirectory}/${manifestRecord.discovery_filename}`) {
      throw new MarkdownError("markdown.manifest_incompatible", `manifest.records[${index}].discovery_filename`, "selected_filename_invalid", "The manifest must select exactly the canonical current or legacy Frame files.");
    }
    const directory = path.dirname(path.resolve(workspace.root, manifestRecord.frame_path));
    const alternate = path.join(directory, manifestRecord.discovery_filename === "discovery.md" ? "discovery-map.md" : "discovery.md");
    if (await access(alternate, fsConstants.F_OK).then(() => true).catch(() => false)) {
      throw new MarkdownError("markdown.identity_ambiguous", `manifest.records[${index}].discovery_filename`, "dual_discovery_authority", "Both Discovery filenames cannot be concurrent authorities.");
    }
    const frameBytes = await boundedRead(workspace.root, manifestRecord.frame_path, manifestRecord.frame_sha256, `manifest.records[${index}].frame_path`);
    const discoveryBytes = await boundedRead(workspace.root, manifestRecord.discovery_path, manifestRecord.discovery_sha256, `manifest.records[${index}].discovery_path`);
    records.push({ owner_kind: "frame", id: manifestRecord.id, record: parseFrame(frameBytes, discoveryBytes, manifestRecord) });
  }
  records.sort((left, right) => left.owner_kind.localeCompare(right.owner_kind) || left.id.localeCompare(right.id));
  return records;
}

function validateBase(request, extras) {
  exactKeys(request, new Set([...BASE_FIELDS, ...extras]), "request");
  if (request.request_version !== 1) throw new MarkdownError("markdown.invalid_request", "request_version", "version_incompatible", "request_version must be 1.");
  requiredId(request.store_id, "store_id", "store");
}

function validateProvenance(value) {
  if (value == null) return;
  if (!object(value)) throw new MarkdownError("markdown.invalid_request", "provenance", "object_required", "provenance must be an object when present.");
  exactKeys(value, new Set(["causation", "correlation", "session", "acting_role", "authority_basis"]), "provenance");
  for (const [key, supplied] of Object.entries(value)) requiredString(supplied, `provenance.${key}`, 512);
}

function normalizeCase(value) {
  if (!object(value)) throw new MarkdownError("case.invalid_representation", "case", "object_required", "case must be an object.");
  exactKeys(value, new Set(["id", "home_namespace_id", "state", "title", "summary", "scope"]), "case");
  const record = {
    id: requiredId(value.id, "case.id", "case"),
    home_namespace_id: requiredId(value.home_namespace_id, "case.home_namespace_id", "namespace"),
    state: value.state,
    title: requiredString(value.title, "case.title", 512),
    summary: requiredString(value.summary, "case.summary", 4_096),
    scope: requiredString(value.scope, "case.scope"),
  };
  if (record.state !== "active") throw new MarkdownError("case.invalid_representation", "case.state", "create_requires_active_case", "Only an active Case is supported.");
  return record;
}

function normalizeReplacementCase(value) {
  try {
    return normalizeCase(value);
  } catch (error) {
    if (!(error instanceof MarkdownError)) throw error;
    throw new MarkdownError("case.invalid_representation", error.pathName, error.rule, "The complete Case dossier representation is structurally invalid.");
  }
}

function caseRelativePath(caseId) {
  return `cases/${caseId.slice(caseId.indexOf(":") + 1)}.md`;
}

async function readRegularNoFollow(root, relativePath, label) {
  if (typeof relativePath !== "string" || relativePath.length === 0 || path.isAbsolute(relativePath)) {
    throw new MarkdownError("markdown.path_invalid", label, "relative_path_required", "A relative workspace file path is required.");
  }
  const destination = path.resolve(root, relativePath);
  assertChild(root, destination, label);
  const parent = path.dirname(destination);
  const parentEntry = await lstat(parent).catch(() => null);
  if (!parentEntry || parentEntry.isSymbolicLink() || !parentEntry.isDirectory() || await realpath(parent) !== parent) {
    throw new MarkdownError("markdown.path_invalid", label, "real_directory_parent_required", "The Case dossier parent must be an unchanged real workspace directory.");
  }
  assertWithinRoot(root, parent, label);
  const entry = await lstat(destination).catch(() => null);
  if (!entry) throw new MarkdownError("case.not_found_or_not_visible", label, "case_dossier_missing", "The Case dossier is unknown or not visible in the selected workspace.");
  if (entry.isSymbolicLink() || !entry.isFile() || entry.size > MAX_FILE_BYTES) {
    throw new MarkdownError("markdown.path_invalid", label, "bounded_regular_dossier_required", "The Case dossier must be a bounded real file, not a symlink or another file type.");
  }
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  let handle;
  try {
    handle = await open(destination, flags);
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size > MAX_FILE_BYTES || opened.dev !== entry.dev || opened.ino !== entry.ino) {
      throw new MarkdownError("markdown.path_invalid", label, "stable_regular_dossier_required", "The Case dossier changed identity while it was being opened.");
    }
    const bytes = await handle.readFile("utf8");
    return { bytes, digest: sha256(bytes), destination, parent };
  } finally {
    await handle?.close();
  }
}

async function syncDirectoryAsAvailable(directory) {
  let handle;
  try {
    handle = await open(directory, fsConstants.O_RDONLY | (fsConstants.O_DIRECTORY ?? 0));
    await handle.sync();
  } catch (error) {
    if (!["EINVAL", "ENOTSUP", "EISDIR", "EPERM"].includes(error.code)) throw error;
  } finally {
    await handle?.close();
  }
}

function normalizeFrame(value) {
  if (!object(value)) throw new MarkdownError("frame.invalid_representation", "frame", "object_required", "frame must be an object.");
  exactKeys(value, new Set([
    "id", "home_namespace_id", "authority_scope_namespace_ids", "status", "title", "outcome",
    "included_scope", "excluded_scope", "limitations", "completion_condition", "discovery",
  ]), "frame");
  const home = requiredId(value.home_namespace_id, "frame.home_namespace_id", "namespace");
  if (!Array.isArray(value.authority_scope_namespace_ids) || value.authority_scope_namespace_ids.length !== 1 || value.authority_scope_namespace_ids[0] !== home) {
    throw new MarkdownError("frame.invalid_representation", "frame.authority_scope_namespace_ids", "cross_namespace_scope_unsupported", "Only the home namespace is supported.");
  }
  if (value.status !== "active" || !Array.isArray(value.discovery) || value.discovery.length < 1 || value.discovery.length > 128) {
    throw new MarkdownError("frame.invalid_representation", "frame", "active_complete_frame_required", "An active Frame with complete Discovery is required.");
  }
  const discovery = value.discovery.map((item, index) => {
    if (!object(item)) throw new MarkdownError("frame.invalid_representation", `frame.discovery[${index}]`, "object_required", "A Discovery object is required.");
    exactKeys(item, new Set(["id", "display_label", "display_order", "lifecycle", "category", "title", "body", "human_authority", "dependencies"]), `frame.discovery[${index}]`);
    if (item.lifecycle !== "active" || !ACTIVE_CATEGORIES.has(item.category) || !HUMAN_AUTHORITY.has(item.human_authority)
      || !Array.isArray(item.dependencies) || item.dependencies.length !== 0 || !Number.isInteger(item.display_order)
      || item.display_order < 0 || item.display_order > 1_000_000) {
      throw new MarkdownError("frame.invalid_representation", `frame.discovery[${index}]`, "active_discovery_shape_required", "Only active dependency-free L-01 Discovery is supported.");
    }
    const normalized = {
      id: requiredId(item.id, `frame.discovery[${index}].id`, "discovery"),
      display_order: item.display_order,
      lifecycle: item.lifecycle,
      category: item.category,
      title: requiredString(item.title, `frame.discovery[${index}].title`, 512),
      body: requiredString(item.body, `frame.discovery[${index}].body`),
      human_authority: item.human_authority,
      dependencies: [],
    };
    if (item.display_label != null) normalized.display_label = requiredString(item.display_label, `frame.discovery[${index}].display_label`, 64);
    return normalized;
  });
  if (new Set(discovery.map((item) => item.id)).size !== discovery.length || new Set(discovery.map((item) => item.display_order)).size !== discovery.length) {
    throw new MarkdownError("frame.invalid_representation", "frame.discovery", "duplicate_discovery_identity", "Discovery IDs and orders must be unique.");
  }
  const record = { id: requiredId(value.id, "frame.id", "frame"), home_namespace_id: home, authority_scope_namespace_ids: [home], status: value.status, discovery };
  for (const key of ["title", "outcome", "limitations", "completion_condition"]) if (value[key] != null) record[key] = requiredString(value[key], `frame.${key}`, key === "title" ? 512 : 4_096);
  for (const key of ["included_scope", "excluded_scope"]) {
    if (value[key] != null) {
      if (!Array.isArray(value[key]) || value[key].length > 64) throw new MarkdownError("frame.invalid_representation", `frame.${key}`, "bounded_array_required", "A bounded string array is required.");
      record[key] = value[key].map((entry, index) => requiredString(entry, `frame.${key}[${index}]`, 4_096));
    }
  }
  return record;
}

async function persistCreate(workspace, kind, record) {
  if (workspace.configuration.source.kind !== "synthetic-test") {
    throw new MarkdownError("markdown.synthetic_write_required", "configuration.source.kind", "synthetic_test_only", "L01-W05 Markdown create is limited to explicit synthetic interchange workspaces.");
  }
  const existing = await parseRecords(workspace);
  if (existing.some((item) => item.id === record.id)) {
    return { failure: failure(`${kind}.create_identity_exists`, `The ${kind} identity already exists in the selected Markdown manifest.`, {
      failureClass: `${kind}.mutation_conflict`,
      retryDisposition: RETRY_DISPOSITIONS.NEVER,
      evidence: {},
    }) };
  }
  const rendered = renderInterchange([{ kind, id: record.id, record }]);
  const created = [];
  try {
    for (const file of rendered.files) await secureWriteParent(workspace.root, file.path, file.path);
    for (const file of rendered.files) {
      const destination = await secureWriteParent(workspace.root, file.path, file.path);
      await writeFile(destination, file.content, { flag: "wx" });
      created.push(destination);
    }
    const nextManifest = { ...workspace.manifest, records: [...workspace.manifest.records, ...rendered.manifest.records] };
    nextManifest.records.sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
    const nextManifestBytes = canonicalJson(nextManifest);
    const nextMarker = { ...workspace.marker, interchange_manifest_sha256: sha256(nextManifestBytes) };
    const manifestTemporary = `${workspace.manifestPath}.l01-${process.pid}.tmp`;
    const markerTemporary = `${workspace.markerPath}.l01-${process.pid}.tmp`;
    await secureWriteParent(workspace.root, path.relative(workspace.root, manifestTemporary), INTERCHANGE_MANIFEST);
    await secureWriteParent(workspace.root, path.relative(workspace.root, markerTemporary), WORKSPACE_MARKER);
    await writeFile(manifestTemporary, nextManifestBytes, { flag: "wx" });
    await writeFile(markerTemporary, canonicalJson(nextMarker), { flag: "wx" });
    // The manifest is the selection point for this create-only synthetic
    // slice. A crash before the marker rename fails closed on digest mismatch;
    // full coherent replacement/generation recovery remains L-05.
    await rename(manifestTemporary, workspace.manifestPath);
    await rename(markerTemporary, workspace.markerPath);
    return { digest: sha256(nextManifestBytes), files: rendered.files.map((file) => file.path) };
  } catch (error) {
    for (const candidate of created) await rm(candidate, { force: true });
    await rm(`${workspace.manifestPath}.l01-${process.pid}.tmp`, { force: true });
    await rm(`${workspace.markerPath}.l01-${process.pid}.tmp`, { force: true });
    throw error;
  }
}

function lexicalFields(item) {
  const record = item.record;
  if (item.owner_kind === "case") return { title: record.title, summary: record.summary, scope: record.scope };
  const fields = {};
  for (const key of ["title", "outcome", "limitations", "completion_condition"]) if (record[key] != null) fields[key] = record[key];
  if (record.included_scope) fields.included_scope = record.included_scope.join("\n");
  if (record.excluded_scope) fields.excluded_scope = record.excluded_scope.join("\n");
  fields.discovery = record.discovery.map((entry) => `${entry.title}\n${entry.body}`).join("\n");
  return fields;
}

function queryTokens(query) {
  if (typeof query !== "string" || query.trim().length === 0 || query.length > 256) {
    throw new MarkdownError("markdown.invalid_request", "query", "bounded_lexical_query_required", "A bounded non-empty lexical query is required.");
  }
  const normalized = [...new Set(query.normalize("NFKC").toLocaleLowerCase("en-US").split(/[^\p{L}\p{N}_-]+/u).filter(Boolean))];
  if (normalized.length === 0) {
    throw new MarkdownError("markdown.invalid_request", "query", "lexical_token_required", "The lexical query must contain at least one searchable token.");
  }
  return normalized;
}

function match(item, tokens) {
  const fields = lexicalFields(item);
  if (!tokens.every((token) => Object.values(fields).some((value) => value.normalize("NFKC").toLocaleLowerCase("en-US").includes(token)))) return null;
  const matchedFields = [];
  let score = 0;
  for (const [field, raw] of Object.entries(fields)) {
    const value = raw.normalize("NFKC").toLocaleLowerCase("en-US");
    const count = tokens.filter((token) => value.includes(token)).length;
    if (count) { matchedFields.push(field); score += count + (field === "title" ? 1 : 0); }
  }
  return { ...item, matched_fields: matchedFields.sort(), lexical_score: score };
}

function commonResult(workspace, items, stableSort, completeness = "complete_within_bounds") {
  return {
    status: "found",
    items,
    index_state: "current",
    result_completeness: completeness,
    stable_sort: stableSort,
    snapshot_query_fence: `markdown:${sha256(workspace.manifestBytes)}`,
    applied_view: workspace.appliedView,
  };
}

async function createCase(request) {
  validateBase(request, ["operation_id", "expected_revision", "commit_basis", "provenance", "case"]);
  requiredString(request.operation_id, "operation_id", 256);
  if (request.expected_revision !== 0) throw new MarkdownError("case.invalid_representation", "expected_revision", "create_requires_absent_revision", "Case create requires expected revision 0.");
  requiredString(request.commit_basis, "commit_basis", 2_048);
  validateProvenance(request.provenance);
  const workspace = await loadWorkspace(request, { allowEmpty: true });
  const record = normalizeCase(request.case);
  const persisted = await persistCreate(workspace, "case", record);
  if (persisted.failure) return persisted.failure;
  return success("case.create", { status: "settled", case: record, persistence: { authority_mode: "markdown", aggregate_digest: persisted.digest, selected_files: persisted.files }, limitations: ["l01_synthetic_interchange_only", "no_durable_receipt_or_revision_history"] });
}

async function loadFileAuthorityCase(request, caseId) {
  const workspace = await loadAuthorityWorkspace(request);
  if (workspace.marker.profile !== FILE_AUTHORITY_PROFILE || workspace.marker.interchange_manifest_sha256 != null) {
    throw new MarkdownError("markdown.workspace_unavailable", WORKSPACE_MARKER, "file_authority_profile_required", "Atomic Case replacement requires the selected file-authoritative Markdown profile.");
  }
  const relativePath = caseRelativePath(caseId);
  const selected = await readRegularNoFollow(workspace.root, relativePath, relativePath);
  let record;
  try {
    record = parseCase(selected.bytes, { id: caseId, path: relativePath });
  } catch (error) {
    if (error instanceof MarkdownError && error.code === "markdown.identity_unverified") {
      throw new MarkdownError("case.identity_conflict", error.pathName, error.rule, "The selected Case dossier does not preserve its stable identity.");
    }
    throw error;
  }
  return { ...workspace, ...selected, relativePath, record };
}

async function commitFileAuthorityCase(request) {
  validateBase(request, ["operation_id", "expected_digest", "commit_basis", "provenance", "case"]);
  requiredString(request.operation_id, "operation_id", 256);
  if (!DIGEST.test(request.expected_digest)) {
    throw new MarkdownError("case.invalid_representation", "expected_digest", "sha256_required", "A lowercase SHA-256 expected dossier digest is required.");
  }
  requiredString(request.commit_basis, "commit_basis", 2_048);
  validateProvenance(request.provenance);
  const record = normalizeReplacementCase(request.case);
  let workspace;
  try {
    workspace = await loadFileAuthorityCase(request, record.id);
  } catch (error) {
    if (error instanceof MarkdownError && error.code === "case.not_found_or_not_visible") {
      throw new MarkdownError("case.identity_conflict", "case.id", "existing_stable_case_required", "Atomic Case replacement cannot create or substitute a stable Case identity.");
    }
    throw error;
  }
  if (workspace.digest !== request.expected_digest) {
    return failure("case.digest_conflict", "The selected Case dossier changed; replacement did not merge or overwrite it.", {
      failureClass: "case.mutation_conflict",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE,
      correctiveGuidance: "Read the current dossier, reconcile explicitly, and retry with its exact digest.",
      evidence: { expected_digest: request.expected_digest, current_digest: workspace.digest },
    });
  }
  const rendered = renderInterchange([{ kind: "case", id: record.id, record }]).files[0];
  if (rendered.path !== workspace.relativePath || Buffer.byteLength(rendered.content) > MAX_FILE_BYTES) {
    throw new MarkdownError("case.invalid_representation", "case", "canonical_bounded_dossier_required", "The rendered Case dossier is outside the canonical bounded layout.");
  }
  const parsedCandidate = parseCase(rendered.content, { id: record.id, path: rendered.path });
  if (!isDeepStrictEqual(parsedCandidate, record)) {
    throw new MarkdownError("case.invalid_representation", "case", "complete_round_trip_required", "The complete Case dossier must round-trip through the selected parser before replacement.");
  }

  const key = record.id.slice(record.id.indexOf(":") + 1);
  const stageName = `${CASE_STAGE_PREFIX}${key}-${process.pid}-${randomBytes(8).toString("hex")}.tmp`;
  const stagePath = path.join(workspace.parent, stageName);
  let stageSelected = false;
  try {
    const stageHandle = await open(stagePath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
    try {
      await stageHandle.writeFile(rendered.content, "utf8");
      await stageHandle.sync();
    } finally {
      await stageHandle.close();
    }
    if (workspace.configuration.source.kind === "synthetic-test" && process.env.CASEBOOK_MARKDOWN_TEST_FAULT === "corrupt_staged_case") {
      await writeFile(stagePath, "invalid staged Case\n");
    }
    const stagedEntry = await lstat(stagePath);
    if (stagedEntry.isSymbolicLink() || !stagedEntry.isFile() || stagedEntry.size > MAX_FILE_BYTES) {
      throw new MarkdownError("markdown.path_invalid", stageName, "bounded_regular_stage_required", "The owned Case stage must remain a bounded regular file.");
    }
    const stagedBytes = await readFile(stagePath, "utf8");
    const stagedRecord = parseCase(stagedBytes, { id: record.id, path: workspace.relativePath });
    if (!isDeepStrictEqual(stagedRecord, record) || sha256(stagedBytes) !== rendered.sha256) {
      throw new MarkdownError("case.invalid_representation", "case", "staged_round_trip_mismatch", "The flushed Case stage did not validate as the complete requested dossier.");
    }
    if (workspace.configuration.source.kind === "synthetic-test" && process.env.CASEBOOK_MARKDOWN_TEST_FAULT === "stop_after_case_stage_flush") {
      process.kill(process.pid, "SIGSTOP");
    }
    const observed = await readRegularNoFollow(workspace.root, workspace.relativePath, workspace.relativePath);
    if (observed.digest !== request.expected_digest) {
      return failure("case.digest_conflict", "The selected Case dossier changed while replacement was staged; no merge or overwrite occurred.", {
        failureClass: "case.mutation_conflict",
        retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE,
        correctiveGuidance: "Read the current dossier, reconcile explicitly, and retry with its exact digest.",
        evidence: { expected_digest: request.expected_digest, current_digest: observed.digest },
      });
    }
    await rename(stagePath, workspace.destination);
    stageSelected = true;
    await syncDirectoryAsAvailable(workspace.parent);
    return success("case.commit_revision", {
      status: "settled",
      case: record,
      previous_digest: request.expected_digest,
      current_digest: rendered.sha256,
      persistence: {
        authority_mode: "markdown",
        selected_file: workspace.relativePath,
        replacement: "same_directory_atomic_rename",
        stage_flush: "fsync",
        directory_flush: "fsync_as_available",
        interruption_debris: { owner: "casebook-persistence", filename_prefix: CASE_STAGE_PREFIX },
      },
      limitations: ["no_owner_revision_history", "no_durable_receipt", "one_trusted_logical_writer", "no_auto_merge"],
      applied_view: workspace.appliedView,
    });
  } finally {
    if (!stageSelected) await rm(stagePath, { force: true });
  }
}

async function createFrame(request) {
  validateBase(request, ["operation_id", "expected_revision", "commit_basis", "provenance", "frame"]);
  requiredString(request.operation_id, "operation_id", 256);
  if (request.expected_revision !== 0) throw new MarkdownError("frame.invalid_representation", "expected_revision", "create_requires_absent_revision", "Frame create requires expected revision 0.");
  requiredString(request.commit_basis, "commit_basis", 2_048);
  validateProvenance(request.provenance);
  const workspace = await loadWorkspace(request, { allowEmpty: true });
  const record = normalizeFrame(request.frame);
  const persisted = await persistCreate(workspace, "frame", record);
  if (persisted.failure) return persisted.failure;
  return success("frame.create", { status: "settled", frame: record, persistence: { authority_mode: "markdown", aggregate_digest: persisted.digest, selected_files: persisted.files }, limitations: ["l01_synthetic_interchange_only", "no_durable_receipt_revision_history_or_atomic_frame_replacement"] });
}

async function readOwner(request, kind) {
  const key = `${kind}_id`;
  validateBase(request, [key]);
  const id = requiredId(request[key], key, kind);
  if (kind === "case") {
    const authority = await loadAuthorityWorkspace(request);
    if (authority.marker.profile === FILE_AUTHORITY_PROFILE) {
      const workspace = await loadFileAuthorityCase(request, id);
      return success("case.read", {
        status: "found",
        case: workspace.record,
        persistence: { authority_mode: "markdown", selected_file: workspace.relativePath, content_digest: workspace.digest },
        limitations: ["no_owner_revision_history", "no_durable_receipt", "one_trusted_logical_writer"],
        applied_view: workspace.appliedView,
      });
    }
  }
  const workspace = await loadWorkspace(request);
  const records = await parseRecords(workspace);
  const found = records.find((item) => item.owner_kind === kind && item.id === id);
  if (!found) return failure(`${kind}.not_found_or_not_visible`, `The ${kind} is unknown or not visible under the exact selected Markdown workspace.`, { failureClass: `${kind}.read_failure`, evidence: {} });
  return success(`${kind}.read`, { status: "found", [kind]: found.record, persistence: { authority_mode: "markdown", manifest_digest: sha256(workspace.manifestBytes) }, applied_view: workspace.appliedView });
}

async function frameList(request) {
  validateBase(request, []);
  const workspace = await loadWorkspace(request);
  const records = (await parseRecords(workspace)).filter((item) => item.owner_kind === "frame");
  return success("frame.list", {
    ...commonResult(workspace, records.map((item) => ({ id: item.id, ...item.record })), "owner_id_asc"),
    applied_lifecycle_scope: "active_only",
  });
}

async function commonResolve(request) {
  validateBase(request, ["owner_id"]);
  requiredString(request.owner_id, "owner_id", 128);
  if (!OWNER_ID.test(request.owner_id)) throw new MarkdownError("markdown.identity_unverified", "owner_id", "stable_owner_identity_required", "A stable Case or Frame ID is required.");
  const workspace = await loadWorkspace(request);
  const item = (await parseRecords(workspace)).find((candidate) => candidate.id === request.owner_id);
  if (!item) return failure("common.not_found_or_not_visible", "The owner is unknown or not visible under the exact selected Markdown workspace.", { failureClass: "common.read_failure", evidence: {} });
  return success("common.resolve", { status: "found", item, index_state: "current", result_completeness: "complete_within_bounds", applied_view: workspace.appliedView });
}

async function commonList(request) {
  validateBase(request, ["owner_kinds"]);
  const kinds = ownerKinds(request.owner_kinds);
  const workspace = await loadWorkspace(request);
  const records = (await parseRecords(workspace)).filter((item) => kinds.includes(item.owner_kind));
  return success("common.list", commonResult(workspace, records, "owner_kind_asc_id_asc"));
}

async function commonSearch(request) {
  validateBase(request, ["owner_kinds", "query", "limit"]);
  const kinds = ownerKinds(request.owner_kinds);
  const tokens = queryTokens(request.query);
  if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > MAX_SEARCH_LIMIT) {
    throw new MarkdownError("markdown.invalid_request", "limit", "bounded_search_limit_required", "Search limit must be 1 through 50.");
  }
  const workspace = await loadWorkspace(request);
  const matches = (await parseRecords(workspace)).filter((item) => kinds.includes(item.owner_kind)).map((item) => match(item, tokens)).filter(Boolean);
  matches.sort((left, right) => right.lexical_score - left.lexical_score || left.owner_kind.localeCompare(right.owner_kind) || left.id.localeCompare(right.id));
  const completeness = matches.length > request.limit ? "truncated" : "complete_within_bounds";
  return success("common.search", {
    ...commonResult(workspace, matches.slice(0, request.limit), "lexical_score_desc_owner_kind_asc_id_asc", completeness),
    normalized_query_tokens: tokens,
    applied_limit: request.limit,
  });
}

async function parseInterchange(request) {
  validateBase(request, []);
  const workspace = await loadWorkspace(request);
  const records = await parseRecords(workspace);
  const requiresCaseReconcile = records.some((item) => item.owner_kind === "case");
  return success("interchange.parse", {
    status: "parsed",
    format: L01_INTERCHANGE_FORMAT,
    records: records.map((item) => ({ kind: item.owner_kind, id: item.id, record: item.record })),
    manifest_sha256: sha256(workspace.manifestBytes),
    identity_basis: "verified_frontmatter_and_manifest",
    semantic_evidence: {
      kind: "case.semantic_evidence",
      affected_visible_ids: records.filter((item) => item.owner_kind === "case").map((item) => item.id).sort(),
      violations: [],
      requires_case_reconcile: requiresCaseReconcile,
      mutation_performed: false,
    },
    reconcile_disposition: requiresCaseReconcile ? "requires-explicit-case-reconcile" : "not_applicable",
    requires_case_reconcile: requiresCaseReconcile,
    mutation_performed: false,
    selected_discovery_filenames: workspace.manifest.records.filter((item) => item.kind === "frame").map((item) => ({ frame_id: item.id, filename: item.discovery_filename })),
    limitations: ["l01_synthetic_interchange_only", "not_l05_markdown_authority_format"],
    applied_view: workspace.appliedView,
  });
}

function asFailure(error) {
  if (error instanceof MarkdownError) {
    return failure(error.code, error.message, {
      failureClass: error.code,
      retryDisposition: error.code.includes("manifest") || error.code.includes("workspace") ? RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR : RETRY_DISPOSITIONS.NEVER,
      evidence: { ...error.evidence, violations: [{ path: error.pathName, rule: error.rule }] },
    });
  }
  if (error instanceof ConfigurationError) {
    return failure(error.code, error.message, { failureClass: "configuration_or_workspace_unavailable", evidence: error.evidence });
  }
  return failure("markdown.internal_failure", "The Markdown operation failed without exposing workspace content.", {
    failureClass: "markdown.internal_failure",
    retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
    evidence: {},
  });
}

export async function invokeMarkdownOperation(request) {
  try {
    if (request.operation === "case.create") return await createCase(request);
    if (request.operation === "case.commit_revision") return await commitFileAuthorityCase(request);
    if (request.operation === "case.read") return await readOwner(request, "case");
    if (request.operation === "frame.create") return await createFrame(request);
    if (request.operation === "frame.read") return await readOwner(request, "frame");
    if (request.operation === "frame.list") return await frameList(request);
    if (request.operation === "common.resolve") return await commonResolve(request);
    if (request.operation === "common.list") return await commonList(request);
    if (request.operation === "common.search") return await commonSearch(request);
    if (request.operation === "interchange.parse") return await parseInterchange(request);
    return unsupported(request.operation);
  } catch (error) {
    return asFailure(error);
  }
}
