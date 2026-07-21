import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { cleanupSandbox, generateAndValidateSandbox, selectCompatibleSqliteBinary } from "./sandbox-harness.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceEntrypoint = path.join(packageRoot, "variants/sqlite/bin/casebook-persistence.mjs");
const protocol = { id: "casebook-persistence-json", version: 1 };
const asset = JSON.parse(await readFile(new URL("./fixtures/neutral-module-asset.json", import.meta.url), "utf8"));
function canonical(value) { return Array.isArray(value) ? value.map(canonical) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value; }
function sha(value) { return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
const descriptor = {
  descriptor_version: 1,
  module_id: "neutral-catalog",
  module_schema: { id: "neutral-catalog-sqlite", version: 1 },
  module_protocol: { id: "neutral-catalog-json", version: 1 },
  provider_compatibility: { schema: { id: "casebook-persistence-sqlite", versions: [1, 2] }, protocol: { id: protocol.id, versions: [1] } },
  asset: { format: asset.format, sha256: sha(asset) },
};
const authorityClaim = { human_authorized: true, acting_role: "test-operator", authority_basis: "explicit disposable PX01 lifecycle proof" };
function run(entrypoint, cwd, request) {
  return new Promise((resolve) => { const child = execFile(process.execPath, [entrypoint], { cwd, encoding: "utf8", timeout: 30_000, env: { PATH: process.env.PATH ?? "", HOME: cwd } }, (error, stdout, stderr) => resolve({ code: error ? 2 : 0, json: JSON.parse(stdout), stderr })); child.stdin.end(JSON.stringify(request)); });
}
function configuration(storePath, sqliteBinary, locator = "px01") { return { source: { kind: "synthetic-test", locator }, authority_mode: "sqlite", sqlite: { database_url: storePath, sqlite_bin: sqliteBinary } }; }
async function initialize(entrypoint, root, sqliteBinary, label) {
  const storePath = path.join(root, `${label}.sqlite3`); const config = configuration(storePath, sqliteBinary, `px01:${label}`);
  const response = await run(entrypoint, root, { protocol, operation: "initialize_store", operation_id: `operation:px01:${label}:initialize`, authority_claim: authorityClaim, configuration: config });
  assert.equal(response.code, 0, response.stderr); return { storePath, config, initialization: response.json.result.initialization };
}
function moduleRequest(state, operation, extra = {}) { return { protocol, operation, store_id: state.initialization.store_id, descriptor, asset, configuration: state.config, ...extra }; }
async function ordinaryReads(entrypoint, root, state, label) {
  const context = { view_id: state.initialization.view.id, view_policy_revision_id: state.initialization.view.policy_revision_id, purpose: `ordinary ${label}` };
  const requests = [
    { operation: "case.search", query: "neutral", limit: 10 },
    { operation: "frame.list", statuses: ["active"] },
  ];
  for (const request of requests) {
    const response = await run(entrypoint, root, { protocol, request_version: 1, store_id: state.initialization.store_id, context, configuration: state.config, ...request });
    assert.equal(response.code, 0, `${request.operation} ${label}: ${response.stderr || JSON.stringify(response.json)}`);
    assert.equal(response.json.ok, true);
  }
}

test("descriptor-driven module lifecycle is explicit, atomic, durable, fail-closed, and independent of Case/Frame", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-px01-")); const sqliteBinary = await selectCompatibleSqliteBinary();
  try {
    const state = await initialize(sourceEntrypoint, root, sqliteBinary, "main");
    await ordinaryReads(sourceEntrypoint, root, state, "before installation");
    const absent = await run(sourceEntrypoint, root, moduleRequest(state, "module.diagnose"));
    assert.equal(absent.code, 0); assert.equal(absent.json.result.status, "absent");
    assert.equal((await stat(state.storePath)).size > 0, true);

    const installRequest = moduleRequest(state, "module.install", { operation_id: "operation:px01:module:install", authority_claim: authorityClaim });
    const installed = await run(sourceEntrypoint, root, installRequest);
    assert.equal(installed.code, 0, installed.stderr); assert.equal(installed.json.result.module.exposure, "enabled");
    assert.deepEqual((await run(sourceEntrypoint, root, installRequest)).json.result, installed.json.result);
    const healthy = await run(sourceEntrypoint, root, moduleRequest(state, "module.diagnose"));
    assert.equal(healthy.json.result.status, "healthy");

    const wrongDescriptor = structuredClone(descriptor); wrongDescriptor.module_schema.version = 2;
    const incompatible = await run(sourceEntrypoint, root, { ...moduleRequest(state, "module.diagnose"), descriptor: wrongDescriptor });
    assert.equal(incompatible.json.result.status, "incompatible"); assert.equal(incompatible.json.result.exposure, "disabled");
    const wrongDigest = structuredClone(descriptor); wrongDigest.asset.sha256 = "0".repeat(64);
    const digestDiagnosis = await run(sourceEntrypoint, root, { ...moduleRequest(state, "module.diagnose"), descriptor: wrongDigest });
    assert.equal(digestDiagnosis.json.result.code, "module_asset_digest_mismatch");
    const digestInstall = await run(sourceEntrypoint, root, { ...installRequest, operation_id: "operation:px01:bad-digest", descriptor: wrongDigest });
    assert.equal(digestInstall.code, 2); assert.equal(digestInstall.json.failure.code, "module_asset_digest_mismatch");

    const retireRequest = moduleRequest(state, "module.retire", { operation_id: "operation:px01:module:retire", authority_claim: authorityClaim });
    const retired = await run(sourceEntrypoint, root, retireRequest);
    assert.equal(retired.code, 0, retired.stderr); assert.equal(retired.json.result.module.data_preservation, "all-module-objects-preserved");
    assert.deepEqual((await run(sourceEntrypoint, root, retireRequest)).json.result, retired.json.result);
    const retiredDiagnosis = await run(sourceEntrypoint, root, moduleRequest(state, "module.diagnose"));
    assert.equal(retiredDiagnosis.json.result.status, "retired"); assert.equal(retiredDiagnosis.json.result.exposure, "disabled");
    await ordinaryReads(sourceEntrypoint, root, state, "after retirement");

    const partial = await initialize(sourceEntrypoint, root, sqliteBinary, "partial");
    await new Promise((resolve, reject) => { const child = execFile(sqliteBinary, [partial.storePath], (error) => error ? reject(error) : resolve()); child.stdin.end(asset.statements[0]); });
    const unsafe = await run(sourceEntrypoint, root, moduleRequest(partial, "module.diagnose"));
    assert.equal(unsafe.json.result.status, "integrity_unsafe"); assert.equal(unsafe.json.result.classification, "partial_state");
    const refused = await run(sourceEntrypoint, root, moduleRequest(partial, "module.install", { operation_id: "operation:px01:partial", authority_claim: authorityClaim }));
    assert.equal(refused.code, 2); assert.equal(refused.json.failure.code, "module_partial_state");
  } finally { await rm(root, { recursive: true, force: true }); assert.equal(await stat(root).then(() => true).catch(() => false), false); }
});

