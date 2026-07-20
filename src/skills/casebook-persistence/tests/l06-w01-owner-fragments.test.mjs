import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mechanicalDigest } from "../variants/sqlite/lib/substrate/mechanical.mjs";
import { selectCompatibleSqliteBinary } from "./sandbox-harness.mjs";

const execFileAsync = promisify(execFile);
const entrypoint = new URL("../variants/sqlite/bin/casebook-persistence.mjs", import.meta.url).pathname;
const protocol = { id: "casebook-persistence-json", version: 1 };
const ids = {
  case: "case:11111111-1111-4111-8111-111111111111",
  publicSource: "source:22222222-2222-4222-8222-222222222222",
  privateSource: "source:33333333-3333-4333-8333-333333333333",
  publicEvidence: "evidence:44444444-4444-4444-8444-444444444444",
  privateEvidence: "evidence:55555555-5555-4555-8555-555555555555",
  knowledge: "knowledge:12121212-1212-4212-8212-121212121212",
  frame: "frame:66666666-6666-4666-8666-666666666666",
  discovery: "discovery:77777777-7777-4777-8777-777777777777",
  boundary: "disposition-boundary:88888888-8888-4888-8888-888888888888",
  pending: "case-disposition:99999999-9999-4999-8999-999999999999",
  intake: "case-disposition:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  reconcile: "case-disposition:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  noCase: "case-disposition:cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  intakeCase: "case:dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  reconcileCase: "case:eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  artifact: "artifact:ffffffff-ffff-4fff-8fff-ffffffffffff",
};

function invoke(cwd, request) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [entrypoint], {
      cwd,
      env: { PATH: process.env.PATH ?? "", HOME: cwd },
    }, (error, stdout, stderr) => resolve({ code: error ? 2 : 0, json: JSON.parse(stdout), stderr }));
    child.stdin.end(JSON.stringify(request));
  });
}

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l06-w01-"));
  const sqliteBin = await selectCompatibleSqliteBinary();
  const store = path.join(root, "store.db");
  const configuration = {
    source: { kind: "test", locator: "l06-w01" },
    authority_mode: "sqlite",
    sqlite: { database_url: store, sqlite_bin: sqliteBin },
  };
  const initialized = await invoke(root, {
    protocol,
    operation: "initialize_store",
    operation_id: "operation:l06-w01:init",
    authority_claim: { human_authorized: true, acting_role: "test", authority_basis: "disposable owner-fragment test" },
    configuration,
  });
  assert.equal(initialized.code, 0, initialized.stderr);
  const state = initialized.json.result.initialization;
  const context = {
    view_id: state.view.id,
    view_policy_revision_id: state.view.policy_revision_id,
    purpose: "produce an immutable audience-safe owner fragment",
    requested_audience_ceiling: "private",
  };
  return {
    root,
    store,
    sqliteBin,
    configuration,
    state,
    common: { protocol, request_version: 1, store_id: state.store_id, context, configuration },
  };
}

function caseRecord(state, title = "Owner fragment Case") {
  return {
    id: ids.case,
    home_namespace_id: state.state.namespace.id,
    state: "active",
    title,
    summary: "Complete export source",
    scope: "L06-W01",
    aliases: [],
    facets: [],
    entries: [{
      id: ids.knowledge,
      state: "active",
      version: {
        display_label: "CK-001",
        title: "Accepted claim without a declared reader Source",
        purpose: "exercise fail-closed claim evidence",
        classification: "accepted",
        body: "This accepted claim requires an explicit reader-safe Source trace.",
        visibility: "public",
        provenance: { acting_role: "case", authority_basis: "synthetic accepted meaning" },
        references: [],
      },
    }],
    sources: [{
      id: ids.publicSource,
      state: "active",
      display_label: "S1",
      version: {
        title: "Public source",
        accessed_at: "2026-07-20T00:00:00Z",
        examined_for: "owner fragment",
        visibility: "public",
        locators: [{ kind: "reader", uri: "https://example.test/public", audience: "public", digest: "a".repeat(64) }],
      },
      fragments: [{
        id: ids.publicEvidence,
        state: "active",
        version: { excerpt: "public evidence", purpose: "support", captured_at: "2026-07-20T00:00:00Z", visibility: "public" },
      }],
    }, {
      id: ids.privateSource,
      state: "active",
      display_label: "S2",
      version: {
        title: "PRIVATE SOURCE TITLE",
        accessed_at: "2026-07-20T00:00:00Z",
        examined_for: "owner fragment",
        visibility: "private",
        locators: [{ kind: "internal", uri: "file:///private/source", audience: "private" }],
      },
      fragments: [{
        id: ids.privateEvidence,
        state: "active",
        version: { excerpt: "PRIVATE EVIDENCE BYTES", purpose: "support", captured_at: "2026-07-20T00:00:00Z", visibility: "private" },
      }],
    }],
    relationships: [],
    references: [],
  };
}

