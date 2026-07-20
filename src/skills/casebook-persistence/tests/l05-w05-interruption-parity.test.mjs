import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  canonicalJson,
  INTERCHANGE_MANIFEST,
  L01_WORKSPACE_PROFILE,
  WORKSPACE_MARKER,
} from "../shared/l01-interchange.mjs";
import { cleanupSandbox, generateAndValidateSandbox, selectCompatibleSqliteBinary } from "./sandbox-harness.mjs";

const protocol = { id: "casebook-persistence-json", version: 1 };
const packageRoot = new URL("..", import.meta.url).pathname;
const source = {
  sqlite: path.join(packageRoot, "variants/sqlite/bin/casebook-persistence.mjs"),
  markdown: path.join(packageRoot, "variants/markdown/bin/casebook-persistence.mjs"),
};
const ids = Object.freeze({
  case: "case:10548fc7-8247-4f03-9cc6-43a1fb30fa6f",
  frame: "frame:95e76625-de1c-44f3-9102-b6ad9c78ed28",
  discovery: "discovery:5b395498-cfa1-4fd8-8c08-fbe6b8fcc79f",
  boundary: "disposition-boundary:63a1d210-4cf8-450c-9655-690d26234d1c",
  pending: "case-disposition:867cdeca-67df-489c-988c-cf5994ed947e",
  awaiting: "case-disposition:8e16aeed-b2d7-4379-859a-80a71417b79c",
  noCase: "case-disposition:2fcd44f1-8290-442f-8f4a-c7662dbe2f84",
  markdownStore: "store:3b1714c8-127e-4e67-85e4-0c32bb8da7c2",
  markdownView: "view:6fba8d40-2ec0-4438-bf17-18d69065f44b",
  markdownPolicy: "view-policy:1f3e92c8-145e-410f-9937-7d29c89f7fe2",
  parseStore: "store:28ceee0c-0297-471c-b8cf-dee3ec42a359",
  parseView: "view:8cd23720-d231-4425-9885-3f756b87494e",
  parsePolicy: "view-policy:d00fabaf-149b-49c9-8158-ea91b62d450a",
});
const FRAME_SELECTOR = ".casebook-frame-selected-generation.json";
const CASE_STAGE_PREFIX = ".casebook-owned-case-stage-";
const FRAME_STAGE_PREFIX = ".casebook-owned-frame-stage-";
const FRAME_GENERATION_PREFIX = ".casebook-owned-frame-generation-";

function invoke(entrypoint, cwd, request, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [entrypoint], {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? "", HOME: cwd, ...extraEnv },
    }, (error, stdout, stderr) => resolve({
      exitCode: error ? 2 : 0,
      json: stdout ? JSON.parse(stdout) : {},
      stderr,
    }));
    child.stdin.end(JSON.stringify(request));
  });
}

function sqliteConfiguration(database, sqliteBinary, locator = "l05-w05-parity") {
  return {
    source: { kind: "synthetic-test", locator },
    authority_mode: "sqlite",
    sqlite: { database_url: database, sqlite_bin: sqliteBinary },
  };
}

function markdownConfiguration(root, locator = "l05-w05-parity") {
  return {
    source: { kind: "synthetic-test", locator },
    authority_mode: "markdown",
    markdown: { workspace_root: root },
  };
}

function marker(profile = "file-authoritative-markdown-v1", overrides = {}) {
  return {
    configuration_version: 1,
    authority_mode: "markdown",
    profile,
    workspace_id: ids.markdownStore,
    view: { id: ids.markdownView, policy_revision_id: ids.markdownPolicy, audience_ceiling: "private" },
    ...overrides,
  };
}

function context(view, purpose = "L05-W05 integrated interruption/parity gate") {
  return {
    view_id: view.id,
    view_policy_revision_id: view.policy_revision_id,
    purpose,
    requested_audience_ceiling: "private",
  };
}

function markdownRequest(root, operation, extra = {}, selectedMarker = marker()) {
  return {
    protocol,
    operation,
    request_version: 1,
    store_id: selectedMarker.workspace_id,
    context: context({ id: selectedMarker.view.id, policy_revision_id: selectedMarker.view.policy_revision_id }),
    configuration: markdownConfiguration(root),
    ...extra,
  };
}

