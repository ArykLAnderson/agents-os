import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalJson, WORKSPACE_MARKER } from "../shared/l01-interchange.mjs";
import { cleanupSandbox, generateAndValidateSandbox } from "./sandbox-harness.mjs";

const protocol = { id: "casebook-persistence-json", version: 1 };
const sourceCaseRoot = new URL("../../case/", import.meta.url).pathname;
const generatedHeader = "<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->";
const ids = Object.freeze({
  markdownStore: "store:bf242b15-1563-464d-8a77-97677bfde314",
  namespace: "namespace:feca08cb-e1c2-4a15-af90-411712fb0702",
  case: "case:e8d623cc-5287-4ad6-bbef-bed2dd53292a",
  knowledge: "knowledge:f3d3c3b1-d2be-49c5-b863-879f3d6fa549",
  source: "source:f4413b7c-4024-4afe-8571-0a5cf387640b",
});

function invoke(entrypoint, cwd, request) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [entrypoint], {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? "", HOME: cwd },
    }, (error, stdout, stderr) => resolve({
      exitCode: error ? 2 : 0,
      json: stdout ? JSON.parse(stdout) : {},
      stderr,
    }));
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

function caseRecord(namespaceId, title = "Selected authority Case") {
  return {
    id: ids.case,
    home_namespace_id: namespaceId,
    state: "active",
    title,
    summary: "Ordinary Case semantics cross the typed persistence surface.",
    scope: "Disposable L11-W01 semantic-flow evidence only.",
    aliases: [],
    facets: [],
    entries: [{
      id: ids.knowledge,
      state: "active",
      version: {
        display_label: "CK-001",
        title: "Authority remains singular",
        purpose: "Prove ordinary intake and reconcile use the selected connector.",
        classification: "accepted",
        body: "The selected persistence authority is the only writer.",
        visibility: "private",
        provenance: { acting_role: "case", authority_basis: "synthetic semantic-flow proof" },
        positions: [],
        relationships: [],
        references: [],
      },
    }],
    sources: [{
      id: ids.source,
      state: "active",
      display_label: "SRC-001",
      version: {
        title: "Synthetic semantic-flow source",
        author: "Disposable fixture",
        accessed_at: "2026-07-20T00:00:00Z",
        examined_for: "L11-W01 generated adapter behavior.",
        visibility: "private",
        locators: [{ kind: "origin", uri: "https://example.invalid/l11-w01", audience: "private" }],
        provenance: { acting_role: "case" },
      },
      fragments: [],
    }],
    relationships: [],
    references: [],
  };
}

function markdownMarker() {
  return {
    configuration_version: 2,
    authority_mode: "markdown",
    profile: "file-authoritative-markdown-v1",
    workspace_id: ids.markdownStore,
  };
}

function markdownConfiguration(workspace, target) {
  return {
    source: { kind: "generated-semantic-flow-test", locator: `sandbox:${target}:markdown` },
    authority_mode: "markdown",
    markdown: { workspace_root: workspace },
  };
}

function markdownRequest(workspace, target, operation, extra = {}) {
  const marker = markdownMarker();
  return {
    protocol,
    operation,
    request_version: 1,
    store_id: marker.workspace_id,
    configuration: markdownConfiguration(workspace, target),
    ...extra,
  };
}

function sqliteConfiguration(database, sqliteBinary, target) {
  return {
    source: { kind: "generated-semantic-flow-test", locator: `sandbox:${target}:sqlite` },
    authority_mode: "sqlite",
    sqlite: { database_url: database, sqlite_bin: sqliteBinary },
  };
}

function sqliteRequest(state, operation, extra = {}) {
  return {
    protocol,
    operation,
    request_version: 1,
    store_id: state.initialized.store_id,
    configuration: state.configuration,
    ...extra,
  };
}

async function generateCaseSkill(destination) {
  await cp(sourceCaseRoot, destination, { recursive: true, errorOnExist: true });
  const skillPath = path.join(destination, "SKILL.md");
  const source = await readFile(skillPath, "utf8");
  const frontmatterEnd = source.indexOf("\n---\n", 4);
  assert.notEqual(frontmatterEnd, -1);
  await writeFile(skillPath, `${source.slice(0, frontmatterEnd + 5)}\n${generatedHeader}\n\n${source.slice(frontmatterEnd + 5).trimStart()}`);
}

