import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  canonicalJson,
  INTERCHANGE_MANIFEST,
  L01_IDENTITY_RULE,
  L01_INTERCHANGE_FORMAT,
  L01_WORKSPACE_PROFILE,
  sha256,
  WORKSPACE_MARKER,
} from "../shared/l01-interchange.mjs";
import { renderInterchange } from "../variants/markdown/lib/interchange.mjs";
import {
  cleanupSandbox,
  generateAndValidateSandbox,
  selectCompatibleSqliteBinary,
  TARGET_LAYOUTS,
} from "./sandbox-harness.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sqliteEntrypoint = path.join(packageRoot, "variants/sqlite/bin/casebook-persistence.mjs");
const markdownEntrypoint = path.join(packageRoot, "variants/markdown/bin/casebook-persistence.mjs");
const protocol = { id: "casebook-persistence-json", version: 1 };
const authorityClaim = {
  human_authorized: true,
  acting_role: "architect",
  authority_basis: "explicit synthetic L01-W05 test authorization",
};
const ids = Object.freeze({
  markdownStore: "store:a937f4ed-9ea6-4fa9-a85d-1fc00aedab75",
  markdownView: "view:8cf2bec9-4dbb-4604-b49b-ab6a5d50d3f2",
  markdownPolicy: "view-policy:00327b54-c611-48f5-b26a-77032e5e7957",
  legacyMarkdownStore: "store:d9d0c1a9-58bc-48bd-bb82-8531a64725a2",
  legacyMarkdownView: "view:5573d58b-dd63-4a18-8615-3c9732ffaf34",
  legacyMarkdownPolicy: "view-policy:b7c82ce6-434f-497b-b0d4-b5729edd47f2",
  namespace: "namespace:985f0944-e48c-431c-a6bb-0f579901970a",
  case: "case:170f432f-0d33-4125-a7e7-742b34aa753b",
  frame: "frame:f8a09b68-ef1e-40c2-a793-496c6876ee98",
  discovery: "discovery:66b18643-1ca8-4d5d-a9bf-96951527e540",
  ambiguousDiscovery: "discovery:b77e90dc-cfb2-444a-bbe7-4e18595bcb1c",
  generatedMarkdown: {
    pi: ["store:37c90b68-4f17-4a1b-a59b-8b62b1d699b7", "view:1b968367-c2b3-4935-b4fe-dcddf77246d8", "view-policy:b5af9101-fa3a-49ee-b582-e2426f568107"],
    codex: ["store:c299e126-5eac-4c19-a930-71a523e5c4a3", "view:f28c9cf3-ed5a-4aac-ba79-9dcb90e01c48", "view-policy:942605c1-55cb-40d0-ae54-9daebfefebe2"],
    opencode: ["store:20d24a2d-6abf-4f27-b437-2c22448090a5", "view:838a4898-d7af-4950-ab4b-23129118c5d0", "view-policy:5ed2347e-2cd3-4a0e-a394-32f80dbd9f7c"],
  },
});

function execFileWithInput(file, args, options, input) {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      } else resolve({ stdout, stderr });
    });
    child.stdin.end(input);
  });
}

async function invoke(entrypoint, cwd, request) {
  try {
    const { stdout, stderr } = await execFileWithInput(process.execPath, [entrypoint], {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? "", HOME: cwd },
    }, `${JSON.stringify(request)}\n`);
    return { exitCode: 0, stdout, stderr, json: JSON.parse(stdout) };
  } catch (error) {
    const stdout = error.stdout ?? "";
    return { exitCode: error.code, stdout, stderr: error.stderr ?? "", json: stdout ? JSON.parse(stdout) : {} };
  }
}

function sqliteConfiguration(storePath, sqliteBinary, locator = "w05-disposable") {
  return {
    source: { kind: "synthetic-test", locator },
    authority_mode: "sqlite",
    sqlite: { database_url: storePath, sqlite_bin: sqliteBinary },
  };
}

function markdownConfiguration(root, locator = "w05-disposable") {
  return {
    source: { kind: "synthetic-test", locator },
    authority_mode: "markdown",
    markdown: { workspace_root: root },
  };
}

function context(view, purpose) {
  return {
    view_id: view.id,
    view_policy_revision_id: view.policy_revision_id,
    purpose,
    requested_audience_ceiling: "private",
  };
}

function recordContext(marker, purpose) {
  return context({ id: marker.view.id, policy_revision_id: marker.view.policy_revision_id }, purpose);
}

function caseRecord(namespaceId = ids.namespace) {
  return {
    id: ids.case,
    home_namespace_id: namespaceId,
    state: "active",
    title: "Persistence parity",
    summary: "A minimal Case shared by SQLite and Markdown variants.",
    scope: "Bounded lexical persistence proof only.\n## Embedded heading\n- content, not structure.",
  };
}

function frameRecord(namespaceId = ids.namespace) {
  return {
    id: ids.frame,
    home_namespace_id: namespaceId,
    authority_scope_namespace_ids: [namespaceId],
    status: "active",
    title: "Cross-variant proof",
    outcome: "Show current and legacy Markdown parity.",
    included_scope: ["Synthetic interchange", "A multiline value\nwith a bullet-like - fragment"],
    excluded_scope: ["Full Markdown operation"],
    limitations: "No history, events, checkpoints, snapshots, or global search.",
    completion_condition: "Deterministic reparse preserves normalized records.",
    discovery: [{
      id: ids.discovery,
      display_label: "AT-001",
      display_order: 0,
      lifecycle: "active",
      category: "frontier",
      title: "Persistence frontier: quoted \"content\"",
      body: "Verify stable identity and lexical parity without similarity matching.\n## This heading remains body text.",
      human_authority: "unclear",
      dependencies: [],
    }],
  };
}

