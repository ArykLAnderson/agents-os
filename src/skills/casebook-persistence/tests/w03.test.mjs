import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  canonicalCommitRequestDigest,
  mechanicalDigest,
} from "../variants/sqlite/lib/substrate/mechanical.mjs";
import {
  cleanupSandbox,
  generateAndValidateSandbox,
  selectCompatibleSqliteBinary,
} from "./sandbox-harness.mjs";

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceEntrypoint = path.join(packageRoot, "variants/sqlite/bin/casebook-persistence.mjs");
const sourceMechanicalDriver = path.join(packageRoot, "tests/internal-mechanical-driver.mjs");
const protocol = { id: "casebook-persistence-json", version: 1 };
const authorityClaim = {
  human_authorized: true,
  acting_role: "architect",
  authority_basis: "explicit synthetic L01-W03 test authorization",
};
const ids = Object.freeze({
  ownerA: "case:612e0c03-fc34-4f40-a575-3b6327d05764",
  ownerB: "case:feef2e20-2b20-43e4-bac9-8fab07d8168c",
  familyA: "entry:7b8b7928-c86a-49d1-aeca-60c8d58fd236",
  familyB: "entry:7035dcb6-20de-470c-b3ee-8b40674aa75c",
  versionA1: "version:263ca46e-f8d2-48d2-a1b5-6863bf80b13c",
  versionA2: "version:bae61b2f-a77f-498b-91f5-5c7dac3c0727",
  versionB1: "version:2a39ad07-8530-4922-847c-6b8fb3d648db",
  revisionA1: "owner-revision:7e52dd92-41b2-4be6-b872-6428b220894b",
  revisionA2: "owner-revision:3bc2e54e-9bab-45c4-b25a-97ffaf86e603",
  revisionB1: "owner-revision:0c157bc9-406a-4572-a075-669cac6448c2",
  eventA1: "event:92dc44c3-c361-4b39-9f77-40f4032c8608",
  eventA2: "event:cb720704-6b25-49ac-8402-f9e013da5bc8",
  eventB1: "event:a0672e1d-2161-4a00-a7b7-1343579c761c",
  outboxA1: "outbox:de57dc97-103f-462d-b1d9-408d5b56667e",
  outboxA2: "outbox:71264ad5-79b8-4066-909a-fb68e1b9d075",
  outboxB1: "outbox:ff629bd5-74f6-44d8-8d65-b5a4d1d69f25",
});

function execFileWithInput(file, args, options, input) {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
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
    return { exitCode: 0, stdout, stderr, json: JSON.parse(stdout) };
  } catch (error) {
    const stdout = error.stdout ?? "";
    return { exitCode: error.code, stdout, stderr: error.stderr ?? "", json: stdout ? JSON.parse(stdout) : {} };
  }
}

function configuration(storePath, sqliteBinary) {
  return {
    source: { kind: "synthetic-test", locator: "w03-disposable" },
    authority_mode: "sqlite",
    sqlite: { database_url: storePath, sqlite_bin: sqliteBinary },
  };
}

async function makeRoot(label) {
  return mkdtemp(path.join(os.tmpdir(), `casebook-persistence-${label}-`));
}

async function removeAndVerify(root) {
  await rm(root, { recursive: true, force: true });
  assert.equal(await stat(root).then(() => true).catch(() => false), false);
}

async function initialize(entrypoint, cwd, storePath, sqliteBinary, operationId = "operation:w03-initialize") {
  const response = await invoke(entrypoint, cwd, {
    protocol,
    operation: "initialize_store",
    operation_id: operationId,
    authority_claim: authorityClaim,
    configuration: configuration(storePath, sqliteBinary),
  });
  assert.equal(response.exitCode, 0, response.stderr);
  return response.json.result.initialization;
}

function contextFor(initialized, purpose = "synthetic owner commit") {
  return {
    view_id: initialized.view.id,
    view_policy_revision_id: initialized.view.policy_revision_id,
    purpose,
    requested_audience_ceiling: "private",
  };
}

