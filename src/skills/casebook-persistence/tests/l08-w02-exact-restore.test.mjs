import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { generateAndValidateSandbox, selectCompatibleSqliteBinary } from "./sandbox-harness.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceEntrypoint = path.join(packageRoot, "variants/sqlite/bin/casebook-persistence.mjs");
const protocol = { id: "casebook-persistence-json", version: 1 };
const caseA = "case:ad1fc098-d113-4a05-ab19-cf01ba12e4ca";
const caseB = "case:75eade5c-8e7f-4394-b2d4-da41fb4439f3";

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

async function invoke(entrypoint, cwd, request, extraEnv = {}) {
  try {
    const { stdout, stderr } = await execFileWithInput(process.execPath, [entrypoint], {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? "", HOME: cwd, ...extraEnv },
    }, `${JSON.stringify(request)}\n`);
    return { exitCode: 0, signal: null, stderr, json: JSON.parse(stdout) };
  } catch (error) {
    let json = {};
    try { json = error.stdout ? JSON.parse(error.stdout) : {}; } catch { /* controlled kill */ }
    return { exitCode: error.code, signal: error.signal ?? null, stderr: error.stderr ?? "", json };
  }
}

function configuration(storePath, sqliteBinary, label) {
  return {
    source: { kind: "synthetic-test", locator: `l08-w02-disposable:${label}` },
    authority_mode: "sqlite",
    sqlite: { database_url: storePath, sqlite_bin: sqliteBinary },
  };
}

const restoreAuthority = {
  human_authorized: true,
  acting_role: "restore-operator",
  authority_basis: "explicit disposable L08-W02 exact restore",
  human_confirmation_reference: "test-confirmation:l08-w02",
};

async function row(sqliteBinary, storePath, sql) {
  const { stdout } = await execFileWithInput(sqliteBinary, ["-batch", "-bail", "-json", storePath], { encoding: "utf8" }, sql);
  return JSON.parse(stdout)[0];
}

async function exists(candidate) {
  return stat(candidate).then(() => true).catch(() => false);
}

async function createCase(entrypoint, root, fixture, id, label) {
  const result = await invoke(entrypoint, root, {
    protocol,
    operation: "case.create",
    request_version: 1,
    operation_id: `operation:${fixture.label}:${label}`,
    store_id: fixture.initialization.store_id,
    context: fixture.context,
    expected_revision: 0,
    commit_basis: `retain exact ${label}`,
    provenance: { acting_role: "case-reconcile", authority_basis: "disposable restore fixture" },
    case: {
      id,
      home_namespace_id: fixture.initialization.namespace.id,
      state: "active",
      title: label,
      summary: `${label} exact summary`,
      scope: "L08-W02 disposable fixture",
      aliases: [], facets: [], entries: [], sources: [], relationships: [], references: [],
    },
    configuration: fixture.config,
  });
  assert.equal(result.exitCode, 0, JSON.stringify(result.json));
}

async function createFixture(root, sqliteBinary, label, entrypoint = sourceEntrypoint) {
  const storePath = path.join(root, `${label}.sqlite3`);
  const config = configuration(storePath, sqliteBinary, label);
  const initialized = await invoke(entrypoint, root, {
    protocol,
    operation: "initialize_store",
    operation_id: `operation:${label}:initialize`,
    authority_claim: { human_authorized: true, acting_role: "architect", authority_basis: "disposable restore fixture" },
    configuration: config,
  });
  assert.equal(initialized.exitCode, 0, initialized.stderr);
  const initialization = initialized.json.result.initialization;
  const fixture = {
    label, storePath, config, initialization,
    context: {
      view_id: initialization.view.id,
      view_policy_revision_id: initialization.view.policy_revision_id,
      purpose: "prepare exact restore evidence",
      requested_audience_ceiling: "private",
    },
  };
  await createCase(entrypoint, root, fixture, caseA, "snapshot-owner");
  const sourceFence = (await row(sqliteBinary, storePath, "SELECT operation_fence FROM store_fence;")).operation_fence;
  const snapshotRequest = {
    protocol,
    operation: "snapshot_store",
    operation_id: `operation:${label}:snapshot`,
    operation_kind: "snapshot",
    purpose: "capture the one named verified restore source",
    store_id: initialization.store_id,
    safety: { store_class: "disposable", authorization_reference: `disposable-authorization:${label}` },
    authority_claim: {
      human_authorized: true,
      acting_role: "restore-operator",
      authority_basis: "explicit disposable restore source",
      human_confirmation_reference: "test-confirmation:l08-w02-snapshot",
    },
    expected: {
      store_id: initialization.store_id,
      schema: { id: "casebook-persistence-sqlite", version: 1 },
      protocol,
      operation_fence: sourceFence,
    },
    snapshot: {
      path: path.join(root, `${label}.authorized.snapshot.sqlite3`),
      owner: "restore-operator",
      retention: "retain_until_explicit_deletion",
    },
    canonical_state_effect: "none",
    requested_postcondition_evidence: [
      "store_identity", "schema_identity", "operation_fence", "digest", "size", "consistency", "integrity",
    ],
    configuration: config,
  };
  const captured = await invoke(entrypoint, root, snapshotRequest);
  assert.equal(captured.exitCode, 0, captured.stderr);
  await createCase(entrypoint, root, fixture, caseB, "target-only-owner");
  fixture.snapshot = captured.json.result.snapshot;
  fixture.targetFence = (await row(sqliteBinary, storePath, "SELECT operation_fence FROM store_fence;")).operation_fence;
  return fixture;
}

