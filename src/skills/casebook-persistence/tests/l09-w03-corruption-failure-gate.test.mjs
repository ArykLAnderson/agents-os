import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { canonicalJson, WORKSPACE_MARKER } from "../shared/l01-interchange.mjs";
import { generateAndValidateSandbox, selectCompatibleSqliteBinary } from "./sandbox-harness.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceSqliteEntrypoint = path.join(packageRoot, "variants/sqlite/bin/casebook-persistence.mjs");
const sourceMarkdownEntrypoint = path.join(packageRoot, "variants/markdown/bin/casebook-persistence.mjs");
const protocol = { id: "casebook-persistence-json", version: 1 };
const projectionKinds = ["lexical", "reverse_reference", "staleness", "attention"];
const targetCase = "case:4f868e5c-91ee-4a2b-b4d0-851ac72a8da2";
const sourceCase = "case:49f65089-ed94-4624-85a8-5f297979d197";
const markdownStore = "store:31a9959e-b329-4387-99d5-d0d6bbed488d";
const markdownView = "view:08aff85e-43ec-4fc5-bb8f-7a6c444b4e1a";
const markdownPolicy = "view-policy:db2c11ef-f07f-4956-98fa-8f52c8a3545e";

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

async function sql(sqliteBinary, storePath, statement, args = ["-batch", "-bail"]) {
  return execFileWithInput(sqliteBinary, [...args, storePath], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }, statement);
}

async function rows(sqliteBinary, storePath, statement) {
  const { stdout } = await sql(sqliteBinary, storePath, statement, ["-batch", "-bail", "-json"]);
  return JSON.parse(stdout || "[]");
}

async function row(sqliteBinary, storePath, statement) {
  return (await rows(sqliteBinary, storePath, statement))[0];
}

async function canonicalOwnerLedgerBytes(sqliteBinary, storePath) {
  const statement = [
    "SELECT * FROM owners ORDER BY owner_id;",
    "SELECT * FROM owner_family_bindings ORDER BY family_id;",
    "SELECT * FROM owner_versions ORDER BY version_id;",
    "SELECT * FROM owner_revisions ORDER BY revision_id;",
    "SELECT * FROM owner_revision_selections ORDER BY revision_id,family_id;",
    "SELECT * FROM owner_current ORDER BY owner_id;",
    "SELECT * FROM owner_events ORDER BY commit_sequence,event_id;",
    "SELECT * FROM owner_outbox ORDER BY outbox_id;",
    "SELECT * FROM store_operation_receipts WHERE owner_id IS NOT NULL ORDER BY operation_id;",
  ].join("\n");
  const { stdout } = await sql(sqliteBinary, storePath, statement, ["-batch", "-bail", "-json"]);
  return stdout;
}

async function receiptRows(sqliteBinary, storePath) {
  return rows(sqliteBinary, storePath, "SELECT * FROM store_operation_receipts ORDER BY operation_id;");
}

function assertPriorReceiptsPreserved(before, after, expectedNewOperationId) {
  const afterById = new Map(after.map((receipt) => [receipt.operation_id, receipt]));
  for (const receipt of before) assert.deepEqual(afterById.get(receipt.operation_id), receipt);
  const added = after.filter((receipt) => !before.some((prior) => prior.operation_id === receipt.operation_id));
  assert.deepEqual(added.map((receipt) => receipt.operation_id), [expectedNewOperationId]);
  assert.equal(added[0].owner_id, null);
  assert.equal(added[0].operation_kind, "projection_rebuild");
}

function sqliteConfiguration(storePath, sqliteBinary, label) {
  return {
    source: { kind: "synthetic-test", locator: `l09-w03-disposable:${label}` },
    authority_mode: "sqlite",
    sqlite: { database_url: storePath, sqlite_bin: sqliteBinary },
  };
}

function caseRecord(id, namespaceId, title, references = [], state = "active") {
  return {
    id,
    home_namespace_id: namespaceId,
    state,
    title,
    summary: `${title} summary`,
    scope: "synthetic L09-W03 corruption/failure gate",
    aliases: [], facets: [], entries: [], sources: [], relationships: [], references,
  };
}

