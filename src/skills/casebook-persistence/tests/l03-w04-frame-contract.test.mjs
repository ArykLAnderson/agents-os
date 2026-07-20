import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  l01DiscoveryEntries,
  renderL01DiscoveryMarkdown,
  renderL01FrameMarkdown,
} from "../variants/sqlite/lib/frame/index.mjs";
import { mechanicalDigest } from "../variants/sqlite/lib/substrate/mechanical.mjs";
import {
  cleanupSandbox,
  generateAndValidateSandbox,
  selectCompatibleSqliteBinary,
} from "./sandbox-harness.mjs";

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceEntrypoint = path.join(packageRoot, "variants/sqlite/bin/casebook-persistence.mjs");
const mechanicalDriver = path.join(packageRoot, "tests/internal-mechanical-driver.mjs");
const protocol = { id: "casebook-persistence-json", version: 1 };
const ids = Object.freeze({
  frame: "frame:7450e6d6-1a03-4605-8e60-a7670d85e3ad",
  secondFrame: "frame:05f120d7-c411-4a31-9da7-0b4fac9c218b",
  discovery: "discovery:c0f8cebf-e2fa-43c2-a983-86516820b408",
  secondDiscovery: "discovery:bca04096-64b7-4809-bdf9-e44032cbc96a",
  boundary: "disposition-boundary:779e888c-c9de-4942-9adc-089d00e44d81",
  pending: "case-disposition:6cc0ccce-56cd-405a-83e3-83c37ca2240b",
  intake: "case-disposition:b5a01ec2-13f1-49ad-bf3e-e9d4ae74f365",
  reconcile: "case-disposition:2162576c-9326-4d58-aadc-f7e5552ab9d0",
  noCase: "case-disposition:c2bde8d4-ea85-4607-8338-a9605a7eece6",
  intakeCase: "case:ef326f5e-3985-4c31-adc0-55f9014453cf",
  reconcileCase: "case:f69050f0-4b77-45fa-874f-43ad47d30819",
  namespaceB: "namespace:c5db27d0-c49f-48da-8afa-37c4c5910260",
  homeOnlyPolicy: "view-policy:dacf00fb-33ff-462f-8ace-5f12dac22a05",
  generatedFrame: "frame:69bfc16c-0e84-49e6-8b66-3fbe69fb2d54",
  generatedDiscovery: "discovery:ce14fd6e-a7b3-4398-9a8e-33ceb80cd229",
  generatedBoundary: "disposition-boundary:1b2a2f38-6d0e-4008-87f3-d5b02d390ae9",
  generatedPending: "case-disposition:c2c6b897-b6da-425f-a575-9d09fdf033c2",
  generatedAwaiting: "case-disposition:266cff6d-7469-4bf3-a6fb-4149afe2e927",
  generatedCase: "case:ca294c1a-07e6-43ac-82ea-c16d0659dca0",
});

function execFileWithInput(file, args, options, input) {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, options, (error, stdout, stderr) => {
      if (error) Object.assign(error, { stdout, stderr }), reject(error);
      else resolve({ stdout, stderr });
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
    return { code: 0, json: JSON.parse(stdout), stderr };
  } catch (error) {
    return {
      code: error.code,
      json: error.stdout ? JSON.parse(error.stdout) : {},
      stderr: error.stderr ?? "",
    };
  }
}

function context(state, purpose, policyRevisionId = state.initialization.view.policy_revision_id) {
  return {
    view_id: state.initialization.view.id,
    view_policy_revision_id: policyRevisionId,
    purpose,
    requested_audience_ceiling: "private",
  };
}

async function setup(entrypoint, root, label, sqliteBinary) {
  sqliteBinary ??= await selectCompatibleSqliteBinary();
  const store = path.join(root, `${label}.sqlite3`);
  const configuration = {
    source: { kind: "synthetic-test", locator: `l03-w04:${label}` },
    authority_mode: "sqlite",
    sqlite: { database_url: store, sqlite_bin: sqliteBinary },
  };
  const initialized = await invoke(entrypoint, root, {
    protocol,
    operation: "initialize_store",
    operation_id: `operation:l03-w04:${label}:initialize`,
    authority_claim: {
      human_authorized: true,
      acting_role: "contract-clerk",
      authority_basis: "disposable L03-W04 end-to-end evidence",
    },
    configuration,
  });
  assert.equal(initialized.code, 0, initialized.stderr || JSON.stringify(initialized.json));
  return { entrypoint, root, store, sqliteBinary, configuration, initialization: initialized.json.result.initialization };
}

function caseRequest(state, id, operationId, title, homeNamespaceId = state.initialization.namespace.id) {
  return {
    protocol,
    operation: "case.create",
    request_version: 1,
    operation_id: operationId,
    store_id: state.initialization.store_id,
    context: context(state, "commit separate Case realization evidence"),
    expected_revision: 0,
    commit_basis: "separate idempotent Case owner transaction",
    provenance: { acting_role: "case", authority_basis: "synthetic contract evidence" },
    case: {
      id,
      home_namespace_id: homeNamespaceId,
      state: "active",
      title,
      summary: "Committed Case realization evidence for a Frame disposition.",
      scope: "Disposable L03-W04 evidence only.",
    },
    configuration: state.configuration,
  };
}