function sqliteRequest(database, sqliteBinary, initialized, operation, extra = {}) {
  return {
    protocol,
    operation,
    request_version: 1,
    store_id: initialized.store_id,
    context: context(initialized.view),
    configuration: sqliteConfiguration(database, sqliteBinary),
    ...extra,
  };
}

function caseRecord(namespaceId, overrides = {}) {
  return {
    id: ids.case,
    home_namespace_id: namespaceId,
    state: "active",
    title: "Disposition-aware parity Case",
    summary: "One normalized Case is independently selected by each authority.",
    scope: "L05-W05 disposable end-to-end evidence.",
    ...overrides,
  };
}

function frameRecord(namespaceId, overrides = {}) {
  return {
    id: ids.frame,
    home_namespace_id: namespaceId,
    authority_scope_namespace_ids: [namespaceId],
    status: "active",
    title: "Disposition-aware parity Frame",
    outcome: "Preserve normalized Frame, Discovery, and disposition state.",
    completion_condition: "Pending classification and awaiting Case realization remain explicit blocks.",
    discovery: [{
      id: ids.discovery,
      display_order: 0,
      lifecycle: "active",
      category: "frontier",
      title: "Interruption-safe parity frontier",
      body: "Exercise coherent selected owner state without a watcher or shadow authority.",
      human_authority: "required",
      dependencies: [],
    }],
    disposition_boundaries: [{
      id: ids.boundary,
      display_label: "DB-001",
      display_order: 0,
      title: "Integrated parity boundary",
      closure: "open",
      disposition_ids: [ids.pending, ids.awaiting, ids.noCase],
    }],
    case_dispositions: [{
      id: ids.pending,
      boundary_id: ids.boundary,
      result_summary: "A material result still needs classification.",
      classification_state: "pending_classification",
      pending_reason: "Human semantic judgment has not occurred.",
      resume_condition: "Classify the retained bounded result.",
    }, {
      id: ids.awaiting,
      boundary_id: ids.boundary,
      result_summary: "Reusable meaning awaits independent Case realization.",
      classification_state: "classified",
      disposition: "reconcile",
      rationale: "The selected Case requires an explicit replacement transaction.",
      realization_state: "awaiting_case",
      case_id: ids.case,
      case_operation_id: "operation:l05-w05-case-realization",
    }, {
      id: ids.noCase,
      boundary_id: ids.boundary,
      result_summary: "Transient test output has no reusable meaning.",
      classification_state: "classified",
      disposition: "no_case",
      no_case_reason: "It is disposable harness evidence.",
    }],
    ...overrides,
  };
}

async function initializeSqlite(entrypoint, root, database, sqliteBinary, suffix = "source") {
  const result = await invoke(entrypoint, root, {
    protocol,
    operation: "initialize_store",
    operation_id: `operation:l05-w05-initialize-${suffix}`,
    authority_claim: {
      human_authorized: true,
      acting_role: "architect",
      authority_basis: "explicit disposable L05-W05 test authority",
    },
    configuration: sqliteConfiguration(database, sqliteBinary),
  });
  assert.equal(result.exitCode, 0, result.stderr);
  return result.json.result.initialization;
}

async function createSqliteCommonForms(entrypoint, root, database, sqliteBinary, initialized, suffix = "source") {
  const createdCase = await invoke(entrypoint, root, sqliteRequest(database, sqliteBinary, initialized, "case.create", {
    operation_id: `operation:l05-w05-case-create-${suffix}`,
    expected_revision: 0,
    commit_basis: "create normalized parity Case",
    provenance: { acting_role: "case", authority_basis: "disposable integrated gate" },
    case: caseRecord(initialized.namespace.id),
  }));
  assert.equal(createdCase.exitCode, 0, createdCase.stderr);
  const createdFrame = await invoke(entrypoint, root, sqliteRequest(database, sqliteBinary, initialized, "frame.create", {
    operation_id: `operation:l05-w05-frame-create-${suffix}`,
    expected_revision: 0,
    commit_basis: "create normalized disposition-aware parity Frame",
    provenance: { acting_role: "frame", authority_basis: "disposable integrated gate" },
    frame: frameRecord(initialized.namespace.id),
  }));
  assert.equal(createdFrame.exitCode, 0, createdFrame.stderr);
  assert.deepEqual(createdFrame.json.result.completion_evidence.completion_blocks.map((item) => item.kind), [
    "pending_classification",
    "awaiting_case",
  ]);
  const listed = await invoke(entrypoint, root, sqliteRequest(database, sqliteBinary, initialized, "common.list", {
    owner_kinds: ["case", "frame"],
  }));
  assert.equal(listed.exitCode, 0, listed.stderr);
  return { createdCase, createdFrame, items: listed.json.result.items };
}

