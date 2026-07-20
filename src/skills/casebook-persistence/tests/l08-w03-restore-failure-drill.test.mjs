import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { generateAndValidateSandbox, selectCompatibleSqliteBinary } from "./sandbox-harness.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceEntrypoint = path.join(packageRoot, "variants/sqlite/bin/casebook-persistence.mjs");
const protocol = { id: "casebook-persistence-json", version: 1 };
const snapshotOwner = "case:8d721563-13cc-42ae-b6cd-cb9558796ba2";
const targetOnlyOwner = "case:60adbb1f-892c-476e-b764-3aecbf53da1e";
const authorityClaim = {
  human_authorized: true,
  acting_role: "restore-drill-operator",
  authority_basis: "explicit disposable L08-W03 restore failure drill",
  human_confirmation_reference: "test-confirmation:l08-w03",
};

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
    try { json = error.stdout ? JSON.parse(error.stdout) : {}; } catch { /* A controlled kill has no JSON body. */ }
    return { exitCode: error.code, signal: error.signal ?? null, stderr: error.stderr ?? "", json };
  }
}

async function exists(candidate) {
  return stat(candidate).then(() => true).catch(() => false);
}

async function row(sqliteBinary, storePath, sql) {
  const { stdout } = await execFileWithInput(sqliteBinary, ["-batch", "-bail", "-json", storePath], { encoding: "utf8" }, sql);
  return JSON.parse(stdout)[0];
}

function configuration(storePath, sqliteBinary, label) {
  return {
    source: { kind: "synthetic-test", locator: `l08-w03-disposable:${label}` },
    authority_mode: "sqlite",
    sqlite: { database_url: storePath, sqlite_bin: sqliteBinary },
  };
}

async function createCase(entrypoint, root, fixture, id, label) {
  const created = await invoke(entrypoint, root, {
    protocol,
    operation: "case.create",
    request_version: 1,
    operation_id: `operation:${fixture.label}:${label}`,
    store_id: fixture.initialization.store_id,
    context: fixture.context,
    expected_revision: 0,
    commit_basis: `retain exact ${label}`,
    provenance: { acting_role: "case-reconcile", authority_basis: "disposable failure drill fixture" },
    case: {
      id,
      home_namespace_id: fixture.initialization.namespace.id,
      state: "active",
      title: label,
      summary: `${label} must remain byte-independent`,
      scope: "L08-W03 disposable restore failure drill",
      aliases: [], facets: [], entries: [], sources: [], relationships: [], references: [],
    },
    configuration: fixture.config,
  });
  assert.equal(created.exitCode, 0, JSON.stringify(created.json));
}