function emptyManifest() {
  return {
    manifest_version: 1,
    format: L01_INTERCHANGE_FORMAT,
    identity_rule: L01_IDENTITY_RULE,
    records: [],
  };
}

function marker(overrides = {}) {
  return {
    configuration_version: 1,
    authority_mode: "markdown",
    profile: L01_WORKSPACE_PROFILE,
    workspace_id: ids.markdownStore,
    view: {
      id: ids.markdownView,
      policy_revision_id: ids.markdownPolicy,
      audience_ceiling: "private",
    },
    interchange_manifest_sha256: sha256(canonicalJson(emptyManifest())),
    ...overrides,
  };
}

async function makeRoot(label) {
  return mkdtemp(path.join(os.tmpdir(), `casebook-persistence-${label}-`));
}

async function removeAndVerify(root) {
  await rm(root, { recursive: true, force: true });
  assert.equal(await stat(root).then(() => true).catch(() => false), false);
}

async function writeWorkspace(root, records, options = {}) {
  await mkdir(root, { recursive: true });
  const rendered = renderInterchange(records, { discoveryFilenameByFrame: options.discoveryFilenameByFrame });
  const workspaceMarker = {
    ...(options.marker ?? marker()),
    interchange_manifest_sha256: rendered.manifest_sha256,
  };
  await writeFile(path.join(root, WORKSPACE_MARKER), canonicalJson(workspaceMarker));
  for (const file of rendered.files) {
    const destination = path.join(root, file.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.content);
  }
  await writeFile(path.join(root, INTERCHANGE_MANIFEST), rendered.manifest_bytes);
  return { workspaceMarker, rendered };
}

async function writeEmptyWorkspace(root, workspaceMarker = marker()) {
  await mkdir(root, { recursive: true });
  const manifestBytes = canonicalJson(emptyManifest());
  await writeFile(path.join(root, WORKSPACE_MARKER), canonicalJson({
    ...workspaceMarker,
    interchange_manifest_sha256: sha256(manifestBytes),
  }));
  await writeFile(path.join(root, INTERCHANGE_MANIFEST), manifestBytes);
  return { ...workspaceMarker, interchange_manifest_sha256: sha256(manifestBytes) };
}

async function writeExportedWorkspace(root, exported, workspaceMarker) {
  await mkdir(root, { recursive: true });
  workspaceMarker.interchange_manifest_sha256 = exported.manifest_sha256;
  await writeFile(path.join(root, WORKSPACE_MARKER), canonicalJson(workspaceMarker));
  for (const file of exported.files) {
    assert.equal(sha256(file.content), file.sha256);
    const destination = path.join(root, file.path);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.content);
  }
  await writeFile(path.join(root, INTERCHANGE_MANIFEST), exported.manifest_bytes);
}

function markdownRequest(operation, root, workspaceMarker, extra = {}) {
  return {
    protocol,
    operation,
    request_version: 1,
    store_id: workspaceMarker.workspace_id,
    context: recordContext(workspaceMarker, `W05 ${operation}`),
    configuration: markdownConfiguration(root),
    ...extra,
  };
}

async function initialize(entrypoint, root, storePath, sqliteBinary, operationId) {
  const response = await invoke(entrypoint, root, {
    protocol,
    operation: "initialize_store",
    operation_id: operationId,
    authority_claim: authorityClaim,
    configuration: sqliteConfiguration(storePath, sqliteBinary),
  });
  assert.equal(response.exitCode, 0, response.stderr);
  return response.json.result.initialization;
}

function sqliteRequest(operation, storePath, sqliteBinary, initialized, extra = {}) {
  return {
    protocol,
    operation,
    request_version: 1,
    store_id: initialized.store_id,
    context: context(initialized.view, `W05 ${operation}`),
    configuration: sqliteConfiguration(storePath, sqliteBinary),
    ...extra,
  };
}

function caseCreate(base, record, operationId) {
  return {
    ...base,
    operation: "case.create",
    operation_id: operationId,
    expected_revision: 0,
    commit_basis: "explicit synthetic W05 interchange import",
    provenance: { acting_role: "case-intake", authority_basis: "synthetic parity proof" },
    case: record,
  };
}

function frameCreate(base, record, operationId) {
  return {
    ...base,
    operation: "frame.create",
    operation_id: operationId,
    expected_revision: 0,
    commit_basis: "explicit synthetic W05 interchange import",
    provenance: { acting_role: "frame", authority_basis: "synthetic parity proof" },
    frame: record,
  };
}

function normalizedItems(response) {
  return response.json.result.items.map(({ matched_fields: _matchedFields, lexical_score: _score, ...item }) => item);
}

async function createSqliteFixtures(entrypoint, root, storePath, sqliteBinary, initialized) {
  const base = sqliteRequest("case.create", storePath, sqliteBinary, initialized);
  const createdCase = await invoke(entrypoint, root, caseCreate(base, caseRecord(initialized.namespace.id), "operation:w05-case-create"));
  const createdFrame = await invoke(entrypoint, root, frameCreate(base, frameRecord(initialized.namespace.id), "operation:w05-frame-create"));
  assert.equal(createdCase.exitCode, 0, createdCase.stderr);
  assert.equal(createdFrame.exitCode, 0, createdFrame.stderr);
}