async function createMarkdownWorkspace(root, selectedMarker = marker()) {
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, WORKSPACE_MARKER), canonicalJson(selectedMarker));
}

async function createMarkdownCommonForms(entrypoint, cwd, workspace, items, selectedMarker = marker(), suffix = "source") {
  const byKind = new Map(items.map((item) => [item.owner_kind, item.record]));
  const createdCase = await invoke(entrypoint, cwd, markdownRequest(workspace, "case.create", {
    operation_id: `operation:l05-w05-markdown-case-${suffix}`,
    expected_revision: 0,
    commit_basis: "select complete normalized Case",
    provenance: { acting_role: "case", authority_basis: "disposable integrated gate" },
    case: byKind.get("case"),
  }, selectedMarker));
  assert.equal(createdCase.exitCode, 0, JSON.stringify(createdCase.json));
  const createdFrame = await invoke(entrypoint, cwd, markdownRequest(workspace, "frame.create", {
    operation_id: `operation:l05-w05-markdown-frame-${suffix}`,
    expected_revision: 0,
    commit_basis: "select complete normalized Frame generation",
    provenance: { acting_role: "frame", authority_basis: "disposable integrated gate" },
    frame: byKind.get("frame"),
  }, selectedMarker));
  assert.equal(createdFrame.exitCode, 0, JSON.stringify(createdFrame.json));
  assert.deepEqual(createdFrame.json.result.completion_evidence.completion_blocks.map((item) => item.kind), [
    "pending_classification",
    "awaiting_case",
  ]);
  return { createdCase, createdFrame };
}

