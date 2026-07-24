import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { generateAndValidateSandbox, selectCompatibleSqliteBinary } from "./sandbox-harness.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entrypoint = path.join(packageRoot, "variants/sqlite/bin/casebook-persistence.mjs");
const protocol = { id: "casebook-persistence-json", version: 1 };

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

async function invoke(cwd, request, extraEnv = {}, selectedEntrypoint = entrypoint) {
  try {
    const { stdout, stderr } = await execFileWithInput(process.execPath, [selectedEntrypoint], {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? "", HOME: cwd, ...extraEnv },
    }, `${JSON.stringify(request)}\n`);
    return { exitCode: 0, stderr, json: JSON.parse(stdout) };
  } catch (error) {
    return {
      exitCode: error.code,
      signal: error.signal ?? null,
      stderr: error.stderr ?? "",
      json: error.stdout ? JSON.parse(error.stdout) : {},
    };
  }
}

function configuration(storePath, sqliteBinary) {
  return {
    source: { kind: "synthetic-test", locator: "l08-w01-disposable" },
    authority_mode: "sqlite",
    sqlite: { database_url: storePath, sqlite_bin: sqliteBinary },
  };
}

const authorityClaim = {
  human_authorized: true,
  acting_role: "architect",
  authority_basis: "explicit disposable L08-W01 exact-snapshot test",
  human_confirmation_reference: "test-confirmation:l08-w01",
};

async function initializedStore(root, sqliteBinary, label, selectedEntrypoint = entrypoint) {
  const storePath = path.join(root, `${label}.sqlite3`);
  const initialized = await invoke(root, {
    protocol,
    operation: "initialize_store",
    operation_id: `operation:${label}:initialize`,
    authority_claim: {
      human_authorized: true,
      acting_role: authorityClaim.acting_role,
      authority_basis: authorityClaim.authority_basis,
    },
    configuration: configuration(storePath, sqliteBinary),
  }, {}, selectedEntrypoint);
  assert.equal(initialized.exitCode, 0, initialized.stderr);
  return { storePath, initialization: initialized.json.result.initialization };
}

function snapshotRequest(root, sqliteBinary, initialized, label) {
  return {
    protocol,
    operation: "snapshot_store",
    operation_id: `operation:${label}:snapshot`,
    operation_kind: "snapshot",
    purpose: "capture one explicitly named disposable test store exactly",
    store_id: initialized.initialization.store_id,
    safety: {
      store_class: "disposable",
      authorization_reference: `disposable-authorization:${label}`,
    },
    authority_claim: structuredClone(authorityClaim),
    expected: {
      store_id: initialized.initialization.store_id,
      schema: { id: "casebook-persistence-sqlite", version: 3 },
      protocol,
      operation_fence: 1,
    },
    snapshot: {
      path: path.join(root, `${label}.exact.snapshot.sqlite3`),
      owner: "test-owner:l08-w01",
      retention: "retain_until_explicit_deletion",
    },
    canonical_state_effect: "none",
    requested_postcondition_evidence: [
      "store_identity",
      "schema_identity",
      "operation_fence",
      "digest",
      "size",
      "consistency",
      "integrity",
    ],
    configuration: configuration(initialized.storePath, sqliteBinary),
  };
}

async function exists(candidate) {
  return stat(candidate).then(() => true).catch(() => false);
}

async function row(sqliteBinary, storePath, sql) {
  const { stdout } = await execFileWithInput(sqliteBinary, ["-batch", "-bail", "-json", storePath], { encoding: "utf8" }, sql);
  return JSON.parse(stdout)[0];
}

function canonicalCountsSql() {
  return `SELECT
    (SELECT count(*) FROM owners) AS owners,
    (SELECT count(*) FROM owner_revisions) AS owner_revisions,
    (SELECT count(*) FROM owner_events) AS owner_events,
    (SELECT count(*) FROM namespaces) AS namespaces,
    (SELECT user_version FROM pragma_user_version) AS schema_version;`;
}

