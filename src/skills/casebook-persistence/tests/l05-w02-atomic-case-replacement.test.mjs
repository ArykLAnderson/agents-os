import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalJson, WORKSPACE_MARKER } from "../shared/l01-interchange.mjs";
import { cleanupSandbox, generateAndValidateSandbox } from "./sandbox-harness.mjs";

const protocol = { id: "casebook-persistence-json", version: 1 };
const ids = {
  store: "store:05800006-f3e3-46d3-9902-f1b6307fb835",
  view: "view:a04102fc-e74d-48cb-b1fe-f2c64b7f7068",
  policy: "view-policy:096bee50-ca68-4b50-a367-da7ec316015a",
  namespace: "namespace:813b4553-d0c7-44ee-955f-7c7c9e198b8f",
  case: "case:cf1a6369-5713-427b-ad07-001f10a43a4f",
  otherCase: "case:32031f4b-5b91-4ecd-9727-77af316992e7",
};
const sourceEntrypoint = new URL("../variants/markdown/bin/casebook-persistence.mjs", import.meta.url).pathname;
const FILE_PROFILE = "file-authoritative-markdown-v1";
const STAGE_PREFIX = ".casebook-owned-case-stage-";

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function renderCase(record) {
  return `---\ntype: "case"\nschema_version: 1\nid: "${record.id}"\nhome_namespace_id: "${record.home_namespace_id}"\nstate: "${record.state}"\ntitle: ${JSON.stringify(record.title)}\nsummary: ${JSON.stringify(record.summary)}\n---\n## Scope\n\`\`\`json\n${JSON.stringify(record.scope)}\n\`\`\`\n\n## Knowledge\n\n## Sources\n`;
}

function baseCase(overrides = {}) {
  return {
    id: ids.case,
    home_namespace_id: ids.namespace,
    state: "active",
    title: "Atomic Case",
    summary: "The selected dossier before replacement.",
    scope: "L05-W02 only.",
    ...overrides,
  };
}

function marker() {
  return {
    configuration_version: 1,
    authority_mode: "markdown",
    profile: FILE_PROFILE,
    workspace_id: ids.store,
    view: {
      id: ids.view,
      policy_revision_id: ids.policy,
      audience_ceiling: "private",
    },
  };
}

function configuration(root) {
  return {
    source: { kind: "synthetic-test", locator: "l05-w02-atomic-case-replacement" },
    authority_mode: "markdown",
    markdown: { workspace_root: root },
  };
}

function context() {
  return {
    view_id: ids.view,
    view_policy_revision_id: ids.policy,
    purpose: "verify atomic Case replacement",
    requested_audience_ceiling: "private",
  };
}

function replaceRequest(root, record, expectedDigest) {
  return {
    protocol,
    operation: "case.commit_revision",
    request_version: 1,
    operation_id: "operation:l05-w02-replace",
    store_id: ids.store,
    context: context(),
    expected_digest: expectedDigest,
    commit_basis: "complete non-merging dossier replacement",
    provenance: { acting_role: "case-reconcile", authority_basis: "focused disposable test" },
    case: record,
    configuration: configuration(root),
  };
}

function readRequest(root, caseId = ids.case) {
  return {
    protocol,
    operation: "case.read",
    request_version: 1,
    store_id: ids.store,
    context: context(),
    case_id: caseId,
    configuration: configuration(root),
  };
}

function invoke(entrypoint, cwd, request, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [entrypoint], {
      cwd,
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", HOME: cwd, ...extraEnv },
    }, (error, stdout, stderr) => resolve({
      exitCode: error ? 2 : 0,
      json: JSON.parse(stdout),
      stderr,
    }));
    child.stdin.end(JSON.stringify(request));
  });
}

async function createWorkspace(parent, record = baseCase()) {
  const root = path.join(parent, "workspace");
  const cases = path.join(root, "cases");
  await mkdir(cases, { recursive: true });
  const casePath = path.join(cases, `${ids.case.slice(5)}.md`);
  const bytes = renderCase(record);
  await writeFile(path.join(root, WORKSPACE_MARKER), canonicalJson(marker()));
  await writeFile(casePath, bytes);
  return { root, cases, casePath, bytes };
}

