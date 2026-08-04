import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rename, rm, stat, symlink, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createBootstrapAuthorizationDocument,
  inspectSuccessorStore,
} from "../variants/sqlite/lib/substrate/bootstrap.mjs";
import { describeTarget } from "../variants/sqlite/lib/cli/index.mjs";
import {
  canonicalSuccessorCommitDigest,
  invokeSuccessorMechanicalOperation,
  successorDigest,
} from "../variants/sqlite/lib/substrate/mechanical-successor.mjs";
import { canonicalContextRequestDigest } from "../variants/sqlite/lib/context/index.mjs";
import {
  SUBSTRATE_ADMISSION_ROWS, createAdmissionRegistry,
} from "../variants/sqlite/lib/resource/admission-guards.mjs";
import { cleanupSandbox, generateAndValidateSandbox, selectCompatibleSqliteBinary } from "./sandbox-harness.mjs";

const packageRoot = path.resolve(new URL("..", import.meta.url).pathname);
const entrypoint = path.join(packageRoot, "variants/sqlite/bin/casebook-persistence.mjs");
const protocol = { id: "casebook-persistence-json", version: 2 };
const TEST_CASE_COMMIT_REGISTRY = createAdmissionRegistry({
  operations: SUBSTRATE_ADMISSION_ROWS,
  adapters: [{
    owner_kind: "case", adapter_version: 1, schemas: ["test-opaque-case@1"], operations: ["substrate.commit_revision"],
    complete_owner: true, resource_deltas: true, events: true, results: true, projections: true, supported_guards: ["owner-policy-fence@1"],
  }],
  lifecycles: [{
    owner_kind: "case", descriptor_version: 1, descriptor_kind: "selected-version-lifecycle@1",
    current_states: ["active"], mutation_states: ["active", "retired"],
  }],
});
const ids = {
  store: "store:10000000-0000-4000-8000-000000000001",
  workspace: "workspace:10000000-0000-4000-8000-000000000002",
  namespace: "namespace:personal",
  namespaceRevision: "owner-revision:10000000-0000-4000-8000-000000000004",
  namespaceVersion: "version:10000000-0000-4000-8000-000000000005",
  profile: "profile:10000000-0000-4000-8000-000000000006",
  profileRevision: "owner-revision:10000000-0000-4000-8000-000000000007",
  profileVersion: "version:10000000-0000-4000-8000-000000000008",
  selection: "profile-selection:10000000-0000-4000-8000-000000000009",
  selectionRevision: "owner-revision:10000000-0000-4000-8000-00000000000a",
  selectionVersion: "version:10000000-0000-4000-8000-00000000000b",
  initEvent: "event:10000000-0000-4000-8000-00000000000c",
};