function envelopeFor(initialized, options = {}) {
  const update = options.expectedRevision === 1;
  const ownerId = options.ownerId ?? ids.ownerA;
  const familyId = options.familyId ?? (ownerId === ids.ownerA ? ids.familyA : ids.familyB);
  const versionId = options.versionId ?? (update ? ids.versionA2 : ownerId === ids.ownerA ? ids.versionA1 : ids.versionB1);
  const revisionId = options.revisionId ?? (update ? ids.revisionA2 : ownerId === ids.ownerA ? ids.revisionA1 : ids.revisionB1);
  const eventId = options.eventId ?? (update ? ids.eventA2 : ownerId === ids.ownerA ? ids.eventA1 : ids.eventB1);
  const outboxId = options.outboxId ?? (update ? ids.outboxA2 : ownerId === ids.ownerA ? ids.outboxA1 : ids.outboxB1);
  const content = { value: options.value ?? (update ? "second" : "first") };
  const eventPayload = { change: update ? "updated" : "created" };
  const outboxPayload = { projection: update ? 2 : 1 };
  return {
    envelope_version: 1,
    operation_id: options.operationId ?? (update ? "operation:w03-update-a" : `operation:w03-create-${ownerId}`),
    store_id: initialized.store_id,
    request_digest: "0".repeat(64),
    owner: { id: ownerId, kind: "case", home_namespace_id: initialized.namespace.id },
    expected_revision: options.expectedRevision ?? 0,
    representation: { id: "synthetic-owner-neutral", version: 1 },
    revision: {
      id: revisionId,
      number: (options.expectedRevision ?? 0) + 1,
      normalized: { title: options.value ?? (update ? "second" : "first") },
      versions: [{ family_id: familyId, version_id: versionId, content, content_digest: mechanicalDigest(content) }],
      selections: [{ family_id: familyId, version_id: versionId }],
    },
    current_projection: { label: options.value ?? (update ? "second" : "first") },
    event: {
      id: eventId,
      type: "owner.revision_committed",
      schema_version: 1,
      visibility_ceiling: "private",
      payload: eventPayload,
      payload_digest: mechanicalDigest(eventPayload),
    },
    outbox: [{ id: outboxId, kind: "projection.refresh", payload: outboxPayload, payload_digest: mechanicalDigest(outboxPayload) }],
    provenance: { acting_role: "synthetic-test", authority_basis: "L01-W03", commit_basis: "mechanical proof" },
  };
}

function commitRequest(storePath, sqliteBinary, initialized, envelope, digestFunction = canonicalCommitRequestDigest) {
  const context = contextFor(initialized);
  envelope.request_digest = digestFunction(initialized.store_id, context, envelope);
  return {
    protocol,
    operation: "commit_owner_revision",
    context,
    envelope,
    configuration: configuration(storePath, sqliteBinary),
  };
}

function ownerReadRequest(storePath, sqliteBinary, initialized, ownerId = ids.ownerA) {
  return {
    protocol,
    operation: "read_owner_current",
    store_id: initialized.store_id,
    context: contextFor(initialized, "bounded current owner read"),
    owner: { id: ownerId, kind: "case", home_namespace_id: initialized.namespace.id },
    configuration: configuration(storePath, sqliteBinary),
  };
}

function ownerReceiptRequest(storePath, sqliteBinary, initialized, operationId, ownerId = ids.ownerA) {
  return {
    protocol,
    operation: "get_owner_operation_receipt",
    operation_id: operationId,
    store_id: initialized.store_id,
    context: contextFor(initialized, "uncertain owner commit recovery"),
    owner: { id: ownerId, kind: "case", home_namespace_id: initialized.namespace.id },
    configuration: configuration(storePath, sqliteBinary),
  };
}

async function tableCounts(sqliteBinary, storePath) {
  const { stdout } = await execFileAsync(sqliteBinary, ["-json", storePath, `
    SELECT
      (SELECT count(*) FROM owners) AS owners,
      (SELECT count(*) FROM owner_versions) AS versions,
      (SELECT count(*) FROM owner_revisions) AS revisions,
      (SELECT count(*) FROM owner_current) AS current_rows,
      (SELECT count(*) FROM owner_events) AS events,
      (SELECT count(*) FROM owner_outbox) AS outbox,
      (SELECT count(*) FROM store_operation_receipts WHERE operation_kind = 'commit_owner_revision') AS commit_receipts;
  `], { encoding: "utf8" });
  return JSON.parse(stdout)[0];
}

