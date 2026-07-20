import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
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
  authority_basis: "explicit synthetic L01-W04 test authorization",
};
const ids = Object.freeze({
  case: "case:97617dba-ff62-4911-99c6-8a02196dbd4b",
  activeFrame: "frame:5133301d-0ba2-4185-babf-a375e92d3d52",
  activeDiscovery: "discovery:d538f101-05f0-4150-b560-c245032316a8",
  closedFrame: "frame:bf4db55d-0ff1-4b4d-87b2-88ae8c954b16",
  closedDiscovery: "discovery:fd77d356-ddf4-4ac9-9cef-ea440c90dfd1",
  secondActiveFrame: "frame:8ba3c125-6d16-4d2a-bfca-c40173cedb14",
  secondActiveDiscovery: "discovery:bee57ac8-921c-401c-8d2f-0c7983670da9",
  unknownCase: "case:832153c5-bec3-481e-9aed-7e8567bcab07",
  hiddenCase: "case:247e0a31-5a21-44cf-94ee-506ee2d94ae9",
  hiddenNamespace: "namespace:d69b612a-3c17-4f68-a41d-07b7d5da004e",
  unknownFrame: "frame:37c55cc1-9b59-4290-b3b3-c5a90758c203",
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

async function invoke(entrypoint, cwd, request) {
  try {
    const { stdout, stderr } = await execFileWithInput(process.execPath, [entrypoint], {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? "", HOME: cwd },
    }, `${JSON.stringify(request)}\n`);
    return { exitCode: 0, stdout, stderr, json: JSON.parse(stdout) };
  } catch (error) {
    const stdout = error.stdout ?? "";
    return { exitCode: error.code, stdout, stderr: error.stderr ?? "", json: stdout ? JSON.parse(stdout) : {} };
  }
}

function configuration(storePath, sqliteBinary, label = "w04-disposable") {
  return {
    source: { kind: "synthetic-test", locator: label },
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

async function initialize(entrypoint, cwd, storePath, sqliteBinary, operationId) {
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

function context(initialized, purpose) {
  return {
    view_id: initialized.view.id,
    view_policy_revision_id: initialized.view.policy_revision_id,
    purpose,
    requested_audience_ceiling: "private",
  };
}

function caseCreate(storePath, sqliteBinary, initialized, options = {}) {
  return {
    protocol,
    operation: "case.create",
    request_version: 1,
    operation_id: options.operationId ?? "operation:w04-case-create",
    store_id: initialized.store_id,
    context: context(initialized, "create minimal typed Case"),
    expected_revision: 0,
    commit_basis: "synthetic semantic owner supplied complete minimal Case",
    provenance: { acting_role: "case-intake", authority_basis: "synthetic W04" },
    case: {
      id: options.caseId ?? ids.case,
      home_namespace_id: initialized.namespace.id,
      state: "active",
      title: "Typed persistence boundary",
      summary: options.summary ?? "Case content is assembled by the Case façade.",
      scope: "Only the minimal L-01 typed Case create/read proof.",
      ...options.caseOverrides,
    },
    configuration: configuration(storePath, sqliteBinary),
  };
}

function caseRead(storePath, sqliteBinary, initialized, caseId = ids.case) {
  return {
    protocol,
    operation: "case.read",
    request_version: 1,
    store_id: initialized.store_id,
    context: context(initialized, "read minimal typed Case"),
    case_id: caseId,
    configuration: configuration(storePath, sqliteBinary),
  };
}

function frameCreate(storePath, sqliteBinary, initialized, options = {}) {
  const frameId = options.frameId ?? ids.activeFrame;
  const discoveryId = options.discoveryId ?? ids.activeDiscovery;
  const request = {
    protocol,
    operation: "frame.create",
    request_version: 1,
    operation_id: options.operationId ?? `operation:w04-frame-create:${frameId}`,
    store_id: initialized.store_id,
    context: context(initialized, "create minimal active typed Frame with Discovery"),
    expected_revision: 0,
    commit_basis: "synthetic Frame owner supplied complete active initial Discovery selection",
    provenance: { acting_role: "frame", authority_basis: "synthetic W04" },
    frame: {
      id: frameId,
      home_namespace_id: initialized.namespace.id,
      authority_scope_namespace_ids: [initialized.namespace.id],
      status: "active",
      discovery: [{
        id: discoveryId,
        display_order: 0,
        lifecycle: "active",
        category: "frontier",
        title: "Typed Discovery selection",
        body: "The Frame façade owns lifecycle validation and version selection.",
        human_authority: "unclear",
        dependencies: [],
        ...(options.discoveryOverrides ?? {}),
      }],
      disposition_boundaries: [],
      case_dispositions: [],
      ...(options.frameOverrides ?? {}),
    },
    configuration: configuration(storePath, sqliteBinary),
  };
  if (options.fullMetadata) {
    Object.assign(request.frame, {
      title: "Persistence façade proof",
      outcome: "Prove typed Frame and Discovery persistence.",
      included_scope: ["L-01 typed owner façade"],
      excluded_scope: ["Lifecycle updates", "Markdown parity"],
      limitations: "Synthetic disposable evidence only.",
      completion_condition: "Typed create/list/read results hydrate exactly.",
    });
  }
  return request;
}

function frameRead(storePath, sqliteBinary, initialized, frameId = ids.activeFrame) {
  return {
    protocol,
    operation: "frame.read",
    request_version: 1,
    store_id: initialized.store_id,
    context: context(initialized, "read minimal typed Frame"),
    frame_id: frameId,
    configuration: configuration(storePath, sqliteBinary),
  };
}

function frameList(storePath, sqliteBinary, initialized) {
  return {
    protocol,
    operation: "frame.list",
    request_version: 1,
    store_id: initialized.store_id,
    context: context(initialized, "list active minimal typed Frames"),
    configuration: configuration(storePath, sqliteBinary),
  };
}

function frameReceipt(storePath, sqliteBinary, initialized, operationId, frameId = ids.activeFrame) {
  return {
    protocol,
    operation: "frame.get_operation_receipt",
    request_version: 1,
    operation_id: operationId,
    frame_id: frameId,
    store_id: initialized.store_id,
    context: context(initialized, "recover typed Frame operation result"),
    configuration: configuration(storePath, sqliteBinary),
  };
}

function storeReceipt(storePath, sqliteBinary, initialized, operationId) {
  return {
    protocol,
    operation: "get_store_operation_receipt",
    operation_id: operationId,
    store_id: initialized.store_id,
    authority_claim: authorityClaim,
    context: context(initialized, "recover accepted exceptional operation only"),
    configuration: configuration(storePath, sqliteBinary),
  };
}

async function ownerFacts(sqliteBinary, storePath) {
  const { stdout } = await execFileAsync(sqliteBinary, ["-json", storePath, `
    SELECT owner_kind, owner_id, revision_number
    FROM owners JOIN owner_current USING (owner_id)
    ORDER BY owner_kind, owner_id;
  `], { encoding: "utf8" });
  return JSON.parse(stdout || "[]");
}

function assertInvalid(response, owner, expectedPath, expectedRule = "field_unsupported") {
  assert.equal(response.exitCode, 2);
  assert.equal(response.json.failure.code, `${owner}.invalid_representation`);
  assert.deepEqual(response.json.failure.evidence.violations, [{ path: expectedPath, rule: expectedRule }]);
}

test("typed façades create/read by stable ID, hide owner receipts, and prove the smallest active Frame with one active Discovery", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await makeRoot("w04-typed");
  try {
    const storePath = path.join(root, "store.sqlite3");
    const initialized = await initialize(sourceEntrypoint, root, storePath, sqliteBinary, "operation:w04-typed-init");

    const caseRequest = caseCreate(storePath, sqliteBinary, initialized);
    const createdCase = await invoke(sourceEntrypoint, root, caseRequest);
    assert.equal(createdCase.exitCode, 0, createdCase.stderr);
    assert.equal(createdCase.json.operation, "case.create");
    assert.equal(createdCase.json.result.revision.number, 1);
    assert.match(createdCase.json.result.revision.id, /^case-revision:/);
    assert.match(createdCase.json.result.revision.version_ids.case, /^case-version:/);
    assert.equal(createdCase.json.result.receipt.operation, "case.create");
    assert.equal(JSON.stringify(createdCase.json).includes("commit_owner_revision"), false);

    const caseSnapshot = await invoke(sourceEntrypoint, root, caseRead(storePath, sqliteBinary, initialized));
    assert.equal(caseSnapshot.exitCode, 0, caseSnapshot.stderr);
    assert.deepEqual(caseSnapshot.json.result.case, createdCase.json.result.case);
    assert.deepEqual(caseSnapshot.json.result.revision.version_ids, createdCase.json.result.revision.version_ids);
    assert.equal("home_namespace_id" in caseRead(storePath, sqliteBinary, initialized), false);

    const hiddenCaseReceipt = await invoke(sourceEntrypoint, root, storeReceipt(
      storePath, sqliteBinary, initialized, caseRequest.operation_id,
    ));
    assert.equal(hiddenCaseReceipt.exitCode, 0, hiddenCaseReceipt.stderr);
    assert.deepEqual(hiddenCaseReceipt.json.result, { status: "not_visible" });
    assert.equal(JSON.stringify(hiddenCaseReceipt.json).includes(ids.case), false);
    assert.equal(JSON.stringify(hiddenCaseReceipt.json).includes("allocations"), false);

    await execFileAsync(sqliteBinary, [storePath, `
      INSERT INTO namespaces VALUES ('${ids.hiddenNamespace}', 'hidden-w04', 'active', '2026-01-01T00:00:00.000Z');
      INSERT INTO owners VALUES ('${ids.hiddenCase}', 'case', '${ids.hiddenNamespace}', '2026-01-01T00:00:00.000Z');
      INSERT INTO owner_revisions VALUES ('owner-revision:247e0a31-5a21-44cf-94ee-506ee2d94ae9', '${ids.hiddenCase}', 1, '{}', 'case-canonical', 2, 'synthetic-hidden-case', '2026-01-01T00:00:00.000Z');
      INSERT INTO owner_current VALUES ('${ids.hiddenCase}', 'owner-revision:247e0a31-5a21-44cf-94ee-506ee2d94ae9', 1, '{}', '2026-01-01T00:00:00.000Z');
      UPDATE store_fence SET operation_fence=operation_fence+1 WHERE singleton=1;
    `], { encoding: "utf8" });
    const frameRequest = frameCreate(storePath, sqliteBinary, initialized, { frameOverrides: {
      case_links: [
        { target_kind: "case", target_id: ids.case, predicate: "frames" },
        { target_kind: "case", target_id: ids.hiddenCase, predicate: "frames" },
      ],
    } });
    const active = await invoke(sourceEntrypoint, root, frameRequest);
    assert.equal(active.exitCode, 0, active.stderr);
    assert.equal(active.json.operation, "frame.create");
    assert.equal(active.json.result.revision.number, 1);
    assert.match(active.json.result.revision.id, /^frame-revision:/);
    assert.match(active.json.result.revision.version_ids.frame, /^frame-version:/);
    assert.match(active.json.result.frame.discovery[0].version_id, /^discovery-item-version:/);
    assert.deepEqual(active.json.result.frame.discovery[0].dependencies, []);
    const frameReceiptResult = await invoke(sourceEntrypoint, root, frameReceipt(
      storePath, sqliteBinary, initialized, frameRequest.operation_id,
    ));
    assert.equal(frameReceiptResult.exitCode, 0, frameReceiptResult.stderr);
    assert.equal(frameReceiptResult.json.result.status, "settled");
    assert.equal(frameReceiptResult.json.result.receipt.operation, "frame.create");
    assert.deepEqual(frameReceiptResult.json.result.original_result.revision, active.json.result.revision);
    assert.equal(JSON.stringify(frameReceiptResult.json).includes("owner_home_namespace_id"), false);
    const absentReceipt = await invoke(sourceEntrypoint, root, frameReceipt(
      storePath, sqliteBinary, initialized, "operation:w04-absent",
    ));
    assert.equal(absentReceipt.json.result.status, "absent_at_fence");
    for (const optional of ["title", "outcome", "included_scope", "excluded_scope", "limitations", "completion_condition"]) {
      assert.equal(optional in active.json.result.frame, false, `${optional} must remain optional`);
    }

    const hiddenFrameReceipt = await invoke(sourceEntrypoint, root, storeReceipt(
      storePath, sqliteBinary, initialized, frameRequest.operation_id,
    ));
    assert.deepEqual(hiddenFrameReceipt.json.result, { status: "not_visible" });
    assert.equal(JSON.stringify(hiddenFrameReceipt.json).includes(ids.activeFrame), false);
    assert.equal(JSON.stringify(hiddenFrameReceipt.json).includes("owner_home_namespace_id"), false);

    const frameSnapshot = await invoke(sourceEntrypoint, root, frameRead(storePath, sqliteBinary, initialized));
    assert.equal(frameSnapshot.exitCode, 0, frameSnapshot.stderr);
    assert.deepEqual(frameSnapshot.json.result.frame, {
      ...active.json.result.frame,
      case_links: [active.json.result.frame.case_links[0]],
      hidden_reference_count: 1,
    });
    assert.equal("home_namespace_id" in frameRead(storePath, sqliteBinary, initialized), false);

    const activeOnly = await invoke(sourceEntrypoint, root, frameList(storePath, sqliteBinary, initialized));
    assert.equal(activeOnly.exitCode, 0, activeOnly.stderr);
    assert.deepEqual(activeOnly.json.result.items.map((item) => item.id), [ids.activeFrame]);
    assert.equal(activeOnly.json.result.applied_lifecycle_scope, "active_only");
    assert.equal(activeOnly.json.result.result_completeness, "complete_within_bounds");

    // Simulate a projection written before L03-W04 added linked_case_ids.
    await execFileAsync(sqliteBinary, [storePath, `
      UPDATE owner_current
      SET projection_json=json_remove(projection_json, '$.linked_case_ids')
      WHERE owner_id='${ids.activeFrame}';
    `], { encoding: "utf8" });

    const linkedVisible = await invoke(sourceEntrypoint, root, {
      ...frameList(storePath, sqliteBinary, initialized), linked_case_id: ids.case,
    });
    assert.equal(linkedVisible.exitCode, 0, linkedVisible.stderr);
    assert.deepEqual(linkedVisible.json.result.items.map((item) => item.id), [ids.activeFrame]);
    const linkedUnknown = await invoke(sourceEntrypoint, root, {
      ...frameList(storePath, sqliteBinary, initialized), linked_case_id: ids.unknownCase,
    });
    assert.equal(linkedUnknown.exitCode, 0, linkedUnknown.stderr);
    assert.deepEqual(linkedUnknown.json.result.items, []);
    assert.equal(linkedUnknown.json.result.next_cursor, null);
    assert.equal(JSON.stringify(linkedUnknown.json).includes(ids.activeFrame), false);
    const linkedHidden = await invoke(sourceEntrypoint, root, {
      ...frameList(storePath, sqliteBinary, initialized), linked_case_id: ids.hiddenCase,
    });
    assert.equal(linkedHidden.exitCode, 0, linkedHidden.stderr);
    assert.deepEqual(linkedHidden.json.result.items, linkedUnknown.json.result.items);
    assert.equal(linkedHidden.json.result.next_cursor, linkedUnknown.json.result.next_cursor);
    assert.equal(JSON.stringify(linkedHidden.json).includes(ids.activeFrame), false);

    assert.deepEqual(await ownerFacts(sqliteBinary, storePath), [
      { owner_kind: "case", owner_id: ids.hiddenCase, revision_number: 1 },
      { owner_kind: "case", owner_id: ids.case, revision_number: 1 },
      { owner_kind: "frame", owner_id: ids.activeFrame, revision_number: 1 },
    ]);
  } finally {
    await removeAndVerify(root);
  }
});

test("Frame list defaults active-only while compact fenced cursors reject changed state, tampering, oversized input, and query mismatch", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await makeRoot("l03-w02-frame-list");
  try {
    const storePath = path.join(root, "store.sqlite3");
    const initialized = await initialize(sourceEntrypoint, root, storePath, sqliteBinary, "operation:l03-w02-list-init");
    for (const [frameId, discoveryId, operationId] of [[ids.activeFrame, ids.activeDiscovery, "one"], [ids.secondActiveFrame, ids.secondActiveDiscovery, "two"]]) {
      const created = await invoke(sourceEntrypoint, root, frameCreate(storePath, sqliteBinary, initialized, { frameId, discoveryId, operationId: `operation:l03-w02-${operationId}` }));
      assert.equal(created.exitCode, 0, created.stderr);
    }
    const firstRequest = { ...frameList(storePath, sqliteBinary, initialized), limit: 1 };
    const first = await invoke(sourceEntrypoint, root, firstRequest);
    assert.equal(first.exitCode, 0, first.stderr);
    assert.equal(first.json.result.items.length, 1);
    assert.equal(typeof first.json.result.next_cursor, "string");
    assert.ok(first.json.result.next_cursor.length < 1024);
    const decodedCursor = JSON.parse(Buffer.from(first.json.result.next_cursor, "base64url").toString());
    assert.doesNotMatch(decodedCursor.p, /snapshot_items|discovery|authority_scope_namespace_ids/);
    assert.deepEqual(Object.keys(JSON.parse(decodedCursor.p)).sort(), ["f", "k", "q", "v"]);
    const second = await invoke(sourceEntrypoint, root, { ...firstRequest, cursor: first.json.result.next_cursor });
    assert.equal(second.exitCode, 0, second.stderr);
    assert.equal(second.json.result.items.length, 1);
    assert.notEqual(second.json.result.items[0].id, first.json.result.items[0].id);
    assert.equal(second.json.result.snapshot_query_fence, first.json.result.snapshot_query_fence);
    const homeSelectedRequest = { ...firstRequest, home_namespace_id: initialized.namespace.id };
    const homeSelected = await invoke(sourceEntrypoint, root, homeSelectedRequest);
    assert.equal(homeSelected.exitCode, 0, homeSelected.stderr);
    assert.equal(homeSelected.json.result.items.length, 1);
    assert.equal(typeof homeSelected.json.result.next_cursor, "string");
    const scopeSelected = await invoke(sourceEntrypoint, root, {
      ...frameList(storePath, sqliteBinary, initialized),
      authority_scope_namespace_ids: [initialized.namespace.id],
    });
    assert.deepEqual(new Set(scopeSelected.json.result.items.map((item) => item.id)), new Set([ids.activeFrame, ids.secondActiveFrame]));
    const selectorMismatch = await invoke(sourceEntrypoint, root, {
      ...homeSelectedRequest,
      authority_scope_namespace_ids: [initialized.namespace.id],
      cursor: homeSelected.json.result.next_cursor,
    });
    assert.equal(selectorMismatch.json.failure.evidence.violations[0].rule, "cursor_invalid_or_query_mismatch");
    const tampered = `${first.json.result.next_cursor.slice(0, -1)}${first.json.result.next_cursor.endsWith("A") ? "B" : "A"}`;
    assert.equal((await invoke(sourceEntrypoint, root, { ...firstRequest, cursor: tampered })).json.failure.evidence.violations[0].rule, "cursor_invalid_or_query_mismatch");
    const forgedEnvelope = JSON.parse(Buffer.from(first.json.result.next_cursor, "base64url").toString());
    const forgedPayload = JSON.stringify({ ...JSON.parse(forgedEnvelope.p), k: ["2099-01-01T00:00:00.000Z", ids.activeFrame] });
    forgedEnvelope.p = forgedPayload;
    forgedEnvelope.d = createHash("sha256").update(`casebook-frame-cursor@1\0${forgedPayload}`).digest("hex");
    const forgedCursor = Buffer.from(JSON.stringify(forgedEnvelope)).toString("base64url");
    assert.equal((await invoke(sourceEntrypoint, root, { ...firstRequest, cursor: forgedCursor })).json.failure.evidence.violations[0].rule, "cursor_invalid_or_query_mismatch");
    assert.equal((await invoke(sourceEntrypoint, root, { ...firstRequest, cursor: "x".repeat(1025) })).json.failure.evidence.violations[0].rule, "cursor_invalid_or_query_mismatch");
    const closed = frameCreate(storePath, sqliteBinary, initialized, { frameId: ids.closedFrame, discoveryId: ids.closedDiscovery, operationId: "operation:l03-w02-closed", frameOverrides: { status: "completed" }, discoveryOverrides: { lifecycle: "settled", category: "settled", disposition: "accepted" } });
    assert.equal((await invoke(sourceEntrypoint, root, closed)).exitCode, 0);
    const changedFence = await invoke(sourceEntrypoint, root, { ...firstRequest, cursor: first.json.result.next_cursor });
    assert.equal(changedFence.json.failure.evidence.violations[0].rule, "cursor_fence_expired");
    const defaults = await invoke(sourceEntrypoint, root, frameList(storePath, sqliteBinary, initialized));
    assert.equal(defaults.json.result.items.some((item) => item.id === ids.closedFrame), false);
    const explicitClosed = await invoke(sourceEntrypoint, root, { ...frameList(storePath, sqliteBinary, initialized), statuses: ["completed"] });
    assert.deepEqual(explicitClosed.json.result.items.map((item) => item.id), [ids.closedFrame]);
    const wrongQuery = await invoke(sourceEntrypoint, root, { ...firstRequest, statuses: ["completed"], cursor: first.json.result.next_cursor });
    assert.equal(wrongQuery.json.failure.evidence.violations[0].rule, "cursor_invalid_or_query_mismatch");
  } finally { await removeAndVerify(root); }
});

test("Frame list paginates every visible Frame beyond the former 256-owner scan bound", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await makeRoot("l03-w02-frame-list-300");
  try {
    const storePath = path.join(root, "store.sqlite3");
    const initialized = await initialize(sourceEntrypoint, root, storePath, sqliteBinary, "operation:l03-w02-list-300-init");
    const statements = ["PRAGMA foreign_keys=ON;", "BEGIN IMMEDIATE;"];
    for (let index = 0; index < 300; index++) {
      const suffix = String(index + 1).padStart(12, "0");
      const frameId = `frame:00000000-0000-4000-8000-${suffix}`;
      const revisionId = `owner-revision:10000000-0000-4000-8000-${suffix}`;
      const timestamp = `2026-01-01T00:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(index % 60).padStart(2, "0")}.000Z`;
      const projection = JSON.stringify({ schema: "frame-current@1", id: frameId, home_namespace_id: initialized.namespace.id, authority_scope_namespace_ids: [initialized.namespace.id], status: "active", title: `Synthetic Frame ${index + 1}` }).replaceAll("'", "''");
      statements.push(
        `INSERT INTO owners VALUES ('${frameId}','frame','${initialized.namespace.id}','${timestamp}');`,
        `INSERT INTO owner_revisions VALUES ('${revisionId}','${frameId}',1,'{}','frame-canonical',2,'synthetic-operation-${index}','${timestamp}');`,
        `INSERT INTO owner_current VALUES ('${frameId}','${revisionId}',1,'${projection}','${timestamp}');`,
      );
    }
    statements.push("UPDATE store_fence SET operation_fence=operation_fence+1 WHERE singleton=1;", "COMMIT;");
    await execFileWithInput(sqliteBinary, [storePath, "-batch", "-bail"], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 }, statements.join("\n"));

    const request = { ...frameList(storePath, sqliteBinary, initialized), limit: 75 };
    const found = [];
    let cursor = null;
    do {
      const page = await invoke(sourceEntrypoint, root, { ...request, ...(cursor == null ? {} : { cursor }) });
      assert.equal(page.exitCode, 0, page.stderr);
      found.push(...page.json.result.items.map((item) => item.id));
      cursor = page.json.result.next_cursor;
    } while (cursor != null);
    assert.equal(found.length, 300);
    assert.equal(new Set(found).size, 300);
  } finally { await removeAndVerify(root); }
});

