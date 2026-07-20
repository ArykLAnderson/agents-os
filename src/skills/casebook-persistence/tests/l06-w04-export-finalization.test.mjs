import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mechanicalDigest } from "../variants/sqlite/lib/substrate/mechanical.mjs";
import { selectCompatibleSqliteBinary } from "./sandbox-harness.mjs";

const entrypoint = new URL("../variants/sqlite/bin/casebook-persistence.mjs", import.meta.url).pathname;
const protocol = { id: "casebook-persistence-json", version: 1 };
const caseId = "case:5d75df97-edb9-452c-bbac-a0f2617848b8";

function invoke(cwd, request, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [entrypoint], {
      cwd,
      env: { PATH: process.env.PATH ?? "", HOME: cwd, ...extraEnv },
      maxBuffer: 4 * 1024 * 1024,
    }, (error, stdout, stderr) => {
      let json = null;
      try { json = stdout ? JSON.parse(stdout) : null; } catch { /* interruption can leave no response */ }
      resolve({ code: error ? (error.signal ?? error.code ?? 2) : 0, json, stderr });
    });
    child.stdin.end(JSON.stringify(request));
  });
}

async function exists(value) {
  return stat(value).then(() => true).catch(() => false);
}

async function setup(label) {
  const root = await mkdtemp(path.join(os.tmpdir(), `casebook-l06-w04-${label}-`));
  const sqliteBin = await selectCompatibleSqliteBinary();
  const store = path.join(root, "store.db");
  const configuration = {
    source: { kind: "test", locator: "l06-w04" },
    authority_mode: "sqlite",
    sqlite: { database_url: store, sqlite_bin: sqliteBin },
  };
  const initialized = await invoke(root, {
    protocol,
    operation: "initialize_store",
    operation_id: `operation:l06-w04:${label}:init`,
    authority_claim: { human_authorized: true, acting_role: "test", authority_basis: "disposable export finalization" },
    configuration,
  });
  assert.equal(initialized.code, 0, initialized.stderr);
  const initialization = initialized.json.result.initialization;
  const common = {
    protocol,
    request_version: 1,
    store_id: initialization.store_id,
    context: {
      view_id: initialization.view.id,
      view_policy_revision_id: initialization.view.policy_revision_id,
      purpose: "authorized private bundle finalization",
      requested_audience_ceiling: "private",
    },
    configuration,
  };
  const created = await invoke(root, {
    ...common,
    operation: "case.create",
    operation_id: `operation:l06-w04:${label}:case`,
    expected_revision: 0,
    commit_basis: "L06-W04 fixture",
    provenance: { acting_role: "case", authority_basis: "synthetic" },
    case: {
      id: caseId,
      home_namespace_id: initialization.namespace.id,
      state: "active",
      title: "Finalization fixture",
      summary: "Private verified export material",
      scope: "L06-W04",
      aliases: [], facets: [], entries: [], sources: [], relationships: [], references: [],
    },
  });
  assert.equal(created.code, 0, created.stderr || JSON.stringify(created.json));
  const destination = {
    classification: "private_inspection",
    temporary_path: path.join(root, "bundle.preflight"),
    final_path: path.join(root, "bundle.final"),
  };
  const preflight = await invoke(root, {
    ...common,
    operation: "export.preflight",
    operation_id: `operation:l06-w04:${label}:preflight`,
    authority_claim: { human_authorized: true, acting_role: "architect", authority_basis: "private preflight only" },
    mode: "current",
    audience: "private",
    destination,
    owners: [{ kind: "case", id: caseId, requirement: "required", evidence_selection: [] }],
  });
  assert.equal(preflight.code, 0, preflight.stderr || JSON.stringify(preflight.json));
  assert.equal(preflight.json.result.status, "ready");
  return { root, sqliteBin, store, initialization, common, destination, preflight: preflight.json.result };
}

function finalizeRequest(state, operationId) {
  return {
    ...state.common,
    operation: "export.finalize",
    operation_id: operationId,
    authority_claim: {
      human_authorized: true,
      acting_role: "architect",
      authority_basis: "finalize this exact verified private bundle, not publish it",
    },
    destination: state.destination,
    expected: {
      observation_fence: state.preflight.observation_fence,
      manifest_digest: state.preflight.manifest.digest,
      bundle_digest: state.preflight.bundle.digest,
      destination_digest: mechanicalDigest(state.destination),
    },
  };
}

async function ownerCounts(state) {
  return new Promise((resolve, reject) => execFile(state.sqliteBin, ["-batch", "-noheader", state.store,
    "SELECT (SELECT count(*) FROM owner_revisions)||'|'||(SELECT count(*) FROM owner_events);"],
  { encoding: "utf8" }, (error, stdout, stderr) => error ? reject(new Error(stderr)) : resolve(stdout.trim())));
}

