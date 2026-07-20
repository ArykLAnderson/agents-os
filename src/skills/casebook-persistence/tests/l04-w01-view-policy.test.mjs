import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  cleanupSandbox,
  generateAndValidateSandbox,
  selectCompatibleSqliteBinary,
} from "./sandbox-harness.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceEntrypoint = path.join(packageRoot, "variants/sqlite/bin/casebook-persistence.mjs");
const protocol = { id: "casebook-persistence-json", version: 1 };
const ids = Object.freeze({
  view: "view:11111111-1111-4111-8111-111111111111",
  policy1: "view-policy:21111111-1111-4111-8111-111111111111",
  policy2: "view-policy:31111111-1111-4111-8111-111111111111",
  case: "case:41111111-1111-4111-8111-111111111111",
});
const authorityClaim = Object.freeze({
  human_authorized: true,
  acting_role: "architect",
  authority_basis: "explicit disposable L04-W01 view-policy lifecycle authorization",
});

function invoke(entrypoint, cwd, request) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [entrypoint], {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 4 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? "", HOME: cwd },
    }, (error, stdout, stderr) => resolve({
      code: error ? 2 : 0,
      json: stdout ? JSON.parse(stdout) : {},
      stderr,
    }));
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

async function sqlite(state, sql) {
  return new Promise((resolve, reject) => execFile(
    state.sqliteBinary,
    ["-batch", "-bail", "-json", state.store, sql],
    { encoding: "utf8" },
    (error, stdout, stderr) => error ? reject(new Error(stderr || error.message)) : resolve(JSON.parse(stdout || "[]")),
  ));
}

async function setup(entrypoint = sourceEntrypoint, label = "source") {
  const root = await mkdtemp(path.join(os.tmpdir(), `casebook-l04-w01-${label}-`));
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const store = path.join(root, "store.sqlite3");
  const configuration = {
    source: { kind: "synthetic-test", locator: `l04-w01:${label}` },
    authority_mode: "sqlite",
    sqlite: { database_url: store, sqlite_bin: sqliteBinary },
  };
  const initialized = await invoke(entrypoint, root, {
    protocol,
    operation: "initialize_store",
    operation_id: `operation:l04-w01:${label}:initialize`,
    authority_claim: authorityClaim,
    configuration,
  });
  assert.equal(initialized.code, 0, initialized.stderr || JSON.stringify(initialized.json));
  return {
    root,
    store,
    sqliteBinary,
    configuration,
    initialization: initialized.json.result.initialization,
    entrypoint,
  };
}

function context(state, purpose, view = state.initialization.view.id, revision = state.initialization.view.policy_revision_id) {
  return {
    view_id: view,
    view_policy_revision_id: revision,
    purpose,
    requested_audience_ceiling: "private",
  };
}

function policy(state, revisionId, overrides = {}) {
  return {
    view_id: ids.view,
    view_policy_revision_id: revisionId,
    home_namespace_id: state.initialization.namespace.id,
    audience_ceiling: "private",
    namespace_ids: [state.initialization.namespace.id],
    object_kinds: ["case", "frame"],
    limits: { max_results: 25, max_traversal_depth: 3 },
    store_operation_receipts_visible: true,
    ...overrides,
  };
}

function lifecycleRequest(state, operation, operationId, fields = {}) {
  return {
    protocol,
    operation,
    request_version: 1,
    operation_id: operationId,
    store_id: state.initialization.store_id,
    context: context(state, operation),
    authority_claim: authorityClaim,
    configuration: state.configuration,
    ...fields,
  };
}

function caseRead(state, revisionId) {
  return {
    protocol,
    operation: "case.read",
    request_version: 1,
    store_id: state.initialization.store_id,
    context: context(state, "verify exact active structural disclosure", ids.view, revisionId),
    case_id: ids.case,
    configuration: state.configuration,
  };
}