function startInvoke(cwd, request, env = {}, executable = entrypoint) {
  let resolveResult;
  const result = new Promise((resolve) => { resolveResult = resolve; });
  const child = execFile(process.execPath, [executable], {
    cwd,
    env: { HOME: cwd, PATH: process.env.PATH ?? "", ...env },
    encoding: "utf8",
    timeout: 30_000,
  }, (error, stdout, stderr) => resolveResult({ code: error?.code ?? 0, json: JSON.parse(stdout), stderr }));
  child.stdin.end(`${JSON.stringify(request)}\n`);
  return { child, result };
}
function invoke(cwd, request, env = {}, executable = entrypoint) { return startInvoke(cwd, request, env, executable).result; }
async function waitForFile(file, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (!await stat(file).then(() => true).catch(() => false)) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${file}`);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function record(ownerId, revisionId, versionId, content) {
  return { owner_id: ownerId, revision_id: revisionId, version_id: versionId, content, content_digest: successorDigest(content) };
}

async function fixture(t, label = "fresh", executable = entrypoint) {
  const root = await mkdtemp(path.join(os.tmpdir(), `casebook-successor-${label}-`));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = path.join(root, "authority.sqlite3");
  const grant = path.join(root, "bootstrap.grant.json");
  const request = {
    protocol,
    operation: "initialize_store",
    request_version: 1,
    operation_id: `operation:successor:${label}:initialize`,
    store_id: ids.store,

    authority_claim: {
      human_authorized: true,
      local_uid: process.getuid(),
      human_identity: "test-operator",
      provenance: `disposable:${label}`,
    },
    initial: {
      root_namespace: record("namespace:root", ids.namespaceRevision, ids.namespaceVersion, {
        schema: "namespace-bootstrap@1", display_name: "Root", parent_id: null, lifecycle: "active",
      }),
      private_profile: record(ids.profile, ids.profileRevision, ids.profileVersion, {
        schema: "admission-disclosure-profile@1", audience_ceiling: "private", lifecycle: "active", predecessor_revision_id: null,
        object_kinds: ["profile", "profile-selection", "case", "frame", "namespace", "chat", "project-default"],
        purposes: ["profile.manage", "profile.read", "context.manage", "context.read", "case.manage", "case.read", "frame.manage", "frame.read", "substrate.read", "substrate.commit_revision", "receipt.read", "integrity.observe", "projection.rebuild"],
        bounds: { max_results: 100, max_traversal_depth: 8, max_export_bytes: 1048576 },
        projection: { locator: "redacted", export: "deny" },
        disclosure: { receipts: true, events: true, checkpoints: true },
      }),
      profile_selection: record(ids.selection, ids.selectionRevision, ids.selectionVersion, {
        schema: "profile-selection@1", admission_slot_id: "admission-slot:10000000-0000-4000-8000-00000000000d",
        selected_profile_id: ids.profile, selected_profile_revision_id: ids.profileRevision, lifecycle: "active", activation_fence: 1,
      }),
      project_default: null,
      initialization_event_id: ids.initEvent,
    },
    configuration: {
      source: { kind: "synthetic-test", locator: `successor:${label}` },
      authority_mode: "sqlite",
      sqlite: { database_url: store },
    },
  };
  const authorization = await createBootstrapAuthorizationDocument(request, { grant_path: grant });
  request.request_digest = authorization.request_digest;
  request.bootstrap_authorization = { path: grant, sha256: authorization.sha256 };
  await writeFile(grant, `${JSON.stringify(authorization.document)}\n`, { mode: 0o600 });
  return { root, store, grant, request, authorization };
}

async function createPersonalNamespace(value, admission, operationId) {
  const request = {
    protocol,
    operation: "namespace.create",
    request_version: 1,
    operation_id: operationId,
    store_id: ids.store,
    admission_slot_id: "admission-slot:10000000-0000-4000-8000-00000000000d",
    admission,
    configuration: value.request.configuration,
    namespace_id: ids.namespace,
    namespace_revision_id: "owner-revision:30000000-0000-4000-8000-000000000010",
    version_id: "version:30000000-0000-4000-8000-000000000011",
    event_id: "event:30000000-0000-4000-8000-000000000012",
    expected_revision: 0,
    parent_namespace_id: "namespace:root",
    display_name: "Personal",
    aliases: [],
  };
  request.request_digest = canonicalContextRequestDigest(ids.store, request);
  const result = await invoke(value.root, request);
  assert.equal(result.code, 0, `${result.stderr}\n${JSON.stringify(result.json)}`);
}

test("exceptional bootstrap consumes one closed grant and publishes only a complete successor store", async (t) => {
  const value = await fixture(t);
  const result = await invoke(value.root, value.request);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.json.result.status, "settled");
  assert.equal(result.json.result.initialization.store_id, ids.store);
  assert.equal(result.json.result.initialization.profile.id, ids.profile);
  assert.equal(result.json.result.initialization.root_namespace.id, "namespace:root");
  assert.equal(await stat(value.store).then((entry) => entry.mode & 0o777), 0o600);
  await assert.rejects(stat(value.grant), { code: "ENOENT" });

  const binary = await selectCompatibleSqliteBinary();
  const inspected = await inspectSuccessorStore(binary, value.store);
  assert.equal(inspected.status, "available", JSON.stringify(inspected));
  assert.equal(inspected.metadata.schema_id, "sqlite_casebook");
  assert.equal(inspected.metadata.schema_version, 2);
  assert.equal(inspected.bootstrap.initial_owner_count, 3);

  const replay = await invoke(value.root, value.request);
  assert.equal(replay.code, 0, replay.stderr);
  assert.equal(replay.json.result.idempotent_replay, true);
  assert.equal(replay.json.result.receipt.request_digest, value.request.request_digest);
});

test("exact target.describe admits one validated Profile target without publishing a store locator", async (t) => {
  const value = await fixture(t, "target-describe");
  value.request.configuration.source = { kind: "workspace-root", locator: value.root };
  const authorization = await createBootstrapAuthorizationDocument(value.request, { grant_path: value.grant });
  value.request.request_digest = authorization.request_digest;
  value.request.bootstrap_authorization = { path: value.grant, sha256: authorization.sha256 };
  await writeFile(value.grant, `${JSON.stringify(authorization.document)}\n`, { mode: 0o600 });
  const initialized = await invoke(value.root, value.request);
  assert.equal(initialized.code, 0, initialized.stderr);
  const response = await describeTarget({ protocol, operation: "target.describe", request_version: 1, configuration: value.request.configuration });
  assert.equal(response.ok, true, JSON.stringify(response));
  assert.deepEqual(Object.keys(response.result).sort(), ["activation_fence", "admission_slot_id", "observed_operation_fence", "package", "profile_id", "profile_revision_id", "profile_selection_id", "profile_selection_revision_id", "root_namespace_id", "schema", "sqlite_schema", "store_id"]);
  assert.equal("store" in response.result, false);
  assert.equal(response.result.store_id, ids.store);
  assert.equal("workspace_id" in response.result, false);
  const unrelated = await describeTarget({ protocol, operation: "target.describe", request_version: 1, configuration: { ...value.request.configuration, source: { kind: "workspace-root", locator: `${value.root}-unrelated` } } });
  assert.equal(unrelated.ok, true, JSON.stringify(unrelated));
  assert.equal(unrelated.result.store_id, response.result.store_id);
  assert.equal("workspace_id" in unrelated.result, false);
});

test("bootstrap rejects changed replay, destination preexistence, and owner/mode/digest mismatch before store work", async (t) => {
  const mismatch = await fixture(t, "mismatch");
  await chmod(mismatch.grant, 0o644);
  const wrongMode = await invoke(mismatch.root, mismatch.request);
  assert.equal(wrongMode.json.failure.code, "bootstrap_grant_mode_invalid");
  await assert.rejects(stat(mismatch.store), { code: "ENOENT" });
  await chmod(mismatch.grant, 0o600);
  mismatch.request.bootstrap_authorization.sha256 = "0".repeat(64);
  const wrongDigest = await invoke(mismatch.root, mismatch.request);
  assert.equal(wrongDigest.json.failure.code, "bootstrap_grant_digest_mismatch");
  await assert.rejects(stat(mismatch.store), { code: "ENOENT" });

  const owner = await fixture(t, "owner");
  owner.request.authority_claim.local_uid += 1;
  const wrongOwner = await invoke(owner.root, owner.request);
  assert.equal(wrongOwner.json.failure.code, "bootstrap_local_uid_mismatch");
  await assert.rejects(stat(owner.store), { code: "ENOENT" });

  const existing = await fixture(t, "existing");
  await writeFile(existing.store, "occupied", { mode: 0o600 });
  const occupied = await invoke(existing.root, existing.request);
  assert.equal(occupied.json.failure.code, "bootstrap_destination_exists");
  assert.equal(await readFile(existing.store, "utf8"), "occupied");

  const replay = await fixture(t, "changed-replay");
  assert.equal((await invoke(replay.root, replay.request)).code, 0);
  const changed = structuredClone(replay.request);
  changed.initial.private_profile.content.bounds.max_results = 99;
  changed.initial.private_profile.content_digest = successorDigest(changed.initial.private_profile.content);
  const rejected = await invoke(replay.root, changed);
  assert.equal(rejected.json.failure.code, "bootstrap_request_digest_mismatch");
});

test("consumed grant resumes before publication and published uncertainty recovers without reinitialization", async (t) => {
  for (const fault of ["before_grant_consumption", "after_grant_consumption", "before_reservation_publication", "before_publication", "after_publication"]) {
    const value = await fixture(t, fault);
    const interrupted = await invoke(value.root, value.request, { CASEBOOK_BOOTSTRAP_TEST_MODE: "1", CASEBOOK_BOOTSTRAP_TEST_FAULT: fault });
    assert.equal(interrupted.code, 2);
    if (fault !== "after_publication") await assert.rejects(stat(value.store), { code: "ENOENT" });
    else assert.equal((await stat(value.store)).isFile(), true);
    const recovered = await invoke(value.root, value.request);
    assert.equal(recovered.code, 0, `${fault}: ${recovered.stderr}`);
    assert.equal(recovered.json.result.initialization.store_id, ids.store);
    const secondOperation = structuredClone(value.request);
    secondOperation.operation_id = `${value.request.operation_id}:different`;
    const refused = await invoke(value.root, secondOperation);
    assert.equal(refused.json.failure.code, "bootstrap_request_digest_mismatch");
  }
});

test("two same-request processes deterministically race at grant consumption and publication", async (t) => {
  for (const stage of ["before_grant_consumption", "before_publication"]) {
    const value = await fixture(t, `two-process-${stage}`);
    const coordination = await mkdtemp(path.join(os.tmpdir(), `casebook-successor-${stage}-coord-`));
    t.after(() => rm(coordination, { recursive: true, force: true }));
    const release = path.join(coordination, "release");
    const firstReady = path.join(coordination, "first.ready");
    const secondReady = path.join(coordination, "second.ready");
    const first = startInvoke(value.root, value.request, {
      CASEBOOK_BOOTSTRAP_TEST_MODE: "1",
      CASEBOOK_BOOTSTRAP_TEST_PAUSE_STAGE: stage,
      CASEBOOK_BOOTSTRAP_TEST_READY_PATH: firstReady,
      CASEBOOK_BOOTSTRAP_TEST_RELEASE_PATH: release,
    });
    await waitForFile(firstReady);
    const second = startInvoke(value.root, value.request, {
      CASEBOOK_BOOTSTRAP_TEST_MODE: "1",
      CASEBOOK_BOOTSTRAP_TEST_PAUSE_STAGE: stage,
      CASEBOOK_BOOTSTRAP_TEST_READY_PATH: secondReady,
      CASEBOOK_BOOTSTRAP_TEST_RELEASE_PATH: release,
    });
    await waitForFile(secondReady);
    await writeFile(release, "release\n", { mode: 0o600 });
    const results = await Promise.all([first.result, second.result]);
    assert.equal(results.some((result) => result.code === 0), true, `${stage}: ${JSON.stringify(results)}`);
    for (const result of results.filter((item) => item.code !== 0)) assert.equal(result.json.failure.code, "bootstrap_duplicate_grant", JSON.stringify(result));
    const replay = await invoke(value.root, value.request);
    assert.equal(replay.code, 0, `${stage}: ${replay.stderr}`);
    assert.equal(replay.json.result.idempotent_replay, true);
    const binary = await selectCompatibleSqliteBinary();
    const inspected = await inspectSuccessorStore(binary, value.store);
    assert.equal(inspected.status, "available", `${stage}: ${JSON.stringify(inspected)}`);
    assert.equal(inspected.bootstrap.initial_owner_count, 3);
  }
});

test("same-request reservation publication is never observable with partial bytes", async (t) => {
  const value = await fixture(t, "reservation-publication");
  const coordination = await mkdtemp(path.join(os.tmpdir(), "casebook-successor-reservation-coord-"));
  t.after(() => rm(coordination, { recursive: true, force: true }));
  const ready = path.join(coordination, "first.ready");
  const release = path.join(coordination, "release");
  const first = startInvoke(value.root, value.request, {
    CASEBOOK_BOOTSTRAP_TEST_MODE: "1",
    CASEBOOK_BOOTSTRAP_TEST_PAUSE_STAGE: "before_reservation_publication",
    CASEBOOK_BOOTSTRAP_TEST_READY_PATH: ready,
    CASEBOOK_BOOTSTRAP_TEST_RELEASE_PATH: release,
  });
  await waitForFile(ready);

  const winner = await invoke(value.root, value.request);
  assert.equal(winner.code, 0, JSON.stringify(winner));
  assert.equal(winner.json.result.idempotent_replay, false);

  await writeFile(release, "release\n", { mode: 0o600 });
  const replay = await first.result;
  assert.equal(replay.code, 0, JSON.stringify(replay));
  assert.equal(replay.json.result.idempotent_replay, true);
  assert.equal(replay.json.result.receipt.request_digest, value.request.request_digest);

  const binary = await selectCompatibleSqliteBinary();
  const inspected = await inspectSuccessorStore(binary, value.store);
  assert.equal(inspected.status, "available", JSON.stringify(inspected));
  assert.equal(inspected.bootstrap.initial_owner_count, 3);
});

test("parent drift at each pre-effect stage refuses the replacement path", async (t) => {
  for (const stage of ["before_grant_consumption", "before_publication"]) {
    const value = await fixture(t, `drift-${stage}`);
    const coordination = await mkdtemp(path.join(os.tmpdir(), `casebook-successor-${stage}-drift-coord-`));
    t.after(() => rm(coordination, { recursive: true, force: true }));
    const ready = path.join(coordination, "ready");
    const release = path.join(coordination, "release");
    const child = startInvoke(value.root, value.request, {
      CASEBOOK_BOOTSTRAP_TEST_MODE: "1",
      CASEBOOK_BOOTSTRAP_TEST_PAUSE_STAGE: stage,
      CASEBOOK_BOOTSTRAP_TEST_READY_PATH: ready,
      CASEBOOK_BOOTSTRAP_TEST_RELEASE_PATH: release,
    });
    await waitForFile(ready);
    const moved = `${value.root}-moved`;
    await rename(value.root, moved);
    await mkdir(value.root, { mode: 0o700 });
    t.after(() => rm(moved, { recursive: true, force: true }));
    await writeFile(release, "release\n", { mode: 0o600 });
    const result = await child.result;
    assert.equal(result.code, 2, `${stage}: ${JSON.stringify(result)}`);
    assert.equal(result.json.failure.code, "bootstrap_parent_identity_changed");
    assert.equal(await stat(value.store).then(() => true).catch(() => false), false, `${stage}: replacement path received a store`);
  }
});

test("concurrent duplicate grants and symlink grant substitution fail closed", async (t) => {
  const value = await fixture(t, "duplicate");
  const secondGrant = path.join(value.root, "duplicate.grant.json");
  await writeFile(secondGrant, `${JSON.stringify(value.authorization.document)}\n`, { mode: 0o600 });
  const duplicate = structuredClone(value.request);
  duplicate.bootstrap_authorization.path = secondGrant;
  const results = await Promise.all([invoke(value.root, value.request), invoke(value.root, duplicate)]);
  assert.equal(results.filter((result) => result.code === 0).length, 1, JSON.stringify(results));
  assert.equal(results.find((result) => result.code !== 0).json.failure.code, "bootstrap_duplicate_grant");

  const linked = await fixture(t, "symlink-grant");
  const realGrant = `${linked.grant}.real`;
  await writeFile(realGrant, `${JSON.stringify(linked.authorization.document)}\n`, { mode: 0o600 });
  await unlink(linked.grant);
  await symlink(realGrant, linked.grant);
  const rejected = await invoke(linked.root, linked.request);
  assert.equal(rejected.code, 2);
  assert.equal(await stat(linked.store).then(() => true).catch(() => false), false);
});

test("parent identity drift and durable destination reservation prevent publication or reinitialization", async (t) => {
  const drift = await fixture(t, "parent-drift");
  const moved = `${drift.root}-moved`;
  await rename(drift.root, moved);
  await mkdir(drift.root, { mode: 0o700 });
  t.after(() => rm(moved, { recursive: true, force: true }));
  const drifted = await invoke(drift.root, drift.request);
  assert.equal(drifted.code, 2);
  assert.equal(await stat(drift.store).then(() => true).catch(() => false), false);

  const reserved = await fixture(t, "no-reinitialize");
  assert.equal((await invoke(reserved.root, reserved.request)).code, 0);
  await rm(reserved.store);
  const exactAfterRemoval = await invoke(reserved.root, reserved.request);
  assert.equal(exactAfterRemoval.json.failure.code, "bootstrap_published_destination_missing");
  const next = structuredClone(reserved.request);
  next.operation_id = "operation:successor:no-reinitialize:different";
  const nextGrant = path.join(reserved.root, "different.grant.json");
  const nextAuthorization = await createBootstrapAuthorizationDocument(next, { grant_path: nextGrant });
  next.request_digest = nextAuthorization.request_digest;
  next.bootstrap_authorization = { path: nextGrant, sha256: nextAuthorization.sha256 };
  await writeFile(nextGrant, `${JSON.stringify(nextAuthorization.document)}\n`, { mode: 0o600 });
  const refused = await invoke(reserved.root, next);
  assert.equal(refused.json.failure.code, "bootstrap_destination_reserved");
});

test("successor schema has no Candidate-1 authority, placement, cutover, or compatibility fields", async () => {
  const schema = await readFile(path.join(packageRoot, "variants/sqlite/sql/schema-successor.sql"), "utf8");
  for (const retired of ["view_policy", "namespace_grant", "home_namespace", "authority_scope_namespace_ids", "store_cutover", "schema-final"])
    assert.equal(schema.toLowerCase().includes(retired), false, retired);
  assert.match(schema, /owner_versions/);
  assert.match(schema, /owner_revision_selections/);
  assert.match(schema, /store_operation_receipts/);
  assert.match(schema, /owner_outbox/);
});

test("public manifest and connector admit Profile, Context, graph, and reconciliation lifecycles over the preserved successor substrate", async (t) => {
  const manifest = JSON.parse(await readFile(path.join(packageRoot, "manifest.json"), "utf8"));
  assert.deepEqual(manifest.schema, { id: "sqlite_casebook", version: 2, compatible_versions: [2], store_initialization: "bootstrap-authorization@1" });
  const baseOperations = ["diagnose", "initialize_store", "profile.create", "profile.revise", "profile.activate", "profile.retire", "profile.read", "profile.history", "namespace.create", "namespace.revise", "namespace.retire", "namespace.read", "namespace.list", "namespace.history", "namespace.resolve", "project_default.create", "project_default.revise", "project_default.retire", "project_default.read", "chat.establish", "chat.resume", "chat.fork", "chat.rebind", "chat.read", "chat.history", "substrate.commit_revision", "substrate.get_receipt", "substrate.read_owner_current", "substrate.read_owner_revision", "substrate.resolve_family_binding", "substrate.resolve_current_claim", "integrity.observe", "projection.rebuild", "case.create", "case.commit_revision", "case.tombstone.commit", "case.read", "case.resolve", "case.update", "case.tombstone"];
  const frameOperations = ["frame.create", "frame.commit_revision", "frame.read", "frame.profile.read", "frame.profile.update", "frame.discovery.create", "frame.discovery.read", "frame.discovery.update", "frame.discovery.settle", "frame.discovery.tombstone", "frame.discovery.reopen", "frame.disposition_boundary.read", "frame.disposition_boundary.create", "frame.disposition_boundary.update", "frame.disposition_boundary.close", "frame.case_disposition.read", "frame.case_disposition.create", "frame.case_disposition.update", "frame.case_disposition.classify", "frame.case_disposition.settle"];
  assert.deepEqual(manifest.supported_operations, [...baseOperations, ...["knowledge", "facet", "source", "evidence", "relationship"].flatMap((kind) => ["read", "create", "update", "tombstone"].map((action) => `case.${kind}.${action}`)), ...frameOperations, "query.search", "query.resolve", "query.hydrate", "graph.neighbors", "graph.traverse", "graph.path", "events.page", "query.snapshot_reconcile.begin", "query.snapshot_reconcile.page", "query.snapshot_reconcile.finish", "query.snapshot_reconcile.checkpoint"]);
  const runtime = JSON.parse(await readFile(path.join(packageRoot, "variants/sqlite/manifests/runtime.json"), "utf8"));
  assert.deepEqual(runtime.supported_operations, manifest.supported_operations);
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-successor-old-operation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const retired = await invoke(root, { protocol, operation: "cutover_store" });
  assert.equal(retired.json.failure.code, "operation_unsupported");
});

test("public connector keeps Case-local masks, tombstones, revision identities, and immutable placement round-trippable", async (t) => {
  const value = await fixture(t, "case-local-public");
  assert.equal((await invoke(value.root, value.request)).code, 0);
  const slot = "admission-slot:10000000-0000-4000-8000-00000000000d";
  const admission = { kind: "sqlite_profile", binding: { selection_id: ids.selection, selection_revision_id: ids.selectionRevision, profile_id: ids.profile, profile_revision_id: ids.profileRevision, activation_fence: 1 } };
  await createPersonalNamespace(value, admission, "operation:successor:case-local:namespace");
  const base = (operation, operation_id) => ({ protocol, operation, request_version: 1, operation_id, store_id: ids.store,  admission_slot_id: slot, admission, configuration: value.request.configuration });
  const chatId = "chat:30000000-0000-4000-8000-000000000001";
  const chat = { ...base("chat.establish", "operation:successor:case-local:chat"), chat_id: chatId, chat_revision_id: "owner-revision:30000000-0000-4000-8000-000000000002", version_id: "version:30000000-0000-4000-8000-000000000003", event_id: "event:30000000-0000-4000-8000-000000000004", expected_revision: 0, namespace_id: ids.namespace, correlation: null };
  chat.request_digest = canonicalContextRequestDigest(ids.store, chat);
  assert.equal((await invoke(value.root, chat)).code, 0);
  const caseId = "case:30000000-0000-4000-8000-000000000005";
  const caseValue = { id: caseId, home_namespace_id: ids.namespace, state: "active", title: "Public Case", summary: "initial", scope: "WI020", aliases: [], references: [], facets: [], entries: [], sources: [], relationships: [] };
  const created = await invoke(value.root, { ...base("case.create", "operation:successor:case-local:create"), expected_revision: 0, commit_basis: "public Case create", provenance: {}, case: caseValue, placement: { namespace_id: ids.namespace } });
  assert.equal(created.code, 0, `${created.stderr}\n${JSON.stringify(created.json)}`);
  assert.equal(created.json.result.placement.namespace_id, ids.namespace);
  const noOp = await invoke(value.root, { ...base("case.update", "operation:successor:case-local:no-op"), resource_id: caseId, if_match_revision_id: created.json.result.revision.id, commit_basis: "owner no-op mask", changes: { set: { summary: "initial" } }, placement: { namespace_id: ids.namespace } });
  assert.equal(noOp.code, 0, `${noOp.stderr}\n${JSON.stringify(noOp.json)}`);
  assert.equal(noOp.json.result.resource.version.summary, "initial");
  assert.equal(noOp.json.result.placement.placement_version_id, created.json.result.placement.placement_version_id);
  const updated = await invoke(value.root, { ...base("case.update", "operation:successor:case-local:update"), resource_id: caseId, if_match_revision_id: noOp.json.result.revision.id, commit_basis: "owner masked update", changes: { set: { summary: "masked" } }, placement: { namespace_id: ids.namespace } });
  assert.equal(updated.code, 0, updated.stderr);
  assert.equal(updated.json.result.resource.version.summary, "masked");
  const historicalBase = base("case.read", "operation:successor:case-local:read"); delete historicalBase.operation_id;
  const historical = await invoke(value.root, { ...historicalBase, case_id: caseId, revision_id: updated.json.result.revision.id });
  assert.equal(historical.code, 0, historical.stderr);
  assert.equal(historical.json.result.revision.id, updated.json.result.revision.id);
  assert.equal(historical.json.result.case.summary, "masked");
  assert.equal(historical.json.result.placement.placement_version_id, created.json.result.placement.placement_version_id);
  const tombstoned = await invoke(value.root, { ...base("case.tombstone", "operation:successor:case-local:tombstone"), resource_id: caseId, if_match_revision_id: updated.json.result.revision.id, commit_basis: "owner tombstone", reason: "complete", placement: { namespace_id: ids.namespace } });
  assert.equal(tombstoned.code, 0, tombstoned.stderr);
  assert.equal(tombstoned.json.result.resource.state, "tombstoned");
  const hiddenBase = base("case.read", "operation:successor:case-local:hidden"); delete hiddenBase.operation_id;
  const hidden = await invoke(value.root, { ...hiddenBase, case_id: caseId });
  assert.equal(hidden.code, 2);
  assert.equal(hidden.json.failure.code, "case.not_found_or_not_visible");
});

test("every modular Case operation rejects unsupported top-level fields before reads, receipts, disclosure, or writes in source and generated connectors", async (t) => {
  const slot = "admission-slot:10000000-0000-4000-8000-00000000000d";
  const admission = { kind: "sqlite_profile", binding: { selection_id: ids.selection, selection_revision_id: ids.selectionRevision, profile_id: ids.profile, profile_revision_id: ids.profileRevision, activation_fence: 1 } };
  const caseId = "case:40000000-0000-4000-8000-000000000001";
  const revisionId = "case-revision:40000000-0000-4000-8000-000000000002";
  const resourceIds = { knowledge: "knowledge:40000000-0000-4000-8000-000000000003", facet: "facet:40000000-0000-4000-8000-000000000004", source: "source:40000000-0000-4000-8000-000000000005", evidence: "evidence:40000000-0000-4000-8000-000000000006", relationship: "relationship:40000000-0000-4000-8000-000000000007" };
  const sandboxRoot = await mkdtemp(path.join(os.tmpdir(), "casebook-successor-modular-fields-"));
  t.after(() => cleanupSandbox(sandboxRoot));
  const sandbox = await generateAndValidateSandbox({ sandboxRoot });
  const targets = [{ label: "source", executable: entrypoint }, ...sandbox.results.map((generated) => ({ label: generated.target, executable: path.join(generated.package_root, "variants/sqlite/bin/casebook-persistence.mjs") }))];

  for (const target of targets) await t.test(target.label, async (t) => {
    const value = await fixture(t, `modular-fields-${target.label}`, target.executable);
    const initialized = await invoke(value.root, value.request, {}, target.executable);
    assert.equal(initialized.code, 0, initialized.stderr);
    const common = { protocol, request_version: 1, store_id: ids.store,  admission_slot_id: slot, admission, configuration: value.request.configuration };
    const mutation = (operation, resource_id) => ({ ...common, operation, operation_id: `operation:successor:modular-fields:${target.label}:${operation}`, resource_id, if_match_revision_id: revisionId, commit_basis: "reject unsupported field" });
    const cases = [
      { operation: "case.update", request: { ...mutation("case.update", caseId), changes: { set: { summary: "never read" } } }, identities: [caseId, revisionId] },
      { operation: "case.tombstone", request: { ...mutation("case.tombstone", caseId), reason: "never read" }, identities: [caseId, revisionId] },
      ...["knowledge", "facet", "source", "evidence", "relationship"].flatMap((kind) => {
        const resource_id = resourceIds[kind];
        return [
          { operation: `case.${kind}.read`, request: { ...common, operation: `case.${kind}.read`, resource_id, owner_revision_id: revisionId }, identities: [resource_id, revisionId] },
          { operation: `case.${kind}.create`, request: { ...mutation(`case.${kind}.create`, resource_id), case_id: caseId, [kind]: {}, ...(kind === "evidence" ? { source_id: resourceIds.source } : {}) }, identities: [caseId, resource_id, revisionId] },
          { operation: `case.${kind}.update`, request: { ...mutation(`case.${kind}.update`, resource_id), changes: { set: {} } }, identities: [resource_id, revisionId] },
          { operation: `case.${kind}.tombstone`, request: { ...mutation(`case.${kind}.tombstone`, resource_id), reason: "never read" }, identities: [resource_id, revisionId] },
        ];
      }),
    ];
    assert.equal(cases.length, 22);
    const before = await readFile(value.store);
    for (const entry of cases) {
      const rejected = await invoke(value.root, { ...entry.request, unsupported_top_level_field: "must fail before any resource access" }, {}, target.executable);
      assert.equal(rejected.code, 2, `${entry.operation}: ${rejected.stderr}`);
      assert.equal(rejected.json.failure.code, "case.invalid_representation", `${entry.operation}: ${JSON.stringify(rejected.json)}`);
      assert.deepEqual(rejected.json.failure.evidence, { violations: [{ path: "request", rule: "field_unsupported" }] }, entry.operation);
      assert.equal(Object.hasOwn(rejected.json, "result"), false, entry.operation);
      for (const identity of entry.identities) assert.equal(JSON.stringify(rejected.json).includes(identity), false, `${entry.operation}: ${identity}`);
      assert.deepEqual(await readFile(value.store), before, `${entry.operation}: rejected request changed the store`);
    }
  });
});

test("every Frame operation rejects unsupported top-level fields before reads, receipts, disclosure, or writes in source and generated connectors", async (t) => {
  const slot = "admission-slot:10000000-0000-4000-8000-00000000000d";
  const admission = { kind: "sqlite_profile", binding: { selection_id: ids.selection, selection_revision_id: ids.selectionRevision, profile_id: ids.profile, profile_revision_id: ids.profileRevision, activation_fence: 1 } };
  const frameId = "frame:40000000-0000-4000-8000-000000000101", revisionId = "frame-revision:40000000-0000-4000-8000-000000000102", discoveryId = "discovery:40000000-0000-4000-8000-000000000103", boundaryId = "disposition-boundary:40000000-0000-4000-8000-000000000104", dispositionId = "case-disposition:40000000-0000-4000-8000-000000000105";
  const sandboxRoot = await mkdtemp(path.join(os.tmpdir(), "casebook-successor-frame-fields-")); t.after(() => cleanupSandbox(sandboxRoot));
  const sandbox = await generateAndValidateSandbox({ sandboxRoot });
  const targets = [{ label: "source", executable: entrypoint }, ...sandbox.results.map((generated) => ({ label: generated.target, executable: path.join(generated.package_root, "variants/sqlite/bin/casebook-persistence.mjs") }))];
  for (const target of targets) await t.test(target.label, async (t) => {
    const value = await fixture(t, `frame-fields-${target.label}`, target.executable); assert.equal((await invoke(value.root, value.request, {}, target.executable)).code, 0);
    const common = { protocol, request_version: 1, store_id: ids.store,  admission_slot_id: slot, admission, configuration: value.request.configuration };
    const mutation = (operation, resource_id) => ({ ...common, operation, operation_id: `operation:successor:frame-fields:${target.label}:${operation}`, resource_id, if_match_revision_id: revisionId, commit_basis: "reject unsupported field" });
    const requests = [
      { operation: "frame.create", request: { ...common, operation: "frame.create", operation_id: "operation:frame-fields:create", expected_revision: 0, commit_basis: "reject", frame: {}, placement: { namespace_id: ids.namespace } }, identities: [frameId] },
      { operation: "frame.commit_revision", request: { ...common, operation: "frame.commit_revision", operation_id: "operation:frame-fields:commit", expected_revision: 1, commit_basis: "reject", frame_id: frameId, frame: {}, placement: { namespace_id: ids.namespace } }, identities: [frameId] },
      { operation: "frame.read", request: { ...common, operation: "frame.read", frame_id: frameId }, identities: [frameId] },
      { operation: "frame.profile.read", request: { ...common, operation: "frame.profile.read", resource_id: frameId, owner_revision_id: revisionId }, identities: [frameId, revisionId] },
      { operation: "frame.profile.update", request: { ...mutation("frame.profile.update", frameId), changes: { set: {} } }, identities: [frameId, revisionId] },
      ...["create", "update", "settle", "tombstone", "reopen"].map((action) => ({ operation: `frame.discovery.${action}`, request: { ...mutation(`frame.discovery.${action}`, discoveryId), ...(action === "create" ? { frame_id: frameId, discovery: {} } : action === "update" ? { changes: { set: {} } } : action === "settle" ? { resolution: "never" } : action === "reopen" ? { reopening_basis: "never", category: "frontier" } : {}) }, identities: [frameId, discoveryId, revisionId] })),
      { operation: "frame.discovery.read", request: { ...common, operation: "frame.discovery.read", resource_id: discoveryId, owner_revision_id: revisionId }, identities: [discoveryId, revisionId] },
      ...["create", "update", "close"].map((action) => ({ operation: `frame.disposition_boundary.${action}`, request: { ...mutation(`frame.disposition_boundary.${action}`, boundaryId), ...(action === "create" ? { frame_id: frameId, disposition_boundary: {}, case_dispositions: [] } : action === "update" ? { changes: { set: {} } } : {}) }, identities: [frameId, boundaryId, revisionId] })),
      { operation: "frame.disposition_boundary.read", request: { ...common, operation: "frame.disposition_boundary.read", resource_id: boundaryId, owner_revision_id: revisionId }, identities: [boundaryId, revisionId] },
      ...["create", "update", "classify", "settle"].map((action) => ({ operation: `frame.case_disposition.${action}`, request: { ...mutation(`frame.case_disposition.${action}`, dispositionId), ...(action === "create" ? { frame_id: frameId, case_disposition: {} } : action === "update" ? { changes: { set: {} } } : action === "classify" ? { disposition: "no_case", no_case_reason: "never" } : {}) }, identities: [frameId, dispositionId, revisionId] })),
      { operation: "frame.case_disposition.read", request: { ...common, operation: "frame.case_disposition.read", resource_id: dispositionId, owner_revision_id: revisionId }, identities: [dispositionId, revisionId] },
    ];
    assert.equal(requests.length, 20);
    const before = await readFile(value.store);
    for (const entry of requests) {
      const rejected = await invoke(value.root, { ...entry.request, unsupported_top_level_field: "must fail before access" }, {}, target.executable);
      assert.equal(rejected.code, 2, `${entry.operation}: ${rejected.stderr}`); assert.equal(rejected.json.failure.code, "frame.invalid_representation", `${entry.operation}: ${JSON.stringify(rejected.json)}`);
      assert.deepEqual(rejected.json.failure.evidence, { violations: [{ path: "request", rule: "field_unsupported" }] }, entry.operation); assert.equal(Object.hasOwn(rejected.json, "result"), false, entry.operation);
      for (const identity of entry.identities) assert.equal(JSON.stringify(rejected.json).includes(identity), false, `${entry.operation}: ${identity}`);
      assert.deepEqual(await readFile(value.store), before, `${entry.operation}: rejected request changed the store`);
    }
  });
});

test("owner-neutral substrate atomically commits versions, selections, receipt, event and outbox with CAS/idempotency", async (t) => {
  const value = await fixture(t, "mechanical");
  assert.equal((await invoke(value.root, value.request)).code, 0);
  const owner = { id: "case:20000000-0000-4000-8000-000000000001", kind: "case" };
  const content = { arbitrary_owner_payload: true, policy_callback: false };
  const envelope = {
    envelope_version: 1,
    operation_id: "operation:successor:mechanical:commit",
    store_id: ids.store,

    admission_slot_id: "admission-slot:10000000-0000-4000-8000-00000000000d",
    admission: { kind: "sqlite_profile", binding: {
      selection_id: ids.selection, selection_revision_id: ids.selectionRevision,
      profile_id: ids.profile, profile_revision_id: ids.profileRevision, activation_fence: 1,
    } },
    owner_policy_guard: null,
    owner,
    expected_revision: 0,
    revision: {
      id: "owner-revision:20000000-0000-4000-8000-000000000002",
      number: 1,
      normalized: { representation: "opaque-owner@1" },
      versions: [{ family_id: owner.id, version_id: "version:20000000-0000-4000-8000-000000000003", content, content_digest: successorDigest(content) }],
      selections: [{ family_id: owner.id, version_id: "version:20000000-0000-4000-8000-000000000003" }],
    },
    current_projection: { lifecycle: "active" },
    event: { id: "event:20000000-0000-4000-8000-000000000004", type: "owner.revised", payload: { changed: true }, payload_digest: successorDigest({ changed: true }) },
    outbox: [{ id: "outbox:20000000-0000-4000-8000-000000000005", kind: "owner-event", payload: { event: "queued" }, payload_digest: successorDigest({ event: "queued" }) }],
  };
  envelope.request_digest = canonicalSuccessorCommitDigest(ids.store, envelope);
  const configuration = value.request.configuration;
  const admissionContext = {  admission_slot_id: "admission-slot:10000000-0000-4000-8000-00000000000d", admission: envelope.admission };
  const committed = await invokeSuccessorMechanicalOperation({ operation: "substrate.commit_revision", configuration, envelope }, { admissionRegistry: TEST_CASE_COMMIT_REGISTRY });
  assert.equal(committed.ok, true, JSON.stringify(committed));
  assert.equal(committed.result.receipt.committed_revision, 1);
  const replay = await invokeSuccessorMechanicalOperation({ operation: "substrate.commit_revision", configuration, envelope }, { admissionRegistry: TEST_CASE_COMMIT_REGISTRY });
  assert.equal(replay.result.idempotent_replay, true);

  const conflictEnvelope = structuredClone(envelope);
  conflictEnvelope.operation_id = "operation:successor:mechanical:conflict";
  conflictEnvelope.revision.id = "owner-revision:20000000-0000-4000-8000-000000000006";
  conflictEnvelope.event.id = "event:20000000-0000-4000-8000-000000000007";
  conflictEnvelope.outbox = [];
  conflictEnvelope.request_digest = canonicalSuccessorCommitDigest(ids.store, conflictEnvelope);
  const conflict = await invokeSuccessorMechanicalOperation({ operation: "substrate.commit_revision", configuration, envelope: conflictEnvelope }, { admissionRegistry: TEST_CASE_COMMIT_REGISTRY });
  assert.equal(conflict.failure.code, "revision_conflict");
  const recovered = await invokeSuccessorMechanicalOperation({ operation: "substrate.get_receipt", configuration, store_id: ids.store, operation_id: conflictEnvelope.operation_id, ...admissionContext });
  assert.equal(recovered.result.status, "settled");
  assert.equal(recovered.result.receipt.outcome, "rejected");

  const unknown = structuredClone(envelope);
  unknown.operation_id = "operation:successor:mechanical:unknown";
  unknown.owner = { id: "semantic-policy:20000000-0000-4000-8000-000000000008", kind: "semantic-policy" };
  unknown.revision.id = "owner-revision:20000000-0000-4000-8000-000000000009";
  unknown.event.id = "event:20000000-0000-4000-8000-00000000000a";
  unknown.request_digest = canonicalSuccessorCommitDigest(ids.store, unknown);
  const unknownResult = await invokeSuccessorMechanicalOperation({ operation: "substrate.commit_revision", configuration, envelope: unknown });
  assert.equal(unknownResult.failure.code, "owner_kind_unknown");

  const integrity = await invokeSuccessorMechanicalOperation({ operation: "integrity.observe", configuration, store_id: ids.store, ...admissionContext });
  assert.equal(integrity.result.anomaly_class, "none");
  const rebuild = await invokeSuccessorMechanicalOperation({ operation: "projection.rebuild", configuration, store_id: ids.store, operation_id: "operation:successor:mechanical:rebuild", expected_fence: integrity.result.operation_fence, ...admissionContext });
  assert.equal(rebuild.ok, true, JSON.stringify(rebuild));
});

test("public successor connector settles complete and modular Frame resources with canonical hydration and separate receipts", async (t) => {
  const value = await fixture(t, "frame-public");
  assert.equal((await invoke(value.root, value.request)).code, 0);
  const admission = { kind: "sqlite_profile", binding: { selection_id: ids.selection, selection_revision_id: ids.selectionRevision, profile_id: ids.profile, profile_revision_id: ids.profileRevision, activation_fence: 1 } };
  await createPersonalNamespace(value, admission, "operation:successor:frame:namespace");
  const base = (operation, operation_id) => ({ protocol, operation, request_version: 1, operation_id, store_id: ids.store,  admission_slot_id: "admission-slot:10000000-0000-4000-8000-00000000000d", admission, configuration: value.request.configuration });
  const frameId = "frame:30000000-0000-4000-8000-000000000101";
  const discoveryId = "discovery:30000000-0000-4000-8000-000000000102";
  const boundaryId = "disposition-boundary:30000000-0000-4000-8000-000000000103";
  const dispositionId = "case-disposition:30000000-0000-4000-8000-000000000104";
  const frame = { id: frameId, home_namespace_id: ids.namespace, status: "active", title: "Successor Frame", outcome: "Frame local proof", discovery: [{ id: discoveryId, display_order: 0, lifecycle: "active", category: "frontier", title: "Question", body: "Private restricted evidence stays in Frame", human_authority: "required", dependencies: [] }], disposition_boundaries: [{ id: boundaryId, display_order: 0, title: "Boundary", closure: "open", disposition_ids: [dispositionId] }], case_dispositions: [{ id: dispositionId, boundary_id: boundaryId, result_summary: "Need classification", classification_state: "pending_classification", pending_reason: "Awaiting human judgment", resume_condition: "Classify" }] };
  const created = await invoke(value.root, { ...base("frame.create", "operation:successor:frame:create"), expected_revision: 0, commit_basis: "complete Frame create", provenance: { acting_role: "test" }, frame, placement: { namespace_id: ids.namespace } });
  assert.equal(created.code, 0, JSON.stringify(created.json));
  const readBase = base("frame.read", "unused"); delete readBase.operation_id;
  const current = await invoke(value.root, { ...readBase, frame_id: frameId });
  assert.equal(current.code, 0, `${current.stderr}\n${JSON.stringify(current.json)}`);
  assert.equal(current.json.result.frame.home_namespace_id, ids.namespace);
  assert.equal(current.json.result.frame.discovery[0].body, "Private restricted evidence stays in Frame");
  const noQueryAdvance = await invoke(value.root, { ...base("frame.commit_revision", "operation:successor:frame:no-r"), frame_id: frameId, expected_revision: current.json.result.revision.number, commit_basis: "retain semantics with new restricted provenance", provenance: { acting_role: "different-private-actor" }, frame: current.json.result.frame, placement: { namespace_id: ids.namespace } });
  assert.equal(noQueryAdvance.code, 0, `${noQueryAdvance.stderr}\n${JSON.stringify(noQueryAdvance.json)}`);
  assert.equal(noQueryAdvance.json.result.query_changed, false, "restricted provenance alone does not advance R");
  const profile = await invoke(value.root, { ...base("frame.profile.update", "operation:successor:frame:profile"), resource_id: frameId, if_match_revision_id: noQueryAdvance.json.result.revision.id, commit_basis: "update only profile", changes: { set: { title: "Updated Frame" } }, placement: { namespace_id: ids.namespace } });
  assert.equal(profile.code, 0, `${profile.stderr}\n${JSON.stringify(profile.json)}`);
  assert.equal(profile.json.result.query_changed, true, "queryable profile meaning advances R");
  const settled = await invoke(value.root, { ...base("frame.discovery.settle", "operation:successor:frame:settle"), resource_id: discoveryId, if_match_revision_id: profile.json.result.revision.id, commit_basis: "settle discovery", resolution: "Evidence reviewed", disposition: "settled", placement: { namespace_id: ids.namespace } });
  assert.equal(settled.code, 0, settled.stderr);
  const reopened = await invoke(value.root, { ...base("frame.discovery.reopen", "operation:successor:frame:reopen"), resource_id: discoveryId, if_match_revision_id: settled.json.result.revision.id, commit_basis: "new evidence", category: "frontier", reopening_basis: "New restricted evidence", placement: { namespace_id: ids.namespace } });
  assert.equal(reopened.code, 0, reopened.stderr);
  assert.equal(reopened.json.result.resource.lifecycle, "active");
  const classified = await invoke(value.root, { ...base("frame.case_disposition.classify", "operation:successor:frame:classify"), resource_id: dispositionId, if_match_revision_id: reopened.json.result.revision.id, commit_basis: "classify intake", disposition: "intake", rationale: "Case needed", case_id: "case:30000000-0000-4000-8000-000000000105", case_operation_id: "operation:case:separate-receipt", placement: { namespace_id: ids.namespace } });
  assert.equal(classified.code, 0, `${classified.stderr}\n${JSON.stringify(classified.json)}`);
  assert.equal(classified.json.result.receipt.operation_id, "operation:successor:frame:classify", "Frame classification settles its own Frame receipt and does not atomically mutate the referenced Case");
  const realized = await invoke(value.root, { ...base("frame.case_disposition.settle", "operation:successor:frame:realize"), resource_id: dispositionId, if_match_revision_id: classified.json.result.revision.id, commit_basis: "Case settled separately", observed_case_revision_id: "case-revision:30000000-0000-4000-8000-000000000106", placement: { namespace_id: ids.namespace } });
  assert.equal(realized.code, 0, `${realized.stderr}\n${JSON.stringify(realized.json)}`);
  const closed = await invoke(value.root, { ...base("frame.disposition_boundary.close", "operation:successor:frame:close"), resource_id: boundaryId, if_match_revision_id: realized.json.result.revision.id, commit_basis: "all dispositions settled", placement: { namespace_id: ids.namespace } });
  assert.equal(closed.code, 0, `${closed.stderr}\n${JSON.stringify(closed.json)}`);
  const historical = await invoke(value.root, { ...readBase, frame_id: frameId, revision_id: profile.json.result.revision.id });
  assert.equal(historical.code, 0, historical.stderr);
  assert.equal(historical.json.result.frame.title, "Updated Frame");
  const stale = await invoke(value.root, { ...base("frame.profile.update", "operation:successor:frame:conflict"), resource_id: frameId, if_match_revision_id: profile.json.result.revision.id, commit_basis: "stale conflict", changes: { set: { title: "stale" } }, placement: { namespace_id: ids.namespace } });
  assert.equal(stale.code, 2);
  assert.equal(stale.json.failure.code, "frame.revision_conflict");
  assert.notEqual(created.json.result.receipt.operation_id, profile.json.result.receipt.operation_id, "Frame receipts are independent from Case receipt namespace and each Frame operation");
});
