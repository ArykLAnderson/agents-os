import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { selectCompatibleSqliteBinary } from "./sandbox-harness.mjs";

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entrypoint = path.join(packageRoot, "variants/sqlite/bin/casebook-persistence.mjs");
const protocol = { id: "casebook-persistence-json", version: 1 };
const ids = Object.freeze({
  case: "case:1e240d02-08fa-46c7-887e-d586050d3b49",
  frame: "frame:fc009914-4b20-4d46-bc64-62df9cdfd1d2",
  discovery: "discovery:5313d8de-5aa4-4e3f-a4f8-883ecaabb680",
  boundary: "disposition-boundary:3dd1cdb8-4d60-48ac-9cf3-a3ffd871f6b5",
  pending: "case-disposition:22ccbe0e-8151-4464-bd70-c4f842fb9b36",
  intake: "case-disposition:e86b9052-201c-4f60-b7eb-217b9ae391f1",
  noCase: "case-disposition:a66f3bc5-be3f-4add-abd1-ff119f5e9a15",
  hiddenCase: "case:32fa2035-6e02-4ac1-8514-845cfb68ac61",
  hiddenRevision: "case-revision:2f8b1f58-4bbc-4d45-8963-16546fd284dc",
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

async function invoke(cwd, request) {
  try {
    const { stdout, stderr } = await execFileWithInput(process.execPath, [entrypoint], {
      cwd, encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? "", HOME: cwd },
    }, `${JSON.stringify(request)}\n`);
    return { code: 0, json: JSON.parse(stdout), stderr };
  } catch (error) {
    return { code: error.code, json: error.stdout ? JSON.parse(error.stdout) : {}, stderr: error.stderr ?? "" };
  }
}

function configuration(store, sqliteBinary) {
  return { source: { kind: "synthetic-test", locator: "l03-w01-dispositions" }, authority_mode: "sqlite", sqlite: { database_url: store, sqlite_bin: sqliteBinary } };
}

function context(initialized, purpose) {
  return { view_id: initialized.view.id, view_policy_revision_id: initialized.view.policy_revision_id, purpose, requested_audience_ceiling: "private" };
}

async function setup(root) {
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const store = path.join(root, "store.sqlite3");
  const config = configuration(store, sqliteBinary);
  const initialized = await invoke(root, {
    protocol, operation: "initialize_store", operation_id: "operation:l03-w01-disposition-init",
    authority_claim: { human_authorized: true, acting_role: "architect", authority_basis: "disposable candidate-2 test" },
    configuration: config,
  });
  assert.equal(initialized.code, 0, initialized.stderr);
  return { root, store, sqliteBinary, configuration: config, initialized: initialized.json.result.initialization };
}

function caseCreate(state) {
  return {
    protocol, operation: "case.create", request_version: 1, operation_id: "operation:l03-w01-case-create",
    store_id: state.initialized.store_id, context: context(state.initialized, "create visible realization Case"), expected_revision: 0,
    commit_basis: "synthetic committed Case realization evidence", provenance: { acting_role: "test", authority_basis: "disposable" },
    case: { id: ids.case, home_namespace_id: state.initialized.namespace.id, state: "active", title: "Disposition realization", summary: "Committed Case evidence.", scope: "Disposable test only." },
    configuration: state.configuration,
  };
}

function initialFrame(state) {
  return {
    id: ids.frame, home_namespace_id: state.initialized.namespace.id,
    authority_scope_namespace_ids: [state.initialized.namespace.id], status: "active", title: "Candidate-2 disposition assembly",
    discovery: [{ id: ids.discovery, display_order: 0, lifecycle: "active", category: "frontier", title: "Classify material results", body: "Frame retains semantic judgment.", human_authority: "required", dependencies: [] }],
    disposition_boundaries: [{
      id: ids.boundary, display_label: "DB-001", display_order: 0, title: "Natural operation boundary", closure: "open",
      evidence_locators: [{ uri: "artifact://disposable/boundary", audience: "private", media_type: "application/json" }],
      disposition_ids: [ids.pending, ids.intake, ids.noCase],
    }],
    case_dispositions: [{
      id: ids.pending, boundary_id: ids.boundary, result_summary: "Result still needs Frame judgment", classification_state: "pending_classification",
      pending_reason: "The retained evidence is incomplete.", resume_condition: "Review the bounded evidence artifact.",
      evidence_locators: [{ uri: "artifact://disposable/pending", audience: "private" }],
    }, {
      id: ids.intake, boundary_id: ids.boundary, result_summary: "Material reusable knowledge", classification_state: "classified",
      disposition: "intake", rationale: "The result is reusable.", realization_state: "awaiting_case", case_id: ids.case,
      case_operation_id: "operation:l03-w01-case-create", affected_case_entry_display_ids: ["CK-001"],
    }, {
      id: ids.noCase, boundary_id: ids.boundary, result_summary: "Transient command output", classification_state: "classified",
      disposition: "no_case", no_case_reason: "The output is disposable execution evidence.",
    }],
  };
}

function frameMutation(state, operation, operationId, expectedRevision, frame) {
  return {
    protocol, operation, request_version: 1, operation_id: operationId, store_id: state.initialized.store_id,
    context: context(state.initialized, operation), expected_revision: expectedRevision,
    commit_basis: "complete candidate-2 Frame selection", provenance: { acting_role: "frame", authority_basis: "synthetic semantic judgment" },
    ...(operation === "frame.commit_revision" ? { frame_id: frame.id } : {}), frame, configuration: state.configuration,
  };
}

async function revisionCount(state) {
  const { stdout } = await execFileAsync(state.sqliteBinary, ["-batch", "-bail", state.store, `SELECT count(*) FROM owner_revisions WHERE owner_id='${ids.frame}';`], { encoding: "utf8" });
  return Number(stdout.trim());
}

async function assertInvalid(state, frame, operationId, rule) {
  const response = await invoke(state.root, frameMutation(state, "frame.commit_revision", operationId, 1, frame));
  assert.equal(response.code, 2, JSON.stringify(response.json));
  assert.equal(response.json.failure.code, "frame.invalid_representation");
  assert.equal(response.json.failure.evidence.violations.some((item) => item.rule === rule), true, JSON.stringify(response.json));
  assert.equal(await revisionCount(state), 1);
}

function frameRead(state, revisionNumber) {
  return {
    protocol, operation: "frame.read", request_version: 1, store_id: state.initialized.store_id,
    context: context(state.initialized, "read cohesive disposition history"), frame_id: ids.frame,
    ...(revisionNumber == null ? {} : { revision_number: revisionNumber }), include: { discovery: "all_selected" }, configuration: state.configuration,
  };
}

test("L03-W01 assembles stable disposition families, realization evidence, and immutable historical selections", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l03-w01-dispositions-"));
  try {
    const state = await setup(root);
    const createdCase = await invoke(root, caseCreate(state));
    assert.equal(createdCase.code, 0, JSON.stringify(createdCase.json));
    const frame = initialFrame(state);
    const created = await invoke(root, frameMutation(state, "frame.create", "operation:l03-w01-frame-create", 0, frame));
    assert.equal(created.code, 0, JSON.stringify(created.json));
    assert.match(created.json.result.revision.version_ids.disposition_boundaries[0].version_id, /^disposition-boundary-version:/);
    assert.equal(created.json.result.revision.version_ids.case_dispositions.length, 3);
    assert.equal(created.json.result.frame.case_dispositions[0].classification_state, "pending_classification");

    const boundaryVersion1 = created.json.result.revision.version_ids.disposition_boundaries[0].version_id;
    const dispositionVersions1 = new Map(created.json.result.revision.version_ids.case_dispositions.map((item) => [item.case_disposition_id, item.version_id]));
    const settledFrame = structuredClone(frame);
    Object.assign(settledFrame.case_dispositions[1], {
      realization_state: "settled", observed_case_revision_id: createdCase.json.result.revision.id,
    });
    const settled = await invoke(root, frameMutation(state, "frame.commit_revision", "operation:l03-w01-frame-settle-case", 1, settledFrame));
    assert.equal(settled.code, 0, JSON.stringify(settled.json));
    assert.equal(settled.json.result.revision.version_ids.disposition_boundaries[0].version_id, boundaryVersion1);
    const dispositionVersions2 = new Map(settled.json.result.revision.version_ids.case_dispositions.map((item) => [item.case_disposition_id, item.version_id]));
    assert.equal(dispositionVersions2.get(ids.pending), dispositionVersions1.get(ids.pending));
    assert.equal(dispositionVersions2.get(ids.noCase), dispositionVersions1.get(ids.noCase));
    assert.notEqual(dispositionVersions2.get(ids.intake), dispositionVersions1.get(ids.intake));

    const completedFrame = structuredClone(settledFrame);
    completedFrame.status = "completed";
    completedFrame.disposition_boundaries[0].closure = "closed";
    completedFrame.case_dispositions[0] = {
      id: ids.pending, boundary_id: ids.boundary, result_summary: "Result still needs Frame judgment", classification_state: "classified",
      disposition: "reconcile", rationale: "The later evidence belongs in the existing Case.", realization_state: "settled",
      case_id: ids.case, case_operation_id: "operation:l03-w01-case-create", pinned_case_revision_id: createdCase.json.result.revision.id,
    };
    const completed = await invoke(root, frameMutation(state, "frame.commit_revision", "operation:l03-w01-frame-complete", 2, completedFrame));
    assert.equal(completed.code, 0, JSON.stringify(completed.json));
    assert.equal(completed.json.result.frame.disposition_boundaries[0].closure, "closed");
    assert.equal(completed.json.result.frame.case_dispositions[0].disposition, "reconcile");

    const historical = await invoke(root, frameRead(state, 1));
    const current = await invoke(root, frameRead(state));
    assert.equal(historical.code, 0, JSON.stringify(historical.json));
    assert.equal(current.code, 0, JSON.stringify(current.json));
    assert.equal(historical.json.result.frame.case_dispositions[0].classification_state, "pending_classification");
    assert.equal(current.json.result.frame.case_dispositions[0].classification_state, "classified");
    assert.notEqual(historical.json.result.frame.case_dispositions[0].version_id, current.json.result.frame.case_dispositions[0].version_id);

    const { stdout } = await execFileAsync(state.sqliteBinary, ["-batch", "-bail", "-json", state.store, `
      SELECT json_extract(content_json, '$.schema') AS schema, count(*) AS versions
      FROM owner_versions WHERE owner_id='${ids.frame}' GROUP BY schema ORDER BY schema;
    `], { encoding: "utf8" });
    const versions = JSON.parse(stdout);
    assert.equal(versions.some((item) => item.schema === "frame-disposition-boundary@1"), true);
    assert.equal(versions.some((item) => item.schema === "frame-case-disposition@1"), true);
    const { stdout: selectionStdout } = await execFileAsync(state.sqliteBinary, ["-batch", "-bail", "-json", state.store, `
      SELECT count(*) AS selections FROM owner_revision_selections s
      JOIN owner_revisions r ON r.revision_id=s.revision_id
      WHERE r.owner_id='${ids.frame}' AND r.revision_number=1;
    `], { encoding: "utf8" });
    assert.deepEqual(JSON.parse(selectionStdout), [{ selections: 6 }]);
    await assert.rejects(execFileAsync(state.sqliteBinary, ["-batch", "-bail", state.store, `UPDATE owner_versions SET content_json='{}' WHERE family_id='${ids.pending}';`], { encoding: "utf8" }), /owner versions are immutable/);
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await stat(root).then(() => true).catch(() => false), false);
  }
});

