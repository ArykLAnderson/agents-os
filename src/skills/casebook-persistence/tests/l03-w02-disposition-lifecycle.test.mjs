import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { selectCompatibleSqliteBinary } from "./sandbox-harness.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entrypoint = path.join(packageRoot, "variants/sqlite/bin/casebook-persistence.mjs");
const protocol = { id: "casebook-persistence-json", version: 1 };
const ids = Object.freeze({
  frame: "frame:8d17d22c-496f-4ead-9898-f74b79bfd69a",
  discovery: "discovery:c123d076-b272-4335-a15a-7cd8589f73c9",
  boundary: "disposition-boundary:7d479fbb-652c-4b0b-8187-d136971914a5",
  pending: "case-disposition:e54ecb0d-29db-4597-9712-15be0053eaff",
  intake: "case-disposition:c5b44f21-f1dd-466b-b05a-12ab7b16561a",
  case: "case:eeec1d62-402e-4039-94f3-a6918f32d780",
  missingDisposition: "case-disposition:3c1b4906-326b-465e-9886-2d555041cdde",
});

function invoke(cwd, request) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [entrypoint], {
      cwd, encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? "", HOME: cwd },
    }, (error, stdout, stderr) => resolve({ code: error ? 2 : 0, json: JSON.parse(stdout), stderr }));
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

async function setup(root) {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const configuration = {
    source: { kind: "synthetic-test", locator: "l03-w02-disposition-lifecycle" },
    authority_mode: "sqlite",
    sqlite: { database_url: path.join(root, "store.sqlite3"), sqlite_bin: sqliteBinary },
  };
  const initialized = await invoke(root, {
    protocol, operation: "initialize_store", operation_id: "operation:l03-w02-init",
    authority_claim: { human_authorized: true, acting_role: "test", authority_basis: "disposable L03-W02 evidence" },
    configuration,
  });
  assert.equal(initialized.code, 0, initialized.stderr);
  const initialization = initialized.json.result.initialization;
  const context = (purpose) => ({
    view_id: initialization.view.id,
    view_policy_revision_id: initialization.view.policy_revision_id,
    purpose,
    requested_audience_ceiling: "private",
  });
  return { configuration, initialization, context };
}

function initialFrame(state) {
  return {
    id: ids.frame,
    home_namespace_id: state.initialization.namespace.id,
    authority_scope_namespace_ids: [state.initialization.namespace.id],
    status: "active",
    title: "Disposition lifecycle",
    discovery: [{
      id: ids.discovery, display_order: 0, lifecycle: "active", category: "frontier",
      title: "Finish disposition sweep", body: "Classification and Case realization remain explicit.",
      human_authority: "required", dependencies: [],
    }],
    disposition_boundaries: [{
      id: ids.boundary, display_order: 0, display_label: "DB-001", title: "One natural boundary",
      closure: "open", disposition_ids: [ids.pending, ids.intake],
    }],
    case_dispositions: [{
      id: ids.pending, boundary_id: ids.boundary, result_summary: "Unclassified result",
      classification_state: "pending_classification", pending_reason: "Evidence needs judgment.",
      resume_condition: "Review the retained result.",
    }, {
      id: ids.intake, boundary_id: ids.boundary, result_summary: "Reusable result",
      classification_state: "classified", disposition: "intake", rationale: "Create a durable Case.",
      realization_state: "awaiting_case", case_id: ids.case, case_operation_id: "operation:l03-w02-case-create",
    }],
  };
}

function frameMutation(state, operation, operationId, expectedRevision, frame) {
  return {
    protocol, operation, request_version: 1, operation_id: operationId,
    store_id: state.initialization.store_id, context: state.context(operation), expected_revision: expectedRevision,
    commit_basis: "bounded L03-W02 lifecycle transition", provenance: { acting_role: "frame", authority_basis: "synthetic" },
    ...(operation === "frame.commit_revision" ? { frame_id: frame.id } : {}), frame, configuration: state.configuration,
  };
}

function frameRead(state, include, revisionNumber) {
  return {
    protocol, operation: "frame.read", request_version: 1, store_id: state.initialization.store_id,
    context: state.context("read disposition lifecycle"), frame_id: ids.frame,
    ...(revisionNumber == null ? {} : { revision_number: revisionNumber }),
    ...(include == null ? {} : { include }), configuration: state.configuration,
  };
}

