import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createBootstrapAuthorizationDocument } from "../variants/sqlite/lib/substrate/bootstrap.mjs";
import { selectSqliteBinary, sqlite } from "../variants/sqlite/lib/substrate/diagnostics.mjs";
import {
  canonicalSuccessorCommitDigest, invokeSuccessorMechanicalOperation, successorDigest,
} from "../variants/sqlite/lib/substrate/mechanical-successor.mjs";
import { canonicalProfileRequestDigest, invokeProfileOperation, validateProfileContent } from "../variants/sqlite/lib/profile/index.mjs";
import {
  AdmissionCapabilityError, CASE_OPERATION_ROWS, SUBSTRATE_ADMISSION_ROWS, createAdmissionRegistry,
} from "../variants/sqlite/lib/resource/admission-guards.mjs";
import { CASE_OPERATION_FIELDS, invokeSuccessorCaseOperation } from "../variants/sqlite/lib/case/successor.mjs";

const protocol = { id: "casebook-persistence-json", version: 2 };
const id = (prefix, suffix) => `${prefix}:30000000-0000-4000-8000-${suffix.padStart(12, "0")}`;
const ids = {
  store: id("store", "1"), workspace: id("workspace", "2"), namespace: id("namespace", "3"),
  namespaceRevision: id("owner-revision", "4"), namespaceVersion: id("version", "5"),
  profile: id("profile", "6"), profileRevision: id("owner-revision", "7"), profileVersion: id("version", "8"),
  selection: id("profile-selection", "9"), selectionRevision: id("owner-revision", "10"), selectionVersion: id("version", "11"),
  event: id("event", "12"), slot: id("admission-slot", "13"),
};
const profileContent = (predecessor = null, lifecycle = "candidate", purposes = ["profile.manage", "profile.read", "substrate.commit_revision", "receipt.read", "integrity.observe", "projection.rebuild"]) => ({
  schema: "admission-disclosure-profile@1", audience_ceiling: "private", lifecycle, predecessor_revision_id: predecessor,
  object_kinds: ["profile", "profile-selection", "case", "frame"], purposes,
  bounds: { max_results: 100, max_traversal_depth: 8, max_export_bytes: 1048576 },
  projection: { locator: "redacted", export: "deny" }, disclosure: { receipts: true, events: true, checkpoints: true },
});
const record = (owner_id, revision_id, version_id, content) => ({ owner_id, revision_id, version_id, content, content_digest: successorDigest(content) });
const handle = (overrides = {}) => ({
  selection_id: ids.selection, selection_revision_id: ids.selectionRevision,
  profile_id: ids.profile, profile_revision_id: ids.profileRevision, activation_fence: 1, ...overrides,
});