function initialFrame(state, overrides = {}) {
  const home = state.initialization.namespace.id;
  return {
    id: ids.frame,
    home_namespace_id: home,
    authority_scope_namespace_ids: [home],
    status: "active",
    title: "Candidate-2 Frame contract gate",
    outcome: "Every material result has an explicit disposition state.",
    discovery: [{
      id: ids.discovery,
      display_order: 0,
      lifecycle: "active",
      category: "frontier",
      title: "Complete the natural-boundary sweep",
      body: "Case and Frame settlement remain separate transactions.",
      human_authority: "required",
      dependencies: [],
    }],
    disposition_boundaries: [{
      id: ids.boundary,
      display_label: "DB-001",
      display_order: 0,
      title: "Complete candidate-2 boundary",
      closure: "open",
      disposition_ids: [ids.pending, ids.intake, ids.reconcile, ids.noCase],
    }],
    case_dispositions: [{
      id: ids.pending,
      boundary_id: ids.boundary,
      result_summary: "Classification still requires judgment",
      classification_state: "pending_classification",
      pending_reason: "The retained evidence has not been judged.",
      resume_condition: "Review the bounded result evidence.",
    }, {
      id: ids.intake,
      boundary_id: ids.boundary,
      result_summary: "Reusable meaning needs a new Case",
      classification_state: "classified",
      disposition: "intake",
      rationale: "The result is durable and reusable.",
      realization_state: "awaiting_case",
      case_id: ids.intakeCase,
      case_operation_id: "operation:l03-w04:intake-case",
    }, {
      id: ids.reconcile,
      boundary_id: ids.boundary,
      result_summary: "Existing meaning needs reconciliation",
      classification_state: "classified",
      disposition: "reconcile",
      rationale: "The result changes an existing Case conclusion.",
      realization_state: "awaiting_case",
      case_id: ids.reconcileCase,
      case_operation_id: "operation:l03-w04:reconcile-case",
    }, {
      id: ids.noCase,
      boundary_id: ids.boundary,
      result_summary: "Transient execution output",
      classification_state: "classified",
      disposition: "no_case",
      no_case_reason: "The output is disposable execution evidence with no reusable meaning.",
    }],
    ...overrides,
  };
}

function frameMutation(state, operation, operationId, expectedRevision, frame, policyRevisionId) {
  return {
    protocol,
    operation,
    request_version: 1,
    operation_id: operationId,
    store_id: state.initialization.store_id,
    context: context(state, operation, policyRevisionId),
    expected_revision: expectedRevision,
    commit_basis: "complete candidate-2 Frame owner selection",
    provenance: { acting_role: "frame", authority_basis: "synthetic semantic-owner judgment" },
    ...(operation === "frame.commit_revision" ? { frame_id: frame.id } : {}),
    frame,
    configuration: state.configuration,
  };
}

function frameRead(state, frameId = ids.frame, extra = {}, policyRevisionId) {
  return {
    protocol,
    operation: "frame.read",
    request_version: 1,
    store_id: state.initialization.store_id,
    context: context(state, "read complete Frame state", policyRevisionId),
    frame_id: frameId,
    include: { discovery: "all_selected", case_dispositions: "all_selected" },
    configuration: state.configuration,
    ...extra,
  };
}

function dispositionRead(state, familyId, extra = {}, policyRevisionId) {
  return {
    protocol,
    operation: "frame.disposition.read",
    request_version: 1,
    store_id: state.initialization.store_id,
    context: context(state, "read stable disposition history", policyRevisionId),
    frame_id: ids.frame,
    family_id: familyId,
    configuration: state.configuration,
    ...extra,
  };
}

async function sqlite(state, sql, options = {}) {
  const { stdout } = await execFileAsync(state.sqliteBinary, ["-batch", "-bail", ...(options.json ? ["-json"] : []), state.store, sql], { encoding: "utf8" });
  return stdout.trim();
}