test("façade allocations replay stably while changed reuse, create conflicts, and unknown/hidden reads remain indistinguishable", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await makeRoot("w04-replay-conflict");
  try {
    const storePath = path.join(root, "store.sqlite3");
    const initialized = await initialize(sourceEntrypoint, root, storePath, sqliteBinary, "operation:w04-replay-init");
    const request = caseCreate(storePath, sqliteBinary, initialized, { operationId: "operation:w04-stable-case" });
    const first = await invoke(sourceEntrypoint, root, request);
    const replay = await invoke(sourceEntrypoint, root, request);
    assert.equal(first.exitCode, 0, first.stderr);
    assert.equal(replay.exitCode, 0, replay.stderr);
    assert.equal(replay.json.result.idempotent_replay, true);
    assert.deepEqual(replay.json.result.revision, first.json.result.revision);
    assert.deepEqual(replay.json.result.receipt, first.json.result.receipt);
    assert.equal(replay.json.result.event_id, first.json.result.event_id);

    const changed = structuredClone(request);
    changed.case.summary = "Changed semantic request under reused operation identity.";
    const mismatch = await invoke(sourceEntrypoint, root, changed);
    assert.equal(mismatch.json.failure.code, "case.idempotency_mismatch");
    assert.equal(JSON.stringify(mismatch.json).includes(ids.case), false);

    const duplicateIdentity = await invoke(sourceEntrypoint, root, caseCreate(storePath, sqliteBinary, initialized, {
      operationId: "operation:w04-new-op-existing-case",
    }));
    assert.equal(duplicateIdentity.json.failure.code, "case.create_identity_exists");
    assert.deepEqual(duplicateIdentity.json.failure.evidence.current_revision, {
      id: first.json.result.revision.id,
      number: 1,
    });

    const hiddenCase = await invoke(sourceEntrypoint, root, caseRead(storePath, sqliteBinary, initialized, ids.unknownCase));
    assert.equal(hiddenCase.json.failure.code, "case.not_found_or_not_visible");
    assert.deepEqual(hiddenCase.json.failure.evidence, {});
    assert.equal(JSON.stringify(hiddenCase.json).includes(ids.unknownCase), false);

    const hiddenFrame = await invoke(sourceEntrypoint, root, frameRead(storePath, sqliteBinary, initialized, ids.unknownFrame));
    assert.equal(hiddenFrame.json.failure.code, "frame.not_found_or_not_visible");
    assert.deepEqual(hiddenFrame.json.failure.evidence, {});
    assert.equal(JSON.stringify(hiddenFrame.json).includes(ids.unknownFrame), false);

    const frameRequest = frameCreate(storePath, sqliteBinary, initialized, {
      operationId: "operation:w04-active-one",
      fullMetadata: true,
    });
    const firstFrame = await invoke(sourceEntrypoint, root, frameRequest);
    const replayedFrame = await invoke(sourceEntrypoint, root, frameRequest);
    assert.equal(firstFrame.exitCode, 0, firstFrame.stderr);
    assert.equal(replayedFrame.json.result.idempotent_replay, true);
    assert.deepEqual(replayedFrame.json.result.revision, firstFrame.json.result.revision);
    assert.deepEqual(replayedFrame.json.result.receipt, firstFrame.json.result.receipt);
    for (const optional of ["title", "outcome", "included_scope", "excluded_scope", "limitations", "completion_condition"]) {
      assert.deepEqual(replayedFrame.json.result.frame[optional], frameRequest.frame[optional]);
    }

    const changedFrame = structuredClone(frameRequest);
    changedFrame.frame.discovery[0].body = "Changed Discovery under a reused operation identity.";
    const frameMismatch = await invoke(sourceEntrypoint, root, changedFrame);
    assert.equal(frameMismatch.json.failure.code, "frame.idempotency_mismatch");

    const secondFrame = await invoke(sourceEntrypoint, root, frameCreate(storePath, sqliteBinary, initialized, {
      frameId: ids.secondActiveFrame,
      discoveryId: ids.secondActiveDiscovery,
      operationId: "operation:w04-active-two",
    }));
    assert.equal(secondFrame.exitCode, 0, secondFrame.stderr);
    const listed = await invoke(sourceEntrypoint, root, frameList(storePath, sqliteBinary, initialized));
    assert.deepEqual(new Set(listed.json.result.items.map((item) => item.id)), new Set([ids.activeFrame, ids.secondActiveFrame]));
  } finally {
    await removeAndVerify(root);
  }
});