async function writeExportWorkspace(root, rendered) {
  const selectedMarker = marker(L01_WORKSPACE_PROFILE, {
    workspace_id: ids.parseStore,
    view: { id: ids.parseView, policy_revision_id: ids.parsePolicy, audience_ceiling: "private" },
    interchange_manifest_sha256: rendered.manifest_sha256,
  });
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

async function ownerEntries(workspace, kind) {
  const directory = path.join(workspace, kind === "case" ? "cases" : "frames", ...(kind === "frame" ? [ids.frame.slice(6)] : []));
  return readdir(directory).catch(() => []);
}

async function waitFor(predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("timed out waiting for interruption evidence");
}

function frameCommit(workspace, frame, digest, selectedMarker = marker(), operationId = "operation:l05-w05-frame-replace") {
  return markdownRequest(workspace, "frame.commit_revision", {
    operation_id: operationId,
    expected_digest: digest,
    commit_basis: "replace one complete selected Frame aggregate",
    provenance: { acting_role: "frame", authority_basis: "disposable integrated gate" },
    frame_id: ids.frame,
    frame,
  }, selectedMarker);
}

async function removeAndVerify(root) {
  await rm(root, { recursive: true, force: true });
  assert.equal(await stat(root).then(() => true).catch(() => false), false);
}

test("file-authoritative Markdown reaches disposition-aware SQLite common parity through deterministic export/reparse and interruption recovery", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l05-w05-integrated-"));
  try {
    const database = path.join(root, "sqlite-authority.sqlite3");
    const initialized = await initializeSqlite(source.sqlite, root, database, sqliteBinary);
    const sqlite = await createSqliteCommonForms(source.sqlite, root, database, sqliteBinary, initialized);
    const sqliteExportRequest = sqliteRequest(database, sqliteBinary, initialized, "interchange.export", { owner_ids: [ids.frame, ids.case] });
    const sqliteExport = await invoke(source.sqlite, root, sqliteExportRequest);
    const repeatedSqliteExport = await invoke(source.sqlite, root, sqliteExportRequest);
    assert.equal(sqliteExport.exitCode, 0, JSON.stringify(sqliteExport.json));
    assert.deepEqual(repeatedSqliteExport.json.result, sqliteExport.json.result);
    assert.equal(sqliteExport.json.result.authority_selected, false);
    const sqliteTransportRoot = path.join(root, "sqlite-export-transport");
    const sqliteTransportMarker = await writeExportWorkspace(sqliteTransportRoot, sqliteExport.json.result);
    const parsedSqliteExport = await invoke(source.markdown, root, markdownRequest(sqliteTransportRoot, "interchange.parse", {}, sqliteTransportMarker));
    assert.equal(parsedSqliteExport.exitCode, 0, JSON.stringify(parsedSqliteExport.json));
    assert.deepEqual(parsedSqliteExport.json.result.records, sqlite.items.map(({ owner_kind: kind, ...item }) => ({ kind, ...item })));
    const sqliteAuthorityBytes = await readFile(database);

    const workspace = path.join(root, "markdown-authority");
    await createMarkdownWorkspace(workspace);
    const markdown = await createMarkdownCommonForms(source.markdown, root, workspace, sqlite.items);

    const unrelatedCwd = path.join(root, "unrelated-cwd");
    await mkdir(unrelatedCwd);
    const listed = await invoke(source.markdown, unrelatedCwd, markdownRequest(workspace, "common.list", { owner_kinds: ["frame", "case"] }));
    assert.equal(listed.exitCode, 0, JSON.stringify(listed.json));
    assert.deepEqual(listed.json.result.items, sqlite.items);
    const frameRead = await invoke(source.markdown, root, markdownRequest(workspace, "frame.read", { frame_id: ids.frame }));
    assert.equal(frameRead.exitCode, 0, JSON.stringify(frameRead.json));
    assert.deepEqual(frameRead.json.result.completion_evidence, sqlite.createdFrame.json.result.completion_evidence);

    const exportRequest = markdownRequest(workspace, "interchange.export", { owner_ids: [ids.frame, ids.case] });
    const exported = await invoke(source.markdown, root, exportRequest);
    const repeated = await invoke(source.markdown, root, exportRequest);
    assert.equal(exported.exitCode, 0, JSON.stringify(exported.json));
    assert.deepEqual(repeated.json.result, exported.json.result);
    assert.equal(exported.json.result.authority_selected, false);
    const reparsedRoot = path.join(root, "reparsed-transport");
    const reparsedMarker = await writeExportWorkspace(reparsedRoot, exported.json.result);
    const reparsed = await invoke(source.markdown, root, markdownRequest(reparsedRoot, "interchange.parse", {}, reparsedMarker));
    assert.equal(reparsed.exitCode, 0, JSON.stringify(reparsed.json));
    assert.deepEqual(reparsed.json.result.records, sqlite.items.map(({ owner_kind: kind, ...item }) => ({ kind, ...item })));
    assert.equal(reparsed.json.result.mutation_performed, false);

    const dual = await invoke(source.markdown, root, {
      ...markdownRequest(workspace, "common.list", { owner_kinds: ["case", "frame"] }),
      configuration: { ...markdownConfiguration(workspace), sqlite: { database_url: path.join(root, "shadow.sqlite3") } },
    });
    assert.equal(dual.exitCode, 2);
    assert.equal(dual.json.failure.code, "dual_authority_rejected");
    assert.equal(await stat(path.join(root, "shadow.sqlite3")).then(() => true).catch(() => false), false);

    const casePath = path.join(workspace, "cases", `${ids.case.slice(5)}.md`);
    const originalCase = await readFile(casePath, "utf8");
    const originalDigest = markdown.createdCase.json.result.persistence.content_digest;
    const revisedCase = { ...sqlite.items.find((item) => item.owner_kind === "case").record, title: "Atomically replaced parity Case" };
    const replaceCase = (value, digest) => markdownRequest(workspace, "case.commit_revision", {
      operation_id: "operation:l05-w05-case-replace",
      expected_digest: digest,
      commit_basis: "replace one complete Case dossier",
      provenance: { acting_role: "case", authority_basis: "disposable integrated gate" },
      case: value,
    });
    const corrupted = await invoke(source.markdown, root, replaceCase(revisedCase, originalDigest), { CASEBOOK_MARKDOWN_TEST_FAULT: "corrupt_staged_case" });
    assert.equal(corrupted.exitCode, 2);
    assert.equal(await readFile(casePath, "utf8"), originalCase);
    assert.deepEqual((await ownerEntries(workspace, "case")).filter((name) => name.startsWith(CASE_STAGE_PREFIX)), []);
    const replaced = await invoke(source.markdown, root, replaceCase(revisedCase, originalDigest));
    assert.equal(replaced.exitCode, 0, JSON.stringify(replaced.json));
    const replacedBytes = await readFile(casePath, "utf8");
    const stale = await invoke(source.markdown, root, replaceCase({ ...revisedCase, title: "Forbidden auto-merge" }, originalDigest));
    assert.equal(stale.exitCode, 2);
    assert.equal(stale.json.failure.code, "case.digest_conflict");
    assert.equal(await readFile(casePath, "utf8"), replacedBytes);
    assert.equal(replaced.json.result.limitations.includes("no_auto_merge"), true);

    const currentFrame = sqlite.items.find((item) => item.owner_kind === "frame").record;
    const initialDigest = markdown.createdFrame.json.result.persistence.aggregate_digest;
    const revisedFrame = { ...currentFrame, title: "Interruption-recovered parity Frame" };
    const owner = path.join(workspace, "frames", ids.frame.slice(6));
    const corruptFrame = await invoke(source.markdown, root, frameCommit(workspace, revisedFrame, initialDigest), { CASEBOOK_MARKDOWN_TEST_FAULT: "corrupt_staged_frame" });
    assert.equal(corruptFrame.exitCode, 2);
    assert.deepEqual((await readdir(owner)).filter((name) => name.startsWith(FRAME_STAGE_PREFIX)), []);
    assert.equal((await readdir(owner)).filter((name) => name.startsWith(FRAME_GENERATION_PREFIX)).length, 1);

    const child = spawn(process.execPath, [source.markdown], {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
      env: { PATH: process.env.PATH ?? "", HOME: root, CASEBOOK_MARKDOWN_TEST_FAULT: "stop_after_frame_generation_publish" },
    });
    child.stdin.end(JSON.stringify(frameCommit(workspace, revisedFrame, initialDigest)));
    await waitFor(async () => (await readdir(owner)).filter((name) => name.startsWith(FRAME_GENERATION_PREFIX)).length === 2);
    const selectorBefore = await readFile(path.join(owner, FRAME_SELECTOR), "utf8");
    child.kill("SIGKILL");
    await new Promise((resolve) => child.once("close", resolve));
    assert.equal(await readFile(path.join(owner, FRAME_SELECTOR), "utf8"), selectorBefore);
    const recovered = await invoke(source.markdown, root, frameCommit(workspace, revisedFrame, initialDigest));
    assert.equal(recovered.exitCode, 0, JSON.stringify(recovered.json));
    assert.equal((await readdir(owner)).filter((name) => name.startsWith(FRAME_GENERATION_PREFIX)).length, 1);
    assert.deepEqual((await readdir(owner)).filter((name) => name.startsWith(FRAME_STAGE_PREFIX)), []);
    assert.deepEqual(recovered.json.result.completion_evidence.completion_blocks.map((item) => item.kind), ["pending_classification", "awaiting_case"]);
    const staleFrame = await invoke(source.markdown, root, frameCommit(workspace, { ...revisedFrame, title: "Forbidden Frame merge" }, initialDigest));
    assert.equal(staleFrame.exitCode, 2);
    assert.equal(staleFrame.json.failure.code, "frame.digest_conflict");

    const selectedCaseBytes = await readFile(casePath, "utf8");
    await new Promise((resolve) => setTimeout(resolve, 75));
    assert.equal(await readFile(casePath, "utf8"), selectedCaseBytes, "no watcher rewrites selected Markdown");
    assert.equal(await stat(path.join(workspace, "casebook.sqlite3")).then(() => true).catch(() => false), false);
    assert.deepEqual(await readFile(database), sqliteAuthorityBytes, "Markdown operations never shadow-write the independent SQLite authority");
  } finally {
    await removeAndVerify(root);
  }
});