function restoreRequest(root, fixture) {
  return {
    protocol,
    operation: "restore_store",
    operation_id: `operation:${fixture.label}:restore`,
    operation_kind: "restore",
    purpose: "replace this named disposable target with exactly the authorized verified snapshot",
    store_id: fixture.initialization.store_id,
    safety: { store_class: "disposable", authorization_reference: `disposable-authorization:${fixture.label}` },
    authority_claim: structuredClone(restoreAuthority),
    expected_target: {
      store_id: fixture.initialization.store_id,
      schema: { id: "casebook-persistence-sqlite", version: 1 },
      protocol,
      operation_fence: fixture.targetFence,
    },
    snapshot: {
      path: fixture.snapshot.path,
      sha256: fixture.snapshot.sha256,
      size_bytes: fixture.snapshot.size_bytes,
      store_id: fixture.snapshot.source.store_id,
      schema: fixture.snapshot.source.schema,
      protocol: fixture.snapshot.source.protocol,
      operation_fence: fixture.snapshot.source.operation_fence,
      verified: true,
    },
    pre_restore: {
      path: path.join(root, `${fixture.label}.retained-pre-restore.sqlite3`),
      owner: "restore-operator",
      retention: "retain_until_explicit_deletion",
    },
    replacement: { mode: "exact", atomicity: "same_directory_rename" },
    canonical_state_effect: "exact-replacement",
    requested_postcondition_evidence: [
      "store_identity", "schema_identity", "protocol_identity", "snapshot_digest", "integrity",
      "healthy_exposure", "pre_restore_copy", "replacement_classification",
    ],
    configuration: fixture.config,
  };
}

async function exerciseSuccessfulRestore(root, sqliteBinary, entrypoint, label) {
  const fixture = await createFixture(root, sqliteBinary, label, entrypoint);
  const request = restoreRequest(root, fixture);
  const restored = await invoke(entrypoint, root, request);
  assert.equal(restored.exitCode, 0, restored.stderr);
  assert.equal(restored.json.result.status, "settled");
  assert.deepEqual(restored.json.result.terminal, {
    outcome: "restored",
    code: "restore_completed",
    failure_class: null,
    retry_disposition: "never",
    canonical_state_effect: "exact-replacement",
    replacement_state: "replaced_healthy",
  });
  assert.equal(restored.json.result.receipt.operation_kind, "restore");
  assert.equal(restored.json.result.replacement.classification, "replaced_healthy");
  assert.equal(restored.json.result.replacement.atomic, true);
  assert.equal(restored.json.result.replacement.merge_performed, false);
  assert.deepEqual(restored.json.result.health, { exposed: true, quick_check: "ok", foreign_key_violations: 0 });
  assert.equal(restored.json.result.snapshot.sha256, fixture.snapshot.sha256);
  assert.equal(restored.json.result.snapshot.verified, true);
  assert.equal(restored.json.result.pre_restore.verified, true);
  assert.equal(restored.json.result.pre_restore.custody.retention, "retain_until_explicit_deletion");
  assert.equal(await exists(request.pre_restore.path), true);
  assert.deepEqual(await row(sqliteBinary, fixture.storePath, `SELECT
    (SELECT count(*) FROM owners WHERE owner_id='${caseA}') AS snapshot_owner,
    (SELECT count(*) FROM owners WHERE owner_id='${caseB}') AS target_only_owner,
    (SELECT count(*) FROM store_operation_receipts WHERE operation_id='${request.operation_id}') AS restore_receipt,
    (SELECT count(*) FROM pragma_foreign_key_check) AS foreign_key_violations;`), {
    snapshot_owner: 1, target_only_owner: 0, restore_receipt: 1, foreign_key_violations: 0,
  });
  assert.deepEqual(await row(sqliteBinary, request.pre_restore.path, `SELECT
    (SELECT count(*) FROM owners WHERE owner_id='${caseA}') AS snapshot_owner,
    (SELECT count(*) FROM owners WHERE owner_id='${caseB}') AS target_only_owner,
    (SELECT count(*) FROM store_operation_receipts WHERE operation_id='${request.operation_id}') AS restore_receipt;`), {
    snapshot_owner: 1, target_only_owner: 1, restore_receipt: 0,
  });

  const replay = await invoke(entrypoint, root, request);
  assert.equal(replay.exitCode, 0, replay.stderr);
  assert.deepEqual(replay.json.result, restored.json.result);
  const lookup = await invoke(entrypoint, root, {
    protocol,
    operation: "get_store_operation_receipt",
    operation_id: request.operation_id,
    store_id: fixture.initialization.store_id,
    authority_claim: restoreAuthority,
    context: { ...fixture.context, purpose: "recover the exact restore terminal receipt" },
    configuration: fixture.config,
  });
  assert.equal(lookup.exitCode, 0, lookup.stderr);
  assert.equal(lookup.json.result.receipt.operation_kind, "restore");
  assert.deepEqual(lookup.json.result.receipt.result, restored.json.result);
  return { fixture, request, restored };
}

