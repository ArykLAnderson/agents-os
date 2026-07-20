import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  canonicalJson,
  INTERCHANGE_MANIFEST,
  L01_WORKSPACE_PROFILE,
  WORKSPACE_MARKER,
} from "../shared/l01-interchange.mjs";
import { cleanupSandbox, generateAndValidateSandbox } from "./sandbox-harness.mjs";

const protocol = { id: "casebook-persistence-json", version: 1 };
const entrypoint = new URL("../variants/markdown/bin/casebook-persistence.mjs", import.meta.url).pathname;
const ids = Object.freeze({
  store: "store:fe772b28-b6d5-497d-a01a-b8d2c4099d8d",
  view: "view:b5839bf2-6cec-4169-af87-fb400901dcd9",
  policy: "view-policy:f02d90f5-e455-4319-ad16-1deb7b025236",
  namespace: "namespace:b3ad9ccd-466a-4004-8ae5-d1db5d2c2905",
  secondNamespace: "namespace:52bf15a3-4651-412a-b25e-d62a7f9d9cca",
  case: "case:93eac27f-6c37-4fc5-9c19-7ab25e68ca3f",
  alias: "alias:15ce9b9d-abc7-4ff0-8651-376809a63323",
  facet: "facet:9b37b0b8-f759-4f68-b722-18c3f44ad88a",
  knowledge: "knowledge:14bcb9c4-6006-4c7a-9120-c41e83b45d88",
  source: "source:144143a8-e27f-4b4f-bccb-286a48c1b875",
  evidence: "evidence:402f9671-9bfd-46d8-8291-7e3986b36930",
  relationship: "relationship:c68ea8df-a493-4782-aecb-0d46d1f46ce8",
  frame: "frame:429846d2-04b1-4ff6-9242-f47ebe5c9c79",
  discovery: "discovery:85c2605e-7289-4b75-94f8-39575f52d233",
  boundary: "disposition-boundary:2dfd2be6-9c20-49ff-9176-a238d5182dcc",
  disposition: "case-disposition:f1b753f6-dd73-493f-aed8-8f1849fe2025",
  boundaryVersion: "disposition-boundary-version:b08a3caa-7f3e-40ec-a943-c7cdc90ff87c",
  dispositionVersion: "case-disposition-version:5ea8aa48-d13e-48fb-a5ae-dc5b07bceeb4",
  caseRevision: "case-revision:09b3982b-d7c7-4b26-a54d-cff0946a7909",
  artifact: "artifact:c352f355-d4c2-4ade-941d-3e46af87654a",
  artifactRevision: "artifact-revision:7efdbcbe-cd71-42db-a03a-71ae6e78e066",
});

function invoke(selectedEntrypoint, cwd, request) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [selectedEntrypoint], {
      cwd,
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", HOME: cwd },
    }, (error, stdout, stderr) => resolve({ exitCode: error ? 2 : 0, json: JSON.parse(stdout), stderr }));
    child.stdin.end(JSON.stringify(request));
  });
}

function marker(storeId = ids.store, viewId = ids.view, policyId = ids.policy, profile = "file-authoritative-markdown-v1") {
  return {
    configuration_version: 1,
    authority_mode: "markdown",
    profile,
    workspace_id: storeId,
    view: { id: viewId, policy_revision_id: policyId, audience_ceiling: "private" },
  };
}

function configuration(root, locator = "l05-w04-common-subset") {
  return {
    source: { kind: "synthetic-test", locator },
    authority_mode: "markdown",
    markdown: { workspace_root: root },
  };
}

function request(root, operation, extra = {}, selectedMarker = marker()) {
  return {
    protocol,
    operation,
    request_version: 1,
    store_id: selectedMarker.workspace_id,
    context: {
      view_id: selectedMarker.view.id,
      view_policy_revision_id: selectedMarker.view.policy_revision_id,
      purpose: `L05-W04 ${operation}`,
      requested_audience_ceiling: "private",
    },
    configuration: configuration(root),
    ...extra,
  };
}