test("present and absent legacy dispositions stay non-mutating and preserve the selected Discovery filename", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l05-w05-legacy-"));
  try {
    const namespace = "namespace:70667a12-8ece-4986-a4ea-f209a414961a";
    const boundaryVersion = "disposition-boundary-version:53e26cbe-cf81-4b3a-99de-9d48e6b92869";
    const dispositionVersions = [
      "case-disposition-version:9af69a0a-67ed-4bc8-a62e-cd9f05db1868",
      "case-disposition-version:1c48023b-6157-4b31-aed5-f7b13cde042a",
      "case-disposition-version:2bf731c0-d0a7-49e3-81a8-fe9ba9d9b36e",
    ];
    const complete = frameRecord(namespace);
    complete.disposition_boundaries[0].version_id = boundaryVersion;
    complete.case_dispositions.forEach((item, index) => { item.version_id = dispositionVersions[index]; });
    const renderWorkspace = path.join(root, "render-authority");
    await createMarkdownWorkspace(renderWorkspace);
    await createMarkdownCommonForms(source.markdown, root, renderWorkspace, [
      { owner_kind: "case", id: ids.case, record: caseRecord(namespace) },
      { owner_kind: "frame", id: ids.frame, record: complete },
    ], marker(), "legacy-render");
    const rendered = await invoke(source.markdown, root, markdownRequest(renderWorkspace, "interchange.export", { owner_ids: [ids.frame] }));
    assert.equal(rendered.exitCode, 0, JSON.stringify(rendered.json));
    const frameBytes = rendered.json.result.files.find((file) => file.path.endsWith("frame.md")).content;
    const discoveryBytes = rendered.json.result.files.find((file) => file.path.endsWith("discovery.md")).content;

    for (const dispositionState of ["present", "absent"]) {
      const workspace = path.join(root, dispositionState);
      const selectedMarker = marker("file-authoritative-markdown-v1", {
        workspace_id: dispositionState === "present" ? ids.markdownStore : "store:238d3859-5d95-4dd3-9bd3-79430ced9377",
        view: dispositionState === "present"
          ? marker().view
          : { id: "view:0a8b8863-7c19-43e0-b244-99faf962f9e5", policy_revision_id: "view-policy:25d32fd8-ce3a-4ee4-bd3c-58bd87be398d", audience_ceiling: "private" },
      });
      const owner = path.join(workspace, "frames", ids.frame.slice(6));
      await mkdir(owner, { recursive: true });
      await writeFile(path.join(workspace, WORKSPACE_MARKER), canonicalJson(selectedMarker));
      const selectedFrame = dispositionState === "present"
        ? frameBytes
        : frameBytes.replace(/\n## Case Dispositions\n```json\n[^\n]+\n```\n$/, "");
      await writeFile(path.join(owner, "frame.md"), selectedFrame);
      await writeFile(path.join(owner, "discovery-map.md"), discoveryBytes);
      const before = await Promise.all(["frame.md", "discovery-map.md"].map((name) => readFile(path.join(owner, name), "utf8")));
      const prepared = await invoke(source.markdown, root, markdownRequest(workspace, "frame.legacy.prepare_reconciliation", { frame_id: ids.frame }, selectedMarker));
      assert.equal(prepared.exitCode, 0, JSON.stringify(prepared.json));
      assert.equal(prepared.json.result.legacy_disposition_state, dispositionState === "present" ? "present" : "absent_in_legacy");
      assert.equal(prepared.json.result.absent_in_legacy, dispositionState === "absent");
      assert.equal(prepared.json.result.requires_semantic_reconcile, true);
      assert.equal(prepared.json.result.completion_inferred, false);
      assert.equal(prepared.json.result.no_case_inferred, false);
      assert.equal(prepared.json.result.mutation_performed, false);
      assert.equal(prepared.json.result.watch_started, false);
      assert.equal(prepared.json.result.writeback_performed, false);
      assert.equal(prepared.json.result.rename_performed, false);
      assert.equal(prepared.json.result.selected_discovery_filename, "discovery-map.md");
      assert.deepEqual(await Promise.all(["frame.md", "discovery-map.md"].map((name) => readFile(path.join(owner, name), "utf8"))), before);
      assert.equal(await stat(path.join(owner, "discovery.md")).then(() => true).catch(() => false), false);
      assert.equal(await stat(path.join(owner, FRAME_SELECTOR)).then(() => true).catch(() => false), false);
    }
  } finally {
    await removeAndVerify(root);
  }
});

