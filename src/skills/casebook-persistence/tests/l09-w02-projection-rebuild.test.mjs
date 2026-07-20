import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
const projectionKinds = ["lexical", "reverse_reference", "staleness", "attention"];
const caseA = "case:4f868e5c-91ee-4a2b-b4d0-851ac72a8da2";
const caseB = "case:49f65089-ed94-4624-85a8-5f297979d197";

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

function configuration(storePath, sqliteBinary, label) {
  return {
    source: { kind: "synthetic-test", locator: `l09-w02-disposable:${label}` },
    authority_mode: "sqlite",
    sqlite: { database_url: storePath, sqlite_bin: sqliteBinary },
  };
}

async function rows(sqliteBinary, storePath, sql) {
  const { stdout } = await execFileWithInput(sqliteBinary, ["-batch", "-bail", "-json", storePath], { encoding: "utf8" }, sql);
  return JSON.parse(stdout || "[]");
}

async function row(sqliteBinary, storePath, sql) {
  return (await rows(sqliteBinary, storePath, sql))[0];
}

async function canonicalDigest(sqliteBinary, storePath) {
  const sql = [
    "SELECT * FROM owners ORDER BY owner_id;",
    "SELECT * FROM owner_family_bindings ORDER BY family_id;",
    "SELECT * FROM owner_versions ORDER BY version_id;",
    "SELECT * FROM owner_revisions ORDER BY revision_id;",
    "SELECT * FROM owner_revision_selections ORDER BY revision_id,family_id;",
    "SELECT * FROM owner_current ORDER BY owner_id;",
    "SELECT * FROM owner_events ORDER BY commit_sequence,event_id;",
    "SELECT * FROM owner_outbox ORDER BY outbox_id;",
  ].join("\n");
  const { stdout } = await execFileWithInput(sqliteBinary, ["-batch", "-bail", "-json", storePath], { encoding: "utf8" }, sql);
  return createHash("sha256").update(stdout).digest("hex");
}

function caseRecord(id, namespaceId, title, references = []) {
  return {
    id,
    home_namespace_id: namespaceId,
    state: "active",
    title,
    summary: `${title} summary for lexical projection`,
    scope: "synthetic L09-W02 projection fixture",
    aliases: [], facets: [], entries: [], sources: [], relationships: [], references,
  };
}

async function makeFixture(entrypoint, root, sqliteBinary, label, { staleReference = true } = {}) {
  const storePath = path.join(root, `${label}.sqlite3`);
  const config = configuration(storePath, sqliteBinary, label);
  const initialized = await invoke(entrypoint, root, {
    protocol,
    operation: "initialize_store",
    operation_id: `operation:${label}:initialize`,
    authority_claim: { human_authorized: true, acting_role: "architect", authority_basis: "synthetic L09-W02 fixture" },
    configuration: config,
  });
  assert.equal(initialized.code, 0, initialized.stderr || JSON.stringify(initialized.json));
  const initialization = initialized.json.result.initialization;
  const context = {
    view_id: initialization.view.id,
    view_policy_revision_id: initialization.view.policy_revision_id,
    purpose: "build disposable projections from one exact canonical fence",
    requested_audience_ceiling: "private",
  };
  const createA = await invoke(entrypoint, root, {
    protocol, operation: "case.create", request_version: 1,
    operation_id: `operation:${label}:case-a-create`, store_id: initialization.store_id,
    context, expected_revision: 0, commit_basis: "create reference target",
    provenance: { acting_role: "case-reconcile", authority_basis: "synthetic projection fixture" },
    case: caseRecord(caseA, initialization.namespace.id, "Projection target alpha"), configuration: config,
  });
  assert.equal(createA.code, 0, createA.stderr || JSON.stringify(createA.json));
  const observedRevision = createA.json.result.revision.id;
  const createB = await invoke(entrypoint, root, {
    protocol, operation: "case.create", request_version: 1,
    operation_id: `operation:${label}:case-b-create`, store_id: initialization.store_id,
    context, expected_revision: 0, commit_basis: "create reverse reference source",
    provenance: { acting_role: "case-reconcile", authority_basis: "synthetic projection fixture" },
    case: caseRecord(caseB, initialization.namespace.id, "Projection dependent beta", [{
      target_kind: "case", target_id: caseA, observed_revision_id: observedRevision,
      predicate: "depends_on", visibility: "private",
    }]),
    configuration: config,
  });
  assert.equal(createB.code, 0, createB.stderr || JSON.stringify(createB.json));
  if (staleReference) {
    const reviseA = await invoke(entrypoint, root, {
      protocol, operation: "case.commit_revision", request_version: 1,
      operation_id: `operation:${label}:case-a-revise`, store_id: initialization.store_id,
      context, expected_revision: 1, commit_basis: "advance target after dependent observation",
      provenance: { acting_role: "case-reconcile", authority_basis: "synthetic staleness fixture" },
      case: caseRecord(caseA, initialization.namespace.id, "Projection target alpha revised"), configuration: config,
    });
    assert.equal(reviseA.code, 0, reviseA.stderr || JSON.stringify(reviseA.json));
  }
  const fence = (await row(sqliteBinary, storePath, "SELECT operation_fence FROM store_fence WHERE singleton=1;")).operation_fence;
  return { label, storePath, config, initialization, context, fence };
}

