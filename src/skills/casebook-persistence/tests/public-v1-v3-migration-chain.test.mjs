import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { selectCompatibleSqliteBinary } from "./sandbox-harness.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entrypoint = path.join(packageRoot, "variants/sqlite/bin/casebook-persistence.mjs");
const protocol = { id: "casebook-persistence-json", version: 1 };
const storeId = "store:00000000-0000-4000-8000-000000000001";

function command(file, args, input) {
  return new Promise((resolve) => {
    const child = execFile(file, args, { encoding: "utf8", timeout: 30_000 }, (error, stdout, stderr) => resolve({ error, stdout, stderr }));
    child.stdin.end(input);
  });
}

async function invoke(request) {
  const response = await command(process.execPath, [entrypoint], `${JSON.stringify(request)}\n`);
  return { ...response, json: JSON.parse(response.stdout) };
}

async function row(sqlite, store, query) {
  const result = await command(sqlite, ["-json", store], query);
  assert.equal(result.error, null, result.stderr);
  return JSON.parse(result.stdout || "[]")[0];
}

function configuration(store, sqlite) {
  return { source: { kind: "fixture", locator: "namespace-foundation-v1" }, authority_mode: "sqlite", sqlite: { database_url: store, sqlite_bin: sqlite } };
}

async function migrationRequest(store, sqlite, snapshot, operationFence) {
  const manifest = JSON.parse(await readFile(path.join(packageRoot, "manifest.json"), "utf8"));
  const asset = (id) => manifest.assets.find((item) => item.id === id).sha256;
  return {
    protocol, operation: "migrate_store", operation_id: "operation:public-v1-v3", operation_kind: "migration",
    purpose: "upgrade one exact disposable v1 store directly to v3", store_id: storeId,
    safety: { store_class: "disposable", authorization_reference: "test:public-v1-v3-hard-cutover" },
    authority_claim: { human_authorized: true, acting_role: "test-migration-operator", authority_basis: "authorized disposable hard-cutover migration", human_confirmation_reference: "test:v1-v3-hard-cutover" },
    expected: { store_id: storeId, schema: { id: "casebook-persistence-sqlite", version: 1 }, protocol, assets: { schema_asset_sha256: "a".repeat(64), migration_manifest_sha256: "b".repeat(64) }, operation_fence: operationFence },
    target: { schema: { id: "casebook-persistence-sqlite", version: 3 }, protocol },
    migration: { id: "0003-namespace-foundation", from_version: 1, to_version: 3, schema_asset_sha256: asset("sqlite-migration-v3"), manifest_sha256: asset("sqlite-migrations") },
    snapshot: { path: snapshot, on_success: "delete", on_failure: "retain" }, canonical_state_effect: "schema-change",
    requested_postcondition_evidence: ["schema_identity", "protocol_identity", "asset_identity", "integrity", "healthy_exposure"], configuration: configuration(store, sqlite),
  };
}

function snapshotRequest(store, sqlite, snapshot) {
  return {
    protocol, operation: "snapshot_store", operation_id: "operation:public-v1-v3-snapshot", operation_kind: "snapshot",
    purpose: "capture one exact disposable v1 source before its public hard migration", store_id: storeId,
    safety: { store_class: "disposable", authorization_reference: "test:public-v1-v3-hard-cutover" },
    authority_claim: { human_authorized: true, acting_role: "test-migration-operator", authority_basis: "authorized disposable v1 snapshot rehearsal", human_confirmation_reference: "test:v1-v3-hard-cutover" },
    expected: { store_id: storeId, schema: { id: "casebook-persistence-sqlite", version: 1 }, protocol, operation_fence: 1 },
    snapshot: { path: snapshot, owner: "test-owner:public-v1-v3", retention: "retain_until_explicit_deletion" }, canonical_state_effect: "none",
    requested_postcondition_evidence: ["store_identity", "schema_identity", "operation_fence", "digest", "size", "consistency", "integrity"], configuration: configuration(store, sqlite),
  };
}