test("typed request selectors outside the implemented Case and bounded Frame query surfaces reject without mutation", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await makeRoot("w04-exact-shapes");
  try {
    const storePath = path.join(root, "store.sqlite3");
    const initialized = await initialize(sourceEntrypoint, root, storePath, sqliteBinary, "operation:w04-shapes-init");

    for (const selector of ["revision_id", "include", "history", "filter", "limit", "cursor"]) {
      const request = caseCreate(storePath, sqliteBinary, initialized, { operationId: `operation:invalid-case-${selector}` });
      request[selector] = selector === "limit" ? 1 : "later";
      assertInvalid(await invoke(sourceEntrypoint, root, request), "case", `request.${selector}`);
    }
    for (const selector of ["revision_id", "include", "history", "filter", "limit", "cursor"]) {
      const request = frameCreate(storePath, sqliteBinary, initialized, { operationId: `operation:invalid-frame-${selector}` });
      request[selector] = selector === "limit" ? 1 : "later";
      assertInvalid(await invoke(sourceEntrypoint, root, request), "frame", `request.${selector}`);
    }

    assert.deepEqual(await ownerFacts(sqliteBinary, storePath), []);

    const readCases = [
      ["home_namespace_id", initialized.namespace.id],
      ["include", ["history"]],
      ["history", true],
      ["filter", { state: "active" }],
      ["limit", 1],
      ["cursor", "later"],
    ];
    for (const [selector, value] of readCases) {
      const request = caseRead(storePath, sqliteBinary, initialized, ids.unknownCase);
      request[selector] = value;
      assertInvalid(await invoke(sourceEntrypoint, root, request), "case", `request.${selector}`);
    }

    const readFrames = [
      ["home_namespace_id", initialized.namespace.id],
      ["history", true],
      ["filter", { status: "active" }],
      ["limit", 1],
      ["cursor", "later"],
    ];
    for (const [selector, value] of readFrames) {
      const request = frameRead(storePath, sqliteBinary, initialized, ids.unknownFrame);
      request[selector] = value;
      assertInvalid(await invoke(sourceEntrypoint, root, request), "frame", `request.${selector}`);
    }

    const listSelectors = [
      ["include_closed", true],
      ["history", "include_closed"],
      ["status", "completed"],
      ["revision_id", "frame-revision:5133301d-0ba2-4185-babf-a375e92d3d52"],
      ["include", ["history"]],
      ["filter", { status: "active" }],
    ];
    for (const [selector, value] of listSelectors) {
      const request = frameList(storePath, sqliteBinary, initialized);
      request[selector] = value;
      assertInvalid(await invoke(sourceEntrypoint, root, request), "frame", `request.${selector}`);
    }
    assert.deepEqual(await ownerFacts(sqliteBinary, storePath), []);
  } finally {
    await removeAndVerify(root);
  }
});

