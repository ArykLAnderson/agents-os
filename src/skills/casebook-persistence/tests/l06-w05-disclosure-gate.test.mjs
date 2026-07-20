import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mechanicalDigest } from "../variants/sqlite/lib/substrate/mechanical.mjs";
import {
  cleanupSandbox,
  generateAndValidateSandbox,
  selectCompatibleSqliteBinary,
} from "./sandbox-harness.mjs";

const protocol = { id: "casebook-persistence-json", version: 1 };
const ids = Object.freeze({
  targetCase: "case:b52a7d60-4883-4204-8777-cd95e73b105a",
  partialCase: "case:1c303bfa-23e5-4298-b9ec-376f4eec5c91",
  source: "source:fbb75992-9d53-4160-8140-a7d5d0945cb1",
  partialSource: "source:d802bef2-2a09-479f-a775-b4948be97eae",
  evidence: "evidence:5e0ed7b4-436f-4369-a4b1-5f9e93b38e7b",
  privateFacet: "facet:66687fdf-c8f6-4047-90fc-ae0947d4687d",
  currentFrame: "frame:9c97fd12-b3cf-4e56-9a49-65d0673ee9c9",
  staleFrame: "frame:2533e5a0-6f49-42de-8bb0-d71e51a8a0d8",
  unknownFrame: "frame:0bb0b606-64fb-4819-85f0-552e30670162",
  currentDiscovery: "discovery:ac39e84b-2e82-4f03-8bc8-b7b16bcb4dca",
  staleDiscovery: "discovery:c4507d21-e4d9-485f-bb4d-11e83987987d",
  unknownDiscovery: "discovery:e3b2f58a-e341-43ca-961d-98957a0484ba",
  document: "document:a9f3ceb6-b0fb-45cf-8fdd-d9900777070a",
  documentRevision: "document-revision:25bef1b0-3358-43f4-9543-d8e928ff0877",
  claim: "claim:73c48a17-cb45-4565-a173-4a18f9665f2a",
  replacementPolicy: "view-policy:b52a7d60-4883-4204-8777-cd95e73b105a",
});
const publicLocator = Object.freeze({
  kind: "reader",
  uri: "https://example.test/l06-w05#evidence",
  audience: "public",
  digest: "a".repeat(64),
});
const privateLocator = Object.freeze({
  kind: "internal",
  uri: "file:///private/l06-w05/source",
  audience: "private",
});
const authorityClaim = Object.freeze({
  human_authorized: true,
  acting_role: "architect",
  authority_basis: "disposable L06-W05 independent disclosure gate",
});

function invoke(entrypoint, cwd, request, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [entrypoint], {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? "", HOME: cwd, ...extraEnv },
    }, (error, stdout, stderr) => {
      let json = null;
      try { json = stdout ? JSON.parse(stdout) : null; } catch { /* a controlled kill has no response */ }
      resolve({ code: error ? (error.signal ?? error.code ?? 2) : 0, json, stderr });
    });
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

async function exists(value) {
  return stat(value).then(() => true).catch(() => false);
}

function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function setup(entrypoint, root, target, sqliteBinary) {
  const working = path.join(root, `work-${target}`);
  await mkdir(working, { recursive: true });
  const store = path.join(root, `${target}.sqlite3`);
  const configuration = {
    source: { kind: "synthetic-test", locator: `l06-w05:${target}` },
    authority_mode: "sqlite",
    sqlite: { database_url: store, sqlite_bin: sqliteBinary },
  };
  const initialized = await invoke(entrypoint, working, {
    protocol,
    operation: "initialize_store",
    operation_id: `operation:l06-w05:${target}:initialize`,
    authority_claim: authorityClaim,
    configuration,
  });
  assert.equal(initialized.code, 0, initialized.stderr || JSON.stringify(initialized.json));
  const initialization = initialized.json.result.initialization;
  return {
    target,
    entrypoint,
    root,
    working,
    store,
    sqliteBinary,
    configuration,
    initialization,
    context: {
      view_id: initialization.view.id,
      view_policy_revision_id: initialization.view.policy_revision_id,
      purpose: "L06-W05 independent final disclosure gate",
      requested_audience_ceiling: "private",
    },
    serial: 0,
  };
}