async function counts(state) {
  return JSON.parse(await sqlite(state, `
    SELECT
      (SELECT count(*) FROM owner_revisions) AS revisions,
      (SELECT count(*) FROM owner_events) AS events,
      (SELECT count(*) FROM store_operation_receipts) AS receipts;
  `, { json: true }))[0];
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function snapshot(filename, text) {
  const bytes = Buffer.from(text);
  return { filename, digest: sha256(bytes), bytes_base64: bytes.toString("base64") };
}

function withVersionIds(frame, revision) {
  const copy = structuredClone(frame);
  copy.discovery = copy.discovery.map((item) => ({
    ...item,
    version_id: revision.version_ids.discovery_items.find((candidate) => candidate.discovery_item_id === item.id).version_id,
  }));
  copy.disposition_boundaries = copy.disposition_boundaries.map((item) => ({
    ...item,
    version_id: revision.version_ids.disposition_boundaries.find((candidate) => candidate.disposition_boundary_id === item.id).version_id,
  }));
  copy.case_dispositions = copy.case_dispositions.map((item) => ({
    ...item,
    version_id: revision.version_ids.case_dispositions.find((candidate) => candidate.case_disposition_id === item.id).version_id,
  }));
  return copy;
}

function legacyRequest(state, frame, revision, { dispositionState = "present", bindDispositions = true } = {}) {
  const rendered = withVersionIds(frame, revision);
  if (dispositionState === "absent") {
    delete rendered.disposition_boundaries;
    delete rendered.case_dispositions;
  }
  const frameDocument = snapshot("frame.md", renderL01FrameMarkdown(rendered));
  const discoveryDocument = snapshot("discovery-map.md", renderL01DiscoveryMarkdown(frame));
  const manifest = {
    schema: "casebook-frame-legacy-manifest@1",
    renderer: { id: "casebook-l01-frame-markdown", version: 1 },
    frame_id: frame.id,
    frame_version_id: revision.version_ids.frame,
    base_revision_id: revision.id,
    base_revision_number: revision.number,
    documents: {
      [frameDocument.filename]: frameDocument.digest,
      [discoveryDocument.filename]: discoveryDocument.digest,
    },
    discovery_items: l01DiscoveryEntries(frame).map(({ item, display_label }) => ({
      display_label,
      id: item.id,
      version_id: revision.version_ids.discovery_items.find((candidate) => candidate.discovery_item_id === item.id).version_id,
    })),
    ...(bindDispositions ? {
      disposition_boundaries: frame.disposition_boundaries.map((item, index) => ({
        source_label: `DB-${String(index + 1).padStart(3, "0")}`,
        id: item.id,
        version_id: revision.version_ids.disposition_boundaries.find((candidate) => candidate.disposition_boundary_id === item.id).version_id,
      })),
      case_dispositions: frame.case_dispositions.map((item, index) => ({
        source_label: `CD-${String(index + 1).padStart(3, "0")}`,
        id: item.id,
        version_id: revision.version_ids.case_dispositions.find((candidate) => candidate.case_disposition_id === item.id).version_id,
      })),
    } : {}),
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  return {
    protocol,
    operation: "frame.legacy.prepare_reconciliation",
    request_version: 1,
    store_id: state.initialization.store_id,
    context: context(state, "prepare disposition-aware legacy reconciliation"),
    frame_id: frame.id,
    base_revision: { id: revision.id, number: revision.number },
    documents: [frameDocument, discoveryDocument],
    machine_manifest: { digest: sha256(manifestBytes), bytes_base64: manifestBytes.toString("base64") },
    configuration: state.configuration,
  };
}

async function grantSecondNamespace(state) {
  await sqlite(state, `
    INSERT INTO namespaces VALUES ('${ids.namespaceB}', 'l03-w04-private', 'active', 'synthetic-test');
    DROP TRIGGER view_policy_grants_only_while_created;
    INSERT INTO view_policy_namespace_grants
    VALUES ('${state.initialization.view.policy_revision_id}', '${ids.namespaceB}');
  `);
}

async function rotateToHomeOnlyPolicy(state) {
  const prior = state.initialization.view.policy_revision_id;
  await sqlite(state, `
    BEGIN IMMEDIATE;
    INSERT INTO view_policy_revisions
      (view_policy_revision_id, view_id, revision_number, audience_ceiling, lifecycle,
       authority_claim_json, object_kinds_json, store_operation_receipts_visible,
       predecessor_revision_id, activation_fence, created_at)
    SELECT '${ids.homeOnlyPolicy}', view_id, revision_number + 1, audience_ceiling, 'created',
      authority_claim_json, object_kinds_json, store_operation_receipts_visible,
      view_policy_revision_id, NULL, 'synthetic-test'
    FROM view_policy_revisions WHERE view_policy_revision_id='${prior}';
    INSERT INTO view_policy_namespace_grants
    VALUES ('${ids.homeOnlyPolicy}', '${state.initialization.namespace.id}');
    UPDATE view_policy_revisions SET lifecycle='superseded'
    WHERE view_policy_revision_id='${prior}';
    UPDATE view_policy_revisions SET lifecycle='active',
      activation_fence=(SELECT operation_fence FROM store_fence WHERE singleton=1)
    WHERE view_policy_revision_id='${ids.homeOnlyPolicy}';
    COMMIT;
  `);
  return ids.homeOnlyPolicy;
}

function frameList(state, extra = {}, policyRevisionId) {
  return {
    protocol,
    operation: "frame.list",
    request_version: 1,
    store_id: state.initialization.store_id,
    context: context(state, "list Frame lifecycle", policyRevisionId),
    configuration: state.configuration,
    ...extra,
  };
}

async function corruptCaseDispositionShape(state) {
  const rows = JSON.parse(await sqlite(state, `
    SELECT version_id, content_json
    FROM owner_versions
    WHERE family_id='${ids.pending}';
  `, { json: true }));
  assert.equal(rows.length, 1);
  const content = JSON.parse(rows[0].content_json);
  content.disposition = "no_case";
  content.no_case_reason = "Impossible alongside pending classification.";
  const digest = mechanicalDigest(content);
  await sqlite(state, `
    DROP TRIGGER owner_versions_immutable_update;
    UPDATE owner_versions
    SET content_json=CAST(X'${Buffer.from(JSON.stringify(content)).toString("hex")}' AS TEXT),
        content_digest='${digest}'
    WHERE version_id='${rows[0].version_id}';
  `);
}

test("candidate-2 Frame walkthrough preserves lifecycle, privacy, paging, conflict/replay, disposition history, legacy evidence, and partial recovery", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l03-w04-contract-"));
  try {
    const state = await setup(sourceEntrypoint, root, "contract");
    await grantSecondNamespace(state);
    const home = state.initialization.namespace.id;
    const frame = initialFrame(state, { authority_scope_namespace_ids: [home, ids.namespaceB] });
    const createRequest = frameMutation(state, "frame.create", "operation:l03-w04:frame-create", 0, frame);
    const created = await invoke(state.entrypoint, root, createRequest);
    assert.equal(created.code, 0, JSON.stringify(created.json));
    assert.equal(created.json.result.completion_evidence.cross_owner_completion.state, "partial");
    assert.deepEqual(created.json.result.completion_evidence.completion_blocks.map((item) => item.kind), [
      "pending_classification",
      "awaiting_case",
    ]);
    assert.equal(created.json.result.frame.case_dispositions[3].no_case_reason, frame.case_dispositions[3].no_case_reason);

    const secondFrame = initialFrame(state, {
      id: ids.secondFrame,
      title: "Second active Frame for fenced paging",
      discovery: [{
        ...frame.discovery[0],
        id: ids.secondDiscovery,
        title: "Remain active while the first Frame completes",
      }],
      disposition_boundaries: [],
      case_dispositions: [],
    });
    const secondCreated = await invoke(state.entrypoint, root, frameMutation(
      state,
      "frame.create",
      "operation:l03-w04:second-frame-create",
      0,
      secondFrame,
    ));
    assert.equal(secondCreated.code, 0, JSON.stringify(secondCreated.json));

    const pageOneRequest = frameList(state, { limit: 1 });
    const pageOne = await invoke(state.entrypoint, root, pageOneRequest);
    assert.equal(pageOne.code, 0, JSON.stringify(pageOne.json));
    assert.equal(pageOne.json.result.items.length, 1);
    assert.equal(typeof pageOne.json.result.next_cursor, "string");
    assert.equal(pageOne.json.result.result_completeness, "complete_within_bounds");
    const pageTwo = await invoke(state.entrypoint, root, { ...pageOneRequest, cursor: pageOne.json.result.next_cursor });
    assert.equal(pageTwo.code, 0, JSON.stringify(pageTwo.json));
    assert.equal(pageTwo.json.result.items.length, 1);
    assert.notEqual(pageTwo.json.result.items[0].id, pageOne.json.result.items[0].id);

    const createReceipt = await invoke(state.entrypoint, root, {
      protocol,
      operation: "frame.get_operation_receipt",
      request_version: 1,
      store_id: state.initialization.store_id,
      context: context(state, "recover uncertain partial Frame response"),
      frame_id: ids.frame,
      operation_id: createRequest.operation_id,
      configuration: state.configuration,
    });
    assert.equal(createReceipt.code, 0, JSON.stringify(createReceipt.json));
    assert.equal(createReceipt.json.result.status, "settled");
    assert.equal(createReceipt.json.result.original_result.completion_evidence.cross_owner_completion.state, "partial");

    const intakeCase = await invoke(state.entrypoint, root, caseRequest(
      state,
      ids.intakeCase,
      "operation:l03-w04:intake-case",
      "Intake realization",
      ids.namespaceB,
    ));
    const reconcileCase = await invoke(state.entrypoint, root, caseRequest(
      state,
      ids.reconcileCase,
      "operation:l03-w04:reconcile-case",
      "Reconcile realization",
      ids.namespaceB,
    ));
    assert.equal(intakeCase.code, 0, JSON.stringify(intakeCase.json));
    assert.equal(reconcileCase.code, 0, JSON.stringify(reconcileCase.json));

    const concurrentFrame = structuredClone(frame);
    concurrentFrame.title = "Concurrent Frame revision before Case settlement";
    const concurrent = await invoke(state.entrypoint, root, frameMutation(
      state,
      "frame.commit_revision",
      "operation:l03-w04:concurrent-frame",
      1,
      concurrentFrame,
    ));
    assert.equal(concurrent.code, 0, JSON.stringify(concurrent.json));

    const settledFrame = structuredClone(concurrentFrame);
    settledFrame.status = "completed";
    Object.assign(settledFrame.discovery[0], {
      lifecycle: "settled",
      category: "settled",
      disposition: "accepted",
      resolution: "All material results received explicit dispositions.",
    });
    settledFrame.disposition_boundaries[0].closure = "closed";
    settledFrame.case_dispositions[0] = {
      id: ids.pending,
      boundary_id: ids.boundary,
      result_summary: "Classification still requires judgment",
      classification_state: "classified",
      disposition: "no_case",
      no_case_reason: "Review established that the retained result is transient and non-reusable.",
    };
    Object.assign(settledFrame.case_dispositions[1], {
      realization_state: "settled",
      observed_case_revision_id: intakeCase.json.result.revision.id,
    });
    Object.assign(settledFrame.case_dispositions[2], {
      realization_state: "settled",
      pinned_case_revision_id: reconcileCase.json.result.revision.id,
    });

    const staleSettlementRequest = frameMutation(
      state,
      "frame.commit_revision",
      "operation:l03-w04:stale-settlement",
      1,
      settledFrame,
    );
    const staleSettlement = await invoke(state.entrypoint, root, staleSettlementRequest);
    assert.equal(staleSettlement.code, 2, JSON.stringify(staleSettlement.json));
    assert.equal(staleSettlement.json.failure.code, "frame.revision_conflict");
    assert.equal(staleSettlement.json.failure.evidence.current_revision.number, 2);

    const conflictReceipt = await invoke(state.entrypoint, root, {
      protocol,
      operation: "frame.get_operation_receipt",
      request_version: 1,
      store_id: state.initialization.store_id,
      context: context(state, "recover Frame conflict after both Case commits"),
      frame_id: ids.frame,
      operation_id: staleSettlementRequest.operation_id,
      configuration: state.configuration,
    });
    assert.equal(conflictReceipt.code, 0, JSON.stringify(conflictReceipt.json));
    assert.equal(conflictReceipt.json.result.status, "settled");
    assert.equal(conflictReceipt.json.result.receipt.outcome, "rejected");
    assert.equal(conflictReceipt.json.result.original_result.failure.code, "frame.revision_conflict");

    const completed = await invoke(state.entrypoint, root, frameMutation(
      state,
      "frame.commit_revision",
      "operation:l03-w04:fresh-settlement",
      2,
      settledFrame,
    ));
    assert.equal(completed.code, 0, JSON.stringify(completed.json));
    assert.equal(completed.json.result.completion_evidence.cross_owner_completion.state, "settled");
    assert.deepEqual(completed.json.result.completion_evidence.completion_blocks, []);
    assert.equal(completed.json.result.frame.case_dispositions[1].disposition, "intake");
    assert.equal(completed.json.result.frame.case_dispositions[2].disposition, "reconcile");

    const replay = await invoke(state.entrypoint, root, createRequest);
    assert.equal(replay.code, 0, JSON.stringify(replay.json));
    assert.equal(replay.json.result.idempotent_replay, true);
    assert.deepEqual(replay.json.result.revision, created.json.result.revision);
    const mismatch = structuredClone(createRequest);
    mismatch.frame.title = "Changed request under a settled operation ID";
    const mismatchedReplay = await invoke(state.entrypoint, root, mismatch);
    assert.equal(mismatchedReplay.code, 2, JSON.stringify(mismatchedReplay.json));
    assert.equal(mismatchedReplay.json.failure.code, "frame.idempotency_mismatch");

    const historicalPending = await invoke(state.entrypoint, root, dispositionRead(state, ids.pending, { revision_number: 1 }));
    const currentPending = await invoke(state.entrypoint, root, dispositionRead(state, ids.pending));
    assert.equal(historicalPending.code, 0, JSON.stringify(historicalPending.json));
    assert.equal(currentPending.code, 0, JSON.stringify(currentPending.json));
    assert.equal(historicalPending.json.result.case_disposition.classification_state, "pending_classification");
    assert.equal(currentPending.json.result.case_disposition.disposition, "no_case");
    assert.equal(historicalPending.json.result.case_disposition.id, currentPending.json.result.case_disposition.id);
    assert.notEqual(historicalPending.json.result.case_disposition.version_id, currentPending.json.result.case_disposition.version_id);
    assert.equal(
      created.json.result.revision.version_ids.case_dispositions.find((item) => item.case_disposition_id === ids.noCase).version_id,
      completed.json.result.revision.version_ids.case_dispositions.find((item) => item.case_disposition_id === ids.noCase).version_id,
    );

    await assert.rejects(
      sqlite(state, `UPDATE owner_versions SET content_json='{}' WHERE family_id='${ids.pending}';`),
      /owner versions are immutable/,
    );
    const expiredPage = await invoke(state.entrypoint, root, { ...pageOneRequest, cursor: pageOne.json.result.next_cursor });
    assert.equal(expiredPage.code, 2, JSON.stringify(expiredPage.json));
    assert.equal(expiredPage.json.failure.evidence.violations[0].rule, "cursor_fence_expired");

    const activeOnly = await invoke(state.entrypoint, root, frameList(state));
    assert.equal(activeOnly.code, 0, JSON.stringify(activeOnly.json));
    assert.deepEqual(activeOnly.json.result.items.map((item) => item.id), [ids.secondFrame]);
    const allLifecycle = await invoke(state.entrypoint, root, frameList(state, { statuses: ["active", "completed"] }));
    assert.equal(allLifecycle.code, 0, JSON.stringify(allLifecycle.json));
    assert.deepEqual(new Set(allLifecycle.json.result.items.map((item) => item.id)), new Set([ids.frame, ids.secondFrame]));

    const beforePreparation = await counts(state);
    const present = await invoke(state.entrypoint, root, legacyRequest(state, frame, created.json.result.revision));
    assert.equal(present.code, 0, JSON.stringify(present.json));
    assert.equal(present.json.result.legacy_disposition_state, "present");
    assert.equal(present.json.result.absent_in_legacy, false);
    assert.deepEqual(present.json.result.disposition_boundary_matches.map((item) => item.match), ["exact"]);
    assert.deepEqual(present.json.result.case_disposition_matches.map((item) => item.match), ["exact", "exact", "exact", "exact"]);

    const absent = await invoke(state.entrypoint, root, legacyRequest(state, frame, created.json.result.revision, { dispositionState: "absent" }));
    assert.equal(absent.code, 0, JSON.stringify(absent.json));
    assert.equal(absent.json.result.legacy_disposition_state, "absent_in_legacy");
    assert.equal(absent.json.result.absent_in_legacy, true);
    assert.equal(absent.json.result.requires_semantic_reconcile, true);
    assert.equal(absent.json.result.structural_diff.removals.filter((item) => item.case_disposition_id).length, 4);

    const ambiguous = await invoke(state.entrypoint, root, legacyRequest(state, frame, created.json.result.revision, { bindDispositions: false }));
    assert.equal(ambiguous.code, 0, JSON.stringify(ambiguous.json));
    assert.deepEqual(ambiguous.json.result.disposition_boundary_matches.map((item) => item.match), ["ambiguous"]);
    assert.deepEqual(ambiguous.json.result.case_disposition_matches.map((item) => item.match), ["ambiguous", "ambiguous", "ambiguous", "ambiguous"]);
    assert.deepEqual(await counts(state), beforePreparation);

    const homeOnlyPolicy = await rotateToHomeOnlyPolicy(state);
    const privateRead = await invoke(state.entrypoint, root, frameRead(state, ids.frame, {}, homeOnlyPolicy));
    assert.equal(privateRead.code, 0, JSON.stringify(privateRead.json));
    assert.equal(privateRead.json.result.frame.hidden_authority_scope_count, 1);
    assert.equal(privateRead.json.result.frame.hidden_reference_count, 2);
    assert.equal(JSON.stringify(privateRead.json).includes(ids.namespaceB), false);
    assert.equal(JSON.stringify(privateRead.json).includes(ids.intakeCase), false);
    assert.equal(JSON.stringify(privateRead.json).includes(ids.reconcileCase), false);
    assert.equal(privateRead.json.result.frame.case_dispositions[1].case_id, undefined);

    const hiddenSelector = await invoke(state.entrypoint, root, frameList(
      state,
      { authority_scope_namespace_ids: [ids.namespaceB], statuses: ["active", "completed"] },
      homeOnlyPolicy,
    ));
    assert.equal(hiddenSelector.code, 0, JSON.stringify(hiddenSelector.json));
    assert.deepEqual(hiddenSelector.json.result.items, []);
    assert.equal(JSON.stringify(hiddenSelector.json).includes(ids.namespaceB), false);
    const missingDisposition = await invoke(state.entrypoint, root, dispositionRead(
      state,
      "case-disposition:00000000-0000-4000-8000-000000000000",
      {},
      homeOnlyPolicy,
    ));
    assert.equal(missingDisposition.code, 2, JSON.stringify(missingDisposition.json));
    assert.equal(missingDisposition.json.failure.code, "frame.disposition_not_found_or_not_visible");
    assert.deepEqual(missingDisposition.json.failure.evidence, {});
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await stat(root).then(() => true).catch(() => false), false);
  }
});

