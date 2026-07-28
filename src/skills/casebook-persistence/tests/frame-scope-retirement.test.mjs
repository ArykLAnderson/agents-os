import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { renderInterchange } from "../variants/markdown/lib/interchange.mjs";
import { hydrateFrame, parseLegacyFrameMarkdown, renderL01FrameMarkdown } from "../variants/sqlite/lib/frame/index.mjs";
import { mechanicalDigest } from "../variants/sqlite/lib/substrate/mechanical.mjs";
import {
  operationalFrameMetadata,
  readRestrictedLegacyAuthorityEvidence,
  retainRestrictedLegacyAuthorityEvidence,
} from "../variants/sqlite/lib/frame/restricted-legacy-authority-evidence.mjs";
import { createHistoricalVisibilityService } from "../variants/sqlite/lib/resource/historical-visibility.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ids = {
  namespace: "namespace:personal",
  frame: "frame:21000000-0000-4000-8000-000000000002",
  case: "case:21000000-0000-4000-8000-000000000003",
  revision: "case-revision:21000000-0000-4000-8000-000000000004",
  view: "view:21000000-0000-4000-8000-000000000005",
  policy: "view-policy:21000000-0000-4000-8000-000000000006",
};
const context = { view_id: ids.view, view_policy_revision_id: ids.policy, purpose: "Frame retirement proof" };
const request = { store_id: "store:21000000-0000-4000-8000-000000000007", context, configuration: {} };
const applied_view = { view_id: ids.view, view_policy_revision_id: ids.policy };
const frame = {
  id: ids.frame,
  home_namespace_id: ids.namespace,
  status: "active",
  title: "Scope-free Frame",
  discovery: [{ id: "discovery:21000000-0000-4000-8000-000000000008", display_order: 0, lifecycle: "active", category: "frontier", title: "Question", body: "Evidence", human_authority: "not_required", dependencies: [] }],
};

function ownerRevision() {
  return {
    ok: true,
    result: {
      owner: { id: ids.case, kind: "case", home_namespace_id: ids.namespace },
      revision: { id: `owner-revision:${ids.revision.slice("case-revision:".length)}`, number: 1, selected_versions: [{ family_id: ids.case, version_id: "version:21000000-0000-4000-8000-000000000009", content: { state: "active" } }] },
      applied_view,
      operation_fence: 11,
    },
  };
}

test("complete historical admission is Profile-context-bound without a Frame authority scope or active scope resolver", async () => {
  const service = createHistoricalVisibilityService({
    resolveBinding: async () => ({ ok: true, result: { status: "not_visible" } }),
    readOwnerRevision: async () => ownerRevision(),
    readOwnerCurrent: async () => ownerRevision(),
  });
  const result = await service.authorizeFrame({
    request,
    frame: { ...frame, case_links: [{ target_kind: "case", target_id: ids.case, observed_revision_id: ids.revision, predicate: "supports" }] },
  });
  assert.deepEqual(result, { status: "authorized", applied_view, operation_fence: 11, observations: [{ target_kind: "case", target_id: ids.case, referenced_revision_id: ids.revision, state: "current", current_revision_id: ids.revision, authorization_fence: 11, observation_fence: 11 }] });
  assert.equal(JSON.stringify(result).includes("authority_scope_namespace_ids"), false);
});

test("Frame Markdown/interchange output has no authority-scope field", () => {
  const sqliteMarkdown = renderL01FrameMarkdown(frame);
  const interchange = renderInterchange([{ kind: "frame", id: frame.id, record: frame }]);
  assert.equal(sqliteMarkdown.includes("authority_scope_namespace_ids"), false);
  assert.equal(interchange.files.find((file) => file.path.endsWith("frame.md")).content.includes("authority_scope_namespace_ids"), false);
});

