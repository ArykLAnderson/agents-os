import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createBootstrapAuthorizationDocument } from "../../../skills/casebook-persistence/variants/sqlite/lib/substrate/bootstrap.mjs";
import { successorDigest } from "../../../skills/casebook-persistence/variants/sqlite/lib/substrate/mechanical-successor.mjs";

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
const ids = { store: id("store", 1), workspace: id("workspace", 2), namespace: id("namespace", 3), namespaceRevision: id("owner-revision", 4), namespaceVersion: id("version", 5), profile: id("profile", 6), profileRevision: id("owner-revision", 7), profileVersion: id("version", 8), selection: id("profile-selection", 9), selectionRevision: id("owner-revision", 10), selectionVersion: id("version", 11), slot: id("admission-slot", 12), event: id("event", 13), case: id("case", 14), facet: id("facet", 15), knowledge: id("knowledge", 16), source: id("source", 17), evidence: id("evidence", 18), relationship: id("relationship", 19), frame: id("frame", 20), discovery: id("discovery", 21), boundary: id("disposition-boundary", 22), disposition: id("case-disposition", 23) };
const record = (owner_id, revision_id, version_id, content) => ({ owner_id, revision_id, version_id, content, content_digest: successorDigest(content) });
const profile = { schema: "admission-disclosure-profile@1", audience_ceiling: "private", lifecycle: "active", predecessor_revision_id: null, object_kinds: ["profile", "profile-selection", "namespace", "project-default", "chat", "case", "frame"], purposes: ["profile.manage", "profile.read", "substrate.commit_revision", "receipt.read", "integrity.observe", "projection.rebuild", "case.manage", "case.read", "frame.manage", "frame.read", "query.search", "context.read", "substrate.read"], bounds: { max_results: 100, max_traversal_depth: 8, max_export_bytes: 1048576 }, projection: { locator: "redacted", export: "deny" }, disclosure: { receipts: true, events: true, checkpoints: true } };
const caseAggregate = () => ({ id: ids.case, state: "active", title: "Pack Case", summary: "A disposable packed Case", scope: "E2E", provenance: { sources: [], support: [], authority: [] }, aliases: ["Pack Case"], references: [], facets: [{ id: ids.facet, state: "active", version: { key: "status", value: "tested", visibility: "private" } }], entries: [{ id: ids.knowledge, state: "active", version: { display_label: "K-001", title: "Packed knowledge", purpose: "proof", classification: "accepted", body: "unique packed search phrase", visibility: "private", provenance: { acting_role: "e2e" }, positions: [], relationships: [], references: [] } }], sources: [{ id: ids.source, state: "active", display_label: "S-001", version: { title: "Source", accessed_at: "2026-07-28T00:00:00Z", examined_for: "proof", visibility: "private", locators: [{ kind: "origin", uri: "https://example.invalid/e2e", audience: "private" }] }, fragments: [{ id: ids.evidence, state: "active", version: { excerpt: "evidence", purpose: "proof", captured_at: "2026-07-28T00:00:00Z", visibility: "private" } }] }], relationships: [{ id: ids.relationship, state: "active", version: { subject: { kind: "case", id: ids.case }, predicate: "contains", object: { kind: "knowledge", id: ids.knowledge }, visibility: "private" } }] });
const frameAggregate = (title = "Pack Frame") => ({ id: ids.frame, status: "active", title, outcome: "E2E outcome", included_scope: ["packed route"], discovery: [{ id: ids.discovery, display_order: 0, lifecycle: "active", category: "frontier", title: "Question", body: "Frame searchable phrase", human_authority: "required", dependencies: [] }], disposition_boundaries: [{ id: ids.boundary, display_order: 0, title: "Boundary", closure: "open", disposition_ids: [ids.disposition] }], case_dispositions: [{ id: ids.disposition, boundary_id: ids.boundary, result_summary: "Pending", classification_state: "pending_classification", pending_reason: "Needs review", resume_condition: "Review" }] });