function common(state, operation, fields = {}) {
  return {
    protocol,
    operation,
    request_version: 1,
    store_id: state.initialization.store_id,
    context: state.context,
    configuration: state.configuration,
    ...fields,
  };
}

function call(state, operation, fields = {}, extraEnv = {}) {
  return invoke(state.entrypoint, state.working, common(state, operation, fields), extraEnv);
}

function targetCase(state, summary = "Current reader-safe export evidence") {
  return {
    id: ids.targetCase,
    home_namespace_id: state.initialization.namespace.id,
    state: "active",
    title: "Disclosure gate Case",
    summary,
    scope: "Disposable L06-W05 evidence",
    aliases: [],
    facets: [],
    entries: [],
    sources: [{
      id: ids.source,
      state: "active",
      display_label: "S1",
      version: {
        title: "Public reader evidence",
        accessed_at: "2026-07-20T00:00:00Z",
        examined_for: "final disclosure gate",
        visibility: "public",
        locators: [publicLocator],
      },
      fragments: [{
        id: ids.evidence,
        state: "active",
        version: {
          excerpt: "A verified logical export remains distinct from publication.",
          purpose: "Support the composed disclosure claim",
          captured_at: "2026-07-20T00:00:00Z",
          visibility: "public",
        },
      }],
    }],
    relationships: [],
    references: [],
  };
}

function partialCase(state) {
  return {
    id: ids.partialCase,
    home_namespace_id: state.initialization.namespace.id,
    state: "active",
    title: "Optional disclosure context",
    summary: "Public owner with explicitly omitted nonconsequential private context",
    scope: "Disposable L06-W05 optional evidence",
    aliases: [],
    facets: [{
      id: ids.privateFacet,
      state: "active",
      version: { key: "private-note", value: "PRIVATE OPTIONAL BYTES", visibility: "private" },
    }],
    entries: [],
    sources: [{
      id: ids.partialSource,
      state: "active",
      display_label: "S1",
      version: {
        title: "Optional public source",
        accessed_at: "2026-07-20T00:00:00Z",
        examined_for: "locator omission",
        visibility: "public",
        locators: [publicLocator, privateLocator],
      },
      fragments: [],
    }],
    relationships: [],
    references: [],
  };
}

function frame(state, id, discoveryId, observedRevisionId) {
  return {
    id,
    home_namespace_id: state.initialization.namespace.id,
    authority_scope_namespace_ids: [state.initialization.namespace.id],
    status: "active",
    title: `Disclosure dependency ${id.slice(6, 14)}`,
    outcome: "Dependency currentness remains mechanically disclosed.",
    discovery: [{
      id: discoveryId,
      display_order: 0,
      lifecycle: "active",
      category: "frontier",
      title: "Disclosure dependency",
      body: "Current, stale, unknown, and historical dependency states stay distinct.",
      human_authority: "not_required",
      dependencies: [{
        target_kind: "case",
        target_id: ids.targetCase,
        predicate: "depends-on",
        provenance: "synthetic semantic dependency",
        ...(observedRevisionId == null ? {} : { observed_revision_id: observedRevisionId }),
      }],
    }],
    artifact_links: [{
      artifact_id: `artifact:${discoveryId.slice(discoveryId.indexOf(":") + 1)}`,
      kind: "research",
      title: "Reader disclosure evidence",
      locator: { uri: publicLocator.uri, audience: "public", digest: "sha256:reader" },
    }],
    disposition_boundaries: [],
    case_dispositions: [],
  };
}

