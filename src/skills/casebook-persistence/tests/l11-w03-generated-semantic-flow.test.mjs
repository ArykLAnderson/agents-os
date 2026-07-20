import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { canonicalJson, WORKSPACE_MARKER } from "../shared/l01-interchange.mjs";
import { aggregateContentDigest, sha256 } from "../shared/manifest.mjs";
import { selectCompatibleSqliteBinary } from "./sandbox-harness.mjs";

const protocol = { id: "casebook-persistence-json", version: 1 };
const generatedHeader = "<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->";
const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const targetNames = ["pi", "codex", "opencode"];
const ids = Object.freeze({
  markdownStore: "store:806e86bb-bb28-4c4d-86fc-47fdae45189d",
  markdownView: "view:115b6ba0-4f4f-45f4-b1a8-d7f765a6b318",
  markdownPolicy: "view-policy:7b524a9e-9f2d-4427-9974-c3aff096dbad",
  namespace: "namespace:a94fd2fa-ab94-4271-bd83-c1cfcb9816c2",
  frame: "frame:a9477171-5ca2-4f27-a2de-e18055373d8b",
  discovery: "discovery:307014d9-f7e1-4487-9d7a-663381dc3075",
  boundary: "disposition-boundary:ab6b0a9d-2f2d-4bd3-8a70-3234fe8b03c2",
  pending: "case-disposition:49caf326-5067-4151-bae9-01d836db14ac",
  intake: "case-disposition:433a328f-c990-48b5-beeb-567742ad424c",
  reconcile: "case-disposition:b9f74920-67cf-4c68-acda-b091f2548ea5",
  noCase: "case-disposition:fcfa20b5-a911-440a-9625-068d21def394",
  intakeCase: "case:6492a75a-fb85-4814-98b7-fc7c892b68ff",
  reconcileCase: "case:f7c02fa4-5d8a-4b29-b8cb-cfb768e986e2",
  knowledge: "knowledge:3fa0e005-d66a-48ff-8f9e-3912d424054a",
  boundaryVersion: "disposition-boundary-version:6031abf5-52d4-46d4-a152-d31997972979",
  pendingVersion: "case-disposition-version:be07cc14-9a03-49eb-a11f-3bc4677033ca",
  intakeVersion: "case-disposition-version:0a79485a-e92f-4c83-a8ea-2cc8af31f67c",
  reconcileVersion: "case-disposition-version:eff3611a-3f92-42a6-bd04-4b8ef930459d",
  noCaseVersion: "case-disposition-version:5e78a353-ff09-4467-a12c-275a5b8d2e52",
});

function exec(file, args, options = {}, input = "") {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
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
    const result = await exec(process.execPath, [entrypoint], {
      cwd,
      env: { PATH: process.env.PATH ?? "", HOME: cwd },
    }, `${JSON.stringify(request)}\n`);
    return { exitCode: 0, json: JSON.parse(result.stdout), stderr: result.stderr };
  } catch (error) {
    return { exitCode: 2, json: error.stdout ? JSON.parse(error.stdout) : {}, stderr: error.stderr ?? "" };
  }
}

function generatedSkillBytes(source) {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  assert.ok(match, "generated semantic skills require frontmatter");
  return `---\n${match[1]}\n---\n\n${generatedHeader}\n\n${match[2].trimStart()}`;
}

async function generateAdapters(root) {
  const generatorRoot = path.join(root, "disposable-generator");
  await mkdir(path.join(generatorRoot, "src/skills"), { recursive: true });
  await cp(path.join(repositoryRoot, "config"), path.join(generatorRoot, "config"), { recursive: true });
  await mkdir(path.join(generatorRoot, "scripts"), { recursive: true });
  await cp(path.join(repositoryRoot, "scripts/agents-os.mjs"), path.join(generatorRoot, "scripts/agents-os.mjs"));
  for (const skill of ["case", "frame", "casebook-persistence"]) {
    await cp(path.join(repositoryRoot, "src/skills", skill), path.join(generatorRoot, "src/skills", skill), { recursive: true });
  }
  const generated = await exec(process.execPath, ["scripts/agents-os.mjs", "sync"], {
    cwd: generatorRoot,
    env: { PATH: process.env.PATH ?? "", HOME: path.join(root, "sandbox-home") },
  });
  assert.deepEqual(generated.stdout.trim().split("\n"), ["synced pi", "synced codex", "synced opencode"]);
  return { generatorRoot };
}