function frameRecord(state, title = "Candidate-2 export Frame") {
  return {
    id: ids.frame,
    home_namespace_id: state.state.namespace.id,
    authority_scope_namespace_ids: [state.state.namespace.id],
    status: "active",
    title,
    outcome: "Every material result has an explicit disposition.",
    discovery: [{
      id: ids.discovery,
      display_order: 0,
      lifecycle: "active",
      category: "frontier",
      title: "Complete the disposition sweep",
      body: "Frame and Case settlement stay separate.",
      human_authority: "required",
      dependencies: [],
    }],
    artifact_links: [{
      artifact_id: ids.artifact,
      kind: "research",
      title: "Private retained artifact",
      locator: { uri: "file:///private/artifact", audience: "private", digest: "sha256:artifact" },
    }],
    disposition_boundaries: [{
      id: ids.boundary,
      display_label: "DB-001",
      display_order: 0,
      title: "Candidate-2 natural boundary",
      closure: "open",
      evidence_locators: [
        { uri: "https://example.test/boundary", audience: "public", digest: "sha256:boundary" },
        { uri: "file:///private/boundary", audience: "private", digest: "sha256:private-boundary" },
      ],
      disposition_ids: [ids.pending, ids.intake, ids.reconcile, ids.noCase],
    }],
    case_dispositions: [{
      id: ids.pending,
      boundary_id: ids.boundary,
      result_summary: "Judgment remains pending",
      classification_state: "pending_classification",
      pending_reason: "Evidence has not been judged.",
      resume_condition: "Review retained evidence.",
      evidence_locators: [{ uri: "https://example.test/pending", audience: "public" }],
    }, {
      id: ids.intake,
      boundary_id: ids.boundary,
      result_summary: "New reusable meaning",
      classification_state: "classified",
      disposition: "intake",
      rationale: "A new Case is required.",
      realization_state: "awaiting_case",
      case_id: ids.intakeCase,
      case_operation_id: "operation:l06-w01:intake",
    }, {
      id: ids.reconcile,
      boundary_id: ids.boundary,
      result_summary: "Existing reusable meaning",
      classification_state: "classified",
      disposition: "reconcile",
      rationale: "An existing Case requires reconciliation.",
      realization_state: "awaiting_case",
      case_id: ids.reconcileCase,
      case_operation_id: "operation:l06-w01:reconcile",
    }, {
      id: ids.noCase,
      boundary_id: ids.boundary,
      result_summary: "Transient result",
      classification_state: "classified",
      disposition: "no_case",
      no_case_reason: "No reusable meaning remains.",
    }],
  };
}

async function commit(state, operation, operationId, expectedRevision, ownerField, value) {
  return invoke(state.root, {
    ...state.common,
    operation,
    operation_id: operationId,
    expected_revision: expectedRevision,
    commit_basis: "L06-W01 source revision",
    provenance: { acting_role: ownerField, authority_basis: "synthetic owner judgment" },
    ...(operation === "frame.commit_revision" ? { frame_id: value.id } : {}),
    [ownerField]: value,
  });
}

async function canonicalCounts(state) {
  const { stdout } = await execFileAsync(state.sqliteBin, ["-batch", "-noheader", state.store,
    "SELECT (SELECT count(*) FROM owner_revisions)||'|'||(SELECT count(*) FROM owner_events)||'|'||(SELECT count(*) FROM store_operation_receipts);"], { encoding: "utf8" });
  return stdout.trim();
}

function assertDigest(fragment) {
  const { digest, ...core } = fragment;
  assert.equal(digest, mechanicalDigest(core));
}

function assertCommonFragment(fragment, state, kind, ownerId, selectedRevision, currentRevision) {
  assert.equal(fragment.owner.kind, kind);
  assert.equal(fragment.owner.id, ownerId);
  assert.deepEqual(fragment.selected_revision, selectedRevision);
  assert.deepEqual(fragment.observed_current_revision, currentRevision);
  assert.equal(fragment.drift.status, selectedRevision.id === currentRevision.id ? "current" : "historical");
  assert.deepEqual(fragment.applied_policy, {
    view_id: state.common.context.view_id,
    view_policy_revision_id: state.common.context.view_policy_revision_id,
    audience: "public",
  });
  assert.equal(fragment.authority.publication, "not_granted");
  assert.equal(fragment.authority.canonical_mutation, "not_granted");
  assert.equal(fragment.mutation_performed, false);
  assert.equal(fragment.publication_performed, false);
  assertDigest(fragment);
}