async function selectDigestVerifiedMutation(workspaceRoot, written, manifestField, mutate) {
  const manifest = structuredClone(written.rendered.manifest);
  const record = manifest.records[0];
  const relativePath = record[manifestField];
  const selectedPath = path.join(workspaceRoot, relativePath);
  const mutated = mutate(await readFile(selectedPath, "utf8"));
  await writeFile(selectedPath, mutated);
  record[manifestField === "path" ? "sha256" : manifestField.replace("_path", "_sha256")] = sha256(mutated);
  const manifestBytes = canonicalJson(manifest);
  await writeFile(path.join(workspaceRoot, INTERCHANGE_MANIFEST), manifestBytes);
  await writeFile(path.join(workspaceRoot, WORKSPACE_MARKER), canonicalJson({
    ...written.workspaceMarker,
    interchange_manifest_sha256: sha256(manifestBytes),
  }));
}

async function sqliteOwnerCount(sqliteBinary, storePath) {
  const { stdout } = await new Promise((resolve, reject) => execFile(sqliteBinary, ["-json", storePath, "SELECT count(*) AS count FROM owners;"], { encoding: "utf8" }, (error, stdout, stderr) => error ? reject(Object.assign(error, { stderr })) : resolve({ stdout })));
  return JSON.parse(stdout)[0].count;
}

test("synthetic Case, current Frame, and legacy Frame parse to identical W04 normalized records without renaming", async () => {
  const root = await makeRoot("w05-current-legacy");
  try {
    const currentRoot = path.join(root, "current");
    const legacyRoot = path.join(root, "legacy");
    const records = [
      { kind: "case", id: ids.case, record: caseRecord() },
      { kind: "frame", id: ids.frame, record: frameRecord() },
    ];
    const current = await writeWorkspace(currentRoot, records);
    const legacyMarker = marker({
      workspace_id: ids.legacyMarkdownStore,
      view: { id: ids.legacyMarkdownView, policy_revision_id: ids.legacyMarkdownPolicy, audience_ceiling: "private" },
    });
    const legacy = await writeWorkspace(legacyRoot, records, {
      marker: legacyMarker,
      discoveryFilenameByFrame: { [ids.frame]: "discovery-map.md" },
    });
    const currentParsed = await invoke(markdownEntrypoint, root, markdownRequest("interchange.parse", currentRoot, current.workspaceMarker));
    const legacyParsed = await invoke(markdownEntrypoint, root, markdownRequest("interchange.parse", legacyRoot, legacy.workspaceMarker));
    assert.equal(currentParsed.exitCode, 0, currentParsed.stderr);
    assert.equal(legacyParsed.exitCode, 0, legacyParsed.stderr);
    assert.deepEqual(currentParsed.json.result.records, records);
    assert.deepEqual(legacyParsed.json.result.records, records);
    assert.equal(currentParsed.json.result.reconcile_disposition, "requires-explicit-case-reconcile");
    assert.equal(currentParsed.json.result.requires_case_reconcile, true);
    const frameOnlyRoot = path.join(root, "frame-only");
    const frameOnly = await writeWorkspace(frameOnlyRoot, [records[1]]);
    const frameOnlyParsed = await invoke(markdownEntrypoint, root, markdownRequest("interchange.parse", frameOnlyRoot, frameOnly.workspaceMarker));
    assert.equal(frameOnlyParsed.exitCode, 0, frameOnlyParsed.stderr);
    assert.equal(frameOnlyParsed.json.result.reconcile_disposition, "not_applicable");
    assert.equal(frameOnlyParsed.json.result.requires_case_reconcile, false);
    assert.deepEqual(frameOnlyParsed.json.result.semantic_evidence.affected_visible_ids, []);
    assert.deepEqual(currentParsed.json.result.selected_discovery_filenames, [{ frame_id: ids.frame, filename: "discovery.md" }]);
    assert.deepEqual(legacyParsed.json.result.selected_discovery_filenames, [{ frame_id: ids.frame, filename: "discovery-map.md" }]);
    const legacyDirectory = path.dirname(path.join(legacyRoot, legacy.rendered.files.find((file) => file.path.endsWith("discovery-map.md")).path));
    assert.equal(await stat(path.join(legacyDirectory, "discovery-map.md")).then(() => true), true);
    assert.equal(await stat(path.join(legacyDirectory, "discovery.md")).then(() => true).catch(() => false), false);
  } finally {
    await removeAndVerify(root);
  }
});