async function validateGeneratedBytes(generatorRoot) {
  const sourceSkills = path.join(generatorRoot, "src/skills");
  const expectedSkills = Object.fromEntries(await Promise.all(["case", "frame", "casebook-persistence"].map(async (skill) => [
    skill,
    generatedSkillBytes(await readFile(path.join(sourceSkills, skill, "SKILL.md"), "utf8")),
  ])));
  const relevantSupport = [
    "case/references/persistence.md", "case/references/intake.md", "case/references/reconcile.md", "case/references/explore.md",
    "frame/references/persistence.md", "frame/references/state.md", "frame/references/discovery.md",
  ];
  const requiredOperations = ["case.create", "case.commit_revision", "case.read", "common.search", "frame.create", "frame.commit_revision", "frame.read", "frame.list"];
  const results = [];

  for (const target of targetNames) {
    const skillsRoot = path.join(generatorRoot, "adapters", target, "generated/skills");
    for (const skill of ["case", "frame", "casebook-persistence"]) {
      assert.equal(await readFile(path.join(skillsRoot, skill, "SKILL.md"), "utf8"), expectedSkills[skill], `${target} ${skill} generated guidance bytes`);
    }
    for (const relative of relevantSupport) {
      assert.deepEqual(await readFile(path.join(skillsRoot, relative)), await readFile(path.join(sourceSkills, relative)), `${target} ${relative} support bytes`);
    }
    const caseProcedure = await readFile(path.join(skillsRoot, "case/references/persistence.md"), "utf8");
    const frameProcedure = await readFile(path.join(skillsRoot, "frame/references/persistence.md"), "utf8");
    const modelFacingProcedure = `${caseProcedure}\n${frameProcedure}`;
    assert.match(modelFacingProcedure, /never a source-tree or live-sync fallback/i);
    assert.match(modelFacingProcedure, /There is no fallback or dual write/i);
    assert.match(modelFacingProcedure, /Do not substitute filesystem globbing, grep, direct/i);
    assert.match(modelFacingProcedure, /pending_classification/);
    assert.match(modelFacingProcedure, /awaiting_case/);
    assert.match(modelFacingProcedure, /separate Frame and Case owner commits/i);
    assert.match(modelFacingProcedure, /requested_audience_ceiling: "private"/);

    const packageRoot = path.join(skillsRoot, "casebook-persistence");
    const manifestBytes = await readFile(path.join(packageRoot, "manifest.json"));
    const manifest = JSON.parse(manifestBytes);
    assert.equal(manifest.assets.length, 26, `${target} manifest asset count`);
    for (const operation of requiredOperations) assert.ok(manifest.supported_operations.includes(operation), `${target} manifest ${operation}`);
    for (const asset of manifest.assets) {
      assert.equal(sha256(await readFile(path.join(packageRoot, asset.path))), asset.sha256, `${target} digest ${asset.path}`);
    }
    assert.equal(aggregateContentDigest(manifest.assets), manifest.content_digest.sha256, `${target} aggregate content digest`);
    results.push({ target, skillsRoot, packageRoot, manifestSha256: sha256(manifestBytes), contentDigest: manifest.content_digest.sha256 });
  }
  assert.equal(new Set(results.map((item) => item.manifestSha256)).size, 1);
  assert.equal(new Set(results.map((item) => item.contentDigest)).size, 1);
  return results;
}

function marker() {
  return {
    configuration_version: 1,
    authority_mode: "markdown",
    profile: "file-authoritative-markdown-v1",
    workspace_id: ids.markdownStore,
    view: { id: ids.markdownView, policy_revision_id: ids.markdownPolicy, audience_ceiling: "private" },
  };
}

