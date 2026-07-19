import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, rm, stat } from "node:fs/promises";
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
import {
  cleanupSandbox,
  generateAndValidateSandbox,
  selectCompatibleSqliteBinary,
} from "./sandbox-harness.mjs";

const execFileAsync = promisify(execFile);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceEntrypoint = path.join(packageRoot, "variants/sqlite/bin/casebook-persistence.mjs");
const protocol = { id: "casebook-persistence-json", version: 1 };
const ids = Object.freeze({
  namespaceB: "namespace:5b490290-c5f9-4cae-9cd8-58f4a9b66389",
  namespaceC: "namespace:f73a3cfd-d847-4d6c-9752-a6c40e2c8226",
  frame: "frame:18cfb030-f36b-4e9a-9384-570a02350303",
  discoveryFrontier: "discovery:b0396989-ce32-4a09-8c8e-ba5d63755037",
  discoveryFog: "discovery:5666763c-1322-4e42-bdb2-0b4e3caeb2b4",
  discoveryAdded: "discovery:7a12e9d1-cd83-497b-bd77-6c74e4f1a7aa",
  boundary: "disposition-boundary:854e9776-f3e6-49ca-82c2-c3fd13809ed8",
  boundaryAdded: "disposition-boundary:a8bb2fcc-eea5-4f9f-aaac-92a7e1c530ca",
  pendingDisposition: "case-disposition:366021a5-40a1-43d4-b786-3cb7eae349b0",
  noCaseDisposition: "case-disposition:b0ff1f87-58a4-44c8-bd8c-1d185018532a",
  addedDisposition: "case-disposition:06450871-49f7-442c-a896-29d9cddc83e0",
  addedBoundaryVersion: "disposition-boundary-version:d8f9f787-9855-4eb7-8abd-a862e5d3fb70",
  addedDispositionVersion: "case-disposition-version:d6ba0cfc-51f7-4bb4-9729-d04c76f91db8",
  caseB: "case:f8399e63-a6f2-4ea6-aa75-c0d71ac5b028",
  caseC: "case:2a9be58b-921f-475b-8652-c5aafd1cae03",
  policyAOnly: "view-policy:6a0ce39d-9368-4600-b10c-955f0ae0c918",
  replacementDiscovery: "discovery:f8883061-3741-4985-8bdc-c805b9e7cfd7",
});

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
    return { code: 0, json: JSON.parse(stdout), stderr };
  } catch (error) {
    const stdout = error.stdout ?? "";
    return { code: error.code, json: stdout ? JSON.parse(stdout) : {}, stderr: error.stderr ?? "" };
  }
}

function configuration(store, sqliteBinary, label) {
  return {
    source: { kind: "synthetic-test", locator: label },
    authority_mode: "sqlite",
    sqlite: { database_url: store, sqlite_bin: sqliteBinary },
  };
}

function context(initialized, purpose, policyRevisionId = initialized.view.policy_revision_id) {
  return {
    view_id: initialized.view.id,
    view_policy_revision_id: policyRevisionId,
    purpose,
    requested_audience_ceiling: "private",
  };
}

async function setup(entrypoint, root, sqliteBinary, label) {
  const store = path.join(root, `${label}.sqlite3`);
  const config = configuration(store, sqliteBinary, label);
  const initialized = await invoke(entrypoint, root, {
    protocol,
    operation: "initialize_store",
    operation_id: `operation:${label}:initialize`,
    authority_claim: { human_authorized: true, acting_role: "architect", authority_basis: "disposable L03-W03 test" },
    configuration: config,
  });
  assert.equal(initialized.code, 0, initialized.stderr);
  return { entrypoint, root, store, sqliteBinary, configuration: config, initialized: initialized.json.result.initialization };
}