async function createFixture(entrypoint, root, sqliteBinary, label) {
  const storePath = path.join(root, `${label}.sqlite3`);
  const configuration = sqliteConfiguration(storePath, sqliteBinary, label);
  const initialized = await invoke(entrypoint, root, {
    protocol,
    operation: "initialize_store",
    operation_id: `operation:${label}:initialize`,
    authority_claim: { human_authorized: true, acting_role: "architect", authority_basis: "synthetic L09-W03 fixture" },
    configuration,
  });
  assert.equal(initialized.code, 0, initialized.stderr || JSON.stringify(initialized.json));
  const initialization = initialized.json.result.initialization;
  const context = {
    view_id: initialization.view.id,
    view_policy_revision_id: initialization.view.policy_revision_id,
    purpose: "independently classify corruption without semantic repair",
    requested_audience_ceiling: "private",
  };
  const common = { protocol, request_version: 1, store_id: initialization.store_id, context, configuration };
  const target = await invoke(entrypoint, root, {
    ...common,
    operation: "case.create",
    operation_id: `operation:${label}:target-create`,
    expected_revision: 0,
    commit_basis: "create semantic-link target",
    provenance: { acting_role: "case-reconcile", authority_basis: "synthetic L09-W03 fixture" },
    case: caseRecord(targetCase, initialization.namespace.id, `${label} target`),
  });
  assert.equal(target.code, 0, target.stderr || JSON.stringify(target.json));
  const source = await invoke(entrypoint, root, {
    ...common,
    operation: "case.create",
    operation_id: `operation:${label}:source-create`,
    expected_revision: 0,
    commit_basis: "create semantic-link source",
    provenance: { acting_role: "case-reconcile", authority_basis: "synthetic L09-W03 fixture" },
    case: caseRecord(sourceCase, initialization.namespace.id, `${label} source`, [{
      target_kind: "case",
      target_id: targetCase,
      observed_revision_id: target.json.result.revision.id,
      predicate: "depends_on",
      visibility: "private",
    }]),
  });
  assert.equal(source.code, 0, source.stderr || JSON.stringify(source.json));
  return { label, root, storePath, configuration, initialization, context, common, target };
}

async function currentFence(sqliteBinary, fixture) {
  return (await row(sqliteBinary, fixture.storePath, "SELECT operation_fence FROM store_fence WHERE singleton=1;")).operation_fence;
}

function rebuildRequest(fixture, suffix, fence) {
  return {
    ...fixture.common,
    operation: "projection.rebuild",
    operation_id: `operation:${fixture.label}:projection:${suffix}`,
    authority_claim: {
      human_authorized: true,
      acting_role: "projection-operator",
      authority_basis: "replace disposable projections only",
      human_confirmation_reference: `test-confirmation:${fixture.label}:${suffix}`,
    },
    safety: { store_class: "disposable", authorization_reference: `disposable-authorization:${fixture.label}` },
    projection_kinds: projectionKinds,
    canonical_fence: fence,
    canonical_state_effect: "none",
    requested_postcondition_evidence: [
      "source_fence", "projection_digest", "verification", "atomic_selection", "canonical_state_unchanged",
    ],
  };
}

async function observe(entrypoint, fixture) {
  return invoke(entrypoint, fixture.root, {
    ...fixture.common,
    operation: "integrity.observe",
  });
}

function ownerHandoff(...ownerIds) {
  return {
    required: true,
    handoff_kind: "owner_reconciliation",
    owners: ownerIds.map((id) => ({ id, kind: "case", operation: "case.commit_revision" })),
    automatic_mutation_performed: false,
  };
}

