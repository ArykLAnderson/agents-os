import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { admitEmbeddedRuntime, inspectEmbeddedRuntime, PINNED_RUNTIME_CONTRACT } from "../variants/sqlite/lib/substrate/diagnostics.mjs";
import { DatabaseSync, executeSqlite, inspectVendoredAssets } from "../variants/sqlite/lib/substrate/embedded-sqlite.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const protocol = { id: "casebook-persistence-json", version: 2 };

function invoke(entrypoint, cwd, request) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [entrypoint], { cwd, env: { HOME: cwd, PATH: "/not-used" }, encoding: "utf8" },
      (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stdout, stderr, json: JSON.parse(stdout) }));
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}
function initializeRequest(store) {
  return { protocol, operation: "initialize_store", operation_id: "operation:wasm:tamper", authority_claim: { human_authorized: true, acting_role: "test", authority_basis: "runtime rejection" }, configuration: { source: { kind: "test", locator: "wasm-runtime" }, authority_mode: "sqlite", sqlite: { database_url: store } } };
}
async function exists(value) { return stat(value).then(() => true).catch(() => false); }

test("official vendored WASM provides SQL semantics and persistent atomic snapshots", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-wasm-semantics-")); t.after(() => rm(root, { recursive: true, force: true }));
  const database = path.join(root, "semantics.sqlite3"), assets = inspectVendoredAssets();
  assert.equal(assets.ok, true, JSON.stringify(assets));
  assert.deepEqual(assets.actual, PINNED_RUNTIME_CONTRACT.sqlite.assets);
  const result = executeSqlite(database, `
    PRAGMA foreign_keys=ON;
    CREATE TABLE parent(id INTEGER PRIMARY KEY) STRICT;
    CREATE TABLE child(id INTEGER PRIMARY KEY,parent_id INTEGER REFERENCES parent(id),payload BLOB,document TEXT) STRICT;
    INSERT INTO parent DEFAULT VALUES;
    INSERT INTO child(parent_id,payload,document) VALUES(1,x'00A1',json('{"ok":true}')) RETURNING id,hex(payload),json_extract(document,'$.ok');
    CREATE VIRTUAL TABLE search USING fts5(content);
    INSERT INTO search VALUES('vendored wasm phrase');
    SELECT count(*) AS matches FROM search WHERE search MATCH 'wasm';
  `, { json: true });
  assert.match(result.stdout, /"hex\(payload\)":"00A1"/);
  assert.match(result.stdout, /"matches":1/);
  const reopened = new DatabaseSync(database, { readOnly: true });
  assert.deepEqual({ ...reopened.prepare("SELECT hex(payload) payload,json_valid(document) valid FROM child").get() }, { payload: "00A1", valid: 1 });
  reopened.close();
  assert.equal(await exists(`${database}.casebook-lock`), false);
});

test("missing or tampered vendored WASM is rejected before store effects", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-wasm-reject-")); t.after(() => rm(root, { recursive: true, force: true }));
  for (const mode of ["missing", "tampered"]) {
    const copy = path.join(root, mode); await cp(packageRoot, copy, { recursive: true });
    const wasm = path.join(copy, PINNED_RUNTIME_CONTRACT.sqlite.wasm);
    if (mode === "missing") await rm(wasm);
    else { const bytes = await readFile(wasm); bytes[bytes.length - 1] ^= 1; await writeFile(wasm, bytes); }
    const store = path.join(root, `${mode}.sqlite3`);
    const response = await invoke(path.join(copy, "variants/sqlite/bin/casebook-persistence.mjs"), root, initializeRequest(store));
    assert.equal(response.code, 2, response.stderr);
    assert.equal(response.json.failure.code, "embedded_runtime_incompatible");
    assert.equal(await exists(store), false);
    assert.equal(await exists(`${store}.casebook-lock`), false);
  }
});

test("wrong SQLite source identity is rejected by the internal probe seam before store access", async () => {
  const actual = inspectEmbeddedRuntime();
  const rejected = await admitEmbeddedRuntime({ runtime: { ...actual, sqlite: { ...actual.sqlite, source_id: "wrong-source" } } });
  assert.equal(rejected.failure.code, "embedded_runtime_incompatible");
  assert.equal(rejected.failure.evidence.selected.sqlite.source_id, "wrong-source");
});

test("bounded cross-process package lock prevents lost updates", { timeout: 60_000 }, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-wasm-lock-")); t.after(() => rm(root, { recursive: true, force: true }));
  const database = path.join(root, "counter.sqlite3");
  executeSqlite(database, "CREATE TABLE counter(value INTEGER NOT NULL) STRICT; INSERT INTO counter VALUES(0);");
  const moduleUrl = pathToFileURL(path.join(packageRoot, "variants/sqlite/lib/substrate/embedded-sqlite.mjs")).href;
  const script = `import { executeSqlite } from ${JSON.stringify(moduleUrl)}; executeSqlite(process.argv[1],"BEGIN IMMEDIATE; UPDATE counter SET value=value+1; COMMIT;",{timeout:30000});`;
  const updates = Array.from({ length: 8 }, () => new Promise((resolve, reject) => execFile(process.execPath, ["--input-type=module", "--eval", script, database], { cwd: root }, (error) => error ? reject(error) : resolve())));
  await Promise.all(updates);
  const databaseHandle = new DatabaseSync(database, { readOnly: true });
  assert.equal(databaseHandle.prepare("SELECT value FROM counter").get().value, 8);
  databaseHandle.close();
  assert.equal(await exists(`${database}.casebook-lock`), false);
});