test("authorized snapshot creates and verifies one exact retained SQLite snapshot with durable replay metadata", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l08-w01-success-"));
  try {
    const initialized = await initializedStore(root, sqliteBinary, "success");
    const request = snapshotRequest(root, sqliteBinary, initialized, "success");
    const sourceBefore = await row(sqliteBinary, initialized.storePath, canonicalCountsSql());

    const captured = await invoke(root, request);
    assert.equal(captured.exitCode, 0, captured.stderr);
    assert.equal(captured.json.result.status, "settled");
    assert.deepEqual(captured.json.result.terminal, {
      outcome: "snapshotted",
      code: "snapshot_completed",
      failure_class: null,
      retry_disposition: "never",
      canonical_state_effect: "none",
    });
    assert.equal(captured.json.result.receipt.operation_kind, "snapshot");
    assert.equal(captured.json.result.receipt.store_id, initialized.initialization.store_id);
    assert.equal(captured.json.result.receipt.operation_fence, 2);
    assert.deepEqual(captured.json.result.snapshot.source, {
      store_id: initialized.initialization.store_id,
      schema: { id: "casebook-persistence-sqlite", version: 3 },
      protocol,
      operation_fence: 1,
    });
    assert.deepEqual(captured.json.result.snapshot.consistency, {
      mode: "sqlite_transactionally_consistent",
      method: "sqlite_vacuum_into",
    });
    assert.deepEqual(captured.json.result.snapshot.integrity, { quick_check: "ok", foreign_key_violations: 0 });
    assert.deepEqual(captured.json.result.snapshot.custody, {
      owner: "test-owner:l08-w01",
      retention: "retain_until_explicit_deletion",
      authoritative: false,
      cleanup: "delete_only_after_explicit_owner_authorization",
    });
    assert.equal(captured.json.result.snapshot.verified, true);
    assert.match(captured.json.result.snapshot.sha256, /^[0-9a-f]{64}$/);
    assert.equal(captured.json.result.snapshot.size_bytes > 0, true);

    const bytes = await readFile(request.snapshot.path);
    assert.equal(bytes.length, captured.json.result.snapshot.size_bytes);
    assert.equal(createHash("sha256").update(bytes).digest("hex"), captured.json.result.snapshot.sha256);
    assert.deepEqual(await row(sqliteBinary, request.snapshot.path, canonicalCountsSql()), sourceBefore);
    assert.deepEqual(await row(sqliteBinary, initialized.storePath, canonicalCountsSql()), sourceBefore);

    const replay = await invoke(root, request);
    assert.equal(replay.exitCode, 0, replay.stderr);
    assert.deepEqual(replay.json.result, captured.json.result);
    assert.equal(await exists(request.snapshot.path), true, "retained snapshot remains owned for dependent restore work");

  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await exists(root), false);
  }
});

test("snapshot authorization, exact preconditions, and operation identity fail closed without adopting an unrelated target", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l08-w01-reject-"));
  try {
    const initialized = await initializedStore(root, sqliteBinary, "reject");

    const noConfirmation = snapshotRequest(root, sqliteBinary, initialized, "no-confirmation");
    delete noConfirmation.authority_claim.human_confirmation_reference;
    const denied = await invoke(root, noConfirmation);
    assert.equal(denied.exitCode, 2);
    assert.equal(denied.json.failure.class, "authority_required");
    assert.equal(denied.json.failure.code, "human_confirmation_reference_required");
    assert.equal(await exists(noConfirmation.snapshot.path), false);

    const wrongFence = snapshotRequest(root, sqliteBinary, initialized, "wrong-fence");
    wrongFence.expected.operation_fence = 9;
    const conflict = await invoke(root, wrongFence);
    assert.equal(conflict.exitCode, 0, conflict.stderr);
    assert.equal(conflict.json.result.terminal.outcome, "conflict");
    assert.equal(conflict.json.result.terminal.code, "expected_store_fence_mismatch");
    assert.equal(conflict.json.result.terminal.canonical_state_effect, "none");
    assert.equal(await exists(wrongFence.snapshot.path), false);

    const existingTarget = snapshotRequest(root, sqliteBinary, initialized, "existing-target");
    existingTarget.expected.operation_fence = 2;
    await writeFile(existingTarget.snapshot.path, "not a snapshot");
    const rejected = await invoke(root, existingTarget);
    assert.equal(rejected.exitCode, 0, rejected.stderr);
    assert.equal(rejected.json.result.terminal.outcome, "rejected");
    assert.equal(rejected.json.result.terminal.code, "snapshot_target_exists");
    assert.equal(await readFile(existingTarget.snapshot.path, "utf8"), "not a snapshot");

    const accepted = snapshotRequest(root, sqliteBinary, initialized, "accepted");
    accepted.expected.operation_fence = 3;
    const first = await invoke(root, accepted);
    assert.equal(first.exitCode, 0, first.stderr);
    assert.equal(first.json.result.terminal.outcome, "snapshotted");
    const mismatch = structuredClone(accepted);
    mismatch.purpose = "reuse the settled identity for a different snapshot request";
    const refused = await invoke(root, mismatch);
    assert.equal(refused.exitCode, 2);
    assert.equal(refused.json.failure.class, "idempotency_mismatch");
    assert.equal(refused.json.failure.code, "idempotency_mismatch");
    assert.equal(await exists(accepted.snapshot.path), true);
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await exists(root), false);
  }
});

