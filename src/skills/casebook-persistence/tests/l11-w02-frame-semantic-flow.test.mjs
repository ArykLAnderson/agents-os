import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalJson, WORKSPACE_MARKER } from "../shared/l01-interchange.mjs";
import { cleanupSandbox, generateAndValidateSandbox } from "./sandbox-harness.mjs";

const protocol = { id: "casebook-persistence-json", version: 1 };
const sourceFrameRoot = new URL("../../frame/", import.meta.url).pathname;
const generatedHeader = "<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->";
const ids = Object.freeze({
  markdownStore: "store:ed29996b-907f-4994-94be-17984a788ebc",
  markdownView: "view:24b6d682-7003-43a5-a228-f034928ebcc4",
  markdownPolicy: "view-policy:2ddacbdc-efbf-4c7e-b433-860e0eaa7a6b",
  namespace: "namespace:b73ece88-7a12-4004-9dd4-0f53364c1f54",
  frame: "frame:50a005b1-a35a-4bff-8f9b-e67be88f56dc",
  discovery: "discovery:ad6f04f2-5d94-4cc2-9c95-52c941826ffd",
  boundary: "disposition-boundary:bdf81aff-f721-46f3-bc68-2bc746e59e60",
  pending: "case-disposition:0b849625-4866-4d78-bd67-83d8d91c33d2",
  intake: "case-disposition:d2ab3093-0569-45d8-891d-c8fd182d0f99",
  reconcile: "case-disposition:95cbcdf9-13f5-4c77-97c1-35852d4b8ce1",
  noCase: "case-disposition:25e532b7-7959-47c8-aa82-2c413f75320e",
  intakeCase: "case:e1edbd3a-5009-42fa-baa4-bcbe46a7882f",
  reconcileCase: "case:4eea6a1c-955a-4c37-ad8c-ad54a3676aa1",
  boundaryVersion: "disposition-boundary-version:60e7794f-6f36-4aac-84b0-a172be81c165",
  pendingVersion: "case-disposition-version:91d78b5c-af51-4bb6-a71f-c4b6afd5f097",
  intakeVersion: "case-disposition-version:ea311197-af9e-44df-9200-9211ec1f87a7",
  reconcileVersion: "case-disposition-version:af834f42-d7c9-40b0-b692-742327fff143",
  noCaseVersion: "case-disposition-version:c080dae9-9aa7-4a61-92e7-6db318acd8d7",
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
      exitCode: error ? 2 : 0,
      json: stdout ? JSON.parse(stdout) : {},
      stderr,
    }));
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

function context(viewId, policyId, purpose) {
  return {
    view_id: viewId,
    view_policy_revision_id: policyId,
    purpose,
    requested_audience_ceiling: "private",
  };
}

function marker() {
  return {
    configuration_version: 1,
    authority_mode: "markdown",
    profile: "file-authoritative-markdown-v1",
    workspace_id: ids.markdownStore,
    view: {
      id: ids.markdownView,
      policy_revision_id: ids.markdownPolicy,
      audience_ceiling: "private",
    },
  };
}

function markdownConfiguration(workspace, target) {
  return {
    source: { kind: "generated-semantic-flow-test", locator: `sandbox:${target}:markdown` },
    authority_mode: "markdown",
    markdown: { workspace_root: workspace },
  };
}

function markdownRequest(workspace, target, operation, extra = {}) {
  const selected = marker();
  return {
    protocol,
    operation,
    request_version: 1,
    store_id: selected.workspace_id,
    context: context(selected.view.id, selected.view.policy_revision_id, `L11-W02 ${operation}`),
    configuration: markdownConfiguration(workspace, target),
    ...extra,
  };
}

function sqliteConfiguration(database, sqliteBinary, target) {
  return {
    source: { kind: "generated-semantic-flow-test", locator: `sandbox:${target}:sqlite` },
    authority_mode: "sqlite",
    sqlite: { database_url: database, sqlite_bin: sqliteBinary },
  };
}

