import { constants as fsConstants } from "node:fs";
import { randomBytes } from "node:crypto";
import {
  access,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
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
const FRAME_SELECTOR = ".casebook-frame-selected-generation.json";
const FRAME_STAGE_PREFIX = ".casebook-owned-frame-stage-";
const FRAME_GENERATION_PREFIX = ".casebook-owned-frame-generation-";
const FRAME_SELECTOR_STAGE_PREFIX = ".casebook-owned-frame-selector-";
const FRAME_GENERATION_MANIFEST = "generation-manifest.json";
const FRAME_GENERATION_SCHEMA = "casebook-file-frame-generation@1";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const idPattern = (prefix) => new RegExp(`^${prefix}:${UUID}$`);
const OWNER_ID = new RegExp(`^(case|frame):${UUID}$`);
const KINDS = new Set(["case", "frame"]);
const ACTIVE_CATEGORIES = new Set(["fog", "frontier", "blocked", "contested", "deferred", "out_of_scope"]);
const DISCOVERY_LIFECYCLES = new Set(["active", "settled", "tombstoned"]);
const HUMAN_AUTHORITY = new Set(["required", "not_required", "unclear"]);
const FRAME_STATUSES = new Set(["active", "completed", "abandoned", "superseded"]);
const BOUNDARY_CLOSURES = new Set(["open", "closed"]);
const CLASSIFICATION_STATES = new Set(["pending_classification", "classified"]);
const CASE_DISPOSITIONS = new Set(["intake", "reconcile", "no_case"]);
const CASE_REALIZATION_STATES = new Set(["awaiting_case", "settled"]);
const LOCATOR_AUDIENCES = new Set(["private", "project", "public"]);
const CATEGORY = Object.freeze({
  "Fog": "fog",
  "Frontier": "frontier",
  "Blocked": "blocked",
  "Contested": "contested",
  "Deferred": "deferred",
  "Out of Scope": "out_of_scope",
  "Settled": "settled",
});
const BASE_FIELDS = new Set(["protocol", "operation", "request_version", "store_id", "context", "configuration"]);
const DIGEST = /^[0-9a-f]{64}$/;
const CASE_FIELDS = new Set(["id", "home_namespace_id", "state", "title", "summary", "scope", "provenance", "aliases", "facets", "entries", "sources", "relationships", "references"]);
const CASE_COMPLETE_FIELDS = ["aliases", "facets", "entries", "sources", "relationships", "references"];
const FRAME_LINK_FIELDS = ["case_links", "frame_links", "downstream_links", "artifact_links"];
const OMITTED_CAPABILITIES = Object.freeze(["revisions", "events", "durable_receipts", "checkpoints", "snapshots", "namespace_global_queries"]);
const MARKDOWN_COMMON_OPERATIONS = Object.freeze(["case.create", "case.read", "frame.create", "frame.read", "common.resolve", "common.list", "common.search", "interchange.export", "interchange.parse"]);

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
  const base = {
    id,
    home_namespace_id: requiredId(fields.home_namespace_id, "frontmatter.home_namespace_id", "namespace"),
    state: fields.state,
    title: requiredString(fields.title, "frontmatter.title", 512),
    summary: requiredString(fields.summary, "frontmatter.summary", 4_096),
    scope: requiredString(optionalSection(map, "Scope"), "section.Scope"),
  };
  if (fields.state !== "active") throw new MarkdownError("markdown.parse_invalid", "frontmatter.state", "active_case_only", "Only current active Cases are exposed by the Markdown common subset.");
  const knowledgeRaw = map.get("Knowledge");
  const sourcesRaw = map.get("Sources");
  if (!knowledgeRaw && !sourcesRaw) return base;
  if ((knowledgeRaw && !knowledgeRaw.startsWith("```json\n")) || (sourcesRaw && !sourcesRaw.startsWith("```json\n"))) {
    if (knowledgeRaw) requireEmptySection(map, "Knowledge", manifestRecord.path);
    if (sourcesRaw) requireEmptySection(map, "Sources", manifestRecord.path);
  }
  const knowledge = optionalSection(map, "Knowledge");
  const sources = optionalSection(map, "Sources");
  if (!object(knowledge) || !Array.isArray(sources)) {
    throw new MarkdownError("case.invalid_representation", manifestRecord.path, "complete_case_sections_required", "Complete Case Knowledge and Sources sections must be supplied together.");
  }
  exactKeys(knowledge, new Set(["provenance", "aliases", "facets", "entries", "relationships", "references"]), "section.Knowledge");
  return normalizeCase({ ...base, ...knowledge, sources });
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
      let payload;
      try {
        title = JSON.parse(match[2]);
        payload = JSON.parse(authorityMatch[2]);
      } catch {
        throw new MarkdownError("markdown.parse_invalid", `discovery.${label}`, "discovery_json_invalid", "Discovery title/body JSON is invalid.");
      }
      const full = object(payload) && payload.schema === "casebook-discovery-full@1";
      if (object(payload) && !full) throw new MarkdownError("markdown.parse_invalid", `discovery.${label}`, "discovery_payload_schema_invalid", "A structured Discovery payload requires the supported schema identity.");
      if (full) exactKeys(payload, new Set(["schema", "body", "lifecycle", "dependencies", "scope_namespace_ids", "disposition", "resolution", "reopened_from_version", "reopening_basis"]), `discovery.${label}.payload`);
      const item = {
        id: identity.id,
        display_order: identity.display_order,
        lifecycle: full ? payload.lifecycle : "active",
        category,
        title: requiredString(title, `discovery.${label}.title`, 512),
        body: requiredString(full ? payload.body : payload, `discovery.${label}.body`),
        human_authority: authorityMatch[1],
        dependencies: full ? payload.dependencies : [],
      };
      if (full) for (const key of ["scope_namespace_ids", "disposition", "resolution", "reopened_from_version", "reopening_basis"]) if (payload[key] != null) item[key] = payload[key];
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

function parseDispositionSection(map, label) {
  const raw = optionalSection(map, "Case Dispositions");
  if (raw == null) return { disposition_state: "absent_in_legacy", disposition_boundaries: undefined, case_dispositions: undefined };
  if (!object(raw)) throw new MarkdownError("frame.invalid_representation", `${label}.Case Dispositions`, "disposition_section_schema_invalid", "Case Dispositions must contain one closed canonical JSON object.");
  exactKeys(raw, new Set(["disposition_boundaries", "case_dispositions"]), "section.Case Dispositions");
  if (!Array.isArray(raw.disposition_boundaries) || !Array.isArray(raw.case_dispositions)
    || raw.disposition_boundaries.length > 64 || raw.case_dispositions.length > 128) {
    throw new MarkdownError("frame.invalid_representation", `${label}.Case Dispositions`, "disposition_section_schema_invalid", "Case Dispositions requires bounded complete boundary and disposition arrays.");
  }
  const unwrap = (wrapper, index, prefix, normalizer) => {
    const itemPath = `${label}.Case Dispositions.${prefix === "DB" ? "disposition_boundaries" : "case_dispositions"}[${index}]`;
    if (!object(wrapper)) throw new MarkdownError("frame.invalid_representation", itemPath, "disposition_candidate_schema_invalid", "A strict labeled disposition record is required.");
    exactKeys(wrapper, new Set(["source_label", "record"]), itemPath);
    const expected = `${prefix}-${String(index + 1).padStart(3, "0")}`;
    if (wrapper.source_label !== expected) throw new MarkdownError("frame.invalid_representation", `${itemPath}.source_label`, "source_label_invalid", "Disposition source labels must use canonical order.");
    return normalizer(wrapper.record, index);
  };
  const dispositionBoundaries = raw.disposition_boundaries.map((item, index) => unwrap(item, index, "DB", normalizeDispositionBoundary));
  const caseDispositions = raw.case_dispositions.map((item, index) => unwrap(item, index, "CD", normalizeCaseDisposition));
  validateDispositionSelection(dispositionBoundaries, caseDispositions, undefined);
  return { disposition_state: "present", disposition_boundaries: dispositionBoundaries, case_dispositions: caseDispositions };
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
  if (!Array.isArray(fields.authority_scope_namespace_ids) || fields.authority_scope_namespace_ids.length < 1 || fields.authority_scope_namespace_ids.length > 64) {
    throw new MarkdownError("markdown.parse_invalid", "frontmatter.authority_scope_namespace_ids", "bounded_scope_required", "A bounded explicit authority scope is required.");
  }
  const authorityScope = fields.authority_scope_namespace_ids.map((namespaceId, index) => requiredId(namespaceId, `frontmatter.authority_scope_namespace_ids[${index}]`, "namespace"));
  if (new Set(authorityScope).size !== authorityScope.length || !authorityScope.includes(home)) throw new MarkdownError("markdown.parse_invalid", "frontmatter.authority_scope_namespace_ids", "home_namespace_required", "Authority scope must uniquely include the home namespace.");
  if (!FRAME_STATUSES.has(fields.status)) throw new MarkdownError("markdown.parse_invalid", "frontmatter.status", "frame_status_invalid", "The Frame status is unsupported.");
  const frameHeadings = ["Outcome", "Included Scope", "Excluded Scope", "Limitations", "Completion Condition", "Links", "Authorization", "Discovery", "Case Dispositions"];
  const map = sections(body, manifestRecord.frame_path, frameHeadings, { required: ["Discovery"] });
  if (map.get("Discovery") !== "See the manifest-selected Discovery file.") {
    throw new MarkdownError("markdown.parse_invalid", "section.Discovery", "discovery_reference_invalid", "The synthetic Frame must contain only its exact manifest-selected Discovery reference.");
  }
  const record = {
    id,
    home_namespace_id: home,
    authority_scope_namespace_ids: authorityScope,
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
  const links = optionalSection(map, "Links");
  if (links != null) {
    if (!object(links)) throw new MarkdownError("frame.invalid_representation", "section.Links", "object_required", "Frame Links must be one canonical object.");
    exactKeys(links, new Set(FRAME_LINK_FIELDS), "section.Links");
    for (const key of FRAME_LINK_FIELDS) record[key] = links[key];
  }
  const authorization = optionalSection(map, "Authorization");
  if (authorization != null) record.authorization_provenance = authorization;
  const dispositions = parseDispositionSection(map, manifestRecord.frame_path);
  if (dispositions.disposition_state === "present") {
    record.disposition_boundaries = dispositions.disposition_boundaries;
    record.case_dispositions = dispositions.case_dispositions;
  }
  return normalizeFrame(record, { requireDispositions: dispositions.disposition_state === "present" });
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

function boundedJson(value, pathName, depth = 0) {
  if (depth > 16) throw new MarkdownError("case.invalid_representation", pathName, "bounded_depth_required", "Typed owner content exceeds the supported nesting bound.");
  if (typeof value === "string") { if (value.length > 16_384) throw new MarkdownError("case.invalid_representation", pathName, "bounded_string_required", "Typed owner strings must remain bounded."); return; }
  if (value == null || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value))) return;
  if (Array.isArray(value)) {
    if (value.length > 256) throw new MarkdownError("case.invalid_representation", pathName, "bounded_array_required", "Typed owner arrays must remain bounded.");
    value.forEach((item, index) => boundedJson(item, `${pathName}[${index}]`, depth + 1)); return;
  }
  if (!object(value)) throw new MarkdownError("case.invalid_representation", pathName, "json_value_required", "Typed owner content must be canonical JSON data.");
  if (Object.keys(value).length > 64) throw new MarkdownError("case.invalid_representation", pathName, "bounded_object_required", "Typed owner objects must remain bounded.");
  for (const [key, item] of Object.entries(value)) boundedJson(item, `${pathName}.${key}`, depth + 1);
}

function validateCaseReference(value, pathName) {
  if (!object(value)) throw new MarkdownError("case.invalid_representation", pathName, "object_required", "A typed Case reference must be an object.");
  exactKeys(value, new Set(["target_kind", "target_id", "observed_revision_id", "pinned_revision_id", "predicate", "visibility", "provenance"]), pathName);
  const kind = requiredString(value.target_kind, `${pathName}.target_kind`, 64);
  requiredId(value.target_id, `${pathName}.target_id`, kind);
  requiredString(value.observed_revision_id, `${pathName}.observed_revision_id`, 128);
  if (value.pinned_revision_id != null) requiredString(value.pinned_revision_id, `${pathName}.pinned_revision_id`, 128);
}

function validateCaseSelection(selection, pathName, prefix, versionFields) {
  if (!object(selection)) throw new MarkdownError("case.invalid_representation", pathName, "object_required", "A typed Case family selection must be an object.");
  exactKeys(selection, new Set(["id", "state", "selected_version_id", "version", ...(prefix === "source" ? ["display_label", "fragments"] : [])]), pathName);
  requiredId(selection.id, `${pathName}.id`, prefix);
  if (!new Set(["active", "tombstoned"]).has(selection.state)) throw new MarkdownError("case.invalid_representation", `${pathName}.state`, "lifecycle_invalid", "Case family lifecycle is invalid.");
  if ((selection.selected_version_id == null) === (selection.version == null)) throw new MarkdownError("case.invalid_representation", pathName, "selection_shape_invalid", "Exactly one selected version ID or complete new version is required.");
  if (selection.selected_version_id != null) requiredString(selection.selected_version_id, `${pathName}.selected_version_id`, 128);
  if (selection.version != null) {
    if (!object(selection.version)) throw new MarkdownError("case.invalid_representation", `${pathName}.version`, "object_required", "A complete Case family version is required.");
    exactKeys(selection.version, versionFields, `${pathName}.version`);
    boundedJson(selection.version, `${pathName}.version`);
  }
}

function normalizeCase(value) {
  if (!object(value)) throw new MarkdownError("case.invalid_representation", "case", "object_required", "case must be an object.");
  exactKeys(value, CASE_FIELDS, "case");
  const record = {
    id: requiredId(value.id, "case.id", "case"),
    home_namespace_id: requiredId(value.home_namespace_id, "case.home_namespace_id", "namespace"),
    state: value.state,
    title: requiredString(value.title, "case.title", 512),
    summary: requiredString(value.summary, "case.summary", 4_096),
    scope: requiredString(value.scope, "case.scope"),
  };
  if (record.state !== "active") throw new MarkdownError("case.invalid_representation", "case.state", "create_requires_active_case", "Only a current active Case is supported by ordinary Markdown operations.");
  const complete = CASE_COMPLETE_FIELDS.some((key) => value[key] != null) || value.provenance != null;
  if (!complete) return record;
  for (const key of CASE_COMPLETE_FIELDS) if (!Array.isArray(value[key]) || value[key].length > 256) throw new MarkdownError("case.invalid_representation", `case.${key}`, "complete_selection_required", "Every complete Case family selection must be supplied as a bounded array.");
  if (value.provenance != null) boundedJson(value.provenance, "case.provenance");
  const selectionFields = {
    alias: new Set(["value", "kind"]),
    facet: new Set(["key", "value", "visibility", "provenance"]),
    knowledge: new Set(["display_label", "title", "purpose", "classification", "body", "scope", "visibility", "provenance", "support", "authority", "authority_required", "positions", "supersession", "relationships", "references"]),
    source: new Set(["title", "author", "accessed_at", "examined_for", "digest", "visibility", "locators", "provenance"]),
    evidence: new Set(["source_version_id", "excerpt", "purpose", "captured_at", "digest", "visibility", "provenance"]),
    relationship: new Set(["subject", "predicate", "object", "visibility", "provenance"]),
  };
  value.aliases.forEach((item, index) => validateCaseSelection(item, `case.aliases[${index}]`, "alias", selectionFields.alias));
  value.facets.forEach((item, index) => validateCaseSelection(item, `case.facets[${index}]`, "facet", selectionFields.facet));
  value.entries.forEach((item, index) => {
    validateCaseSelection(item, `case.entries[${index}]`, "knowledge", selectionFields.knowledge);
    for (const [referenceIndex, reference] of (item.version?.references ?? []).entries()) validateCaseReference(reference, `case.entries[${index}].version.references[${referenceIndex}]`);
  });
  value.sources.forEach((item, index) => {
    validateCaseSelection(item, `case.sources[${index}]`, "source", selectionFields.source);
    requiredString(item.display_label, `case.sources[${index}].display_label`, 64);
    if (!Array.isArray(item.fragments) || item.fragments.length > 256) throw new MarkdownError("case.invalid_representation", `case.sources[${index}].fragments`, "bounded_array_required", "Source evidence fragments must be a bounded array.");
    item.fragments.forEach((fragment, fragmentIndex) => validateCaseSelection(fragment, `case.sources[${index}].fragments[${fragmentIndex}]`, "evidence", selectionFields.evidence));
  });
  value.relationships.forEach((item, index) => validateCaseSelection(item, `case.relationships[${index}]`, "relationship", selectionFields.relationship));
  value.references.forEach((item, index) => validateCaseReference(item, `case.references[${index}]`));
  const familyIds = [record.id, ...value.aliases, ...value.facets, ...value.entries, ...value.sources, ...value.sources.flatMap((item) => item.fragments), ...value.relationships].map((item) => typeof item === "string" ? item : item.id);
  if (new Set(familyIds).size !== familyIds.length) throw new MarkdownError("case.invalid_representation", "case", "duplicate_stable_id", "Complete Case stable family IDs must be unique.");
  return structuredClone(value);
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

function normalizeEvidenceLocators(value, pathName) {
  if (value == null) return undefined;
  if (!Array.isArray(value) || value.length > 32) throw new MarkdownError("frame.invalid_representation", pathName, "bounded_array_required", "Evidence locators must be a bounded array.");
  return value.map((item, index) => {
    const itemPath = `${pathName}[${index}]`;
    if (!object(item)) throw new MarkdownError("frame.invalid_representation", itemPath, "object_required", "An evidence locator must be an object.");
    exactKeys(item, new Set(["uri", "media_type", "audience", "digest"]), itemPath);
    if (!LOCATOR_AUDIENCES.has(item.audience)) throw new MarkdownError("frame.invalid_representation", `${itemPath}.audience`, "audience_invalid", "Evidence audience is invalid.");
    const result = { uri: requiredString(item.uri, `${itemPath}.uri`, 4_096), audience: item.audience };
    for (const key of ["media_type", "digest"]) if (item[key] != null) result[key] = requiredString(item[key], `${itemPath}.${key}`, 512);
    return result;
  });
}

function normalizeDispositionBoundary(value, index) {
  const pathName = `frame.disposition_boundaries[${index}]`;
  if (!object(value)) throw new MarkdownError("frame.invalid_representation", pathName, "object_required", "A complete disposition boundary is required.");
  exactKeys(value, new Set(["id", "version_id", "display_label", "display_order", "title", "basis", "evidence_locators", "disposition_ids", "closure"]), pathName);
  if (!Number.isInteger(value.display_order) || value.display_order < 0 || value.display_order > 1_000_000) throw new MarkdownError("frame.invalid_representation", `${pathName}.display_order`, "display_order_invalid", "A bounded display order is required.");
  if (!BOUNDARY_CLOSURES.has(value.closure)) throw new MarkdownError("frame.invalid_representation", `${pathName}.closure`, "boundary_closure_invalid", "Boundary closure must be open or closed.");
  if (!Array.isArray(value.disposition_ids) || value.disposition_ids.length < 1 || value.disposition_ids.length > 128) throw new MarkdownError("frame.invalid_representation", `${pathName}.disposition_ids`, "bounded_array_required", "A declared boundary requires a bounded material-result inventory.");
  const dispositionIds = value.disposition_ids.map((id, itemIndex) => requiredId(id, `${pathName}.disposition_ids[${itemIndex}]`, "case-disposition"));
  if (new Set(dispositionIds).size !== dispositionIds.length) throw new MarkdownError("frame.invalid_representation", `${pathName}.disposition_ids`, "duplicate_disposition_membership", "A boundary inventory cannot repeat a disposition.");
  const title = value.title == null ? undefined : requiredString(value.title, `${pathName}.title`, 512);
  const basis = value.basis == null ? undefined : requiredString(value.basis, `${pathName}.basis`, 4_096);
  if (title == null && basis == null) throw new MarkdownError("frame.invalid_representation", pathName, "boundary_title_or_basis_required", "A boundary requires title or basis.");
  const result = {
    id: requiredId(value.id, `${pathName}.id`, "disposition-boundary"),
    version_id: requiredId(value.version_id, `${pathName}.version_id`, "disposition-boundary-version"),
    display_order: value.display_order,
    closure: value.closure,
    disposition_ids: dispositionIds,
  };
  if (value.display_label != null) result.display_label = requiredString(value.display_label, `${pathName}.display_label`, 64);
  if (title != null) result.title = title;
  if (basis != null) result.basis = basis;
  const locators = normalizeEvidenceLocators(value.evidence_locators, `${pathName}.evidence_locators`);
  if (locators != null) result.evidence_locators = locators;
  return result;
}

function normalizeCaseDisposition(value, index) {
  const pathName = `frame.case_dispositions[${index}]`;
  if (!object(value)) throw new MarkdownError("frame.invalid_representation", pathName, "object_required", "A complete Case disposition is required.");
  exactKeys(value, new Set([
    "id", "version_id", "boundary_id", "result_summary", "classification_state", "disposition", "rationale", "evidence_locators",
    "pending_reason", "resume_condition", "realization_state", "case_id", "case_operation_id", "observed_case_revision_id",
    "pinned_case_revision_id", "affected_case_entry_display_ids", "no_case_reason",
  ]), pathName);
  if (!CLASSIFICATION_STATES.has(value.classification_state)) throw new MarkdownError("frame.invalid_representation", `${pathName}.classification_state`, "classification_state_invalid", "Classification state is invalid.");
  const result = {
    id: requiredId(value.id, `${pathName}.id`, "case-disposition"),
    version_id: requiredId(value.version_id, `${pathName}.version_id`, "case-disposition-version"),
    boundary_id: requiredId(value.boundary_id, `${pathName}.boundary_id`, "disposition-boundary"),
    result_summary: requiredString(value.result_summary, `${pathName}.result_summary`, 4_096),
    classification_state: value.classification_state,
  };
  const locators = normalizeEvidenceLocators(value.evidence_locators, `${pathName}.evidence_locators`);
  if (locators != null) result.evidence_locators = locators;
  const present = (key) => value[key] != null;
  if (value.classification_state === "pending_classification") {
    if (["disposition", "realization_state", "case_id", "case_operation_id", "observed_case_revision_id", "pinned_case_revision_id", "affected_case_entry_display_ids", "no_case_reason"].some(present)) {
      throw new MarkdownError("frame.invalid_representation", pathName, "pending_classification_shape_invalid", "Pending classification cannot assert a disposition or Case realization.");
    }
    result.pending_reason = requiredString(value.pending_reason, `${pathName}.pending_reason`, 4_096);
    result.resume_condition = requiredString(value.resume_condition, `${pathName}.resume_condition`, 4_096);
    if (value.rationale != null) result.rationale = requiredString(value.rationale, `${pathName}.rationale`, 4_096);
    return result;
  }
  if (present("pending_reason") || present("resume_condition")) throw new MarkdownError("frame.invalid_representation", pathName, "classified_pending_fields_forbidden", "Classified dispositions cannot retain pending-only fields.");
  if (!CASE_DISPOSITIONS.has(value.disposition)) throw new MarkdownError("frame.invalid_representation", `${pathName}.disposition`, "classified_disposition_required", "Classified disposition must be intake, reconcile, or no_case.");
  result.disposition = value.disposition;
  if (value.disposition === "no_case") {
    if (["realization_state", "case_id", "case_operation_id", "observed_case_revision_id", "pinned_case_revision_id", "affected_case_entry_display_ids"].some(present)) {
      throw new MarkdownError("frame.invalid_representation", pathName, "no_case_shape_invalid", "No Case cannot carry Case realization fields.");
    }
    result.no_case_reason = requiredString(value.no_case_reason, `${pathName}.no_case_reason`, 4_096);
    if (value.rationale != null) result.rationale = requiredString(value.rationale, `${pathName}.rationale`, 4_096);
    return result;
  }
  if (present("no_case_reason")) throw new MarkdownError("frame.invalid_representation", `${pathName}.no_case_reason`, "no_case_reason_forbidden", "No Case reason is valid only for no_case.");
  result.rationale = requiredString(value.rationale, `${pathName}.rationale`, 4_096);
  if (!CASE_REALIZATION_STATES.has(value.realization_state)) throw new MarkdownError("frame.invalid_representation", `${pathName}.realization_state`, "case_realization_state_required", "Intake/Reconcile requires awaiting_case or settled.");
  result.realization_state = value.realization_state;
  result.case_id = requiredId(value.case_id, `${pathName}.case_id`, "case");
  result.case_operation_id = requiredString(value.case_operation_id, `${pathName}.case_operation_id`, 256);
  for (const key of ["observed_case_revision_id", "pinned_case_revision_id"]) if (value[key] != null) result[key] = requiredId(value[key], `${pathName}.${key}`, "case-revision");
  if (value.realization_state === "awaiting_case" && (result.observed_case_revision_id != null || result.pinned_case_revision_id != null)) throw new MarkdownError("frame.invalid_representation", pathName, "awaiting_case_revision_forbidden", "Awaiting Case cannot claim a committed revision.");
  if (value.realization_state === "settled" && result.observed_case_revision_id == null && result.pinned_case_revision_id == null) throw new MarkdownError("frame.invalid_representation", pathName, "settled_case_revision_required", "Settled Case realization requires revision evidence.");
  if (value.affected_case_entry_display_ids != null) {
    if (!Array.isArray(value.affected_case_entry_display_ids) || value.affected_case_entry_display_ids.length > 128) throw new MarkdownError("frame.invalid_representation", `${pathName}.affected_case_entry_display_ids`, "bounded_array_required", "Affected display IDs must be bounded.");
    result.affected_case_entry_display_ids = value.affected_case_entry_display_ids.map((item, itemIndex) => requiredString(item, `${pathName}.affected_case_entry_display_ids[${itemIndex}]`, 4_096));
  }
  return result;
}

function validateDispositionSelection(boundaries, dispositions, frameStatus) {
  const boundaryIds = new Set(); const boundaryOrders = new Set(); const memberships = new Map();
  for (const boundary of boundaries) {
    if (boundaryIds.has(boundary.id)) throw new MarkdownError("frame.invalid_representation", "frame.disposition_boundaries", "duplicate_boundary_id", "Boundary IDs must be unique.");
    if (boundaryOrders.has(boundary.display_order)) throw new MarkdownError("frame.invalid_representation", "frame.disposition_boundaries", "duplicate_display_order", "Boundary display orders must be unique.");
    boundaryIds.add(boundary.id); boundaryOrders.add(boundary.display_order);
    for (const dispositionId of boundary.disposition_ids) {
      if (memberships.has(dispositionId)) throw new MarkdownError("frame.invalid_representation", "frame.disposition_boundaries", "duplicate_disposition_membership", "Each disposition belongs to exactly one boundary.");
      memberships.set(dispositionId, boundary.id);
    }
  }
  const dispositionIds = new Set();
  for (const disposition of dispositions) {
    if (dispositionIds.has(disposition.id)) throw new MarkdownError("frame.invalid_representation", "frame.case_dispositions", "duplicate_case_disposition_id", "Disposition IDs must be unique.");
    dispositionIds.add(disposition.id);
    if (!boundaryIds.has(disposition.boundary_id) || memberships.get(disposition.id) !== disposition.boundary_id) throw new MarkdownError("frame.invalid_representation", "frame.case_dispositions", "disposition_membership_incomplete", "Boundary inventories and Case dispositions must be complete and identical.");
  }
  if (memberships.size !== dispositions.length || [...memberships.keys()].some((id) => !dispositionIds.has(id))) throw new MarkdownError("frame.invalid_representation", "frame.disposition_boundaries", "disposition_membership_incomplete", "Boundary inventories and Case dispositions must be complete and identical.");
  for (const boundary of boundaries) {
    const members = dispositions.filter((item) => item.boundary_id === boundary.id);
    if (boundary.closure === "closed" && members.some((item) => item.classification_state === "pending_classification" || item.realization_state === "awaiting_case")) throw new MarkdownError("frame.invalid_representation", "frame.disposition_boundaries", "closed_boundary_unsettled", "Closed boundaries cannot retain unsettled dispositions.");
  }
  if (frameStatus === "completed" && dispositions.some((item) => item.classification_state === "pending_classification" || item.realization_state === "awaiting_case")) throw new MarkdownError("frame.invalid_representation", "frame.case_dispositions", "completed_frame_unsettled_disposition", "Completed Frames cannot retain unsettled dispositions.");
}

function normalizeFrameReference(value, pathName) {
  if (!object(value)) throw new MarkdownError("frame.invalid_representation", pathName, "object_required", "A typed Frame reference is required.");
  exactKeys(value, new Set(["target_kind", "target_id", "observed_revision_id", "pinned_revision_id", "predicate", "provenance", "authority_scope"]), pathName);
  const kind = requiredString(value.target_kind, `${pathName}.target_kind`, 64);
  const result = {
    target_kind: kind,
    target_id: requiredId(value.target_id, `${pathName}.target_id`, kind),
    predicate: requiredString(value.predicate, `${pathName}.predicate`, 256),
  };
  for (const key of ["observed_revision_id", "pinned_revision_id", "provenance"]) if (value[key] != null) result[key] = requiredString(value[key], `${pathName}.${key}`, 512);
  if (value.authority_scope != null) {
    if (value.authority_scope !== "external_read_only") throw new MarkdownError("frame.invalid_representation", `${pathName}.authority_scope`, "external_read_only_marker_invalid", "Only external_read_only authority scope is supported.");
    result.authority_scope = value.authority_scope;
  }
  return result;
}

function normalizeArtifactLink(value, pathName) {
  if (!object(value)) throw new MarkdownError("frame.invalid_representation", pathName, "object_required", "Artifact metadata must be an object.");
  exactKeys(value, new Set(["artifact_id", "kind", "title", "summary", "locator", "observed_revision_id", "pinned_revision_id"]), pathName);
  if (!object(value.locator)) throw new MarkdownError("frame.invalid_representation", `${pathName}.locator`, "object_required", "Artifact locator metadata is required.");
  exactKeys(value.locator, new Set(["uri", "media_type", "audience", "digest"]), `${pathName}.locator`);
  if (!LOCATOR_AUDIENCES.has(value.locator.audience)) throw new MarkdownError("frame.invalid_representation", `${pathName}.locator.audience`, "audience_invalid", "Artifact locator audience is invalid.");
  const result = {
    artifact_id: requiredId(value.artifact_id, `${pathName}.artifact_id`, "artifact"),
    kind: requiredString(value.kind, `${pathName}.kind`, 256),
    title: requiredString(value.title, `${pathName}.title`, 512),
    locator: { uri: requiredString(value.locator.uri, `${pathName}.locator.uri`, 4_096), audience: value.locator.audience },
  };
  for (const key of ["media_type", "digest"]) if (value.locator[key] != null) result.locator[key] = requiredString(value.locator[key], `${pathName}.locator.${key}`, 512);
  for (const key of ["summary", "observed_revision_id", "pinned_revision_id"]) if (value[key] != null) result[key] = requiredString(value[key], `${pathName}.${key}`, key === "summary" ? 4_096 : 512);
  return result;
}

function normalizeFrameAuthorization(value) {
  if (!object(value)) throw new MarkdownError("frame.invalid_representation", "frame.authorization_provenance", "object_required", "Authorization provenance must be an object.");
  exactKeys(value, new Set(["session", "acting_role", "authority_basis", "human_confirmation", "causation", "correlation"]), "frame.authorization_provenance");
  boundedJson(value, "frame.authorization_provenance");
  if (value.human_confirmation != null) {
    exactKeys(value.human_confirmation, new Set(["reference", "confirmed_at", "scope", "expires_at"]), "frame.authorization_provenance.human_confirmation");
    for (const key of ["reference", "confirmed_at", "scope"]) requiredString(value.human_confirmation[key], `frame.authorization_provenance.human_confirmation.${key}`, 2_048);
  }
  return structuredClone(value);
}

function normalizeFrame(value, { requireDispositions = false } = {}) {
  if (!object(value)) throw new MarkdownError("frame.invalid_representation", "frame", "object_required", "frame must be an object.");
  exactKeys(value, new Set([
    "id", "home_namespace_id", "authority_scope_namespace_ids", "status", "title", "outcome",
    "included_scope", "excluded_scope", "limitations", "completion_condition", "case_links", "frame_links",
    "downstream_links", "artifact_links", "authorization_provenance", "discovery",
    "disposition_boundaries", "case_dispositions",
  ]), "frame");
  const home = requiredId(value.home_namespace_id, "frame.home_namespace_id", "namespace");
  if (!Array.isArray(value.authority_scope_namespace_ids) || value.authority_scope_namespace_ids.length < 1 || value.authority_scope_namespace_ids.length > 64) throw new MarkdownError("frame.invalid_representation", "frame.authority_scope_namespace_ids", "bounded_scope_required", "A bounded explicit Frame authority scope is required.");
  const authorityScope = value.authority_scope_namespace_ids.map((item, index) => requiredId(item, `frame.authority_scope_namespace_ids[${index}]`, "namespace"));
  if (new Set(authorityScope).size !== authorityScope.length || !authorityScope.includes(home)) throw new MarkdownError("frame.invalid_representation", "frame.authority_scope_namespace_ids", "home_namespace_required", "Frame authority scope must uniquely include its home namespace.");
  if (!FRAME_STATUSES.has(value.status) || !Array.isArray(value.discovery) || value.discovery.length < 1 || value.discovery.length > 128) throw new MarkdownError("frame.invalid_representation", "frame", "complete_frame_required", "A supported Frame with complete Discovery is required.");
  const discovery = value.discovery.map((item, index) => {
    const itemPath = `frame.discovery[${index}]`;
    if (!object(item)) throw new MarkdownError("frame.invalid_representation", itemPath, "object_required", "A Discovery object is required.");
    exactKeys(item, new Set(["id", "display_label", "display_order", "lifecycle", "category", "title", "body", "human_authority", "dependencies", "scope_namespace_ids", "disposition", "resolution", "reopened_from_version", "reopening_basis"]), itemPath);
    if (!DISCOVERY_LIFECYCLES.has(item.lifecycle) || !HUMAN_AUTHORITY.has(item.human_authority) || !Array.isArray(item.dependencies) || item.dependencies.length > 128 || !Number.isInteger(item.display_order) || item.display_order < 0 || item.display_order > 1_000_000) throw new MarkdownError("frame.invalid_representation", itemPath, "discovery_shape_invalid", "Discovery lifecycle, authority, dependencies, and order must be valid and bounded.");
    if (item.lifecycle === "active" && !ACTIVE_CATEGORIES.has(item.category)) throw new MarkdownError("frame.invalid_representation", `${itemPath}.category`, "active_category_invariant", "Active Discovery requires an active category.");
    if (item.lifecycle !== "active" && item.category !== "settled") throw new MarkdownError("frame.invalid_representation", `${itemPath}.category`, "settled_category_required", "Settled or tombstoned Discovery requires the settled category.");
    if (item.lifecycle !== "active" && item.disposition == null && item.resolution == null) throw new MarkdownError("frame.invalid_representation", `${itemPath}.disposition`, "disposition_or_resolution_required", "Settled or tombstoned Discovery requires disposition or resolution.");
    if ((item.reopened_from_version == null) !== (item.reopening_basis == null) || (item.lifecycle !== "active" && item.reopened_from_version != null)) throw new MarkdownError("frame.invalid_representation", `${itemPath}.reopened_from_version`, "reopen_pair_required", "Reopening metadata must be a complete active-only pair.");
    const normalized = {
      id: requiredId(item.id, `${itemPath}.id`, "discovery"), display_order: item.display_order,
      lifecycle: item.lifecycle, category: item.category, title: requiredString(item.title, `${itemPath}.title`, 512),
      body: requiredString(item.body, `${itemPath}.body`), human_authority: item.human_authority,
      dependencies: item.dependencies.map((reference, referenceIndex) => normalizeFrameReference(reference, `${itemPath}.dependencies[${referenceIndex}]`)),
    };
    if (item.display_label != null) normalized.display_label = requiredString(item.display_label, `${itemPath}.display_label`, 64);
    if (item.scope_namespace_ids != null) {
      if (!Array.isArray(item.scope_namespace_ids) || item.scope_namespace_ids.length > 64) throw new MarkdownError("frame.invalid_representation", `${itemPath}.scope_namespace_ids`, "bounded_scope_required", "Discovery scope namespaces must be bounded.");
      normalized.scope_namespace_ids = item.scope_namespace_ids.map((namespaceId, namespaceIndex) => requiredId(namespaceId, `${itemPath}.scope_namespace_ids[${namespaceIndex}]`, "namespace"));
    }
    for (const key of ["disposition", "resolution", "reopening_basis"]) if (item[key] != null) normalized[key] = requiredString(item[key], `${itemPath}.${key}`, 4_096);
    if (item.reopened_from_version != null) normalized.reopened_from_version = requiredId(item.reopened_from_version, `${itemPath}.reopened_from_version`, "discovery-item-version");
    return normalized;
  });
  if (new Set(discovery.map((item) => item.id)).size !== discovery.length || new Set(discovery.map((item) => item.display_order)).size !== discovery.length) throw new MarkdownError("frame.invalid_representation", "frame.discovery", "duplicate_discovery_identity", "Discovery IDs and orders must be unique.");
  if ((value.disposition_boundaries == null) !== (value.case_dispositions == null) || (requireDispositions && value.disposition_boundaries == null)) throw new MarkdownError("frame.invalid_representation", "frame.disposition_boundaries", "complete_disposition_sets_required", "Complete boundary and Case disposition sets are required.");
  const boundaries = value.disposition_boundaries?.map(normalizeDispositionBoundary);
  const dispositions = value.case_dispositions?.map(normalizeCaseDisposition);
  if ((boundaries?.length ?? 0) > 64 || (dispositions?.length ?? 0) > 128) throw new MarkdownError("frame.invalid_representation", "frame.case_dispositions", "bounded_array_required", "Disposition selections exceed their bounds.");
  if (boundaries != null) validateDispositionSelection(boundaries, dispositions, value.status);
  const record = { id: requiredId(value.id, "frame.id", "frame"), home_namespace_id: home, authority_scope_namespace_ids: authorityScope, status: value.status, discovery };
  for (const key of ["title", "outcome", "limitations", "completion_condition"]) if (value[key] != null) record[key] = requiredString(value[key], `frame.${key}`, key === "title" ? 512 : 4_096);
  for (const key of ["included_scope", "excluded_scope"]) {
    if (value[key] != null) {
      if (!Array.isArray(value[key]) || value[key].length > 64) throw new MarkdownError("frame.invalid_representation", `frame.${key}`, "bounded_array_required", "A bounded string array is required.");
      record[key] = value[key].map((entry, index) => requiredString(entry, `frame.${key}[${index}]`, 4_096));
    }
  }
  for (const key of ["case_links", "frame_links", "downstream_links"]) if (value[key] != null) {
    if (!Array.isArray(value[key]) || value[key].length > 128) throw new MarkdownError("frame.invalid_representation", `frame.${key}`, "bounded_array_required", "Frame links must be bounded arrays.");
    record[key] = value[key].map((item, index) => normalizeFrameReference(item, `frame.${key}[${index}]`));
  }
  if (value.artifact_links != null) {
    if (!Array.isArray(value.artifact_links) || value.artifact_links.length > 128) throw new MarkdownError("frame.invalid_representation", "frame.artifact_links", "bounded_array_required", "Artifact links must be bounded.");
    record.artifact_links = value.artifact_links.map((item, index) => normalizeArtifactLink(item, `frame.artifact_links[${index}]`));
  }
  if (value.authorization_provenance != null) record.authorization_provenance = normalizeFrameAuthorization(value.authorization_provenance);
  if (boundaries != null) { record.disposition_boundaries = boundaries; record.case_dispositions = dispositions; }
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

function lexicalText(value, output = []) {
  if (typeof value === "string") output.push(value);
  else if (Array.isArray(value)) for (const item of value) lexicalText(item, output);
  else if (object(value)) for (const item of Object.values(value)) lexicalText(item, output);
  return output;
}

function lexicalFields(item) {
  const record = item.record;
  if (item.owner_kind === "case") {
    const fields = { title: record.title, summary: record.summary, scope: record.scope };
    if (record.entries) fields.entries = lexicalText(record.entries).join("\n");
    if (record.sources) fields.sources = lexicalText(record.sources).join("\n");
    if (record.aliases) fields.aliases = lexicalText(record.aliases).join("\n");
    if (record.facets) fields.facets = lexicalText(record.facets).join("\n");
    return fields;
  }
  const fields = {};
  for (const key of ["title", "outcome", "limitations", "completion_condition"]) if (record[key] != null) fields[key] = record[key];
  if (record.included_scope) fields.included_scope = record.included_scope.join("\n");
  if (record.excluded_scope) fields.excluded_scope = record.excluded_scope.join("\n");
  fields.discovery = lexicalText(record.discovery).join("\n");
  if (record.disposition_boundaries) fields.disposition_boundaries = lexicalText(record.disposition_boundaries).join("\n");
  if (record.case_dispositions) fields.case_dispositions = lexicalText(record.case_dispositions).join("\n");
  if (FRAME_LINK_FIELDS.some((key) => record[key]?.length)) fields.links = lexicalText(FRAME_LINK_FIELDS.flatMap((key) => record[key] ?? [])).join("\n");
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
    capabilities: capabilities(),
    applied_view: workspace.appliedView,
  };
}

function publicItem(item) {
  return { owner_kind: item.owner_kind, id: item.id, record: item.record };
}

function capabilities() {
  return { profile: "reduced_file_authoritative_common_subset", supported: [...MARKDOWN_COMMON_OPERATIONS], omitted: [...OMITTED_CAPABILITIES] };
}

async function createFileAuthorityCase(authority, record) {
  const relativePath = caseRelativePath(record.id);
  const destination = await secureWriteParent(authority.root, relativePath, relativePath);
  if (await lstat(destination).catch(() => null)) return { failure: failure("case.create_identity_exists", "The Case identity already exists in the selected Markdown authority.", { failureClass: "case.mutation_conflict", evidence: {} }) };
  const rendered = renderInterchange([{ kind: "case", id: record.id, record }]).files[0];
  if (!isDeepStrictEqual(parseCase(rendered.content, { id: record.id, path: relativePath }), record)) throw new MarkdownError("case.invalid_representation", "case", "complete_round_trip_required", "The complete Case must round-trip before selection.");
  const parent = path.dirname(destination); const key = record.id.slice(5);
  const stagePath = path.join(parent, `${CASE_STAGE_PREFIX}${key}-${process.pid}-${randomBytes(8).toString("hex")}.tmp`);
  try {
    await writeFlushedFile(stagePath, rendered.content);
    if (!isDeepStrictEqual(parseCase(await readFile(stagePath, "utf8"), { id: record.id, path: relativePath }), record)) throw new MarkdownError("case.invalid_representation", "case", "staged_round_trip_mismatch", "The staged Case did not round-trip completely.");
    try { await link(stagePath, destination); } catch (error) {
      if (error.code === "EEXIST") return { failure: failure("case.create_identity_exists", "The Case identity already exists in the selected Markdown authority.", { failureClass: "case.mutation_conflict", evidence: {} }) };
      throw error;
    }
    await rm(stagePath, { force: true }); await syncDirectoryAsAvailable(parent);
    return { digest: rendered.sha256, files: [relativePath], selection: "same_directory_atomic_link" };
  } finally { await rm(stagePath, { force: true }); }
}

async function createCase(request) {
  validateBase(request, ["operation_id", "expected_revision", "commit_basis", "provenance", "case"]);
  requiredString(request.operation_id, "operation_id", 256);
  if (request.expected_revision !== 0) throw new MarkdownError("case.invalid_representation", "expected_revision", "create_requires_absent_revision", "Case create requires expected revision 0.");
  requiredString(request.commit_basis, "commit_basis", 2_048);
  validateProvenance(request.provenance);
  const record = normalizeCase(request.case);
  const authority = await loadAuthorityWorkspace(request);
  if (authority.marker.profile === FILE_AUTHORITY_PROFILE) {
    const persisted = await createFileAuthorityCase(authority, record);
    if (persisted.failure) return persisted.failure;
    return success("case.create", { status: "settled", case: record, persistence: { authority_mode: "markdown", content_digest: persisted.digest, selected_files: persisted.files, selection: persisted.selection }, capabilities: capabilities(), limitations: ["no_owner_revision_history", "no_durable_receipt", "one_trusted_logical_writer"] });
  }
  const workspace = await loadWorkspace(request, { allowEmpty: true });
  const persisted = await persistCreate(workspace, "case", record);
  if (persisted.failure) return persisted.failure;
  return success("case.create", { status: "settled", case: record, persistence: { authority_mode: "markdown", aggregate_digest: persisted.digest, selected_files: persisted.files }, capabilities: capabilities(), limitations: ["l01_synthetic_interchange_only", "no_durable_receipt_or_revision_history"] });
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

function frameOwnerRelativePath(frameId) {
  return `frames/${frameId.slice(frameId.indexOf(":") + 1)}`;
}

async function readOwnedRegular(directory, filename, label) {
  const candidate = path.join(directory, filename);
  const entry = await lstat(candidate).catch(() => null);
  if (!entry) return null;
  if (entry.isSymbolicLink() || !entry.isFile() || entry.size > MAX_FILE_BYTES) throw new MarkdownError("markdown.path_invalid", label, "bounded_regular_generation_file_required", "A selected Frame generation file must be a bounded real file.");
  let handle;
  try {
    handle = await open(candidate, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== entry.dev || opened.ino !== entry.ino || opened.size > MAX_FILE_BYTES) throw new MarkdownError("markdown.path_invalid", label, "stable_regular_generation_file_required", "The selected Frame generation file changed identity while opening.");
    return await handle.readFile("utf8");
  } finally {
    await handle?.close();
  }
}

async function loadFrameOwner(authority, frameId, { createParents = false } = {}) {
  const relative = frameOwnerRelativePath(frameId);
  if (createParents) await secureWriteParent(authority.root, `${relative}/frame.md`, relative);
  const owner = path.join(authority.root, relative);
  const entry = await lstat(owner).catch(() => null);
  if (!entry) throw new MarkdownError("frame.not_found_or_not_visible", relative, "frame_directory_missing", "The Frame is unknown or not visible in the selected workspace.");
  if (entry.isSymbolicLink() || !entry.isDirectory() || await realpath(owner) !== owner) throw new MarkdownError("markdown.path_invalid", relative, "real_frame_directory_required", "The Frame owner directory must be an unchanged real directory.");
  assertWithinRoot(authority.root, owner, relative);
  return { ...authority, relative, owner };
}

function frameAggregateDigest({ frameId, selectedDiscoveryFilename, documents, discoveryItems = [], dispositionBoundaries = [], caseDispositions = [] }) {
  return sha256(canonicalJson({
    schema: "casebook-file-frame-aggregate@1",
    frame_id: frameId,
    selected_discovery_filename: selectedDiscoveryFilename,
    documents,
    discovery_items: discoveryItems,
    disposition_boundaries: dispositionBoundaries,
    case_dispositions: caseDispositions,
  }));
}

function legacyDiscoveryCandidates(bytes, label) {
  const categorySections = sections(bytes, label, Object.keys(CATEGORY), { ordered: Object.keys(CATEGORY) });
  const items = [];
  for (const [categoryName, block] of categorySections) {
    const matches = [...block.matchAll(/^### (AT-\d{3}): ([^\n]+)\n/gm)];
    if (block.slice(0, matches[0]?.index ?? block.length).trim()) throw new MarkdownError("markdown.parse_invalid", label, "discovery_body_outside_item", "Legacy Discovery prose must remain inside exact items.");
    for (let index = 0; index < matches.length; index += 1) {
      const match = matches[index];
      const itemBody = block.slice(match.index + match[0].length, matches[index + 1]?.index ?? block.length).trim();
      const shape = itemBody.match(/^- Human authority: (required|not_required|unclear)\n\n```json\n([^\n]+)\n```$/);
      if (!shape) throw new MarkdownError("markdown.parse_invalid", label, "discovery_shape_invalid", "Legacy Discovery requires the exact rendered item shape.");
      let title; let body;
      try { title = JSON.parse(match[2]); body = JSON.parse(shape[2]); } catch { throw new MarkdownError("markdown.parse_invalid", label, "discovery_json_invalid", "Legacy Discovery title/body JSON is invalid."); }
      items.push({ source_index: items.length, display_label: match[1], category: CATEGORY[categoryName], title: requiredString(title, `${label}.${match[1]}.title`, 512), body: requiredString(body, `${label}.${match[1]}.body`), human_authority: shape[1] });
    }
  }
  if (!items.length) throw new MarkdownError("markdown.parse_invalid", label, "discovery_items_required", "At least one legacy Discovery candidate is required.");
  return items;
}

function legacyFrameCandidate(bytes, label) {
  const { fields, body } = parseFrontmatter(bytes, label);
  exactKeys(fields, new Set(["type", "schema_version", "id", "home_namespace_id", "authority_scope_namespace_ids", "status", "title"]), "frontmatter");
  if (fields.type !== "frame" || fields.schema_version !== 1) throw new MarkdownError("markdown.parse_invalid", label, "frame_schema_incompatible", "The legacy Frame schema is incompatible.");
  const headings = ["Outcome", "Included Scope", "Excluded Scope", "Limitations", "Completion Condition", "Discovery", "Case Dispositions"];
  const map = sections(body, label, headings, { required: ["Discovery"] });
  if (map.get("Discovery") !== "See the manifest-selected Discovery file.") throw new MarkdownError("markdown.parse_invalid", `${label}.Discovery`, "discovery_reference_invalid", "The Frame must retain the exact selected Discovery reference.");
  const record = {
    id: requiredId(fields.id, `${label}.id`, "frame"),
    home_namespace_id: requiredId(fields.home_namespace_id, `${label}.home_namespace_id`, "namespace"),
    authority_scope_namespace_ids: fields.authority_scope_namespace_ids,
    status: fields.status,
  };
  if (!FRAME_STATUSES.has(record.status)) throw new MarkdownError("markdown.parse_invalid", `${label}.status`, "frame_status_invalid", "The legacy Frame status is invalid.");
  if (!Array.isArray(record.authority_scope_namespace_ids) || record.authority_scope_namespace_ids.length !== 1 || record.authority_scope_namespace_ids[0] !== record.home_namespace_id) throw new MarkdownError("markdown.parse_invalid", `${label}.authority_scope_namespace_ids`, "cross_namespace_scope_unsupported", "Only the home namespace is supported.");
  if (fields.title != null) record.title = requiredString(fields.title, `${label}.title`, 512);
  for (const [key, heading] of [["outcome", "Outcome"], ["limitations", "Limitations"], ["completion_condition", "Completion Condition"]]) {
    const value = optionalSection(map, heading); if (value != null) record[key] = requiredString(value, `${label}.${key}`, 4_096);
  }
  for (const [key, heading] of [["included_scope", "Included Scope"], ["excluded_scope", "Excluded Scope"]]) {
    const value = optionalSection(map, heading);
    if (value != null) {
      if (!Array.isArray(value) || value.length > 64) throw new MarkdownError("markdown.parse_invalid", `${label}.${key}`, "bounded_string_array_required", "A bounded string array is required.");
      record[key] = value.map((item, index) => requiredString(item, `${label}.${key}[${index}]`, 4_096));
    }
  }
  return { record, ...parseDispositionSection(map, label) };
}

async function loadLegacyFrame(ownerState, frameId) {
  const frameBytes = await readOwnedRegular(ownerState.owner, "frame.md", `${ownerState.relative}/frame.md`);
  if (frameBytes == null) throw new MarkdownError("frame.not_found_or_not_visible", `${ownerState.relative}/frame.md`, "frame_document_missing", "The legacy Frame document is missing.");
  const discoveryNames = [];
  for (const filename of ["discovery.md", "discovery-map.md"]) if (await readOwnedRegular(ownerState.owner, filename, `${ownerState.relative}/${filename}`) != null) discoveryNames.push(filename);
  if (discoveryNames.length !== 1) throw new MarkdownError("markdown.identity_ambiguous", ownerState.relative, "single_legacy_discovery_authority_required", "Legacy Frame authority requires exactly one Discovery filename.");
  const selectedDiscoveryFilename = discoveryNames[0];
  const discoveryBytes = await readOwnedRegular(ownerState.owner, selectedDiscoveryFilename, `${ownerState.relative}/${selectedDiscoveryFilename}`);
  const parsedFrame = legacyFrameCandidate(frameBytes, `${ownerState.relative}/frame.md`);
  if (parsedFrame.record.id !== frameId) throw new MarkdownError("frame.identity_conflict", `${ownerState.relative}/frame.md`, "frame_identity_mismatch", "The legacy Frame identity differs from the requested stable identity.");
  const discovery = legacyDiscoveryCandidates(discoveryBytes, `${ownerState.relative}/${selectedDiscoveryFilename}`);
  const documents = { "frame.md": sha256(frameBytes), [selectedDiscoveryFilename]: sha256(discoveryBytes) };
  const dispositionBoundaries = (parsedFrame.disposition_boundaries ?? []).map(({ id, version_id }) => ({ id, version_id }));
  const caseDispositions = (parsedFrame.case_dispositions ?? []).map(({ id, version_id }) => ({ id, version_id }));
  const aggregateDigest = frameAggregateDigest({ frameId, selectedDiscoveryFilename, documents, dispositionBoundaries, caseDispositions });
  return { kind: "legacy", ...ownerState, frameBytes, discoveryBytes, selectedDiscoveryFilename, parsedFrame, discovery, documents, dispositionBoundaries, caseDispositions, aggregateDigest };
}

function validateGenerationManifest(manifest, frameId) {
  if (!object(manifest)) throw new MarkdownError("markdown.manifest_incompatible", FRAME_SELECTOR, "generation_manifest_object_required", "The selected Frame generation manifest must be an object.");
  exactKeys(manifest, new Set([
    "schema", "frame_id", "previous_aggregate_digest", "aggregate_digest", "generation_directory", "selected_discovery_filename",
    "documents", "discovery_items", "disposition_boundaries", "case_dispositions",
  ]), "frame_generation_manifest");
  if (manifest.schema !== FRAME_GENERATION_SCHEMA || manifest.frame_id !== frameId || !DIGEST.test(manifest.aggregate_digest)
    || !DIGEST.test(manifest.previous_aggregate_digest) || !["discovery.md", "discovery-map.md"].includes(manifest.selected_discovery_filename)
    || manifest.generation_directory !== `${FRAME_GENERATION_PREFIX}${manifest.aggregate_digest}`) {
    throw new MarkdownError("markdown.manifest_incompatible", FRAME_SELECTOR, "generation_manifest_identity_invalid", "The selected Frame generation identity is invalid.");
  }
  if (!object(manifest.documents) || Object.keys(manifest.documents).length !== 2
    || !DIGEST.test(manifest.documents["frame.md"])
    || !DIGEST.test(manifest.documents[manifest.selected_discovery_filename])) throw new MarkdownError("markdown.manifest_incompatible", FRAME_SELECTOR, "generation_documents_invalid", "The generation manifest must bind frame.md and exactly one selected Discovery file.");
  for (const key of ["discovery_items", "disposition_boundaries", "case_dispositions"]) if (!Array.isArray(manifest[key])) throw new MarkdownError("markdown.manifest_incompatible", FRAME_SELECTOR, "generation_identity_bindings_invalid", "Generation identity bindings must be arrays.");
  const calculated = frameAggregateDigest({
    frameId,
    selectedDiscoveryFilename: manifest.selected_discovery_filename,
    documents: manifest.documents,
    discoveryItems: manifest.discovery_items,
    dispositionBoundaries: manifest.disposition_boundaries,
    caseDispositions: manifest.case_dispositions,
  });
  if (calculated !== manifest.aggregate_digest) throw new MarkdownError("markdown.manifest_incompatible", FRAME_SELECTOR, "aggregate_digest_mismatch", "The selected Frame aggregate digest does not match its complete manifest bindings.");
  return manifest;
}

async function validateGenerationDirectory(ownerState, manifest, directory = path.join(ownerState.owner, manifest.generation_directory)) {
  const entry = await lstat(directory).catch(() => null);
  if (!entry || entry.isSymbolicLink() || !entry.isDirectory() || await realpath(directory) !== directory) throw new MarkdownError("markdown.path_invalid", manifest.generation_directory, "real_generation_directory_required", "The selected generation directory must be real and unchanged.");
  assertWithinRoot(ownerState.root, directory, manifest.generation_directory);
  const expectedNames = ["frame.md", manifest.selected_discovery_filename, FRAME_GENERATION_MANIFEST].sort();
  if (!isDeepStrictEqual((await readdir(directory)).sort(), expectedNames)) throw new MarkdownError("markdown.manifest_incompatible", manifest.generation_directory, "exact_generation_files_required", "A generation must contain frame.md, exactly one selected Discovery filename, and its owner manifest.");
  const frameBytes = await readOwnedRegular(directory, "frame.md", `${manifest.generation_directory}/frame.md`);
  const discoveryBytes = await readOwnedRegular(directory, manifest.selected_discovery_filename, `${manifest.generation_directory}/${manifest.selected_discovery_filename}`);
  const internalManifestBytes = await readOwnedRegular(directory, FRAME_GENERATION_MANIFEST, `${manifest.generation_directory}/${FRAME_GENERATION_MANIFEST}`);
  if (sha256(frameBytes) !== manifest.documents["frame.md"] || sha256(discoveryBytes) !== manifest.documents[manifest.selected_discovery_filename]
    || internalManifestBytes !== canonicalJson(manifest)) throw new MarkdownError("markdown.manifest_incompatible", manifest.generation_directory, "generation_content_binding_mismatch", "The generation bytes do not match the selected aggregate manifest.");
  const record = parseFrame(frameBytes, discoveryBytes, {
    id: manifest.frame_id,
    frame_path: `${manifest.generation_directory}/frame.md`,
    discovery_path: `${manifest.generation_directory}/${manifest.selected_discovery_filename}`,
    discovery_items: manifest.discovery_items,
  });
  const boundaryBindings = record.disposition_boundaries.map(({ id, version_id }) => ({ id, version_id }));
  const dispositionBindings = record.case_dispositions.map(({ id, version_id }) => ({ id, version_id }));
  if (!isDeepStrictEqual(boundaryBindings, manifest.disposition_boundaries) || !isDeepStrictEqual(dispositionBindings, manifest.case_dispositions)) throw new MarkdownError("markdown.manifest_incompatible", manifest.generation_directory, "disposition_identity_binding_mismatch", "Manifest disposition bindings must exactly match strict Frame content.");
  return { record, frameBytes, discoveryBytes, directory };
}

async function loadSelectedFrame(ownerState) {
  const selectorBytes = await readOwnedRegular(ownerState.owner, FRAME_SELECTOR, `${ownerState.relative}/${FRAME_SELECTOR}`);
  if (selectorBytes == null) return loadLegacyFrame(ownerState, ownerState.frameId);
  let manifest;
  try { manifest = JSON.parse(selectorBytes); } catch { throw new MarkdownError("markdown.manifest_incompatible", FRAME_SELECTOR, "generation_manifest_json_invalid", "The selected Frame generation manifest is invalid JSON."); }
  if (selectorBytes !== canonicalJson(manifest)) throw new MarkdownError("markdown.manifest_incompatible", FRAME_SELECTOR, "canonical_generation_manifest_required", "The selected generation manifest must use canonical JSON bytes.");
  validateGenerationManifest(manifest, ownerState.frameId);
  const selected = await validateGenerationDirectory(ownerState, manifest);
  return { kind: "generation", ...ownerState, selectorBytes, manifest, aggregateDigest: manifest.aggregate_digest, selectedDiscoveryFilename: manifest.selected_discovery_filename, ...selected };
}

async function loadFileAuthorityFrame(request, frameId) {
  const authority = await loadAuthorityWorkspace(request);
  if (authority.marker.profile !== FILE_AUTHORITY_PROFILE || authority.marker.interchange_manifest_sha256 != null) throw new MarkdownError("markdown.workspace_unavailable", WORKSPACE_MARKER, "file_authority_profile_required", "Coherent Frame generation requires the selected file-authoritative Markdown profile.");
  const ownerState = await loadFrameOwner(authority, frameId);
  ownerState.frameId = frameId;
  return loadSelectedFrame(ownerState);
}

async function attributableGeneration(ownerState, name) {
  if (!new RegExp(`^${FRAME_GENERATION_PREFIX}[0-9a-f]{64}$`).test(name)) return false;
  const bytes = await readOwnedRegular(path.join(ownerState.owner, name), FRAME_GENERATION_MANIFEST, `${name}/${FRAME_GENERATION_MANIFEST}`).catch(() => null);
  if (bytes == null) return false;
  try {
    const manifest = JSON.parse(bytes);
    validateGenerationManifest(manifest, ownerState.frameId);
    return manifest.generation_directory === name && bytes === canonicalJson(manifest);
  } catch { return false; }
}

async function cleanupFrameDebris(ownerState, selectedGeneration) {
  const removed = [];
  const key = ownerState.frameId.slice(ownerState.frameId.indexOf(":") + 1);
  for (const name of await readdir(ownerState.owner)) {
    const stageOwned = name.startsWith(`${FRAME_STAGE_PREFIX}${key}-`) || name.startsWith(`${FRAME_SELECTOR_STAGE_PREFIX}${key}-`);
    const generationOwned = name !== selectedGeneration && await attributableGeneration(ownerState, name);
    if (!stageOwned && !generationOwned) continue;
    await rm(path.join(ownerState.owner, name), { recursive: true, force: true });
    removed.push(name);
  }
  if (removed.length) await syncDirectoryAsAvailable(ownerState.owner);
  return removed.sort();
}

async function writeFlushedFile(filename, content) {
  const handle = await open(filename, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
  try { await handle.writeFile(content, "utf8"); await handle.sync(); } finally { await handle.close(); }
}

async function currentFrameDigest(ownerState) {
  return (await loadSelectedFrame(ownerState)).aggregateDigest;
}

async function commitFileAuthorityFrame(request) {
  validateBase(request, ["operation_id", "expected_digest", "commit_basis", "provenance", "frame_id", "frame"]);
  requiredString(request.operation_id, "operation_id", 256);
  const frameId = requiredId(request.frame_id, "frame_id", "frame");
  if (!DIGEST.test(request.expected_digest)) throw new MarkdownError("frame.invalid_representation", "expected_digest", "sha256_required", "A lowercase SHA-256 expected aggregate digest is required.");
  requiredString(request.commit_basis, "commit_basis", 2_048); validateProvenance(request.provenance);
  let record;
  try { record = normalizeFrame(request.frame, { requireDispositions: true }); }
  catch (error) {
    if (!(error instanceof MarkdownError) || error.code === "frame.invalid_representation") throw error;
    throw new MarkdownError("frame.invalid_representation", error.pathName, error.rule, "The complete Frame aggregate representation is structurally invalid.");
  }
  if (record.id !== frameId) throw new MarkdownError("frame.identity_conflict", "frame.id", "frame_identity_mismatch", "The complete Frame identity differs from frame_id.");
  const authority = await loadAuthorityWorkspace(request);
  if (authority.marker.profile !== FILE_AUTHORITY_PROFILE || authority.marker.interchange_manifest_sha256 != null) throw new MarkdownError("markdown.workspace_unavailable", WORKSPACE_MARKER, "file_authority_profile_required", "Coherent Frame generation requires the selected file-authoritative Markdown profile.");
  const ownerState = await loadFrameOwner(authority, frameId); ownerState.frameId = frameId;
  let current = await loadSelectedFrame(ownerState);
  await cleanupFrameDebris(ownerState, current.kind === "generation" ? current.manifest.generation_directory : null);
  current = await loadSelectedFrame(ownerState);
  if (current.aggregateDigest !== request.expected_digest) return failure("frame.digest_conflict", "The selected Frame aggregate changed; replacement did not merge or overwrite it.", {
    failureClass: "frame.mutation_conflict", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE,
    correctiveGuidance: "Read or prepare the current aggregate, reconcile explicitly, and retry with its exact digest.",
    evidence: { expected_digest: request.expected_digest, current_digest: current.aggregateDigest },
  });
  const rendered = renderInterchange([{ kind: "frame", id: frameId, record }], { discoveryFilenameByFrame: { [frameId]: current.selectedDiscoveryFilename } });
  const renderedRecord = rendered.manifest.records[0];
  const documents = Object.fromEntries(rendered.files.map((file) => [path.basename(file.path), file.sha256]));
  const dispositionBoundaries = record.disposition_boundaries.map(({ id, version_id }) => ({ id, version_id }));
  const caseDispositions = record.case_dispositions.map(({ id, version_id }) => ({ id, version_id }));
  const aggregateDigest = frameAggregateDigest({
    frameId, selectedDiscoveryFilename: current.selectedDiscoveryFilename, documents,
    discoveryItems: renderedRecord.discovery_items, dispositionBoundaries, caseDispositions,
  });
  const generationDirectory = `${FRAME_GENERATION_PREFIX}${aggregateDigest}`;
  if (current.kind === "generation" && aggregateDigest === current.aggregateDigest) {
    const removed = await cleanupFrameDebris(ownerState, current.manifest.generation_directory);
    return success("frame.commit_revision", {
      status: "settled", frame: record, previous_aggregate_digest: request.expected_digest, current_aggregate_digest: aggregateDigest,
      persistence: {
        authority_mode: "markdown", aggregate_digest: aggregateDigest, owner_manifest: `${ownerState.relative}/${FRAME_SELECTOR}`,
        selected_generation: generationDirectory, selected_discovery_filename: current.selectedDiscoveryFilename,
        selection: "already_selected_complete_generation", stage_flush: "not_required", directory_flush: "not_required",
        interruption_debris: { owner: "casebook-persistence", stage_prefix: `${FRAME_STAGE_PREFIX}${frameId.slice(frameId.indexOf(":") + 1)}-`, generation_prefix: FRAME_GENERATION_PREFIX, cleaned: removed },
      },
      limitations: ["no_owner_revision_history", "no_durable_receipt", "one_trusted_logical_writer", "no_auto_merge", "case_revision_visibility_not_verified_in_file_mode"],
      applied_view: authority.appliedView,
    });
  }
  const manifest = {
    schema: FRAME_GENERATION_SCHEMA, frame_id: frameId, previous_aggregate_digest: current.aggregateDigest,
    aggregate_digest: aggregateDigest, generation_directory: generationDirectory,
    selected_discovery_filename: current.selectedDiscoveryFilename, documents,
    discovery_items: renderedRecord.discovery_items, disposition_boundaries: dispositionBoundaries, case_dispositions: caseDispositions,
  };
  validateGenerationManifest(manifest, frameId);
  const key = frameId.slice(frameId.indexOf(":") + 1); const nonce = `${process.pid}-${randomBytes(8).toString("hex")}`;
  const stageName = `${FRAME_STAGE_PREFIX}${key}-${nonce}.tmp`; const stagePath = path.join(ownerState.owner, stageName);
  const finalPath = path.join(ownerState.owner, generationDirectory);
  const selectorStageName = `${FRAME_SELECTOR_STAGE_PREFIX}${key}-${nonce}.tmp`; const selectorStagePath = path.join(ownerState.owner, selectorStageName);
  let published = false; let selected = false;
  try {
    await mkdir(stagePath, { mode: 0o700 });
    for (const file of rendered.files) await writeFlushedFile(path.join(stagePath, path.basename(file.path)), file.content);
    await writeFlushedFile(path.join(stagePath, FRAME_GENERATION_MANIFEST), canonicalJson(manifest));
    await syncDirectoryAsAvailable(stagePath);
    if (authority.configuration.source.kind === "synthetic-test" && process.env.CASEBOOK_MARKDOWN_TEST_FAULT === "corrupt_staged_frame") await writeFile(path.join(stagePath, "frame.md"), "invalid staged Frame\n");
    const staged = await validateGenerationDirectory(ownerState, manifest, stagePath);
    if (!isDeepStrictEqual(staged.record, record)) throw new MarkdownError("frame.invalid_representation", "frame", "staged_round_trip_mismatch", "The flushed Frame generation did not round-trip as the complete requested owner state.");
    if (authority.configuration.source.kind === "synthetic-test" && process.env.CASEBOOK_MARKDOWN_TEST_FAULT === "stop_after_frame_stage_flush") process.kill(process.pid, "SIGSTOP");
    await rename(stagePath, finalPath); published = true; await syncDirectoryAsAvailable(ownerState.owner);
    if (authority.configuration.source.kind === "synthetic-test" && process.env.CASEBOOK_MARKDOWN_TEST_FAULT === "stop_after_frame_generation_publish") process.kill(process.pid, "SIGSTOP");
    await writeFlushedFile(selectorStagePath, canonicalJson(manifest));
    const selectorCandidate = JSON.parse(await readOwnedRegular(ownerState.owner, selectorStageName, selectorStageName));
    validateGenerationManifest(selectorCandidate, frameId);
    if ((await currentFrameDigest(ownerState)) !== request.expected_digest) return failure("frame.digest_conflict", "The selected Frame aggregate changed while replacement was staged; no merge or overwrite occurred.", {
      failureClass: "frame.mutation_conflict", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE,
      evidence: { expected_digest: request.expected_digest, current_digest: await currentFrameDigest(ownerState) },
    });
    await rename(selectorStagePath, path.join(ownerState.owner, FRAME_SELECTOR)); selected = true; await syncDirectoryAsAvailable(ownerState.owner);
    const removed = await cleanupFrameDebris(ownerState, generationDirectory);
    return success("frame.commit_revision", {
      status: "settled", frame: record, previous_aggregate_digest: request.expected_digest, current_aggregate_digest: aggregateDigest,
      persistence: {
        authority_mode: "markdown", aggregate_digest: aggregateDigest, owner_manifest: `${ownerState.relative}/${FRAME_SELECTOR}`,
        selected_generation: generationDirectory, selected_discovery_filename: current.selectedDiscoveryFilename,
        selection: "same_directory_atomic_manifest_rename", stage_flush: "fsync", directory_flush: "fsync_as_available",
        interruption_debris: { owner: "casebook-persistence", stage_prefix: `${FRAME_STAGE_PREFIX}${key}-`, generation_prefix: FRAME_GENERATION_PREFIX, cleaned: removed },
      },
      limitations: ["no_owner_revision_history", "no_durable_receipt", "one_trusted_logical_writer", "no_auto_merge", "case_revision_visibility_not_verified_in_file_mode"],
      applied_view: authority.appliedView,
    });
  } finally {
    await rm(stagePath, { recursive: true, force: true });
    await rm(selectorStagePath, { force: true });
    if (published && !selected) await rm(finalPath, { recursive: true, force: true });
  }
}

async function prepareFileAuthorityFrameReconciliation(request) {
  validateBase(request, ["frame_id"]); const frameId = requiredId(request.frame_id, "frame_id", "frame");
  const selected = await loadFileAuthorityFrame(request, frameId);
  const generation = selected.kind === "generation";
  const parsedFrame = generation ? selected.record : selected.parsedFrame.record;
  const discovery = generation ? selected.record.discovery : selected.discovery;
  const boundaries = generation ? selected.record.disposition_boundaries : (selected.parsedFrame.disposition_boundaries ?? []);
  const dispositions = generation ? selected.record.case_dispositions : (selected.parsedFrame.case_dispositions ?? []);
  const absent = !generation && selected.parsedFrame.disposition_state === "absent_in_legacy";
  const boundaryCandidates = boundaries.map((item, index) => generation
    ? { source_index: index, source_label: `DB-${String(index + 1).padStart(3, "0")}`, match: "exact", disposition_boundary_id: item.id, disposition_boundary_version_id: item.version_id }
    : { source_index: index, source_label: `DB-${String(index + 1).padStart(3, "0")}`, match: "unmatched", candidate_disposition_boundary_ids: [] });
  const dispositionCandidates = dispositions.map((item, index) => generation
    ? { source_index: index, source_label: `CD-${String(index + 1).padStart(3, "0")}`, match: "exact", case_disposition_id: item.id, case_disposition_version_id: item.version_id }
    : { source_index: index, source_label: `CD-${String(index + 1).padStart(3, "0")}`, match: "unmatched", candidate_case_disposition_ids: [] });
  return success("frame.legacy.prepare_reconciliation", {
    status: "prepared", frame_id: frameId, selected_discovery_filename: selected.selectedDiscoveryFilename,
    aggregate_digest: selected.aggregateDigest, absent_in_legacy: absent,
    legacy_disposition_state: absent ? "absent_in_legacy" : "present", requires_semantic_reconcile: true,
    completion_inferred: false, no_case_inferred: false, violations: [],
    parsed: { frame: parsedFrame, discovery, disposition_boundaries: boundaries, case_dispositions: dispositions },
    structural_diff: { additions: generation ? [] : [...boundaryCandidates, ...dispositionCandidates], changes: [], removals: [] },
    disposition_boundary_candidates: boundaryCandidates, case_disposition_candidates: dispositionCandidates,
    mutation_performed: false, watch_started: false, rename_performed: false, writeback_performed: false,
    applied_view: selected.appliedView,
  });
}

async function createFileAuthorityFrame(authority, record) {
  if (record.disposition_boundaries == null || record.case_dispositions == null) throw new MarkdownError("frame.invalid_representation", "frame.disposition_boundaries", "complete_disposition_sets_required", "New file-authoritative Frames require explicit complete disposition sets, including empty arrays.");
  const relative = frameOwnerRelativePath(record.id);
  const finalOwner = path.join(authority.root, relative);
  await secureWriteParent(authority.root, `${path.dirname(relative)}/.casebook-create-parent`, relative);
  if (await lstat(finalOwner).catch(() => null)) return { failure: failure("frame.create_identity_exists", "The Frame identity already exists in the selected Markdown authority.", { failureClass: "frame.mutation_conflict", evidence: {} }) };
  const rendered = renderInterchange([{ kind: "frame", id: record.id, record }]);
  const renderedRecord = rendered.manifest.records[0];
  const documents = Object.fromEntries(rendered.files.map((file) => [path.basename(file.path), file.sha256]));
  const dispositionBoundaries = record.disposition_boundaries.map(({ id, version_id }) => ({ id, version_id }));
  const caseDispositions = record.case_dispositions.map(({ id, version_id }) => ({ id, version_id }));
  const aggregateDigest = frameAggregateDigest({ frameId: record.id, selectedDiscoveryFilename: "discovery.md", documents, discoveryItems: renderedRecord.discovery_items, dispositionBoundaries, caseDispositions });
  const generationDirectory = `${FRAME_GENERATION_PREFIX}${aggregateDigest}`;
  const manifest = {
    schema: FRAME_GENERATION_SCHEMA, frame_id: record.id, previous_aggregate_digest: "0".repeat(64), aggregate_digest: aggregateDigest,
    generation_directory: generationDirectory, selected_discovery_filename: "discovery.md", documents,
    discovery_items: renderedRecord.discovery_items, disposition_boundaries: dispositionBoundaries, case_dispositions: caseDispositions,
  };
  validateGenerationManifest(manifest, record.id);
  const parent = path.dirname(finalOwner); const key = record.id.slice(6);
  const stageOwner = path.join(parent, `${FRAME_STAGE_PREFIX}${key}-${process.pid}-${randomBytes(8).toString("hex")}.tmp`);
  try {
    const generation = path.join(stageOwner, generationDirectory);
    await mkdir(generation, { recursive: true, mode: 0o700 });
    for (const file of rendered.files) await writeFlushedFile(path.join(generation, path.basename(file.path)), file.content);
    await writeFlushedFile(path.join(generation, FRAME_GENERATION_MANIFEST), canonicalJson(manifest));
    await writeFlushedFile(path.join(stageOwner, FRAME_SELECTOR), canonicalJson(manifest));
    await syncDirectoryAsAvailable(generation); await syncDirectoryAsAvailable(stageOwner);
    const ownerState = { ...authority, owner: stageOwner, root: authority.root, relative, frameId: record.id };
    const selected = await loadSelectedFrame(ownerState);
    if (selected.kind !== "generation" || !isDeepStrictEqual(selected.record, record)) throw new MarkdownError("frame.invalid_representation", "frame", "staged_round_trip_mismatch", "The staged Frame generation did not round-trip completely.");
    try { await rename(stageOwner, finalOwner); } catch (error) {
      if (["EEXIST", "ENOTEMPTY"].includes(error.code)) return { failure: failure("frame.create_identity_exists", "The Frame identity already exists in the selected Markdown authority.", { failureClass: "frame.mutation_conflict", evidence: {} }) };
      throw error;
    }
    await syncDirectoryAsAvailable(parent);
    return { digest: aggregateDigest, files: rendered.files.map((file) => file.path), generationDirectory };
  } finally { await rm(stageOwner, { recursive: true, force: true }); }
}

async function createFrame(request) {
  validateBase(request, ["operation_id", "expected_revision", "commit_basis", "provenance", "frame"]);
  requiredString(request.operation_id, "operation_id", 256);
  if (request.expected_revision !== 0) throw new MarkdownError("frame.invalid_representation", "expected_revision", "create_requires_absent_revision", "Frame create requires expected revision 0.");
  requiredString(request.commit_basis, "commit_basis", 2_048);
  validateProvenance(request.provenance);
  const record = normalizeFrame(request.frame);
  const authority = await loadAuthorityWorkspace(request);
  if (authority.marker.profile === FILE_AUTHORITY_PROFILE) {
    const persisted = await createFileAuthorityFrame(authority, record);
    if (persisted.failure) return persisted.failure;
    return success("frame.create", { status: "settled", frame: record, persistence: { authority_mode: "markdown", aggregate_digest: persisted.digest, selected_files: persisted.files, selected_generation: persisted.generationDirectory, selection: "atomic_owner_directory_rename" }, capabilities: capabilities(), limitations: ["no_owner_revision_history", "no_durable_receipt", "one_trusted_logical_writer"] });
  }
  const workspace = await loadWorkspace(request, { allowEmpty: true });
  const persisted = await persistCreate(workspace, "frame", record);
  if (persisted.failure) return persisted.failure;
  return success("frame.create", { status: "settled", frame: record, persistence: { authority_mode: "markdown", aggregate_digest: persisted.digest, selected_files: persisted.files }, capabilities: capabilities(), limitations: ["l01_synthetic_interchange_only", "no_durable_receipt_revision_history_or_atomic_frame_replacement"] });
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
        capabilities: capabilities(),
        limitations: ["no_owner_revision_history", "no_durable_receipt", "one_trusted_logical_writer"],
        applied_view: workspace.appliedView,
      });
    }
  }
  if (kind === "frame") {
    const authority = await loadAuthorityWorkspace(request);
    if (authority.marker.profile === FILE_AUTHORITY_PROFILE) {
      const workspace = await loadFileAuthorityFrame(request, id);
      if (workspace.kind !== "generation") return failure("frame.requires_semantic_reconcile", "The legacy Frame has no manifest-selected complete generation.", {
        failureClass: "frame.read_failure", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE,
        correctiveGuidance: "Prepare non-mutating legacy reconciliation and commit one explicit complete Frame generation.",
        evidence: { aggregate_digest: workspace.aggregateDigest, selected_discovery_filename: workspace.selectedDiscoveryFilename, absent_in_legacy: workspace.parsedFrame.disposition_state === "absent_in_legacy", requires_semantic_reconcile: true },
      });
      return success("frame.read", {
        status: "found", frame: workspace.record,
        persistence: { authority_mode: "markdown", aggregate_digest: workspace.aggregateDigest, selected_generation: workspace.manifest.generation_directory, selected_discovery_filename: workspace.selectedDiscoveryFilename },
        capabilities: capabilities(), limitations: ["no_owner_revision_history", "no_durable_receipt", "one_trusted_logical_writer"], applied_view: workspace.appliedView,
      });
    }
  }
  const workspace = await loadWorkspace(request);
  const records = await parseRecords(workspace);
  const found = records.find((item) => item.owner_kind === kind && item.id === id);
  if (!found) return failure(`${kind}.not_found_or_not_visible`, `The ${kind} is unknown or not visible under the exact selected Markdown workspace.`, { failureClass: `${kind}.read_failure`, evidence: {} });
  return success(`${kind}.read`, { status: "found", [kind]: found.record, persistence: { authority_mode: "markdown", manifest_digest: sha256(workspace.manifestBytes) }, capabilities: capabilities(), applied_view: workspace.appliedView });
}

async function fileAuthorityRecords(authority, kinds = ["case", "frame"]) {
  const records = [];
  if (kinds.includes("case")) {
    const casesDirectory = path.join(authority.root, "cases");
    const entry = await lstat(casesDirectory).catch(() => null);
    if (entry) {
      if (entry.isSymbolicLink() || !entry.isDirectory() || await realpath(casesDirectory) !== casesDirectory) throw new MarkdownError("markdown.path_invalid", "cases", "real_owner_directory_required", "The Case owner directory must be real and unchanged.");
      for (const item of await readdir(casesDirectory, { withFileTypes: true })) {
        if (item.name.startsWith(CASE_STAGE_PREFIX) || item.name.startsWith(".")) continue;
        const match = item.name.match(new RegExp(`^(${UUID})\\.md$`));
        if (!match || !item.isFile()) throw new MarkdownError("markdown.index_invalid", `cases/${item.name}`, "canonical_owner_entry_required", "File-authoritative owner scans fail closed on non-canonical entries.");
        const id = `case:${match[1]}`; const relativePath = `cases/${item.name}`;
        const selected = await readRegularNoFollow(authority.root, relativePath, relativePath);
        records.push({ owner_kind: "case", id, record: parseCase(selected.bytes, { id, path: relativePath }), persistence_digest: selected.digest });
      }
    }
  }
  if (kinds.includes("frame")) {
    const framesDirectory = path.join(authority.root, "frames");
    const entry = await lstat(framesDirectory).catch(() => null);
    if (entry) {
      if (entry.isSymbolicLink() || !entry.isDirectory() || await realpath(framesDirectory) !== framesDirectory) throw new MarkdownError("markdown.path_invalid", "frames", "real_owner_directory_required", "The Frame owner directory must be real and unchanged.");
      for (const item of await readdir(framesDirectory, { withFileTypes: true })) {
        if (item.name.startsWith(FRAME_STAGE_PREFIX) || item.name.startsWith(".")) continue;
        if (!new RegExp(`^${UUID}$`).test(item.name) || !item.isDirectory()) throw new MarkdownError("markdown.index_invalid", `frames/${item.name}`, "canonical_owner_entry_required", "File-authoritative owner scans fail closed on non-canonical entries.");
        const id = `frame:${item.name}`; const ownerState = await loadFrameOwner(authority, id); ownerState.frameId = id;
        const selected = await loadSelectedFrame(ownerState);
        if (selected.kind !== "generation") throw new MarkdownError("frame.requires_semantic_reconcile", ownerState.relative, "selected_generation_required", "A legacy Frame must be explicitly reconciled before common queries can expose it.", { aggregate_digest: selected.aggregateDigest });
        records.push({ owner_kind: "frame", id, record: selected.record, persistence_digest: selected.aggregateDigest });
      }
    }
  }
  if (records.length > MAX_RECORDS) throw new MarkdownError("common.bound_exceeded", "workspace", "maximum_owner_scan_exceeded", "The bounded Markdown owner scan was exceeded.", { maximum_owner_scan: MAX_RECORDS });
  records.sort((left, right) => left.owner_kind.localeCompare(right.owner_kind) || left.id.localeCompare(right.id));
  const manifestBytes = canonicalJson(records.map(({ owner_kind, id, persistence_digest }) => ({ owner_kind, id, persistence_digest })));
  return { ...authority, manifestBytes, records };
}

async function commonWorkspace(request, kinds = ["case", "frame"]) {
  const authority = await loadAuthorityWorkspace(request);
  if (authority.marker.profile === FILE_AUTHORITY_PROFILE) return fileAuthorityRecords(authority, kinds);
  const workspace = await loadWorkspace(request);
  return { ...workspace, records: await parseRecords(workspace) };
}

async function frameList(request) {
  validateBase(request, []);
  const workspace = await commonWorkspace(request, ["frame"]);
  const records = workspace.records.filter((item) => item.owner_kind === "frame");
  return success("frame.list", {
    ...commonResult(workspace, records.map((item) => ({ id: item.id, ...item.record })), "owner_id_asc"),
    applied_lifecycle_scope: "active_only", capabilities: capabilities(),
  });
}

async function commonResolve(request) {
  validateBase(request, ["owner_id"]);
  requiredString(request.owner_id, "owner_id", 128);
  if (!OWNER_ID.test(request.owner_id)) throw new MarkdownError("markdown.identity_unverified", "owner_id", "stable_owner_identity_required", "A stable Case or Frame ID is required.");
  const workspace = await commonWorkspace(request, [request.owner_id.slice(0, request.owner_id.indexOf(":"))]);
  const item = workspace.records.find((candidate) => candidate.id === request.owner_id);
  if (!item) return failure("common.not_found_or_not_visible", "The owner is unknown or not visible under the exact selected Markdown workspace.", { failureClass: "common.read_failure", evidence: {} });
  return success("common.resolve", { status: "found", item: publicItem(item), index_state: "current", result_completeness: "complete_within_bounds", capabilities: capabilities(), applied_view: workspace.appliedView });
}

async function commonList(request) {
  validateBase(request, ["owner_kinds"]);
  const kinds = ownerKinds(request.owner_kinds);
  const workspace = await commonWorkspace(request, kinds);
  const records = workspace.records.filter((item) => kinds.includes(item.owner_kind)).map(publicItem);
  return success("common.list", commonResult(workspace, records, "owner_kind_asc_id_asc"));
}

async function commonSearch(request) {
  validateBase(request, ["owner_kinds", "query", "limit"]);
  const kinds = ownerKinds(request.owner_kinds);
  const tokens = queryTokens(request.query);
  if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > MAX_SEARCH_LIMIT) {
    throw new MarkdownError("markdown.invalid_request", "limit", "bounded_search_limit_required", "Search limit must be 1 through 50.");
  }
  const workspace = await commonWorkspace(request, kinds);
  const matches = workspace.records.filter((item) => kinds.includes(item.owner_kind)).map((item) => match(publicItem(item), tokens)).filter(Boolean);
  matches.sort((left, right) => right.lexical_score - left.lexical_score || left.owner_kind.localeCompare(right.owner_kind) || left.id.localeCompare(right.id));
  const completeness = matches.length > request.limit ? "truncated" : "complete_within_bounds";
  return success("common.search", {
    ...commonResult(workspace, matches.slice(0, request.limit), "lexical_score_desc_owner_kind_asc_id_asc", completeness),
    normalized_query_tokens: tokens,
    applied_limit: request.limit,
  });
}

async function exportInterchange(request) {
  validateBase(request, ["owner_ids"]);
  if (!Array.isArray(request.owner_ids) || request.owner_ids.length < 1 || request.owner_ids.length > MAX_RECORDS) throw new MarkdownError("common.invalid_request", "owner_ids", "bounded_owner_ids_required", "Export requires one bounded owner identity set.");
  const ids = request.owner_ids.map((ownerId, index) => {
    requiredString(ownerId, `owner_ids[${index}]`, 128);
    if (!OWNER_ID.test(ownerId)) throw new MarkdownError("common.invalid_request", `owner_ids[${index}]`, "stable_owner_identity_required", "Export owner IDs must be stable Case or Frame identities.");
    return ownerId;
  });
  if (new Set(ids).size !== ids.length) throw new MarkdownError("common.invalid_request", "owner_ids", "duplicate_owner_identity", "Export owner IDs must be unique.");
  ids.sort();
  const kinds = [...new Set(ids.map((id) => id.slice(0, id.indexOf(":"))))];
  const workspace = await commonWorkspace(request, kinds);
  const selected = [];
  for (const id of ids) {
    const item = workspace.records.find((candidate) => candidate.id === id);
    if (!item) return failure("common.not_found_or_not_visible", "An export owner is unknown or not visible under the selected Markdown authority.", { failureClass: "common.read_failure", evidence: {} });
    selected.push({ kind: item.owner_kind, id: item.id, record: item.record });
  }
  const rendered = renderInterchange(selected);
  return success("interchange.export", {
    status: "rendered", ...rendered, authority_selected: false, capabilities: capabilities(),
    applied_view: workspace.appliedView,
    limitations: ["logical_current_records_only", "no_history_events_receipts_checkpoints_snapshots_or_namespace_global_query_guarantee"],
  });
}

async function parseInterchange(request) {
  validateBase(request, []);
  const authority = await loadAuthorityWorkspace(request);
  const fileAuthority = authority.marker.profile === FILE_AUTHORITY_PROFILE;
  const workspace = fileAuthority ? await fileAuthorityRecords(authority) : await loadWorkspace(request);
  const records = fileAuthority ? workspace.records : await parseRecords(workspace);
  const requiresCaseReconcile = records.some((item) => item.owner_kind === "case");
  const selectedDiscoveryFilenames = fileAuthority
    ? await Promise.all(records.filter((item) => item.owner_kind === "frame").map(async (item) => {
        const selected = await loadFileAuthorityFrame(request, item.id);
        return { frame_id: item.id, filename: selected.selectedDiscoveryFilename };
      }))
    : workspace.manifest.records.filter((item) => item.kind === "frame").map((item) => ({ frame_id: item.id, filename: item.discovery_filename }));
  return success("interchange.parse", {
    status: "parsed",
    format: L01_INTERCHANGE_FORMAT,
    records: records.map((item) => ({ kind: item.owner_kind, id: item.id, record: item.record })),
    manifest_sha256: sha256(workspace.manifestBytes),
    identity_basis: fileAuthority ? "verified_frontmatter_and_selected_owner_generation" : "verified_frontmatter_and_manifest",
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
    selected_discovery_filenames: selectedDiscoveryFilenames,
    capabilities: capabilities(),
    limitations: fileAuthority ? ["current_selected_owner_state_only", "explicit_semantic_reconcile_required_before_import"] : ["l01_synthetic_interchange_only", "not_l05_markdown_authority_format"],
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

function markdownCapability(operation) {
  if (new Set(["case.history", "frame.history", "case.revision.read", "frame.revision.read"]).has(operation) || /revision/i.test(operation ?? "")) return "revisions";
  if (/receipt/i.test(operation ?? "")) return "durable_receipts";
  if (/checkpoint/i.test(operation ?? "")) return "checkpoints";
  if (/snapshot|backup|restore/i.test(operation ?? "")) return "snapshots";
  if (/event/i.test(operation ?? "")) return "events";
  if (new Set(["global.search", "case.traverse", "case.search", "case.resolve", "frame.resolve"]).has(operation)) return "namespace_global_queries";
  return null;
}

function unsupportedMarkdownCapability(operation, capability) {
  return failure("markdown.capability_unsupported", `Markdown authority does not provide the SQLite-only ${capability} capability or its guarantees.`, {
    failureClass: "capability_unavailable",
    correctiveGuidance: "Use only the declared reduced Markdown common subset, or perform a separately authorized migration to SQLite authority.",
    evidence: { authority_mode: "markdown", requested_operation: operation ?? null, capability, omitted_guarantees: [...OMITTED_CAPABILITIES], supported_common_operations: [...MARKDOWN_COMMON_OPERATIONS] },
  });
}

export async function invokeMarkdownOperation(request) {
  try {
    if (request.operation === "case.create") return await createCase(request);
    if (request.operation === "case.commit_revision") return await commitFileAuthorityCase(request);
    if (request.operation === "case.read") return await readOwner(request, "case");
    if (request.operation === "frame.create") return await createFrame(request);
    if (request.operation === "frame.commit_revision") return await commitFileAuthorityFrame(request);
    if (request.operation === "frame.read") return await readOwner(request, "frame");
    if (request.operation === "frame.legacy.prepare_reconciliation") return await prepareFileAuthorityFrameReconciliation(request);
    if (request.operation === "frame.list") return await frameList(request);
    if (request.operation === "common.resolve") return await commonResolve(request);
    if (request.operation === "common.list") return await commonList(request);
    if (request.operation === "common.search") return await commonSearch(request);
    if (request.operation === "interchange.export") return await exportInterchange(request);
    if (request.operation === "interchange.parse") return await parseInterchange(request);
    const capability = markdownCapability(request.operation);
    if (capability) return unsupportedMarkdownCapability(request.operation, capability);
    return unsupported(request.operation);
  } catch (error) {
    return asFailure(error);
  }
}