test("malformed stored Frame disposition state fails closed without façade mutation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l03-w04-corrupt-"));
  try {
    const state = await setup(sourceEntrypoint, root, "corrupt");
    const frame = initialFrame(state);
    const created = await invoke(state.entrypoint, root, frameMutation(state, "frame.create", "operation:l03-w04:corrupt-create", 0, frame));
    assert.equal(created.code, 0, JSON.stringify(created.json));
    await corruptCaseDispositionShape(state);
    const before = await counts(state);

    const read = await invoke(state.entrypoint, root, frameRead(state));
    assert.equal(read.code, 2, JSON.stringify(read.json));
    assert.equal(read.json.failure.code, "frame.stored_representation_incompatible");
    assert.equal(read.json.failure.evidence.violations[0].rule, "pending_classification_shape_invalid");
    assert.deepEqual(await counts(state), before);
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await stat(root).then(() => true).catch(() => false), false);
  }
});

test("malformed Frame profiles, selections, and digests remain typed non-mutating read failures", async (t) => {
  const corruptions = [
    ["profile digest", (state) => sqlite(state, `
      DROP TRIGGER owner_versions_immutable_update;
      UPDATE owner_versions SET content_digest='${"0".repeat(64)}' WHERE family_id='${ids.frame}';
    `)],
    ["missing selected family", (state) => sqlite(state, `
      DROP TRIGGER owner_revision_selections_immutable_delete;
      DELETE FROM owner_revision_selections WHERE family_id='${ids.pending}';
    `)],
    ["malformed normalized selection", (state) => sqlite(state, `
      DROP TRIGGER owner_revisions_immutable_update;
      UPDATE owner_revisions SET normalized_json='{}' WHERE owner_id='${ids.frame}';
    `)],
  ];
  for (const [name, corrupt] of corruptions) {
    await t.test(name, async () => {
      const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l03-w04-malformed-"));
      try {
        const state = await setup(sourceEntrypoint, root, name.replaceAll(" ", "-"));
        const created = await invoke(state.entrypoint, root, frameMutation(
          state,
          "frame.create",
          `operation:l03-w04:${name.replaceAll(" ", "-")}:create`,
          0,
          initialFrame(state),
        ));
        assert.equal(created.code, 0, JSON.stringify(created.json));
        await corrupt(state);
        const before = await counts(state);
        const failed = await invoke(state.entrypoint, root, frameRead(state));
        assert.equal(failed.code, 2, JSON.stringify(failed.json));
        assert.equal(failed.json.failure.code, "frame.stored_representation_incompatible");
        assert.deepEqual(await counts(state), before);
      } finally {
        await rm(root, { recursive: true, force: true });
        assert.equal(await stat(root).then(() => true).catch(() => false), false);
      }
    });
  }
});

