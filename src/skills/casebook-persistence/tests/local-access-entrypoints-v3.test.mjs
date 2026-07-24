import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { WORKSPACE_MARKER } from "../shared/l01-interchange.mjs";
import { selectCompatibleSqliteBinary } from "./sandbox-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entrypoint = path.join(root, "variants/sqlite/bin/casebook-persistence.mjs");
const markdownEntrypoint = path.join(root, "variants/markdown/bin/casebook-persistence.mjs");
const protocol = { id: "casebook-persistence-json", version: 1 };
const ids = Object.freeze({
  firstNamespace: "namespace:10000000-0000-4000-8000-000000000001",
  secondNamespace: "namespace:10000000-0000-4000-8000-000000000002",
  firstCase: "case:10000000-0000-4000-8000-000000000011",
  secondCase: "case:10000000-0000-4000-8000-000000000012",
  thirdCase: "case:10000000-0000-4000-8000-000000000013",
  firstAlias: "alias:10000000-0000-4000-8000-000000000021",
  secondAlias: "alias:10000000-0000-4000-8000-000000000022",
  thirdAlias: "alias:10000000-0000-4000-8000-000000000023",
  firstFrame: "frame:10000000-0000-4000-8000-000000000031",
  secondFrame: "frame:10000000-0000-4000-8000-000000000032",
  firstDiscovery: "discovery:10000000-0000-4000-8000-000000000041",
  secondDiscovery: "discovery:10000000-0000-4000-8000-000000000042",
});

function invoke(request) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [entrypoint], { encoding: "utf8", timeout: 30_000 }, (error, stdout, stderr) => resolve({ code: error ? 2 : 0, json: JSON.parse(stdout), stderr }));
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

function configuration(store, sqlite) {
  return { source: { kind: "local-access-entrypoint-test", locator: "workspace:local-access-entrypoint" }, authority_mode: "sqlite", sqlite: { database_url: store, sqlite_bin: sqlite } };
}

function caseRecord(id, namespaceId, title, aliasId, alias) {
  return {
    id, home_namespace_id: namespaceId, state: "active", title, summary: "Public local-access entrypoint behavior.", scope: "Disposable test scope.",
    aliases: [{ id: aliasId, state: "active", version: alias }], facets: [], entries: [], sources: [], relationships: [], references: [],
  };
}

async function setup() {
  const sqlite = await selectCompatibleSqliteBinary();
  const directory = await mkdtemp(path.join(os.tmpdir(), "casebook-local-access-entrypoint-"));
  const config = configuration(path.join(directory, "store.sqlite3"), sqlite);
  const initialized = await invoke({ protocol, operation: "initialize_store", operation_id: "operation:entrypoint:init", authority_claim: { human_authorized: true, acting_role: "test", authority_basis: "public local access" }, configuration: config });
  assert.equal(initialized.code, 0, initialized.stderr);
  const state = { directory, config, storeId: initialized.json.result.initialization.store_id, defaultNamespace: initialized.json.result.initialization.namespace.id };
  const base = { protocol, request_version: 1, store_id: state.storeId, authority_claim: { human_authorized: true, acting_role: "test", authority_basis: "public local access" }, configuration: config };
  for (const [operationId, namespaceId, namespaceKey, fence] of [["operation:entrypoint:namespace:first", ids.firstNamespace, "first", 1], ["operation:entrypoint:namespace:second", ids.secondNamespace, "second", 2]]) {
    const result = await invoke({ ...base, operation: "namespace.create", operation_id: operationId, expected_operation_fence: fence, namespace_id: namespaceId, namespace_key: namespaceKey });
    assert.equal(result.code, 0, result.stderr);
  }
  return state;
}

async function create(state, operationId, record) {
  const result = await invoke({ protocol, operation: "case.create", request_version: 1, store_id: state.storeId, operation_id: `operation:entrypoint:${operationId}`, expected_revision: 0, commit_basis: "public entrypoint behavior", provenance: { acting_role: "test", authority_basis: "entrypoint proof" }, case: record, configuration: state.config });
  assert.equal(result.code, 0, result.stderr || JSON.stringify(result.json));
  return result;
}

async function createFrame(state, operationId, id, namespaceId, discoveryId, title) {
  const result = await invoke({ protocol, operation: "frame.create", request_version: 1, store_id: state.storeId, operation_id: `operation:entrypoint:${operationId}`, expected_revision: 0, commit_basis: "public entrypoint behavior", provenance: { acting_role: "test", authority_basis: "entrypoint proof" }, frame: { id, home_namespace_id: namespaceId, authority_scope_namespace_ids: [namespaceId], status: "active", title, discovery: [{ id: discoveryId, display_order: 0, lifecycle: "active", category: "frontier", title: "Common local access", body: "Searchable public entrypoint Frame.", human_authority: "not_required", dependencies: [] }], disposition_boundaries: [], case_dispositions: [] }, configuration: state.config });
  assert.equal(result.code, 0, result.stderr || JSON.stringify(result.json));
}