test("generated Pi, Codex, and OpenCode copies execute the final normalized parity gate without source fallback", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l05-w05-generated-"));
  try {
    const generated = await generateAndValidateSandbox({ sandboxRoot: root, sqliteBinary });
    const evidence = [];
    for (const target of generated.results) {
      assert.equal(target.source_fallback, false, target.target);
      const runtime = {
        sqlite: path.join(target.package_root, "variants/sqlite/bin/casebook-persistence.mjs"),
        markdown: path.join(target.package_root, "variants/markdown/bin/casebook-persistence.mjs"),
      };
      const targetRoot = path.join(root, "final-gate", target.target);
      await mkdir(targetRoot, { recursive: true });
      const database = path.join(targetRoot, "store.sqlite3");
      const initialized = await initializeSqlite(runtime.sqlite, targetRoot, database, sqliteBinary, target.target);
      const sqlite = await createSqliteCommonForms(runtime.sqlite, targetRoot, database, sqliteBinary, initialized, target.target);
      const selectedMarker = marker("file-authoritative-markdown-v1", {
        workspace_id: initialized.store_id,
        view: { id: initialized.view.id, policy_revision_id: initialized.view.policy_revision_id, audience_ceiling: "private" },
      });
      const workspace = path.join(targetRoot, "markdown");
      await createMarkdownWorkspace(workspace, selectedMarker);
      const markdown = await createMarkdownCommonForms(runtime.markdown, targetRoot, workspace, sqlite.items, selectedMarker, target.target);
      const list = await invoke(runtime.markdown, targetRoot, markdownRequest(workspace, "common.list", { owner_kinds: ["case", "frame"] }, selectedMarker));
      assert.equal(list.exitCode, 0, `${target.target}: ${JSON.stringify(list.json)}`);
      assert.deepEqual(list.json.result.items, sqlite.items, target.target);
      const exportRequest = markdownRequest(workspace, "interchange.export", { owner_ids: [ids.frame, ids.case] }, selectedMarker);
      const first = await invoke(runtime.markdown, targetRoot, exportRequest);
      const second = await invoke(runtime.markdown, targetRoot, exportRequest);
      assert.equal(first.exitCode, 0, `${target.target}: ${JSON.stringify(first.json)}`);
      assert.deepEqual(second.json.result, first.json.result, target.target);
      assert.deepEqual(markdown.createdFrame.json.result.completion_evidence.completion_blocks.map((item) => item.kind), ["pending_classification", "awaiting_case"]);
      const frame = list.json.result.items.find((item) => item.owner_kind === "frame").record;
      evidence.push({
        owner_shapes: list.json.result.items.map((item) => ({ owner_kind: item.owner_kind, id: item.id, keys: Object.keys(item.record).sort() })),
        disposition_states: frame.case_dispositions.map((item) => ({
          id: item.id,
          classification_state: item.classification_state,
          disposition: item.disposition ?? null,
          realization_state: item.realization_state ?? null,
        })),
        export_paths: first.json.result.files.map((file) => file.path),
      });
    }
    assert.equal(evidence.length, 3);
    assert.deepEqual(evidence[1], evidence[0]);
    assert.deepEqual(evidence[2], evidence[0]);
  } finally {
    assert.equal(await cleanupSandbox(root), true);
  }
});