async function createOwner(state, kind, owner, label) {
  const result = await call(state, `${kind}.create`, {
    operation_id: `operation:l06-w05:${state.target}:${label}:create`,
    expected_revision: 0,
    commit_basis: "L06-W05 generated-copy fixture",
    provenance: { acting_role: kind, authority_basis: "synthetic owner fixture" },
    [kind]: owner,
  });
  assert.equal(result.code, 0, result.stderr || JSON.stringify(result.json));
  return result.json.result.revision;
}

async function reviseOwner(state, kind, owner, expectedRevision, label) {
  const result = await call(state, `${kind}.commit_revision`, {
    operation_id: `operation:l06-w05:${state.target}:${label}:revise`,
    expected_revision: expectedRevision.number,
    commit_basis: "advance current disclosure state",
    provenance: { acting_role: kind, authority_basis: "synthetic owner fixture" },
    ...(kind === "frame" ? { frame_id: owner.id } : {}),
    [kind]: owner,
  });
  assert.equal(result.code, 0, JSON.stringify(result.json) || result.stderr);
  return result.json.result.revision;
}

function destination(state, label) {
  return {
    classification: "publication_staging",
    temporary_path: path.join(state.root, `${state.target}-${label}.preflight`),
    final_path: path.join(state.root, `${state.target}-${label}.final`),
  };
}

function preflight(state, label, fields) {
  state.serial += 1;
  return call(state, "export.preflight", {
    operation_id: `operation:l06-w05:${state.target}:${label}:preflight:${state.serial}`,
    authority_claim: authorityClaim,
    audience: "public",
    destination: destination(state, label),
    ...fields,
  });
}

function documentTrace(evidence, overrides = {}) {
  const text = "The composed artifact says that verified export is not publication.";
  const claim = {
    claim_id: ids.claim,
    text,
    text_digest: sha256Text(text),
    consequence_classification: "consequential",
    evidence: overrides.evidence ?? [evidence],
  };
  const core = {
    trace_schema: "document-claim-trace@1",
    document: { id: ids.document, revision_id: ids.documentRevision },
    claims: [claim],
  };
  return { ...core, digest: overrides.digest ?? mechanicalDigest(core) };
}

function finalizeRequest(state, label, preflightResult, overrides = {}) {
  const selectedDestination = destination(state, label);
  return common(state, "export.finalize", {
    operation_id: overrides.operationId ?? `operation:l06-w05:${state.target}:${label}:finalize`,
    authority_claim: {
      ...authorityClaim,
      authority_basis: "finalize this exact verified bundle without publishing or mutating owners",
    },
    destination: selectedDestination,
    expected: {
      observation_fence: preflightResult.observation_fence,
      manifest_digest: preflightResult.manifest.digest,
      bundle_digest: preflightResult.bundle.digest,
      destination_digest: mechanicalDigest(selectedDestination),
      ...(overrides.expected ?? {}),
    },
  });
}

function receiptRequest(state, operationId) {
  return common(state, "get_store_operation_receipt", {
    operation_id: operationId,
    authority_claim: authorityClaim,
    context: { ...state.context, purpose: "receipt-first L06-W05 recovery" },
  });
}

async function ownerCounts(state) {
  return new Promise((resolve, reject) => execFile(state.sqliteBinary, [
    "-batch", "-noheader", state.store,
    "SELECT (SELECT count(*) FROM owner_revisions)||'|'||(SELECT count(*) FROM owner_events);",
  ], { encoding: "utf8" }, (error, stdout, stderr) => error ? reject(new Error(stderr)) : resolve(stdout.trim())));
}

function assertNoAuthority(value) {
  assert.equal(value.authority.publication, "not_granted");
  assert.equal(value.authority.canonical_mutation, "not_granted");
  assert.equal(value.publication_performed, false);
  if ("canonical_owner_mutation_performed" in value) assert.equal(value.canonical_owner_mutation_performed, false);
  if ("mutation_performed" in value) assert.equal(value.mutation_performed, false);
}