test("generated Pi, Codex, and OpenCode copies execute module lifecycle from unrelated cwd without fallback", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-px01-generated-"));
  try {
    const generated = await generateAndValidateSandbox({ sandboxRoot: root });
    for (const layout of generated.results) {
      const entrypoint = path.join(layout.package_root, "variants/sqlite/bin/casebook-persistence.mjs");
      const state = await initialize(entrypoint, path.join(root, "unrelated-cwd"), generated.sqlite_binary, `generated-${layout.target}`);
      assert.equal((await run(entrypoint, path.join(root, "unrelated-cwd"), moduleRequest(state, "module.diagnose"))).json.result.status, "absent");
      const install = await run(entrypoint, path.join(root, "unrelated-cwd"), moduleRequest(state, "module.install", { operation_id: `operation:px01:${layout.target}:install`, authority_claim: authorityClaim }));
      assert.equal(install.code, 0, `${layout.target}: ${install.stderr}`);
      const retire = await run(entrypoint, path.join(root, "unrelated-cwd"), moduleRequest(state, "module.retire", { operation_id: `operation:px01:${layout.target}:retire`, authority_claim: authorityClaim }));
      assert.equal(retire.code, 0, `${layout.target}: ${retire.stderr}`);
      assert.equal(retire.json.result.module.exposure, "disabled");
    }
    assert.equal(await cleanupSandbox(root), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});
