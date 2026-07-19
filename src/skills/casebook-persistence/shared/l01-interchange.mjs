import { createHash } from "node:crypto";

// This shared module defines only the package-internal transport vocabulary for
// the synthetic L-01 interchange. Owner-specific rendering remains in the
// SQLite owner façades and the independent Markdown procedure.
export const L01_INTERCHANGE_FORMAT = "casebook-l01-synthetic-interchange@1";
export const L01_WORKSPACE_PROFILE = "l01-synthetic-interchange";
export const INTERCHANGE_MANIFEST = "interchange-manifest.json";
export const WORKSPACE_MARKER = ".casebook-persistence.json";
export const L01_IDENTITY_RULE = "verified-frontmatter-and-manifest-only";

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return `${JSON.stringify(canonicalValue(value), null, 2)}\n`;
}

export function interchangeFrontmatter(fields) {
  const lines = ["---"];
  for (const [key, value] of fields) {
    if (value != null) lines.push(`${key}: ${JSON.stringify(value)}`);
  }
  lines.push("---", "");
  return lines.join("\n");
}

export function interchangeJsonSection(name, value) {
  if (value == null) return "";
  return `## ${name}\n\`\`\`json\n${JSON.stringify(value)}\n\`\`\`\n\n`;
}

export function interchangeKeyFromId(id) {
  return id.slice(id.indexOf(":") + 1);
}