async function corruptSelectedDisposableProjection(sqliteBinary, fixture) {
  await sql(sqliteBinary, fixture.storePath, `
    UPDATE disposable_projection_entries
    SET payload_json=json_set(payload_json,'$.synthetic_corruption',1)
    WHERE (generation_id,projection_kind,entry_key)=(
      SELECT generation_id,projection_kind,entry_key FROM disposable_projection_entries
      WHERE generation_id=(SELECT current_generation_id FROM disposable_projection_selection WHERE singleton=1)
      ORDER BY projection_kind,entry_key LIMIT 1
    );
  `);
}

async function corruptCanonicalProfileDigest(sqliteBinary, fixture) {
  await sql(sqliteBinary, fixture.storePath, `
    DROP TRIGGER owner_versions_immutable_update;
    UPDATE owner_versions SET content_digest='${"0".repeat(64)}' WHERE family_id='${sourceCase}';
  `);
}

async function exerciseProjectionAndMalformedFailure(entrypoint, root, sqliteBinary, prefix) {
  const fixture = await createFixture(entrypoint, root, sqliteBinary, `${prefix}-projection-malformed`);
  const first = await invoke(entrypoint, root, rebuildRequest(fixture, "verified", await currentFence(sqliteBinary, fixture)));
  assert.equal(first.code, 0, first.stderr || JSON.stringify(first.json));
  assert.equal(first.json.result.terminal.projection_state, "current");
  const selectedGeneration = first.json.result.projection.generation_id;
  const canonicalBeforeProjectionCorruption = await canonicalOwnerLedgerBytes(sqliteBinary, fixture.storePath);

  await corruptSelectedDisposableProjection(sqliteBinary, fixture);
  const projection = await observe(entrypoint, fixture);
  assert.equal(projection.code, 0, projection.stderr || JSON.stringify(projection.json));
  assert.equal(projection.json.result.anomaly_class, "projection_only");
  assert.ok(projection.json.result.affected_visible_components.some((component) =>
    component.component === "disposable_projection" && component.condition === "selected_generation_integrity_failed"));
  assert.equal(projection.json.result.owner_reconciliation_handoff, null);
  assert.equal(projection.json.result.repair_performed, false);
  assert.equal(await canonicalOwnerLedgerBytes(sqliteBinary, fixture.storePath), canonicalBeforeProjectionCorruption);
  assert.deepEqual(await row(sqliteBinary, fixture.storePath, "SELECT selection_status,current_generation_id FROM disposable_projection_selection WHERE singleton=1;"), {
    selection_status: "current",
    current_generation_id: selectedGeneration,
  });

  await corruptCanonicalProfileDigest(sqliteBinary, fixture);
  const canonicalAfterSyntheticMalformedRecord = await canonicalOwnerLedgerBytes(sqliteBinary, fixture.storePath);
  const malformed = await observe(entrypoint, fixture);
  assert.equal(malformed.code, 0, malformed.stderr || JSON.stringify(malformed.json));
  assert.equal(malformed.json.result.anomaly_class, "semantic_evidence");
  assert.ok(malformed.json.result.affected_visible_components.some((component) => component.condition === "malformed_owner_record"));
  assert.deepEqual(malformed.json.result.owner_reconciliation_handoff, ownerHandoff(sourceCase));
  assert.equal(await canonicalOwnerLedgerBytes(sqliteBinary, fixture.storePath), canonicalAfterSyntheticMalformedRecord);

  const generationsBeforeFailure = await rows(sqliteBinary, fixture.storePath, "SELECT * FROM disposable_projection_generations ORDER BY generation_id;");
  const receiptsBeforeFailure = await receiptRows(sqliteBinary, fixture.storePath);
  const request = rebuildRequest(fixture, "malformed-source", await currentFence(sqliteBinary, fixture));
  const failed = await invoke(entrypoint, root, request);
  assert.equal(failed.code, 0, failed.stderr || JSON.stringify(failed.json));
  assert.deepEqual(failed.json.result.terminal, {
    outcome: "failed",
    code: "projection_verification_failed",
    failure_class: "projection_rebuild_failed",
    retry_disposition: "after_operator_repair",
    canonical_state_effect: "none",
    projection_state: "stale",
  });
  assert.equal(failed.json.result.projection.replacement_generation_id, null);
  assert.equal(failed.json.result.projection.preserved_generation_id, selectedGeneration);
  assert.equal(failed.json.result.selection.selected, false);
  assert.equal(failed.json.result.selection.status, "stale");
  assert.deepEqual(await rows(sqliteBinary, fixture.storePath, "SELECT * FROM disposable_projection_generations ORDER BY generation_id;"), generationsBeforeFailure);
  assert.equal(await canonicalOwnerLedgerBytes(sqliteBinary, fixture.storePath), canonicalAfterSyntheticMalformedRecord);
  assertPriorReceiptsPreserved(receiptsBeforeFailure, await receiptRows(sqliteBinary, fixture.storePath), request.operation_id);
  assert.deepEqual(await row(sqliteBinary, fixture.storePath, "SELECT selection_status,current_generation_id FROM disposable_projection_selection WHERE singleton=1;"), {
    selection_status: "stale",
    current_generation_id: selectedGeneration,
  });
  const receiptsAfterFailure = await receiptRows(sqliteBinary, fixture.storePath);
  const replay = await invoke(entrypoint, root, request);
  assert.deepEqual(replay.json.result, failed.json.result);
  assert.deepEqual(await receiptRows(sqliteBinary, fixture.storePath), receiptsAfterFailure);
  assert.equal(await canonicalOwnerLedgerBytes(sqliteBinary, fixture.storePath), canonicalAfterSyntheticMalformedRecord);
}