async function addGrantedNamespaces(state) {
  await execFileAsync(state.sqliteBinary, ["-batch", "-bail", state.store, `
    INSERT INTO namespaces VALUES ('${ids.namespaceB}', 'l03-w03-b', 'active', 'synthetic-test');
    INSERT INTO namespaces VALUES ('${ids.namespaceC}', 'l03-w03-c', 'active', 'synthetic-test');
    INSERT INTO view_policy_namespace_grants VALUES ('${state.initialized.view.policy_revision_id}', '${ids.namespaceB}');
    INSERT INTO view_policy_namespace_grants VALUES ('${state.initialized.view.policy_revision_id}', '${ids.namespaceC}');
  `], { encoding: "utf8" });
}

function minimalCase(state, id, homeNamespaceId, operationId) {
  return {
    protocol,
    operation: "case.create",
    request_version: 1,
    operation_id: operationId,
    store_id: state.initialized.store_id,
    context: context(state.initialized, "create visible external reference target"),
    expected_revision: 0,
    commit_basis: "synthetic complete minimal Case",
    provenance: { acting_role: "test", authority_basis: "granted namespace fixture" },
    case: {
      id,
      home_namespace_id: homeNamespaceId,
      state: "active",
      title: "Reference target",
      summary: "Target for Frame visibility projection.",
      scope: "Disposable test only.",
    },
    configuration: state.configuration,
  };
}

function baseFrame(state) {
  const home = state.initialized.namespace.id;
  return {
    id: ids.frame,
    home_namespace_id: home,
    authority_scope_namespace_ids: [home, ids.namespaceB, ids.namespaceC],
    status: "active",
    title: "Legacy reconciliation base",
    outcome: "Prepare a structural diff without mutation.",
    included_scope: ["immutable snapshots"],
    excluded_scope: ["writeback"],
    limitations: "Synthetic disposable evidence.",
    completion_condition: "Preparation result is explicit.",
    case_links: [
      { target_kind: "case", target_id: ids.caseB, predicate: "informs" },
      { target_kind: "case", target_id: ids.caseC, predicate: "informs" },
    ],
    discovery: [
      {
        id: ids.discoveryFrontier,
        display_order: 0,
        lifecycle: "active",
        category: "frontier",
        title: "Frontier emitted second",
        body: "Source selection is intentionally not category-grouped.",
        human_authority: "required",
        dependencies: [{ target_kind: "case", target_id: ids.caseC, predicate: "depends-on" }],
        scope_namespace_ids: [ids.namespaceB],
      },
      {
        id: ids.discoveryFog,
        display_order: 1,
        lifecycle: "active",
        category: "fog",
        title: "Fog emitted first",
        body: "Labels follow emitted grouped order.",
        human_authority: "unclear",
        dependencies: [],
        scope_namespace_ids: [state.initialized.namespace.id],
      },
    ],
    disposition_boundaries: [{
      id: ids.boundary,
      display_label: "DB-001",
      display_order: 0,
      title: "First natural boundary",
      closure: "open",
      disposition_ids: [ids.pendingDisposition, ids.noCaseDisposition],
    }],
    case_dispositions: [{
      id: ids.pendingDisposition,
      boundary_id: ids.boundary,
      result_summary: "A hidden Case endpoint still awaits realization",
      classification_state: "classified",
      disposition: "intake",
      rationale: "The result is reusable.",
      realization_state: "awaiting_case",
      case_id: ids.caseB,
      case_operation_id: "operation:l03-w03-later-case",
    }, {
      id: ids.noCaseDisposition,
      boundary_id: ids.boundary,
      result_summary: "Transient result",
      classification_state: "classified",
      disposition: "no_case",
      no_case_reason: "The result is disposable test output.",
    }],
  };
}