function rebuildRequest(fixture, operationSuffix, fence = fixture.fence) {
  return {
    protocol,
    operation: "projection.rebuild",
    request_version: 1,
    operation_id: `operation:${fixture.label}:projection:${operationSuffix}`,
    store_id: fixture.initialization.store_id,
    context: fixture.context,
    authority_claim: {
      human_authorized: true,
      acting_role: "projection-operator",
      authority_basis: "replace disposable projections only",
      human_confirmation_reference: `test-confirmation:${fixture.label}:${operationSuffix}`,
    },
    safety: { store_class: "disposable", authorization_reference: `disposable-authorization:${fixture.label}` },
    projection_kinds: projectionKinds,
    canonical_fence: fence,
    canonical_state_effect: "none",
    requested_postcondition_evidence: [
      "source_fence", "projection_digest", "verification", "atomic_selection", "canonical_state_unchanged",
    ],
    configuration: fixture.config,
  };
}

async function exerciseSuccessfulRebuild(entrypoint, root, sqliteBinary, label) {
  const fixture = await makeFixture(entrypoint, root, sqliteBinary, label);
  const request = rebuildRequest(fixture, "success");
  const beforeCanonical = await canonicalDigest(sqliteBinary, fixture.storePath);
  const rebuilt = await invoke(entrypoint, root, request);
  assert.equal(rebuilt.code, 0, rebuilt.stderr || JSON.stringify(rebuilt.json));
  assert.equal(rebuilt.json.result.status, "settled");
  assert.deepEqual(rebuilt.json.result.terminal, {
    outcome: "rebuilt",
    code: "projection_rebuild_completed",
    failure_class: null,
    retry_disposition: "never",
    canonical_state_effect: "none",
    projection_state: "current",
  });
  assert.deepEqual(rebuilt.json.result.projection.kinds, projectionKinds);
  assert.match(rebuilt.json.result.projection.generation_id, /^projection-generation:[0-9a-f-]{36}$/);
  assert.match(rebuilt.json.result.projection.digest, /^[0-9a-f]{64}$/);
  assert.equal(rebuilt.json.result.projection.verified, true);
  assert.ok(rebuilt.json.result.projection.entry_counts.lexical >= 2);
  assert.ok(rebuilt.json.result.projection.entry_counts.reverse_reference >= 1);
  assert.ok(rebuilt.json.result.projection.entry_counts.staleness >= 1);
  assert.ok(rebuilt.json.result.projection.entry_counts.attention >= 1);
  assert.deepEqual(rebuilt.json.result.fence_evidence, {
    canonical_source_fence: fixture.fence,
    selection_precondition_fence: fixture.fence,
    receipt_fence: fixture.fence + 1,
    one_canonical_fence: true,
    canonical_owner_records_events_unchanged: true,
  });
  assert.equal(rebuilt.json.result.selection.atomic, true);
  assert.equal(rebuilt.json.result.selection.previous_generation_id, null);
  assert.equal(rebuilt.json.result.receipt.operation_kind, "projection_rebuild");
  assert.equal(rebuilt.json.result.receipt.operation_fence, fixture.fence + 1);
  assert.equal(await canonicalDigest(sqliteBinary, fixture.storePath), beforeCanonical);

  const selected = await row(sqliteBinary, fixture.storePath, `
    SELECT selection_status,current_generation_id,source_fence FROM disposable_projection_selection WHERE singleton=1;
  `);
  assert.deepEqual(selected, {
    selection_status: "current",
    current_generation_id: rebuilt.json.result.projection.generation_id,
    source_fence: fixture.fence,
  });
  const stored = await rows(sqliteBinary, fixture.storePath, `
    SELECT projection_kind,count(*) AS entries
    FROM disposable_projection_entries
    WHERE generation_id='${rebuilt.json.result.projection.generation_id}'
    GROUP BY projection_kind ORDER BY projection_kind;
  `);
  assert.deepEqual(Object.fromEntries(stored.map((item) => [item.projection_kind, item.entries])), rebuilt.json.result.projection.entry_counts);

  const replay = await invoke(entrypoint, root, request);
  assert.equal(replay.code, 0, replay.stderr);
  assert.deepEqual(replay.json.result, rebuilt.json.result);
  const lookup = await invoke(entrypoint, root, {
    protocol,
    operation: "get_store_operation_receipt",
    operation_id: request.operation_id,
    store_id: fixture.initialization.store_id,
    authority_claim: request.authority_claim,
    context: { ...fixture.context, purpose: "recover projection replacement receipt" },
    configuration: fixture.config,
  });
  assert.equal(lookup.code, 0, lookup.stderr);
  assert.equal(lookup.json.result.status, "settled");
  assert.equal(lookup.json.result.receipt.operation_kind, "projection_rebuild");
  assert.deepEqual(lookup.json.result.receipt.result, rebuilt.json.result);
  return { fixture, rebuilt };
}