test("SQLite public case.resolve accepts aliases and deterministically resolves cross-namespace ambiguity", async () => {
  const state = await setup();
  try {
    await create(state, "case:first", caseRecord(ids.firstCase, ids.firstNamespace, "First duplicate", ids.firstAlias, { value: "Shared Alias", kind: "name" }));
    await create(state, "case:second", caseRecord(ids.secondCase, ids.secondNamespace, "Second duplicate", ids.secondAlias, { value: "shared alias", kind: "name" }));
    await create(state, "case:third", caseRecord(ids.thirdCase, ids.secondNamespace, "Unique alias", ids.thirdAlias, { value: "Only Here", kind: "name" }));

    const ambiguous = await invoke({ protocol, operation: "case.resolve", request_version: 1, store_id: state.storeId, alias: { value: " SHARED ALIAS ", kind: "name" }, configuration: state.config });
    assert.equal(ambiguous.code, 0, ambiguous.stderr);
    assert.equal(ambiguous.json.result.status, "ambiguous");
    assert.deepEqual(ambiguous.json.result.candidates.map((item) => item.case_id), [ids.firstCase, ids.secondCase]);

    const narrowed = await invoke({ protocol, operation: "case.resolve", request_version: 1, store_id: state.storeId, alias: { namespace_id: ids.secondNamespace, value: "shared alias", kind: "name" }, configuration: state.config });
    assert.equal(narrowed.code, 0, narrowed.stderr);
    assert.equal(narrowed.json.result.status, "found");
    assert.equal(narrowed.json.result.case_id, ids.secondCase);

    const unique = await invoke({ protocol, operation: "case.resolve", request_version: 1, store_id: state.storeId, alias: { value: "only here", kind: "name" }, configuration: state.config });
    assert.equal(unique.code, 0, unique.stderr);
    assert.equal(unique.json.result.case_id, ids.thirdCase);
  } finally { await rm(state.directory, { recursive: true, force: true }); }
});

test("SQLite public identity discovery defaults workspace-wide, fences selectors, and binds Case hydration", async () => {
  const state = await setup();
  try {
    await create(state, "identity:first", caseRecord(ids.firstCase, ids.firstNamespace, "First discovery candidate", ids.firstAlias, { value: "first", kind: "name" }));
    await create(state, "identity:second", caseRecord(ids.secondCase, ids.secondNamespace, "Second discovery candidate", ids.secondAlias, { value: "second", kind: "name" }));
    await create(state, "identity:third", caseRecord(ids.thirdCase, ids.secondNamespace, "Third discovery candidate", ids.thirdAlias, { value: "third", kind: "name" }));
    const request = { protocol, operation: "identity.discover", request_version: 1, store_id: state.storeId, owner_kinds: ["case"], query: { text: "discovery candidate" }, limit: 2, max_depth: 0, configuration: state.config };
    const first = await invoke(request);
    assert.equal(first.code, 0, first.stderr);
    assert.equal(first.json.result.applied_namespace_filter, null);
    assert.deepEqual(first.json.result.candidates.map((item) => item.stable_id), [ids.firstCase, ids.secondCase]);
    assert.ok(first.json.result.next_cursor);

    const changedFilter = await invoke({ ...request, cursor: first.json.result.next_cursor, namespace_ids: [ids.secondNamespace] });
    assert.equal(changedFilter.code, 2);
    assert.equal(changedFilter.json.failure.code, "identity.discovery_invalid");

    const narrowed = await invoke({ ...request, limit: 10, namespace_ids: [ids.secondNamespace] });
    assert.equal(narrowed.code, 0, narrowed.stderr);
    assert.deepEqual(narrowed.json.result.applied_namespace_filter, [ids.secondNamespace]);
    assert.deepEqual(narrowed.json.result.candidates.map((item) => item.stable_id), [ids.secondCase, ids.thirdCase]);

    const hydrated = await invoke({ protocol, operation: "case.discovery.hydrate", request_version: 1, store_id: state.storeId, handoff_token: first.json.result.handoff_token, query_digest: first.json.result.query_digest, candidate_ids: [ids.firstCase], configuration: state.config });
    assert.equal(hydrated.code, 0, hydrated.stderr || JSON.stringify(hydrated.json));
    assert.equal(hydrated.json.result.items[0].case.id, ids.firstCase);
    assert.equal("applied_view" in hydrated.json.result, false);

    const mismatch = await invoke({ protocol, operation: "case.discovery.hydrate", request_version: 1, store_id: state.storeId, handoff_token: first.json.result.handoff_token, query_digest: first.json.result.query_digest, candidate_ids: [ids.thirdCase], configuration: state.config });
    assert.equal(mismatch.code, 2);
    assert.equal(mismatch.json.failure.code, "case.not_found_or_not_visible");

    const legacyContext = await invoke({ protocol, operation: "identity.discover", request_version: 1, store_id: state.storeId, owner_kinds: ["case"], query: { text: "discovery candidate" }, limit: 2, max_depth: 0, context: {}, configuration: state.config });
    assert.equal(legacyContext.code, 2);
    assert.equal(legacyContext.json.failure.code, "identity.discovery_invalid");
  } finally { await rm(state.directory, { recursive: true, force: true }); }
});