function context(viewId, policyId, operation) {
  return {
    view_id: viewId,
    view_policy_revision_id: policyId,
    purpose: `L11-W03 final generated semantic flow: ${operation}`,
    requested_audience_ceiling: "private",
  };
}

function configuration(mode, locator, target, sqliteBinary) {
  return mode === "markdown"
    ? { source: { kind: "l11-w03-sandbox", locator: `generated:${target}:markdown` }, authority_mode: "markdown", markdown: { workspace_root: locator } }
    : { source: { kind: "l11-w03-sandbox", locator: `generated:${target}:sqlite` }, authority_mode: "sqlite", sqlite: { database_url: locator, sqlite_bin: sqliteBinary } };
}

function request(state, operation, extra = {}) {
  return {
    protocol,
    operation,
    request_version: 1,
    store_id: state.storeId,
    context: context(state.viewId, state.policyId, operation),
    configuration: state.configuration,
    ...extra,
  };
}

function caseRecord(id, namespaceId, title) {
  return {
    id,
    home_namespace_id: namespaceId,
    state: "active",
    title,
    summary: "Ordinary model-facing Case meaning persisted only through the selected connector.",
    scope: "Disposable L11-W03 generated semantic-flow evidence only.",
    aliases: [],
    facets: [],
    entries: id === ids.reconcileCase ? [{
      id: ids.knowledge,
      state: "active",
      version: {
        display_label: "CK-001",
        title: "Selected authority is singular",
        purpose: "Prove ordinary reconciliation preserves typed Case meaning.",
        classification: "accepted",
        body: "One explicit connector owns each ordinary persistence operation.",
        visibility: "private",
        provenance: { acting_role: "case", authority_basis: "synthetic semantic-flow proof" },
        positions: [], relationships: [], references: [],
      },
    }] : [],
    sources: [], relationships: [], references: [],
  };
}

function frameRecord(namespaceId, target) {
  return {
    id: ids.frame,
    home_namespace_id: namespaceId,
    authority_scope_namespace_ids: [namespaceId],
    status: "active",
    title: `${target} natural-boundary Frame`,
    outcome: "Discover and account for every material result without crossing owner authority.",
    discovery: [{
      id: ids.discovery,
      display_order: 0,
      lifecycle: "active",
      category: "frontier",
      title: "Generated semantic-flow Discovery",
      body: "A natural boundary requires human classification and separate Case realization.",
      human_authority: "required",
      dependencies: [],
    }],
    disposition_boundaries: [],
    case_dispositions: [],
  };
}

function accountedFrame(frame, mode) {
  const result = structuredClone(frame);
  const version = (id) => mode === "markdown" ? { version_id: id } : {};
  result.disposition_boundaries = [{
    id: ids.boundary,
    ...version(ids.boundaryVersion),
    display_label: "DB-001",
    display_order: 0,
    title: "Final generated semantic-flow boundary",
    basis: "Inventory every material result before separate owner commits.",
    evidence_locators: [{ uri: "artifact://l11-w03/boundary", audience: "private" }],
    closure: "open",
    disposition_ids: [ids.pending, ids.intake, ids.reconcile, ids.noCase],
  }];
  result.case_dispositions = [{
    id: ids.pending, ...version(ids.pendingVersion), boundary_id: ids.boundary,
    result_summary: "Human judgment is still required", classification_state: "pending_classification",
    pending_reason: "The result's reusable boundary is not yet clear.", resume_condition: "Obtain bounded human classification judgment.",
  }, {
    id: ids.intake, ...version(ids.intakeVersion), boundary_id: ids.boundary,
    result_summary: "New reusable meaning needs Intake", classification_state: "classified", disposition: "intake",
    rationale: "The meaning is independently reusable.", realization_state: "awaiting_case", case_id: ids.intakeCase,
    case_operation_id: "operation:l11-w03-intake-realization", affected_case_entry_display_ids: ["CK-001"],
  }, {
    id: ids.reconcile, ...version(ids.reconcileVersion), boundary_id: ids.boundary,
    result_summary: "Existing reusable meaning needs Reconcile", classification_state: "classified", disposition: "reconcile",
    rationale: "The prior conclusion needs an accepted qualification.", realization_state: "awaiting_case", case_id: ids.reconcileCase,
    case_operation_id: "operation:l11-w03-reconcile-realization", affected_case_entry_display_ids: ["CK-001"],
  }, {
    id: ids.noCase, ...version(ids.noCaseVersion), boundary_id: ids.boundary,
    result_summary: "Transient execution detail", classification_state: "classified", disposition: "no_case",
    no_case_reason: "The detail is retained evidence without independently reusable meaning.",
  }];
  return result;
}