test("L03-W01 rejects incomplete memberships and impossible classification or realization shapes before mutation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l03-w01-invariants-"));
  try {
    const state = await setup(root);
    const createdCase = await invoke(root, caseCreate(state));
    assert.equal(createdCase.code, 0, JSON.stringify(createdCase.json));
    const frame = initialFrame(state);
    const created = await invoke(root, frameMutation(state, "frame.create", "operation:l03-w01-invalid-base", 0, frame));
    assert.equal(created.code, 0, JSON.stringify(created.json));

    const missingMembership = structuredClone(frame);
    missingMembership.disposition_boundaries[0].disposition_ids.pop();
    await assertInvalid(state, missingMembership, "operation:l03-w01-invalid-membership", "disposition_membership_incomplete");

    const omittedSets = structuredClone(frame);
    delete omittedSets.disposition_boundaries;
    delete omittedSets.case_dispositions;
    await assertInvalid(state, omittedSets, "operation:l03-w01-invalid-omitted-sets", "complete_disposition_sets_required");

    const omittedBoundaryFamily = structuredClone(frame);
    omittedBoundaryFamily.disposition_boundaries = [];
    omittedBoundaryFamily.case_dispositions = [];
    await assertInvalid(state, omittedBoundaryFamily, "operation:l03-w01-invalid-omitted-boundary", "selected_boundary_family_omitted");

    const omittedDispositionFamily = structuredClone(frame);
    omittedDispositionFamily.disposition_boundaries[0].disposition_ids.pop();
    omittedDispositionFamily.case_dispositions.pop();
    await assertInvalid(state, omittedDispositionFamily, "operation:l03-w01-invalid-omitted-disposition", "selected_disposition_family_omitted");

    const pendingWithDisposition = structuredClone(frame);
    pendingWithDisposition.case_dispositions[0].disposition = "no_case";
    await assertInvalid(state, pendingWithDisposition, "operation:l03-w01-invalid-pending", "pending_classification_shape_invalid");

    const awaitingWithRevision = structuredClone(frame);
    awaitingWithRevision.case_dispositions[1].observed_case_revision_id = createdCase.json.result.revision.id;
    await assertInvalid(state, awaitingWithRevision, "operation:l03-w01-invalid-awaiting", "awaiting_case_revision_forbidden");

    const noCaseWithCase = structuredClone(frame);
    Object.assign(noCaseWithCase.case_dispositions[2], { case_id: ids.case, case_operation_id: "operation:l03-w01-case-create" });
    await assertInvalid(state, noCaseWithCase, "operation:l03-w01-invalid-no-case", "no_case_shape_invalid");

    const closedPending = structuredClone(frame);
    closedPending.disposition_boundaries[0].closure = "closed";
    await assertInvalid(state, closedPending, "operation:l03-w01-invalid-closed", "closed_boundary_unsettled");

    const completedAwaiting = structuredClone(frame);
    completedAwaiting.status = "completed";
    await assertInvalid(state, completedAwaiting, "operation:l03-w01-invalid-completed", "completed_frame_unsettled_disposition");

    const invisibleSettlement = structuredClone(frame);
    Object.assign(invisibleSettlement.case_dispositions[1], {
      realization_state: "settled", case_id: ids.hiddenCase, observed_case_revision_id: ids.hiddenRevision,
    });
    await assertInvalid(state, invisibleSettlement, "operation:l03-w01-invalid-invisible-case", "case_realization_evidence_not_visible");
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await stat(root).then(() => true).catch(() => false), false);
  }
});