test("replacement projections build and verify at one fence, atomically select, and durably replay without canonical mutation", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l09-w02-success-"));
  try {
    await exerciseSuccessfulRebuild(sourceEntrypoint, root, sqliteBinary, "source-success");
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await stat(root).then(() => true).catch(() => false), false);
  }
});

test("a failed replacement preserves prior verified bytes but marks them stale and never selects the failed generation", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l09-w02-failure-"));
  try {
    const { fixture, rebuilt } = await exerciseSuccessfulRebuild(sourceEntrypoint, root, sqliteBinary, "source-failure");
    const beforeCanonical = await canonicalDigest(sqliteBinary, fixture.storePath);
    const generationsBefore = await rows(sqliteBinary, fixture.storePath, "SELECT * FROM disposable_projection_generations ORDER BY generation_id;");
    const entriesBefore = await rows(sqliteBinary, fixture.storePath, "SELECT * FROM disposable_projection_entries ORDER BY generation_id,projection_kind,entry_key;");
    const request = rebuildRequest(fixture, "stale-fence", fixture.fence);
    const failed = await invoke(sourceEntrypoint, root, request);
    assert.equal(failed.code, 0, failed.stderr || JSON.stringify(failed.json));
    assert.deepEqual(failed.json.result.terminal, {
      outcome: "conflict",
      code: "canonical_fence_mismatch",
      failure_class: "projection_rebuild_precondition_failed",
      retry_disposition: "after_reconcile",
      canonical_state_effect: "none",
      projection_state: "stale",
    });
    assert.equal(failed.json.result.projection.replacement_generation_id, null);
    assert.equal(failed.json.result.projection.preserved_generation_id, rebuilt.json.result.projection.generation_id);
    assert.equal(failed.json.result.selection.selected, false);
    assert.equal(failed.json.result.selection.status, "stale");
    assert.equal(failed.json.result.fence_evidence.expected_canonical_fence, fixture.fence);
    assert.equal(failed.json.result.fence_evidence.observed_canonical_fence, fixture.fence + 1);
    assert.equal(await canonicalDigest(sqliteBinary, fixture.storePath), beforeCanonical);
    assert.deepEqual(await rows(sqliteBinary, fixture.storePath, "SELECT * FROM disposable_projection_generations ORDER BY generation_id;"), generationsBefore);
    assert.deepEqual(await rows(sqliteBinary, fixture.storePath, "SELECT * FROM disposable_projection_entries ORDER BY generation_id,projection_kind,entry_key;"), entriesBefore);
    assert.deepEqual(await row(sqliteBinary, fixture.storePath, "SELECT selection_status,current_generation_id,source_fence FROM disposable_projection_selection WHERE singleton=1;"), {
      selection_status: "stale",
      current_generation_id: rebuilt.json.result.projection.generation_id,
      source_fence: fixture.fence,
    });
    const replay = await invoke(sourceEntrypoint, root, request);
    assert.equal(replay.code, 0, replay.stderr);
    assert.deepEqual(replay.json.result, failed.json.result);
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await stat(root).then(() => true).catch(() => false), false);
  }
});

test("generated Pi, Codex, and OpenCode packages perform the same fenced projection replacement", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l09-w02-generated-"));
  try {
    const sandbox = await generateAndValidateSandbox({ sandboxRoot: root, sqliteBinary });
    for (const generated of sandbox.results) {
      const entrypoint = path.join(generated.package_root, "variants/sqlite/bin/casebook-persistence.mjs");
      const fixture = await makeFixture(entrypoint, root, sqliteBinary, `generated-${generated.target}`, { staleReference: false });
      const rebuilt = await invoke(entrypoint, root, rebuildRequest(fixture, "success"));
      assert.equal(rebuilt.code, 0, rebuilt.stderr || JSON.stringify(rebuilt.json));
      assert.equal(rebuilt.json.result.terminal.projection_state, "current");
      assert.equal(rebuilt.json.result.fence_evidence.canonical_source_fence, fixture.fence);
      assert.equal(rebuilt.json.result.projection.verified, true);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await stat(root).then(() => true).catch(() => false), false);
  }
});
