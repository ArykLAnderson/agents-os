import assert from "node:assert/strict";
import { execFile } from "node:child_process";
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

    const frameRequest = frameCreate(storePath, sqliteBinary, initialized);
    const active = await invoke(sourceEntrypoint, root, frameRequest);
    assert.equal(active.exitCode, 0, active.stderr);
    assert.equal(active.json.operation, "frame.create");
    assert.equal(active.json.result.revision.number, 1);
    assert.match(active.json.result.revision.id, /^frame-revision:/);
    assert.match(active.json.result.revision.version_ids.frame, /^frame-version:/);
    assert.match(active.json.result.frame.discovery[0].version_id, /^discovery-item-version:/);
    assert.deepEqual(active.json.result.frame.discovery[0].dependencies, []);
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
    assert.deepEqual(frameSnapshot.json.result.frame, active.json.result.frame);
    assert.equal("home_namespace_id" in frameRead(storePath, sqliteBinary, initialized), false);

    const activeOnly = await invoke(sourceEntrypoint, root, frameList(storePath, sqliteBinary, initialized));
    assert.equal(activeOnly.exitCode, 0, activeOnly.stderr);
    assert.deepEqual(activeOnly.json.result.items.map((item) => item.id), [ids.activeFrame]);
    assert.equal(activeOnly.json.result.applied_lifecycle_scope, "active_only");
    assert.equal(activeOnly.json.result.result_completeness, "complete_within_bounds");

    assert.deepEqual(await ownerFacts(sqliteBinary, storePath), [
      { owner_kind: "case", owner_id: ids.case, revision_number: 1 },
      { owner_kind: "frame", owner_id: ids.activeFrame, revision_number: 1 },
    ]);
  } finally {
    await removeAndVerify(root);
  }
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

test("exact L-01 typed request shapes, active-only lifecycle, and empty dependencies reject later selectors without mutation", async () => {
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

    for (const [status, operationId] of [
      ["completed", "operation:invalid-completed"],
      ["abandoned", "operation:invalid-abandoned"],
      ["superseded", "operation:invalid-superseded"],
    ]) {
      const request = frameCreate(storePath, sqliteBinary, initialized, {
        frameId: ids.closedFrame,
        discoveryId: ids.closedDiscovery,
        operationId,
        frameOverrides: { status },
      });
      assertInvalid(await invoke(sourceEntrypoint, root, request), "frame", "frame.status", "active_frame_only_l01");
    }
    for (const lifecycle of ["settled", "tombstoned"]) {
      const request = frameCreate(storePath, sqliteBinary, initialized, {
        operationId: `operation:invalid-${lifecycle}`,
        discoveryOverrides: { lifecycle, category: lifecycle === "settled" ? "settled" : "frontier" },
      });
      assertInvalid(
        await invoke(sourceEntrypoint, root, request),
        "frame",
        "frame.discovery[0].lifecycle",
        "active_discovery_only_l01",
      );
    }

    const referenced = frameCreate(storePath, sqliteBinary, initialized, {
      operationId: "operation:invalid-reference",
      discoveryOverrides: {
        dependencies: [{
          target_kind: "case",
          target_id: ids.case,
          observed_revision_id: "case-revision:97617dba-ff62-4911-99c6-8a02196dbd4b",
          predicate: "uses-evidence-from",
        }],
      },
    });
    assertInvalid(
      await invoke(sourceEntrypoint, root, referenced),
      "frame",
      "frame.discovery[0].dependencies",
      "dependencies_unsupported_until_l03",
    );

    const laterDiscoveryField = frameCreate(storePath, sqliteBinary, initialized, {
      operationId: "operation:invalid-disposition",
      discoveryOverrides: { disposition: "not in L-01" },
    });
    assertInvalid(
      await invoke(sourceEntrypoint, root, laterDiscoveryField),
      "frame",
      "frame.discovery[0].disposition",
    );
    assert.deepEqual(await ownerFacts(sqliteBinary, storePath), []);

    const readCases = [
      ["home_namespace_id", initialized.namespace.id],
      ["revision_id", "case-revision:97617dba-ff62-4911-99c6-8a02196dbd4b"],
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
      ["revision_id", "frame-revision:5133301d-0ba2-4185-babf-a375e92d3d52"],
      ["include", ["discovery", "history"]],
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
      ["home_namespace_id", initialized.namespace.id],
      ["authority_scope_namespace_ids", [initialized.namespace.id]],
      ["linked_case_id", ids.case],
      ["revision_id", "frame-revision:5133301d-0ba2-4185-babf-a375e92d3d52"],
      ["include", ["history"]],
      ["filter", { status: "active" }],
      ["limit", 1],
      ["cursor", "later"],
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
    assert.match(frameSource, /active_frame_only_l01/);
    assert.match(frameSource, /dependencies_unsupported_until_l03/);
    assert.doesNotMatch(substrateSource, /case-profile@1|frame-discovery-item@1|active_frame_only_l01|dependencies_unsupported_until_l03/);
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
  const frameRequest = frameCreate(storePath, report.sqlite_binary, initialized, {
    operationId: `operation:w04-${generated.target}-frame`,
  });
  const createdFrame = await invoke(connector, cwd, frameRequest);
  assert.equal(createdFrame.exitCode, 0, createdFrame.stderr);
  const readCaseResult = await invoke(connector, cwd, caseRead(storePath, report.sqlite_binary, initialized));
  const readFrameResult = await invoke(connector, cwd, frameRead(storePath, report.sqlite_binary, initialized));
  const listFrameResult = await invoke(connector, cwd, frameList(storePath, report.sqlite_binary, initialized));
  assert.equal(readCaseResult.json.result.case.id, ids.case);
  assert.equal(readFrameResult.json.result.frame.id, ids.activeFrame);
  assert.deepEqual(listFrameResult.json.result.items.map((item) => item.id), [ids.activeFrame]);

  for (const operationId of [caseRequest.operation_id, frameRequest.operation_id]) {
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
  assertInvalid(await invoke(connector, cwd, historicalFrame), "frame", "request.revision_id");

  const includeClosed = frameList(storePath, report.sqlite_binary, initialized);
  includeClosed.include_closed = true;
  assertInvalid(await invoke(connector, cwd, includeClosed), "frame", "request.include_closed");

  const laterCreate = caseCreate(storePath, report.sqlite_binary, initialized, {
    operationId: `operation:w04-${generated.target}-invalid-case`,
  });
  laterCreate.include = ["history"];
  assertInvalid(await invoke(connector, cwd, laterCreate), "case", "request.include");

  const dependencyCreate = frameCreate(storePath, report.sqlite_binary, initialized, {
    frameId: ids.secondActiveFrame,
    discoveryId: ids.secondActiveDiscovery,
    operationId: `operation:w04-${generated.target}-invalid-dependency`,
    discoveryOverrides: { dependencies: [{ target_kind: "case", target_id: ids.case, predicate: "depends-on" }] },
  });
  assertInvalid(
    await invoke(connector, cwd, dependencyCreate),
    "frame",
    "frame.discovery[0].dependencies",
    "dependencies_unsupported_until_l03",
  );
  assert.deepEqual(await ownerFacts(report.sqlite_binary, storePath), [
    { owner_kind: "case", owner_id: ids.case, revision_number: 1 },
    { owner_kind: "frame", owner_id: ids.activeFrame, revision_number: 1 },
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
