import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalJson, WORKSPACE_MARKER } from "../shared/l01-interchange.mjs";
import { cleanupSandbox, generateAndValidateSandbox } from "./sandbox-harness.mjs";

const protocol = { id: "casebook-persistence-json", version: 1 };
const ids = {
  store: "store:85800006-f3e3-46d3-9902-f1b6307fb835",
  view: "view:b04102fc-e74d-48cb-b1fe-f2c64b7f7068",
  policy: "view-policy:196bee50-ca68-4b50-a367-da7ec316015a",
  namespace: "namespace:913b4553-d0c7-44ee-955f-7c7c9e198b8f",
  frame: "frame:8450e6d6-1a03-4605-8e60-a7670d85e3ad",
  discovery: "discovery:d0f8cebf-e2fa-43c2-a983-86516820b408",
  boundary: "disposition-boundary:879e888c-c9de-4942-9adc-089d00e44d81",
  pending: "case-disposition:7cc0ccce-56cd-405a-83e3-83c37ca2240b",
  noCase: "case-disposition:d2bde8d4-ea85-4607-8338-a9605a7eece6",
  boundaryVersion: "disposition-boundary-version:2b2a2f38-6d0e-4008-87f3-d5b02d390ae9",
  pendingVersion: "case-disposition-version:d2c6b897-b6da-425f-a575-9d09fdf033c2",
  noCaseVersion: "case-disposition-version:366cff6d-7469-4bf3-a6fb-4149afe2e927",
};
const sourceEntrypoint = new URL("../variants/markdown/bin/casebook-persistence.mjs", import.meta.url).pathname;
const PROFILE = "file-authoritative-markdown-v1";
const SELECTOR = ".casebook-frame-selected-generation.json";
const STAGE_PREFIX = ".casebook-owned-frame-stage-";
const GENERATION_PREFIX = ".casebook-owned-frame-generation-";

function marker() {
  return {
    configuration_version: 1,
    authority_mode: "markdown",
    profile: PROFILE,
    workspace_id: ids.store,
    view: { id: ids.view, policy_revision_id: ids.policy, audience_ceiling: "private" },
  };
}

function configuration(root, locator = "l05-w03-coherent-frame-generation") {
  return {
    source: { kind: "synthetic-test", locator },
    authority_mode: "markdown",
    markdown: { workspace_root: root },
  };
}

function context() {
  return {
    view_id: ids.view,
    view_policy_revision_id: ids.policy,
    purpose: "verify coherent Frame generation",
    requested_audience_ceiling: "private",
  };
}

function frame(overrides = {}) {
  return {
    id: ids.frame,
    home_namespace_id: ids.namespace,
    authority_scope_namespace_ids: [ids.namespace],
    status: "active",
    title: "Coherent Frame generation",
    outcome: "Select one complete aggregate generation.",
    discovery: [{
      id: ids.discovery,
      display_order: 0,
      lifecycle: "active",
      category: "frontier",
      title: "Retain the selected Discovery filename",
      body: "The owner manifest chooses exactly one file.",
      human_authority: "required",
      dependencies: [],
    }],
    disposition_boundaries: [{
      id: ids.boundary,
      version_id: ids.boundaryVersion,
      display_label: "DB-001",
      display_order: 0,
      title: "Natural result boundary",
      closure: "open",
      disposition_ids: [ids.pending, ids.noCase],
    }],
    case_dispositions: [{
      id: ids.pending,
      version_id: ids.pendingVersion,
      boundary_id: ids.boundary,
      result_summary: "Evidence still requires semantic judgment",
      classification_state: "pending_classification",
      pending_reason: "The bounded evidence is incomplete.",
      resume_condition: "Review the retained evidence.",
    }, {
      id: ids.noCase,
      version_id: ids.noCaseVersion,
      boundary_id: ids.boundary,
      result_summary: "Disposable command output",
      classification_state: "classified",
      disposition: "no_case",
      no_case_reason: "It has no reusable subject meaning.",
    }],
    ...overrides,
  };
}