async function exerciseUnavailableFailure(entrypoint, root, sqliteBinary, prefix) {
  const fixture = await createFixture(entrypoint, root, sqliteBinary, `${prefix}-unavailable`);
  await corruptCanonicalProfileDigest(sqliteBinary, fixture);
  const canonicalBefore = await canonicalOwnerLedgerBytes(sqliteBinary, fixture.storePath);
  const receiptsBeforeFailure = await receiptRows(sqliteBinary, fixture.storePath);
  const request = rebuildRequest(fixture, "no-prior-generation", await currentFence(sqliteBinary, fixture));
  const failed = await invoke(entrypoint, root, request);
  assert.equal(failed.code, 0, failed.stderr || JSON.stringify(failed.json));
  assert.equal(failed.json.result.terminal.projection_state, "unavailable");
  assert.equal(failed.json.result.projection.replacement_generation_id, null);
  assert.equal(failed.json.result.projection.preserved_generation_id, null);
  assert.equal(failed.json.result.selection.selected, false);
  assert.equal(failed.json.result.selection.status, "unavailable");
  assert.equal((await row(sqliteBinary, fixture.storePath, "SELECT count(*) AS generations FROM disposable_projection_generations;")).generations, 0);
  assert.equal(await canonicalOwnerLedgerBytes(sqliteBinary, fixture.storePath), canonicalBefore);
  assertPriorReceiptsPreserved(receiptsBeforeFailure, await receiptRows(sqliteBinary, fixture.storePath), request.operation_id);
  const receiptsAfterFailure = await receiptRows(sqliteBinary, fixture.storePath);
  const replay = await invoke(entrypoint, root, request);
  assert.deepEqual(replay.json.result, failed.json.result);
  assert.deepEqual(await receiptRows(sqliteBinary, fixture.storePath), receiptsAfterFailure);
  assert.equal((await row(sqliteBinary, fixture.storePath, "SELECT count(*) AS generations FROM disposable_projection_generations;")).generations, 0);
  assert.equal(await canonicalOwnerLedgerBytes(sqliteBinary, fixture.storePath), canonicalBefore);
}