async function initializeAuthority(mode, root, target, sqliteBinary, entrypoint) {
  if (mode === "markdown") {
    const workspace = path.join(root, "selected-markdown-authority");
    await mkdir(workspace, { recursive: true });
    const selected = marker();
    await writeFile(path.join(workspace, WORKSPACE_MARKER), canonicalJson(selected));
    return {
      mode,
      locator: workspace,
      storeId: selected.workspace_id,
      viewId: selected.view.id,
      policyId: selected.view.policy_revision_id,
      namespaceId: ids.namespace,
      configuration: configuration(mode, workspace, target, sqliteBinary),
    };
  }
  const database = path.join(root, "selected-sqlite-authority.sqlite3");
  const selectedConfiguration = configuration(mode, database, target, sqliteBinary);
  const initialized = await invoke(entrypoint, root, {
    protocol,
    operation: "initialize_store",
    operation_id: `operation:l11-w03-${target}-sqlite-initialize`,
    authority_claim: { human_authorized: true, acting_role: "test-operator", authority_basis: "explicit disposable sandbox initialization" },
    configuration: selectedConfiguration,
  });
  assert.equal(initialized.exitCode, 0, `${target} SQLite initialize: ${JSON.stringify(initialized.json)}`);
  const selection = initialized.json.result.initialization;
  return {
    mode,
    locator: database,
    storeId: selection.store_id,
    viewId: selection.view.id,
    policyId: selection.view.policy_revision_id,
    namespaceId: selection.namespace.id,
    configuration: selectedConfiguration,
  };
}

async function assertFailClosed(entrypoint, root, state, target) {
  const missing = await invoke(entrypoint, root, {
    ...request(state, "case.read", { case_id: ids.reconcileCase }),
    configuration: { source: { kind: "l11-w03-sandbox", locator: `generated:${target}:missing` } },
  });
  assert.equal(missing.exitCode, 2);
  assert.equal(missing.json.failure.code, state.mode === "markdown" ? "authority_mode_invalid" : "case.substrate_failure");

  const ambiguous = await invoke(entrypoint, root, {
    ...request(state, "frame.read", { frame_id: ids.frame }),
    configuration: { ...state.configuration, authority_mode: ["markdown", "sqlite"] },
  });
  assert.equal(ambiguous.exitCode, 2);
  assert.equal(ambiguous.json.failure.code, state.mode === "markdown" ? "authority_mode_invalid" : "frame.substrate_failure");

  const forbiddenShadow = state.mode === "markdown" ? path.join(root, "forbidden-shadow.sqlite3") : path.join(root, "forbidden-shadow-markdown");
  const dualConfiguration = state.mode === "markdown"
    ? { ...state.configuration, sqlite: { database_url: forbiddenShadow, sqlite_bin: state.configuration.sqlite?.sqlite_bin } }
    : { ...state.configuration, markdown: { workspace_root: forbiddenShadow } };
  const dual = await invoke(entrypoint, root, { ...request(state, "case.read", { case_id: ids.reconcileCase }), configuration: dualConfiguration });
  assert.equal(dual.exitCode, 2);
  assert.equal(dual.json.failure.code, state.mode === "markdown" ? "dual_authority_rejected" : "case.substrate_failure");
  assert.equal(await stat(forbiddenShadow).then(() => true).catch(() => false), false, `${target} ${state.mode} dual authority did not write`);

  const fallback = await invoke(entrypoint, root, {
    ...request(state, "case.read", { case_id: ids.reconcileCase }),
    configuration: { ...state.configuration, fallback_authority_mode: state.mode === "markdown" ? "sqlite" : "markdown" },
  });
  assert.equal(fallback.exitCode, 2);
  assert.equal(fallback.json.failure.code, state.mode === "markdown" ? "configuration_field_unsupported" : "case.substrate_failure");
}