test("SQLite retired v3 operation categories fail closed before legacy substrate access", async () => {
  const state = await setup();
  try {
    for (const operation of ["view_policy.create", "export.preflight", "events.page", "checkpoint.read", "reconciliation_snapshot.begin", "impact.project", "integrity.observe", "projection.rebuild", "case.purge.inspect", "case.purge.plan", "case.purge.execute"]) {
      const result = await invoke({ protocol, operation, request_version: 1, store_id: state.storeId, configuration: state.config });
      assert.equal(result.code, 2, operation);
      assert.equal(result.json.failure.code, "operation_unsupported", operation);
      assert.equal(result.json.failure.class, "operation_unsupported", operation);
    }
  } finally { await rm(state.directory, { recursive: true, force: true }); }
});

test("SQLite retired purge rejects an absent store without authority admission or store creation", async () => {
  const sqlite = await selectCompatibleSqliteBinary();
  const directory = await mkdtemp(path.join(os.tmpdir(), "casebook-retired-purge-no-access-"));
  const store = path.join(directory, "absent.sqlite3");
  try {
    const result = await invoke({ protocol, operation: "case.purge.inspect", request_version: 1, store_id: "store:10000000-0000-4000-8000-000000000201", configuration: configuration(store, sqlite) });
    assert.equal(result.code, 2);
    assert.equal(result.json.failure.code, "operation_unsupported");
    await assert.rejects(stat(store), { code: "ENOENT" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("SQLite public common list and search apply namespace filters to Case and Frame owners", async () => {
  const state = await setup();
  try {
    await create(state, "common:first-case", caseRecord(ids.firstCase, ids.firstNamespace, "First common owner", ids.firstAlias, { value: "first common", kind: "name" }));
    await create(state, "common:second-case", caseRecord(ids.secondCase, ids.secondNamespace, "Second common owner", ids.secondAlias, { value: "second common", kind: "name" }));
    await createFrame(state, "common:first-frame", ids.firstFrame, ids.firstNamespace, ids.firstDiscovery, "First common Frame");
    await createFrame(state, "common:second-frame", ids.secondFrame, ids.secondNamespace, ids.secondDiscovery, "Second common Frame");
    const base = { protocol, request_version: 1, store_id: state.storeId, owner_kinds: ["case", "frame"], configuration: state.config };

    const all = await invoke({ ...base, operation: "common.list" });
    assert.equal(all.code, 0, all.stderr);
    assert.deepEqual(all.json.result.items.map((item) => item.id), [ids.firstCase, ids.secondCase, ids.firstFrame, ids.secondFrame]);
    assert.equal("applied_namespace_filter" in all.json.result, false);
    assert.equal("applied_view" in all.json.result, false);

    const listed = await invoke({ ...base, operation: "common.list", namespace_ids: [ids.secondNamespace] });
    assert.equal(listed.code, 0, listed.stderr);
    assert.deepEqual(listed.json.result.items.map((item) => item.id), [ids.secondCase, ids.secondFrame]);
    assert.deepEqual(listed.json.result.applied_namespace_filter, [ids.secondNamespace]);

    const searched = await invoke({ ...base, operation: "common.search", query: "common", limit: 10, namespace_ids: [ids.firstNamespace] });
    assert.equal(searched.code, 0, searched.stderr);
    assert.deepEqual(searched.json.result.items.map((item) => item.id).sort(), [ids.firstCase, ids.firstFrame].sort());
    assert.deepEqual(searched.json.result.applied_namespace_filter, [ids.firstNamespace]);

    const invalid = await invoke({ ...base, operation: "common.list", namespace_ids: [ids.firstNamespace, ids.firstNamespace] });
    assert.equal(invalid.code, 2);
    assert.equal(invalid.json.failure.code, "common.invalid_request");
  } finally { await rm(state.directory, { recursive: true, force: true }); }
});

test("Markdown v2 marker exposes common and Frame local access without a view or request context", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "casebook-markdown-v2-local-access-"));
  const workspace = path.join(directory, "workspace");
  const storeId = "store:10000000-0000-4000-8000-000000000101";
  const namespaceId = "namespace:10000000-0000-4000-8000-000000000102";
  const caseId = "case:10000000-0000-4000-8000-000000000103";
  const frameId = "frame:10000000-0000-4000-8000-000000000104";
  const discoveryId = "discovery:10000000-0000-4000-8000-000000000105";
  const config = { source: { kind: "local-access-entrypoint-test", locator: "workspace:markdown-v2" }, authority_mode: "markdown", markdown: { workspace_root: workspace } };
  const request = (operation, extra = {}) => ({ protocol, operation, request_version: 1, store_id: storeId, configuration: config, ...extra });
  try {
    await mkdir(workspace);
    await writeFile(path.join(workspace, WORKSPACE_MARKER), JSON.stringify({ configuration_version: 2, authority_mode: "markdown", profile: "file-authoritative-markdown-v1", workspace_id: storeId }));
    const createdCase = await new Promise((resolve) => {
      const child = execFile(process.execPath, [markdownEntrypoint], { encoding: "utf8", timeout: 30_000 }, (error, stdout, stderr) => resolve({ code: error ? 2 : 0, json: JSON.parse(stdout), stderr }));
      child.stdin.end(`${JSON.stringify(request("case.create", { operation_id: "operation:markdown-v2:case", expected_revision: 0, commit_basis: "Markdown v2 local access", provenance: { acting_role: "test" }, case: { id: caseId, home_namespace_id: namespaceId, state: "active", title: "Markdown local case", summary: "Searchable selected workspace Case.", scope: "Disposable test scope." } }))}\n`);
    });
    assert.equal(createdCase.code, 0, createdCase.stderr);
    const createdFrame = await new Promise((resolve) => {
      const child = execFile(process.execPath, [markdownEntrypoint], { encoding: "utf8", timeout: 30_000 }, (error, stdout, stderr) => resolve({ code: error ? 2 : 0, json: JSON.parse(stdout), stderr }));
      child.stdin.end(`${JSON.stringify(request("frame.create", { operation_id: "operation:markdown-v2:frame", expected_revision: 0, commit_basis: "Markdown v2 local access", provenance: { acting_role: "test" }, frame: { id: frameId, home_namespace_id: namespaceId, authority_scope_namespace_ids: [namespaceId], status: "active", title: "Markdown local Frame", discovery: [{ id: discoveryId, display_order: 0, lifecycle: "active", category: "frontier", title: "Local access", body: "No view context is required.", human_authority: "not_required", dependencies: [] }], disposition_boundaries: [], case_dispositions: [] } }))}\n`);
    });
    assert.equal(createdFrame.code, 0, createdFrame.stderr);
    for (const [operation, extra] of [["common.list", { owner_kinds: ["case", "frame"] }], ["common.search", { owner_kinds: ["case", "frame"], query: "markdown local", limit: 10 }], ["frame.list", {}], ["frame.read", { frame_id: frameId }]]) {
      const result = await new Promise((resolve) => {
        const child = execFile(process.execPath, [markdownEntrypoint], { encoding: "utf8", timeout: 30_000 }, (error, stdout, stderr) => resolve({ code: error ? 2 : 0, json: JSON.parse(stdout), stderr }));
        child.stdin.end(`${JSON.stringify(request(operation, extra))}\n`);
      });
      assert.equal(result.code, 0, `${operation}: ${result.stderr}`);
      assert.equal("applied_view" in result.json.result, false, operation);
    }
    const filtered = await new Promise((resolve) => {
      const child = execFile(process.execPath, [markdownEntrypoint], { encoding: "utf8", timeout: 30_000 }, (error, stdout, stderr) => resolve({ code: error ? 2 : 0, json: JSON.parse(stdout), stderr }));
      child.stdin.end(`${JSON.stringify(request("common.list", { owner_kinds: ["case", "frame"], namespace_ids: [namespaceId] }))}\n`);
    });
    assert.equal(filtered.code, 0, filtered.stderr);
    assert.deepEqual(filtered.json.result.applied_namespace_filter, [namespaceId]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