async function ownedStages(directory) {
  return (await readdir(directory)).filter((name) => name.startsWith(STAGE_PREFIX));
}

async function removeRoot(root) {
  await rm(root, { recursive: true, force: true });
  assert.equal(await stat(root).then(() => true).catch(() => false), false);
}

async function waitFor(predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("timed out waiting for condition");
}

test("file-authoritative Case commit atomically replaces one complete dossier and stale digests never merge", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l05-w02-replace-"));
  try {
    const workspace = await createWorkspace(root);
    const next = baseCase({ title: "Atomic Case revised", summary: "A whole new selected dossier." });
    const committed = await invoke(sourceEntrypoint, root, replaceRequest(workspace.root, next, digest(workspace.bytes)));
    assert.equal(committed.exitCode, 0, JSON.stringify(committed.json));
    assert.equal(committed.json.operation, "case.commit_revision");
    assert.equal(committed.json.result.status, "settled");
    assert.equal(committed.json.result.previous_digest, digest(workspace.bytes));
    assert.equal(committed.json.result.current_digest, digest(renderCase(next)));
    assert.deepEqual(committed.json.result.case, next);
    assert.equal(await readFile(workspace.casePath, "utf8"), renderCase(next));
    assert.deepEqual(await ownedStages(workspace.cases), []);

    const staleCandidate = baseCase({ title: "Stale writer must not win" });
    const stale = await invoke(sourceEntrypoint, root, replaceRequest(workspace.root, staleCandidate, digest(workspace.bytes)));
    assert.equal(stale.exitCode, 2);
    assert.equal(stale.json.failure.code, "case.digest_conflict");
    assert.equal(stale.json.failure.retry_disposition, "after_reconcile");
    assert.equal(stale.json.failure.evidence.expected_digest, digest(workspace.bytes));
    assert.equal(stale.json.failure.evidence.current_digest, digest(renderCase(next)));
    assert.equal(await readFile(workspace.casePath, "utf8"), renderCase(next));
    assert.deepEqual(await ownedStages(workspace.cases), []);

    const read = await invoke(sourceEntrypoint, root, readRequest(workspace.root));
    assert.equal(read.exitCode, 0, JSON.stringify(read.json));
    assert.deepEqual(read.json.result.case, next);
    assert.equal(read.json.result.persistence.content_digest, digest(renderCase(next)));
    assert.deepEqual(read.json.result.limitations, [
      "no_owner_revision_history",
      "no_durable_receipt",
      "one_trusted_logical_writer",
    ]);
  } finally {
    await removeRoot(root);
  }
});

test("Case replacement rejects identity/structure changes and symlinked roots or dossiers without mutation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l05-w02-safety-"));
  try {
    const workspace = await createWorkspace(root);
    const original = await readFile(workspace.casePath, "utf8");

    const changedIdentity = await invoke(sourceEntrypoint, root, replaceRequest(
      workspace.root,
      baseCase({ id: ids.otherCase, title: "Identity substitution" }),
      digest(original),
    ));
    assert.equal(changedIdentity.exitCode, 2);
    assert.equal(changedIdentity.json.failure.code, "case.identity_conflict");
    assert.equal(await readFile(workspace.casePath, "utf8"), original);

    const malformed = await invoke(sourceEntrypoint, root, replaceRequest(
      workspace.root,
      { ...baseCase(), unexpected: "not in the complete dossier grammar" },
      digest(original),
    ));
    assert.equal(malformed.exitCode, 2);
    assert.equal(malformed.json.failure.code, "case.invalid_representation");
    assert.equal(await readFile(workspace.casePath, "utf8"), original);
    assert.deepEqual(await ownedStages(workspace.cases), []);

    const outside = path.join(root, "outside.md");
    await writeFile(outside, original);
    await rm(workspace.casePath);
    await symlink(outside, workspace.casePath);
    const dossierLink = await invoke(sourceEntrypoint, root, replaceRequest(workspace.root, baseCase({ title: "No symlink write" }), digest(original)));
    assert.equal(dossierLink.exitCode, 2);
    assert.equal(dossierLink.json.failure.code, "markdown.path_invalid");
    assert.equal(await readFile(outside, "utf8"), original);

    const linkedRoot = path.join(root, "linked-workspace");
    await symlink(workspace.root, linkedRoot);
    const rootLink = await invoke(sourceEntrypoint, root, {
      ...replaceRequest(linkedRoot, baseCase(), digest(original)),
      configuration: configuration(linkedRoot),
    });
    assert.equal(rootLink.exitCode, 2);
    assert.equal(rootLink.json.failure.code, "markdown.path_invalid");
    assert.equal((await lstat(linkedRoot)).isSymbolicLink(), true);
  } finally {
    await removeRoot(root);
  }
});