async function assertGeneratedProcedure(caseRoot) {
  const skill = await readFile(path.join(caseRoot, "SKILL.md"), "utf8");
  const persistence = await readFile(path.join(caseRoot, "references/persistence.md"), "utf8");
  const intake = await readFile(path.join(caseRoot, "references/intake.md"), "utf8");
  const reconcile = await readFile(path.join(caseRoot, "references/reconcile.md"), "utf8");
  const explore = await readFile(path.join(caseRoot, "references/explore.md"), "utf8");
  const combined = [skill, persistence, intake, reconcile, explore].join("\n");

  assert.match(skill, /casebook-persistence/);
  assert.match(persistence, /missing or ambiguous/i);
  assert.match(persistence, /Do not (?:probe|fall back)/i);
  assert.match(persistence, /no fallback or dual write/i);
  assert.match(persistence, /case\.create/);
  assert.match(persistence, /case\.commit_revision/);
  assert.match(persistence, /case\.read/);
  assert.match(persistence, /case\.search/);
  assert.match(persistence, /common\.search/);
  assert.match(persistence, /expected_revision/);
  assert.match(persistence, /expected_digest/);
  assert.match(combined, /requested_audience_ceiling.*private/i);
  assert.match(combined, /human (?:judgment|authority)/i);
  assert.match(combined, /provenance/i);
  assert.doesNotMatch(combined, /(?:write|edit) (?:the )?\.casebook\/cases\//i);
}

async function exerciseMarkdown(entrypoint, root, target) {
  const workspace = path.join(root, "markdown-authority");
  await mkdir(workspace, { recursive: true });
  await writeFile(path.join(workspace, WORKSPACE_MARKER), canonicalJson(markdownMarker()));
  const original = caseRecord(ids.namespace);
  const created = await invoke(entrypoint, root, markdownRequest(workspace, target, "case.create", {
    operation_id: `operation:l11-w01-${target}-markdown-create`,
    expected_revision: 0,
    commit_basis: "intake complete semantically selected Case",
    provenance: { acting_role: "case-intake", authority_basis: "synthetic semantic-flow proof" },
    case: original,
  }));
  assert.equal(created.exitCode, 0, `${target}: ${JSON.stringify(created.json)}`);

  const searched = await invoke(entrypoint, root, markdownRequest(workspace, target, "common.search", {
    owner_kinds: ["case"], query: "singular", limit: 10,
  }));
  assert.equal(searched.exitCode, 0, `${target}: ${JSON.stringify(searched.json)}`);
  assert.deepEqual(searched.json.result.items.map((item) => item.id), [ids.case]);

  const read = await invoke(entrypoint, root, markdownRequest(workspace, target, "case.read", { case_id: ids.case }));
  assert.equal(read.exitCode, 0, `${target}: ${JSON.stringify(read.json)}`);
  const revised = { ...read.json.result.case, title: `${target} Markdown reconciled Case` };
  const committed = await invoke(entrypoint, root, markdownRequest(workspace, target, "case.commit_revision", {
    operation_id: `operation:l11-w01-${target}-markdown-reconcile`,
    expected_digest: read.json.result.persistence.content_digest,
    commit_basis: "reconcile complete Case after typed read",
    provenance: { acting_role: "case-reconcile", authority_basis: "synthetic semantic-flow proof" },
    case: revised,
  }));
  assert.equal(committed.exitCode, 0, `${target}: ${JSON.stringify(committed.json)}`);
  assert.equal(committed.json.result.case.title, revised.title);

  const shadow = path.join(root, "forbidden-shadow.sqlite3");
  const ambiguous = await invoke(entrypoint, root, {
    ...markdownRequest(workspace, target, "case.read", { case_id: ids.case }),
    configuration: { ...markdownConfiguration(workspace, target), sqlite: { database_url: shadow } },
  });
  assert.equal(ambiguous.exitCode, 2);
  assert.equal(ambiguous.json.failure.code, "dual_authority_rejected");
  assert.equal(await stat(shadow).then(() => true).catch(() => false), false);

  const missing = await invoke(entrypoint, root, {
    ...markdownRequest(workspace, target, "case.read", { case_id: ids.case }),
    configuration: { source: { kind: "generated-semantic-flow-test", locator: `sandbox:${target}:missing` } },
  });
  assert.equal(missing.exitCode, 2);
  assert.match(missing.json.failure.code, /authority|configuration/);
}

async function exerciseSqlite(entrypoint, root, target, sqliteBinary) {
  await mkdir(root, { recursive: true });
  const database = path.join(root, "sqlite-authority.sqlite3");
  const configuration = sqliteConfiguration(database, sqliteBinary, target);
  const initializedResult = await invoke(entrypoint, root, {
    protocol,
    operation: "initialize_store",
    operation_id: `operation:l11-w01-${target}-sqlite-initialize`,
    authority_claim: {
      human_authorized: true,
      acting_role: "test-operator",
      authority_basis: "explicit disposable sandbox initialization",
    },
    configuration,
  });
  assert.equal(initializedResult.exitCode, 0, `${target}: ${JSON.stringify(initializedResult.json)}`);
  const state = { initialized: initializedResult.json.result.initialization, configuration };
  const original = caseRecord(state.initialized.namespace.id, `${target} SQLite intake Case`);
  const created = await invoke(entrypoint, root, sqliteRequest(state, "case.create", {
    operation_id: `operation:l11-w01-${target}-sqlite-create`,
    expected_revision: 0,
    commit_basis: "intake complete semantically selected Case",
    provenance: { acting_role: "case-intake", authority_basis: "synthetic semantic-flow proof" },
    case: original,
  }));
  assert.equal(created.exitCode, 0, `${target}: ${JSON.stringify(created.json)}`);

  const searched = await invoke(entrypoint, root, sqliteRequest(state, "case.search", { query: "singular", limit: 10 }));
  assert.equal(searched.exitCode, 0, `${target}: ${JSON.stringify(searched.json)}`);
  assert.deepEqual(searched.json.result.items.map((item) => item.case_id), [ids.case]);
  const read = await invoke(entrypoint, root, sqliteRequest(state, "case.read", { case_id: ids.case }));
  assert.equal(read.exitCode, 0, `${target}: ${JSON.stringify(read.json)}`);
  const revised = { ...read.json.result.case, title: `${target} SQLite reconciled Case` };
  const committed = await invoke(entrypoint, root, sqliteRequest(state, "case.commit_revision", {
    operation_id: `operation:l11-w01-${target}-sqlite-reconcile`,
    expected_revision: read.json.result.revision.number,
    commit_basis: "reconcile complete Case after typed read",
    provenance: { acting_role: "case-reconcile", authority_basis: "synthetic semantic-flow proof" },
    case: revised,
  }));
  assert.equal(committed.exitCode, 0, `${target}: ${JSON.stringify(committed.json)}`);
  assert.equal(committed.json.result.case.title, revised.title);
  assert.equal(await stat(path.join(root, "markdown-authority")).then(() => true).catch(() => false), false);
}

test("generated Pi, Codex, and OpenCode Case procedures execute selected Markdown and SQLite semantic flows without fallback", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "casebook-l11-w01-semantic-flow-"));
  try {
    const generated = await generateAndValidateSandbox({ sandboxRoot: sandbox });
    for (const target of generated.results) {
      const caseRoot = path.join(path.dirname(target.package_root), "case");
      await generateCaseSkill(caseRoot);
      await assertGeneratedProcedure(caseRoot);
      const targetRoot = path.join(sandbox, "semantic-flow", target.target);
      await mkdir(targetRoot, { recursive: true });
      await exerciseMarkdown(path.join(target.package_root, "variants/markdown/bin/casebook-persistence.mjs"), path.join(targetRoot, "markdown"), target.target);
      await exerciseSqlite(path.join(target.package_root, "variants/sqlite/bin/casebook-persistence.mjs"), path.join(targetRoot, "sqlite"), target.target, generated.sqlite_binary);
    }
  } finally {
    assert.equal(await cleanupSandbox(sandbox), true);
  }
  assert.equal(await stat(sandbox).then(() => true).catch(() => false), false);
});