async function createFixture(root, sqliteBinary, entrypoint, label) {
  const storePath = path.join(root, `${label}.sqlite3`);
  const config = configuration(storePath, sqliteBinary, label);
  const initialized = await invoke(entrypoint, root, {
    protocol,
    operation: "initialize_store",
    operation_id: `operation:${label}:initialize`,
    authority_claim: { human_authorized: true, acting_role: "architect", authority_basis: "disposable failure drill fixture" },
    configuration: config,
  });
  assert.equal(initialized.exitCode, 0, initialized.stderr);
  const initialization = initialized.json.result.initialization;
  const fixture = {
    root, label, storePath, config, initialization,
    context: {
      view_id: initialization.view.id,
      view_policy_revision_id: initialization.view.policy_revision_id,
      purpose: "prepare exact restore failure evidence",
      requested_audience_ceiling: "private",
    },
  };
  await createCase(entrypoint, root, fixture, snapshotOwner, "snapshot-owner");
  const sourceFence = (await row(sqliteBinary, storePath, "SELECT operation_fence FROM store_fence;")).operation_fence;
  const snapshotRequest = {
    protocol,
    operation: "snapshot_store",
    operation_id: `operation:${label}:snapshot`,
    operation_kind: "snapshot",
    purpose: "retain the verified exact source for an independent restore failure drill",
    store_id: initialization.store_id,
    safety: { store_class: "disposable", authorization_reference: `disposable-authorization:${label}` },
    authority_claim: structuredClone(authorityClaim),
    expected: {
      store_id: initialization.store_id,
      schema: { id: "casebook-persistence-sqlite", version: 1 },
      protocol,
      operation_fence: sourceFence,
    },
    snapshot: {
      path: path.join(root, `${label}.authorized.snapshot.sqlite3`),
      owner: authorityClaim.acting_role,
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
  await createCase(entrypoint, root, fixture, targetOnlyOwner, "target-only-owner");
  fixture.snapshot = captured.json.result.snapshot;
  fixture.targetFence = (await row(sqliteBinary, storePath, "SELECT operation_fence FROM store_fence;")).operation_fence;
  return fixture;
}

function restoreRequest(fixture) {
  return {
    protocol,
    operation: "restore_store",
    operation_id: `operation:${fixture.label}:restore`,
    operation_kind: "restore",
    purpose: "independently drill exact replacement and failure recovery on this disposable target",
    store_id: fixture.initialization.store_id,
    safety: { store_class: "disposable", authorization_reference: `disposable-authorization:${fixture.label}` },
    authority_claim: structuredClone(authorityClaim),
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
      path: path.join(fixture.root, `${fixture.label}.retained-pre-restore.sqlite3`),
      owner: authorityClaim.acting_role,
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

function receiptLookup(fixture, request) {
  return {
    protocol,
    operation: "get_store_operation_receipt",
    operation_id: request.operation_id,
    store_id: fixture.initialization.store_id,
    authority_claim: { human_authorized: true, acting_role: authorityClaim.acting_role, authority_basis: "receipt-first restore recovery" },
    context: { ...fixture.context, purpose: "recover the uncertain restore receipt before replay" },
    configuration: fixture.config,
  };
}

function assertMechanicalReplacement(result, classification) {
  assert.equal(result.terminal.replacement_state, classification);
  assert.equal(result.replacement.classification, classification);
  assert.equal(result.replacement.merge_performed, false);
  assert.equal(result.replacement.semantic_interpretation_performed, false);
}

async function assertOwnerState(sqliteBinary, storePath, { snapshot = 1, targetOnly }) {
  assert.deepEqual(await row(sqliteBinary, storePath, `SELECT
    (SELECT count(*) FROM owners WHERE owner_id='${snapshotOwner}') AS snapshot_owner,
    (SELECT count(*) FROM owners WHERE owner_id='${targetOnlyOwner}') AS target_only_owner,
    (SELECT count(*) FROM pragma_foreign_key_check) AS foreign_key_violations;`), {
    snapshot_owner: snapshot,
    target_only_owner: targetOnly,
    foreign_key_violations: 0,
  });
}

async function assertPriorCopyRetained(sqliteBinary, request) {
  assert.equal(await exists(request.pre_restore.path), true);
  await assertOwnerState(sqliteBinary, request.pre_restore.path, { targetOnly: 1 });
}

async function runFailureDrill(root, sqliteBinary, entrypoint, prefix) {
  for (const [kind, mutate, code] of [
    ["digest", (request) => { request.snapshot.sha256 = "0".repeat(64); }, "snapshot_digest_mismatch"],
    ["compatibility", (request) => { request.snapshot.protocol.version = 9; }, "snapshot_protocol_incompatible"],
  ]) {
    const fixture = await createFixture(root, sqliteBinary, entrypoint, `${prefix}-${kind}-refusal`);
    const request = restoreRequest(fixture);
    mutate(request);
    const refused = await invoke(entrypoint, root, request);
    assert.equal(refused.exitCode, 0, refused.stderr);
    assert.equal(refused.json.result.terminal.code, code);
    assertMechanicalReplacement(refused.json.result, "not_replaced");
    assert.equal(await exists(request.pre_restore.path), false);
    await assertOwnerState(sqliteBinary, fixture.storePath, { targetOnly: 1 });
    const receipt = await invoke(entrypoint, root, receiptLookup(fixture, request));
    assert.deepEqual(receipt.json.result.receipt.result, refused.json.result);
  }

  const replacement = await createFixture(root, sqliteBinary, entrypoint, `${prefix}-replacement-failure`);
  const replacementRequest = restoreRequest(replacement);
  const notReplaced = await invoke(entrypoint, root, replacementRequest, {
    CASEBOOK_PERSISTENCE_TEST_FAULT: "restore_before_atomic_replace",
  });
  assert.equal(notReplaced.exitCode, 0, notReplaced.stderr);
  assert.equal(notReplaced.json.result.terminal.code, "restore_failed_before_replace");
  assertMechanicalReplacement(notReplaced.json.result, "not_replaced");
  await assertOwnerState(sqliteBinary, replacement.storePath, { targetOnly: 1 });
  await assertPriorCopyRetained(sqliteBinary, replacementRequest);
  const notReplacedReplay = await invoke(entrypoint, root, replacementRequest);
  assert.deepEqual(notReplacedReplay.json.result, notReplaced.json.result);

  const recovered = await createFixture(root, sqliteBinary, entrypoint, `${prefix}-replacement-recovery`);
  const recoveredRequest = restoreRequest(recovered);
  const interrupted = await invoke(entrypoint, root, recoveredRequest, {
    CASEBOOK_PERSISTENCE_TEST_FAULT: "restore_after_atomic_replace_before_verification",
  });
  assert.equal(interrupted.signal, "SIGKILL");
  await assertPriorCopyRetained(sqliteBinary, recoveredRequest);
  const receiptFirst = await invoke(entrypoint, root, receiptLookup(recovered, recoveredRequest));
  assert.equal(receiptFirst.json.result.status, "absent_at_fence");
  const replacedHealthy = await invoke(entrypoint, root, recoveredRequest);
  assert.equal(replacedHealthy.exitCode, 0, replacedHealthy.stderr);
  assertMechanicalReplacement(replacedHealthy.json.result, "replaced_healthy");
  assert.equal(replacedHealthy.json.result.recovery.disposition, "verified_replacement_receipt_recovered");
  await assertOwnerState(sqliteBinary, recovered.storePath, { targetOnly: 0 });
  const healthyReceipt = await invoke(entrypoint, root, receiptLookup(recovered, recoveredRequest));
  assert.deepEqual(healthyReceipt.json.result.receipt.result, replacedHealthy.json.result);
  assert.deepEqual((await invoke(entrypoint, root, recoveredRequest)).json.result, replacedHealthy.json.result);

  const verification = await createFixture(root, sqliteBinary, entrypoint, `${prefix}-verification-failure`);
  const verificationRequest = restoreRequest(verification);
  const verificationInterrupted = await invoke(entrypoint, root, verificationRequest, {
    CASEBOOK_PERSISTENCE_TEST_FAULT: "restore_after_unhealthy_quarantine",
  });
  assert.equal(verificationInterrupted.signal, "SIGKILL");
  assert.equal(await exists(verification.storePath), false);
  await assertPriorCopyRetained(sqliteBinary, verificationRequest);
  const unavailableReceipt = await invoke(entrypoint, root, receiptLookup(verification, verificationRequest));
  assert.equal(unavailableReceipt.json.result.status, "store_unavailable");
  const rolledBackHealthy = await invoke(entrypoint, root, verificationRequest);
  assert.equal(rolledBackHealthy.exitCode, 0, rolledBackHealthy.stderr);
  assert.equal(rolledBackHealthy.json.result.terminal.code, "restore_replaced_unhealthy_rolled_back");
  assertMechanicalReplacement(rolledBackHealthy.json.result, "rolled_back_healthy");
  assert.equal(rolledBackHealthy.json.result.health.exposed, true);
  assert.equal(await exists(rolledBackHealthy.json.result.replacement.unhealthy_quarantine.path), true);
  await assertOwnerState(sqliteBinary, verification.storePath, { targetOnly: 1 });
  await assertPriorCopyRetained(sqliteBinary, verificationRequest);
  const rollbackReceipt = await invoke(entrypoint, root, receiptLookup(verification, verificationRequest));
  assert.deepEqual(rollbackReceipt.json.result.receipt.result, rolledBackHealthy.json.result);
  assert.deepEqual((await invoke(entrypoint, root, verificationRequest)).json.result, rolledBackHealthy.json.result);

  const rollback = await createFixture(root, sqliteBinary, entrypoint, `${prefix}-rollback-failure`);
  const rollbackRequest = restoreRequest(rollback);
  const replacedUnhealthy = await invoke(entrypoint, root, rollbackRequest, {
    CASEBOOK_PERSISTENCE_TEST_FAULT: "restore_rollback_fail",
  });
  assert.equal(replacedUnhealthy.exitCode, 0, replacedUnhealthy.stderr);
  assertMechanicalReplacement(replacedUnhealthy.json.result, "replaced_unhealthy");
  assert.equal(replacedUnhealthy.json.result.health.exposed, false);
  assert.equal(await exists(rollback.storePath), false);
  assert.equal(await exists(replacedUnhealthy.json.result.replacement.unhealthy_quarantine.path), true);
  await assertPriorCopyRetained(sqliteBinary, rollbackRequest);
  const unavailable = await invoke(entrypoint, root, receiptLookup(rollback, rollbackRequest));
  assert.equal(unavailable.json.result.status, "store_unavailable");
  const externalReplay = await invoke(entrypoint, root, rollbackRequest);
  assert.deepEqual(externalReplay.json.result, replacedUnhealthy.json.result);
}

test("independent disposable restore failure drill proves all terminal classifications, custody, quarantine, and receipt-first replay", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l08-w03-source-"));
  try {
    await runFailureDrill(root, sqliteBinary, sourceEntrypoint, "source");
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await exists(root), false);
  }
});

test("generated Pi, Codex, and OpenCode copies pass the same disposable restore failure drill", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l08-w03-generated-"));
  try {
    const sandbox = await generateAndValidateSandbox({ sandboxRoot: root, sqliteBinary });
    for (const generated of sandbox.results) {
      const entrypoint = path.join(generated.package_root, "variants/sqlite/bin/casebook-persistence.mjs");
      await runFailureDrill(root, sqliteBinary, entrypoint, generated.target);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await exists(root), false);
  }
});