async function exerciseDanglingSemanticLink(entrypoint, root, sqliteBinary, prefix) {
  const fixture = await createFixture(entrypoint, root, sqliteBinary, `${prefix}-dangling`);
  const tombstoned = await invoke(entrypoint, root, {
    ...fixture.common,
    operation: "case.commit_revision",
    operation_id: `operation:${fixture.label}:target-tombstone`,
    expected_revision: 1,
    commit_basis: "make the retained source link semantically dangling",
    provenance: { acting_role: "case-reconcile", authority_basis: "synthetic L09-W03 fixture" },
    case: caseRecord(targetCase, fixture.initialization.namespace.id, `${fixture.label} target`, [], "tombstoned"),
  });
  assert.equal(tombstoned.code, 0, tombstoned.stderr || JSON.stringify(tombstoned.json));
  const canonicalBefore = await canonicalOwnerLedgerBytes(sqliteBinary, fixture.storePath);

  const observed = await observe(entrypoint, fixture);
  assert.equal(observed.code, 0, observed.stderr || JSON.stringify(observed.json));
  assert.equal(observed.json.result.anomaly_class, "semantic_evidence");
  assert.ok(observed.json.result.affected_visible_components.some((component) => component.condition === "dangling_semantic_link"));
  assert.deepEqual(observed.json.result.owner_reconciliation_handoff, ownerHandoff(sourceCase));
  assert.equal(await canonicalOwnerLedgerBytes(sqliteBinary, fixture.storePath), canonicalBefore);

  const read = await invoke(entrypoint, root, { ...fixture.common, operation: "case.read", case_id: sourceCase });
  assert.equal(read.code, 2, read.stderr || JSON.stringify(read.json));
  assert.equal(read.json.failure.code, "case.semantic_reconcile_required");
  assert.equal(read.json.failure.evidence.semantic_evidence.kind, "case.semantic_evidence");
  assert.equal(read.json.failure.evidence.semantic_evidence.mutation_performed, false);
  assert.deepEqual(read.json.failure.evidence.semantic_evidence.owner_reconciliation_handoff, ownerHandoff(sourceCase));
  assert.equal(await canonicalOwnerLedgerBytes(sqliteBinary, fixture.storePath), canonicalBefore);
}

async function exerciseSalvage(entrypoint, root, sqliteBinary, prefix) {
  const fixture = await createFixture(entrypoint, root, sqliteBinary, `${prefix}-salvage`);
  const rendered = await invoke(entrypoint, root, {
    ...fixture.common,
    operation: "case.markdown.render",
    case_id: sourceCase,
    audience: "private",
    evidence_selection: [],
  });
  assert.equal(rendered.code, 0, rendered.stderr || JSON.stringify(rendered.json));
  const value = rendered.json.result;
  const canonicalBefore = await canonicalOwnerLedgerBytes(sqliteBinary, fixture.storePath);
  const staged = await invoke(entrypoint, root, {
    ...fixture.common,
    operation: "case.markdown.stage_reconciliation",
    case_id: sourceCase,
    base_revision: { id: value.revision.id, number: value.revision.number },
    original_manifest: value.manifest,
    original_digest: value.digest,
    edited_markdown: value.markdown.replace("# Case Profile", "# Salvaged Unparsed Profile"),
  });
  assert.equal(staged.code, 0, staged.stderr || JSON.stringify(staged.json));
  assert.equal(staged.json.result.base_status, "unparsed");
  assert.equal(staged.json.result.semantic_evidence.kind, "case.semantic_evidence");
  assert.deepEqual(staged.json.result.semantic_evidence.owner_reconciliation_handoff, ownerHandoff(sourceCase));
  assert.equal(staged.json.result.committed, false);
  assert.equal(staged.json.result.mutation_performed, false);
  assert.equal(await canonicalOwnerLedgerBytes(sqliteBinary, fixture.storePath), canonicalBefore);
}

function markdownMarker() {
  return {
    configuration_version: 1,
    authority_mode: "markdown",
    profile: "file-authoritative-markdown-v1",
    workspace_id: markdownStore,
    view: { id: markdownView, policy_revision_id: markdownPolicy, audience_ceiling: "private" },
  };
}

function markdownRequest(workspace, operation, extra = {}) {
  return {
    protocol,
    operation,
    request_version: 1,
    store_id: markdownStore,
    context: {
      view_id: markdownView,
      view_policy_revision_id: markdownPolicy,
      purpose: `L09-W03 ${operation} import evidence`,
      requested_audience_ceiling: "private",
    },
    configuration: {
      source: { kind: "synthetic-test", locator: "l09-w03-import-candidate" },
      authority_mode: "markdown",
      markdown: { workspace_root: workspace },
    },
    ...extra,
  };
}