test("invalid owner shapes fail before mutation and typed façades retain the deletion-test boundary", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await makeRoot("w04-invalid-boundary");
  try {
    const storePath = path.join(root, "store.sqlite3");
    const initialized = await initialize(sourceEntrypoint, root, storePath, sqliteBinary, "operation:w04-invalid-init");

    const invalidCaseRequest = caseCreate(storePath, sqliteBinary, initialized);
    delete invalidCaseRequest.case.summary;
    const invalidCase = await invoke(sourceEntrypoint, root, invalidCaseRequest);
    assertInvalid(invalidCase, "case", "case.summary", "required_bounded_string");

    const impossibleCategory = frameCreate(storePath, sqliteBinary, initialized, {
      discoveryOverrides: { category: "settled" },
    });
    assertInvalid(
      await invoke(sourceEntrypoint, root, impossibleCategory),
      "frame",
      "frame.discovery[0].category",
      "active_category_invariant",
    );

    const forbiddenRepresentation = frameCreate(storePath, sqliteBinary, initialized, {
      operationId: "operation:w04-forbidden-frame",
      discoveryOverrides: { priority: "high" },
    });
    assertInvalid(
      await invoke(sourceEntrypoint, root, forbiddenRepresentation),
      "frame",
      "frame.discovery[0].priority",
    );
    assert.deepEqual(await ownerFacts(sqliteBinary, storePath), []);

    const rawTypedPayloadAtSubstrate = await invoke(sourceMechanicalDriver, root, {
      ...caseCreate(storePath, sqliteBinary, initialized),
      operation: "commit_owner_revision",
    });
    assert.equal(rawTypedPayloadAtSubstrate.exitCode, 2);
    assert.equal(rawTypedPayloadAtSubstrate.json.failure.code, "representation_invalid");
    assert.deepEqual(await ownerFacts(sqliteBinary, storePath), []);

    const caseSource = await readFile(path.join(packageRoot, "variants/sqlite/lib/case/index.mjs"), "utf8");
    const frameSource = await readFile(path.join(packageRoot, "variants/sqlite/lib/frame/index.mjs"), "utf8");
    const substrateSource = await readFile(path.join(packageRoot, "variants/sqlite/lib/substrate/mechanical.mjs"), "utf8");
    assert.match(caseSource, /case-profile@1/);
    assert.match(caseSource, /case\.revision\.committed/);
    assert.match(frameSource, /frame-discovery-item@1/);
    assert.match(frameSource, /frame-canonical-selection@2/);
    assert.match(frameSource, /reopen_reference_required/);
    assert.doesNotMatch(substrateSource, /case-profile@1|frame-discovery-item@1|reopen_reference_required/);
  } finally {
    await removeAndVerify(root);
  }
});