test("validation/fault cleanup keeps the old dossier selected and a killed writer leaves only attributable same-directory debris", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l05-w02-interrupt-"));
  try {
    const workspace = await createWorkspace(root);
    const originalDigest = digest(workspace.bytes);
    const next = baseCase({ title: "Interrupted candidate" });

    const validationFailure = await invoke(
      sourceEntrypoint,
      root,
      replaceRequest(workspace.root, next, originalDigest),
      { CASEBOOK_MARKDOWN_TEST_FAULT: "corrupt_staged_case" },
    );
    assert.equal(validationFailure.exitCode, 2);
    assert.equal(validationFailure.json.failure.code, "markdown.parse_invalid");
    assert.equal(await readFile(workspace.casePath, "utf8"), workspace.bytes);
    assert.deepEqual(await ownedStages(workspace.cases), []);

    const child = spawn(process.execPath, [sourceEntrypoint], {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH ?? "",
        HOME: root,
        CASEBOOK_MARKDOWN_TEST_FAULT: "stop_after_case_stage_flush",
      },
    });
    child.stdin.end(JSON.stringify(replaceRequest(workspace.root, next, originalDigest)));
    await waitFor(async () => (await ownedStages(workspace.cases)).length === 1);
    const debris = await ownedStages(workspace.cases);
    assert.equal(debris.length, 1);
    assert.match(debris[0], /^\.casebook-owned-case-stage-[0-9a-f-]{36}-\d+-[0-9a-f]+\.tmp$/);
    assert.equal(path.dirname(path.join(workspace.cases, debris[0])), path.dirname(workspace.casePath));
    assert.equal(await readFile(workspace.casePath, "utf8"), workspace.bytes);
    child.kill("SIGKILL");
    await new Promise((resolve) => child.once("close", resolve));
    assert.equal(await readFile(workspace.casePath, "utf8"), workspace.bytes);
    assert.equal((await ownedStages(workspace.cases)).length, 1);
    await rm(path.join(workspace.cases, debris[0]));
    assert.deepEqual(await ownedStages(workspace.cases), []);
  } finally {
    await removeRoot(root);
  }
});

test("generated Pi, Codex, and OpenCode copies preserve atomic Case replacement behavior", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l05-w02-generated-"));
  try {
    const generated = await generateAndValidateSandbox({ sandboxRoot: root });
    for (const target of generated.results) {
      const workspace = await createWorkspace(path.join(root, target.target));
      const entrypoint = path.join(target.package_root, "variants/markdown/bin/casebook-persistence.mjs");
      const next = baseCase({ title: `${target.target} replacement` });
      const committed = await invoke(entrypoint, root, replaceRequest(workspace.root, next, digest(workspace.bytes)));
      assert.equal(committed.exitCode, 0, `${target.target}: ${JSON.stringify(committed.json)}`);
      assert.equal(committed.json.result.current_digest, digest(renderCase(next)));
      assert.equal(await readFile(workspace.casePath, "utf8"), renderCase(next));
      assert.deepEqual(await ownedStages(workspace.cases), []);
    }
  } finally {
    assert.equal(await cleanupSandbox(root), true);
  }
  assert.equal(await stat(root).then(() => true).catch(() => false), false);
});
