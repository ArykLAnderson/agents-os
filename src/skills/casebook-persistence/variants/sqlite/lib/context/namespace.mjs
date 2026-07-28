const MAX_SEGMENTS = 8;
const SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID = /^namespace:([a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)$/;
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function fail(field, rule) {
  const error = new Error(rule);
  error.field = field;
  error.rule = rule;
  return error;
}

/**
 * Canonical Namespace identity. Namespace IDs are semantic, immutable
 * locators: namespace:<lowercase-kebab-segment>(/<segment>)*.
 * `namespace:root` is reserved for the structural store root.
 */
export function isNamespaceId(value) { return typeof value === "string" && ID.test(value) && value.slice("namespace:".length).split("/").every((part) => !UUID_SEGMENT.test(part)); }

export function requireNamespaceId(value, field = "namespace_id") {
  if (!isNamespaceId(value)) throw fail(field, "semantic_namespace_identity_required");
  if (value.slice("namespace:".length).split("/").length > MAX_SEGMENTS) throw fail(field, "namespace_depth_exceeded");
  return value;
}

function segment(value, field) {
  const normalized = String(value).normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/[\s_]+/g, "-");
  if (!SEGMENT.test(normalized)) throw fail(field, "namespace_segment_invalid");
  return normalized;
}

/** Accept a canonical ID or a human locator path and return the canonical ID. */
export function canonicalNamespaceId(value, field = "namespace") {
  if (typeof value !== "string" || !value.trim() || value.length > 1024) throw fail(field, "semantic_namespace_identity_required");
  const raw = value.normalize("NFKC").trim();
  const path = raw.startsWith("namespace:") ? raw.slice("namespace:".length) : raw;
  const parts = path.split("/");
  if (parts.length < 1 || parts.length > MAX_SEGMENTS || parts.some((part) => !part)) throw fail(field, "namespace_path_invalid");
  return `namespace:${parts.map((part, index) => segment(part, `${field}[${index}]`)).join("/")}`;
}

export function namespaceSegments(value) { return requireNamespaceId(value).slice("namespace:".length).split("/"); }
export function namespaceParentId(value) {
  const parts = namespaceSegments(value);
  return parts.length === 1 ? "namespace:root" : `namespace:${parts.slice(0, -1).join("/")}`;
}
export function isStructuralNamespace(value) { return value === "namespace:root"; }
export function normalizeNamespaceSelector(value, field = "namespace") { return canonicalNamespaceId(value, field); }