function sqliteRequest(state, operation, extra = {}) {
  return {
    protocol,
    operation,
    request_version: 1,
    store_id: state.initialization.store_id,
    context: context(state.initialization.view.id, state.initialization.view.policy_revision_id, `L11-W02 ${operation}`),
    configuration: state.configuration,
    ...extra,
  };
}

function frameRecord(namespaceId, target) {
  return {
    id: ids.frame,
    home_namespace_id: namespaceId,
    authority_scope_namespace_ids: [namespaceId],
    status: "active",
    title: `${target} selected-authority Frame`,
    outcome: "Account for every material result at the natural boundary.",
    discovery: [{
      id: ids.discovery,
      display_order: 0,
      lifecycle: "active",
      category: "frontier",
      title: "Complete boundary accounting",
      body: "Human judgment classifies reusable meaning and retained evidence preserves provenance.",
      human_authority: "required",
      dependencies: [],
    }],
    disposition_boundaries: [],
    case_dispositions: [],
  };
}

function accountedFrame(original, { markdown = false } = {}) {
  const frame = structuredClone(original);
  const version = (value) => markdown ? { version_id: value } : {};
  frame.disposition_boundaries = [{
    id: ids.boundary,
    ...version(ids.boundaryVersion),
    display_label: "DB-001",
    display_order: 0,
    title: "Natural semantic-flow boundary",
    basis: "Inventory every material operation result before continuing.",
    evidence_locators: [{ uri: "artifact://l11-w02/boundary", audience: "private", media_type: "application/json" }],
    closure: "open",
    disposition_ids: [ids.pending, ids.intake, ids.reconcile, ids.noCase],
  }];
  frame.case_dispositions = [{
    id: ids.pending,
    ...version(ids.pendingVersion),
    boundary_id: ids.boundary,
    result_summary: "One result still needs human classification judgment",
    classification_state: "pending_classification",
    pending_reason: "Its reusable semantic boundary is not yet clear.",
    resume_condition: "Obtain the bounded human judgment.",
    evidence_locators: [{ uri: "artifact://l11-w02/pending", audience: "private" }],
  }, {
    id: ids.intake,
    ...version(ids.intakeVersion),
    boundary_id: ids.boundary,
    result_summary: "New reusable meaning belongs in a new Case",
    classification_state: "classified",
    disposition: "intake",
    rationale: "The meaning is independently reusable.",
    realization_state: "awaiting_case",
    case_id: ids.intakeCase,
    case_operation_id: "operation:l11-w02-intake-case",
    affected_case_entry_display_ids: ["CK-001"],
  }, {
    id: ids.reconcile,
    ...version(ids.reconcileVersion),
    boundary_id: ids.boundary,
    result_summary: "Accepted evidence materially changes an existing Case",
    classification_state: "classified",
    disposition: "reconcile",
    rationale: "The existing conclusion needs an explicit qualification.",
    realization_state: "awaiting_case",
    case_id: ids.reconcileCase,
    case_operation_id: "operation:l11-w02-reconcile-case",
    affected_case_entry_display_ids: ["CK-001"],
  }, {
    id: ids.noCase,
    ...version(ids.noCaseVersion),
    boundary_id: ids.boundary,
    result_summary: "Disposable execution output",
    classification_state: "classified",
    disposition: "no_case",
    no_case_reason: "It is transient evidence with no independently reusable meaning.",
  }];
  return frame;
}

function caseRecord(id, namespaceId, title) {
  return {
    id,
    home_namespace_id: namespaceId,
    state: "active",
    title,
    summary: "A separate Case transaction realizes a Frame disposition.",
    scope: "Disposable L11-W02 semantic-flow evidence only.",
    aliases: [],
    facets: [],
    entries: [],
    sources: [],
    relationships: [],
    references: [],
  };
}