test("legacy scope is retained only as source-bound restricted migration evidence", () => {
  const mechanical = { owner: { id: ids.frame, kind: "frame" }, revision: { id: "owner-revision:21000000-0000-4000-8000-000000000010" } };
  const frameVersion = {
    version_id: "version:21000000-0000-4000-8000-000000000011",
    content: { schema: "frame-profile@1", id: ids.frame, status: "active", authority_scope_namespace_ids: [ids.namespace] },
  };
  const retained = retainRestrictedLegacyAuthorityEvidence(mechanical, frameVersion);
  assert.equal(retained.schema, "restricted-legacy-authority-evidence@1");
  assert.equal(retained.classification, "restricted_legacy");
  assert.equal(retained.source.schema, "frame-profile@1");
  assert.equal(retained.source.digest.length, 64);
  assert.deepEqual(retained.source.provenance, { owner_id: ids.frame, owner_kind: "frame", revision_id: mechanical.revision.id, version_id: frameVersion.version_id, field: "authority_scope_namespace_ids" });
  assert.deepEqual(readRestrictedLegacyAuthorityEvidence(mechanical, {
    operation: "migration.audit.read", source_digest: retained.source.digest, source_schema: retained.source.schema, source_provenance: retained.source.provenance,
  }), retained);
  assert.throws(() => readRestrictedLegacyAuthorityEvidence(mechanical, { operation: "migration.audit.read" }), /exact migration-audit source binding/);
  const publicMetadata = operationalFrameMetadata(frameVersion);
  assert.equal(JSON.stringify(publicMetadata).includes("authority_scope_namespace_ids"), false);
});

test("hydrated legacy history keeps the source-bound evidence off the Frame result", () => {
  const rawFrame = { schema: "frame-profile@1", ...frame, authority_scope_namespace_ids: [ids.namespace] };
  const rawDiscovery = { schema: "frame-discovery-item@1", ...frame.discovery[0] };
  const frameVersion = { family_id: ids.frame, version_id: "version:21000000-0000-4000-8000-000000000011", content: rawFrame, content_digest: mechanicalDigest(rawFrame) };
  const discoveryVersion = { family_id: frame.discovery[0].id, version_id: "version:21000000-0000-4000-8000-000000000012", content: rawDiscovery, content_digest: mechanicalDigest(rawDiscovery) };
  const mechanical = {
    owner: { id: ids.frame, kind: "frame" },
    revision: {
      id: "owner-revision:21000000-0000-4000-8000-000000000010", number: 1,
      representation: { id: "frame-canonical", version: 3 },
      normalized: { schema: "frame-canonical-selection@3", frame_family_id: ids.frame, frame_version_id: frameVersion.version_id, discovery_selections: [{ discovery_item_id: frame.discovery[0].id, version_id: discoveryVersion.version_id }], disposition_boundary_selections: [], case_disposition_selections: [] },
      selected_versions: [frameVersion, discoveryVersion],
    },
  };
  const hydrated = hydrateFrame(mechanical);
  assert.equal(JSON.stringify(hydrated).includes("authority_scope_namespace_ids"), false);
  const retained = readRestrictedLegacyAuthorityEvidence(mechanical, {
    operation: "migration.audit.read", source_digest: frameVersion.content_digest, source_schema: rawFrame.schema,
    source_provenance: { owner_id: ids.frame, owner_kind: "frame", revision_id: mechanical.revision.id, version_id: frameVersion.version_id, field: "authority_scope_namespace_ids" },
  });
  assert.deepEqual(retained.authority_scope_namespace_ids, [ids.namespace]);
});

test("legacy Frame Markdown treats the retired field as unsupported rather than retaining it", () => {
  const markdown = `---\ntype: "frame"\nschema_version: 1\nid: "${ids.frame}"\nhome_namespace_id: "${ids.namespace}"\nauthority_scope_namespace_ids: ["${ids.namespace}"]\nstatus: "active"\n---\n## Discovery\nSee the manifest-selected Discovery file.\n`;
  const parsed = parseLegacyFrameMarkdown(markdown);
  assert.equal(parsed.value.authority_scope_namespace_ids, undefined);
  assert.deepEqual(parsed.violations, [{ path: "documents.frame.md.frontmatter.authority_scope_namespace_ids", rule: "field_unsupported" }]);
});

test("retired Frame authority scope has no implementation or public-schema occurrence", async () => {
  const sources = await Promise.all([
    "variants/sqlite/lib/frame/index.mjs",
    "variants/sqlite/lib/frame/resources/complete.mjs",
    "variants/sqlite/lib/frame/restricted-legacy-authority-evidence.mjs",
    "variants/sqlite/lib/resource/historical-visibility.mjs",
    "variants/markdown/lib/interchange.mjs",
    "variants/markdown/lib/workspace.mjs",
  ].map((relative) => readFile(path.join(root, relative), "utf8")));
  for (const [index, source] of sources.entries()) if (index !== 2) assert.equal(source.includes("authority_scope_namespace_ids"), false);
  assert.equal(sources[2].includes("restricted-legacy-authority-evidence@1"), true);
});