function frameMutation(state, operation, operationId, expectedRevision, frame, policyRevisionId = state.initialized.view.policy_revision_id) {
  return {
    protocol,
    operation,
    request_version: 1,
    operation_id: operationId,
    store_id: state.initialized.store_id,
    context: context(state.initialized, operation, policyRevisionId),
    expected_revision: expectedRevision,
    commit_basis: "complete Frame selection under explicit synthetic grants",
    provenance: { acting_role: "test", authority_basis: "all scope additions are granted by the exact view" },
    ...(operation === "frame.commit_revision" ? { frame_id: frame.id } : {}),
    frame,
    configuration: state.configuration,
  };
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function snapshot(filename, text) {
  const bytes = Buffer.from(text);
  return { filename, digest: sha256(bytes), bytes_base64: bytes.toString("base64") };
}

function frameWithVersions(frame, revision) {
  const copy = structuredClone(frame);
  copy.discovery = copy.discovery.map((item) => ({
    ...item,
    version_id: revision.version_ids.discovery_items.find((entry) => entry.discovery_item_id === item.id)?.version_id,
  }));
  if (copy.disposition_boundaries != null) {
    copy.disposition_boundaries = copy.disposition_boundaries.map((item) => ({
      ...item,
      version_id: revision.version_ids.disposition_boundaries.find((entry) => entry.disposition_boundary_id === item.id)?.version_id,
    }));
    copy.case_dispositions = copy.case_dispositions.map((item) => ({
      ...item,
      version_id: revision.version_ids.case_dispositions.find((entry) => entry.case_disposition_id === item.id)?.version_id,
    }));
  }
  return copy;
}

function manifestFor(frame, revision, frameSnapshot, discoverySnapshot, { includeDispositionBindings = true } = {}) {
  return {
    schema: "casebook-frame-legacy-manifest@1",
    renderer: { id: "casebook-l01-frame-markdown", version: 1 },
    frame_id: frame.id,
    frame_version_id: revision.version_ids.frame,
    base_revision_id: revision.id,
    base_revision_number: revision.number,
    documents: {
      [frameSnapshot.filename]: frameSnapshot.digest,
      [discoverySnapshot.filename]: discoverySnapshot.digest,
    },
    discovery_items: l01DiscoveryEntries(frame).map(({ item, display_label }) => ({
      display_label,
      id: item.id,
      version_id: revision.version_ids.discovery_items.find((entry) => entry.discovery_item_id === item.id).version_id,
    })),
    ...(includeDispositionBindings && frame.disposition_boundaries != null ? {
      disposition_boundaries: frame.disposition_boundaries.map((item, index) => ({
        source_label: `DB-${String(index + 1).padStart(3, "0")}`,
        id: item.id,
        version_id: revision.version_ids.disposition_boundaries.find((entry) => entry.disposition_boundary_id === item.id).version_id,
      })),
      case_dispositions: frame.case_dispositions.map((item, index) => ({
        source_label: `CD-${String(index + 1).padStart(3, "0")}`,
        id: item.id,
        version_id: revision.version_ids.case_dispositions.find((entry) => entry.case_disposition_id === item.id).version_id,
      })),
    } : {}),
  };
}

function prepareRequest(state, revision, frame, options = {}) {
  const renderedFrame = options.renderedFrame ?? frameWithVersions(frame, revision);
  const frameDocument = snapshot("frame.md", options.frameMarkdown ?? renderL01FrameMarkdown(renderedFrame));
  const discoveryDocument = snapshot(options.discoveryFilename ?? "discovery.md", options.discoveryMarkdown ?? renderL01DiscoveryMarkdown(frame));
  const manifest = options.manifest ?? manifestFor(frame, revision, frameDocument, discoveryDocument, options);
  const manifestBytes = Buffer.from(JSON.stringify(manifest));
  return {
    protocol,
    operation: "frame.legacy.prepare_reconciliation",
    request_version: 1,
    store_id: state.initialized.store_id,
    context: context(state.initialized, "prepare immutable legacy reconciliation", options.policyRevisionId),
    frame_id: frame.id,
    base_revision: { id: revision.id, number: revision.number },
    documents: [frameDocument, discoveryDocument],
    machine_manifest: { digest: sha256(manifestBytes), bytes_base64: manifestBytes.toString("base64") },
    configuration: state.configuration,
  };
}

async function ownerCounts(state) {
  const { stdout } = await execFileAsync(state.sqliteBinary, ["-batch", "-bail", "-json", state.store, `
    SELECT
      (SELECT count(*) FROM owner_revisions) AS revisions,
      (SELECT count(*) FROM owner_events) AS events,
      (SELECT count(*) FROM owner_outbox) AS outbox,
      (SELECT count(*) FROM store_operation_receipts) AS receipts;
  `], { encoding: "utf8" });
  return JSON.parse(stdout)[0];
}

async function rotateToHomeOnly(state) {
  const prior = state.initialized.view.policy_revision_id;
  await execFileAsync(state.sqliteBinary, ["-batch", "-bail", state.store, `
    BEGIN IMMEDIATE;
    UPDATE view_policy_revisions SET lifecycle = 'superseded' WHERE view_policy_revision_id = '${prior}';
    INSERT INTO view_policy_revisions
      (view_policy_revision_id, view_id, revision_number, audience_ceiling, lifecycle,
       authority_claim_json, object_kinds_json, store_operation_receipts_visible,
       predecessor_revision_id, activation_fence, created_at)
    SELECT '${ids.policyAOnly}', view_id, revision_number + 1, audience_ceiling, 'active',
      authority_claim_json, object_kinds_json, store_operation_receipts_visible,
      view_policy_revision_id, (SELECT operation_fence FROM store_fence WHERE singleton = 1), 'synthetic-test'
    FROM view_policy_revisions WHERE view_policy_revision_id = '${prior}';
    INSERT INTO view_policy_namespace_grants VALUES ('${ids.policyAOnly}', '${state.initialized.namespace.id}');
    COMMIT;
  `], { encoding: "utf8" });
  return ids.policyAOnly;
}

async function exerciseScopeAndPreparation(state, label, { exhaustive = false } = {}) {
  await addGrantedNamespaces(state);
  for (const [id, namespaceId, suffix] of [[ids.caseB, ids.namespaceB, "b"], [ids.caseC, ids.namespaceC, "c"]]) {
    const created = await invoke(state.entrypoint, state.root, minimalCase(state, id, namespaceId, `operation:${label}:case-${suffix}`));
    assert.equal(created.code, 0, JSON.stringify(created.json));
  }

  const frame = baseFrame(state);
  const created = await invoke(state.entrypoint, state.root, frameMutation(state, "frame.create", `operation:${label}:frame-create`, 0, frame));
  assert.equal(created.code, 0, JSON.stringify(created.json));
  assert.equal(created.json.result.revision.number, 1);
  assert.deepEqual(l01DiscoveryEntries(frame).map(({ item, display_label }) => [display_label, item.id]), [
    ["AT-001", ids.discoveryFog],
    ["AT-002", ids.discoveryFrontier],
  ]);

  const beforePrepare = await ownerCounts(state);
  const currentRequest = prepareRequest(state, created.json.result.revision, frame);
  const current = await invoke(state.entrypoint, state.root, currentRequest);
  assert.equal(current.code, 0, JSON.stringify(current.json));
  assert.equal(current.json.result.status, "prepared", JSON.stringify(current.json));
  assert.equal(current.json.result.base_current, true);
  assert.deepEqual(current.json.result.structural_diff, { additions: [], changes: [], removals: [] });
  assert.equal(current.json.result.absent_in_legacy, false);
  assert.equal(current.json.result.legacy_disposition_state, "present");
  assert.equal(current.json.result.requires_semantic_reconcile, true);
  assert.equal(current.json.result.parsed.disposition_boundaries.length, 1);
  assert.equal(current.json.result.parsed.case_dispositions.length, 2);
  assert.equal(current.json.result.frame_match.match, "exact");
  assert.deepEqual(current.json.result.disposition_boundary_matches.map((item) => item.match), ["exact"]);
  assert.deepEqual(current.json.result.case_disposition_matches.map((item) => item.match), ["exact", "exact"]);
  assert.equal(current.json.result.mutation_performed, false);
  assert.equal(current.json.result.watch_started, false);
  assert.equal(current.json.result.rename_performed, false);
  assert.equal(current.json.result.writeback_performed, false);
  assert.deepEqual(await ownerCounts(state), beforePrepare);

  const updatedFrame = structuredClone(frame);
  updatedFrame.title = "Current revision differs from immutable base";
  const updated = await invoke(state.entrypoint, state.root, frameMutation(state, "frame.commit_revision", `operation:${label}:frame-update`, 1, updatedFrame));
  assert.equal(updated.code, 0, JSON.stringify(updated.json));
  assert.equal(updated.json.result.revision.number, 2);

  const stale = await invoke(state.entrypoint, state.root, currentRequest);
  assert.equal(stale.code, 0, JSON.stringify(stale.json));
  assert.equal(stale.json.result.base_stale, true);
  assert.equal(stale.json.result.current_revision.number, 2);
  assert.deepEqual(stale.json.result.structural_diff, { additions: [], changes: [], removals: [] });

  if (exhaustive) {
    const beforeExhaustivePreparation = await ownerCounts(state);
    const discoveryMap = await invoke(state.entrypoint, state.root, prepareRequest(state, created.json.result.revision, frame, {
      discoveryFilename: "discovery-map.md",
    }));
    assert.equal(discoveryMap.code, 0, JSON.stringify(discoveryMap.json));
    assert.equal(discoveryMap.json.result.selected_discovery_filename, "discovery-map.md");

    const addedFrame = structuredClone(frame);
    addedFrame.discovery.push({
      id: ids.discoveryAdded,
      display_order: 2,
      lifecycle: "active",
      category: "blocked",
      title: "Edited addition",
      body: "No base identity exists.",
      human_authority: "not_required",
      dependencies: [],
    });
    const addition = await invoke(state.entrypoint, state.root, prepareRequest(state, created.json.result.revision, frame, {
      discoveryMarkdown: renderL01DiscoveryMarkdown(addedFrame),
    }));
    assert.equal(addition.code, 0, JSON.stringify(addition.json));
    assert.equal(addition.json.result.status, "prepared");
    assert.deepEqual(addition.json.result.structural_diff.additions.map((item) => item.display_label), ["AT-003"]);

    const absentFrame = structuredClone(frame);
    delete absentFrame.disposition_boundaries;
    delete absentFrame.case_dispositions;
    const absent = await invoke(state.entrypoint, state.root, prepareRequest(state, created.json.result.revision, frame, {
      frameMarkdown: renderL01FrameMarkdown(absentFrame),
    }));
    assert.equal(absent.code, 0, JSON.stringify(absent.json));
    assert.equal(absent.json.result.status, "prepared");
    assert.equal(absent.json.result.absent_in_legacy, true);
    assert.equal(absent.json.result.legacy_disposition_state, "absent_in_legacy");
    assert.equal(absent.json.result.requires_semantic_reconcile, true);
    assert.deepEqual(absent.json.result.parsed.disposition_boundaries, []);
    assert.deepEqual(absent.json.result.structural_diff.removals.filter((item) => item.disposition_boundary_id != null), [{ disposition_boundary_id: ids.boundary }]);
    assert.deepEqual(absent.json.result.structural_diff.removals.filter((item) => item.case_disposition_id != null).map((item) => item.case_disposition_id), [ids.pendingDisposition, ids.noCaseDisposition]);

    const changedDispositionFrame = frameWithVersions(frame, created.json.result.revision);
    changedDispositionFrame.disposition_boundaries[0].title = "Edited but manifest-bound boundary";
    changedDispositionFrame.case_dispositions[0].result_summary = "Edited but manifest-bound result";
    const changedDisposition = await invoke(state.entrypoint, state.root, prepareRequest(state, created.json.result.revision, frame, {
      renderedFrame: changedDispositionFrame,
    }));
    assert.equal(changedDisposition.code, 0, JSON.stringify(changedDisposition.json));
    assert.deepEqual(changedDisposition.json.result.disposition_boundary_matches.map((item) => item.match), ["exact"]);
    assert.deepEqual(changedDisposition.json.result.case_disposition_matches.map((item) => item.match), ["exact", "exact"]);
    assert.equal(changedDisposition.json.result.structural_diff.changes.some((item) => item.path === `disposition_boundaries.${ids.boundary}.title`), true);
    assert.equal(changedDisposition.json.result.structural_diff.changes.some((item) => item.path === `case_dispositions.${ids.pendingDisposition}.result_summary`), true);

    const addedDispositionFrame = frameWithVersions(frame, created.json.result.revision);
    addedDispositionFrame.disposition_boundaries.push({
      id: ids.boundaryAdded, version_id: ids.addedBoundaryVersion, display_label: "DB-002", display_order: 1,
      title: "Unbound addition", closure: "open", disposition_ids: [ids.addedDisposition],
    });
    addedDispositionFrame.case_dispositions.push({
      id: ids.addedDisposition, version_id: ids.addedDispositionVersion, boundary_id: ids.boundaryAdded,
      result_summary: "Unbound disposition addition", classification_state: "pending_classification",
      pending_reason: "No manifest identity exists.", resume_condition: "Semantic owner classifies it.",
    });
    const addedDisposition = await invoke(state.entrypoint, state.root, prepareRequest(state, created.json.result.revision, frame, {
      renderedFrame: addedDispositionFrame,
    }));
    assert.equal(addedDisposition.code, 0, JSON.stringify(addedDisposition.json));
    assert.equal(addedDisposition.json.result.disposition_boundary_matches.at(-1).match, "unmatched");
    assert.equal(addedDisposition.json.result.case_disposition_matches.at(-1).match, "unmatched");
    assert.equal(addedDisposition.json.result.structural_diff.additions.some((item) => item.source_label === "DB-002"), true);
    assert.equal(addedDisposition.json.result.structural_diff.additions.some((item) => item.source_label === "CD-003"), true);

    const ambiguous = await invoke(state.entrypoint, state.root, prepareRequest(state, created.json.result.revision, frame, {
      includeDispositionBindings: false,
    }));
    assert.equal(ambiguous.code, 0, JSON.stringify(ambiguous.json));
    assert.deepEqual(ambiguous.json.result.disposition_boundary_matches.map((item) => item.match), ["ambiguous"]);
    assert.deepEqual(ambiguous.json.result.case_disposition_matches.map((item) => item.match), ["ambiguous", "ambiguous"]);

    const removedFrame = { ...structuredClone(frame), discovery: [structuredClone(frame.discovery[1])] };
    const removal = await invoke(state.entrypoint, state.root, prepareRequest(state, created.json.result.revision, frame, {
      discoveryMarkdown: renderL01DiscoveryMarkdown(removedFrame),
    }));
    assert.equal(removal.code, 0, JSON.stringify(removal.json));
    assert.deepEqual(removal.json.result.structural_diff.removals, [{ discovery_item_id: ids.discoveryFrontier }]);

    const changedFrame = structuredClone(frame);
    changedFrame.discovery[1].body = "Edited body remains bound to the stable Fog identity.";
    const changed = await invoke(state.entrypoint, state.root, prepareRequest(state, created.json.result.revision, frame, {
      discoveryMarkdown: renderL01DiscoveryMarkdown(changedFrame),
    }));
    assert.equal(changed.code, 0, JSON.stringify(changed.json));
    assert.equal(changed.json.result.structural_diff.changes.some((item) => item.path === `discovery.${ids.discoveryFog}.body`), true);

    const identityRequest = prepareRequest(state, created.json.result.revision, frame);
    const identityManifest = JSON.parse(Buffer.from(identityRequest.machine_manifest.bytes_base64, "base64"));
    identityManifest.discovery_items[0].id = ids.replacementDiscovery;
    const identityBytes = Buffer.from(JSON.stringify(identityManifest));
    identityRequest.machine_manifest = { digest: sha256(identityBytes), bytes_base64: identityBytes.toString("base64") };
    const changedIdentity = await invoke(state.entrypoint, state.root, identityRequest);
    assert.equal(changedIdentity.code, 0, JSON.stringify(changedIdentity.json));
    assert.equal(changedIdentity.json.result.status, "invalid");
    assert.equal(changedIdentity.json.result.violations.some((item) => item.rule === "identity_binding_extra"), true);
    assert.equal(changedIdentity.json.result.violations.some((item) => item.rule === "identity_binding_not_one_to_one"), true);

    const digestFailure = structuredClone(currentRequest);
    digestFailure.documents[0].digest = `sha256:${"0".repeat(64)}`;
    const badDigest = await invoke(state.entrypoint, state.root, digestFailure);
    assert.equal(badDigest.code, 2);
    assert.deepEqual(badDigest.json.failure.evidence.violations, [{ path: "documents[0].digest", rule: "digest_mismatch" }]);

    const schemaRequest = structuredClone(currentRequest);
    const schemaManifest = JSON.parse(Buffer.from(schemaRequest.machine_manifest.bytes_base64, "base64"));
    schemaManifest.schema = "casebook-frame-legacy-manifest@2";
    const schemaBytes = Buffer.from(JSON.stringify(schemaManifest));
    schemaRequest.machine_manifest = { digest: sha256(schemaBytes), bytes_base64: schemaBytes.toString("base64") };
    const badSchema = await invoke(state.entrypoint, state.root, schemaRequest);
    assert.equal(badSchema.code, 2);
    assert.deepEqual(badSchema.json.failure.evidence.violations, [{ path: "machine_manifest", rule: "manifest_schema_invalid" }]);

    const badFilenameRequest = prepareRequest(state, created.json.result.revision, frame, { discoveryFilename: "Discovery.md" });
    const badFilename = await invoke(state.entrypoint, state.root, badFilenameRequest);
    assert.equal(badFilename.code, 2);
    assert.deepEqual(badFilename.json.failure.evidence.violations, [{ path: "documents", rule: "legacy_document_selection_invalid" }]);

    for (const encoded of ["YQ", "YQ=", "YQ===", "YQ==\n", "YQ-="]) {
      const nonCanonical = structuredClone(currentRequest);
      nonCanonical.documents[0].bytes_base64 = encoded;
      const rejected = await invoke(state.entrypoint, state.root, nonCanonical);
      assert.equal(rejected.code, 2, encoded);
      assert.deepEqual(rejected.json.failure.evidence.violations, [{ path: "documents[0].bytes_base64", rule: "base64_invalid" }]);
    }
    const canonical = structuredClone(currentRequest);
    canonical.documents[0].bytes_base64 = "YQ==";
    canonical.documents[0].digest = sha256(Buffer.from("a"));
    const canonicalManifest = JSON.parse(Buffer.from(canonical.machine_manifest.bytes_base64, "base64"));
    canonicalManifest.documents["frame.md"] = canonical.documents[0].digest;
    const canonicalManifestBytes = Buffer.from(JSON.stringify(canonicalManifest));
    canonical.machine_manifest = { digest: sha256(canonicalManifestBytes), bytes_base64: canonicalManifestBytes.toString("base64") };
    const canonicalAccepted = await invoke(state.entrypoint, state.root, canonical);
    assert.equal(canonicalAccepted.code, 0, JSON.stringify(canonicalAccepted.json));
    assert.equal(canonicalAccepted.json.result.violations.some((item) => item.rule === "frontmatter_required"), true);
    assert.deepEqual(await ownerCounts(state), beforeExhaustivePreparation);
  }

  const reducedFrame = structuredClone(updatedFrame);
  reducedFrame.authority_scope_namespace_ids = [state.initialized.namespace.id];
  reducedFrame.case_links = reducedFrame.case_links.map((link) => ({ ...link, authority_scope: "external_read_only" }));
  reducedFrame.discovery = reducedFrame.discovery.map((item) => ({
    ...item,
    dependencies: item.dependencies.map((link) => ({ ...link, authority_scope: "external_read_only" })),
    scope_namespace_ids: [state.initialized.namespace.id],
  }));
  const reduced = await invoke(state.entrypoint, state.root, frameMutation(state, "frame.commit_revision", `operation:${label}:frame-reduce`, 2, reducedFrame));
  assert.equal(reduced.code, 0, JSON.stringify(reduced.json));
  assert.equal(reduced.json.result.revision.number, 3);

  const homeOnlyPolicy = await rotateToHomeOnly(state);
  const readRequest = {
    protocol,
    operation: "frame.read",
    request_version: 1,
    store_id: state.initialized.store_id,
    context: context(state.initialized, "project hidden scope and references", homeOnlyPolicy),
    frame_id: ids.frame,
    configuration: state.configuration,
  };
  const currentRead = await invoke(state.entrypoint, state.root, readRequest);
  assert.equal(currentRead.code, 0, JSON.stringify(currentRead.json));
  assert.equal(currentRead.json.result.frame.hidden_reference_count, 4);
  assert.deepEqual(currentRead.json.result.frame.case_links, []);
  assert.deepEqual(currentRead.json.result.frame.discovery[0].dependencies, []);
  assert.equal(JSON.stringify(currentRead.json).includes(ids.caseB), false);
  assert.equal(currentRead.json.result.frame.case_dispositions[0].case_id, undefined);
  assert.equal(currentRead.json.result.frame.case_dispositions[0].case_operation_id, undefined);

  const historical = await invoke(state.entrypoint, state.root, { ...readRequest, revision_number: 2 });
  assert.equal(historical.code, 0, JSON.stringify(historical.json));
  assert.equal(historical.json.result.frame.hidden_authority_scope_count, 2);
  assert.equal(historical.json.result.frame.hidden_reference_count, 4);
  assert.deepEqual(historical.json.result.frame.authority_scope_namespace_ids, [state.initialized.namespace.id]);

  const discoveryRead = await invoke(state.entrypoint, state.root, {
    protocol,
    operation: "frame.discovery.read",
    request_version: 1,
    store_id: state.initialized.store_id,
    context: context(state.initialized, "project Discovery hidden counts", homeOnlyPolicy),
    frame_id: ids.frame,
    discovery_item_id: ids.discoveryFrontier,
    revision_number: 2,
    configuration: state.configuration,
  });
  assert.equal(discoveryRead.code, 0, JSON.stringify(discoveryRead.json));
  assert.equal(discoveryRead.json.result.hidden_authority_scope_count, 2);
  assert.equal(discoveryRead.json.result.hidden_reference_count, 4);
}

test("source entrypoint prepares current/stale legacy diffs, rejects malformed snapshots, and projects scoped reads without mutation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l03-w03-source-"));
  try {
    const sqliteBinary = await selectCompatibleSqliteBinary();
    const state = await setup(sourceEntrypoint, root, sqliteBinary, "source");
    await exerciseScopeAndPreparation(state, "source", { exhaustive: true });
  } finally {
    await rm(root, { recursive: true, force: true });
    assert.equal(await stat(root).then(() => true).catch(() => false), false);
  }
});

test("generated Pi, Codex, and OpenCode connectors execute reconciliation and multi-namespace scope mutation/read paths", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l03-w03-generated-"));
  try {
    const report = await generateAndValidateSandbox({ sandboxRoot: root });
    for (const generated of report.results) {
      const entrypoint = path.join(generated.package_root, "variants/sqlite/bin/casebook-persistence.mjs");
      const state = await setup(entrypoint, path.join(root, "unrelated-cwd"), report.sqlite_binary, generated.target);
      await exerciseScopeAndPreparation(state, generated.target);
    }
  } finally {
    assert.equal(await cleanupSandbox(root), true);
    assert.equal(await stat(root).then(() => true).catch(() => false), false);
  }
});