test("SQLite export is deterministic, selects no authority, and reparses with common resolve/list/search identity parity", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await makeRoot("w05-roundtrip");
  try {
    const storePath = path.join(root, "store.sqlite3");
    const initialized = await initialize(sqliteEntrypoint, root, storePath, sqliteBinary, "operation:w05-roundtrip-init");
    await createSqliteFixtures(sqliteEntrypoint, root, storePath, sqliteBinary, initialized);
    const exportRequest = sqliteRequest("interchange.export", storePath, sqliteBinary, initialized, { owner_ids: [ids.frame, ids.case] });
    const first = await invoke(sqliteEntrypoint, root, exportRequest);
    const second = await invoke(sqliteEntrypoint, root, exportRequest);
    assert.equal(first.exitCode, 0, first.stderr);
    assert.equal(second.exitCode, 0, second.stderr);
    assert.deepEqual(second.json.result, first.json.result);
    assert.equal(first.json.result.authority_selected, false);
    assert.equal(first.json.result.manifest.format, L01_INTERCHANGE_FORMAT);
    assert.match(first.json.result.files.find((file) => file.path.startsWith("cases/")).content, /^---\ntype: "case"/);

    const markdownRoot = path.join(root, "exported-markdown");
    // The exported transport is explicitly selected in a distinct disposable
    // Markdown workspace identity; the SQLite store never becomes dual authority.
    const workspaceMarker = marker();
    await writeExportedWorkspace(markdownRoot, first.json.result, workspaceMarker);
    const parsed = await invoke(markdownEntrypoint, root, markdownRequest("interchange.parse", markdownRoot, workspaceMarker));
    assert.equal(parsed.exitCode, 0, parsed.stderr);

    const sqliteListRequest = sqliteRequest("common.list", storePath, sqliteBinary, initialized, { owner_kinds: ["case", "frame"] });
    const markdownListRequest = markdownRequest("common.list", markdownRoot, workspaceMarker, { owner_kinds: ["case", "frame"] });
    const sqliteList = await invoke(sqliteEntrypoint, root, sqliteListRequest);
    const markdownList = await invoke(markdownEntrypoint, root, markdownListRequest);
    assert.equal(sqliteList.exitCode, 0, sqliteList.stderr);
    assert.equal(markdownList.exitCode, 0, markdownList.stderr);
    assert.deepEqual(parsed.json.result.records.map(({ kind, ...item }) => ({ owner_kind: kind, ...item })), sqliteList.json.result.items);
    assert.deepEqual(markdownList.json.result.items, sqliteList.json.result.items);
    for (const field of ["status", "index_state", "result_completeness", "stable_sort"]) {
      assert.equal(markdownList.json.result[field], sqliteList.json.result[field]);
    }

    for (const ownerId of [ids.case, ids.frame]) {
      const sqliteResolved = await invoke(sqliteEntrypoint, root, sqliteRequest("common.resolve", storePath, sqliteBinary, initialized, { owner_id: ownerId }));
      const markdownResolved = await invoke(markdownEntrypoint, root, markdownRequest("common.resolve", markdownRoot, workspaceMarker, { owner_id: ownerId }));
      assert.equal(sqliteResolved.exitCode, 0, sqliteResolved.stderr);
      assert.equal(markdownResolved.exitCode, 0, markdownResolved.stderr);
      assert.deepEqual(markdownResolved.json.result.item, sqliteResolved.json.result.item);
    }

    const searchExtra = { owner_kinds: ["case", "frame"], query: "persistence", limit: 10 };
    const sqliteSearch = await invoke(sqliteEntrypoint, root, sqliteRequest("common.search", storePath, sqliteBinary, initialized, searchExtra));
    const markdownSearch = await invoke(markdownEntrypoint, root, markdownRequest("common.search", markdownRoot, workspaceMarker, searchExtra));
    assert.equal(sqliteSearch.exitCode, 0, sqliteSearch.stderr);
    assert.equal(markdownSearch.exitCode, 0, markdownSearch.stderr);
    assert.deepEqual(markdownSearch.json.result.items, sqliteSearch.json.result.items);
    assert.deepEqual(markdownSearch.json.result.items.map((item) => item.id), [ids.case, ids.frame]);
    assert.equal(markdownSearch.json.result.stable_sort, sqliteSearch.json.result.stable_sort);
  } finally {
    await removeAndVerify(root);
  }
});

test("Markdown typed create/read remains synthetic and import mutates SQLite only after explicit parse/reconciliation", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await makeRoot("w05-explicit-import");
  try {
    const storePath = path.join(root, "destination.sqlite3");
    const initialized = await initialize(sqliteEntrypoint, root, storePath, sqliteBinary, "operation:w05-import-init");
    const markdownRoot = path.join(root, "markdown-source");
    const workspaceMarker = marker();
    await mkdir(markdownRoot, { recursive: true });
    await writeFile(path.join(markdownRoot, WORKSPACE_MARKER), canonicalJson(workspaceMarker));
    await writeFile(path.join(markdownRoot, INTERCHANGE_MANIFEST), canonicalJson(emptyManifest()));
    const markdownBase = markdownRequest("case.create", markdownRoot, workspaceMarker);
    const recordCase = caseRecord(initialized.namespace.id);
    const recordFrame = frameRecord(initialized.namespace.id);
    const createdCase = await invoke(markdownEntrypoint, root, caseCreate(markdownBase, recordCase, "operation:w05-markdown-case"));
    const createdFrame = await invoke(markdownEntrypoint, root, frameCreate(markdownBase, recordFrame, "operation:w05-markdown-frame"));
    assert.equal(createdCase.exitCode, 0, createdCase.stderr);
    assert.equal(createdFrame.exitCode, 0, createdFrame.stderr);
    assert.equal("revision" in createdCase.json.result, false);
    assert.equal("receipt" in createdFrame.json.result, false);
    const readCase = await invoke(markdownEntrypoint, root, markdownRequest("case.read", markdownRoot, workspaceMarker, { case_id: ids.case }));
    const readFrame = await invoke(markdownEntrypoint, root, markdownRequest("frame.read", markdownRoot, workspaceMarker, { frame_id: ids.frame }));
    assert.deepEqual(readCase.json.result.case, recordCase);
    assert.deepEqual(readFrame.json.result.frame, recordFrame);

    assert.equal(await sqliteOwnerCount(sqliteBinary, storePath), 0, "Markdown writes must not watch, mirror, or import into SQLite");
    const prepared = await invoke(markdownEntrypoint, root, markdownRequest("interchange.parse", markdownRoot, workspaceMarker));
    assert.equal(prepared.exitCode, 0, prepared.stderr);
    assert.equal(prepared.json.result.mutation_performed, false);
    assert.equal(prepared.json.result.identity_basis, "verified_frontmatter_and_manifest");
    assert.equal(await sqliteOwnerCount(sqliteBinary, storePath), 0, "explicit parse remains non-mutating");

    const sqliteBase = sqliteRequest("case.create", storePath, sqliteBinary, initialized);
    for (const item of prepared.json.result.records) {
      const request = item.kind === "case"
        ? caseCreate(sqliteBase, item.record, "operation:w05-explicit-case-import")
        : frameCreate(sqliteBase, item.record, "operation:w05-explicit-frame-import");
      const imported = await invoke(sqliteEntrypoint, root, request);
      assert.equal(imported.exitCode, 0, imported.stderr);
    }
    assert.equal(await sqliteOwnerCount(sqliteBinary, storePath), 2);
    const importedList = await invoke(sqliteEntrypoint, root, sqliteRequest("common.list", storePath, sqliteBinary, initialized, { owner_kinds: ["case", "frame"] }));
    assert.deepEqual(importedList.json.result.items, prepared.json.result.records.map(({ kind, ...item }) => ({ owner_kind: kind, ...item })));
  } finally {
    await removeAndVerify(root);
  }
});