test("complete Frame revisions settle, replay, reopen, and reject omissions before mutation", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await makeRoot("l03-w01-frame-revisions");
  try {
    const storePath = path.join(root, "store.sqlite3");
    const initialized = await initialize(sourceEntrypoint, root, storePath, sqliteBinary, "operation:l03-w01-init");
    const invalidCreateReopen = frameCreate(storePath, sqliteBinary, initialized, {
      operationId: "operation:l03-w01-create-reopen",
      discoveryOverrides: { reopened_from_version: "discovery-item-version:97617dba-ff62-4911-99c6-8a02196dbd4b", reopening_basis: "impossible on create" },
    });
    assertInvalid(await invoke(sourceEntrypoint, root, invalidCreateReopen), "frame", "frame.discovery", "reopen_requires_prior_settlement");
    assert.deepEqual(await ownerFacts(sqliteBinary, storePath), []);
    const createdRequest = frameCreate(storePath, sqliteBinary, initialized, {
      operationId: "operation:l03-w01-create",
      frameOverrides: {
        title: "Complete Frame", outcome: "Persist cohesive revisions", included_scope: ["Frame owner"], excluded_scope: ["queries"],
        case_links: [{ target_kind: "case", target_id: ids.case, predicate: "informed-by", observed_revision_id: "case-revision:97617dba-ff62-4911-99c6-8a02196dbd4b" }],
        authorization_provenance: { acting_role: "hand", authority_basis: "accepted Deliver authorization" },
      },
      discoveryOverrides: { dependencies: [{ target_kind: "case", target_id: ids.case, predicate: "depends-on" }] },
    });
    const created = await invoke(sourceEntrypoint, root, createdRequest);
    assert.equal(created.exitCode, 0, created.stderr);
    assert.equal(created.json.result.receipt.observed_revision, null);
    assert.doesNotMatch(JSON.stringify(created.json.result.receipt), /owner-revision:/);

    const settledRequest = frameCreate(storePath, sqliteBinary, initialized, { operationId: "operation:l03-w01-settle" });
    settledRequest.frame = structuredClone(created.json.result.frame);
    Object.assign(settledRequest.frame.discovery[0], { lifecycle: "settled", category: "settled", disposition: "accepted", resolution: "represented durably" });
    settledRequest.operation = "frame.commit_revision";
    settledRequest.frame_id = ids.activeFrame;
    settledRequest.expected_revision = 1;
    delete settledRequest.frame.discovery[0].version_id;
    const settled = await invoke(sourceEntrypoint, root, settledRequest);
    assert.equal(settled.exitCode, 0, settled.stderr);
    assert.equal(settled.json.result.frame.discovery[0].lifecycle, "settled");
    assert.deepEqual(settled.json.result.receipt.observed_revision, created.json.result.revision && { id: created.json.result.revision.id, number: 1 });
    assert.equal(settled.json.result.revision.version_ids.frame, created.json.result.revision.version_ids.frame);
    assert.notEqual(settled.json.result.frame.discovery[0].version_id, created.json.result.frame.discovery[0].version_id);
    assert.doesNotMatch(JSON.stringify(settled.json.result.receipt), /owner-revision:/);

    const historicalRead = frameRead(storePath, sqliteBinary, initialized);
    historicalRead.revision_id = created.json.result.revision.id;
    const historical = await invoke(sourceEntrypoint, root, historicalRead);
    assert.equal(historical.exitCode, 0, historical.stderr);
    assert.equal(historical.json.result.frame.discovery[0].lifecycle, "active");
    const activeOnlyRead = await invoke(sourceEntrypoint, root, frameRead(storePath, sqliteBinary, initialized));
    assert.deepEqual(activeOnlyRead.json.result.frame.discovery, []);
    assert.equal(activeOnlyRead.json.result.applied_discovery_scope, "active_only");
    const allSelectedRead = await invoke(sourceEntrypoint, root, {
      ...frameRead(storePath, sqliteBinary, initialized), include: { discovery: "all_selected" },
    });
    assert.equal(allSelectedRead.json.result.frame.discovery[0].lifecycle, "settled");
    assert.equal(allSelectedRead.json.result.applied_discovery_scope, "all_selected");
    const missingRevision = await invoke(sourceEntrypoint, root, {
      ...frameRead(storePath, sqliteBinary, initialized), revision_number: 99,
    });
    assert.equal(missingRevision.json.failure.code, "frame.revision_not_found_or_not_visible");
    const missingDiscovery = await invoke(sourceEntrypoint, root, {
      ...frameRead(storePath, sqliteBinary, initialized), operation: "frame.discovery.read", discovery_item_id: ids.secondActiveDiscovery,
    });
    assert.equal(missingDiscovery.json.failure.code, "frame.discovery_not_found_or_not_visible");
    assert.notEqual(missingDiscovery.json.failure.code, missingRevision.json.failure.code);
    assert.deepEqual(missingRevision.json.failure.evidence, {});
    assert.deepEqual(missingDiscovery.json.failure.evidence, {});
    const discoveryRead = { ...frameRead(storePath, sqliteBinary, initialized), operation: "frame.discovery.read", discovery_item_id: ids.activeDiscovery, revision_number: 2 };
    const discovery = await invoke(sourceEntrypoint, root, discoveryRead);
    assert.equal(discovery.exitCode, 0, discovery.stderr);
    assert.equal(discovery.json.result.discovery_item.lifecycle, "settled");
    const historyRequest = { ...frameRead(storePath, sqliteBinary, initialized), operation: "frame.history", limit: 1 };
    const historyPageOne = await invoke(sourceEntrypoint, root, historyRequest);
    assert.equal(historyPageOne.exitCode, 0, historyPageOne.stderr);
    assert.equal(historyPageOne.json.result.items.length, 1);
    assert.equal(historyPageOne.json.result.items[0].revision.number, 2);
    assert.equal(typeof historyPageOne.json.result.next_cursor, "string");
    const historyPageTwo = await invoke(sourceEntrypoint, root, { ...historyRequest, cursor: historyPageOne.json.result.next_cursor });
    assert.equal(historyPageTwo.json.result.items[0].revision.number, 1);
    const mismatchedCursor = await invoke(sourceEntrypoint, root, { ...historyRequest, limit: 2, cursor: historyPageOne.json.result.next_cursor });
    assert.equal(mismatchedCursor.json.failure.evidence.violations[0].rule, "cursor_invalid_or_query_mismatch");
    const revisionOneReplay = await invoke(sourceEntrypoint, root, createdRequest);
    assert.equal(revisionOneReplay.exitCode, 0, revisionOneReplay.stderr);
    assert.equal(revisionOneReplay.json.result.idempotent_replay, true);
    assert.deepEqual(revisionOneReplay.json.result.receipt, created.json.result.receipt);
    const replay = await invoke(sourceEntrypoint, root, settledRequest);
    assert.equal(replay.exitCode, 0, replay.stderr);
    assert.equal(replay.json.result.idempotent_replay, true);
    assert.deepEqual(replay.json.result.revision, settled.json.result.revision);

    const unchangedRequest = structuredClone(settledRequest);
    unchangedRequest.operation_id = "operation:l03-w01-unchanged";
    unchangedRequest.expected_revision = 2;
    const unchanged = await invoke(sourceEntrypoint, root, unchangedRequest);
    assert.equal(unchanged.exitCode, 0, unchanged.stderr);
    assert.deepEqual(unchanged.json.result.revision.version_ids, settled.json.result.revision.version_ids);
    const replayAfterLaterRevision = await invoke(sourceEntrypoint, root, settledRequest);
    assert.equal(replayAfterLaterRevision.exitCode, 0, replayAfterLaterRevision.stderr);
    assert.equal(replayAfterLaterRevision.json.result.idempotent_replay, true);
    assert.deepEqual(replayAfterLaterRevision.json.result.receipt, settled.json.result.receipt);

    const reopenRequest = structuredClone(settledRequest);
    reopenRequest.operation_id = "operation:l03-w01-reopen";
    reopenRequest.expected_revision = 3;
    reopenRequest.frame.discovery[0] = {
      ...reopenRequest.frame.discovery[0], lifecycle: "active", category: "frontier",
      reopened_from_version: settled.json.result.frame.discovery[0].version_id, reopening_basis: "new evidence",
    };
    delete reopenRequest.frame.discovery[0].disposition;
    delete reopenRequest.frame.discovery[0].resolution;
    const reopened = await invoke(sourceEntrypoint, root, reopenRequest);
    assert.equal(reopened.exitCode, 0, reopened.stderr);
    assert.equal(reopened.json.result.revision.number, 4);

    const before = await ownerFacts(sqliteBinary, storePath);
    const omitted = structuredClone(reopenRequest);
    omitted.operation_id = "operation:l03-w01-omit";
    omitted.expected_revision = 4;
    omitted.frame.discovery = [];
    assertInvalid(await invoke(sourceEntrypoint, root, omitted), "frame", "frame.discovery", "complete_discovery_required");
    const impossibleSettlement = structuredClone(reopenRequest);
    impossibleSettlement.operation_id = "operation:l03-w01-invalid-settlement";
    impossibleSettlement.expected_revision = 4;
    Object.assign(impossibleSettlement.frame.discovery[0], { lifecycle: "settled", category: "settled" });
    delete impossibleSettlement.frame.discovery[0].reopened_from_version;
    delete impossibleSettlement.frame.discovery[0].reopening_basis;
    delete impossibleSettlement.frame.discovery[0].disposition;
    delete impossibleSettlement.frame.discovery[0].resolution;
    assertInvalid(await invoke(sourceEntrypoint, root, impossibleSettlement), "frame", "frame.discovery[0].disposition", "disposition_or_resolution_required");
    const invalidReference = structuredClone(reopenRequest);
    invalidReference.operation_id = "operation:l03-w01-invalid-reference";
    invalidReference.expected_revision = 4;
    invalidReference.frame.case_links = [{ target_kind: "case", target_id: "case:not-a-uuid", predicate: "informed-by" }];
    assertInvalid(await invoke(sourceEntrypoint, root, invalidReference), "frame", "frame.case_links[0].target_id", "uuid_identity_required");
    const invalidArtifactRevision = structuredClone(reopenRequest);
    invalidArtifactRevision.operation_id = "operation:l03-w01-invalid-artifact-revision";
    invalidArtifactRevision.expected_revision = 4;
    invalidArtifactRevision.frame.artifact_links = [{ artifact_id: "artifact:97617dba-ff62-4911-99c6-8a02196dbd4b", kind: "report", title: "Proof", locator: { uri: "file:///proof", audience: "private" }, observed_revision_id: "owner-revision:97617dba-ff62-4911-99c6-8a02196dbd4b" }];
    assertInvalid(await invoke(sourceEntrypoint, root, invalidArtifactRevision), "frame", "frame.artifact_links[0].observed_revision_id", "revision_reference_invalid");
    for (const [index, field] of ["observed_revision_id", "pinned_revision_id"].entries()) {
      const mismatchedReferenceRevision = structuredClone(reopenRequest);
      mismatchedReferenceRevision.operation_id = `operation:l03-w01-mismatched-reference-${index}`;
      mismatchedReferenceRevision.expected_revision = 4;
      mismatchedReferenceRevision.frame.discovery[0].dependencies = [{
        target_kind: "case", target_id: ids.case, predicate: "depends-on",
        [field]: "frame-revision:97617dba-ff62-4911-99c6-8a02196dbd4b",
      }];
      assertInvalid(await invoke(sourceEntrypoint, root, mismatchedReferenceRevision), "frame", `frame.discovery[0].dependencies[0].${field}`, "revision_reference_invalid");
    }
    const crossScope = structuredClone(reopenRequest);
    crossScope.operation_id = "operation:l03-w01-cross-scope";
    crossScope.expected_revision = 4;
    crossScope.frame.authority_scope_namespace_ids.push("namespace:97617dba-ff62-4911-99c6-8a02196dbd4b");
    assertInvalid(await invoke(sourceEntrypoint, root, crossScope), "frame", "frame.authority_scope_namespace_ids", "scope_addition_not_granted");
    const activeReopen = structuredClone(reopenRequest);
    activeReopen.operation_id = "operation:l03-w01-active-reopen";
    activeReopen.expected_revision = 4;
    activeReopen.frame.discovery[0].reopening_basis = "changed active basis";
    assertInvalid(await invoke(sourceEntrypoint, root, activeReopen), "frame", "frame.discovery", "active_to_active_reopen_invalid");
    assert.deepEqual(await ownerFacts(sqliteBinary, storePath), before);

    const returnToSettled = structuredClone(settledRequest);
    returnToSettled.operation_id = "operation:l03-w01-return-to-settled";
    returnToSettled.expected_revision = 4;
    const returned = await invoke(sourceEntrypoint, root, returnToSettled);
    assert.equal(returned.exitCode, 0, returned.stderr);
    const exactHistoricalReplay = await invoke(sourceEntrypoint, root, settledRequest);
    assert.equal(exactHistoricalReplay.exitCode, 0, exactHistoricalReplay.stderr);
    assert.equal(exactHistoricalReplay.json.result.idempotent_replay, true);
    assert.deepEqual(exactHistoricalReplay.json.result, { ...settled.json.result, idempotent_replay: true });
    const changedHistoricalReuse = structuredClone(settledRequest);
    changedHistoricalReuse.frame.discovery[0].resolution = "changed after the A→B→A cycle";
    const changedHistoricalMismatch = await invoke(sourceEntrypoint, root, changedHistoricalReuse);
    assert.equal(changedHistoricalMismatch.json.failure.code, "frame.idempotency_mismatch");

    const staleRequest = structuredClone(settledRequest);
    staleRequest.operation_id = "operation:l03-w01-stale-rejected";
    staleRequest.expected_revision = 4;
    const staleFirst = await invoke(sourceEntrypoint, root, staleRequest);
    assert.equal(staleFirst.json.failure.code, "frame.revision_conflict");
    const advanceAfterStale = structuredClone(reopenRequest);
    advanceAfterStale.operation_id = "operation:l03-w01-advance-after-stale";
    advanceAfterStale.expected_revision = 5;
    advanceAfterStale.frame.discovery[0].reopened_from_version = returned.json.result.frame.discovery[0].version_id;
    const advancedAfterStale = await invoke(sourceEntrypoint, root, advanceAfterStale);
    assert.equal(advancedAfterStale.exitCode, 0, JSON.stringify(advancedAfterStale.json));
    const staleRetry = await invoke(sourceEntrypoint, root, staleRequest);
    assert.deepEqual(staleRetry.json, staleFirst.json);
    const rejectedReceipt = await invoke(sourceEntrypoint, root, frameReceipt(storePath, sqliteBinary, initialized, staleRequest.operation_id));
    assert.equal(rejectedReceipt.exitCode, 0, rejectedReceipt.stderr);
    assert.equal(rejectedReceipt.json.result.status, "settled");
    assert.equal(rejectedReceipt.json.result.receipt.outcome, "rejected");
    assert.equal(rejectedReceipt.json.result.original_result.status, "rejected");
    assert.equal(rejectedReceipt.json.result.original_result.failure.code, "frame.revision_conflict");
    assert.match(rejectedReceipt.json.result.original_result.observed_revision.id, /^frame-revision:/);
    assert.match(rejectedReceipt.json.result.original_result.expected_revision.id, /^frame-revision:/);
    assert.doesNotMatch(JSON.stringify(rejectedReceipt.json), /owner-revision:|commit_owner_revision|allocations/);
    assert.deepEqual((await invoke(sourceEntrypoint, root, frameReceipt(storePath, sqliteBinary, initialized, staleRequest.operation_id))).json, rejectedReceipt.json);
    const hiddenTypedReceipt = await invoke(sourceEntrypoint, root, frameReceipt(storePath, sqliteBinary, initialized, staleRequest.operation_id, ids.unknownFrame));
    assert.deepEqual(hiddenTypedReceipt.json.result, { status: "not_visible" });
    assert.doesNotMatch(JSON.stringify(hiddenTypedReceipt.json), new RegExp(ids.activeFrame));
    const unavailableRequest = frameReceipt(storePath, sqliteBinary, initialized, staleRequest.operation_id);
    unavailableRequest.configuration.sqlite.sqlite_bin = path.join(root, "missing-sqlite");
    assert.equal((await invoke(sourceEntrypoint, root, unavailableRequest)).json.failure.code, "sqlite_binary_unavailable");
    const changedStaleReuse = structuredClone(staleRequest);
    changedStaleReuse.frame.discovery[0].resolution = "changed rejected reuse";
    assert.equal((await invoke(sourceEntrypoint, root, changedStaleReuse)).json.failure.code, "frame.idempotency_mismatch");
  } finally {
    await removeAndVerify(root);
  }
});