function caseCreate(state, revisionId, operationId) {
  return {
    protocol,
    operation: "case.create",
    request_version: 1,
    operation_id: operationId,
    store_id: state.initialization.store_id,
    context: context(state, "verify exact active structural disclosure", ids.view, revisionId),
    expected_revision: 0,
    commit_basis: "synthetic view lifecycle evidence",
    provenance: { acting_role: "case", authority_basis: "synthetic semantic claim only" },
    case: {
      id: ids.case,
      home_namespace_id: state.initialization.namespace.id,
      state: "active",
      title: "Policy lifecycle evidence",
      summary: "Structural disclosure does not decide semantic meaning.",
      scope: "Disposable L04-W01 authority only.",
    },
    configuration: state.configuration,
  };
}

async function createActivateReviseRetire(state, prefix) {
  const created = await invoke(state.entrypoint, state.root, lifecycleRequest(
    state,
    "view_policy.create",
    `operation:${prefix}:create`,
    { policy: policy(state, ids.policy1) },
  ));
  assert.equal(created.code, 0, created.stderr || JSON.stringify(created.json));
  assert.equal(created.json.result.policy.lifecycle, "created");
  assert.equal(created.json.result.policy.revision_number, 1);

  const unactivated = await invoke(state.entrypoint, state.root, caseCreate(state, ids.policy1, `operation:${prefix}:unactivated-case`));
  assert.equal(unactivated.code, 2);
  assert.equal(unactivated.json.failure.code, "case.view_invalid_or_unavailable");

  const activated = await invoke(state.entrypoint, state.root, lifecycleRequest(
    state,
    "view_policy.activate",
    `operation:${prefix}:activate-1`,
    { view_id: ids.view, view_policy_revision_id: ids.policy1 },
  ));
  assert.equal(activated.code, 0, activated.stderr || JSON.stringify(activated.json));
  assert.equal(activated.json.result.policy.lifecycle, "active");
  assert.equal(activated.json.result.policy.activation_fence, activated.json.result.receipt.operation_fence);

  const committed = await invoke(state.entrypoint, state.root, caseCreate(state, ids.policy1, `operation:${prefix}:case`));
  assert.equal(committed.code, 0, committed.stderr || JSON.stringify(committed.json));

  const revised = await invoke(state.entrypoint, state.root, lifecycleRequest(
    state,
    "view_policy.revise",
    `operation:${prefix}:revise`,
    {
      predecessor_revision_id: ids.policy1,
      policy: policy(state, ids.policy2, { object_kinds: ["case"], limits: { max_results: 10, max_traversal_depth: 1 } }),
    },
  ));
  assert.equal(revised.code, 0, revised.stderr || JSON.stringify(revised.json));
  assert.equal(revised.json.result.policy.lifecycle, "created");
  assert.equal(revised.json.result.policy.revision_number, 2);
  assert.equal(revised.json.result.policy.predecessor_revision_id, ids.policy1);

  const beforeActivation = await invoke(state.entrypoint, state.root, caseRead(state, ids.policy2));
  assert.equal(beforeActivation.code, 2);
  assert.equal(beforeActivation.json.failure.code, "case.view_invalid_or_unavailable");

  const activatedRevision = await invoke(state.entrypoint, state.root, lifecycleRequest(
    state,
    "view_policy.activate",
    `operation:${prefix}:activate-2`,
    { view_id: ids.view, view_policy_revision_id: ids.policy2 },
  ));
  assert.equal(activatedRevision.code, 0, activatedRevision.stderr || JSON.stringify(activatedRevision.json));
  assert.equal(activatedRevision.json.result.superseded_revision_id, ids.policy1);

  const stale = await invoke(state.entrypoint, state.root, caseRead(state, ids.policy1));
  assert.equal(stale.code, 2);
  assert.equal(stale.json.failure.code, "case.view_invalid_or_unavailable");
  assert.deepEqual(stale.json.failure.evidence, {});

  const exact = await invoke(state.entrypoint, state.root, caseRead(state, ids.policy2));
  assert.equal(exact.code, 0, exact.stderr || JSON.stringify(exact.json));
  assert.equal(exact.json.result.applied_view.view_policy_revision_id, ids.policy2);

  const retired = await invoke(state.entrypoint, state.root, lifecycleRequest(
    state,
    "view_policy.retire",
    `operation:${prefix}:retire`,
    { view_id: ids.view, view_policy_revision_id: ids.policy2 },
  ));
  assert.equal(retired.code, 0, retired.stderr || JSON.stringify(retired.json));
  assert.equal(retired.json.result.policy.lifecycle, "retired");
  assert.equal(retired.json.result.policy.retirement_fence, retired.json.result.receipt.operation_fence);

  const afterRetirement = await invoke(state.entrypoint, state.root, caseRead(state, ids.policy2));
  assert.equal(afterRetirement.code, 2);
  assert.equal(afterRetirement.json.failure.code, "case.view_invalid_or_unavailable");
  assert.deepEqual(afterRetirement.json.failure.evidence, {});

  return { created, activated, revised, activatedRevision, retired };
}