function renderFrame(value, includeDispositions = false) {
  let bytes = `---\ntype: "frame"\nschema_version: 1\nid: "${value.id}"\nhome_namespace_id: "${value.home_namespace_id}"\nauthority_scope_namespace_ids: ["${value.home_namespace_id}"]\nstatus: "${value.status}"\ntitle: ${JSON.stringify(value.title)}\n---\n## Outcome\n\`\`\`json\n${JSON.stringify(value.outcome)}\n\`\`\`\n\n## Discovery\nSee the manifest-selected Discovery file.\n`;
  if (includeDispositions) {
    const content = {
      disposition_boundaries: value.disposition_boundaries.map((record, index) => ({ source_label: `DB-${String(index + 1).padStart(3, "0")}`, record })),
      case_dispositions: value.case_dispositions.map((record, index) => ({ source_label: `CD-${String(index + 1).padStart(3, "0")}`, record })),
    };
    bytes += `\n## Case Dispositions\n\`\`\`json\n${JSON.stringify(content)}\n\`\`\`\n`;
  }
  return bytes;
}

function renderDiscovery(value) {
  const item = value.discovery[0];
  return `## Frontier\n\n### AT-001: ${JSON.stringify(item.title)}\n- Human authority: ${item.human_authority}\n\n\`\`\`json\n${JSON.stringify(item.body)}\n\`\`\`\n\n`;
}

function invoke(entrypoint, cwd, request, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [entrypoint], {
      cwd,
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", HOME: cwd, ...extraEnv },
    }, (error, stdout, stderr) => resolve({
      exitCode: error ? 2 : 0,
      json: JSON.parse(stdout),
      stderr,
    }));
    child.stdin.end(JSON.stringify(request));
  });
}

function prepareRequest(root) {
  return {
    protocol,
    operation: "frame.legacy.prepare_reconciliation",
    request_version: 1,
    store_id: ids.store,
    context: context(),
    frame_id: ids.frame,
    configuration: configuration(root),
  };
}

function commitRequest(root, value, expectedDigest) {
  return {
    protocol,
    operation: "frame.commit_revision",
    request_version: 1,
    operation_id: "operation:l05-w03-frame-commit",
    store_id: ids.store,
    context: context(),
    expected_digest: expectedDigest,
    commit_basis: "complete non-merging Frame aggregate replacement",
    provenance: { acting_role: "frame-reconcile", authority_basis: "disposable focused evidence" },
    frame_id: ids.frame,
    frame: value,
    configuration: configuration(root),
  };
}

function readRequest(root) {
  return {
    protocol,
    operation: "frame.read",
    request_version: 1,
    store_id: ids.store,
    context: context(),
    frame_id: ids.frame,
    configuration: configuration(root),
  };
}

async function createLegacyWorkspace(parent, { filename = "discovery-map.md", dispositions = false } = {}) {
  const root = path.join(parent, "workspace");
  const owner = path.join(root, "frames", ids.frame.slice(6));
  await mkdir(owner, { recursive: true });
  await writeFile(path.join(root, WORKSPACE_MARKER), canonicalJson(marker()));
  await writeFile(path.join(owner, "frame.md"), renderFrame(frame(), dispositions));
  await writeFile(path.join(owner, filename), renderDiscovery(frame()));
  return { root, owner, filename };
}

async function entries(owner, prefix) {
  return (await readdir(owner)).filter((name) => name.startsWith(prefix)).sort();
}

async function waitFor(predicate, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("timed out waiting for condition");
}

async function removeRoot(root) {
  await rm(root, { recursive: true, force: true });
  assert.equal(await stat(root).then(() => true).catch(() => false), false);
}