async function runGeneratedTypedProof(generated, report, root) {
  const connector = path.join(generated.package_root, "variants/sqlite/bin/casebook-persistence.mjs");
  const cwd = path.join(root, "unrelated-cwd");
  const storePath = path.join(root, "synthetic-data", `${generated.target}-w04.sqlite3`);
  const initialized = await initialize(
    connector, cwd, storePath, report.sqlite_binary, `operation:w04-${generated.target}-init`,
  );
  const caseRequest = caseCreate(storePath, report.sqlite_binary, initialized, {
    operationId: `operation:w04-${generated.target}-case`,
  });
  const createdCase = await invoke(connector, cwd, caseRequest);
  assert.equal(createdCase.exitCode, 0, createdCase.stderr);
  await execFileAsync(report.sqlite_binary, [storePath, `
    INSERT INTO namespaces VALUES ('${ids.hiddenNamespace}', 'hidden-w04', 'active', '2026-01-01T00:00:00.000Z');
    INSERT INTO owners VALUES ('${ids.hiddenCase}', 'case', '${ids.hiddenNamespace}', '2026-01-01T00:00:00.000Z');
    INSERT INTO owner_revisions VALUES ('owner-revision:247e0a31-5a21-44cf-94ee-506ee2d94ae9', '${ids.hiddenCase}', 1, '{}', 'case-canonical', 2, 'synthetic-hidden-case', '2026-01-01T00:00:00.000Z');
    INSERT INTO owner_current VALUES ('${ids.hiddenCase}', 'owner-revision:247e0a31-5a21-44cf-94ee-506ee2d94ae9', 1, '{}', '2026-01-01T00:00:00.000Z');
    UPDATE store_fence SET operation_fence=operation_fence+1 WHERE singleton=1;
  `], { encoding: "utf8" });
  const frameRequest = frameCreate(storePath, report.sqlite_binary, initialized, {
    operationId: `operation:w04-${generated.target}-frame`,
    frameOverrides: { case_links: [
      { target_kind: "case", target_id: ids.case, predicate: "frames" },
      { target_kind: "case", target_id: ids.hiddenCase, predicate: "frames" },
    ] },
  });
  const createdFrame = await invoke(connector, cwd, frameRequest);
  assert.equal(createdFrame.exitCode, 0, createdFrame.stderr);
  const commitFrameRequest = frameCreate(storePath, report.sqlite_binary, initialized, {
    operationId: `operation:w04-${generated.target}-frame-commit`,
  });
  commitFrameRequest.operation = "frame.commit_revision";
  commitFrameRequest.frame_id = ids.activeFrame;
  commitFrameRequest.expected_revision = 1;
  commitFrameRequest.frame = structuredClone(createdFrame.json.result.frame);
  commitFrameRequest.frame.title = `Committed through ${generated.target}`;
  Object.assign(commitFrameRequest.frame.discovery[0], { lifecycle: "settled", category: "settled", disposition: "accepted", resolution: "generated A" });
  for (const item of commitFrameRequest.frame.discovery) delete item.version_id;
  const committedFrame = await invoke(connector, cwd, commitFrameRequest);
  assert.equal(committedFrame.exitCode, 0, committedFrame.stderr);
  assert.equal(committedFrame.json.operation, "frame.commit_revision");
  assert.equal(committedFrame.json.result.revision.number, 2);
  assert.equal(committedFrame.json.result.receipt.observed_revision.id, createdFrame.json.result.revision.id);

  const generatedB = structuredClone(commitFrameRequest);
  generatedB.operation_id += "-b";
  generatedB.expected_revision = 2;
  generatedB.frame.discovery[0] = { ...generatedB.frame.discovery[0], lifecycle: "active", category: "frontier", reopened_from_version: committedFrame.json.result.frame.discovery[0].version_id, reopening_basis: "generated B" };
  delete generatedB.frame.discovery[0].disposition;
  delete generatedB.frame.discovery[0].resolution;
  assert.equal((await invoke(connector, cwd, generatedB)).exitCode, 0);
  const generatedReturnA = structuredClone(commitFrameRequest);
  generatedReturnA.operation_id += "-return-a";
  generatedReturnA.expected_revision = 3;
  const generatedReturnedA = await invoke(connector, cwd, generatedReturnA);
  assert.equal(generatedReturnedA.exitCode, 0);
  const generatedReplay = await invoke(connector, cwd, commitFrameRequest);
  assert.equal(generatedReplay.exitCode, 0, generatedReplay.stderr);
  assert.deepEqual(generatedReplay.json.result, { ...committedFrame.json.result, idempotent_replay: true });
  const generatedChangedReuse = structuredClone(commitFrameRequest);
  generatedChangedReuse.frame.discovery[0].resolution = "changed generated reuse";
  assert.equal((await invoke(connector, cwd, generatedChangedReuse)).json.failure.code, "frame.idempotency_mismatch");

  const generatedStale = structuredClone(commitFrameRequest);
  generatedStale.operation_id += "-stale-rejected";
  generatedStale.expected_revision = 3;
  const generatedStaleFirst = await invoke(connector, cwd, generatedStale);
  assert.equal(generatedStaleFirst.json.failure.code, "frame.revision_conflict");
  const generatedAdvance = structuredClone(generatedB);
  generatedAdvance.operation_id += "-advance";
  generatedAdvance.expected_revision = 4;
  generatedAdvance.frame.discovery[0].reopened_from_version = generatedReturnedA.json.result.frame.discovery[0].version_id;
  const generatedAdvanced = await invoke(connector, cwd, generatedAdvance);
  assert.equal(generatedAdvanced.exitCode, 0, JSON.stringify(generatedAdvanced.json));
  assert.deepEqual((await invoke(connector, cwd, generatedStale)).json, generatedStaleFirst.json);
  const generatedChangedStale = structuredClone(generatedStale);
  generatedChangedStale.frame.discovery[0].resolution = "changed generated rejected reuse";
  assert.equal((await invoke(connector, cwd, generatedChangedStale)).json.failure.code, "frame.idempotency_mismatch");

  // Receipt recovery is the first-class retry path, including historical outcomes.
  const acceptedReceipt = await invoke(connector, cwd, frameReceipt(storePath, report.sqlite_binary, initialized, commitFrameRequest.operation_id));
  assert.equal(acceptedReceipt.json.result.status, "settled");
  assert.equal(acceptedReceipt.json.result.receipt.outcome, "committed");
  assert.deepEqual(acceptedReceipt.json.result.original_result.revision, committedFrame.json.result.revision);
  assert.match(acceptedReceipt.json.result.original_result.revision.id, /^frame-revision:/);
  assert.match(acceptedReceipt.json.result.original_result.revision.version_ids.frame, /^frame-version:/);
  const rejectedReceipt = await invoke(connector, cwd, frameReceipt(storePath, report.sqlite_binary, initialized, generatedStale.operation_id));
  assert.equal(rejectedReceipt.json.result.status, "settled");
  assert.equal(rejectedReceipt.json.result.receipt.outcome, "rejected");
  assert.equal(rejectedReceipt.json.result.original_result.failure.code, "frame.revision_conflict");
  assert.match(rejectedReceipt.json.result.original_result.observed_revision.id, /^frame-revision:/);
  assert.deepEqual((await invoke(connector, cwd, frameReceipt(storePath, report.sqlite_binary, initialized, generatedStale.operation_id))).json, rejectedReceipt.json);
  for (const response of [acceptedReceipt, rejectedReceipt]) assert.doesNotMatch(JSON.stringify(response.json), /owner-revision:|commit_owner_revision|allocations|owner_home_namespace_id/);
  const absentReceipt = await invoke(connector, cwd, frameReceipt(storePath, report.sqlite_binary, initialized, `operation:w04-${generated.target}-absent`));
  assert.equal(absentReceipt.json.result.status, "absent_at_fence");
  assert.equal(typeof absentReceipt.json.result.operation_fence, "number");
  const hiddenReceipt = await invoke(connector, cwd, frameReceipt(storePath, report.sqlite_binary, initialized, commitFrameRequest.operation_id, ids.unknownFrame));
  assert.deepEqual(hiddenReceipt.json.result, { status: "not_visible" });
  assert.doesNotMatch(JSON.stringify(hiddenReceipt.json), new RegExp(ids.activeFrame));
  const unavailableReceiptRequest = frameReceipt(storePath, report.sqlite_binary, initialized, commitFrameRequest.operation_id);
  unavailableReceiptRequest.configuration.sqlite.sqlite_bin = path.join(root, `missing-sqlite-${generated.target}`);
  assert.equal((await invoke(connector, cwd, unavailableReceiptRequest)).json.failure.code, "sqlite_binary_unavailable");

  const secondFrame = await invoke(connector, cwd, frameCreate(storePath, report.sqlite_binary, initialized, {
    frameId: ids.secondActiveFrame,
    discoveryId: ids.secondActiveDiscovery,
    operationId: `operation:w04-${generated.target}-second-frame`,
  }));
  assert.equal(secondFrame.exitCode, 0, secondFrame.stderr);
  const readCaseResult = await invoke(connector, cwd, caseRead(storePath, report.sqlite_binary, initialized));
  const readFrameResult = await invoke(connector, cwd, frameRead(storePath, report.sqlite_binary, initialized));
  const settledReadRequest = { ...frameRead(storePath, report.sqlite_binary, initialized), revision_number: 2 };
  const activeOnlyFrameResult = await invoke(connector, cwd, settledReadRequest);
  const allSelectedFrameResult = await invoke(connector, cwd, { ...settledReadRequest, include: { discovery: "all_selected" } });
  const listFrameResult = await invoke(connector, cwd, frameList(storePath, report.sqlite_binary, initialized));
  assert.equal(readCaseResult.json.result.case.id, ids.case);
  assert.equal(readFrameResult.json.result.frame.id, ids.activeFrame);
  assert.equal(readFrameResult.json.result.frame.discovery[0].lifecycle, "active");
  assert.deepEqual(activeOnlyFrameResult.json.result.frame.discovery, []);
  assert.equal(activeOnlyFrameResult.json.result.applied_discovery_scope, "active_only");
  assert.equal(allSelectedFrameResult.json.result.frame.discovery[0].lifecycle, "settled");
  assert.equal(allSelectedFrameResult.json.result.applied_discovery_scope, "all_selected");
  assert.equal(readFrameResult.json.result.completion_evidence.overall_completion_asserted, false);
  assert.deepEqual(new Set(listFrameResult.json.result.items.map((item) => item.id)), new Set([ids.activeFrame, ids.secondActiveFrame]));
  assert.equal(listFrameResult.json.result.index_state, "current");
  assert.equal(listFrameResult.json.result.applied_lifecycle_scope, "active_only");
  for (const selectors of [
    { home_namespace_id: initialized.namespace.id },
    { authority_scope_namespace_ids: [initialized.namespace.id] },
  ]) {
    const selected = await invoke(connector, cwd, { ...frameList(storePath, report.sqlite_binary, initialized), ...selectors });
    assert.deepEqual(new Set(selected.json.result.items.map((item) => item.id)), new Set([ids.activeFrame, ids.secondActiveFrame]));
  }
  const selectedPageRequest = { ...frameList(storePath, report.sqlite_binary, initialized), home_namespace_id: initialized.namespace.id, limit: 1 };
  const selectedPage = await invoke(connector, cwd, selectedPageRequest);
  assert.equal(typeof selectedPage.json.result.next_cursor, "string");
  const selectorMismatch = await invoke(connector, cwd, { ...selectedPageRequest, authority_scope_namespace_ids: [initialized.namespace.id], cursor: selectedPage.json.result.next_cursor });
  assert.equal(selectorMismatch.json.failure.evidence.violations[0].rule, "cursor_invalid_or_query_mismatch");
  // Generated packages must retain query completeness for pre-L03-W04 projections.
  await execFileAsync(report.sqlite_binary, [storePath, `
    UPDATE owner_current
    SET projection_json=json_remove(projection_json, '$.linked_case_ids')
    WHERE owner_id='${ids.activeFrame}';
  `], { encoding: "utf8" });
  const linkedVisible = await invoke(connector, cwd, { ...frameList(storePath, report.sqlite_binary, initialized), linked_case_id: ids.case });
  assert.deepEqual(linkedVisible.json.result.items.map((item) => item.id), [ids.activeFrame]);
  const linkedUnknown = await invoke(connector, cwd, { ...frameList(storePath, report.sqlite_binary, initialized), linked_case_id: ids.unknownCase });
  assert.deepEqual(linkedUnknown.json.result.items, []);
  assert.equal(linkedUnknown.json.result.next_cursor, null);
  assert.doesNotMatch(JSON.stringify(linkedUnknown.json), new RegExp(ids.activeFrame));
  const linkedHidden = await invoke(connector, cwd, { ...frameList(storePath, report.sqlite_binary, initialized), linked_case_id: ids.hiddenCase });
  assert.deepEqual(linkedHidden.json.result.items, linkedUnknown.json.result.items);
  assert.equal(linkedHidden.json.result.next_cursor, linkedUnknown.json.result.next_cursor);
  assert.doesNotMatch(JSON.stringify(linkedHidden.json), new RegExp(ids.activeFrame));
  const missingRevision = await invoke(connector, cwd, { ...frameRead(storePath, report.sqlite_binary, initialized), revision_number: 99 });
  const missingDiscovery = await invoke(connector, cwd, { ...frameRead(storePath, report.sqlite_binary, initialized), operation: "frame.discovery.read", discovery_item_id: ids.closedDiscovery });
  assert.equal(missingRevision.json.failure.code, "frame.revision_not_found_or_not_visible");
  assert.equal(missingDiscovery.json.failure.code, "frame.discovery_not_found_or_not_visible");
  assert.notEqual(missingRevision.json.failure.code, missingDiscovery.json.failure.code);
  assert.deepEqual(missingRevision.json.failure.evidence, {});
  assert.deepEqual(missingDiscovery.json.failure.evidence, {});
  const closedOnly = await invoke(connector, cwd, { ...frameList(storePath, report.sqlite_binary, initialized), statuses: ["completed"] });
  assert.deepEqual(closedOnly.json.result.items, []);
  const resolved = await invoke(connector, cwd, { ...frameRead(storePath, report.sqlite_binary, initialized), operation: "frame.resolve" });
  assert.equal(resolved.json.result.frame_id, ids.activeFrame);
  const discovery = await invoke(connector, cwd, { ...frameRead(storePath, report.sqlite_binary, initialized), operation: "frame.discovery.read", discovery_item_id: ids.activeDiscovery });
  assert.equal(discovery.json.result.discovery_item.id, ids.activeDiscovery);
  const historyRequest = { ...frameRead(storePath, report.sqlite_binary, initialized), operation: "frame.history", limit: 2 };
  const historyOne = await invoke(connector, cwd, historyRequest);
  assert.equal(historyOne.json.result.index_state, "current");
  assert.deepEqual(historyOne.json.result.items.map((item) => item.revision.number), [5, 4]);
  assert.ok(historyOne.json.result.next_cursor.length < 1024);
  const historyTwo = await invoke(connector, cwd, { ...historyRequest, cursor: historyOne.json.result.next_cursor });
  assert.deepEqual(historyTwo.json.result.items.map((item) => item.revision.number), [3, 2]);
  const tamperedHistoryCursor = `${historyOne.json.result.next_cursor.slice(0, -1)}${historyOne.json.result.next_cursor.endsWith("A") ? "B" : "A"}`;
  assert.equal((await invoke(connector, cwd, { ...historyRequest, cursor: tamperedHistoryCursor })).json.failure.evidence.violations[0].rule, "cursor_invalid_or_query_mismatch");
  const forgedHistoryEnvelope = JSON.parse(Buffer.from(historyOne.json.result.next_cursor, "base64url").toString());
  const forgedHistoryPayload = JSON.stringify({ ...JSON.parse(forgedHistoryEnvelope.p), f: 999 });
  forgedHistoryEnvelope.p = forgedHistoryPayload;
  forgedHistoryEnvelope.d = createHash("sha256").update(`casebook-frame-cursor@1\0${forgedHistoryPayload}`).digest("hex");
  assert.equal((await invoke(connector, cwd, { ...historyRequest, cursor: Buffer.from(JSON.stringify(forgedHistoryEnvelope)).toString("base64url") })).json.failure.evidence.violations[0].rule, "cursor_invalid_or_query_mismatch");
  assert.equal((await invoke(connector, cwd, { ...historyRequest, cursor: "x".repeat(1025) })).json.failure.evidence.violations[0].rule, "cursor_invalid_or_query_mismatch");
  const fenceAdvance = structuredClone(generatedReturnA);
  fenceAdvance.operation_id += "-fence-advance";
  fenceAdvance.expected_revision = 5;
  assert.equal((await invoke(connector, cwd, fenceAdvance)).exitCode, 0);
  assert.equal((await invoke(connector, cwd, { ...historyRequest, cursor: historyOne.json.result.next_cursor })).json.failure.evidence.violations[0].rule, "cursor_fence_expired");

  for (const operationId of [caseRequest.operation_id, frameRequest.operation_id, commitFrameRequest.operation_id]) {
    const receipt = await invoke(connector, cwd, storeReceipt(
      storePath, report.sqlite_binary, initialized, operationId,
    ));
    assert.deepEqual(receipt.json.result, { status: "not_visible" });
  }

  const mechanicalTuple = caseRead(storePath, report.sqlite_binary, initialized);
  mechanicalTuple.home_namespace_id = initialized.namespace.id;
  assertInvalid(await invoke(connector, cwd, mechanicalTuple), "case", "request.home_namespace_id");

  const historicalFrame = frameRead(storePath, report.sqlite_binary, initialized);
  historicalFrame.revision_id = createdFrame.json.result.revision.id;
  const historicalResult = await invoke(connector, cwd, historicalFrame);
  assert.equal(historicalResult.exitCode, 0, historicalResult.stderr);
  assert.equal(historicalResult.json.result.revision.id, createdFrame.json.result.revision.id);

  const includeClosed = frameList(storePath, report.sqlite_binary, initialized);
  includeClosed.include_closed = true;
  assertInvalid(await invoke(connector, cwd, includeClosed), "frame", "request.include_closed");

  const laterCreate = caseCreate(storePath, report.sqlite_binary, initialized, {
    operationId: `operation:w04-${generated.target}-invalid-case`,
  });
  laterCreate.include = ["history"];
  assertInvalid(await invoke(connector, cwd, laterCreate), "case", "request.include");

  assert.deepEqual(await ownerFacts(report.sqlite_binary, storePath), [
    { owner_kind: "case", owner_id: ids.hiddenCase, revision_number: 1 },
    { owner_kind: "case", owner_id: ids.case, revision_number: 1 },
    { owner_kind: "frame", owner_id: ids.activeFrame, revision_number: 6 },
    { owner_kind: "frame", owner_id: ids.secondActiveFrame, revision_number: 1 },
  ]);
}

test("generated Pi, Codex, and OpenCode connectors enforce the same exact typed surface and clean every disposable resource", async (t) => {
  const root = await makeRoot("w04-generated");
  try {
    const report = await generateAndValidateSandbox({ sandboxRoot: root });
    for (const generated of report.results) {
      await t.test(generated.target, async () => runGeneratedTypedProof(generated, report, root));
    }
  } finally {
    assert.equal(await cleanupSandbox(root), true);
  }
  assert.equal(await stat(root).then(() => true).catch(() => false), false);
});