function fullCase() {
  return {
    id: ids.case,
    home_namespace_id: ids.namespace,
    state: "active",
    title: "Cobalt Case authority",
    summary: "Complete typed Case content in the file-authoritative variant.",
    scope: "Preserve all normalized Case families.",
    provenance: { sources: [{ kind: "source", id: ids.source }], support: [], authority: [], note: "Explicit typed input." },
    aliases: [{ id: ids.alias, state: "active", version: { value: "cobalt-case", kind: "slug" } }],
    facets: [{ id: ids.facet, state: "active", version: { key: "theme", value: "cobalt", visibility: "private", provenance: { acting_role: "case" } } }],
    entries: [{
      id: ids.knowledge,
      state: "active",
      version: {
        display_label: "CK-001",
        title: "Cobalt invariant",
        purpose: "Exercise the complete Case representation.",
        classification: "accepted",
        body: "Atomic authority remains singular.",
        visibility: "private",
        provenance: { acting_role: "case", authority_basis: "synthetic proof" },
        positions: [],
        relationships: [ids.relationship],
        references: [],
      },
    }],
    sources: [{
      id: ids.source,
      state: "active",
      display_label: "SRC-001",
      version: {
        title: "Synthetic source",
        author: "Fixture",
        accessed_at: "2026-07-19T00:00:00Z",
        examined_for: "Complete Markdown common-subset proof.",
        visibility: "private",
        locators: [{ kind: "origin", uri: "https://example.invalid/cobalt", audience: "private" }],
        provenance: { acting_role: "case" },
      },
      fragments: [{
        id: ids.evidence,
        state: "active",
        version: {
          excerpt: "cobalt evidence",
          purpose: "Verify evidence preservation.",
          captured_at: "2026-07-19T00:00:01Z",
          visibility: "private",
          provenance: { acting_role: "case" },
        },
      }],
    }],
    relationships: [{
      id: ids.relationship,
      state: "active",
      version: {
        subject: { kind: "case", id: ids.case },
        predicate: "contains",
        object: { kind: "knowledge", id: ids.knowledge },
        visibility: "private",
        provenance: { acting_role: "case" },
      },
    }],
    references: [],
  };
}

function fullFrame() {
  return {
    id: ids.frame,
    home_namespace_id: ids.namespace,
    authority_scope_namespace_ids: [ids.namespace, ids.secondNamespace],
    status: "active",
    title: "Full cobalt Frame",
    outcome: "Preserve links, authorization, Discovery, and dispositions.",
    included_scope: ["Complete file authority"],
    excluded_scope: ["SQLite guarantees"],
    limitations: "No revision history or durable receipt.",
    completion_condition: "Deterministic export reparses identically.",
    case_links: [{
      target_kind: "case", target_id: ids.case, observed_revision_id: ids.caseRevision,
      predicate: "frames", provenance: "synthetic", authority_scope: "external_read_only",
    }],
    frame_links: [],
    downstream_links: [],
    artifact_links: [{
      artifact_id: ids.artifact, kind: "report", title: "Bounded report", summary: "Metadata only.",
      locator: { uri: "file:///tmp/cobalt-report", media_type: "text/plain", audience: "private" },
      observed_revision_id: ids.artifactRevision,
    }],
    authorization_provenance: {
      acting_role: "frame", authority_basis: "synthetic proof",
      human_confirmation: { reference: "AT-W04", confirmed_at: "2026-07-19T00:00:00Z", scope: "fixture" },
    },
    discovery: [{
      id: ids.discovery,
      display_label: "AT-001",
      display_order: 0,
      lifecycle: "active",
      category: "frontier",
      title: "Cobalt Discovery",
      body: "Complete typed Discovery body.",
      human_authority: "required",
      dependencies: [{ target_kind: "case", target_id: ids.case, observed_revision_id: ids.caseRevision, predicate: "depends_on", provenance: "synthetic" }],
      scope_namespace_ids: [ids.secondNamespace],
    }],
    disposition_boundaries: [{
      id: ids.boundary,
      version_id: ids.boundaryVersion,
      display_label: "DB-001",
      display_order: 0,
      title: "Cobalt boundary",
      closure: "closed",
      disposition_ids: [ids.disposition],
      evidence_locators: [{ uri: "https://example.invalid/boundary", media_type: "text/plain", audience: "private" }],
    }],
    case_dispositions: [{
      id: ids.disposition,
      version_id: ids.dispositionVersion,
      boundary_id: ids.boundary,
      result_summary: "No reusable Case subject.",
      classification_state: "classified",
      disposition: "no_case",
      no_case_reason: "The result is fixture-only.",
      evidence_locators: [{ uri: "https://example.invalid/disposition", audience: "private" }],
    }],
  };
}