test("Frame commit selects one validated aggregate generation and preserves legacy Discovery filename continuity", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l05-w03-generation-"));
  try {
    const workspace = await createLegacyWorkspace(root);
    const prepared = await invoke(sourceEntrypoint, root, prepareRequest(workspace.root));
    assert.equal(prepared.exitCode, 0, JSON.stringify(prepared.json));
    assert.equal(prepared.json.result.absent_in_legacy, true);
    assert.equal(prepared.json.result.legacy_disposition_state, "absent_in_legacy");
    assert.equal(prepared.json.result.requires_semantic_reconcile, true);
    assert.deepEqual(prepared.json.result.parsed.disposition_boundaries, []);
    assert.deepEqual(prepared.json.result.parsed.case_dispositions, []);
    assert.equal(prepared.json.result.selected_discovery_filename, "discovery-map.md");
    assert.equal(prepared.json.result.mutation_performed, false);

    const committed = await invoke(sourceEntrypoint, root, commitRequest(workspace.root, frame(), prepared.json.result.aggregate_digest));
    assert.equal(committed.exitCode, 0, JSON.stringify(committed.json));
    assert.equal(committed.json.result.status, "settled");
    assert.equal(committed.json.result.previous_aggregate_digest, prepared.json.result.aggregate_digest);
    assert.match(committed.json.result.current_aggregate_digest, /^[0-9a-f]{64}$/);
    assert.equal(committed.json.result.persistence.selected_discovery_filename, "discovery-map.md");
    assert.equal(committed.json.result.persistence.selection, "same_directory_atomic_manifest_rename");
    assert.deepEqual(await entries(workspace.owner, STAGE_PREFIX), []);
    assert.equal((await entries(workspace.owner, GENERATION_PREFIX)).length, 1);

    const selector = JSON.parse(await readFile(path.join(workspace.owner, SELECTOR), "utf8"));
    assert.equal(selector.aggregate_digest, committed.json.result.current_aggregate_digest);
    assert.equal(selector.selected_discovery_filename, "discovery-map.md");
    assert.deepEqual(Object.keys(selector.documents).sort(), ["discovery-map.md", "frame.md"]);
    assert.equal(selector.disposition_boundaries[0].id, ids.boundary);
    assert.equal(selector.disposition_boundaries[0].version_id, ids.boundaryVersion);
    assert.equal(selector.case_dispositions[1].version_id, ids.noCaseVersion);
    const generation = path.join(workspace.owner, selector.generation_directory);
    assert.deepEqual((await readdir(generation)).sort(), ["discovery-map.md", "frame.md", "generation-manifest.json"]);
    assert.match(await readFile(path.join(generation, "frame.md"), "utf8"), /## Case Dispositions\n```json/);
    assert.equal(await stat(path.join(generation, "discovery.md")).then(() => true).catch(() => false), false);

    await writeFile(path.join(workspace.owner, "frame.md"), "unselected legacy bytes are not authority\n");
    const read = await invoke(sourceEntrypoint, root, readRequest(workspace.root));
    assert.equal(read.exitCode, 0, JSON.stringify(read.json));
    assert.deepEqual(read.json.result.frame, frame());
    assert.equal(read.json.result.persistence.aggregate_digest, committed.json.result.current_aggregate_digest);
    assert.equal(read.json.result.persistence.selected_discovery_filename, "discovery-map.md");

    const stale = await invoke(sourceEntrypoint, root, commitRequest(workspace.root, { ...frame(), title: "Stale writer" }, prepared.json.result.aggregate_digest));
    assert.equal(stale.exitCode, 2);
    assert.equal(stale.json.failure.code, "frame.digest_conflict");
    assert.equal(stale.json.failure.evidence.current_digest, committed.json.result.current_aggregate_digest);
    assert.equal(JSON.parse(await readFile(path.join(workspace.owner, SELECTOR), "utf8")).aggregate_digest, committed.json.result.current_aggregate_digest);
  } finally {
    await removeRoot(root);
  }
});