async function generateFrameSkill(destination) {
  await cp(sourceFrameRoot, destination, { recursive: true, errorOnExist: true });
  const skillPath = path.join(destination, "SKILL.md");
  const source = await readFile(skillPath, "utf8");
  const frontmatterEnd = source.indexOf("\n---\n", 4);
  assert.notEqual(frontmatterEnd, -1);
  await writeFile(skillPath, `${source.slice(0, frontmatterEnd + 5)}\n${generatedHeader}\n\n${source.slice(frontmatterEnd + 5).trimStart()}`);
}

async function assertGeneratedProcedure(frameRoot) {
  const skill = await readFile(path.join(frameRoot, "SKILL.md"), "utf8");
  const persistence = await readFile(path.join(frameRoot, "references/persistence.md"), "utf8");
  const state = await readFile(path.join(frameRoot, "references/state.md"), "utf8");
  const discovery = await readFile(path.join(frameRoot, "references/discovery.md"), "utf8");
  const combined = [skill, persistence, state, discovery].join("\n");

  assert.match(skill, /casebook-persistence/);
  assert.match(persistence, /missing or ambiguous/i);
  assert.match(persistence, /Do not (?:probe|fall back)/i);
  assert.match(persistence, /no fallback or dual write/i);
  for (const operation of ["frame.create", "frame.commit_revision", "frame.read", "frame.list", "frame.resolve", "frame.discovery.read", "frame.disposition.read", "frame.legacy.prepare_reconciliation"]) {
    assert.match(persistence, new RegExp(operation.replaceAll(".", "\\.")));
  }
  assert.match(combined, /pending_classification/);
  assert.match(combined, /awaiting_case/);
  assert.match(combined, /settled/);
  assert.match(combined, /intake/);
  assert.match(combined, /reconcile/);
  assert.match(combined, /no_case/);
  assert.match(combined, /complete (?:typed )?Frame aggregate/i);
  assert.match(combined, /separate (?:Case and Frame|Frame and Case|owner|Frame and Case owner) (?:commits?|transactions?)/i);
  assert.match(combined, /human judgment/i);
  assert.match(combined, /provenance/i);
  assert.match(combined, /requested_audience_ceiling.*private/i);
  assert.doesNotMatch(combined, /(?:write|edit|create) (?:the )?\.casebook\/frames\//i);
}

async function exerciseMarkdown(entrypoint, root, target) {
  const workspace = path.join(root, "markdown-authority");
  await mkdir(workspace, { recursive: true });
  await writeFile(path.join(workspace, WORKSPACE_MARKER), canonicalJson(marker()));
  const configuration = markdownConfiguration(workspace, target);

  const reconcileBase = caseRecord(ids.reconcileCase, ids.namespace, `${target} Markdown reconcile base`);
  const baseCreated = await invoke(entrypoint, root, markdownRequest(workspace, target, "case.create", {
    operation_id: `operation:l11-w02-${target}-markdown-reconcile-base`, expected_revision: 0,
    commit_basis: "establish existing Case before Frame reconciliation", provenance: { acting_role: "case", authority_basis: "synthetic semantic-flow proof" },
    case: reconcileBase,
  }));
  assert.equal(baseCreated.exitCode, 0, `${target}: ${JSON.stringify(baseCreated.json)}`);

  const initial = frameRecord(ids.namespace, target);
  const created = await invoke(entrypoint, root, markdownRequest(workspace, target, "frame.create", {
    operation_id: `operation:l11-w02-${target}-markdown-frame-create`, expected_revision: 0,
    commit_basis: "open ordinary Frame through the selected authority", provenance: { acting_role: "frame", authority_basis: "synthetic human-authorized Frame" },
    frame: initial,
  }));
  assert.equal(created.exitCode, 0, `${target}: ${JSON.stringify(created.json)}`);

  const listed = await invoke(entrypoint, root, markdownRequest(workspace, target, "frame.list"));
  assert.equal(listed.exitCode, 0, `${target}: ${JSON.stringify(listed.json)}`);
  assert.deepEqual(listed.json.result.items.map((item) => item.id), [ids.frame]);
  const searched = await invoke(entrypoint, root, markdownRequest(workspace, target, "common.search", { owner_kinds: ["frame"], query: "boundary", limit: 10 }));
  assert.equal(searched.exitCode, 0, `${target}: ${JSON.stringify(searched.json)}`);
  assert.deepEqual(searched.json.result.items.map((item) => item.id), [ids.frame]);

  const resumed = await invoke(entrypoint, root, markdownRequest(workspace, target, "frame.read", { frame_id: ids.frame }));
  assert.equal(resumed.exitCode, 0, `${target}: ${JSON.stringify(resumed.json)}`);
  const accounted = accountedFrame(resumed.json.result.frame, { markdown: true });
  const recorded = await invoke(entrypoint, root, markdownRequest(workspace, target, "frame.commit_revision", {
    operation_id: `operation:l11-w02-${target}-markdown-account`, frame_id: ids.frame,
    expected_digest: resumed.json.result.persistence.aggregate_digest,
    commit_basis: "record complete natural-boundary accounting before separate Case commits",
    provenance: { acting_role: "frame", authority_basis: "synthetic human classification judgment" }, frame: accounted,
  }));
  assert.equal(recorded.exitCode, 0, `${target}: ${JSON.stringify(recorded.json)}`);
  assert.deepEqual(recorded.json.result.completion_evidence.completion_blocks.map((item) => item.kind), ["pending_classification", "awaiting_case"]);

  const intake = await invoke(entrypoint, root, markdownRequest(workspace, target, "case.create", {
    operation_id: "operation:l11-w02-intake-case", expected_revision: 0,
    commit_basis: "realize Intake in a separate Case commit", provenance: { acting_role: "case", authority_basis: "synthetic semantic-flow proof" },
    case: caseRecord(ids.intakeCase, ids.namespace, `${target} Markdown Intake realization`),
  }));
  assert.equal(intake.exitCode, 0, `${target}: ${JSON.stringify(intake.json)}`);
  const caseRead = await invoke(entrypoint, root, markdownRequest(workspace, target, "case.read", { case_id: ids.reconcileCase }));
  assert.equal(caseRead.exitCode, 0, `${target}: ${JSON.stringify(caseRead.json)}`);
  const reconcile = await invoke(entrypoint, root, markdownRequest(workspace, target, "case.commit_revision", {
    operation_id: "operation:l11-w02-reconcile-case", expected_digest: caseRead.json.result.persistence.content_digest,
    commit_basis: "realize Reconcile in a separate Case commit", provenance: { acting_role: "case", authority_basis: "synthetic semantic-flow proof" },
    case: { ...caseRead.json.result.case, title: `${target} Markdown reconciled Case` },
  }));
  assert.equal(reconcile.exitCode, 0, `${target}: ${JSON.stringify(reconcile.json)}`);
  const afterCases = await invoke(entrypoint, root, markdownRequest(workspace, target, "frame.read", { frame_id: ids.frame }));
  assert.equal(afterCases.exitCode, 0, `${target}: ${JSON.stringify(afterCases.json)}`);
  assert.deepEqual(afterCases.json.result.frame.case_dispositions.slice(1, 3).map((item) => item.realization_state), ["awaiting_case", "awaiting_case"]);

  const shadow = path.join(root, "forbidden-shadow.sqlite3");
  const ambiguous = await invoke(entrypoint, root, {
    ...markdownRequest(workspace, target, "frame.read", { frame_id: ids.frame }),
    configuration: { ...configuration, sqlite: { database_url: shadow } },
  });
  assert.equal(ambiguous.exitCode, 2);
  assert.equal(ambiguous.json.failure.code, "dual_authority_rejected");
  assert.equal(await stat(shadow).then(() => true).catch(() => false), false);
  const missing = await invoke(entrypoint, root, {
    ...markdownRequest(workspace, target, "frame.read", { frame_id: ids.frame }),
    configuration: { source: { kind: "generated-semantic-flow-test", locator: `sandbox:${target}:missing` } },
  });
  assert.equal(missing.exitCode, 2);
  assert.match(missing.json.failure.code, /authority|configuration/);
}

async function exerciseSqlite(entrypoint, root, target, sqliteBinary) {
  await mkdir(root, { recursive: true });
  const configuration = sqliteConfiguration(path.join(root, "sqlite-authority.sqlite3"), sqliteBinary, target);
  const initialized = await invoke(entrypoint, root, {
    protocol, operation: "initialize_store", operation_id: `operation:l11-w02-${target}-sqlite-initialize`,
    authority_claim: { human_authorized: true, acting_role: "test-operator", authority_basis: "explicit disposable sandbox initialization" },
    configuration,
  });
  assert.equal(initialized.exitCode, 0, `${target}: ${JSON.stringify(initialized.json)}`);
  const state = { initialization: initialized.json.result.initialization, configuration };
  const namespaceId = state.initialization.namespace.id;

  const baseCreated = await invoke(entrypoint, root, sqliteRequest(state, "case.create", {
    operation_id: `operation:l11-w02-${target}-sqlite-reconcile-base`, expected_revision: 0,
    commit_basis: "establish existing Case before Frame reconciliation", provenance: { acting_role: "case", authority_basis: "synthetic semantic-flow proof" },
    case: caseRecord(ids.reconcileCase, namespaceId, `${target} SQLite reconcile base`),
  }));
  assert.equal(baseCreated.exitCode, 0, `${target}: ${JSON.stringify(baseCreated.json)}`);

  const initial = frameRecord(namespaceId, target);
  const created = await invoke(entrypoint, root, sqliteRequest(state, "frame.create", {
    operation_id: `operation:l11-w02-${target}-sqlite-frame-create`, expected_revision: 0,
    commit_basis: "open ordinary Frame through the selected authority", provenance: { acting_role: "frame", authority_basis: "synthetic human-authorized Frame" }, frame: initial,
  }));
  assert.equal(created.exitCode, 0, `${target}: ${JSON.stringify(created.json)}`);
  const listed = await invoke(entrypoint, root, sqliteRequest(state, "frame.list", { statuses: ["active"] }));
  assert.equal(listed.exitCode, 0, `${target}: ${JSON.stringify(listed.json)}`);
  assert.deepEqual(listed.json.result.items.map((item) => item.id), [ids.frame]);
  const resumed = await invoke(entrypoint, root, sqliteRequest(state, "frame.read", {
    frame_id: ids.frame, include: { discovery: "all_selected", case_dispositions: "all_selected" },
  }));
  assert.equal(resumed.exitCode, 0, `${target}: ${JSON.stringify(resumed.json)}`);

  const accounted = accountedFrame(initial);
  const recorded = await invoke(entrypoint, root, sqliteRequest(state, "frame.commit_revision", {
    operation_id: `operation:l11-w02-${target}-sqlite-account`, frame_id: ids.frame,
    expected_revision: resumed.json.result.revision.number,
    commit_basis: "record complete natural-boundary accounting before separate Case commits",
    provenance: { acting_role: "frame", authority_basis: "synthetic human classification judgment" }, frame: accounted,
  }));
  assert.equal(recorded.exitCode, 0, `${target}: ${JSON.stringify(recorded.json)}`);
  assert.deepEqual(recorded.json.result.completion_evidence.completion_blocks.map((item) => item.kind), ["pending_classification", "awaiting_case"]);

  const intake = await invoke(entrypoint, root, sqliteRequest(state, "case.create", {
    operation_id: "operation:l11-w02-intake-case", expected_revision: 0,
    commit_basis: "realize Intake in a separate Case commit", provenance: { acting_role: "case", authority_basis: "synthetic semantic-flow proof" },
    case: caseRecord(ids.intakeCase, namespaceId, `${target} SQLite Intake realization`),
  }));
  assert.equal(intake.exitCode, 0, `${target}: ${JSON.stringify(intake.json)}`);
  const caseRead = await invoke(entrypoint, root, sqliteRequest(state, "case.read", { case_id: ids.reconcileCase }));
  assert.equal(caseRead.exitCode, 0, `${target}: ${JSON.stringify(caseRead.json)}`);
  const reconciled = await invoke(entrypoint, root, sqliteRequest(state, "case.commit_revision", {
    operation_id: "operation:l11-w02-reconcile-case", expected_revision: caseRead.json.result.revision.number,
    commit_basis: "realize Reconcile in a separate Case commit", provenance: { acting_role: "case", authority_basis: "synthetic semantic-flow proof" },
    case: { ...caseRead.json.result.case, title: `${target} SQLite reconciled Case` },
  }));
  assert.equal(reconciled.exitCode, 0, `${target}: ${JSON.stringify(reconciled.json)}`);
  const stillAwaiting = await invoke(entrypoint, root, sqliteRequest(state, "frame.read", {
    frame_id: ids.frame, include: { discovery: "all_selected", case_dispositions: "all_selected" },
  }));
  assert.deepEqual(stillAwaiting.json.result.frame.case_dispositions.slice(1, 3).map((item) => item.realization_state), ["awaiting_case", "awaiting_case"]);

  const settled = accountedFrame(initial);
  settled.status = "completed";
  Object.assign(settled.discovery[0], {
    lifecycle: "settled", category: "settled", disposition: "accepted",
    resolution: "Human judgment classified every result and both separate Case commits succeeded.",
  });
  settled.disposition_boundaries[0].closure = "closed";
  settled.case_dispositions[0] = {
    id: ids.pending, boundary_id: ids.boundary,
    result_summary: "One result still needs human classification judgment",
    classification_state: "classified", disposition: "no_case",
    no_case_reason: "Human review established that the bounded result is transient.",
  };
  Object.assign(settled.case_dispositions[1], { realization_state: "settled", observed_case_revision_id: intake.json.result.revision.id });
  Object.assign(settled.case_dispositions[2], { realization_state: "settled", pinned_case_revision_id: reconciled.json.result.revision.id });
  const completed = await invoke(entrypoint, root, sqliteRequest(state, "frame.commit_revision", {
    operation_id: `operation:l11-w02-${target}-sqlite-settle`, frame_id: ids.frame,
    expected_revision: stillAwaiting.json.result.revision.number,
    commit_basis: "settle temporary classification and separately committed Case realizations",
    provenance: { acting_role: "frame", authority_basis: "synthetic human completion judgment" }, frame: settled,
  }));
  assert.equal(completed.exitCode, 0, `${target}: ${JSON.stringify(completed.json)}`);
  assert.equal(completed.json.result.completion_evidence.cross_owner_completion.state, "settled");
  assert.deepEqual(completed.json.result.completion_evidence.completion_blocks, []);
  assert.equal(await stat(path.join(root, "markdown-authority")).then(() => true).catch(() => false), false);
}

test("generated Pi, Codex, and OpenCode Frame procedures execute selected-authority semantic flows with complete separate-commit accounting", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "casebook-l11-w02-semantic-flow-"));
  try {
    const generated = await generateAndValidateSandbox({ sandboxRoot: sandbox });
    for (const target of generated.results) {
      const frameRoot = path.join(path.dirname(target.package_root), "frame");
      await generateFrameSkill(frameRoot);
      await assertGeneratedProcedure(frameRoot);
      const targetRoot = path.join(sandbox, "semantic-flow", target.target);
      await exerciseMarkdown(path.join(target.package_root, "variants/markdown/bin/casebook-persistence.mjs"), path.join(targetRoot, "markdown"), target.target);
      await exerciseSqlite(path.join(target.package_root, "variants/sqlite/bin/casebook-persistence.mjs"), path.join(targetRoot, "sqlite"), target.target, generated.sqlite_binary);
    }
  } finally {
    assert.equal(await cleanupSandbox(sandbox), true);
  }
  assert.equal(await stat(sandbox).then(() => true).catch(() => false), false);
});
