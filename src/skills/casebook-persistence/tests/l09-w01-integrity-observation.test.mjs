import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { appendFile, cp, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { generateAndValidateSandbox, selectCompatibleSqliteBinary } from "./sandbox-harness.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceEntrypoint = path.join(packageRoot, "variants/sqlite/bin/casebook-persistence.mjs");
const fixturesRoot = path.join(packageRoot, "tests/fixtures");
const protocol = { id: "casebook-persistence-json", version: 1 };
const caseId = "case:15cf9a6f-163a-4db2-afb2-e39573b36b5b";

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
      maxBuffer: 4 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? "", HOME: cwd },
    }, `${JSON.stringify(request)}\n`);
    return { code: 0, stderr, json: JSON.parse(stdout) };
  } catch (error) {
    return { code: error.code, stderr: error.stderr ?? "", json: JSON.parse(error.stdout || "{}") };
  }
}

async function exists(candidate) {
  return stat(candidate).then(() => true).catch(() => false);
}

function configuration(storePath, sqliteBinary, label) {
  return {
    source: { kind: "synthetic-test", locator: `l09-w01-disposable:${label}` },
    authority_mode: "sqlite",
    sqlite: { database_url: storePath, sqlite_bin: sqliteBinary },
  };
}

async function applySql(sqliteBinary, storePath, sql) {
  await execFileWithInput(sqliteBinary, ["-batch", "-bail", storePath], { encoding: "utf8" }, sql);
}

async function canonicalDigest(sqliteBinary, storePath) {
  const sql = [
    "SELECT * FROM store_metadata ORDER BY singleton;",
    "SELECT * FROM owners ORDER BY owner_id;",
    "SELECT * FROM owner_family_bindings ORDER BY family_id;",
    "SELECT * FROM owner_versions ORDER BY version_id;",
    "SELECT * FROM owner_revisions ORDER BY revision_id;",
    "SELECT * FROM owner_revision_selections ORDER BY revision_id,family_id;",
    "SELECT owner_id,revision_id,revision_number FROM owner_current ORDER BY owner_id;",
    "SELECT * FROM owner_events ORDER BY commit_sequence,event_id;",
    "SELECT * FROM owner_outbox ORDER BY outbox_id;",
    "SELECT * FROM store_operation_receipts ORDER BY operation_id;",
    "SELECT * FROM store_fence ORDER BY singleton;",
  ].join("\n");
  const { stdout } = await execFileWithInput(sqliteBinary, ["-batch", "-bail", "-json", storePath], { encoding: "utf8" }, sql);
  return createHash("sha256").update(stdout).digest("hex");
}

async function makeFixture(entrypoint, root, sqliteBinary, label) {
  const storePath = path.join(root, `${label}.sqlite3`);
  const config = configuration(storePath, sqliteBinary, label);
  const initialized = await invoke(entrypoint, root, {
    protocol,
    operation: "initialize_store",
    operation_id: `operation:${label}:initialize`,
    authority_claim: { human_authorized: true, acting_role: "architect", authority_basis: "synthetic L09-W01 fixture" },
    configuration: config,
  });
  assert.equal(initialized.code, 0, initialized.stderr || JSON.stringify(initialized.json));
  const initialization = initialized.json.result.initialization;
  const context = {
    view_id: initialization.view.id,
    view_policy_revision_id: initialization.view.policy_revision_id,
    purpose: "classify synthetic integrity evidence without mutation",
    requested_audience_ceiling: "private",
  };
  const created = await invoke(entrypoint, root, {
    protocol,
    operation: "case.create",
    request_version: 1,
    operation_id: `operation:${label}:case-create`,
    store_id: initialization.store_id,
    context,
    expected_revision: 0,
    commit_basis: "create visible synthetic integrity owner",
    provenance: { acting_role: "case-reconcile", authority_basis: "synthetic L09-W01 fixture" },
    case: {
      id: caseId,
      home_namespace_id: initialization.namespace.id,
      state: "active",
      title: "Integrity fixture",
      summary: "Visible synthetic owner",
      scope: "L09-W01 only",
      aliases: [], facets: [], entries: [], sources: [], relationships: [], references: [],
    },
    configuration: config,
  });
  assert.equal(created.code, 0, created.stderr || JSON.stringify(created.json));
  return { storePath, config, initialization, context };
}

function observationRequest(fixture) {
  return {
    protocol,
    operation: "integrity.observe",
    request_version: 1,
    store_id: fixture.initialization.store_id,
    context: fixture.context,
    configuration: fixture.config,
  };
}

function assertCommon(result, expectedClass) {
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.operation, "integrity.observe");
  assert.equal(result.result.status, "observed");
  assert.equal(result.result.anomaly_class, expectedClass);
  assert.match(result.result.evidence_digest, /^[0-9a-f]{64}$/);
  assert.equal(result.result.canonical_state_effect, "none");
  assert.equal(result.result.repair_performed, false);
  assert.ok(Array.isArray(result.result.affected_visible_components));
  assert.ok(Array.isArray(result.result.allowed_operations));
}

async function observeClass(entrypoint, root, sqliteBinary, label, fixtureFile, expectedClass) {
  const fixture = await makeFixture(entrypoint, root, sqliteBinary, label);
  if (fixtureFile) await applySql(sqliteBinary, fixture.storePath, await readFile(path.join(fixturesRoot, fixtureFile), "utf8"));
  const before = await canonicalDigest(sqliteBinary, fixture.storePath);
  const observed = await invoke(entrypoint, root, observationRequest(fixture));
  assert.equal(observed.code, 0, observed.stderr || JSON.stringify(observed.json));
  assertCommon(observed.json, expectedClass);
  assert.equal(await canonicalDigest(sqliteBinary, fixture.storePath), before, `${expectedClass} observation mutated canonical state`);
  return observed.json.result;
}