test("strict Case Dispositions validation rejects incomplete or impossible content before generation selection", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l05-w03-strict-"));
  try {
    const workspace = await createLegacyWorkspace(root);
    const prepared = await invoke(sourceEntrypoint, root, prepareRequest(workspace.root));
    const originalFrame = await readFile(path.join(workspace.owner, "frame.md"), "utf8");

    const incomplete = frame();
    incomplete.disposition_boundaries[0].disposition_ids.pop();
    const missing = await invoke(sourceEntrypoint, root, commitRequest(workspace.root, incomplete, prepared.json.result.aggregate_digest));
    assert.equal(missing.exitCode, 2);
    assert.equal(missing.json.failure.code, "frame.invalid_representation");
    assert.equal(missing.json.failure.evidence.violations[0].rule, "disposition_membership_incomplete");

    const noReason = frame();
    delete noReason.case_dispositions[1].no_case_reason;
    const impossible = await invoke(sourceEntrypoint, root, commitRequest(workspace.root, noReason, prepared.json.result.aggregate_digest));
    assert.equal(impossible.exitCode, 2);
    assert.equal(impossible.json.failure.code, "frame.invalid_representation");
    assert.equal(impossible.json.failure.evidence.violations[0].rule, "required_bounded_string");

    const corruptStage = await invoke(
      sourceEntrypoint,
      root,
      commitRequest(workspace.root, frame(), prepared.json.result.aggregate_digest),
      { CASEBOOK_MARKDOWN_TEST_FAULT: "corrupt_staged_frame" },
    );
    assert.equal(corruptStage.exitCode, 2);
    assert.equal(corruptStage.json.failure.code, "markdown.manifest_incompatible");

    assert.equal(await readFile(path.join(workspace.owner, "frame.md"), "utf8"), originalFrame);
    assert.equal(await stat(path.join(workspace.owner, SELECTOR)).then(() => true).catch(() => false), false);
    assert.deepEqual(await entries(workspace.owner, STAGE_PREFIX), []);
    assert.deepEqual(await entries(workspace.owner, GENERATION_PREFIX), []);
  } finally {
    await removeRoot(root);
  }
});

test("present and absent legacy disposition preparation returns non-mutating reconciliation candidates without inference", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l05-w03-legacy-"));
  try {
    const absent = await createLegacyWorkspace(path.join(root, "absent"));
    const absentBefore = await Promise.all(["frame.md", absent.filename].map((name) => readFile(path.join(absent.owner, name), "utf8")));
    const absentResult = await invoke(sourceEntrypoint, root, prepareRequest(absent.root));
    assert.equal(absentResult.exitCode, 0, JSON.stringify(absentResult.json));
    assert.equal(absentResult.json.result.absent_in_legacy, true);
    assert.equal(absentResult.json.result.requires_semantic_reconcile, true);
    assert.equal(absentResult.json.result.completion_inferred, false);
    assert.equal(absentResult.json.result.no_case_inferred, false);
    assert.deepEqual(await Promise.all(["frame.md", absent.filename].map((name) => readFile(path.join(absent.owner, name), "utf8"))), absentBefore);

    const present = await createLegacyWorkspace(path.join(root, "present"), { filename: "discovery.md", dispositions: true });
    const presentBefore = await Promise.all(["frame.md", present.filename].map((name) => readFile(path.join(present.owner, name), "utf8")));
    const presentResult = await invoke(sourceEntrypoint, root, prepareRequest(present.root));
    assert.equal(presentResult.exitCode, 0, JSON.stringify(presentResult.json));
    assert.equal(presentResult.json.result.absent_in_legacy, false);
    assert.equal(presentResult.json.result.legacy_disposition_state, "present");
    assert.equal(presentResult.json.result.parsed.disposition_boundaries.length, 1);
    assert.equal(presentResult.json.result.parsed.case_dispositions.length, 2);
    assert.deepEqual(presentResult.json.result.disposition_boundary_candidates.map((item) => item.match), ["unmatched"]);
    assert.deepEqual(presentResult.json.result.case_disposition_candidates.map((item) => item.match), ["unmatched", "unmatched"]);
    assert.equal(presentResult.json.result.requires_semantic_reconcile, true);
    assert.equal(presentResult.json.result.mutation_performed, false);
    assert.equal(presentResult.json.result.rename_performed, false);
    assert.equal(presentResult.json.result.writeback_performed, false);
    assert.deepEqual(await Promise.all(["frame.md", present.filename].map((name) => readFile(path.join(present.owner, name), "utf8"))), presentBefore);
  } finally {
    await removeRoot(root);
  }
});