async function createEmptyWorkspace(root, selectedMarker = marker()) {
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, WORKSPACE_MARKER), canonicalJson(selectedMarker));
}

function createRequest(root, kind, record, selectedMarker = marker()) {
  return request(root, `${kind}.create`, {
    operation_id: `operation:l05-w04-${kind}-create`,
    expected_revision: 0,
    commit_basis: `create complete ${kind} file authority`,
    provenance: { acting_role: kind, authority_basis: "synthetic proof" },
    [kind]: record,
  }, selectedMarker);
}

async function writeExportWorkspace(root, rendered) {
  const selectedMarker = marker(
    "store:31a9959e-b329-4387-99d5-d0d6bbed488d",
    "view:08aff85e-43ec-4fc5-bb8f-7a6c444b4e1a",
    "view-policy:db2c11ef-f07f-4956-98fa-8f52c8a3545e",
    L01_WORKSPACE_PROFILE,
  );
  selectedMarker.interchange_manifest_sha256 = rendered.manifest_sha256;
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, WORKSPACE_MARKER), canonicalJson(selectedMarker));
  await writeFile(path.join(root, INTERCHANGE_MANIFEST), rendered.manifest_bytes);
  for (const file of rendered.files) {
    const destination = path.join(root, file.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.content);
  }
  return selectedMarker;
}

async function exerciseCommonSubset(selectedEntrypoint, root, selectedMarker = marker()) {
  const workspace = path.join(root, "workspace");
  await createEmptyWorkspace(workspace, selectedMarker);
  const expectedCase = fullCase();
  const expectedFrame = fullFrame();
  const createdCase = await invoke(selectedEntrypoint, root, createRequest(workspace, "case", expectedCase, selectedMarker));
  assert.equal(createdCase.exitCode, 0, JSON.stringify(createdCase.json));
  const createdFrame = await invoke(selectedEntrypoint, root, createRequest(workspace, "frame", expectedFrame, selectedMarker));
  assert.equal(createdFrame.exitCode, 0, JSON.stringify(createdFrame.json));

  for (const [kind, id, expected] of [["case", ids.case, expectedCase], ["frame", ids.frame, expectedFrame]]) {
    const read = await invoke(selectedEntrypoint, root, request(workspace, `${kind}.read`, { [`${kind}_id`]: id }, selectedMarker));
    assert.equal(read.exitCode, 0, JSON.stringify(read.json));
    assert.deepEqual(read.json.result[kind], expected);
    assert.deepEqual(read.json.result.capabilities.omitted, ["revisions", "events", "durable_receipts", "checkpoints", "snapshots", "namespace_global_queries"]);
  }

  const listed = await invoke(selectedEntrypoint, root, request(workspace, "common.list", { owner_kinds: ["frame", "case"] }, selectedMarker));
  assert.equal(listed.exitCode, 0, JSON.stringify(listed.json));
  assert.deepEqual(listed.json.result.items, [
    { owner_kind: "case", id: ids.case, record: expectedCase },
    { owner_kind: "frame", id: ids.frame, record: expectedFrame },
  ]);
  assert.equal(listed.json.result.stable_sort, "owner_kind_asc_id_asc");

  for (const ownerId of [ids.case, ids.frame]) {
    const resolved = await invoke(selectedEntrypoint, root, request(workspace, "common.resolve", { owner_id: ownerId }, selectedMarker));
    assert.equal(resolved.exitCode, 0, JSON.stringify(resolved.json));
    assert.equal(resolved.json.result.item.id, ownerId);
  }
  const searched = await invoke(selectedEntrypoint, root, request(workspace, "common.search", {
    owner_kinds: ["case", "frame"], query: "cobalt", limit: 10,
  }, selectedMarker));
  assert.equal(searched.exitCode, 0, JSON.stringify(searched.json));
  assert.deepEqual(searched.json.result.items.map((item) => item.id), [ids.case, ids.frame]);

  const exportRequest = request(workspace, "interchange.export", { owner_ids: [ids.frame, ids.case] }, selectedMarker);
  const exported = await invoke(selectedEntrypoint, root, exportRequest);
  const repeated = await invoke(selectedEntrypoint, root, exportRequest);
  assert.equal(exported.exitCode, 0, JSON.stringify(exported.json));
  assert.deepEqual(repeated.json.result, exported.json.result);
  assert.equal(exported.json.result.authority_selected, false);
  assert.deepEqual(exported.json.result.records, undefined);

  const importedRoot = path.join(root, "imported");
  const importedMarker = await writeExportWorkspace(importedRoot, exported.json.result);
  const imported = await invoke(selectedEntrypoint, root, request(importedRoot, "interchange.parse", {}, importedMarker));
  assert.equal(imported.exitCode, 0, JSON.stringify(imported.json));
  assert.deepEqual(imported.json.result.records, [
    { kind: "case", id: ids.case, record: expectedCase },
    { kind: "frame", id: ids.frame, record: expectedFrame },
  ]);
  return { workspace };
}