test("generated Pi, Codex, and OpenCode packages preserve candidate-2 partial, settlement, history, replay, and legacy-absence behavior", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l03-w04-generated-"));
  try {
    const report = await generateAndValidateSandbox({ sandboxRoot: root });
    for (const generated of report.results) {
      const entrypoint = path.join(generated.package_root, "variants/sqlite/bin/casebook-persistence.mjs");
      const state = await setup(entrypoint, path.join(root, "unrelated-cwd"), `l03-w04-${generated.target}`, report.sqlite_binary);
      const home = state.initialization.namespace.id;
      const caseOperationId = `operation:l03-w04:${generated.target}:case`;
      const frame = {
        id: ids.generatedFrame,
        home_namespace_id: home,
        authority_scope_namespace_ids: [home],
        status: "active",
        title: `${generated.target} generated contract proof`,
        discovery: [{
          id: ids.generatedDiscovery,
          display_order: 0,
          lifecycle: "active",
          category: "frontier",
          title: "Generated package candidate-2 path",
          body: "Exercise the copied connector from an unrelated cwd.",
          human_authority: "required",
          dependencies: [],
        }],
        disposition_boundaries: [{
          id: ids.generatedBoundary,
          display_order: 0,
          title: "Generated natural boundary",
          closure: "open",
          disposition_ids: [ids.generatedPending, ids.generatedAwaiting],
        }],
        case_dispositions: [{
          id: ids.generatedPending,
          boundary_id: ids.generatedBoundary,
          result_summary: "Pending generated result",
          classification_state: "pending_classification",
          pending_reason: "Generated evidence needs judgment.",
          resume_condition: "Classify the copied-runtime result.",
        }, {
          id: ids.generatedAwaiting,
          boundary_id: ids.generatedBoundary,
          result_summary: "Generated Intake result",
          classification_state: "classified",
          disposition: "intake",
          rationale: "The result is reusable.",
          realization_state: "awaiting_case",
          case_id: ids.generatedCase,
          case_operation_id: caseOperationId,
        }],
      };
      const createRequest = frameMutation(
        state,
        "frame.create",
        `operation:l03-w04:${generated.target}:frame-create`,
        0,
        frame,
      );
      const created = await invoke(entrypoint, state.root, createRequest);
      assert.equal(created.code, 0, `${generated.target}: ${JSON.stringify(created.json)}`);
      assert.deepEqual(created.json.result.completion_evidence.completion_blocks.map((item) => item.kind), [
        "pending_classification",
        "awaiting_case",
      ]);

      const realized = await invoke(entrypoint, state.root, caseRequest(
        state,
        ids.generatedCase,
        caseOperationId,
        `${generated.target} generated realization`,
      ));
      assert.equal(realized.code, 0, `${generated.target}: ${JSON.stringify(realized.json)}`);
      const settledFrame = structuredClone(frame);
      settledFrame.status = "completed";
      Object.assign(settledFrame.discovery[0], {
        lifecycle: "settled",
        category: "settled",
        disposition: "accepted",
        resolution: "The generated copy settled the complete boundary.",
      });
      settledFrame.disposition_boundaries[0].closure = "closed";
      settledFrame.case_dispositions[0] = {
        id: ids.generatedPending,
        boundary_id: ids.generatedBoundary,
        result_summary: "Pending generated result",
        classification_state: "classified",
        disposition: "no_case",
        no_case_reason: "The generated result is transient package-test evidence.",
      };
      Object.assign(settledFrame.case_dispositions[1], {
        realization_state: "settled",
        observed_case_revision_id: realized.json.result.revision.id,
      });
      const settled = await invoke(entrypoint, state.root, frameMutation(
        state,
        "frame.commit_revision",
        `operation:l03-w04:${generated.target}:settle`,
        1,
        settledFrame,
      ));
      assert.equal(settled.code, 0, `${generated.target}: ${JSON.stringify(settled.json)}`);
      assert.equal(settled.json.result.completion_evidence.cross_owner_completion.state, "settled");

      const historical = await invoke(entrypoint, state.root, {
        ...dispositionRead(state, ids.generatedPending, { revision_number: 1 }),
        frame_id: ids.generatedFrame,
      });
      assert.equal(historical.code, 0, `${generated.target}: ${JSON.stringify(historical.json)}`);
      assert.equal(historical.json.result.case_disposition.classification_state, "pending_classification");
      const replay = await invoke(entrypoint, state.root, createRequest);
      assert.equal(replay.code, 0, `${generated.target}: ${JSON.stringify(replay.json)}`);
      assert.equal(replay.json.result.idempotent_replay, true);

      const recovered = await invoke(entrypoint, state.root, {
        protocol,
        operation: "frame.get_operation_receipt",
        request_version: 1,
        store_id: state.initialization.store_id,
        context: context(state, "generated receipt recovery"),
        frame_id: ids.generatedFrame,
        operation_id: createRequest.operation_id,
        configuration: state.configuration,
      });
      assert.equal(recovered.code, 0, `${generated.target}: ${JSON.stringify(recovered.json)}`);
      assert.equal(recovered.json.result.original_result.completion_evidence.cross_owner_completion.state, "partial");

      const absent = await invoke(entrypoint, state.root, legacyRequest(
        state,
        frame,
        created.json.result.revision,
        { dispositionState: "absent" },
      ));
      assert.equal(absent.code, 0, `${generated.target}: ${JSON.stringify(absent.json)}`);
      assert.equal(absent.json.result.absent_in_legacy, true);
      assert.equal(absent.json.result.requires_semantic_reconcile, true);
    }
  } finally {
    assert.equal(await cleanupSandbox(root), true);
    assert.equal(await stat(root).then(() => true).catch(() => false), false);
  }
});