async function readyPreflight(state, label, owners, trace = null) {
  const result = await preflight(state, label, {
    mode: "current",
    owners,
    ...(trace == null ? {} : { document_trace: trace }),
  });
  assert.equal(result.code, 0, result.stderr || JSON.stringify(result.json));
  assert.equal(result.json.result.status, "ready", JSON.stringify(result.json.result));
  assertNoAuthority(result.json.result);
  return result.json.result;
}

async function exerciseGeneratedCopy(state) {
  const caseV1 = await createOwner(state, "case", targetCase(state, "Historical reader-safe evidence"), "target");
  await createOwner(state, "case", partialCase(state), "partial");
  const staleFrameV1 = await createOwner(state, "frame", frame(state, ids.staleFrame, ids.staleDiscovery, caseV1.id), "stale-frame");
  await createOwner(state, "frame", frame(state, ids.unknownFrame, ids.unknownDiscovery, null), "unknown-frame");
  const caseV2 = await reviseOwner(state, "case", targetCase(state), caseV1, "target");
  const staleFrameCurrent = frame(state, ids.staleFrame, ids.staleDiscovery, caseV1.id);
  staleFrameCurrent.title = "Current revision of stale dependency Frame";
  await reviseOwner(state, "frame", staleFrameCurrent, staleFrameV1, "stale-frame");
  await createOwner(state, "frame", frame(state, ids.currentFrame, ids.currentDiscovery, caseV2.id), "current-frame");
  const countsBeforeExport = await ownerCounts(state);

  const currentCaseFragment = await call(state, "case.export.fragment", {
    case_id: ids.targetCase,
    audience: "public",
    evidence_selection: [ids.evidence],
  });
  assert.equal(currentCaseFragment.code, 0, currentCaseFragment.stderr || JSON.stringify(currentCaseFragment.json));
  const currentFrameFragment = await call(state, "frame.export.fragment", {
    frame_id: ids.currentFrame,
    audience: "public",
  });
  assert.equal(currentFrameFragment.code, 0, currentFrameFragment.stderr || JSON.stringify(currentFrameFragment.json));
  for (const fragment of [currentCaseFragment.json.result.fragment, currentFrameFragment.json.result.fragment]) {
    assert.equal(fragment.drift.status, "current");
    assert.equal(fragment.selected_revision.id, fragment.observed_current_revision.id);
    assertNoAuthority(fragment);
  }

  const historicalCaseFragment = await call(state, "case.export.fragment", {
    case_id: ids.targetCase,
    revision_id: caseV1.id,
    audience: "public",
    evidence_selection: [ids.evidence],
  });
  const historicalFrameFragment = await call(state, "frame.export.fragment", {
    frame_id: ids.staleFrame,
    revision_id: staleFrameV1.id,
    audience: "public",
  });
  for (const fragmentResult of [historicalCaseFragment, historicalFrameFragment]) {
    assert.equal(fragmentResult.code, 0, fragmentResult.stderr || JSON.stringify(fragmentResult.json));
    assert.equal(fragmentResult.json.result.fragment.drift.status, "historical");
    assert.notEqual(fragmentResult.json.result.fragment.selected_revision.id, fragmentResult.json.result.fragment.observed_current_revision.id);
  }

  const exportedEvidence = currentCaseFragment.json.result.fragment.evidence.fragments[0];
  const evidence = {
    owner_id: ids.targetCase,
    source_id: ids.source,
    evidence_id: ids.evidence,
    evidence_version_id: exportedEvidence.version_id,
    evidence_digest: exportedEvidence.digest,
    reader_locator: publicLocator,
    locator_digest: mechanicalDigest(publicLocator),
  };
  const owners = [
    { kind: "frame", id: ids.currentFrame, requirement: "required" },
    { kind: "case", id: ids.partialCase, requirement: "optional" },
    { kind: "case", id: ids.targetCase, requirement: "required", evidence_selection: [ids.evidence] },
  ];
  const atomic = await readyPreflight(state, "atomic", owners, documentTrace(evidence));
  assert.equal(atomic.currentness, "current_at_observation_fence");
  assert.equal(atomic.manifest.document_trace.status, "verified");
  assert.equal(atomic.manifest.document_trace.claims[0].status, "evidence_verified");
  assert.deepEqual(atomic.manifest.owners.map((item) => item.owner.id), [ids.partialCase, ids.targetCase, ids.currentFrame]);
  const optional = atomic.manifest.owners.find((item) => item.owner.id === ids.partialCase);
  assert.equal(optional.admission, "optional_nonconsequential");
  assert.equal(optional.status, "partial_nonconsequential");
  assert.equal(optional.omissions.some((item) => item.reason === "machine_local_locator_prohibited" && !item.consequential), true);
  assert.equal(optional.redactions.some((item) => item.stable_id === ids.privateFacet && !item.consequential), true);
  assert.equal(JSON.stringify(atomic.manifest).includes("PRIVATE OPTIONAL BYTES"), false);
  assert.equal(JSON.stringify(atomic.manifest).includes(privateLocator.uri), false);

  const requiredPartial = await preflight(state, "required-partial", {
    mode: "current",
    owners: [{ kind: "case", id: ids.partialCase, requirement: "required" }],
  });
  assert.equal(requiredPartial.json.result.status, "blocked");
  assert.equal(requiredPartial.json.result.manifest.blockers.some((item) => item.code === "required_fragment_partial"), true);
  assert.equal(await exists(destination(state, "required-partial").temporary_path), false);

  const unsupported = await preflight(state, "unsupported-claim", {
    mode: "current",
    owners: [{ kind: "case", id: ids.targetCase, requirement: "required", evidence_selection: [ids.evidence] }],
    document_trace: documentTrace(evidence, { evidence: [] }),
  });
  assert.equal(unsupported.json.result.status, "blocked");
  assert.equal(unsupported.json.result.manifest.blockers.some((item) => item.code === "document_consequential_claim_evidence_missing"), true);

  const unsafeEvidence = {
    ...evidence,
    reader_locator: { ...privateLocator, kind: "reader", audience: "public" },
    locator_digest: mechanicalDigest({ ...privateLocator, kind: "reader", audience: "public" }),
  };
  const unsafe = await preflight(state, "unsafe-locator", {
    mode: "current",
    owners: [{ kind: "case", id: ids.targetCase, requirement: "required", evidence_selection: [ids.evidence] }],
    document_trace: documentTrace(unsafeEvidence),
  });
  assert.equal(unsafe.json.result.status, "blocked");
  assert.equal(unsafe.json.result.manifest.blockers.some((item) => item.code === "document_reader_locator_unsafe"), true);
  assert.equal(JSON.stringify(unsafe.json.result).includes(privateLocator.uri), false, "blocked machine-local locator bytes are not rendered or echoed");
  assert.equal(await exists(destination(state, "unsafe-locator").temporary_path), false);

  for (const [label, frameId, expectedState] of [
    ["stale", ids.staleFrame, "materially_stale"],
    ["unknown", ids.unknownFrame, "unknown"],
  ]) {
    const blocked = await preflight(state, label, {
      mode: "current",
      owners: [{ kind: "frame", id: frameId, requirement: "required" }],
    });
    assert.equal(blocked.json.result.status, "blocked");
    assert.equal(blocked.json.result.manifest.dependencies[0].state, expectedState);
    assert.equal(blocked.json.result.manifest.blockers.some((item) => item.code === `${expectedState}_live_dependency`), true);
  }

  const historical = await preflight(state, "historical", {
    mode: "historical",
    owners: [{ kind: "frame", id: ids.staleFrame, requirement: "required", revision_id: staleFrameV1.id }],
  });
  assert.equal(historical.json.result.status, "ready", JSON.stringify(historical.json.result));
  assert.equal(historical.json.result.currentness, "non_current_historical");
  assert.equal(historical.json.result.manifest.owners[0].requested_revision_id, staleFrameV1.id);
  assert.equal(historical.json.result.manifest.owners[0].selected_revision.id, staleFrameV1.id);
  assert.equal(historical.json.result.manifest.dependencies[0].state, "historical");
  assert.equal(historical.json.result.manifest.dependencies[0].blocking, false);
  await rm(destination(state, "historical").temporary_path, { recursive: true, force: true });

  const mismatchCases = [
    ["fence-mismatch", { observation_fence: atomic.observation_fence + 1 }, "observation_fence_mismatch"],
    ["digest-mismatch", { bundle_digest: "0".repeat(64) }, "bundle_digest_mismatch"],
  ];
  for (const [label, expectedOverride, terminalCode] of mismatchCases) {
    const prepared = await readyPreflight(state, label, [
      { kind: "case", id: ids.targetCase, requirement: "required", evidence_selection: [ids.evidence] },
    ]);
    const operationId = `operation:l06-w05:${state.target}:${label}:finalize`;
    const settled = await invoke(state.entrypoint, state.working, finalizeRequest(state, label, prepared, {
      operationId,
      expected: expectedOverride,
    }));
    assert.equal(settled.code, 0, settled.stderr || JSON.stringify(settled.json));
    assert.equal(settled.json.result.terminal.outcome, "blocked");
    assert.equal(settled.json.result.terminal.code, terminalCode);
    assert.equal(settled.json.result.finalization.effect_performed, false);
    assertNoAuthority(settled.json.result);
    assert.equal(await exists(destination(state, label).temporary_path), false);
    assert.equal(await exists(destination(state, label).final_path), false);
    const receipt = await invoke(state.entrypoint, state.working, receiptRequest(state, operationId));
    assert.equal(receipt.json.result.status, "settled");
    assert.equal(receipt.json.result.receipt.result.terminal.code, terminalCode);
  }

  const nonAtomicPrepared = await readyPreflight(state, "non-atomic", [
    { kind: "case", id: ids.targetCase, requirement: "required", evidence_selection: [ids.evidence] },
  ]);
  const nonAtomicOperation = `operation:l06-w05:${state.target}:non-atomic:finalize`;
  const nonAtomic = await invoke(state.entrypoint, state.working, finalizeRequest(state, "non-atomic", nonAtomicPrepared, {
    operationId: nonAtomicOperation,
  }), { CASEBOOK_PERSISTENCE_TEST_FAULT: "export_force_non_atomic_destination" });
  assert.equal(nonAtomic.code, 0, nonAtomic.stderr || JSON.stringify(nonAtomic.json));
  assert.equal(nonAtomic.json.result.terminal.code, "non_atomic_destination_requires_separate_authorization");
  assert.equal(nonAtomic.json.result.finalization.atomicity, "non_atomic_declared_before_effect");
  assert.equal(nonAtomic.json.result.finalization.non_atomic_authorization, "separate_explicit_authorization_and_cleanup_plan_required");
  assert.equal(nonAtomic.json.result.finalization.effect_performed, false);
  assertNoAuthority(nonAtomic.json.result);
  assert.equal(await exists(destination(state, "non-atomic").final_path), false);

  const interruptedOperation = `operation:l06-w05:${state.target}:atomic:finalize`;
  const atomicRequest = finalizeRequest(state, "atomic", atomic, { operationId: interruptedOperation });
  const interrupted = await invoke(state.entrypoint, state.working, atomicRequest, {
    CASEBOOK_PERSISTENCE_TEST_FAULT: "export_after_rename_before_receipt",
  });
  assert.notEqual(interrupted.code, 0);
  assert.equal(interrupted.json, null);
  assert.equal(await exists(destination(state, "atomic").temporary_path), false);
  assert.equal(await exists(destination(state, "atomic").final_path), true);
  const absentReceipt = await invoke(state.entrypoint, state.working, receiptRequest(state, interruptedOperation));
  assert.equal(absentReceipt.json.result.status, "absent_at_fence");
  const recovered = await invoke(state.entrypoint, state.working, atomicRequest);
  assert.equal(recovered.code, 0, recovered.stderr || JSON.stringify(recovered.json));
  assert.equal(recovered.json.result.terminal.outcome, "finalized");
  assert.equal(recovered.json.result.finalization.atomicity, "atomic_rename");
  assert.equal(recovered.json.result.finalization.recovered_after_interruption, true);
  assert.equal(recovered.json.result.finalization.final_output.verified, true);
  assertNoAuthority(recovered.json.result);
  const replay = await invoke(state.entrypoint, state.working, atomicRequest);
  assert.equal(replay.json.result.idempotent_replay, true);
  assert.equal(JSON.parse(await readFile(path.join(destination(state, "atomic").final_path, "manifest.json"), "utf8")).digest, atomic.manifest.digest);

  const policyPrepared = await readyPreflight(state, "policy-mismatch", [
    { kind: "case", id: ids.targetCase, requirement: "required", evidence_selection: [ids.evidence] },
  ]);
  const revisedPolicy = await call(state, "view_policy.revise", {
    operation_id: `operation:l06-w05:${state.target}:policy:revise`,
    authority_claim: authorityClaim,
    predecessor_revision_id: state.context.view_policy_revision_id,
    policy: {
      view_id: state.context.view_id,
      view_policy_revision_id: ids.replacementPolicy,
      home_namespace_id: state.initialization.namespace.id,
      audience_ceiling: "private",
      namespace_ids: [state.initialization.namespace.id],
      object_kinds: ["case", "frame"],
      limits: { max_results: 100, max_traversal_depth: 5 },
      store_operation_receipts_visible: true,
    },
  });
  assert.equal(revisedPolicy.code, 0, revisedPolicy.stderr || JSON.stringify(revisedPolicy.json));
  const activatedPolicy = await call(state, "view_policy.activate", {
    operation_id: `operation:l06-w05:${state.target}:policy:activate`,
    authority_claim: authorityClaim,
    view_id: state.context.view_id,
    view_policy_revision_id: ids.replacementPolicy,
  });
  assert.equal(activatedPolicy.code, 0, activatedPolicy.stderr || JSON.stringify(activatedPolicy.json));
  const policyMismatch = await invoke(state.entrypoint, state.working, finalizeRequest(state, "policy-mismatch", policyPrepared));
  assert.equal(policyMismatch.code, 0, policyMismatch.stderr || JSON.stringify(policyMismatch.json));
  assert.equal(policyMismatch.json.result.terminal.outcome, "blocked");
  assert.equal(policyMismatch.json.result.terminal.code, "policy_binding_unavailable");
  assert.equal(policyMismatch.json.result.finalization.effect_performed, false);
  assertNoAuthority(policyMismatch.json.result);

  assert.equal(await ownerCounts(state), countsBeforeExport, "export disclosure and finalization never mutate canonical owners");
}

test("L06-W05 generated Pi, Codex, and OpenCode copies disclose final export truth without publication or canonical mutation authority", async () => {
  const sandboxRoot = await mkdtemp(path.join(os.tmpdir(), "casebook-l06-w05-final-gate-"));
  try {
    const sqliteBinary = await selectCompatibleSqliteBinary();
    const generated = await generateAndValidateSandbox({ sandboxRoot, sqliteBinary });
    assert.deepEqual(generated.results.map((item) => item.target), ["pi", "codex", "opencode"]);
    for (const generatedCopy of generated.results) {
      const entrypoint = path.join(generatedCopy.package_root, "variants/sqlite/bin/casebook-persistence.mjs");
      const state = await setup(entrypoint, generated.root, generatedCopy.target, sqliteBinary);
      await exerciseGeneratedCopy(state);
    }
  } finally {
    assert.equal(await cleanupSandbox(sandboxRoot), true);
  }
});