async function waitForOutput(reader, marker) {
  const deadline = Date.now() + 10_000;
  while (!reader.output.includes(marker)) {
    if (reader.exitCode != null) throw new Error(`held reader exited before ${marker}: ${reader.stderr}`);
    if (Date.now() >= deadline) throw new Error(`timed out waiting for held reader marker ${marker}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function startHeldReader(sqliteBinary, storePath) {
  const child = spawn(sqliteBinary, ["-batch", "-bail", storePath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { PATH: process.env.PATH ?? "", HOME: path.dirname(storePath) },
  });
  const reader = { child, output: "", stderr: "", exitCode: null };
  child.stdout.on("data", (chunk) => { reader.output += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk) => { reader.stderr += chunk.toString("utf8"); });
  child.on("exit", (code) => { reader.exitCode = code; });
  child.stdin.write(".mode list\nBEGIN;\nSELECT 'held-before=' || count(*) FROM owners;\n");
  await waitForOutput(reader, "held-before=0");
  return reader;
}

async function closeHeldReader(reader) {
  if (reader.exitCode != null) return;
  const exited = new Promise((resolve) => reader.child.once("exit", resolve));
  reader.child.stdin.end("COMMIT;\n.quit\n");
  await exited;
}

test("shipped connector rejects generic W03 mechanical operations without touching a store", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await makeRoot("w03-public-boundary");
  try {
    const storePath = path.join(root, "must-remain-absent.sqlite3");
    const rejected = await invoke(sourceEntrypoint, root, {
      protocol,
      operation: "commit_owner_revision",
      configuration: configuration(storePath, sqliteBinary),
    });
    assert.equal(rejected.exitCode, 2);
    assert.equal(rejected.json.failure.code, "not_yet_implemented");
    assert.deepEqual(rejected.json.failure.evidence.supported_operations, [
      "diagnose", "initialize_store", "migrate_store", "get_store_operation_receipt",
      "events.page", "checkpoint.read", "checkpoint.compare_and_set",
      "reconciliation_snapshot.begin", "reconciliation_snapshot.page", "reconciliation_snapshot.finish",
      "impact.project", "export.preflight", "export.finalize",
      "case.create", "case.commit_revision", "case.read",
      "case.resolve", "case.search", "case.traverse",
      "case.tombstone.stage", "case.tombstone.commit", "case.purge.inspect",
      "case.export.fragment", "case.markdown.render", "case.markdown.stage_reconciliation",
      "frame.create", "frame.commit_revision", "frame.get_operation_receipt", "frame.resolve", "frame.read",
      "frame.export.fragment", "frame.discovery.read", "frame.disposition.read", "frame.history", "frame.list",
      "frame.legacy.prepare_reconciliation",
      "common.resolve", "common.list", "common.search",
      "interchange.export (sqlite)", "interchange.parse (markdown)",
    ]);
    assert.equal(await stat(storePath).then(() => true).catch(() => false), false);
  } finally {
    await removeAndVerify(root);
  }
});

test("create expected 0 commits one owner atomically and bounded common read returns its normalized evidence", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await makeRoot("w03-create");
  try {
    const storePath = path.join(root, "store.sqlite3");
    const initialized = await initialize(sourceEntrypoint, root, storePath, sqliteBinary);
    const envelope = envelopeFor(initialized);
    const response = await invoke(sourceMechanicalDriver, root, commitRequest(storePath, sqliteBinary, initialized, envelope));
    assert.equal(response.exitCode, 0, response.stderr);
    assert.equal(response.json.protocol.version, 1);
    assert.equal(response.json.result.committed_revision.number, 1);
    assert.equal(response.json.result.receipt.expected_revision, 0);
    assert.equal(response.json.result.receipt.committed_revision, 1);
    assert.equal(response.json.result.idempotent_replay, false);
    assert.match(response.stderr, /commit_owner_revision completed/);
    assert.doesNotThrow(() => JSON.parse(response.stdout));
    assert.deepEqual(await tableCounts(sqliteBinary, storePath), {
      owners: 1, versions: 1, revisions: 1, current_rows: 1, events: 1, outbox: 1, commit_receipts: 1,
    });

    const read = await invoke(sourceMechanicalDriver, root, ownerReadRequest(storePath, sqliteBinary, initialized));
    assert.equal(read.exitCode, 0, read.stderr);
    assert.equal(read.json.result.owner.id, ids.ownerA);
    assert.equal(read.json.result.revision.number, 1);
    assert.deepEqual(read.json.result.revision.normalized, { title: "first" });
    assert.equal(read.json.result.revision.selected_versions[0].version_id, ids.versionA1);
    assert.deepEqual(read.json.result.current_projection, { label: "first" });
  } finally {
    await removeAndVerify(root);
  }
});

test("held reader keeps WAL frames while new read-only queries see committed owner and receipt truth", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await makeRoot("w03-held-reader-wal");
  let heldReader;
  try {
    const storePath = path.join(root, "store.sqlite3");
    const initialized = await initialize(sourceEntrypoint, root, storePath, sqliteBinary, "operation:w03-wal-init");
    heldReader = await startHeldReader(sqliteBinary, storePath);
    const envelope = envelopeFor(initialized, { operationId: "operation:w03-wal-commit" });
    const committed = await invoke(
      sourceMechanicalDriver, root, commitRequest(storePath, sqliteBinary, initialized, envelope),
    );
    assert.equal(committed.exitCode, 0, committed.stderr);

    heldReader.child.stdin.write("SELECT 'held-after=' || count(*) FROM owners;\n");
    await waitForOutput(heldReader, "held-after=0");
    const wal = await stat(`${storePath}-wal`);
    assert.equal(wal.size > 0, true);

    const read = await invoke(
      sourceMechanicalDriver, root, ownerReadRequest(storePath, sqliteBinary, initialized),
    );
    assert.equal(read.json.result.status, "found");
    assert.equal(read.json.result.revision.number, 1);
    const receipt = await invoke(
      sourceMechanicalDriver, root,
      ownerReceiptRequest(storePath, sqliteBinary, initialized, envelope.operation_id),
    );
    assert.equal(receipt.json.result.status, "settled");
    assert.equal(receipt.json.result.receipt.committed_revision, 1);
  } finally {
    if (heldReader) await closeHeldReader(heldReader);
    await removeAndVerify(root);
  }
});

test("same canonical request replays original allocations while changed request, owner, and store binding mismatch", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await makeRoot("w03-idempotency");
  try {
    const storePath = path.join(root, "store.sqlite3");
    const initialized = await initialize(sourceEntrypoint, root, storePath, sqliteBinary);
    const envelope = envelopeFor(initialized, { operationId: "operation:w03-stable-replay" });
    const request = commitRequest(storePath, sqliteBinary, initialized, envelope);
    const first = await invoke(sourceMechanicalDriver, root, request);
    const replay = await invoke(sourceMechanicalDriver, root, request);
    assert.equal(first.exitCode, 0, first.stderr);
    assert.equal(replay.exitCode, 0, replay.stderr);
    assert.equal(replay.json.result.idempotent_replay, true);
    assert.deepEqual(replay.json.result.allocations, first.json.result.allocations);
    assert.deepEqual(replay.json.result.receipt, first.json.result.receipt);
    assert.deepEqual(await tableCounts(sqliteBinary, storePath), {
      owners: 1, versions: 1, revisions: 1, current_rows: 1, events: 1, outbox: 1, commit_receipts: 1,
    });

    const changedContent = structuredClone(request);
    changedContent.envelope.revision.normalized.title = "changed request";
    changedContent.envelope.request_digest = canonicalCommitRequestDigest(
      initialized.store_id, changedContent.context, changedContent.envelope,
    );
    const contentMismatch = await invoke(sourceMechanicalDriver, root, changedContent);
    assert.equal(contentMismatch.exitCode, 2);
    assert.equal(contentMismatch.json.failure.code, "idempotency_mismatch");

    const changedOwner = structuredClone(request);
    changedOwner.envelope.owner.id = ids.ownerB;
    changedOwner.envelope.request_digest = canonicalCommitRequestDigest(
      initialized.store_id, changedOwner.context, changedOwner.envelope,
    );
    const ownerMismatch = await invoke(sourceMechanicalDriver, root, changedOwner);
    assert.equal(ownerMismatch.json.failure.code, "idempotency_mismatch");

    const changedStore = structuredClone(request);
    changedStore.envelope.store_id = "store:612e0c03-fc34-4f40-a575-3b6327d05764";
    changedStore.envelope.request_digest = canonicalCommitRequestDigest(
      initialized.store_id, changedStore.context, changedStore.envelope,
    );
    const storeMismatch = await invoke(sourceMechanicalDriver, root, changedStore);
    assert.equal(storeMismatch.json.failure.code, "idempotency_mismatch");
  } finally {
    await removeAndVerify(root);
  }
});

test("exact expected revision updates once and stale update returns durable non-mutating conflict", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await makeRoot("w03-cas");
  try {
    const storePath = path.join(root, "store.sqlite3");
    const initialized = await initialize(sourceEntrypoint, root, storePath, sqliteBinary);
    await invoke(sourceMechanicalDriver, root, commitRequest(storePath, sqliteBinary, initialized, envelopeFor(initialized)));
    const update = commitRequest(storePath, sqliteBinary, initialized, envelopeFor(initialized, { expectedRevision: 1 }));
    const updated = await invoke(sourceMechanicalDriver, root, update);
    assert.equal(updated.exitCode, 0, updated.stderr);
    assert.equal(updated.json.result.committed_revision.number, 2);

    const staleEnvelope = envelopeFor(initialized, {
      expectedRevision: 1,
      operationId: "operation:w03-stale",
      revisionId: ids.revisionB1,
      eventId: ids.eventB1,
      outboxId: ids.outboxB1,
      familyId: ids.familyB,
      versionId: ids.versionB1,
      value: "stale",
    });
    const staleRequest = commitRequest(storePath, sqliteBinary, initialized, staleEnvelope);
    const conflict = await invoke(sourceMechanicalDriver, root, staleRequest);
    assert.equal(conflict.exitCode, 2);
    assert.equal(conflict.json.failure.code, "revision_conflict");
    assert.equal(conflict.json.failure.retry_disposition, "after_reconcile");
    assert.deepEqual(conflict.json.failure.evidence.current_revision, { id: ids.revisionA2, number: 2 });
    const conflictReplay = await invoke(sourceMechanicalDriver, root, staleRequest);
    assert.deepEqual(conflictReplay.json, conflict.json);
    assert.deepEqual(await tableCounts(sqliteBinary, storePath), {
      owners: 1, versions: 2, revisions: 2, current_rows: 1, events: 2, outbox: 2, commit_receipts: 3,
    });
  } finally {
    await removeAndVerify(root);
  }
});

test("lost response is recovered through store-scoped owner receipt lookup before retry", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await makeRoot("w03-lost-response");
  try {
    const storePath = path.join(root, "store.sqlite3");
    const initialized = await initialize(sourceEntrypoint, root, storePath, sqliteBinary);
    const envelope = envelopeFor(initialized, { operationId: "operation:w03-lost-response" });
    const request = commitRequest(storePath, sqliteBinary, initialized, envelope);
    const deliveredButIgnored = await invoke(sourceMechanicalDriver, root, request);
    assert.equal(deliveredButIgnored.exitCode, 0);

    const lookup = await invoke(
      sourceMechanicalDriver, root,
      ownerReceiptRequest(storePath, sqliteBinary, initialized, envelope.operation_id),
    );
    assert.equal(lookup.exitCode, 0, lookup.stderr);
    assert.equal(lookup.json.result.status, "settled");
    assert.equal(lookup.json.result.receipt.committed_revision, 1);
    assert.deepEqual(lookup.json.result.receipt.result.allocations, deliveredButIgnored.json.result.allocations);

    const absent = await invoke(
      sourceMechanicalDriver, root,
      ownerReceiptRequest(storePath, sqliteBinary, initialized, "operation:w03-absent"),
    );
    assert.equal(absent.json.result.status, "absent_at_fence");
    assert.equal(absent.json.result.operation_fence, 2);
  } finally {
    await removeAndVerify(root);
  }
});

test("fault after event insertion rolls back revision/current/event/outbox together and settles only a failure receipt", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await makeRoot("w03-atomic-fault");
  try {
    const storePath = path.join(root, "store.sqlite3");
    const initialized = await initialize(sourceEntrypoint, root, storePath, sqliteBinary);
    const envelope = envelopeFor(initialized, { operationId: "operation:w03-fault" });
    const request = commitRequest(storePath, sqliteBinary, initialized, envelope);
    const failed = await invoke(sourceMechanicalDriver, root, request, {
      CASEBOOK_PERSISTENCE_TEST_FAULT: "after_event_before_outbox_receipt",
    });
    assert.equal(failed.exitCode, 2);
    assert.equal(failed.json.failure.code, "commit_execution_failed");
    assert.equal(failed.json.failure.retry_disposition, "after_reconcile");
    assert.deepEqual(await tableCounts(sqliteBinary, storePath), {
      owners: 0, versions: 0, revisions: 0, current_rows: 0, events: 0, outbox: 0, commit_receipts: 1,
    });
    const lookup = await invoke(
      sourceMechanicalDriver, root,
      ownerReceiptRequest(storePath, sqliteBinary, initialized, envelope.operation_id),
    );
    assert.equal(lookup.json.result.status, "settled");
    assert.equal(lookup.json.result.receipt.outcome, "rejected");
    const retry = await invoke(sourceMechanicalDriver, root, request);
    assert.deepEqual(retry.json, failed.json);
  } finally {
    await removeAndVerify(root);
  }
});

test("absent stores are not initialized and invalid policy/owner reads fail without target leakage", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await makeRoot("w03-policy");
  try {
    const absentPath = path.join(root, "absent.sqlite3");
    const syntheticInitialization = {
      store_id: "store:612e0c03-fc34-4f40-a575-3b6327d05764",
      namespace: { id: "namespace:feef2e20-2b20-43e4-bac9-8fab07d8168c" },
      view: {
        id: "view:7b8b7928-c86a-49d1-aeca-60c8d58fd236",
        policy_revision_id: "view-policy:7035dcb6-20de-470c-b3ee-8b40674aa75c",
      },
    };
    const absentEnvelope = envelopeFor(syntheticInitialization, { operationId: "operation:w03-absent-store" });
    const absent = await invoke(
      sourceMechanicalDriver, root,
      commitRequest(absentPath, sqliteBinary, syntheticInitialization, absentEnvelope),
    );
    assert.equal(absent.exitCode, 2);
    assert.equal(absent.json.failure.code, "store_unavailable");
    assert.equal(JSON.stringify(absent.json).includes(absentPath), false);
    assert.equal(await stat(absentPath).then(() => true).catch(() => false), false);

    const storePath = path.join(root, "store.sqlite3");
    const initialized = await initialize(sourceEntrypoint, root, storePath, sqliteBinary, "operation:w03-policy-init");
    const invalidPolicyRequest = commitRequest(storePath, sqliteBinary, initialized, envelopeFor(initialized));
    invalidPolicyRequest.context.view_policy_revision_id = "view-policy:612e0c03-fc34-4f40-a575-3b6327d05764";
    invalidPolicyRequest.envelope.request_digest = canonicalCommitRequestDigest(
      initialized.store_id, invalidPolicyRequest.context, invalidPolicyRequest.envelope,
    );
    const policyFailure = await invoke(sourceMechanicalDriver, root, invalidPolicyRequest);
    assert.equal(policyFailure.json.failure.code, "view_invalid");
    assert.deepEqual(policyFailure.json.failure.evidence, {});
    assert.equal(JSON.stringify(policyFailure.json).includes(initialized.namespace.id), false);
    assert.deepEqual(await tableCounts(sqliteBinary, storePath), {
      owners: 0, versions: 0, revisions: 0, current_rows: 0, events: 0, outbox: 0, commit_receipts: 0,
    });

    const hiddenRead = ownerReadRequest(storePath, sqliteBinary, initialized, ids.ownerB);
    const readFailure = await invoke(sourceMechanicalDriver, root, hiddenRead);
    assert.equal(readFailure.json.failure.code, "not_visible");
    assert.deepEqual(readFailure.json.failure.evidence, {});
    assert.equal(JSON.stringify(readFailure.json).includes(ids.ownerB), false);

    const hiddenReceipt = ownerReceiptRequest(
      storePath, sqliteBinary, initialized, "operation:w03-secret", ids.ownerB,
    );
    const lookup = await invoke(sourceMechanicalDriver, root, hiddenReceipt);
    assert.deepEqual(lookup.json.result, { status: "absent_at_fence", operation_fence: 1 });
  } finally {
    await removeAndVerify(root);
  }
});

async function rotateActivePolicy(sqliteBinary, storePath, initialized) {
  const successor = "view-policy:11111111-1111-4111-8111-111111111111";
  await execFileAsync(sqliteBinary, ["-batch", "-bail", storePath, `
    PRAGMA foreign_keys = ON;
    BEGIN IMMEDIATE;
    INSERT INTO view_policy_revisions (
      view_policy_revision_id, view_id, revision_number, audience_ceiling, lifecycle,
      authority_claim_json, object_kinds_json, store_operation_receipts_visible,
      predecessor_revision_id, activation_fence, created_at
    ) SELECT
      '${successor}', view_id, 2, audience_ceiling, 'created', authority_claim_json,
      object_kinds_json, store_operation_receipts_visible, view_policy_revision_id,
      NULL, 'synthetic-policy-rotation'
    FROM view_policy_revisions WHERE view_policy_revision_id = '${initialized.view.policy_revision_id}';
    INSERT INTO view_policy_namespace_grants VALUES ('${successor}', '${initialized.namespace.id}');
    UPDATE view_policy_revisions SET lifecycle = 'superseded'
      WHERE view_policy_revision_id = '${initialized.view.policy_revision_id}';
    UPDATE view_policy_revisions SET lifecycle = 'active',
      activation_fence = (SELECT operation_fence FROM store_fence WHERE singleton = 1)
      WHERE view_policy_revision_id = '${successor}';
    COMMIT;
  `], { encoding: "utf8" });
  return successor;
}

async function runGeneratedScenario(name, runtime) {
  const { connector, driver, cwd, root, sqliteBinary, target, digestFunction } = runtime;
  const storePath = path.join(root, "synthetic-data", `${target}-w03-${name}.sqlite3`);
  const initialized = await initialize(
    connector, cwd, storePath, sqliteBinary, `operation:w03-${target}-${name}-init`,
  );
  const commit = (envelope) => commitRequest(storePath, sqliteBinary, initialized, envelope, digestFunction);

  if (name === "cas") {
    const created = await invoke(driver, cwd, commit(envelopeFor(initialized)));
    assert.equal(created.exitCode, 0, created.stderr);
    const update = commit(envelopeFor(initialized, { expectedRevision: 1 }));
    const updated = await invoke(driver, cwd, update);
    assert.equal(updated.json.result.committed_revision.number, 2);
    const stale = commit(envelopeFor(initialized, {
      expectedRevision: 1,
      operationId: `operation:w03-${target}-cas-stale`,
      revisionId: ids.revisionB1,
      eventId: ids.eventB1,
      outboxId: ids.outboxB1,
      familyId: ids.familyB,
      versionId: ids.versionB1,
      value: "stale",
    }));
    const conflict = await invoke(driver, cwd, stale);
    assert.equal(conflict.json.failure.code, "revision_conflict");
    assert.equal(conflict.json.failure.retry_disposition, "after_reconcile");
    assert.deepEqual((await invoke(driver, cwd, stale)).json, conflict.json);
    return;
  }

  if (name === "fault-rollback") {
    const request = commit(envelopeFor(initialized, { operationId: `operation:w03-${target}-fault` }));
    const failed = await invoke(driver, cwd, request, {
      CASEBOOK_PERSISTENCE_TEST_FAULT: "after_event_before_outbox_receipt",
    });
    assert.equal(failed.json.failure.code, "commit_execution_failed");
    assert.equal(failed.json.failure.retry_disposition, "after_reconcile");
    assert.deepEqual(await tableCounts(sqliteBinary, storePath), {
      owners: 0, versions: 0, revisions: 0, current_rows: 0, events: 0, outbox: 0, commit_receipts: 1,
    });
    assert.deepEqual((await invoke(driver, cwd, request)).json, failed.json);
    return;
  }

  if (name === "replay-policy-mismatch") {
    const request = commit(envelopeFor(initialized, { operationId: `operation:w03-${target}-policy-replay` }));
    const first = await invoke(driver, cwd, request);
    assert.equal(first.exitCode, 0, first.stderr);
    const replay = await invoke(driver, cwd, request);
    assert.equal(replay.json.result.idempotent_replay, true);
    const changed = structuredClone(request);
    changed.envelope.revision.normalized.title = "changed reuse";
    changed.envelope.request_digest = digestFunction(initialized.store_id, changed.context, changed.envelope);
    assert.equal((await invoke(driver, cwd, changed)).json.failure.code, "idempotency_mismatch");

    const successor = await rotateActivePolicy(sqliteBinary, storePath, initialized);
    const changedPolicy = structuredClone(request);
    changedPolicy.context.view_policy_revision_id = successor;
    changedPolicy.envelope.request_digest = digestFunction(
      initialized.store_id, changedPolicy.context, changedPolicy.envelope,
    );
    const mismatched = await invoke(driver, cwd, changedPolicy);
    assert.equal(mismatched.json.failure.code, "idempotency_mismatch");
    assert.deepEqual(mismatched.json.failure.evidence, { operation_id: request.envelope.operation_id });
    assert.equal(JSON.stringify(mismatched.json).includes(ids.ownerA), false);
    assert.equal(JSON.stringify(mismatched.json).includes(initialized.namespace.id), false);

    const staleExactReplay = await invoke(driver, cwd, request);
    assert.equal(staleExactReplay.json.failure.code, "view_invalid");
    assert.deepEqual(staleExactReplay.json.failure.evidence, {});
    assert.equal(JSON.stringify(staleExactReplay.json).includes(ids.ownerA), false);
    return;
  }

  if (name === "lost-response-receipt") {
    const envelope = envelopeFor(initialized, { operationId: `operation:w03-${target}-lost-response` });
    const delivered = await invoke(driver, cwd, commit(envelope));
    assert.equal(delivered.exitCode, 0, delivered.stderr);
    const receipt = await invoke(
      driver, cwd, ownerReceiptRequest(storePath, sqliteBinary, initialized, envelope.operation_id),
    );
    assert.equal(receipt.json.result.status, "settled");
    assert.deepEqual(receipt.json.result.receipt.result.allocations, delivered.json.result.allocations);
    const absent = await invoke(
      driver, cwd, ownerReceiptRequest(storePath, sqliteBinary, initialized, `operation:w03-${target}-absent`),
    );
    assert.equal(absent.json.result.status, "absent_at_fence");
    return;
  }

  if (name === "retry-disposition") {
    await invoke(driver, cwd, commit(envelopeFor(initialized)));
    const conflictRequest = commit(envelopeFor(initialized, {
      operationId: `operation:w03-${target}-retry-conflict`,
      revisionId: ids.revisionB1,
      eventId: ids.eventB1,
      outboxId: ids.outboxB1,
      familyId: ids.familyB,
      versionId: ids.versionB1,
      value: "conflict",
    }));
    const conflict = await invoke(driver, cwd, conflictRequest);
    assert.equal(conflict.json.failure.retry_disposition, "after_reconcile");
    const receipt = await invoke(
      driver, cwd, ownerReceiptRequest(storePath, sqliteBinary, initialized, conflictRequest.envelope.operation_id),
    );
    assert.equal(receipt.json.result.receipt.retry_disposition, "after_reconcile");
    return;
  }

  if (name === "identity-conflict") {
    await invoke(driver, cwd, commit(envelopeFor(initialized)));
    const baseline = await tableCounts(sqliteBinary, storePath);
    const familyReuse = commit(envelopeFor(initialized, {
      ownerId: ids.ownerB,
      familyId: ids.familyA,
      operationId: `operation:w03-${target}-family-conflict`,
    }));
    const familyConflict = await invoke(driver, cwd, familyReuse);
    assert.equal(familyConflict.json.failure.code, "identity_conflict");
    assert.equal(familyConflict.json.failure.class, "identity_conflict");
    assert.equal(familyConflict.json.failure.retry_disposition, "never");
    assert.deepEqual(familyConflict.json.failure.evidence, {});
    assert.equal(JSON.stringify(familyConflict.json).includes(ids.ownerA), false);
    assert.equal(JSON.stringify(familyConflict.json).includes(ids.ownerB), false);
    const afterFamily = await tableCounts(sqliteBinary, storePath);
    assert.deepEqual({ ...afterFamily, commit_receipts: baseline.commit_receipts }, baseline);

    const allocatedVersion = commit(envelopeFor(initialized, {
      ownerId: ids.ownerB,
      familyId: ids.familyB,
      versionId: ids.versionA1,
      operationId: `operation:w03-${target}-version-conflict`,
    }));
    const allocatedConflict = await invoke(driver, cwd, allocatedVersion);
    assert.equal(allocatedConflict.json.failure.code, "identity_conflict");
    const afterAllocated = await tableCounts(sqliteBinary, storePath);
    assert.deepEqual({ ...afterAllocated, commit_receipts: baseline.commit_receipts }, baseline);
    return;
  }

  throw new Error(`unknown generated scenario: ${name}`);
}

test("named W03 scenarios run over generated Pi, Codex, and OpenCode copies with cleanup", async (t) => {
  const root = await makeRoot("w03-generated");
  try {
    const report = await generateAndValidateSandbox({ sandboxRoot: root });
    for (const generated of report.results) {
      const generatedRoot = generated.package_root;
      const connector = path.join(generatedRoot, "variants/sqlite/bin/casebook-persistence.mjs");
      const driver = path.join(generatedRoot, "tests/internal-mechanical-driver.mjs");
      const generatedMechanical = await import(pathToFileURL(path.join(
        generatedRoot, "variants/sqlite/lib/substrate/mechanical.mjs",
      )).href);
      for (const scenario of [
        "cas",
        "fault-rollback",
        "replay-policy-mismatch",
        "lost-response-receipt",
        "retry-disposition",
        "identity-conflict",
      ]) {
        await t.test(`${generated.target}: ${scenario}`, async () => runGeneratedScenario(scenario, {
          connector,
          driver,
          cwd: path.join(root, "unrelated-cwd"),
          root,
          sqliteBinary: report.sqlite_binary,
          target: generated.target,
          digestFunction: generatedMechanical.canonicalCommitRequestDigest,
        }));
      }
      assert.equal(generatedRoot.startsWith(report.root), true);
    }
  } finally {
    assert.equal(await cleanupSandbox(root), true);
  }
  assert.equal(await stat(root).then(() => true).catch(() => false), false);
});