test("an interrupted multi-file write leaves the prior manifest selected and the next commit cleans attributable debris", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l05-w03-interrupt-"));
  try {
    const workspace = await createLegacyWorkspace(root);
    const prepared = await invoke(sourceEntrypoint, root, prepareRequest(workspace.root));
    const initial = await invoke(sourceEntrypoint, root, commitRequest(workspace.root, frame(), prepared.json.result.aggregate_digest));
    assert.equal(initial.exitCode, 0, JSON.stringify(initial.json));
    const selectorBefore = await readFile(path.join(workspace.owner, SELECTOR), "utf8");
    const revised = frame({ title: "Interrupted candidate" });

    const child = spawn(process.execPath, [sourceEntrypoint], {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH ?? "",
        HOME: root,
        CASEBOOK_MARKDOWN_TEST_FAULT: "stop_after_frame_generation_publish",
      },
    });
    child.stdin.end(JSON.stringify(commitRequest(workspace.root, revised, initial.json.result.current_aggregate_digest)));
    await waitFor(async () => (await entries(workspace.owner, GENERATION_PREFIX)).length === 2);
    assert.equal(await readFile(path.join(workspace.owner, SELECTOR), "utf8"), selectorBefore);
    child.kill("SIGKILL");
    await new Promise((resolve) => child.once("close", resolve));
    assert.equal((await entries(workspace.owner, GENERATION_PREFIX)).length, 2);

    const recovered = await invoke(sourceEntrypoint, root, commitRequest(workspace.root, revised, initial.json.result.current_aggregate_digest));
    assert.equal(recovered.exitCode, 0, JSON.stringify(recovered.json));
    assert.equal((await entries(workspace.owner, GENERATION_PREFIX)).length, 1);
    assert.deepEqual(await entries(workspace.owner, STAGE_PREFIX), []);
    assert.equal(JSON.parse(await readFile(path.join(workspace.owner, SELECTOR), "utf8")).aggregate_digest, recovered.json.result.current_aggregate_digest);
    assert.equal(recovered.json.result.persistence.interruption_debris.owner, "casebook-persistence");
  } finally {
    await removeRoot(root);
  }
});

test("generated Pi, Codex, and OpenCode copies preserve coherent Frame generation behavior", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l05-w03-generated-"));
  try {
    const generated = await generateAndValidateSandbox({ sandboxRoot: root });
    for (const target of generated.results) {
      const workspace = await createLegacyWorkspace(path.join(root, target.target));
      const entrypoint = path.join(target.package_root, "variants/markdown/bin/casebook-persistence.mjs");
      const prepared = await invoke(entrypoint, root, prepareRequest(workspace.root));
      assert.equal(prepared.exitCode, 0, `${target.target}: ${JSON.stringify(prepared.json)}`);
      const committed = await invoke(entrypoint, root, commitRequest(workspace.root, frame(), prepared.json.result.aggregate_digest));
      assert.equal(committed.exitCode, 0, `${target.target}: ${JSON.stringify(committed.json)}`);
      const read = await invoke(entrypoint, root, readRequest(workspace.root));
      assert.equal(read.exitCode, 0, `${target.target}: ${JSON.stringify(read.json)}`);
      assert.deepEqual(read.json.result.frame, frame());
      assert.deepEqual(await entries(workspace.owner, STAGE_PREFIX), []);
    }
  } finally {
    assert.equal(await cleanupSandbox(root), true);
  }
  assert.equal(await stat(root).then(() => true).catch(() => false), false);
});