test("authorized exact restore retains prior health, atomically replaces without merge, verifies health, and durably replays", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l08-w02-success-"));
  try {
    await exerciseSuccessfulRestore(root, sqliteBinary, sourceEntrypoint, "success");
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await exists(root), false);
  }
});

test("restore authorization, target identity, snapshot digest, and compatibility fail closed as not_replaced", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l08-w02-reject-"));
  try {
    const unauthorizedFixture = await createFixture(root, sqliteBinary, "unauthorized");
    const unauthorizedRequest = restoreRequest(root, unauthorizedFixture);
    delete unauthorizedRequest.authority_claim.human_confirmation_reference;
    const denied = await invoke(sourceEntrypoint, root, unauthorizedRequest);
    assert.equal(denied.exitCode, 2);
    assert.equal(denied.json.failure.code, "human_confirmation_reference_required");
    assert.equal(await exists(unauthorizedRequest.pre_restore.path), false);

    for (const [label, mutate, expectedCode] of [
      ["digest", (request) => { request.snapshot.sha256 = "0".repeat(64); }, "snapshot_digest_mismatch"],
      ["protocol", (request) => { request.snapshot.protocol.version = 9; }, "snapshot_protocol_incompatible"],
      ["store", (request) => { request.snapshot.store_id = "store:unrelated"; }, "snapshot_store_mismatch"],
    ]) {
      const fixture = await createFixture(root, sqliteBinary, label);
      const request = restoreRequest(root, fixture);
      mutate(request);
      const rejected = await invoke(sourceEntrypoint, root, request);
      assert.equal(rejected.exitCode, 0, `${label}: ${rejected.stderr}`);
      assert.equal(rejected.json.result.terminal.replacement_state, "not_replaced", label);
      assert.equal(rejected.json.result.terminal.code, expectedCode, label);
      assert.equal(rejected.json.result.replacement.classification, "not_replaced", label);
      assert.equal(await exists(request.pre_restore.path), false, label);
      assert.equal((await row(sqliteBinary, fixture.storePath, `SELECT count(*) AS count FROM owners WHERE owner_id='${caseB}';`)).count, 1, label);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await exists(root), false);
  }
});

test("an exact retry recovers replacement completed before health verification and receipt settlement", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l08-w02-recovery-"));
  try {
    const fixture = await createFixture(root, sqliteBinary, "recovery");
    const request = restoreRequest(root, fixture);
    const interrupted = await invoke(sourceEntrypoint, root, request, {
      CASEBOOK_PERSISTENCE_TEST_FAULT: "restore_after_atomic_replace_before_verification",
    });
    assert.equal(interrupted.signal, "SIGKILL");
    assert.equal(await exists(request.pre_restore.path), true);

    const recovered = await invoke(sourceEntrypoint, root, request);
    assert.equal(recovered.exitCode, 0, recovered.stderr);
    assert.equal(recovered.json.result.terminal.replacement_state, "replaced_healthy");
    assert.equal(recovered.json.result.recovery.disposition, "verified_replacement_receipt_recovered");
    assert.equal(recovered.json.result.recovery.intent_matched, true);
    const replay = await invoke(sourceEntrypoint, root, request);
    assert.deepEqual(replay.json.result, recovered.json.result);
    assert.equal(await exists(`${request.pre_restore.path}.restore-state.json`), false);
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await exists(root), false);
  }
});

test("sandbox-generated Pi, Codex, and OpenCode packages execute the same exact retained-copy restore", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l08-w02-generated-"));
  try {
    const sandbox = await generateAndValidateSandbox({ sandboxRoot: root, sqliteBinary });
    for (const generated of sandbox.results) {
      const entrypoint = path.join(generated.package_root, "variants/sqlite/bin/casebook-persistence.mjs");
      const { request } = await exerciseSuccessfulRestore(root, sqliteBinary, entrypoint, `generated-${generated.target}`);
      await rm(request.pre_restore.path);
      await rm(request.snapshot.path);
      assert.equal(await exists(request.pre_restore.path), false, `${generated.target} retained-copy owner cleanup`);
      assert.equal(await exists(request.snapshot.path), false, `${generated.target} snapshot owner cleanup`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await exists(root), false);
  }
});