test("authorized immutable view policies fail closed before activation, after supersession, and after retirement", async () => {
  const state = await setup();
  try {
    const results = await createActivateReviseRetire(state, "l04-w01");
    const rows = await sqlite(state, `
      SELECT view_policy_revision_id, revision_number, lifecycle, object_kinds_json,
        limits_json, predecessor_revision_id, activation_fence, superseded_fence, retirement_fence
      FROM view_policy_revisions WHERE view_id = '${ids.view}' ORDER BY revision_number;
    `);
    assert.deepEqual(rows.map((row) => row.lifecycle), ["superseded", "retired"]);
    assert.equal(rows[0].object_kinds_json, '["case","frame"]');
    assert.equal(rows[0].limits_json, '{"max_results":25,"max_traversal_depth":3}');
    assert.equal(rows[0].superseded_fence, results.activatedRevision.json.result.receipt.operation_fence);
    assert.equal(rows[1].retirement_fence, results.retired.json.result.receipt.operation_fence);
    await assert.rejects(sqlite(state, `UPDATE view_policy_revisions SET limits_json='{"max_results":999,"max_traversal_depth":9}' WHERE view_policy_revision_id='${ids.policy1}'`));
    await assert.rejects(sqlite(state, `UPDATE view_policy_namespace_grants SET namespace_id='${state.initialization.namespace.id}' WHERE view_policy_revision_id='${ids.policy1}'`));
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("view-policy changes require explicit human authorization, exact predecessors, and idempotent receipts", async () => {
  const state = await setup();
  try {
    const unauthorized = lifecycleRequest(state, "view_policy.create", "operation:l04-w01:unauthorized", { policy: policy(state, ids.policy1) });
    delete unauthorized.authority_claim;
    const rejected = await invoke(state.entrypoint, state.root, unauthorized);
    assert.equal(rejected.code, 2);
    assert.equal(rejected.json.failure.code, "human_authority_claim_required");
    assert.equal((await sqlite(state, `SELECT count(*) AS count FROM view_families WHERE view_id='${ids.view}'`))[0].count, 0);

    const request = lifecycleRequest(state, "view_policy.create", "operation:l04-w01:idempotent-create", { policy: policy(state, ids.policy1) });
    const first = await invoke(state.entrypoint, state.root, request);
    assert.equal(first.code, 0, first.stderr || JSON.stringify(first.json));
    const replay = await invoke(state.entrypoint, state.root, request);
    assert.equal(replay.code, 0, replay.stderr || JSON.stringify(replay.json));
    assert.equal(replay.json.result.idempotent_replay, true);
    assert.equal(replay.json.result.policy.view_policy_revision_id, ids.policy1);
    assert.equal((await sqlite(state, `SELECT count(*) AS count FROM view_policy_revisions WHERE view_id='${ids.view}'`))[0].count, 1);

    const mismatch = structuredClone(request);
    mismatch.policy.limits.max_results = 24;
    const mismatched = await invoke(state.entrypoint, state.root, mismatch);
    assert.equal(mismatched.code, 2);
    assert.equal(mismatched.json.failure.code, "idempotency_mismatch");

    const widened = structuredClone(request);
    widened.semantic_authority = true;
    widened.operation_id = "operation:l04-w01:unsupported-authority";
    const widenedResult = await invoke(state.entrypoint, state.root, widened);
    assert.equal(widenedResult.code, 2);
    assert.equal(widenedResult.json.failure.code, "view_policy_invalid");

    const wrongPredecessor = await invoke(state.entrypoint, state.root, lifecycleRequest(
      state,
      "view_policy.revise",
      "operation:l04-w01:wrong-predecessor",
      { predecessor_revision_id: state.initialization.view.policy_revision_id, policy: policy(state, ids.policy2) },
    ));
    assert.equal(wrongPredecessor.code, 2);
    assert.equal(wrongPredecessor.json.failure.code, "view_policy_revision_conflict");
    assert.equal((await sqlite(state, `SELECT count(*) AS count FROM view_policy_revisions WHERE view_id='${ids.view}'`))[0].count, 1);
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("retiring the final active policy leaves a healthy but fail-closed store", async () => {
  const state = await setup();
  try {
    const retired = await invoke(state.entrypoint, state.root, lifecycleRequest(
      state,
      "view_policy.retire",
      "operation:l04-w01:retire-final",
      {
        view_id: state.initialization.view.id,
        view_policy_revision_id: state.initialization.view.policy_revision_id,
      },
    ));
    assert.equal(retired.code, 0, retired.stderr || JSON.stringify(retired.json));
    assert.equal(retired.json.result.policy.lifecycle, "retired");
    const row = (await sqlite(state, `SELECT lifecycle,retirement_fence FROM view_policy_revisions WHERE view_policy_revision_id='${state.initialization.view.policy_revision_id}'`))[0];
    assert.equal(row.lifecycle, "retired");
    assert.equal(row.retirement_fence, retired.json.result.receipt.operation_fence);

    const staleRead = await invoke(state.entrypoint, state.root, {
      protocol,
      operation: "case.read",
      request_version: 1,
      store_id: state.initialization.store_id,
      context: context(state, "retired final policy must fail closed"),
      case_id: ids.case,
      configuration: state.configuration,
    });
    assert.equal(staleRead.code, 2);
    assert.equal(staleRead.json.failure.code, "case.view_invalid_or_unavailable");

    const staleOperation = await invoke(state.entrypoint, state.root, lifecycleRequest(
      state,
      "view_policy.create",
      "operation:l04-w01:after-final-retirement",
      { policy: policy(state, ids.policy1) },
    ));
    assert.equal(staleOperation.code, 2);
    assert.equal(staleOperation.json.failure.code, "view_invalid");
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("retired policy receipts remain interpretable only through another exact active operational view", async () => {
  const state = await setup();
  try {
    await createActivateReviseRetire(state, "l04-w01-receipt");
    const lookup = await invoke(state.entrypoint, state.root, {
      protocol,
      operation: "get_store_operation_receipt",
      operation_id: "operation:l04-w01-receipt:retire",
      store_id: state.initialization.store_id,
      authority_claim: authorityClaim,
      context: context(state, "historical view-policy receipt recovery"),
      configuration: state.configuration,
    });
    assert.equal(lookup.code, 0, lookup.stderr || JSON.stringify(lookup.json));
    assert.equal(lookup.json.result.status, "settled");
    assert.equal(lookup.json.result.receipt.operation_kind, "view_policy.retire");

    const retiredLookup = await invoke(state.entrypoint, state.root, {
      protocol,
      operation: "get_store_operation_receipt",
      operation_id: "operation:l04-w01-receipt:retire",
      store_id: state.initialization.store_id,
      authority_claim: authorityClaim,
      context: context(state, "stale lookup must fail closed", ids.view, ids.policy2),
      configuration: state.configuration,
    });
    assert.equal(retiredLookup.code, 0);
    assert.equal(retiredLookup.json.result.status, "not_visible");
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("generated Pi, Codex, and OpenCode copies enforce the same exact-active lifecycle and clean up", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "casebook-l04-w01-generated-"));
  try {
    const generated = await generateAndValidateSandbox({ sandboxRoot: sandbox });
    for (const item of generated.results) {
      const entrypoint = path.join(item.package_root, "variants/sqlite/bin/casebook-persistence.mjs");
      const state = await setup(entrypoint, item.target);
      try {
        await createActivateReviseRetire(state, `l04-w01-${item.target}`);
      } finally {
        await rm(state.root, { recursive: true, force: true });
      }
    }
  } finally {
    assert.equal(await cleanupSandbox(sandbox), true);
    assert.equal(await stat(sandbox).then(() => true).catch(() => false), false);
  }
});
