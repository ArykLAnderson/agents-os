import { mechanicalDigest } from "../substrate/mechanical.mjs";

const retiredField = "authority_scope_namespace_ids";
const evidenceByMechanicalRead = new WeakMap();

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return object(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

// This is deliberately an internal migration/audit record, not Frame content.
// It is held only beside a trusted substrate read and has no protocol renderer.
export function retainRestrictedLegacyAuthorityEvidence(mechanical, frameVersion) {
  if (!object(mechanical) || !object(mechanical.owner) || !object(mechanical.revision)
    || !object(frameVersion) || !object(frameVersion.content)
    || !Object.hasOwn(frameVersion.content, retiredField)) return null;
  const evidence = Object.freeze({
    schema: "restricted-legacy-authority-evidence@1",
    classification: "restricted_legacy",
    [retiredField]: structuredClone(frameVersion.content[retiredField]),
    source: Object.freeze({
      digest: frameVersion.content_digest ?? mechanicalDigest(frameVersion.content),
      schema: frameVersion.content.schema ?? null,
      provenance: Object.freeze({
        owner_id: mechanical.owner.id,
        owner_kind: mechanical.owner.kind,
        revision_id: mechanical.revision.id,
        version_id: frameVersion.version_id,
        field: retiredField,
      }),
    }),
  });
  evidenceByMechanicalRead.set(mechanical, evidence);
  return evidence;
}

export function operationalFrameMetadata(frameVersion) {
  const { [retiredField]: _retired, ...metadata } = frameVersion.content;
  return metadata;
}

// F1 migration/audit code must name the exact retained source. No Frame, CLI,
// Markdown, interchange, query, or admission path receives this accessor.
export function readRestrictedLegacyAuthorityEvidence(mechanical, access) {
  const evidence = evidenceByMechanicalRead.get(mechanical);
  if (!evidence) return null;
  if (!exactKeys(access, ["operation", "source_digest", "source_schema", "source_provenance"])
    || access.operation !== "migration.audit.read"
    || access.source_digest !== evidence.source.digest
    || access.source_schema !== evidence.source.schema
    || JSON.stringify(access.source_provenance) !== JSON.stringify(evidence.source.provenance)) {
    throw new TypeError("Restricted legacy authority evidence requires an exact migration-audit source binding.");
  }
  return structuredClone(evidence);
}