test("sandbox-generated Pi, Codex, and OpenCode packages create the same retained exact snapshot", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l08-w01-generated-"));
  try {
    const sandbox = await generateAndValidateSandbox({ sandboxRoot: root, sqliteBinary });
    for (const generated of sandbox.results) {
      const generatedEntrypoint = path.join(generated.package_root, "variants/sqlite/bin/casebook-persistence.mjs");
      const initialized = await initializedStore(root, sqliteBinary, `generated-${generated.target}`, generatedEntrypoint);
      const request = snapshotRequest(root, sqliteBinary, initialized, `generated-${generated.target}`);
      const captured = await invoke(root, request, {}, generatedEntrypoint);
      assert.equal(captured.exitCode, 0, `${generated.target}: ${captured.stderr}`);
      assert.equal(captured.json.result.terminal.outcome, "snapshotted", generated.target);
      assert.equal(captured.json.result.snapshot.verified, true, generated.target);
      assert.equal(captured.json.result.snapshot.custody.retention, "retain_until_explicit_deletion", generated.target);
      assert.equal(await exists(request.snapshot.path), true, generated.target);
      await rm(request.snapshot.path);
      assert.equal(await exists(request.snapshot.path), false, `${generated.target} explicit owner cleanup`);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await exists(root), false);
  }
});

test("an exact retry recovers a verified snapshot left between creation and durable receipt settlement", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l08-w01-recovery-"));
  try {
    const initialized = await initializedStore(root, sqliteBinary, "recovery");
    const request = snapshotRequest(root, sqliteBinary, initialized, "recovery");
    const interrupted = await invoke(root, request, { CASEBOOK_PERSISTENCE_TEST_FAULT: "snapshot_after_snapshot_verified" });
    assert.equal(interrupted.signal, "SIGKILL");
    assert.equal(await exists(request.snapshot.path), true);

    const recovered = await invoke(root, request);
    assert.equal(recovered.exitCode, 0, recovered.stderr);
    assert.equal(recovered.json.result.status, "settled");
    assert.equal(recovered.json.result.terminal.outcome, "snapshotted");
    assert.equal(recovered.json.result.recovery.disposition, "verified_snapshot_receipt_recovered");
    assert.equal(recovered.json.result.snapshot.recovered_after_interruption, true);

    const replay = await invoke(root, request);
    assert.equal(replay.exitCode, 0, replay.stderr);
    assert.deepEqual(replay.json.result, recovered.json.result);
    assert.equal(await exists(`${request.snapshot.path}.intent.json`), false);
    assert.deepEqual(await row(sqliteBinary, initialized.storePath, `SELECT
      (SELECT count(*) FROM store_operation_receipts WHERE operation_id='${request.operation_id}') AS receipts,
      (SELECT operation_fence FROM store_fence) AS operation_fence;`), { receipts: 1, operation_fence: 2 });
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await exists(root), false);
  }
});