test("Markdown Case and Frame creates reject symlinked write parents without outside artifacts", async (t) => {
  const root = await makeRoot("w05-source-containment");
  try {
    const scenarios = [
      {
        name: "case cases parent",
        operation: "case.create",
        prepare: async (workspaceRoot, outside) => symlink(outside, path.join(workspaceRoot, "cases")),
        request: (workspaceRoot, workspaceMarker) => caseCreate(
          markdownRequest("case.create", workspaceRoot, workspaceMarker),
          caseRecord(),
          "operation:w05-containment-case",
        ),
        outsideArtifacts: [`${ids.case.slice(ids.case.indexOf(":") + 1)}.md`],
      },
      {
        name: "frame frames parent",
        operation: "frame.create",
        prepare: async (workspaceRoot, outside) => symlink(outside, path.join(workspaceRoot, "frames")),
        request: (workspaceRoot, workspaceMarker) => frameCreate(
          markdownRequest("frame.create", workspaceRoot, workspaceMarker),
          frameRecord(),
          "operation:w05-containment-frame-parent",
        ),
        outsideArtifacts: ["frame.md", "discovery.md"],
      },
      {
        name: "frame nested parent",
        operation: "frame.create",
        prepare: async (workspaceRoot, outside) => {
          await mkdir(path.join(workspaceRoot, "frames"));
          await symlink(outside, path.join(workspaceRoot, "frames", ids.frame.slice(ids.frame.indexOf(":") + 1)));
        },
        request: (workspaceRoot, workspaceMarker) => frameCreate(
          markdownRequest("frame.create", workspaceRoot, workspaceMarker),
          frameRecord(),
          "operation:w05-containment-frame-nested",
        ),
        outsideArtifacts: ["frame.md", "discovery.md"],
      },
    ];
    for (const [index, scenario] of scenarios.entries()) {
      await t.test(scenario.name, async () => {
        const workspaceRoot = path.join(root, `workspace-${index}`);
        const outside = path.join(root, `outside-${index}`);
        await mkdir(outside, { recursive: true });
        const workspaceMarker = await writeEmptyWorkspace(workspaceRoot);
        const manifestBefore = await readFile(path.join(workspaceRoot, INTERCHANGE_MANIFEST));
        await scenario.prepare(workspaceRoot, outside);
        const rejected = await invoke(markdownEntrypoint, root, scenario.request(workspaceRoot, workspaceMarker));
        assert.equal(rejected.exitCode, 2, rejected.stderr);
        assert.equal(rejected.json.failure.code, "markdown.path_invalid");
        assert.equal(rejected.json.failure.evidence.violations[0].rule, "real_directory_parent_required");
        assert.deepEqual(await readFile(path.join(workspaceRoot, INTERCHANGE_MANIFEST)), manifestBefore);
        for (const artifact of scenario.outsideArtifacts) {
          assert.equal(await stat(path.join(outside, artifact)).then(() => true).catch(() => false), false, artifact);
        }
      });
    }
  } finally {
    await removeAndVerify(root);
  }
});