async function packed(t) {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "wi033-packed-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const packed = await runFile("npm", ["pack", "--silent"], { cwd: packageRoot });
  assert.equal(packed.code, 0, packed.stderr);
  const archive = packed.stdout.trim().split(/\s+/).at(-1);
  await writeFile(path.join(sandbox, "archive-name"), archive);
  const copied = path.join(packageRoot, archive);
  const untarred = await runFile("tar", ["-xzf", copied, "-C", sandbox]);
  await rm(copied, { force: true });
  assert.equal(untarred.code, 0, untarred.stderr);
  return path.join(sandbox, "package", "bin", "casebook.mjs");
}
async function afterDispatchFault(bin) {
  const packageRoot = path.dirname(path.dirname(bin));
  const bridgePath = path.join(packageRoot, "bridge", "persistence-bridge.mjs");
  const bridge = await readFile(bridgePath, "utf8");
  await writeFile(bridgePath, bridge.replace(
    'process.stdout.write(JSON.stringify(await dispatch(request)));',
    'const response = await dispatch(request); if (request.operation !== "target.describe" && process.env.CASEBOOK_TEST_AFTER_DISPATCH_SIGNAL === "1") process.kill(process.pid, "SIGTERM"); process.stdout.write(JSON.stringify(response));',
  ));
  const metadataPath = path.join(packageRoot, "package.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  metadata.casebookCli.bridge.sha256 = createHash("sha256").update(await readFile(bridgePath)).digest("hex");
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  return bin;
}
async function initialize(workspace, store) {
  workspace = await realpath(workspace);
  const grant = path.join(workspace, "bootstrap.grant.json");
  const request = { protocol: { id: "casebook-persistence-json", version: 2 }, operation: "initialize_store", request_version: 1, operation_id: "operation:wi033-e2e-initialize", store_id: ids.store, workspace_id: ids.workspace, authority_claim: { human_authorized: true, local_uid: process.getuid(), human_identity: "e2e", provenance: "disposable:wi033" }, initial: { root_namespace: record(ids.namespace, ids.namespaceRevision, ids.namespaceVersion, { schema: "namespace-bootstrap@1", display_name: "Personal", parent_id: null, lifecycle: "active" }), private_profile: record(ids.profile, ids.profileRevision, ids.profileVersion, profile), profile_selection: record(ids.selection, ids.selectionRevision, ids.selectionVersion, { schema: "profile-selection@1", admission_slot_id: ids.slot, selected_profile_id: ids.profile, selected_profile_revision_id: ids.profileRevision, lifecycle: "active", activation_fence: 1 }), project_default: null, initialization_event_id: ids.event }, configuration: { source: { kind: "workspace-root", locator: workspace }, authority_mode: "sqlite", sqlite: { database_url: store } } };
  const authorization = await createBootstrapAuthorizationDocument(request, { grant_path: grant });
  request.request_digest = authorization.request_digest;
  request.bootstrap_authorization = { path: grant, sha256: authorization.sha256 };
  await writeFile(grant, `${JSON.stringify(authorization.document)}\n`, { mode: 0o600 });
  const result = await runFile(process.execPath, [providerEntrypoint], { cwd: workspace, env: { ...process.env, HOME: workspace } }, `${JSON.stringify(request)}\n`);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).ok, true, result.stdout);
}
async function invoke(bin, workspace, args, env = {}) {
  const output = await runFile(process.execPath, [bin, ...args], { cwd: workspace, env: { ...process.env, ...env, HOME: workspace, XDG_CONFIG_HOME: path.join(workspace, "config"), XDG_DATA_HOME: path.join(workspace, "data") } });
  return { ...output, json: JSON.parse(output.stdout) };
}