test("file-authoritative Markdown completes full typed common create/read/resolve/list/search/import/export", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l05-w04-common-"));
  try {
    const { workspace } = await exerciseCommonSubset(entrypoint, root);
    const unsupportedOperations = [
      ["case.history", "revisions"],
      ["frame.history", "revisions"],
      ["frame.get_operation_receipt", "durable_receipts"],
      ["events.read", "events"],
      ["checkpoint.read", "checkpoints"],
      ["snapshot.create", "snapshots"],
      ["global.search", "namespace_global_queries"],
    ];
    for (const [operation, capability] of unsupportedOperations) {
      const result = await invoke(entrypoint, root, request(workspace, operation));
      assert.equal(result.exitCode, 2, operation);
      assert.equal(result.json.failure.code, "markdown.capability_unsupported", operation);
      assert.equal(result.json.failure.class, "capability_unavailable", operation);
      assert.equal(result.json.failure.evidence.capability, capability, operation);
      assert.deepEqual(result.json.failure.evidence.omitted_guarantees, ["revisions", "events", "durable_receipts", "checkpoints", "snapshots", "namespace_global_queries"]);
    }
    assert.equal(await stat(path.join(workspace, "casebook.sqlite3")).then(() => true).catch(() => false), false);
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await stat(root).then(() => true).catch(() => false), false);
  }
});

test("generated Pi, Codex, and OpenCode copies expose the same reduced Markdown common subset", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l05-w04-generated-"));
  try {
    const generated = await generateAndValidateSandbox({ sandboxRoot: root });
    for (const target of generated.results) {
      const targetRoot = path.join(root, "synthetic", target.target);
      const generatedEntrypoint = path.join(target.package_root, "variants/markdown/bin/casebook-persistence.mjs");
      await exerciseCommonSubset(generatedEntrypoint, targetRoot);
      const unsupported = await invoke(generatedEntrypoint, targetRoot, request(path.join(targetRoot, "workspace"), "events.read"));
      assert.equal(unsupported.exitCode, 2, target.target);
      assert.equal(unsupported.json.failure.code, "markdown.capability_unsupported", target.target);
    }
  } finally {
    assert.equal(await cleanupSandbox(root), true);
    assert.equal(await readFile(entrypoint, "utf8").then(() => true), true);
  }
});