async function directoryDigest(root) {
  const entries = [];
  async function visit(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, item.name);
      if (item.isDirectory()) await visit(absolute);
      else entries.push([path.relative(root, absolute), await readFile(absolute)]);
    }
  }
  await visit(root);
  entries.sort(([left], [right]) => left.localeCompare(right));
  const digest = createHash("sha256");
  for (const [relative, bytes] of entries) digest.update(relative).update("\0").update(bytes).update("\0");
  return digest.digest("hex");
}

async function exerciseImportCandidate(markdownEntrypoint, root, prefix) {
  const workspace = path.join(root, `${prefix}-markdown-import`);
  await mkdir(workspace, { recursive: true });
  await writeFile(path.join(workspace, WORKSPACE_MARKER), canonicalJson(markdownMarker()));
  const created = await invoke(markdownEntrypoint, root, markdownRequest(workspace, "case.create", {
    operation_id: `operation:${prefix}:markdown-case-create`,
    expected_revision: 0,
    commit_basis: "create non-authoritative import candidate",
    provenance: { acting_role: "case", authority_basis: "synthetic L09-W03 fixture" },
    case: caseRecord(sourceCase, "namespace:b3ad9ccd-466a-4004-8ae5-d1db5d2c2905", `${prefix} import candidate`),
  }));
  assert.equal(created.code, 0, created.stderr || JSON.stringify(created.json));
  const before = await directoryDigest(workspace);
  const parsed = await invoke(markdownEntrypoint, root, markdownRequest(workspace, "interchange.parse"));
  assert.equal(parsed.code, 0, parsed.stderr || JSON.stringify(parsed.json));
  assert.equal(parsed.json.result.semantic_evidence.kind, "case.semantic_evidence");
  assert.equal(parsed.json.result.semantic_evidence.requires_case_reconcile, true);
  assert.deepEqual(parsed.json.result.semantic_evidence.owner_reconciliation_handoff, ownerHandoff(sourceCase));
  assert.equal(parsed.json.result.reconcile_disposition, "requires-explicit-case-reconcile");
  assert.equal(parsed.json.result.mutation_performed, false);
  assert.equal(await directoryDigest(workspace), before);
}

async function runGate(sqliteEntrypoint, markdownEntrypoint, root, sqliteBinary, prefix) {
  await exerciseProjectionAndMalformedFailure(sqliteEntrypoint, root, sqliteBinary, prefix);
  await exerciseUnavailableFailure(sqliteEntrypoint, root, sqliteBinary, prefix);
  await exerciseDanglingSemanticLink(sqliteEntrypoint, root, sqliteBinary, prefix);
  await exerciseSalvage(sqliteEntrypoint, root, sqliteBinary, prefix);
  await exerciseImportCandidate(markdownEntrypoint, root, prefix);
}

test("independent corruption/failure gate separates projection, malformed, dangling, salvage, and import evidence without canonical mutation", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l09-w03-source-"));
  try {
    await runGate(sourceSqliteEntrypoint, sourceMarkdownEntrypoint, root, sqliteBinary, "source");
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await stat(root).then(() => true).catch(() => false), false);
  }
});

test("generated Pi, Codex, and OpenCode copies pass the same corruption/failure gate", async () => {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-l09-w03-generated-"));
  try {
    const sandbox = await generateAndValidateSandbox({ sandboxRoot: root, sqliteBinary });
    for (const generated of sandbox.results) {
      await runGate(
        path.join(generated.package_root, "variants/sqlite/bin/casebook-persistence.mjs"),
        path.join(generated.package_root, "variants/markdown/bin/casebook-persistence.mjs"),
        root,
        sqliteBinary,
        generated.target,
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await stat(root).then(() => true).catch(() => false), false);
  }
});