function receiptLookup(state, operationId) {
  return {
    protocol,
    operation: "get_store_operation_receipt",
    operation_id: operationId,
    store_id: state.initialization.store_id,
    authority_claim: { human_authorized: true, acting_role: "architect", authority_basis: "recover exact finalization receipt" },
    context: { ...state.common.context, purpose: "receipt-first export recovery" },
    configuration: state.common.configuration,
  };
}

test("authorized finalization verifies all bindings, atomically renames the private bundle, and exposes a durable non-publication receipt", async () => {
  const state = await setup("atomic");
  try {
    const operationId = "operation:l06-w04:atomic:finalize";
    const before = await ownerCounts(state);
    const result = await invoke(state.root, finalizeRequest(state, operationId));
    assert.equal(result.code, 0, result.stderr || JSON.stringify(result.json));
    assert.equal(result.json.result.terminal.outcome, "finalized");
    assert.equal(result.json.result.finalization.atomicity, "atomic_rename");
    assert.equal(result.json.result.finalization.recovered_after_interruption, false);
    assert.equal(result.json.result.bindings.operation_id, operationId);
    assert.equal(result.json.result.bindings.view_policy_revision_id, state.common.context.view_policy_revision_id);
    assert.equal(result.json.result.bindings.observation_fence, state.preflight.observation_fence);
    assert.equal(result.json.result.bindings.manifest_digest, state.preflight.manifest.digest);
    assert.equal(result.json.result.bindings.bundle_digest, state.preflight.bundle.digest);
    assert.equal(result.json.result.bindings.destination_digest, mechanicalDigest(state.destination));
    assert.equal(result.json.result.authority.publication, "not_granted");
    assert.equal(result.json.result.authority.canonical_mutation, "not_granted");
    assert.equal(result.json.result.canonical_owner_mutation_performed, false);
    assert.equal(result.json.result.publication_performed, false);
    assert.equal(await exists(state.destination.temporary_path), false);
    assert.equal(await exists(state.destination.final_path), true);
    assert.deepEqual(JSON.parse(await readFile(path.join(state.destination.final_path, "manifest.json"), "utf8")), state.preflight.manifest);
    assert.equal(await ownerCounts(state), before);

    const lookup = await invoke(state.root, receiptLookup(state, operationId));
    assert.equal(lookup.code, 0, lookup.stderr || JSON.stringify(lookup.json));
    assert.equal(lookup.json.result.status, "settled");
    assert.equal(lookup.json.result.receipt.operation_kind, "export.finalize");
    assert.equal(lookup.json.result.receipt.result.terminal.outcome, "finalized");

    const replay = await invoke(state.root, finalizeRequest(state, operationId));
    assert.equal(replay.code, 0, replay.stderr || JSON.stringify(replay.json));
    assert.equal(replay.json.result.idempotent_replay, true);
    assert.equal(replay.json.result.receipt.operation_id, operationId);
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("an interruption after atomic rename recovers from the operation-bound final marker and settles exactly one replayable receipt", async () => {
  const state = await setup("interrupt");
  try {
    const operationId = "operation:l06-w04:interrupt:finalize";
    const request = finalizeRequest(state, operationId);
    const interrupted = await invoke(state.root, request, { CASEBOOK_PERSISTENCE_TEST_FAULT: "export_after_rename_before_receipt" });
    assert.notEqual(interrupted.code, 0);
    assert.equal(interrupted.json, null);
    assert.equal(await exists(state.destination.temporary_path), false);
    assert.equal(await exists(state.destination.final_path), true);

    const absent = await invoke(state.root, receiptLookup(state, operationId));
    assert.equal(absent.json.result.status, "absent_at_fence");

    const recovered = await invoke(state.root, request);
    assert.equal(recovered.code, 0, recovered.stderr || JSON.stringify(recovered.json));
    assert.equal(recovered.json.result.terminal.outcome, "finalized");
    assert.equal(recovered.json.result.finalization.recovered_after_interruption, true);
    assert.equal(recovered.json.result.idempotent_replay, false);
    assert.equal(await exists(state.destination.temporary_path), false);

    const replay = await invoke(state.root, request);
    assert.equal(replay.code, 0, replay.stderr || JSON.stringify(replay.json));
    assert.equal(replay.json.result.idempotent_replay, true);
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("an existing invalid unmarked final directory remains recovery-required without settling a no-effect receipt", async () => {
  const state = await setup("invalid-unmarked-final");
  try {
    const operationId = "operation:l06-w04:invalid-unmarked-final:finalize";
    await mkdir(state.destination.final_path);
    await writeFile(path.join(state.destination.final_path, "manifest.json"), "{}\n");

    const result = await invoke(state.root, finalizeRequest(state, operationId));
    assert.equal(result.code, 2);
    assert.equal(result.json.failure.code, "export.final_verification_failed");
    assert.equal(result.json.failure.retry_disposition, "after_operator_repair");
    assert.equal(result.json.failure.evidence.recovery_required, true);
    assert.equal(result.json.failure.evidence.temporary_output_path, state.destination.temporary_path);
    assert.equal(result.json.failure.evidence.final_output_path, state.destination.final_path);
    assert.equal(await exists(state.destination.temporary_path), true);
    assert.equal(await exists(state.destination.final_path), true);
    assert.equal(await exists(path.join(state.destination.final_path, ".casebook-finalization.json")), false);

    const absent = await invoke(state.root, receiptLookup(state, operationId));
    assert.equal(absent.json.result.status, "absent_at_fence");
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("post-rename corruption remains truthful recovery-required state across retry without a no-effect receipt", async () => {
  const state = await setup("corrupt-after-rename");
  try {
    const operationId = "operation:l06-w04:corrupt-after-rename:finalize";
    const request = finalizeRequest(state, operationId);
    const corrupted = await invoke(state.root, request, { CASEBOOK_PERSISTENCE_TEST_FAULT: "export_corrupt_after_rename" });
    assert.equal(corrupted.code, 2);
    assert.equal(corrupted.json.failure.code, "export.final_verification_failed");
    assert.equal(corrupted.json.failure.retry_disposition, "after_operator_repair");
    assert.equal(corrupted.json.failure.evidence.temporary_output_path, state.destination.temporary_path);
    assert.equal(corrupted.json.failure.evidence.final_output_path, state.destination.final_path);
    assert.equal(await exists(state.destination.temporary_path), false);
    assert.equal(await exists(state.destination.final_path), true);

    const absent = await invoke(state.root, receiptLookup(state, operationId));
    assert.equal(absent.json.result.status, "absent_at_fence");

    const retry = await invoke(state.root, request);
    assert.equal(retry.code, 2);
    assert.equal(retry.json.failure.code, "export.final_verification_failed");
    assert.equal(retry.json.failure.evidence.temporary_output_path, state.destination.temporary_path);
    assert.equal(retry.json.failure.evidence.final_output_path, state.destination.final_path);
    const stillAbsent = await invoke(state.root, receiptLookup(state, operationId));
    assert.equal(stillAbsent.json.result.status, "absent_at_fence");
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("an interruption after binding intent resumes from the private temporary output and cleans it through atomic completion", async () => {
  const state = await setup("intent-interrupt");
  try {
    const operationId = "operation:l06-w04:intent-interrupt:finalize";
    const request = finalizeRequest(state, operationId);
    const interrupted = await invoke(state.root, request, { CASEBOOK_PERSISTENCE_TEST_FAULT: "export_after_intent_before_rename" });
    assert.notEqual(interrupted.code, 0);
    assert.equal(await exists(path.join(state.destination.temporary_path, ".casebook-finalization.json")), true);
    assert.equal(await exists(state.destination.final_path), false);

    const recovered = await invoke(state.root, request);
    assert.equal(recovered.code, 0, recovered.stderr || JSON.stringify(recovered.json));
    assert.equal(recovered.json.result.terminal.outcome, "finalized");
    assert.equal(recovered.json.result.finalization.recovered_after_interruption, true);
    assert.equal(await exists(state.destination.temporary_path), false);
    assert.equal(await exists(state.destination.final_path), true);
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("non-atomic destinations and digest mismatches settle explicitly before effect and clean private temporary output", async () => {
  for (const [label, mutate, fault, expectedCode] of [
    ["non-atomic", () => {}, { CASEBOOK_PERSISTENCE_TEST_FAULT: "export_force_non_atomic_destination" }, "non_atomic_destination_requires_separate_authorization"],
    ["destination-digest", (request) => { request.expected.destination_digest = "0".repeat(64); }, {}, "destination_digest_mismatch"],
  ]) {
    const state = await setup(label);
    try {
      const operationId = `operation:l06-w04:${label}:finalize`;
      const request = finalizeRequest(state, operationId);
      mutate(request);
      const result = await invoke(state.root, request, fault);
      assert.equal(result.code, 0, result.stderr || JSON.stringify(result.json));
      assert.equal(result.json.result.terminal.outcome, "blocked");
      assert.equal(result.json.result.terminal.code, expectedCode);
      assert.equal(result.json.result.finalization.effect_performed, false);
      assert.equal(result.json.result.finalization.temporary_output.cleaned, true);
      assert.equal(result.json.result.publication_performed, false);
      assert.equal(await exists(state.destination.temporary_path), false);
      assert.equal(await exists(state.destination.final_path), false);
      const lookup = await invoke(state.root, receiptLookup(state, operationId));
      assert.equal(lookup.json.result.status, "settled");
      assert.equal(lookup.json.result.receipt.result.terminal.code, expectedCode);
    } finally {
      await rm(state.root, { recursive: true, force: true });
    }
  }
});