test("digest-verified Case, Frame, and Discovery Markdown reject every unconsumed grammar shape", async (t) => {
  const root = await makeRoot("w05-exact-grammar");
  try {
    const mutations = [
      {
        name: "Case unknown Relationships heading",
        records: [{ kind: "case", id: ids.case, record: caseRecord() }],
        field: "path",
        mutate: (bytes) => bytes.replace("## Knowledge\n", "## Relationships\nunsupported\n\n## Knowledge\n"),
        rule: "heading_unsupported",
      },
      {
        name: "Case duplicate heading",
        records: [{ kind: "case", id: ids.case, record: caseRecord() }],
        field: "path",
        mutate: (bytes) => bytes.replace("## Knowledge\n", "## Scope\n\n## Knowledge\n"),
        rule: "heading_duplicate",
      },
      {
        name: "Case prose outside sections",
        records: [{ kind: "case", id: ids.case, record: caseRecord() }],
        field: "path",
        mutate: (bytes) => bytes.replace("## Scope\n", "unsupported prose\n## Scope\n"),
        rule: "body_outside_section",
      },
      {
        name: "Case body in empty Knowledge section",
        records: [{ kind: "case", id: ids.case, record: caseRecord() }],
        field: "path",
        mutate: (bytes) => bytes.replace("## Knowledge\n\n## Sources", "## Knowledge\nunsupported prose\n\n## Sources"),
        rule: "section_body_unsupported",
      },
      {
        name: "Frame unknown Relationships heading",
        records: [{ kind: "frame", id: ids.frame, record: frameRecord() }],
        field: "frame_path",
        mutate: (bytes) => bytes.replace("## Discovery\n", "## Relationships\nunsupported\n\n## Discovery\n"),
        rule: "heading_unsupported",
      },
      {
        name: "Frame duplicate heading",
        records: [{ kind: "frame", id: ids.frame, record: frameRecord() }],
        field: "frame_path",
        mutate: (bytes) => bytes.replace("## Included Scope\n", "## Outcome\n\n## Included Scope\n"),
        rule: "heading_duplicate",
      },
      {
        name: "Frame unsupported Discovery prose",
        records: [{ kind: "frame", id: ids.frame, record: frameRecord() }],
        field: "frame_path",
        mutate: (bytes) => bytes.replace("See the manifest-selected Discovery file.", "See the manifest-selected Discovery file.\nUnsupported prose."),
        rule: "discovery_reference_invalid",
      },
      {
        name: "Discovery unknown Relationships heading",
        records: [{ kind: "frame", id: ids.frame, record: frameRecord() }],
        field: "discovery_path",
        mutate: (bytes) => `${bytes}\n## Relationships\nunsupported\n`,
        rule: "heading_unsupported",
      },
      {
        name: "Discovery duplicate category heading",
        records: [{ kind: "frame", id: ids.frame, record: frameRecord() }],
        field: "discovery_path",
        mutate: (bytes) => `${bytes}\n## Frontier\n`,
        rule: "heading_duplicate",
      },
      {
        name: "Discovery prose outside category",
        records: [{ kind: "frame", id: ids.frame, record: frameRecord() }],
        field: "discovery_path",
        mutate: (bytes) => `unsupported prose\n${bytes}`,
        rule: "body_outside_section",
      },
      {
        name: "Discovery prose outside item shape",
        records: [{ kind: "frame", id: ids.frame, record: frameRecord() }],
        field: "discovery_path",
        mutate: (bytes) => bytes.replace("- Human authority: unclear", "unsupported prose\n- Human authority: unclear"),
        rule: "discovery_shape_invalid",
      },
    ];
    for (const [index, mutation] of mutations.entries()) {
      await t.test(mutation.name, async () => {
        const workspaceRoot = path.join(root, `workspace-${index}`);
        const written = await writeWorkspace(workspaceRoot, mutation.records);
        await selectDigestVerifiedMutation(workspaceRoot, written, mutation.field, mutation.mutate);
        const rejected = await invoke(markdownEntrypoint, root, markdownRequest("interchange.parse", workspaceRoot, written.workspaceMarker));
        assert.equal(rejected.exitCode, 2, rejected.stderr);
        assert.equal(rejected.json.failure.code, "markdown.parse_invalid");
        assert.equal(rejected.json.failure.evidence.violations[0].rule, mutation.rule);
      });
    }
  } finally {
    await removeAndVerify(root);
  }
});