function caseCreate(state) {
  return {
    protocol, operation: "case.create", request_version: 1, operation_id: "operation:l03-w02-case-create",
    store_id: state.initialization.store_id, context: state.context("realize awaiting disposition"), expected_revision: 0,
    commit_basis: "separate Case owner transaction", provenance: { acting_role: "case" },
    case: {
      id: ids.case, home_namespace_id: state.initialization.namespace.id, state: "active",
      title: "Realized result", summary: "The separate Case commit succeeded.", scope: "Synthetic test only.",
    },
    configuration: state.configuration,
  };
}

function dispositionRead(state, familyId, revisionNumber) {
  return {
    protocol, operation: "frame.disposition.read", request_version: 1,
    store_id: state.initialization.store_id, context: state.context("read stable disposition family"),
    frame_id: ids.frame, family_id: familyId,
    ...(revisionNumber == null ? {} : { revision_number: revisionNumber }),
    configuration: state.configuration,
  };
}

test("L03-W02 exposes disposition scopes, stable historical reads, completion blocks, partial owner state, and receipt recovery", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l03-w02-dispositions-"));
  try {
    const state = await setup(root);
    const frame = initialFrame(state);
    const created = await invoke(root, frameMutation(state, "frame.create", "operation:l03-w02-frame-create", 0, frame));
    assert.equal(created.code, 0, JSON.stringify(created.json));
    assert.equal(created.json.result.completion_evidence.cross_owner_completion.state, "partial");
    assert.deepEqual(created.json.result.completion_evidence.completion_blocks.map((item) => item.kind), ["pending_classification", "awaiting_case"]);

    const recovered = await invoke(root, {
      protocol, operation: "frame.get_operation_receipt", request_version: 1,
      store_id: state.initialization.store_id, context: state.context("recover uncertain Frame response"),
      frame_id: ids.frame, operation_id: "operation:l03-w02-frame-create", configuration: state.configuration,
    });
    assert.equal(recovered.code, 0, JSON.stringify(recovered.json));
    assert.equal(recovered.json.result.status, "settled");
    assert.equal(recovered.json.result.original_result.completion_evidence.cross_owner_completion.state, "partial");

    const realizedCase = await invoke(root, caseCreate(state));
    assert.equal(realizedCase.code, 0, JSON.stringify(realizedCase.json));
    const stillAwaiting = await invoke(root, frameRead(state, { discovery: "all_selected", case_dispositions: "all_selected" }));
    assert.equal(stillAwaiting.code, 0, JSON.stringify(stillAwaiting.json));
    assert.equal(stillAwaiting.json.result.frame.case_dispositions[1].realization_state, "awaiting_case");
    assert.equal(stillAwaiting.json.result.completion_evidence.cross_owner_completion.state, "partial");

    const invalidClose = structuredClone(frame);
    invalidClose.disposition_boundaries[0].closure = "closed";
    const blocked = await invoke(root, frameMutation(state, "frame.commit_revision", "operation:l03-w02-blocked-close", 1, invalidClose));
    assert.equal(blocked.code, 2, JSON.stringify(blocked.json));
    assert.equal(blocked.json.failure.evidence.violations[0].rule, "closed_boundary_unsettled");

    const settled = structuredClone(frame);
    settled.status = "completed";
    Object.assign(settled.discovery[0], { lifecycle: "settled", category: "settled", disposition: "accepted", resolution: "Disposition sweep completed." });
    settled.disposition_boundaries[0].closure = "closed";
    settled.case_dispositions[0] = {
      id: ids.pending, boundary_id: ids.boundary, result_summary: "Unclassified result",
      classification_state: "classified", disposition: "no_case", no_case_reason: "The reviewed result is transient.",
    };
    Object.assign(settled.case_dispositions[1], {
      realization_state: "settled", observed_case_revision_id: realizedCase.json.result.revision.id,
    });
    const completed = await invoke(root, frameMutation(state, "frame.commit_revision", "operation:l03-w02-complete", 1, settled));
    assert.equal(completed.code, 0, JSON.stringify(completed.json));
    assert.equal(completed.json.result.completion_evidence.cross_owner_completion.state, "settled");
    assert.deepEqual(completed.json.result.completion_evidence.completion_blocks, []);

    const currentOnly = await invoke(root, frameRead(state, { discovery: "active_only", case_dispositions: "current" }));
    assert.equal(currentOnly.code, 0, JSON.stringify(currentOnly.json));
    assert.deepEqual(currentOnly.json.result.frame.disposition_boundaries, []);
    assert.deepEqual(currentOnly.json.result.frame.case_dispositions, []);
    assert.equal(currentOnly.json.result.applied_case_disposition_scope, "current");

    const allSelected = await invoke(root, frameRead(state, { discovery: "all_selected", case_dispositions: "all_selected" }));
    assert.equal(allSelected.code, 0, JSON.stringify(allSelected.json));
    assert.equal(allSelected.json.result.frame.disposition_boundaries[0].closure, "closed");
    assert.equal(allSelected.json.result.frame.case_dispositions[1].realization_state, "settled");
    assert.equal(allSelected.json.result.applied_case_disposition_scope, "all_selected");

    const historical = await invoke(root, dispositionRead(state, ids.pending, 1));
    const currentBoundary = await invoke(root, dispositionRead(state, ids.boundary));
    assert.equal(historical.code, 0, JSON.stringify(historical.json));
    assert.equal(currentBoundary.code, 0, JSON.stringify(currentBoundary.json));
    assert.equal(historical.json.result.family_kind, "case_disposition");
    assert.equal(historical.json.result.case_disposition.classification_state, "pending_classification");
    assert.equal(currentBoundary.json.result.family_kind, "disposition_boundary");
    assert.equal(currentBoundary.json.result.disposition_boundary.closure, "closed");

    const missing = await invoke(root, dispositionRead(state, ids.missingDisposition));
    assert.equal(missing.code, 2, JSON.stringify(missing.json));
    assert.equal(missing.json.failure.code, "frame.disposition_not_found_or_not_visible");
    assert.deepEqual(missing.json.failure.evidence, {});

    const reopened = structuredClone(settled);
    reopened.status = "active";
    reopened.discovery[0] = {
      ...reopened.discovery[0], lifecycle: "active", category: "frontier",
      reopened_from_version: completed.json.result.frame.discovery[0].version_id,
      reopening_basis: "New evidence requires attention.",
    };
    delete reopened.discovery[0].disposition;
    delete reopened.discovery[0].resolution;
    const reopenedResult = await invoke(root, frameMutation(state, "frame.commit_revision", "operation:l03-w02-reopen", 2, reopened));
    assert.equal(reopenedResult.code, 0, JSON.stringify(reopenedResult.json));
    assert.equal(reopenedResult.json.result.frame.discovery[0].lifecycle, "active");
    assert.equal(reopenedResult.json.result.completion_evidence.frame.active_discovery_items, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await stat(root).then(() => true).catch(() => false), false);
  }
});

test("L03-W02 rejects unsupported disposition include and ambiguous family read selectors", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l03-w02-disposition-shape-"));
  try {
    const state = await setup(root);
    const created = await invoke(root, frameMutation(state, "frame.create", "operation:l03-w02-shape-create", 0, initialFrame(state)));
    assert.equal(created.code, 0, JSON.stringify(created.json));

    for (const include of [
      { case_dispositions: "open_only" },
      { discovery: "all_selected", case_dispositions: "all_selected", links: true },
    ]) {
      const response = await invoke(root, frameRead(state, include));
      assert.equal(response.code, 2, JSON.stringify(response.json));
      assert.equal(response.json.failure.code, "frame.invalid_representation");
    }

    const ambiguous = dispositionRead(state, ids.pending);
    ambiguous.revision_number = 1;
    ambiguous.revision_id = created.json.result.revision.id;
    const response = await invoke(root, ambiguous);
    assert.equal(response.code, 2, JSON.stringify(response.json));
    assert.equal(response.json.failure.evidence.violations[0].rule, "revision_selector_ambiguous");
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await stat(root).then(() => true).catch(() => false), false);
  }
});