test("Case fragments carry immutable current/historical drift, exact policy, safe evidence, omissions, and a deterministic digest", async () => {
  const state = await setup();
  try {
    const created = await commit(state, "case.create", "operation:l06-w01:case-create", 0, "case", caseRecord(state));
    assert.equal(created.code, 0, JSON.stringify(created.json));
    const revised = await commit(state, "case.commit_revision", "operation:l06-w01:case-revise", 1, "case", caseRecord(state, "Current Case title"));
    assert.equal(revised.code, 0, JSON.stringify(revised.json));
    const before = await canonicalCounts(state);
    const request = { ...state.common, operation: "case.export.fragment", case_id: ids.case, revision_number: 1, audience: "public", evidence_selection: [] };
    const first = await invoke(state.root, request);
    const second = await invoke(state.root, request);
    assert.equal(first.code, 0, JSON.stringify(first.json));
    assert.deepEqual(second.json, first.json);
    const fragment = first.json.result.fragment;
    assertCommonFragment(fragment, state, "case", ids.case, created.json.result.revision, revised.json.result.revision);
    assert.equal(fragment.fragment_schema, "case-owner-export-fragment@3");
    assert.equal(fragment.stable_identities.some((item) => item.stable_id === ids.publicEvidence && item.kind === "evidence"), true);
    assert.deepEqual(fragment.locators.map((item) => item.uri), ["https://example.test/public"]);
    assert.equal(fragment.evidence.fragments.some((item) => item.evidence_id === ids.publicEvidence), true);
    assert.deepEqual(fragment.evidence.claims, [{
      claim_id: ids.knowledge,
      classification: "accepted",
      source_ids: [],
      evidence_ids: [],
      status: "reader_safe_source_absent",
    }]);
    assert.equal(fragment.omissions.some((item) => item.stable_id === ids.knowledge && item.reason === "accepted_claim_lacks_reader_safe_source"), true);
    assert.equal(fragment.omissions.some((item) => item.stable_id === ids.privateSource && item.consequential), true);
    assert.equal(fragment.status, "blocked");
    assert.equal(JSON.stringify(fragment).includes("PRIVATE SOURCE TITLE"), false);
    assert.equal(JSON.stringify(fragment).includes("PRIVATE EVIDENCE BYTES"), false);
    assert.equal(JSON.stringify(fragment).includes("file:///private/source"), false);
    assert.equal(await canonicalCounts(state), before);

    const current = await invoke(state.root, { ...request, revision_number: undefined });
    assert.equal(current.code, 0, JSON.stringify(current.json));
    assert.equal(current.json.result.fragment.drift.status, "current");
    assert.deepEqual(current.json.result.fragment.selected_revision, revised.json.result.revision);

    const inactivePolicy = await invoke(state.root, {
      ...request,
      context: { ...request.context, view_policy_revision_id: "view-policy:00000000-0000-4000-8000-000000000000" },
    });
    assert.equal(inactivePolicy.code, 2);
    assert.equal(inactivePolicy.json.failure.code, "case.view_invalid_or_unavailable");
    assert.equal(JSON.stringify(inactivePolicy.json).includes("PRIVATE SOURCE TITLE"), false);
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("Frame fragments cover complete candidate-2 dispositions with historical drift and audience-safe locator evidence", async () => {
  const state = await setup();
  try {
    const created = await commit(state, "frame.create", "operation:l06-w01:frame-create", 0, "frame", frameRecord(state));
    assert.equal(created.code, 0, JSON.stringify(created.json));
    const revised = await commit(state, "frame.commit_revision", "operation:l06-w01:frame-revise", 1, "frame", frameRecord(state, "Current Frame title"));
    assert.equal(revised.code, 0, JSON.stringify(revised.json));
    const before = await canonicalCounts(state);
    const request = { ...state.common, operation: "frame.export.fragment", frame_id: ids.frame, revision_id: created.json.result.revision.id, audience: "public" };
    const first = await invoke(state.root, request);
    const second = await invoke(state.root, request);
    assert.equal(first.code, 0, JSON.stringify(first.json));
    assert.deepEqual(second.json, first.json);
    const fragment = first.json.result.fragment;
    assertCommonFragment(fragment, state, "frame", ids.frame, created.json.result.revision, revised.json.result.revision);
    assert.equal(fragment.fragment_schema, "frame-owner-export-fragment@1");
    assert.equal(fragment.owner_status, "active");
    assert.deepEqual(fragment.frame.case_dispositions.map((item) => item.disposition ?? item.classification_state), [
      "pending_classification", "intake", "reconcile", "no_case",
    ]);
    assert.equal(fragment.stable_identities.some((item) => item.stable_id === ids.boundary && item.kind === "disposition_boundary"), true);
    assert.equal(fragment.stable_identities.some((item) => item.stable_id === ids.reconcile && item.kind === "case_disposition"), true);
    assert.deepEqual(fragment.locators.map((item) => item.uri).sort(), ["https://example.test/boundary", "https://example.test/pending"]);
    assert.equal(fragment.evidence.locators.length, 2);
    assert.equal(fragment.redactions.some((item) => item.path.includes("disposition_boundaries") && item.consequential), true);
    assert.equal(fragment.omissions.some((item) => item.reason === "machine_local_locator_prohibited"), true);
    assert.equal(fragment.status, "blocked");
    assert.equal(fragment.completion_evidence.cross_owner_completion.state, "partial");
    assert.equal(JSON.stringify(fragment).includes("file:///private"), false);
    assert.equal(await canonicalCounts(state), before);

    const current = await invoke(state.root, { ...request, revision_id: undefined });
    assert.equal(current.code, 0, JSON.stringify(current.json));
    assert.equal(current.json.result.fragment.drift.status, "current");
    assert.deepEqual(current.json.result.fragment.selected_revision, revised.json.result.revision);
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});