async function fixture(t, label) {
  const root = await mkdtemp(path.join(os.tmpdir(), `casebook-profile-${label}-`));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = path.join(root, "authority.sqlite3"), grant = path.join(root, "bootstrap.grant.json");
  const request = {
    protocol, operation: "initialize_store", request_version: 1, operation_id: `operation:profile:${label}:initialize`,
    store_id: ids.store,
    authority_claim: { human_authorized: true, local_uid: process.getuid(), human_identity: "test-operator", provenance: `disposable:${label}` },
    initial: {
      root_namespace: record(ids.namespace, ids.namespaceRevision, ids.namespaceVersion, { schema: "namespace-bootstrap@1", display_name: "Personal", parent_id: null, lifecycle: "active" }),
      private_profile: record(ids.profile, ids.profileRevision, ids.profileVersion, profileContent(null, "active")),
      profile_selection: record(ids.selection, ids.selectionRevision, ids.selectionVersion, { schema: "profile-selection@1", admission_slot_id: ids.slot, selected_profile_id: ids.profile, selected_profile_revision_id: ids.profileRevision, lifecycle: "active", activation_fence: 1 }),
      project_default: null, initialization_event_id: ids.event,
    },
    configuration: { source: { kind: "synthetic-test", locator: `profile:${label}` }, authority_mode: "sqlite", sqlite: { database_url: store } },
  };
  const authorization = await createBootstrapAuthorizationDocument(request, { grant_path: grant });
  request.request_digest = authorization.request_digest;
  request.bootstrap_authorization = { path: grant, sha256: authorization.sha256 };
  await writeFile(grant, `${JSON.stringify(authorization.document)}\n`, { mode: 0o600 });
  const entrypoint = path.resolve(new URL("../variants/sqlite/bin/casebook-persistence.mjs", import.meta.url).pathname);
  const { execFile } = await import("node:child_process");
  const initialized = await new Promise((resolve) => {
    const child = execFile(process.execPath, [entrypoint], { cwd: root, env: { HOME: root, PATH: process.env.PATH ?? "" }, encoding: "utf8" }, (error, stdout, stderr) => resolve({ error, stdout, stderr }));
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
  assert.equal(initialized.error, null, initialized.stderr);
  return { root, store, configuration: request.configuration };
}
function baseRequest(fx, operation, operationId, admissionHandle = handle()) {
  return {
    operation, operation_id: operationId, store_id: ids.store,  admission_slot_id: ids.slot,
    admission: { kind: "sqlite_profile", binding: admissionHandle }, configuration: fx.configuration,
    authority_claim: { human_authorized: true, human_identity: "test-operator", provenance: "disposable:profile-lifecycle" },
  };
}
function bindDigest(request) { request.request_digest = canonicalProfileRequestDigest(ids.store, request); return request; }
async function counts(fx, ownerId) {
  const binary = await selectSqliteBinary();
  const { stdout } = await sqlite(binary, fx.store, `PRAGMA query_only=ON; SELECT (SELECT count(*) FROM owners WHERE owner_id='${ownerId}') owners,(SELECT count(*) FROM owner_events WHERE owner_id='${ownerId}') events,(SELECT count(*) FROM owner_outbox WHERE owner_id='${ownerId}') outbox,(SELECT count(*) FROM store_operation_receipts) receipts;`, { args: ["-batch", "-bail", "-json"] });
  return JSON.parse(stdout)[0];
}
async function denialSnapshot(fx, ownerId, operationId) {
  const binary = await selectSqliteBinary();
  const { stdout } = await sqlite(binary, fx.store, `PRAGMA query_only=ON; SELECT
    (SELECT count(*) FROM owners WHERE owner_id='${ownerId}') owners,
    (SELECT count(*) FROM owner_family_bindings WHERE owner_id='${ownerId}') families,
    (SELECT count(*) FROM owner_versions WHERE owner_id='${ownerId}') versions,
    (SELECT count(*) FROM owner_revisions WHERE owner_id='${ownerId}') revisions,
    (SELECT count(*) FROM owner_current WHERE owner_id='${ownerId}') current_rows,
    (SELECT count(*) FROM owner_events WHERE owner_id='${ownerId}') events,
    (SELECT count(*) FROM owner_outbox WHERE owner_id='${ownerId}') outbox,
    (SELECT count(*) FROM store_operation_receipts WHERE operation_id='${operationId}') receipts,
    (SELECT count(*) FROM operation_admission_evidence WHERE operation_id='${operationId}') admission_evidence,
    (SELECT operation_fence FROM store_fence WHERE singleton=1) operation_fence;`, { args: ["-batch", "-bail", "-json"] });
  return JSON.parse(stdout)[0];
}

function adapter(owner_kind, operations, supported_guards = []) {
  return { owner_kind, adapter_version: 1, schemas: [`${owner_kind}-schema@1`], operations, complete_owner: true, resource_deltas: true, events: true, results: true, projections: true, supported_guards };
}
function lifecycle(owner_kind) { return { owner_kind, descriptor_version: 1, descriptor_kind: "selected-version-lifecycle@1", current_states: ["active"], mutation_states: ["active", "retired"] }; }
function caseCommitRegistry({ operations = ["substrate.commit_revision"], lifecycles = [lifecycle("case")] } = {}) {
  return createAdmissionRegistry({
    operations: SUBSTRATE_ADMISSION_ROWS,
    adapters: [adapter("case", operations, ["owner-policy-fence@1"])],
    lifecycles,
  });
}
const TEST_CASE_COMMIT_REGISTRY = caseCommitRegistry();

test("closed adapter/lifecycle/guard registration denies unknown and partial capabilities", () => {
  const forbidden = { ...profileContent(), namespace_id: ids.namespace };
  assert.throws(() => validateProfileContent(forbidden), (error) => error.code === "profile_shape_invalid");
  const row = { operation: "case.test", capability_class: "ordinary_cli", purpose: "case.read", owner_kinds: ["case"], profile_fence: "profile-selection-fence@1", guard_kinds: [] };
  assert.throws(() => createAdmissionRegistry({ operations: [row], adapters: [], lifecycles: [] }), (error) => error instanceof AdmissionCapabilityError && error.code === "owner_adapter_unavailable");
  assert.throws(() => createAdmissionRegistry({ operations: [row], adapters: [adapter("case", ["case.test"])], lifecycles: [] }), (error) => error.code === "owner_lifecycle_unavailable");
  const registry = createAdmissionRegistry({ operations: [row], adapters: [adapter("case", ["case.test"])], lifecycles: [lifecycle("case")] });
  assert.equal(registry.operation("case.test").purpose, "case.read");
  assert.throws(() => registry.owner("steward"), (error) => error.code === "owner_adapter_unavailable");
});

test("mechanical target admission denies unknown, operation-partial, and lifecycle-less Case registration without writes or candidate disclosure", async (t) => {
  const scenarios = [
    { label: "unknown", registry: caseCommitRegistry({ operations: ["case.unknown"] }), code: "owner_adapter_unavailable" },
    { label: "partial", registry: caseCommitRegistry({ operations: ["case.test"] }), code: "owner_adapter_unavailable" },
    { label: "lifecycle-less", registry: caseCommitRegistry({ lifecycles: [] }), code: "owner_lifecycle_unavailable" },
  ];
  for (const [index, scenario] of scenarios.entries()) {
    await t.test(scenario.label, async (t) => {
      const fx = await fixture(t, `closed-${scenario.label}`);
      const targetId = id("case", String(110 + index)), operationId = `operation:closed-registry:${scenario.label}`;
      const envelope = mechanicalEnvelope(operationId, targetId, handle(), null);
      const before = await denialSnapshot(fx, targetId, operationId);
      const options = scenario.registry ? { admissionRegistry: scenario.registry } : undefined;
      const denied = await invokeSuccessorMechanicalOperation({ operation: "substrate.commit_revision", configuration: fx.configuration, envelope }, options);
      assert.equal(denied.failure.code, scenario.code, JSON.stringify(denied));
      assert.equal(denied.failure.class, "admission_unavailable");
      assert.deepEqual(denied.failure.evidence, {});
      for (const candidateValue of [targetId, envelope.revision.id, envelope.revision.versions[0].version_id, envelope.event.id, envelope.outbox[0].id]) {
        assert.equal(JSON.stringify(denied).includes(candidateValue), false, candidateValue);
      }
      assert.deepEqual(await denialSnapshot(fx, targetId, operationId), before);
    });
  }
});

test("Profile create/revise/activate is human-operational, exact, and stale handles disclose/write nothing", async (t) => {
  const fx = await fixture(t, "lifecycle");
  const second = { profile: id("profile", "20"), revision: id("owner-revision", "21"), version: id("version", "22") };
  const create = bindDigest({ ...baseRequest(fx, "profile.create", "operation:profile:create"), profile_id: second.profile, profile_revision_id: second.revision, version_id: second.version, expected_revision: 0, profile: profileContent(), event_id: id("event", "23") });
  const created = await invokeProfileOperation(create);
  assert.equal(created.ok, true, JSON.stringify(created));
  assert.equal(created.result.admission_evidence.purpose, "profile.manage");
  const replay = await invokeProfileOperation(create);
  assert.equal(replay.result.idempotent_replay, true);

  const revisedRevision = id("owner-revision", "31"), revisedVersion = id("version", "32");
  const revise = bindDigest({ ...baseRequest(fx, "profile.revise", "operation:profile:revise"), profile_id: second.profile, profile_revision_id: revisedRevision, version_id: revisedVersion, expected_revision: 1, profile: profileContent(second.revision), event_id: id("event", "33") });
  const revised = await invokeProfileOperation(revise);
  assert.equal(revised.ok, true, JSON.stringify(revised));
  assert.equal(revised.result.profile.revision, 2);

  const activate = bindDigest({ ...baseRequest(fx, "profile.activate", "operation:profile:activate"), target_profile_id: second.profile, target_profile_revision_id: revisedRevision, expected_selection_revision_id: ids.selectionRevision, selection_revision_id: id("owner-revision", "24"), selection_version_id: id("version", "25"), event_id: id("event", "26") });
  const activated = await invokeProfileOperation(activate);
  assert.equal(activated.ok, true, JSON.stringify(activated));
  assert.equal(activated.result.profile_selection.profile_revision_id, revisedRevision);
  assert.equal(activated.result.profile_selection.activation_fence > 1, true);
  const staleReceipt = await invokeSuccessorMechanicalOperation({ operation: "substrate.get_receipt", configuration: fx.configuration, store_id: ids.store,  admission_slot_id: ids.slot, admission: { kind: "sqlite_profile", binding: handle() }, operation_id: create.operation_id });
  assert.equal(staleReceipt.failure.code, "profile_changed");
  const currentReceipt = await invokeSuccessorMechanicalOperation({ operation: "substrate.get_receipt", configuration: fx.configuration, store_id: ids.store,  admission_slot_id: ids.slot, admission: { kind: "sqlite_profile", binding: activated.result.profile_selection }, operation_id: create.operation_id });
  assert.equal(currentReceipt.result.status, "settled");
  assert.deepEqual(currentReceipt.result.result.admission_evidence, created.result.admission_evidence);

  const hiddenTarget = id("profile", "27");
  const before = await counts(fx, hiddenTarget);
  const stale = bindDigest({ ...baseRequest(fx, "profile.create", "operation:profile:stale", handle()), profile_id: hiddenTarget, profile_revision_id: id("owner-revision", "28"), version_id: id("version", "29"), expected_revision: 0, profile: profileContent(), event_id: id("event", "30") });
  const denied = await invokeProfileOperation(stale);
  assert.equal(denied.failure.code, "profile_changed");
  assert.deepEqual(await counts(fx, hiddenTarget), before);

  const staleRead = await invokeProfileOperation({ ...baseRequest(fx, "profile.read", "read:stale", handle()), profile_id: hiddenTarget });
  assert.equal(staleRead.failure.code, "profile_changed");
});

test("concurrent selection changes leave exactly one active admission-slot binding", async (t) => {
  const fx = await fixture(t, "selection-race");
  const candidates = [
    { profile: id("profile", "80"), revision: id("owner-revision", "81"), version: id("version", "82"), event: id("event", "83") },
    { profile: id("profile", "84"), revision: id("owner-revision", "85"), version: id("version", "86"), event: id("event", "87") },
  ];
  for (const [index, candidate] of candidates.entries()) {
    const request = bindDigest({ ...baseRequest(fx, "profile.create", `operation:race:create:${index}`), profile_id: candidate.profile, profile_revision_id: candidate.revision, version_id: candidate.version, expected_revision: 0, profile: profileContent(), event_id: candidate.event });
    assert.equal((await invokeProfileOperation(request)).ok, true);
  }
  const activations = candidates.map((candidate, index) => bindDigest({ ...baseRequest(fx, "profile.activate", `operation:race:activate:${index}`), target_profile_id: candidate.profile, target_profile_revision_id: candidate.revision, expected_selection_revision_id: ids.selectionRevision, selection_revision_id: id("owner-revision", String(88 + index * 3)), selection_version_id: id("version", String(89 + index * 3)), event_id: id("event", String(90 + index * 3)) }));
  const results = await Promise.all(activations.map((request) => invokeProfileOperation(request)));
  assert.equal(results.filter((result) => result.ok).length, 1, JSON.stringify(results));
  assert.equal(["profile_changed", "profile_selection_conflict"].includes(results.find((result) => !result.ok).failure.code), true);
  const binary = await selectSqliteBinary();
  const { stdout } = await sqlite(binary, fx.store, `PRAGMA query_only=ON; SELECT count(*) count,count(DISTINCT admission_slot_id) slots FROM profile_selection_current WHERE admission_slot_id='${ids.slot}';`, { args: ["-batch", "-bail", "-json"] });
  assert.deepEqual(JSON.parse(stdout)[0], { count: 1, slots: 1 });
});

test("substrate-only Profile admission cannot access any Case read, resolver, or write path", async (t) => {
  const fx = await fixture(t, "substrate-not-case");
  const candidate = id("case", "102"), operationId = "operation:substrate-not-case:create";
  const before = await denialSnapshot(fx, candidate, operationId);
  const common = { protocol, request_version: 1, store_id: ids.store,  admission_slot_id: ids.slot, admission: { kind: "sqlite_profile", binding: handle() }, configuration: fx.configuration };
  const requests = [
    { ...common, operation: "case.read", case_id: candidate },
    { ...common, operation: "case.resolve", alias: "hidden", namespace_id: ids.namespace },
    { ...common, operation: "case.knowledge.read", resource_id: id("knowledge", "103") },
    { ...common, operation: "case.create", operation_id: operationId, expected_revision: 0, commit_basis: "must not reach Case write", provenance: {}, case: {}, placement: {} },
  ];
  for (const request of requests) {
    const denied = await invokeSuccessorCaseOperation(request);
    assert.equal(denied.failure.code, "profile_guard_denied", `${request.operation}: ${JSON.stringify(denied)}`);
    assert.equal(JSON.stringify(denied).includes(candidate), false, request.operation);
  }
  assert.deepEqual(await denialSnapshot(fx, candidate, operationId), before);
});

test("published Case operation contracts and exact request allowlists are closed", () => {
  const expected = ["case.create", "case.commit_revision", "case.tombstone.commit", "case.read", "case.resolve", "case.update", "case.tombstone", "case.move_namespace", ...["knowledge", "facet", "source", "evidence", "relationship"].flatMap((kind) => ["read", "create", "update", "tombstone"].map((action) => `case.${kind}.${action}`))];
  assert.deepEqual(CASE_OPERATION_ROWS.map((row) => row.operation), expected);
  assert.deepEqual([...CASE_OPERATION_FIELDS.keys()], expected);
  for (const row of CASE_OPERATION_ROWS) {
    const read = row.operation === "case.read" || row.operation === "case.resolve" || row.operation.endsWith(".read");
    assert.deepEqual(row, { operation: row.operation, capability_class: read ? "ordinary_cli" : "human_operational", purpose: read ? "case.read" : "case.manage", owner_kinds: ["case"], profile_fence: "profile-selection-fence@1", guard_kinds: [] });
    assert.equal(CASE_OPERATION_FIELDS.get(row.operation).has("unexpected_top_level_field"), false);
  }
});

test("an owner-policy grant cannot broaden Profile purpose or object-kind admission", async (t) => {
  const fx = await fixture(t, "no-broadening"), policy = await seedPolicy(fx);
  const candidate = { profile: id("profile", "94"), revision: id("owner-revision", "95"), version: id("version", "96") };
  const restricted = profileContent();
  restricted.object_kinds = ["profile", "profile-selection"];
  const create = bindDigest({ ...baseRequest(fx, "profile.create", "operation:no-broadening:create"), profile_id: candidate.profile, profile_revision_id: candidate.revision, version_id: candidate.version, expected_revision: 0, profile: restricted, event_id: id("event", "97") });
  assert.equal((await invokeProfileOperation(create)).ok, true);
  const activate = bindDigest({ ...baseRequest(fx, "profile.activate", "operation:no-broadening:activate"), target_profile_id: candidate.profile, target_profile_revision_id: candidate.revision, expected_selection_revision_id: ids.selectionRevision, selection_revision_id: id("owner-revision", "98"), selection_version_id: id("version", "99"), event_id: id("event", "100") });
  const activated = await invokeProfileOperation(activate);
  assert.equal(activated.ok, true);
  const target = id("case", "101"), envelope = mechanicalEnvelope("operation:no-broadening:target", target, activated.result.profile_selection, policy.guard);
  const before = await counts(fx, target);
  const denied = await invokeSuccessorMechanicalOperation({ operation: "substrate.commit_revision", configuration: fx.configuration, envelope }, { admissionRegistry: TEST_CASE_COMMIT_REGISTRY });
  assert.equal(denied.failure.code, "profile_guard_denied");
  assert.deepEqual(await counts(fx, target), before);
});

test("retiring the selected Profile without replacement makes the slot unavailable without fallback", async (t) => {
  const fx = await fixture(t, "retire");
  const retire = bindDigest({ ...baseRequest(fx, "profile.retire", "operation:profile:retire"), profile_id: ids.profile, profile_revision_id: ids.profileRevision, expected_selection_revision_id: ids.selectionRevision, selection_revision_id: id("owner-revision", "40"), selection_version_id: id("version", "41"), replacement: null, event_id: id("event", "42") });
  const retired = await invokeProfileOperation(retire);
  assert.equal(retired.ok, true, JSON.stringify(retired));
  assert.equal(retired.result.profile_selection.status, "unavailable");
  const replay = await invokeProfileOperation(retire);
  assert.equal(replay.result.idempotent_replay, true);
  const after = await invokeProfileOperation({ ...baseRequest(fx, "profile.read", "read:unavailable", handle()), profile_id: ids.profile });
  assert.equal(after.failure.code, "profile_selection_unavailable");
});

function mechanicalEnvelope(operationId, targetId, admissionHandle = handle(), ownerPolicyGuard = null) {
  const content = { schema: "test-target@1", lifecycle: "active" };
  const envelope = {
    envelope_version: 1, operation_id: operationId, store_id: ids.store,
    admission_slot_id: ids.slot, admission: { kind: "sqlite_profile", binding: admissionHandle }, owner_policy_guard: ownerPolicyGuard,
    owner: { id: targetId, kind: "case" }, expected_revision: 0,
    revision: { id: id("owner-revision", operationId.endsWith("allowed") ? "60" : "61"), number: 1, normalized: { schema: "test-target@1" }, versions: [{ family_id: targetId, version_id: id("version", operationId.endsWith("allowed") ? "62" : "63"), content, content_digest: successorDigest(content) }], selections: [{ family_id: targetId, version_id: id("version", operationId.endsWith("allowed") ? "62" : "63") }] },
    current_projection: { lifecycle: "active" }, event: { id: id("event", operationId.endsWith("allowed") ? "64" : "65"), type: "target.committed", payload: { target_id: targetId }, payload_digest: successorDigest({ target_id: targetId }) }, outbox: [{ id: id("outbox", operationId.endsWith("allowed") ? "66" : "67"), kind: "target-event", payload: { target_id: targetId }, payload_digest: successorDigest({ target_id: targetId }) }],
  };
  envelope.request_digest = canonicalSuccessorCommitDigest(ids.store, envelope);
  return envelope;
}

async function seedPolicy(fx) {
  const binary = await selectSqliteBinary(), now = new Date().toISOString();
  const policy = { owner: id("case", "50"), revision: id("owner-revision", "51"), family: id("policy", "52"), version: id("version", "53"), state: id("admission-state", "54") };
  const content = { schema: "test-policy@1", lifecycle: "active" }, digestValue = successorDigest(content);
  await sqlite(binary, fx.store, `PRAGMA foreign_keys=ON; BEGIN IMMEDIATE;
    INSERT INTO owners VALUES('${policy.owner}','case','${now}');
    INSERT INTO owner_family_bindings VALUES('${policy.family}','${policy.owner}','${now}');
    INSERT INTO owner_versions VALUES('${policy.version}','${policy.owner}','${policy.family}','${JSON.stringify(content).replaceAll("'", "''")}','${digestValue}','${now}');
    INSERT INTO owner_revisions VALUES('${policy.revision}','${policy.owner}',1,'{"owner_normalized":{},"_mechanical_current_projection":{"lifecycle":"active"}}','seed-policy','${now}');
    INSERT INTO owner_revision_selections VALUES('${policy.revision}','${policy.family}','${policy.version}');
    INSERT INTO owner_current VALUES('${policy.owner}','${policy.revision}',1,'{"lifecycle":"active"}','${now}');
    INSERT INTO owner_policy_admission_current VALUES('${policy.owner}','${policy.revision}','${policy.family}','${policy.version}','${digestValue}','${policy.state}','owner-policy-admission-state@1','["substrate.commit_revision"]','current-authorized',1,'seed-policy','${now}');
    COMMIT;`, { args: ["-batch", "-bail"] });
  return { ...policy, digest: digestValue, guard: { guard_kind: "owner-policy-fence@1", policy_owner_id: policy.owner, expected_policy_owner_revision_id: policy.revision, policy_family_id: policy.family, expected_policy_version_id: policy.version, expected_policy_content_digest: digestValue, admission_state_version_id: policy.state, expected_revocation_fence: 1, required_disposition: "current-authorized", purpose: "substrate.commit_revision" } };
}

test("target commit orders Profile then owner policy, records exact evidence, and revoked/stale attempts write nothing", async (t) => {
  const fx = await fixture(t, "guards"), policy = await seedPolicy(fx);
  const allowedTarget = id("case", "55"), allowedEnvelope = mechanicalEnvelope("operation:guard:allowed", allowedTarget, handle(), policy.guard);
  const allowed = await invokeSuccessorMechanicalOperation({ operation: "substrate.commit_revision", configuration: fx.configuration, envelope: allowedEnvelope }, { admissionRegistry: TEST_CASE_COMMIT_REGISTRY });
  assert.equal(allowed.ok, true, JSON.stringify(allowed));
  assert.equal(allowed.result.admission_evidence.owner_policy.revocation_fence, 1);
  assert.equal(allowed.result.admission_evidence.purpose, "substrate.commit_revision");

  const binary = await selectSqliteBinary();
  await sqlite(binary, fx.store, `UPDATE owner_policy_admission_current SET disposition='revoked',revocation_fence=2 WHERE policy_owner_id='${policy.owner}';`, { args: ["-batch", "-bail"] });
  const exactReplay = await invokeSuccessorMechanicalOperation({ operation: "substrate.commit_revision", configuration: fx.configuration, envelope: allowedEnvelope }, { admissionRegistry: TEST_CASE_COMMIT_REGISTRY });
  assert.equal(exactReplay.result.idempotent_replay, true);
  assert.deepEqual(exactReplay.result.admission_evidence, allowed.result.admission_evidence);

  const revokedTarget = id("case", "56"), revokedEnvelope = mechanicalEnvelope("operation:guard:revoked", revokedTarget, handle(), policy.guard);
  const beforeRevoked = await counts(fx, revokedTarget);
  const revoked = await invokeSuccessorMechanicalOperation({ operation: "substrate.commit_revision", configuration: fx.configuration, envelope: revokedEnvelope }, { admissionRegistry: TEST_CASE_COMMIT_REGISTRY });
  assert.equal(revoked.failure.code, "authorization_changed");
  assert.deepEqual(await counts(fx, revokedTarget), beforeRevoked);

  const second = { profile: id("profile", "70"), revision: id("owner-revision", "71"), version: id("version", "72") };
  const create = bindDigest({ ...baseRequest(fx, "profile.create", "operation:guard:new-profile"), profile_id: second.profile, profile_revision_id: second.revision, version_id: second.version, expected_revision: 0, profile: profileContent(), event_id: id("event", "73") });
  assert.equal((await invokeProfileOperation(create)).ok, true);
  const activate = bindDigest({ ...baseRequest(fx, "profile.activate", "operation:guard:activate"), target_profile_id: second.profile, target_profile_revision_id: second.revision, expected_selection_revision_id: ids.selectionRevision, selection_revision_id: id("owner-revision", "74"), selection_version_id: id("version", "75"), event_id: id("event", "76") });
  assert.equal((await invokeProfileOperation(activate)).ok, true);
  const staleTarget = id("case", "57"), staleEnvelope = mechanicalEnvelope("operation:guard:stale", staleTarget, handle(), null);
  const beforeStale = await counts(fx, staleTarget);
  const stale = await invokeSuccessorMechanicalOperation({ operation: "substrate.commit_revision", configuration: fx.configuration, envelope: staleEnvelope }, { admissionRegistry: TEST_CASE_COMMIT_REGISTRY });
  assert.equal(stale.failure.code, "profile_changed");
  assert.deepEqual(await counts(fx, staleTarget), beforeStale);
});