test("dual mode, hot-switch, ambiguous identity, dual Discovery files, and unsupported breadth fail without mutation", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await makeRoot("w05-negative");
  try {
    const workspaceRoot = path.join(root, "workspace");
    const records = [{ kind: "frame", id: ids.frame, record: frameRecord() }];
    const written = await writeWorkspace(workspaceRoot, records);
    const manifestPath = path.join(workspaceRoot, INTERCHANGE_MANIFEST);
    const markerPath = path.join(workspaceRoot, WORKSPACE_MARKER);
    const originalManifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const selectManifest = async (manifest) => {
      const bytes = canonicalJson(manifest);
      await writeFile(manifestPath, bytes);
      await writeFile(markerPath, canonicalJson({ ...written.workspaceMarker, interchange_manifest_sha256: sha256(bytes) }));
    };

    const dual = await invoke(markdownEntrypoint, root, {
      ...markdownRequest("common.list", workspaceRoot, written.workspaceMarker, { owner_kinds: ["frame"] }),
      configuration: { ...markdownConfiguration(workspaceRoot), sqlite: { database_url: "/tmp/forbidden.sqlite3" } },
    });
    assert.equal(dual.exitCode, 2);
    assert.equal(dual.json.failure.code, "dual_authority_rejected");
    const absentSqlite = path.join(root, "must-remain-absent.sqlite3");
    const sqliteDual = await invoke(sqliteEntrypoint, root, {
      protocol,
      operation: "common.list",
      request_version: 1,
      store_id: ids.markdownStore,
      context: recordContext(written.workspaceMarker, "reject dual SQLite/Markdown configuration"),
      owner_kinds: ["case", "frame"],
      configuration: {
        ...sqliteConfiguration(absentSqlite, sqliteBinary),
        markdown: { workspace_root: workspaceRoot },
      },
    });
    assert.equal(sqliteDual.exitCode, 2);
    assert.equal(sqliteDual.json.failure.code, "dual_authority_rejected");
    assert.equal(await stat(absentSqlite).then(() => true).catch(() => false), false);

    await writeFile(markerPath, canonicalJson({ ...written.workspaceMarker, authority_mode: "sqlite" }));
    const switched = await invoke(markdownEntrypoint, root, markdownRequest("common.list", workspaceRoot, written.workspaceMarker, { owner_kinds: ["frame"] }));
    assert.equal(switched.exitCode, 2);
    assert.equal(switched.json.failure.code, "markdown.workspace_unavailable");
    await writeFile(markerPath, canonicalJson(written.workspaceMarker));

    await writeFile(markerPath, "x".repeat(256 * 1024 + 1));
    const oversizedMarker = await invoke(markdownEntrypoint, root, markdownRequest("common.list", workspaceRoot, written.workspaceMarker, { owner_kinds: ["frame"] }));
    assert.equal(oversizedMarker.exitCode, 2);
    assert.equal(oversizedMarker.json.failure.code, "markdown.workspace_unavailable");
    await writeFile(markerPath, canonicalJson(written.workspaceMarker));

    const unverifiedManifest = structuredClone(originalManifest);
    unverifiedManifest.records[0].discovery_items[0].display_order = 7;
    await writeFile(manifestPath, canonicalJson(unverifiedManifest));
    const digestMismatch = await invoke(markdownEntrypoint, root, markdownRequest("interchange.parse", workspaceRoot, written.workspaceMarker));
    assert.equal(digestMismatch.exitCode, 2);
    assert.equal(digestMismatch.json.failure.code, "markdown.manifest_incompatible");
    await selectManifest(originalManifest);

    const ambiguous = structuredClone(originalManifest);
    ambiguous.records[0].discovery_items.push({ label: "AT-001", id: ids.ambiguousDiscovery, display_order: 1 });
    await selectManifest(ambiguous);
    const ambiguousResult = await invoke(markdownEntrypoint, root, markdownRequest("interchange.parse", workspaceRoot, written.workspaceMarker));
    assert.equal(ambiguousResult.exitCode, 2);
    assert.equal(ambiguousResult.json.failure.code, "markdown.identity_ambiguous");

    const similarityOnly = structuredClone(originalManifest);
    similarityOnly.records[0].discovery_items[0].label = "AT-999";
    await selectManifest(similarityOnly);
    const unmatched = await invoke(markdownEntrypoint, root, markdownRequest("interchange.parse", workspaceRoot, written.workspaceMarker));
    assert.equal(unmatched.exitCode, 2);
    assert.equal(unmatched.json.failure.code, "markdown.identity_unverified");
    assert.equal(JSON.stringify(unmatched.json).includes(ids.ambiguousDiscovery), false);

    await selectManifest(originalManifest);
    const discoveryRecord = originalManifest.records[0];
    const selected = path.join(workspaceRoot, discoveryRecord.discovery_path);
    await cp(selected, path.join(path.dirname(selected), "discovery-map.md"));
    const dualFiles = await invoke(markdownEntrypoint, root, markdownRequest("interchange.parse", workspaceRoot, written.workspaceMarker));
    assert.equal(dualFiles.exitCode, 2);
    assert.equal(dualFiles.json.failure.code, "markdown.identity_ambiguous");
    await rm(path.join(path.dirname(selected), "discovery-map.md"));

    const before = sha256(await readFile(manifestPath));
    const unsupportedBreadth = ["case.history", "events.read", "checkpoint.read", "snapshot.create", "global.search"];
    for (const operation of [...unsupportedBreadth, "frame.commit_revision", "interchange.export"]) {
      const rejected = await invoke(markdownEntrypoint, root, markdownRequest(operation, workspaceRoot, written.workspaceMarker));
      assert.equal(rejected.exitCode, 2, operation);
      assert.equal(rejected.json.failure.code, "not_yet_implemented", operation);
    }
    for (const operation of [...unsupportedBreadth, "interchange.parse"]) {
      const rejected = await invoke(sqliteEntrypoint, root, {
        protocol,
        operation,
        configuration: sqliteConfiguration(absentSqlite, sqliteBinary),
      });
      assert.equal(rejected.exitCode, 2, `sqlite ${operation}`);
      assert.equal(rejected.json.failure.code, "not_yet_implemented", `sqlite ${operation}`);
    }
    const punctuationSearch = { owner_kinds: ["frame"], query: "...", limit: 10 };
    const markdownPunctuation = await invoke(markdownEntrypoint, root, markdownRequest("common.search", workspaceRoot, written.workspaceMarker, punctuationSearch));
    const sqlitePunctuation = await invoke(sqliteEntrypoint, root, {
      protocol,
      operation: "common.search",
      request_version: 1,
      store_id: written.workspaceMarker.workspace_id,
      context: recordContext(written.workspaceMarker, "reject tokenless lexical search"),
      configuration: sqliteConfiguration(absentSqlite, sqliteBinary),
      ...punctuationSearch,
    });
    for (const rejected of [markdownPunctuation, sqlitePunctuation]) {
      assert.equal(rejected.exitCode, 2);
      assert.equal(rejected.json.failure.evidence.violations[0].rule, "lexical_token_required");
    }
    assert.equal(await stat(absentSqlite).then(() => true).catch(() => false), false);
    assert.equal(sha256(await readFile(manifestPath)), before);
  } finally {
    await removeAndVerify(root);
  }
});