test("public initialize_store creates an ordinary-accessible v3 store without policy tables", async () => {
  const sqlite = await selectCompatibleSqliteBinary();
  const directory = await mkdtemp(path.join(os.tmpdir(), "casebook-public-v3-init-"));
  const store = path.join(directory, "store.sqlite3");
  try {
    const initialized = await invoke({ protocol, operation: "initialize_store", operation_id: "operation:public-v3-initialize", authority_claim: { human_authorized: true, acting_role: "test", authority_basis: "public initialization regression" }, configuration: configuration(store, sqlite) });
    assert.equal(initialized.json.ok, true, initialized.stderr);
    assert.equal(initialized.json.result.initialization.schema.version, 3);
    assert.deepEqual(await row(sqlite, store, `SELECT (SELECT user_version FROM pragma_user_version) AS schema_version, (SELECT namespace_key FROM namespaces WHERE lifecycle='active') AS namespace_key, (SELECT count(*) FROM sqlite_schema WHERE type='table' AND name IN ('view_families','view_policy_revisions','view_policy_namespace_grants','consumer_checkpoints')) AS policy_tables;`), { schema_version: 3, namespace_key: "casebook", policy_tables: 0 });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("an authorized disposable v1 snapshot precedes public hard migration while ordinary v1 access remains blocked", async () => {
  const sqlite = await selectCompatibleSqliteBinary();
  const directory = await mkdtemp(path.join(os.tmpdir(), "casebook-public-v1-v3-"));
  const store = path.join(directory, "store.sqlite3");
  try {
    const fixture = await readFile(path.join(packageRoot, "tests/fixtures/namespace-foundation-v1.sql"), "utf8");
    const loaded = await command(sqlite, [store], fixture);
    assert.equal(loaded.error, null, loaded.stderr);
    const ordinary = await invoke({ protocol, operation: "case.read", request_version: 1, store_id: storeId, case_id: "case:00000000-0000-4000-8000-000000000001", context: { purpose: "ordinary v1 access must be blocked" }, configuration: configuration(store, sqlite) });
    assert.equal(ordinary.json.failure.code, "schema_migration_required");

    const snapshotted = await invoke(snapshotRequest(store, sqlite, path.join(directory, "before-v3-disposable.sqlite3")));
    assert.equal(snapshotted.json.ok, true, snapshotted.stderr);
    assert.equal(snapshotted.json.result.terminal.outcome, "snapshotted", JSON.stringify(snapshotted.json));
    assert.deepEqual(snapshotted.json.result.snapshot.source, {
      store_id: storeId,
      schema: { id: "casebook-persistence-sqlite", version: 1 },
      protocol,
      operation_fence: 1,
    });

    const migrated = await invoke(await migrationRequest(store, sqlite, path.join(directory, "before-v3.sqlite3"), 2));
    assert.equal(migrated.json.ok, true, migrated.stderr);
    assert.equal(migrated.json.result.terminal.outcome, "migrated", JSON.stringify(migrated.json));
    assert.equal(migrated.json.result.preconditions.expected.schema.version, 1);
    assert.equal(migrated.json.result.postconditions.schema.version, 3);

    const final = await row(sqlite, store, `SELECT
      (SELECT user_version FROM pragma_user_version) AS schema_version,
      (SELECT count(*) FROM sqlite_schema WHERE type='table' AND name IN ('view_families','view_policy_revisions','view_policy_namespace_grants','consumer_checkpoints')) AS active_policy_tables,
      (SELECT count(*) FROM schema_migrations WHERE migration_id='0003-namespace-foundation' AND from_version=1 AND to_version=3) AS hard_cutovers,
      (SELECT normalized_json FROM owner_revisions) AS revision_json,
      (SELECT content_json FROM owner_versions) AS version_json,
      (SELECT projection_json FROM owner_current) AS current_json,
      (SELECT payload_json FROM owner_events) AS event_json,
      (SELECT archive_json FROM migration_archives WHERE migration_id='0003-namespace-foundation') AS archive_json;`);
    assert.deepEqual({ schema_version: final.schema_version, active_policy_tables: final.active_policy_tables, hard_cutovers: final.hard_cutovers }, { schema_version: 3, active_policy_tables: 0, hard_cutovers: 1 });
    assert.deepEqual({ revision: final.revision_json, version: final.version_json, current: final.current_json, event: final.event_json }, { revision: '{"semantic":"revision"}', version: '{"semantic":"version"}', current: '{"semantic":"current"}', event: '{"semantic":"event"}' });
    const archive = JSON.parse(final.archive_json);
    assert.equal(archive.view_families.length, 1);
    assert.equal(archive.view_policy_revisions.length, 1);
    assert.equal(archive.view_policy_namespace_grants.length, 1);
    assert.equal(archive.consumer_checkpoints.length, 1);
    assert.deepEqual(archive.receipt_policy_associations, [{ operation_id: "operation:policy-associated", view_policy_revision_id: "view-policy:00000000-0000-4000-8000-000000000001" }]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("live-class snapshot and migration require human confirmation while ordinary v1 access remains blocked", async () => {
  const sqlite = await selectCompatibleSqliteBinary();
  const directory = await mkdtemp(path.join(os.tmpdir(), "casebook-live-admission-v1-v3-"));
  const store = path.join(directory, "store.sqlite3");
  try {
    const fixture = await readFile(path.join(packageRoot, "tests/fixtures/namespace-foundation-v1.sql"), "utf8");
    const loaded = await command(sqlite, [store], fixture);
    assert.equal(loaded.error, null, loaded.stderr);

    const ordinary = await invoke({ protocol, operation: "case.read", request_version: 1, store_id: storeId, case_id: "case:00000000-0000-4000-8000-000000000001", context: { purpose: "ordinary v1 access must remain blocked" }, configuration: configuration(store, sqlite) });
    assert.equal(ordinary.json.failure.code, "schema_migration_required");

    const unconfirmedSnapshot = snapshotRequest(store, sqlite, path.join(directory, "unconfirmed.sqlite3"));
    unconfirmedSnapshot.safety.store_class = "live";
    delete unconfirmedSnapshot.authority_claim.human_confirmation_reference;
    const deniedSnapshot = await invoke(unconfirmedSnapshot);
    assert.equal(deniedSnapshot.json.ok, false);
    assert.equal(deniedSnapshot.json.failure.code, "human_confirmation_reference_required");

    const snapshot = snapshotRequest(store, sqlite, path.join(directory, "confirmed.sqlite3"));
    snapshot.safety.store_class = "live";
    const snapshotted = await invoke(snapshot);
    assert.equal(snapshotted.json.ok, true, snapshotted.stderr);
    assert.equal(snapshotted.json.result.terminal.outcome, "snapshotted");

    const unconfirmedMigration = await migrationRequest(store, sqlite, path.join(directory, "unconfirmed-migration.sqlite3"), 2);
    unconfirmedMigration.safety.store_class = "live";
    delete unconfirmedMigration.authority_claim.human_confirmation_reference;
    const deniedMigration = await invoke(unconfirmedMigration);
    assert.equal(deniedMigration.json.ok, false);
    assert.equal(deniedMigration.json.failure.code, "human_confirmation_reference_required");

    const migration = await migrationRequest(store, sqlite, path.join(directory, "confirmed-migration.sqlite3"), 2);
    migration.safety.store_class = "live";
    const migrated = await invoke(migration);
    assert.equal(migrated.json.ok, true, migrated.stderr);
    assert.equal(migrated.json.result.terminal.outcome, "migrated");
    assert.equal(migrated.json.result.preconditions.safety.store_class, "live");
  } finally { await rm(directory, { recursive: true, force: true }); }
});