test("packed entrypoint completes Candidate-4 Case, Frame, query, receipt, recovery, and final-symlink refusal flows", { timeout: 120_000 }, async (t) => {
  const bin = await packed(t);
  const workspace = await mkdtemp(path.join(os.tmpdir(), "wi033-e2e-workspace-"));
  t.after(() => rm(workspace, { recursive: true, force: true }));
  await runFile("git", ["init", "--quiet"], { cwd: workspace });
  const store = path.join(workspace, "authority.sqlite");
  await initialize(workspace, store);
  await mkdir(path.join(workspace, ".casebook"));
  await writeFile(path.join(workspace, ".casebook", "settings.json"), `${JSON.stringify({ schema: "casebook-cli-settings@1", store })}\n`);

  const created = await invoke(bin, workspace, ["create", "case", "--commit-basis", "e2e create", "--input", JSON.stringify(caseAggregate())]);
  assert.equal(created.code, 0, `${created.stderr}\n${created.stdout}`); assert.equal(created.json.result.owner.id, ids.case); assert.ok(created.json.receipt);
  const operationId = created.json.result.operation_id;
  const read = await invoke(bin, workspace, ["read", "case", "--case-id", ids.case]);
  assert.equal(read.code, 0, read.stdout); assert.equal(read.json.result.aggregate.id, ids.case);
  const receipt = await invoke(bin, workspace, ["receipt", "read", "--operation-id", operationId]);
  assert.equal(receipt.code, 0); assert.equal(receipt.json.result.observation, "settled");
  const status = await invoke(bin, workspace, ["operation", "status", "--operation-id", operationId]);
  assert.equal(status.code, 0); assert.equal(status.json.result.receipt.operation_id, operationId);
  const recent = await invoke(bin, workspace, ["operation", "recent", "--limit", "1"]);
  assert.equal(recent.code, 0, recent.stdout); assert.equal(recent.json.result.operations[0].operation_id, operationId);

  const madeFrame = await invoke(bin, workspace, ["create", "frame", "--commit-basis", "e2e frame", "--input", JSON.stringify(frameAggregate())]);
  assert.equal(madeFrame.code, 0, madeFrame.stderr);
  const faulted = await afterDispatchFault(await packed(t));
  const lost = await invoke(faulted, workspace, ["commit", "frame", "--frame-id", ids.frame, "--expected-revision", "1", "--commit-basis", "e2e frame revise", "--input", JSON.stringify(frameAggregate("Pack Frame Revised"))], { CASEBOOK_TEST_AFTER_DISPATCH_SIGNAL: "1" });
  assert.equal(lost.code, 3, lost.stdout); assert.equal(lost.json.status, "delivery_unknown");
  const lostOperationId = lost.json.failure.evidence.operation_id;
  const recovered = await invoke(bin, workspace, ["operation", "status", "--operation-id", lostOperationId]);
  assert.equal(recovered.code, 0); assert.equal(recovered.json.result.observation, "settled");
  const readFrame = await invoke(bin, workspace, ["read", "frame", "--frame-id", ids.frame]);
  assert.equal(readFrame.code, 0); assert.equal(readFrame.json.result.revision.number, 2); assert.equal(readFrame.json.result.aggregate.title, "Pack Frame Revised");
  const recoveredRecent = await invoke(bin, workspace, ["operation", "recent", "--limit", "1"]);
  assert.equal(recoveredRecent.code, 0); assert.equal(recoveredRecent.json.result.operations[0].operation_id, lostOperationId);
  const search = await invoke(bin, workspace, ["search", "--query", "unique packed search phrase"]);
  assert.equal(search.code, 0, search.stderr); assert.ok(search.json.result.items.length > 0);

  const before = await readFile(store);
  const alias = path.join(workspace, "store-link.sqlite"); await symlink(store, alias);
  const symlinkResult = await invoke(bin, workspace, ["--store", alias, "search", "--query", "unique packed search phrase"]);
  assert.equal(symlinkResult.code, 2); assert.equal(symlinkResult.json.failure.code, "store_unavailable");
  assert.deepEqual(await readFile(store), before);
});