test("generated Pi, Codex, and OpenCode copies execute deterministic SQLite export and Markdown parity without source fallback", async (t) => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const sandboxRoot = await makeRoot("w05-generated");
  try {
    const sandbox = await generateAndValidateSandbox({ sandboxRoot, sqliteBinary });
    const generatedEvidence = [];
    for (const [target, relative] of Object.entries(TARGET_LAYOUTS)) {
      await t.test(target, async () => {
        const generatedRoot = path.join(sandboxRoot, "generated-layouts", relative);
        const generatedSqlite = path.join(generatedRoot, "variants/sqlite/bin/casebook-persistence.mjs");
        const generatedMarkdown = path.join(generatedRoot, "variants/markdown/bin/casebook-persistence.mjs");
        const targetRoot = path.join(sandboxRoot, "synthetic-data", `w05-${target}`);
        await mkdir(targetRoot, { recursive: true });
        const storePath = path.join(targetRoot, "store.sqlite3");
        const initialized = await initialize(generatedSqlite, targetRoot, storePath, sqliteBinary, `operation:w05-${target}-init`);
        await createSqliteFixtures(generatedSqlite, targetRoot, storePath, sqliteBinary, initialized);
        const exported = await invoke(generatedSqlite, targetRoot, sqliteRequest("interchange.export", storePath, sqliteBinary, initialized, { owner_ids: [ids.case, ids.frame] }));
        assert.equal(exported.exitCode, 0, exported.stderr);
        const markdownRoot = path.join(targetRoot, "markdown");
        const [workspaceId, viewId, policyId] = ids.generatedMarkdown[target];
        const workspaceMarker = marker({
          workspace_id: workspaceId,
          view: { id: viewId, policy_revision_id: policyId, audience_ceiling: "private" },
        });
        await writeExportedWorkspace(markdownRoot, exported.json.result, workspaceMarker);
        const parsed = await invoke(generatedMarkdown, targetRoot, markdownRequest("interchange.parse", markdownRoot, workspaceMarker));
        assert.equal(parsed.exitCode, 0, parsed.stderr);
        const listExtra = { owner_kinds: ["case", "frame"] };
        const sqliteList = await invoke(generatedSqlite, targetRoot, sqliteRequest("common.list", storePath, sqliteBinary, initialized, listExtra));
        const markdownList = await invoke(generatedMarkdown, targetRoot, markdownRequest("common.list", markdownRoot, workspaceMarker, listExtra));
        assert.equal(sqliteList.exitCode, 0, sqliteList.stderr);
        assert.equal(markdownList.exitCode, 0, markdownList.stderr);
        assert.deepEqual(markdownList.json.result.items, sqliteList.json.result.items);
        for (const ownerId of [ids.case, ids.frame]) {
          const sqliteResolved = await invoke(generatedSqlite, targetRoot, sqliteRequest("common.resolve", storePath, sqliteBinary, initialized, { owner_id: ownerId }));
          const markdownResolved = await invoke(generatedMarkdown, targetRoot, markdownRequest("common.resolve", markdownRoot, workspaceMarker, { owner_id: ownerId }));
          assert.equal(sqliteResolved.exitCode, 0, sqliteResolved.stderr);
          assert.equal(markdownResolved.exitCode, 0, markdownResolved.stderr);
          assert.deepEqual(markdownResolved.json.result.item, sqliteResolved.json.result.item);
        }
        const searchExtra = { owner_kinds: ["case", "frame"], query: "persistence", limit: 10 };
        const sqliteSearched = await invoke(generatedSqlite, targetRoot, sqliteRequest("common.search", storePath, sqliteBinary, initialized, searchExtra));
        const searched = await invoke(generatedMarkdown, targetRoot, markdownRequest("common.search", markdownRoot, workspaceMarker, searchExtra));
        assert.equal(sqliteSearched.exitCode, 0, sqliteSearched.stderr);
        assert.equal(searched.exitCode, 0, searched.stderr);
        assert.deepEqual(searched.json.result.items, sqliteSearched.json.result.items);
        assert.deepEqual(searched.json.result.items.map((item) => item.id), [ids.case, ids.frame]);
        assert.equal(parsed.json.result.records.length, 2);
        assert.equal(exported.json.result.limitations.includes("not_l05_markdown_authority_format"), true);

        const containmentRoot = path.join(targetRoot, "containment");
        const caseWorkspace = path.join(containmentRoot, "case-workspace");
        const caseOutside = path.join(containmentRoot, "case-outside");
        await mkdir(caseOutside, { recursive: true });
        const caseMarker = await writeEmptyWorkspace(caseWorkspace, workspaceMarker);
        await symlink(caseOutside, path.join(caseWorkspace, "cases"));
        const rejectedCase = await invoke(generatedMarkdown, targetRoot, caseCreate(
          markdownRequest("case.create", caseWorkspace, caseMarker),
          caseRecord(),
          `operation:w05-${target}-containment-case`,
        ));
        assert.equal(rejectedCase.exitCode, 2, rejectedCase.stderr);
        assert.equal(rejectedCase.json.failure.code, "markdown.path_invalid");
        assert.equal(await stat(path.join(caseOutside, `${ids.case.slice(ids.case.indexOf(":") + 1)}.md`)).then(() => true).catch(() => false), false);

        const frameWorkspace = path.join(containmentRoot, "frame-workspace");
        const frameOutside = path.join(containmentRoot, "frame-outside");
        await mkdir(frameOutside, { recursive: true });
        const frameMarker = await writeEmptyWorkspace(frameWorkspace, workspaceMarker);
        await mkdir(path.join(frameWorkspace, "frames"));
        await symlink(frameOutside, path.join(frameWorkspace, "frames", ids.frame.slice(ids.frame.indexOf(":") + 1)));
        const rejectedFrame = await invoke(generatedMarkdown, targetRoot, frameCreate(
          markdownRequest("frame.create", frameWorkspace, frameMarker),
          frameRecord(),
          `operation:w05-${target}-containment-frame`,
        ));
        assert.equal(rejectedFrame.exitCode, 2, rejectedFrame.stderr);
        assert.equal(rejectedFrame.json.failure.code, "markdown.path_invalid");
        for (const artifact of ["frame.md", "discovery.md"]) {
          assert.equal(await stat(path.join(frameOutside, artifact)).then(() => true).catch(() => false), false, artifact);
        }

        generatedEvidence.push({
          record_identities: parsed.json.result.records.map((item) => `${item.kind}:${item.id}`),
          normalized_record_keys: parsed.json.result.records.map((item) => Object.keys(item.record).sort()),
          export_paths: exported.json.result.files.map((file) => file.path),
          search_identities: searched.json.result.items.map((item) => item.id),
          search_result_fields: Object.keys(searched.json.result).sort(),
        });
      });
    }
    assert.equal(generatedEvidence.length, 3);
    assert.deepEqual(generatedEvidence[1], generatedEvidence[0]);
    assert.deepEqual(generatedEvidence[2], generatedEvidence[0]);
  } finally {
    assert.equal(await cleanupSandbox(sandboxRoot), true);
  }
});