async function exerciseSemanticFlow(packageRoot, runtimeRoot, target, mode, sqliteBinary) {
  await mkdir(runtimeRoot, { recursive: true });
  const conventionalWorkspace = path.join(runtimeRoot, ".casebook");
  const conventionalCanary = "conventional live-style workspace must remain untouched\n";
  await mkdir(conventionalWorkspace);
  await writeFile(path.join(conventionalWorkspace, "DO-NOT-ACCESS"), conventionalCanary);
  await writeFile(path.join(conventionalWorkspace, WORKSPACE_MARKER), "not selected authority\n");
  const entrypoint = path.join(packageRoot, `variants/${mode}/bin/casebook-persistence.mjs`);
  const state = await initializeAuthority(mode, runtimeRoot, target, sqliteBinary, entrypoint);

  const baseCreated = await invoke(entrypoint, runtimeRoot, request(state, "case.create", {
    operation_id: `operation:l11-w03-${target}-${mode}-base-intake`, expected_revision: 0,
    commit_basis: "ordinary model-facing Case intake through selected authority",
    provenance: { acting_role: "case-intake", authority_basis: "synthetic semantic-flow proof" },
    case: caseRecord(ids.reconcileCase, state.namespaceId, `${target} ${mode} intake Case`),
  }));
  assert.equal(baseCreated.exitCode, 0, `${target} ${mode} Case intake: ${JSON.stringify(baseCreated.json)}`);
  if (mode === "markdown") {
    assert.match(baseCreated.json.result.current_committed_version_evidence.id, /^case-revision:/);
    assert.equal(baseCreated.json.result.current_committed_version_evidence.content_digest, baseCreated.json.result.persistence.content_digest);
    assert.equal(baseCreated.json.result.current_committed_version_evidence.semantics, "current_selected_content_only");
  }

  const initialFrame = frameRecord(state.namespaceId, target);
  const frameCreated = await invoke(entrypoint, runtimeRoot, request(state, "frame.create", {
    operation_id: `operation:l11-w03-${target}-${mode}-frame-create`, expected_revision: 0,
    commit_basis: "ordinary model-facing Frame discovery through selected authority",
    provenance: { acting_role: "frame", authority_basis: "synthetic human-authorized Frame" }, frame: initialFrame,
  }));
  assert.equal(frameCreated.exitCode, 0, `${target} ${mode} Frame create: ${JSON.stringify(frameCreated.json)}`);

  const discovered = await invoke(entrypoint, runtimeRoot, request(state, "frame.read", {
    frame_id: ids.frame,
    ...(mode === "sqlite" ? { include: { discovery: "all_selected", case_dispositions: "all_selected" } } : {}),
  }));
  assert.equal(discovered.exitCode, 0, `${target} ${mode} Frame read: ${JSON.stringify(discovered.json)}`);
  assert.equal(discovered.json.result.frame.discovery[0].id, ids.discovery);

  const accounted = accountedFrame(mode === "markdown" ? discovered.json.result.frame : initialFrame, mode);
  const accountedCommit = await invoke(entrypoint, runtimeRoot, request(state, "frame.commit_revision", {
    operation_id: `operation:l11-w03-${target}-${mode}-account`, frame_id: ids.frame,
    ...(mode === "markdown" ? { expected_digest: discovered.json.result.persistence.aggregate_digest } : { expected_revision: discovered.json.result.revision.number }),
    commit_basis: "record complete natural-boundary accounting before separate Case commits",
    provenance: { acting_role: "frame", authority_basis: "synthetic human classification judgment" }, frame: accounted,
  }));
  assert.equal(accountedCommit.exitCode, 0, `${target} ${mode} Frame accounting: ${JSON.stringify(accountedCommit.json)}`);
  assert.deepEqual(accountedCommit.json.result.completion_evidence.completion_blocks.map((item) => item.kind), ["pending_classification", "awaiting_case"]);

  const intake = await invoke(entrypoint, runtimeRoot, request(state, "case.create", {
    operation_id: "operation:l11-w03-intake-realization", expected_revision: 0,
    commit_basis: "realize Intake in a separate Case owner commit",
    provenance: { acting_role: "case-intake", authority_basis: "synthetic semantic-flow proof" },
    case: caseRecord(ids.intakeCase, state.namespaceId, `${target} ${mode} separately realized Intake`),
  }));
  assert.equal(intake.exitCode, 0, `${target} ${mode} separate Intake: ${JSON.stringify(intake.json)}`);

  const caseRead = await invoke(entrypoint, runtimeRoot, request(state, "case.read", { case_id: ids.reconcileCase }));
  assert.equal(caseRead.exitCode, 0, `${target} ${mode} Case read: ${JSON.stringify(caseRead.json)}`);
  if (mode === "markdown") assert.deepEqual(caseRead.json.result.current_committed_version_evidence, baseCreated.json.result.current_committed_version_evidence);
  const reconciled = await invoke(entrypoint, runtimeRoot, request(state, "case.commit_revision", {
    operation_id: "operation:l11-w03-reconcile-realization",
    ...(mode === "markdown" ? { expected_digest: caseRead.json.result.persistence.content_digest } : { expected_revision: caseRead.json.result.revision.number }),
    commit_basis: "realize Reconcile in a separate Case owner commit",
    provenance: { acting_role: "case-reconcile", authority_basis: "synthetic accepted qualification" },
    case: { ...caseRead.json.result.case, title: `${target} ${mode} reconciled Case` },
  }));
  assert.equal(reconciled.exitCode, 0, `${target} ${mode} Case reconcile: ${JSON.stringify(reconciled.json)}`);
  if (mode === "markdown") {
    assert.notEqual(reconciled.json.result.current_committed_version_evidence.id, caseRead.json.result.current_committed_version_evidence.id);
    assert.equal(reconciled.json.result.current_committed_version_evidence.content_digest, reconciled.json.result.current_digest);
  }

  const afterCaseCommits = await invoke(entrypoint, runtimeRoot, request(state, "frame.read", {
    frame_id: ids.frame,
    ...(mode === "sqlite" ? { include: { discovery: "all_selected", case_dispositions: "all_selected" } } : {}),
  }));
  assert.equal(afterCaseCommits.exitCode, 0);
  assert.deepEqual(afterCaseCommits.json.result.frame.case_dispositions.slice(1, 3).map((item) => item.realization_state), ["awaiting_case", "awaiting_case"], "Case commits do not implicitly mutate Frame accounting");

  const finalFrame = mode === "markdown"
    ? structuredClone(afterCaseCommits.json.result.frame)
    : accountedFrame(initialFrame, mode);
  finalFrame.status = "completed";
  Object.assign(finalFrame.discovery[0], {
    lifecycle: "settled", category: "settled", disposition: "accepted",
    resolution: "Every material result was classified and separate Case owner commits were observed.",
  });
  finalFrame.disposition_boundaries[0].closure = "closed";
  finalFrame.case_dispositions[0] = {
    id: ids.pending,
    ...(mode === "markdown" ? { version_id: ids.pendingVersion } : {}),
    boundary_id: ids.boundary,
    result_summary: "Human judgment is still required",
    classification_state: "classified",
    disposition: "no_case",
    no_case_reason: "Bounded human review established that this result is transient.",
  };
  Object.assign(finalFrame.case_dispositions[1], {
    realization_state: "settled",
    observed_case_revision_id: mode === "markdown" ? intake.json.result.current_committed_version_evidence.id : intake.json.result.revision.id,
  });
  Object.assign(finalFrame.case_dispositions[2], {
    realization_state: "settled",
    pinned_case_revision_id: mode === "markdown" ? reconciled.json.result.current_committed_version_evidence.id : reconciled.json.result.revision.id,
  });

  if (mode === "markdown") {
    const staleEvidence = structuredClone(finalFrame);
    staleEvidence.case_dispositions[2].pinned_case_revision_id = baseCreated.json.result.current_committed_version_evidence.id;
    const staleCommit = await invoke(entrypoint, runtimeRoot, request(state, "frame.commit_revision", {
      operation_id: `operation:l11-w03-${target}-markdown-stale-case-evidence`, frame_id: ids.frame,
      expected_digest: afterCaseCommits.json.result.persistence.aggregate_digest,
      commit_basis: "stale replaced Case content must not settle current realization",
      provenance: { acting_role: "frame", authority_basis: "synthetic negative conformance proof" }, frame: staleEvidence,
    }));
    assert.equal(staleCommit.exitCode, 2, `${target} Markdown stale Case evidence: ${JSON.stringify(staleCommit.json)}`);
    assert.equal(staleCommit.json.failure.evidence.violations[0].rule, "case_realization_evidence_not_current");
  }

  const finalCommit = await invoke(entrypoint, runtimeRoot, request(state, "frame.commit_revision", {
    operation_id: `operation:l11-w03-${target}-${mode}-final-frame`, frame_id: ids.frame,
    ...(mode === "markdown" ? { expected_digest: afterCaseCommits.json.result.persistence.aggregate_digest } : { expected_revision: afterCaseCommits.json.result.revision.number }),
    commit_basis: "settle exact visible current Case version evidence in a fresh Frame commit",
    provenance: { acting_role: "frame", authority_basis: "synthetic human completion judgment" }, frame: finalFrame,
  }));
  assert.equal(finalCommit.exitCode, 0, `${target} ${mode} final Frame: ${JSON.stringify(finalCommit.json)}`);
  assert.equal(finalCommit.json.result.completion_evidence.cross_owner_completion.state, "settled");
  assert.deepEqual(finalCommit.json.result.completion_evidence.completion_blocks, []);
  assert.equal(finalCommit.json.result.frame.disposition_boundaries[0].closure, "closed");

  const finalCaseRead = await invoke(entrypoint, runtimeRoot, request(state, "case.read", { case_id: ids.reconcileCase }));
  assert.equal(finalCaseRead.exitCode, 0);
  assert.equal(finalCaseRead.json.result.case.title, `${target} ${mode} reconciled Case`);
  if (mode === "markdown") assert.deepEqual(finalCaseRead.json.result.current_committed_version_evidence, reconciled.json.result.current_committed_version_evidence);
  await assertFailClosed(entrypoint, runtimeRoot, state, target);
  assert.equal(await readFile(path.join(conventionalWorkspace, "DO-NOT-ACCESS"), "utf8"), conventionalCanary);
  assert.equal(await readFile(path.join(conventionalWorkspace, WORKSPACE_MARKER), "utf8"), "not selected authority\n");
}

test("L11-W03 sandbox-generated semantic flow gates Pi, Codex, and OpenCode under exclusive Markdown and SQLite authority", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "casebook-l11-w03-final-gate-"));
  try {
    const sqliteBinary = await selectCompatibleSqliteBinary();
    const { generatorRoot } = await generateAdapters(sandbox);
    const generated = await validateGeneratedBytes(generatorRoot);

    const disabledSource = path.join(generatorRoot, "source-skills-disabled");
    await rename(path.join(generatorRoot, "src/skills"), disabledSource);
    for (const target of generated) {
      for (const mode of ["markdown", "sqlite"]) {
        await exerciseSemanticFlow(
          target.packageRoot,
          path.join(sandbox, "isolated-runtime", target.target, mode),
          target.target,
          mode,
          sqliteBinary,
        );
      }
    }
    assert.equal(await stat(disabledSource).then(() => true).catch(() => false), true, "generated flows ran with disposable source skills disabled");
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
  assert.equal(await stat(sandbox).then(() => true).catch(() => false), false);
});
