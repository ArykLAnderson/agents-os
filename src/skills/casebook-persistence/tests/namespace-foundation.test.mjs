import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { selectCompatibleSqliteBinary } from "./sandbox-harness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entrypoint = path.join(root, "variants/sqlite/bin/casebook-persistence.mjs");
const protocol = { id: "casebook-persistence-json", version: 1 };

function run(file, args, input) {
  return new Promise((resolve) => {
    const child = execFile(file, args, { encoding: "utf8", timeout: 30_000 }, (error, stdout, stderr) => resolve({ error, stdout, stderr }));
    child.stdin.end(`${JSON.stringify(input)}\n`);
  });
}

function sql(binary, store, statement) {
  return new Promise((resolve) => {
    const child = execFile(binary, [store], { encoding: "utf8", timeout: 30_000 }, (error, stdout, stderr) => resolve({ error, stdout, stderr }));
    child.stdin.end(statement);
  });
}

async function invoke(request) {
  const response = await run(process.execPath, [entrypoint], request);
  return { ...response, json: JSON.parse(response.stdout) };
}

test("namespace lifecycle initializes schema v3 without views and persists exact replay", async () => {
  const sqlite = await selectCompatibleSqliteBinary();
  const directory = await mkdtemp(path.join(os.tmpdir(), "casebook-namespace-foundation-"));
  const store = path.join(directory, "store.sqlite3");
  const configuration = { source: { kind: "test", locator: "namespace-foundation" }, authority_mode: "sqlite", sqlite: { database_url: store, sqlite_bin: sqlite } };
  const authority_claim = { human_authorized: true, acting_role: "test", authority_basis: "test namespace administration" };
  try {
    const initialized = await invoke({ protocol, operation: "initialize_store", operation_id: "operation:initialize", authority_claim, configuration });
    assert.equal(initialized.json.ok, true, initialized.stderr);
    const { store_id, namespace } = initialized.json.result.initialization;
    assert.equal(namespace.key, "casebook");
    const tables = await run(sqlite, ["-json", store], "SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'view_%';");
    assert.deepEqual(JSON.parse(tables.stdout || "[]"), []);

    const base = { protocol, request_version: 1, store_id, authority_claim, configuration };
    const created = await invoke({ ...base, operation: "namespace.create", operation_id: "operation:create", expected_operation_fence: 1, namespace_id: "namespace:00000000-0000-4000-8000-000000000001", namespace_key: "product-a" });
    assert.equal(created.json.ok, true, created.stderr);
    const replay = await invoke({ ...base, operation: "namespace.create", operation_id: "operation:create", expected_operation_fence: 1, namespace_id: "namespace:00000000-0000-4000-8000-000000000001", namespace_key: "product-a" });
    assert.equal(replay.json.ok, true, replay.stderr);
    assert.equal(replay.json.result.idempotent_replay, true);
    const renamed = await invoke({ ...base, operation: "namespace.rename", operation_id: "operation:rename", expected_operation_fence: 2, namespace_id: "namespace:00000000-0000-4000-8000-000000000001", expected_namespace_key: "product-a", namespace_key: "product-b" });
    assert.equal(renamed.json.ok, true, renamed.stderr);
    const retired = await invoke({ ...base, operation: "namespace.retire", operation_id: "operation:retire", expected_operation_fence: 3, namespace_id: "namespace:00000000-0000-4000-8000-000000000001", expected_namespace_key: "product-b" });
    assert.equal(retired.json.ok, true, retired.stderr);
    const conflict = await invoke({ ...base, operation: "namespace.create", operation_id: "operation:stale", expected_operation_fence: 3, namespace_id: "namespace:00000000-0000-4000-8000-000000000002", namespace_key: "stale" });
    assert.equal(conflict.json.ok, false);
    assert.equal(conflict.json.failure.code, "operation_fence_conflict");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("owner rehome changes only administrative placement with exact expected home", async () => {
  const sqlite = await selectCompatibleSqliteBinary();
  const directory = await mkdtemp(path.join(os.tmpdir(), "casebook-owner-rehome-"));
  const store = path.join(directory, "store.sqlite3");
  const configuration = { source: { kind: "test", locator: "owner-rehome" }, authority_mode: "sqlite", sqlite: { database_url: store, sqlite_bin: sqlite } };
  const authority_claim = { human_authorized: true, acting_role: "test", authority_basis: "test placement administration" };
  const ownerId = "case:00000000-0000-4000-8000-000000000010";
  const targetId = "namespace:00000000-0000-4000-8000-000000000010";
  try {
    const initialized = await invoke({ protocol, operation: "initialize_store", operation_id: "operation:owner-init", authority_claim, configuration });
    const { store_id, namespace } = initialized.json.result.initialization;
    const seeded = await sql(sqlite, store, `INSERT INTO owners VALUES('${ownerId}','case','${namespace.id}','now');
      INSERT INTO owner_family_bindings VALUES('${ownerId}','${ownerId}','now');
      INSERT INTO owner_versions VALUES('version:00000000-0000-4000-8000-000000000010','${ownerId}','${ownerId}','{}','digest','now');
      INSERT INTO owner_revisions VALUES('owner-revision:00000000-0000-4000-8000-000000000010','${ownerId}',1,'{}','case@1',1,'operation:seed','now');
      INSERT INTO owner_revision_selections VALUES('owner-revision:00000000-0000-4000-8000-000000000010','${ownerId}','version:00000000-0000-4000-8000-000000000010');
      INSERT INTO owner_current VALUES('${ownerId}','owner-revision:00000000-0000-4000-8000-000000000010',1,'{}','now');
      INSERT INTO owner_events VALUES('event:00000000-0000-4000-8000-000000000010','${ownerId}','case','owner-revision:00000000-0000-4000-8000-000000000010',1,'${namespace.id}','created',1,'operation:seed-event',NULL,NULL,1,'now','private','{}','digest');`);
    assert.equal(seeded.error, null, seeded.stderr);
    const base = { protocol, request_version: 1, store_id, authority_claim, configuration };
    const created = await invoke({ ...base, operation: "namespace.create", operation_id: "operation:target", expected_operation_fence: 1, namespace_id: targetId, namespace_key: "target" });
    assert.equal(created.json.ok, true, created.stderr);
    const before = await sql(sqlite, store, `.mode json
      SELECT (SELECT count(*) FROM owner_revisions) revisions,(SELECT count(*) FROM owner_versions) versions,(SELECT count(*) FROM owner_revision_selections) selections,(SELECT projection_json FROM owner_current WHERE owner_id='${ownerId}') current,(SELECT count(*) FROM owner_events) events;`);
    const moved = await invoke({ ...base, operation: "owner.rehome", operation_id: "operation:rehome", expected_operation_fence: 2, owner_id: ownerId, expected_namespace_id: namespace.id, namespace_id: targetId });
    assert.equal(moved.json.ok, true, moved.stderr);
    const after = await sql(sqlite, store, `.mode json
      SELECT (SELECT home_namespace_id FROM owners WHERE owner_id='${ownerId}') home,(SELECT count(*) FROM owner_placement_events) placements,(SELECT count(*) FROM store_operation_receipts WHERE operation_id='operation:rehome') receipts,(SELECT count(*) FROM owner_revisions) revisions,(SELECT count(*) FROM owner_versions) versions,(SELECT count(*) FROM owner_revision_selections) selections,(SELECT projection_json FROM owner_current WHERE owner_id='${ownerId}') current,(SELECT count(*) FROM owner_events) events;`);
    assert.deepEqual({ ...JSON.parse(after.stdout)[0], home: undefined }, { ...JSON.parse(before.stdout)[0], home: undefined, placements: 1, receipts: 1 });
    assert.equal(JSON.parse(after.stdout)[0].home, targetId);
    const replay = await invoke({ ...base, operation: "owner.rehome", operation_id: "operation:rehome", expected_operation_fence: 2, owner_id: ownerId, expected_namespace_id: namespace.id, namespace_id: targetId });
    assert.equal(replay.json.ok, true, replay.stderr);
    const stale = await invoke({ ...base, operation: "owner.rehome", operation_id: "operation:stale-home", expected_operation_fence: 3, owner_id: ownerId, expected_namespace_id: namespace.id, namespace_id: targetId });
    assert.equal(stale.json.ok, false);
    const inactive = await invoke({ ...base, operation: "owner.rehome", operation_id: "operation:inactive-target", expected_operation_fence: 3, owner_id: ownerId, expected_namespace_id: targetId, namespace_id: "namespace:00000000-0000-4000-8000-000000000011" });
    assert.equal(inactive.json.ok, false);
    const unchanged = await sql(sqlite, store, `.mode json
      SELECT (SELECT operation_fence FROM store_fence) fence,(SELECT count(*) FROM owner_placement_events) placements,(SELECT count(*) FROM store_operation_receipts WHERE operation_id IN ('operation:stale-home','operation:inactive-target')) receipts;`);
    assert.deepEqual(JSON.parse(unchanged.stdout)[0], { fence: 3, placements: 1, receipts: 0 });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
