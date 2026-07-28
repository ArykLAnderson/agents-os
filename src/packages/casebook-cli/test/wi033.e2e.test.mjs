import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createBootstrapAuthorizationDocument } from "../../../skills/casebook-persistence/variants/sqlite/lib/substrate/bootstrap.mjs";
import { successorDigest } from "../../../skills/casebook-persistence/variants/sqlite/lib/substrate/mechanical-successor.mjs";
import { packageCli } from "../build/package-assembly.mjs";

const packageRoot = path.resolve(import.meta.dirname, "..");
const providerEntrypoint = path.resolve(packageRoot, "../../skills/casebook-persistence/variants/sqlite/bin/casebook-persistence.mjs");
const runFile = (file, args, options = {}, input = "") => new Promise((resolve, reject) => {
  const child = execFile(file, args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
    if (error && error.code !== 0) return resolve({ code: error.code, stdout, stderr });
    if (error) return reject(error);
    resolve({ code: 0, stdout, stderr });
  });
  child.stdin.end(input);
});
const id = (kind, n) => `${kind}:70000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ids = { store: id("store", 1), workspace: id("workspace", 2), namespace: id("namespace", 3), namespaceRevision: id("owner-revision", 4), namespaceVersion: id("version", 5), profile: id("profile", 6), profileRevision: id("owner-revision", 7), profileVersion: id("version", 8), selection: id("profile-selection", 9), selectionRevision: id("owner-revision", 10), selectionVersion: id("version", 11), slot: id("admission-slot", 12), event: id("event", 13), frame: id("frame", 20), discovery: id("discovery", 21), boundary: id("disposition-boundary", 22), disposition: id("case-disposition", 23) };
const record = (owner_id, revision_id, version_id, content) => ({ owner_id, revision_id, version_id, content, content_digest: successorDigest(content) });
const profile = { schema: "admission-disclosure-profile@1", audience_ceiling: "private", lifecycle: "active", predecessor_revision_id: null, object_kinds: ["profile", "profile-selection", "namespace", "project-default", "chat", "case", "frame"], purposes: ["profile.manage", "profile.read", "substrate.commit_revision", "receipt.read", "integrity.observe", "projection.rebuild", "case.manage", "case.read", "frame.manage", "frame.read", "query.search", "context.read", "substrate.read"], bounds: { max_results: 100, max_traversal_depth: 8, max_export_bytes: 1048576 }, projection: { locator: "redacted", export: "deny" }, disclosure: { receipts: true, events: true, checkpoints: true } };
const caseAggregate = (n = 14, title = "Pack Case", phrase = "unique packed search phrase") => {
  const caseId = id("case", n), facet = id("facet", n + 100), knowledge = id("knowledge", n + 200), source = id("source", n + 300), evidence = id("evidence", n + 400), relationship = id("relationship", n + 500);
  return { id: caseId, state: "active", title, summary: "A disposable packed Case", scope: "E2E", provenance: { sources: [], support: [], authority: [] }, aliases: [title], references: [], facets: [{ id: facet, state: "active", version: { key: "status", value: "tested", visibility: "private" } }], entries: [{ id: knowledge, state: "active", version: { display_label: "K-001", title: "Packed knowledge", purpose: "proof", classification: "accepted", body: phrase, visibility: "private", provenance: { acting_role: "e2e" }, positions: [], relationships: [], references: [] } }], sources: [{ id: source, state: "active", display_label: "S-001", version: { title: "Source", accessed_at: "2026-07-28T00:00:00Z", examined_for: "proof", visibility: "private", locators: [{ kind: "origin", uri: "https://example.invalid/e2e", audience: "private" }] }, fragments: [{ id: evidence, state: "active", version: { excerpt: "evidence", purpose: "proof", captured_at: "2026-07-28T00:00:00Z", visibility: "private" } }] }], relationships: [{ id: relationship, state: "active", version: { subject: { kind: "case", id: caseId }, predicate: "contains", object: { kind: "knowledge", id: knowledge }, visibility: "private" } }] };
};
const frameAggregate = (title = "Pack Frame") => ({ id: ids.frame, status: "active", title, outcome: "E2E outcome", included_scope: ["packed route"], discovery: [{ id: ids.discovery, display_order: 0, lifecycle: "active", category: "frontier", title: "Question", body: "Frame searchable phrase", human_authority: "required", dependencies: [] }], disposition_boundaries: [{ id: ids.boundary, display_order: 0, title: "Boundary", closure: "open", disposition_ids: [ids.disposition] }], case_dispositions: [{ id: ids.disposition, boundary_id: ids.boundary, result_summary: "Pending", classification_state: "pending_classification", pending_reason: "Needs review", resume_condition: "Review" }] });

async function packed(t) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "wi033-packed-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const packed = await packageCli();
  t.after(() => packed.cleanup());
  const untarred = await runFile("tar", ["-xzf", packed.archive, "-C", sandbox]);
  assert.equal(untarred.code, 0, untarred.stderr);
  return path.join(sandbox, "package", "bin", "casebook.mjs");
}
async function initialize(workspace, store) {
  workspace = await realpath(workspace);
  const grant = path.join(workspace, "bootstrap.grant.json");
  const request = { protocol: { id: "casebook-persistence-json", version: 2 }, operation: "initialize_store", request_version: 1, operation_id: "operation:wi033-e2e-initialize", store_id: ids.store, authority_claim: { human_authorized: true, local_uid: process.getuid(), human_identity: "e2e", provenance: "disposable:wi033" }, initial: { root_namespace: record(ids.namespace, ids.namespaceRevision, ids.namespaceVersion, { schema: "namespace-bootstrap@1", display_name: "Personal", parent_id: null, lifecycle: "active" }), private_profile: record(ids.profile, ids.profileRevision, ids.profileVersion, profile), profile_selection: record(ids.selection, ids.selectionRevision, ids.selectionVersion, { schema: "profile-selection@1", admission_slot_id: ids.slot, selected_profile_id: ids.profile, selected_profile_revision_id: ids.profileRevision, lifecycle: "active", activation_fence: 1 }), project_default: null, initialization_event_id: ids.event }, configuration: { authority_mode: "sqlite", sqlite: { database_url: store } } };
  const authorization = await createBootstrapAuthorizationDocument(request, { grant_path: grant });
  request.request_digest = authorization.request_digest;
  request.bootstrap_authorization = { path: grant, sha256: authorization.sha256 };
  await writeFile(grant, `${JSON.stringify(authorization.document)}\n`, { mode: 0o600 });
  const result = await runFile(process.execPath, [providerEntrypoint], { cwd: workspace, env: { ...process.env, HOME: workspace } }, `${JSON.stringify(request)}\n`);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).ok, true, result.stdout);
}
async function invoke(bin, workspace, args, env = {}) {
  const output = await runFile(process.execPath, [bin, ...args], { cwd: workspace, env: { ...process.env, HOME: workspace, XDG_CONFIG_HOME: path.join(workspace, "config"), XDG_DATA_HOME: path.join(workspace, "data"), ...env } });
  return { ...output, json: JSON.parse(output.stdout) };
}
async function initializedWorkspace(t, prefix = "wi033-e2e-workspace-") {
  const workspace = await mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const store = path.join(workspace, "authority.sqlite");
  await initialize(workspace, store);
  await mkdir(path.join(workspace, ".casebook"));
  await writeFile(path.join(workspace, ".casebook", "settings.json"), `${JSON.stringify({ schema: "casebook-cli-settings@1", store })}\n`);
  return { workspace, store };
}

// Every invocation below starts a fresh extracted-package process. The only fault
// selector is an explicit test-hook environment value; no CLI argument or aggregate
// field can select it.
test("extracted package executes Candidate-4 Case, Frame, search cursor, receipts, refusal, and recovery matrix", { timeout: 120_000 }, async (t) => {
  const bin = await packed(t);
  const { workspace, store } = await initializedWorkspace(t);
  await runFile("git", ["init", "--quiet"], { cwd: workspace });

  const first = caseAggregate(14, "Pack Case", "cursor phrase");
  const second = caseAggregate(24, "Second Case", "cursor phrase");
  const created = await invoke(bin, workspace, ["create", "case", "--commit-basis", "e2e create", "--input", JSON.stringify(first)]);
  assert.equal(created.code, 0, `${created.stderr}\n${created.stdout}`);
  assert.equal(created.json.result.owner.id, first.id);
  const operationId = created.json.result.operation_id;
  const secondCreated = await invoke(bin, workspace, ["create", "case", "--commit-basis", "e2e create second", "--input", JSON.stringify(second)]);
  assert.equal(secondCreated.code, 0, secondCreated.stdout);
  const read = await invoke(bin, workspace, ["read", "case", "--case-id", first.id]);
  assert.equal(read.code, 0, read.stdout);
  assert.equal(read.json.result.aggregate.id, first.id);
  const revised = caseAggregate(14, "Pack Case", "cursor phrase");
  const committed = await invoke(bin, workspace, ["commit", "case", "--case-id", first.id, "--expected-revision", "1", "--commit-basis", "e2e revise", "--input", JSON.stringify(revised)]);
  assert.equal(committed.code, 0, committed.stdout);
  assert.equal(committed.json.result.revision.number, 2);

  const workspacePage = await invoke(bin, workspace, ["search", "--query", "cursor phrase", "--limit", "1"]);
  assert.equal(workspacePage.code, 0, workspacePage.stdout);
  assert.equal(workspacePage.json.result.items.length, 1);
  assert.ok(workspacePage.json.result.next_cursor);
  const continuation = await invoke(bin, workspace, ["search", "--query", "cursor phrase", "--limit", "1", "--cursor", workspacePage.json.result.next_cursor]);
  assert.equal(continuation.code, 0, continuation.stdout);
  assert.equal(continuation.json.result.items.length, 1);
  assert.notEqual(JSON.stringify(continuation.json.result.items[0]), JSON.stringify(workspacePage.json.result.items[0]));
  const namespacePage = await invoke(bin, workspace, ["search", "--query", "cursor phrase", "--namespace-id", ids.namespace, "--limit", "1"]);
  assert.equal(namespacePage.code, 0, namespacePage.stdout);
  assert.equal(namespacePage.json.result.items.length, 1);

  const receipt = await invoke(bin, workspace, ["receipt", "read", "--operation-id", operationId]);
  assert.equal(receipt.code, 0, receipt.stdout);
  assert.equal(receipt.json.result.observation, "settled");
  const status = await invoke(bin, workspace, ["operation", "status", "--operation-id", operationId]);
  assert.equal(status.code, 0, status.stdout);
  assert.equal(status.json.result.receipt.operation_id, operationId);
  const recent = await invoke(bin, workspace, ["operation", "recent", "--limit", "1"]);
  assert.equal(recent.code, 0, recent.stdout);
  assert.ok(recent.json.result.operations.length === 1);

  const madeFrame = await invoke(bin, workspace, ["create", "frame", "--commit-basis", "e2e frame", "--input", JSON.stringify(frameAggregate())]);
  assert.equal(madeFrame.code, 0, madeFrame.stdout);
  const frameCommit = await invoke(bin, workspace, ["commit", "frame", "--frame-id", ids.frame, "--expected-revision", "1", "--commit-basis", "e2e frame revise", "--input", JSON.stringify(frameAggregate("Pack Frame Revised"))]);
  assert.equal(frameCommit.code, 0, frameCommit.stdout);
  const readFrame = await invoke(bin, workspace, ["read", "frame", "--frame-id", ids.frame]);
  assert.equal(readFrame.code, 0, readFrame.stdout);
  assert.equal(readFrame.json.result.revision.number, 2);
  assert.equal(readFrame.json.result.aggregate.title, "Pack Frame Revised");

  const beforeRefusal = await readFile(store);
  const caseMismatch = await invoke(bin, workspace, ["commit", "case", "--case-id", second.id, "--expected-revision", "1", "--commit-basis", "mismatch", "--input", JSON.stringify(revised)]);
  assert.equal(caseMismatch.code, 1, caseMismatch.stdout);
  assert.equal(caseMismatch.json.failure.code, "case_id_mismatch");
  const frameMismatch = await invoke(bin, workspace, ["commit", "frame", "--frame-id", id("frame", 99), "--expected-revision", "2", "--commit-basis", "mismatch", "--input", JSON.stringify(frameAggregate())]);
  assert.equal(frameMismatch.code, 1, frameMismatch.stdout);
  assert.equal(frameMismatch.json.failure.code, "frame_id_mismatch");
  assert.deepEqual(await readFile(store), beforeRefusal);
  assert.equal((await invoke(bin, workspace, ["read", "case", "--case-id", second.id])).json.result.revision.number, 1);

  const alias = path.join(workspace, "store-link.sqlite");
  await symlink(store, alias);
  const symlinkResult = await invoke(bin, workspace, ["--store", alias, "search", "--query", "cursor phrase"]);
  assert.equal(symlinkResult.code, 2, symlinkResult.stdout);
  assert.equal(symlinkResult.json.failure.code, "store_unavailable");
  assert.deepEqual(await readFile(store), beforeRefusal);
});

test("extracted package preserves recovery identities for every possible-post-dispatch bridge fault", { timeout: 120_000 }, async (t) => {
  const bin = await packed(t);
  const { workspace } = await initializedWorkspace(t, "wi033-e2e-fault-");
  for (const [index, fault] of ["exit", "signal", "timeout", "malformed", "overflow", "contradictory"].entries()) {
    const aggregate = caseAggregate(1000 + index, `Fault ${fault}`, `fault phrase ${fault}`);
    const result = await invoke(bin, workspace, ["--workspace", workspace, "create", "case", "--commit-basis", `fault ${fault}`, "--input", JSON.stringify(aggregate)], {
      CASEBOOK_CLI_TEST_HOOK: "casebook-cli-e2e@1",
      CASEBOOK_CLI_TEST_BRIDGE_FAULT: fault,
      CASEBOOK_CLI_TEST_BRIDGE_TIMEOUT_MS: "1000",
    });
    assert.equal(result.code, 3, `${fault}: ${result.stderr}\n${result.stdout}`);
    assert.equal(result.json.status, "delivery_unknown", fault);
    assert.equal(result.json.failure.evidence.commit_may_have_occurred, true, fault);
    assert.match(result.json.failure.evidence.operation_id, /^operation:[0-9a-f-]{36}$/, fault);
    assert.deepEqual(Object.keys(result.json.failure.evidence).sort(), ["commit_may_have_occurred", "operation_id"], fault);
    const recovery = await invoke(bin, workspace, ["--workspace", workspace, "operation", "status", "--operation-id", result.json.failure.evidence.operation_id]);
    assert.equal(recovery.code, 0, `${fault}: ${recovery.stdout}`);
    assert.equal(recovery.json.result.observation, "settled", `${fault}: ${result.stdout}\n${recovery.stdout}`);
    const read = await invoke(bin, workspace, ["--workspace", workspace, "read", "case", "--case-id", aggregate.id]);
    assert.equal(read.code, 0, `${fault}: ${read.stdout}`);
    assert.equal(read.json.result.revision.number, 1, fault);
  }
});

test("extracted package shares one XDG-selected successor store across unrelated Git workspaces", { timeout: 120_000 }, async (t) => {
  const bin = await packed(t);
  const authorityRoot = await mkdtemp(path.join(os.tmpdir(), "wi033-e2e-xdg-authority-"));
  const home = await mkdtemp(path.join(os.tmpdir(), "wi033-e2e-xdg-home-"));
  const repoA = await mkdtemp(path.join(os.tmpdir(), "wi033-e2e-xdg-repo-a-"));
  const repoB = await mkdtemp(path.join(os.tmpdir(), "wi033-e2e-xdg-repo-b-"));
  t.after(async () => { for (const value of [authorityRoot, home, repoA, repoB]) await rm(value, { recursive: true, force: true }); });
  const store = path.join(authorityRoot, "successor.sqlite");
  await initialize(authorityRoot, store);
  const configHome = path.join(home, "config");
  await mkdir(path.join(configHome, "casebook"), { recursive: true });
  await writeFile(path.join(configHome, "casebook", "config.json"), `${JSON.stringify({ schema: "casebook-cli-settings@1", store })}\n`);
  await runFile("git", ["init", "--quiet"], { cwd: repoA });
  await runFile("git", ["init", "--quiet"], { cwd: repoB });
  const aggregate = caseAggregate(8100, "XDG shared Case", "shared XDG phrase");
  const env = { HOME: home, XDG_CONFIG_HOME: configHome, XDG_DATA_HOME: path.join(home, "data") };
  const created = await invoke(bin, repoA, ["create", "case", "--commit-basis", "shared store", "--input", JSON.stringify(aggregate)], env);
  assert.equal(created.code, 0, created.stdout);
  const read = await invoke(bin, repoB, ["read", "case", "--case-id", aggregate.id], env);
  assert.equal(read.code, 0, read.stdout);
  assert.equal(read.json.result.aggregate.id, aggregate.id);
  const searched = await invoke(bin, repoB, ["search", "--query", "shared XDG phrase"], env);
  assert.equal(searched.code, 0, searched.stdout);
  assert.equal(searched.json.result.items.length, 1);
  assert.equal(searched.json.authority.store, await realpath(store));
  const schema = await runFile("sqlite3", [store, "SELECT name FROM sqlite_schema WHERE name IN ('workspace_id', 'store_authority_binding');"]);
  assert.equal(schema.stdout.trim(), "");
});

test("extracted package resolves explicit, workspace, XDG, Git, nested, linked, malformed, and bare routes", { timeout: 120_000 }, async (t) => {
  const bin = await packed(t);
  const nonGit = await mkdtemp(path.join(os.tmpdir(), "wi033-e2e-routes-"));
  const home = await mkdtemp(path.join(os.tmpdir(), "wi033-e2e-home-"));
  t.after(async () => { await rm(nonGit, { recursive: true, force: true }); await rm(home, { recursive: true, force: true }); });
  const missing = path.join(nonGit, "missing.sqlite");
  const explicit = await invoke(bin, nonGit, ["--workspace", nonGit, "--store", missing, "search", "--query", "hello"]);
  assert.equal(explicit.code, 2, explicit.stdout);
  assert.equal(explicit.json.authority.resolution_source, "cli_override");
  assert.equal(explicit.json.authority.workspace, await realpath(nonGit));

  await mkdir(path.join(nonGit, ".casebook"));
  await writeFile(path.join(nonGit, ".casebook", "settings.json"), "not json");
  const malformed = await invoke(bin, nonGit, ["--workspace", nonGit, "search", "--query", "hello"]);
  assert.equal(malformed.code, 1, malformed.stdout);
  assert.equal(malformed.json.failure.code, "json_invalid");
  const stillExplicit = await invoke(bin, nonGit, ["--workspace", nonGit, "--store", missing, "search", "--query", "hello"]);
  assert.equal(stillExplicit.code, 2, stillExplicit.stdout);
  assert.equal(stillExplicit.json.authority.resolution_source, "cli_override");

  await writeFile(path.join(nonGit, ".casebook", "settings.json"), `${JSON.stringify({ schema: "casebook-cli-settings@1", store: missing })}\n`);
  const workspaceSetting = await invoke(bin, nonGit, ["--workspace", nonGit, "search", "--query", "hello"], { XDG_CONFIG_HOME: path.join(home, "config"), XDG_DATA_HOME: path.join(home, "data") });
  assert.equal(workspaceSetting.code, 2, workspaceSetting.stdout);
  assert.equal(workspaceSetting.json.authority.resolution_source, "workspace_settings");
  await writeFile(path.join(nonGit, ".casebook", "settings.json"), `${JSON.stringify({ schema: "casebook-cli-settings@1" })}\n`);
  await mkdir(path.join(home, "config", "casebook"), { recursive: true });
  await writeFile(path.join(home, "config", "casebook", "config.json"), `${JSON.stringify({ schema: "casebook-cli-settings@1", store: path.join(home, "global.sqlite") })}\n`);
  const globalConfig = await invoke(bin, nonGit, ["--workspace", nonGit, "search", "--query", "hello"], { XDG_CONFIG_HOME: path.join(home, "config"), XDG_DATA_HOME: path.join(home, "data") });
  assert.equal(globalConfig.code, 2, globalConfig.stdout);
  assert.equal(globalConfig.json.authority.resolution_source, "global_config");
  await rm(path.join(home, "config"), { recursive: true, force: true });
  const xdgDefault = await invoke(bin, nonGit, ["--workspace", nonGit, "search", "--query", "hello"], { XDG_CONFIG_HOME: path.join(home, "config"), XDG_DATA_HOME: path.join(home, "data") });
  assert.equal(xdgDefault.code, 2, xdgDefault.stdout);
  assert.equal(xdgDefault.json.authority.resolution_source, "xdg_default");

  const repo = await mkdtemp(path.join(os.tmpdir(), "wi033-e2e-git-"));
  t.after(() => rm(repo, { recursive: true, force: true }));
  await runFile("git", ["init", "--quiet"], { cwd: repo });
  await writeFile(path.join(repo, "tracked"), "tracked\n");
  assert.equal((await runFile("git", ["add", "tracked"], { cwd: repo })).code, 0);
  assert.equal((await runFile("git", ["-c", "user.name=e2e", "-c", "user.email=e2e@example.invalid", "commit", "--quiet", "-m", "initial"], { cwd: repo })).code, 0);
  const nested = path.join(repo, "nested", "deeper"); await mkdir(nested, { recursive: true });
  const nestedResult = await invoke(bin, nested, ["search", "--query", "hello"]);
  assert.equal(nestedResult.code, 2, nestedResult.stdout);
  assert.equal(nestedResult.json.authority.workspace, await realpath(repo));
  const linked = path.join(path.dirname(repo), `${path.basename(repo)}-linked`);
  t.after(() => rm(linked, { recursive: true, force: true }));
  assert.equal((await runFile("git", ["worktree", "add", "--quiet", "-b", "e2e-linked", linked], { cwd: repo })).code, 0);
  const linkedNested = path.join(linked, "nested"); await mkdir(linkedNested);
  const linkedResult = await invoke(bin, linkedNested, ["search", "--query", "hello"]);
  assert.equal(linkedResult.code, 2, linkedResult.stdout);
  assert.equal(linkedResult.json.authority.workspace, await realpath(linked));
  const bare = path.join(path.dirname(repo), `${path.basename(repo)}-bare.git`);
  t.after(() => rm(bare, { recursive: true, force: true }));
  assert.equal((await runFile("git", ["init", "--bare", "--quiet", bare])).code, 0);
  // A bare repository is not a workspace. This uses the extracted package
  // entrypoint and verifies refusal happens before settings or bridge dispatch.
  await mkdir(path.join(bare, ".casebook"));
  await writeFile(path.join(bare, ".casebook", "settings.json"), "not json");
  const bareResult = await invoke(bin, bare, ["search", "--query", "hello"]);
  assert.equal(bareResult.code, 1, bareResult.stdout);
  assert.equal(bareResult.json.failure.code, "bare_repository");
  assert.equal(bareResult.json.authority.status, "unresolved");
  assert.equal(bareResult.json.authority.workspace, null);
});

test("extracted package bounds overflowing child stderr privately without widening result evidence", { timeout: 120_000 }, async (t) => {
  const bin = await packed(t);
  const { workspace } = await initializedWorkspace(t, "wi033-e2e-stderr-");
  const result = await invoke(bin, workspace, ["--workspace", workspace, "create", "case", "--commit-basis", "private diagnostics", "--input", JSON.stringify(caseAggregate(9100))], {
    CASEBOOK_CLI_TEST_HOOK: "casebook-cli-e2e@1",
    CASEBOOK_CLI_TEST_BRIDGE_FAULT: "stderr_overflow",
  });
  assert.equal(result.code, 0, result.stdout);
  assert.equal(result.json.status, "success");
  assert.equal(result.stderr, "");
  assert.equal(JSON.stringify(result.json).includes("bridge-private-stderr"), false);
});

test("extracted package refuses tampered, missing, added, and substituted runtime assets before dispatch", { timeout: 120_000 }, async (t) => {
  const bin = await packed(t);
  const { workspace, store } = await initializedWorkspace(t, "wi033-e2e-runtime-assets-");
  const runtime = path.join(path.dirname(path.dirname(bin)), "bridge", "runtime", "casebook-persistence");
  const asset = path.join(runtime, "shared", "config.mjs");
  const original = await readFile(asset);
  const outside = path.join(workspace, "substituted-runtime.mjs");
  const before = await readFile(store);
  const attempt = async (label) => {
    const result = await invoke(bin, workspace, ["create", "case", "--commit-basis", label, "--input", JSON.stringify(caseAggregate(9200))]);
    assert.equal(result.code, 1, result.stdout);
    assert.equal(result.json.failure.code, "bridge_asset_invalid");
    assert.equal(result.json.failure.evidence.commit_may_have_occurred, false);
    assert.equal(result.json.failure.evidence.operation_id, null);
    assert.deepEqual(await readFile(store), before);
  };

  await writeFile(asset, "export const tampered = true;\n");
  await attempt("runtime tamper");
  await writeFile(asset, original);

  await rm(asset);
  await attempt("runtime missing");
  await writeFile(asset, original);

  const added = path.join(runtime, "unexpected-runtime.mjs");
  await writeFile(added, "export const added = true;\n");
  await attempt("runtime added");
  await rm(added);

  await writeFile(outside, original);
  await rm(asset);
  await symlink(outside, asset);
  await attempt("runtime substituted");
});

test("extracted package refuses missing, changed, and in-package symlinked fixed bridge assets before grammar or dispatch", { timeout: 120_000 }, async (t) => {
  const bin = await packed(t);
  const { workspace, store } = await initializedWorkspace(t, "wi033-e2e-bridge-assets-");
  const packageDirectory = path.dirname(path.dirname(bin));
  const bridge = path.join(packageDirectory, "bridge", "persistence-bridge.mjs");
  const original = await readFile(bridge);
  const before = await readFile(store);
  const attempt = async (label, args = ["create", "case", "--commit-basis", label, "--input", JSON.stringify(caseAggregate(9300))]) => {
    const result = await invoke(bin, workspace, args);
    assert.equal(result.code, 1, result.stdout);
    assert.equal(result.json.failure.code, "bridge_asset_invalid");
    assert.equal(result.json.failure.evidence.commit_may_have_occurred, false);
    assert.equal(result.json.failure.evidence.operation_id, null);
    assert.deepEqual(await readFile(store), before);
  };

  await rm(bridge);
  await attempt("bridge missing");
  await writeFile(bridge, original);

  await writeFile(bridge, "export const replaced = true;\n");
  await attempt("bridge changed");
  await writeFile(bridge, original);

  const identical = path.join(path.dirname(bridge), "identical-persistence-bridge.mjs");
  await writeFile(identical, original);
  await rm(bridge);
  await symlink(path.basename(identical), bridge);
  // Even an identical in-package target is a substitution; verification precedes parsing.
  await attempt("bridge symlink", ["not-a-command"]);
});

test("packaged asset verification recognizes a known pre-dispatch package failure without delivery ambiguity", { timeout: 120_000 }, async (t) => {
  const bin = await packed(t);
  const { workspace } = await initializedWorkspace(t, "wi033-e2e-preflight-");
  const packageDirectory = path.dirname(path.dirname(bin));
  const metadata = JSON.parse(await readFile(path.join(packageDirectory, "package.json"), "utf8"));
  metadata.casebookCli.bridge.sha256 = "0".repeat(64);
  await writeFile(path.join(packageDirectory, "package.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  const result = await invoke(bin, workspace, ["create", "case", "--commit-basis", "known pre-dispatch", "--input", JSON.stringify(caseAggregate(9999))]);
  assert.equal(result.code, 1, result.stdout);
  assert.equal(result.json.status, "refused");
  assert.equal(result.json.failure.code, "bridge_asset_invalid");
  assert.equal(result.json.failure.evidence.commit_may_have_occurred, false);
  assert.equal(result.json.failure.evidence.operation_id, null);
});