async function runClassificationSuite(entrypoint, root, sqliteBinary, prefix) {
  const healthy = await observeClass(entrypoint, root, sqliteBinary, `${prefix}-healthy`, null, "none");
  assert.deepEqual(healthy.read_write_safety, {
    canonical_reads: "safe",
    canonical_writes: "safe",
    affected_projection_reads: "safe",
  });
  assert.equal(healthy.owner_reconciliation_handoff, null);

  const canonical = await observeClass(entrypoint, root, sqliteBinary, `${prefix}-canonical`, "l09-canonical-mechanical-corruption.sql", "canonical_mechanical_unsafe");
  assert.equal(canonical.read_write_safety.canonical_reads, "unsafe");
  assert.equal(canonical.read_write_safety.canonical_writes, "blocked");
  assert.ok(canonical.allowed_operations.includes("restore_store"));
  assert.equal(canonical.owner_reconciliation_handoff, null);

  const projection = await observeClass(entrypoint, root, sqliteBinary, `${prefix}-projection`, "l09-projection-corruption.sql", "projection_only");
  assert.equal(projection.read_write_safety.canonical_reads, "safe");
  assert.equal(projection.read_write_safety.canonical_writes, "safe");
  assert.equal(projection.read_write_safety.affected_projection_reads, "unsafe");
  assert.deepEqual(projection.affected_visible_components.map((item) => item.component), ["current_projection"]);
  assert.equal(projection.owner_reconciliation_handoff, null);
  assert.ok(projection.allowed_operations.includes("projection.rebuild"), "W02 exposes the bounded replacement operation");

  const semantic = await observeClass(entrypoint, root, sqliteBinary, `${prefix}-semantic`, "l09-semantic-evidence-corruption.sql", "semantic_evidence");
  assert.equal(semantic.read_write_safety.canonical_reads, "evidence_only_for_affected_owners");
  assert.equal(semantic.read_write_safety.canonical_writes, "owner_reconciliation_only");
  assert.deepEqual(semantic.owner_reconciliation_handoff, {
    required: true,
    handoff_kind: "owner_reconciliation",
    owners: [{ id: caseId, kind: "case", operation: "case.commit_revision" }],
    automatic_mutation_performed: false,
  });
  assert.ok(!semantic.allowed_operations.includes("restore_store"));

  const protocolFailure = await observeClass(entrypoint, root, sqliteBinary, `${prefix}-protocol`, "l09-asset-protocol-corruption.sql", "asset_protocol");
  assert.equal(protocolFailure.read_write_safety.canonical_reads, "blocked");
  assert.equal(protocolFailure.read_write_safety.canonical_writes, "blocked");
  assert.deepEqual(protocolFailure.allowed_operations, ["diagnose", "integrity.observe"]);
  assert.equal(protocolFailure.owner_reconciliation_handoff, null);
}

test("typed integrity observation classifies synthetic corruption without repair or canonical mutation", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l09-w01-source-"));
  try {
    await runClassificationSuite(sourceEntrypoint, root, sqliteBinary, "source");
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await exists(root), false);
  }
});

test("generated Pi, Codex, and OpenCode packages expose the same non-mutating integrity classifications", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l09-w01-generated-"));
  try {
    const sandbox = await generateAndValidateSandbox({ sandboxRoot: root, sqliteBinary });
    for (const generated of sandbox.results) {
      await runClassificationSuite(
        path.join(generated.package_root, "variants/sqlite/bin/casebook-persistence.mjs"),
        root,
        sqliteBinary,
        generated.target,
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await exists(root), false);
  }
});

test("integrity observation fails closed without creating an absent configured store", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l09-w01-absent-"));
  try {
    const storePath = path.join(root, "absent.sqlite3");
    const observed = await invoke(sourceEntrypoint, root, {
      protocol,
      operation: "integrity.observe",
      request_version: 1,
      store_id: "store:88a5b99d-03ce-463f-86db-f0e7f6aeede5",
      context: {
        view_id: "view:bbbed2d7-71fa-4498-85f6-74d93420561a",
        view_policy_revision_id: "view-policy:04f1edad-115b-4586-8110-3f8cb8e2232d",
        purpose: "prove absent-store observation is non-creating",
        requested_audience_ceiling: "private",
      },
      configuration: configuration(storePath, sqliteBinary, "absent"),
    });
    assert.equal(observed.code, 2);
    assert.equal(observed.json.failure.code, "store_unavailable");
    assert.equal(await exists(storePath), false);
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await exists(root), false);
  }
});

test("package asset corruption is typed before configured-store access", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l09-w01-asset-"));
  try {
    const fixture = await makeFixture(sourceEntrypoint, root, sqliteBinary, "asset-source");
    const copiedPackage = path.join(root, "tampered-package");
    await cp(packageRoot, copiedPackage, { recursive: true });
    await appendFile(path.join(copiedPackage, "SKILL.md"), "\nsynthetic asset corruption\n");
    const before = await canonicalDigest(sqliteBinary, fixture.storePath);
    const observed = await invoke(
      path.join(copiedPackage, "variants/sqlite/bin/casebook-persistence.mjs"),
      root,
      observationRequest(fixture),
    );
    assert.equal(observed.code, 0, observed.stderr || JSON.stringify(observed.json));
    assertCommon(observed.json, "asset_protocol");
    assert.deepEqual(observed.json.result.affected_visible_components, [{ component: "package_assets", visibility: "installation", condition: "asset_digest_mismatch" }]);
    assert.equal(await canonicalDigest(sqliteBinary, fixture.storePath), before);
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await exists(root), false);
  }
});