test("deleting the Frame façade rejects typed work and leaks owner policy into callers or the substrate", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l03-w04-deletion-"));
  try {
    const state = await setup(sourceEntrypoint, root, "deletion");
    const typedRequest = frameMutation(
      state,
      "frame.create",
      "operation:l03-w04:deletion-proof",
      0,
      initialFrame(state),
    );
    const before = await counts(state);
    const rawSubstrate = await invoke(mechanicalDriver, root, {
      ...typedRequest,
      operation: "commit_owner_revision",
    });
    assert.equal(rawSubstrate.code, 2, JSON.stringify(rawSubstrate.json));
    assert.equal(rawSubstrate.json.failure.code, "representation_invalid");
    assert.deepEqual(await counts(state), before);

    const frameSource = await readFile(path.join(packageRoot, "variants/sqlite/lib/frame/index.mjs"), "utf8");
    const substrateSource = await readFile(path.join(packageRoot, "variants/sqlite/lib/substrate/mechanical.mjs"), "utf8");
    const connectorSource = await readFile(path.join(packageRoot, "variants/sqlite/bin/casebook-persistence.mjs"), "utf8");
    const ownerPolicyMarkers = [
      "frame-disposition-boundary@1",
      "frame-case-disposition@1",
      "pending_classification_shape_invalid",
      "closed_boundary_unsettled",
      "completed_frame_unsettled_disposition",
      "case_realization_evidence_not_visible",
      "active_only",
      "absent_in_legacy",
      "requires_semantic_reconcile",
    ];
    for (const marker of ownerPolicyMarkers) {
      assert.equal(frameSource.includes(marker), true, marker);
      assert.equal(substrateSource.includes(marker), false, marker);
    }
    assert.match(connectorSource, /invokeFrameOperation/);
    assert.match(connectorSource, /frame\.disposition\.read/);
    assert.doesNotMatch(substrateSource, /frame\.disposition\.read|case_disposition_include_invalid/);
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await stat(root).then(() => true).catch(() => false), false);
  }
});
