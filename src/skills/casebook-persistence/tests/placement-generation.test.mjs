import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createPlacementGenerationFoundation, createSuccessorSqlitePlacementAdapter } from "../variants/sqlite/lib/placement/index.mjs";
import { createBootstrapAuthorizationDocument, initializeSuccessorStore } from "../variants/sqlite/lib/substrate/bootstrap.mjs";
import { canonicalContextRequestDigest, invokeContextOperation } from "../variants/sqlite/lib/context/index.mjs";
import { SUBSTRATE_ADMISSION_ROWS, createAdmissionRegistry } from "../variants/sqlite/lib/resource/admission-guards.mjs";
import { selectSqliteBinary, sqlite } from "../variants/sqlite/lib/substrate/diagnostics.mjs";
import { invokeSuccessorMechanicalOperation, successorDigest } from "../variants/sqlite/lib/substrate/mechanical-successor.mjs";
import { normalizeExactLocator } from "../variants/sqlite/lib/resource/normalization.mjs";
import { organizationalSearch, resolveOrganizationalIdentity } from "../variants/sqlite/lib/query/search.mjs";
import { cleanupSandbox, generateAndValidateSandbox } from "./sandbox-harness.mjs";

async function invokeConnector(entrypoint, cwd, request) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [entrypoint], { cwd, encoding: "utf8", timeout: 20_000, maxBuffer: 2 * 1024 * 1024, env: { ...process.env } }, (error, stdout, stderr) => {
      let json = {};
      try { json = JSON.parse(stdout); } catch { /* Preserve malformed output as E2E evidence. */ }
      resolve({ exitCode: error?.code ?? 0, stderr, json });
    });
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

const id = (kind, n) => `${kind}:50000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const owner = { id: id("case", 1), kind: "case" };
const chat = id("chat", 2), nsA = id("namespace", 3), nsB = id("namespace", 4);
const chatRevision = id("owner-revision", 5), nsARevision = id("owner-revision", 6), nsBRevision = id("owner-revision", 7);

function aggregate(version = id("version", 20), query = { documents: [], edges: [] }, selections = [{ family_id: id("case", 21), version_id: version }], versions = [{ family_id: id("case", 21), version_id: version, content: { schema: "opaque@1", version }, content_digest: successorDigest({ schema: "opaque@1", version }) }]) {
  return { normalized: { schema: "opaque-owner@1" }, current_projection: { schema: "opaque-current@1" }, versions, selections, outbox: [], query: { ...query, digest: successorDigest(query) } };
}
function placement(version, namespace = null, family = id("placement-family", 30), predecessor_version_id = null, chat_revision_id = chatRevision) {
  const common = { placement_family_id: family, placement_version_id: version, origin: { source: "test" }, provenance: { evidence: "disposable" }, predecessor_version_id };
  return namespace ? { ...common, namespace_id: namespace } : { ...common, chat_id: chat, chat_revision_id };
}
function request(number, expected_revision, placementValue, aggregateValue) {
  return { operation_id: `placement:${number}`, owner, expected_revision, revision_id: id("owner-revision", 100 + number), event: id("event", number), placement: placementValue, aggregate: aggregateValue };
}
function conformer() {
  let current = { revision_number: 0, placement: null, query_digest: null, aggregate_digest: null };
  let currentChat = { chat_revision_id: chatRevision, namespace_id: nsA }, nextChatAfterRead = null;
  const artifacts = { commits: [], revisions: [], versions: [], selections: [], query: [] }, receipts = new Map();
  let fail = null;
  const adapter = {
    async readCurrent() { return structuredClone(current); },
    async readReceipt({ operation_id }) { return structuredClone(receipts.get(operation_id) ?? null); },
    async readRevision({ revision_id }) { return structuredClone(artifacts.revisions.find((value) => value.revision_id === revision_id) ?? null); },
    async readChatBinding({ chat_revision_id }) { const observed = chat_revision_id === currentChat.chat_revision_id ? { namespace_id: currentChat.namespace_id } : chat_revision_id === chatRevision ? { namespace_id: nsA } : null; if (nextChatAfterRead) { currentChat = nextChatAfterRead; nextChatAfterRead = null; } return structuredClone(observed); },
    async resolveNamespace({ namespace_id }) {
      return namespace_id === nsA || namespace_id === nsB ? { namespace_id, namespace_revision_id: namespace_id === nsA ? nsARevision : nsBRevision, lifecycle: "active" } : null;
    },
    async commit(envelope) {
      if (fail) { const error = fail; fail = null; throw error; }
      if (envelope.placement_guard.chat && (envelope.placement_guard.chat.chat_revision_id !== currentChat.chat_revision_id || envelope.placement.namespace_id !== currentChat.namespace_id)) { const error = new Error("context changed"); error.code = "context_stale"; throw error; }
      if (envelope.expected_revision !== current.revision_number) { const error = new Error("CAS"); error.code = "revision_conflict"; throw error; }
      // This conformer publishes only at one complete-envelope boundary.
      artifacts.commits.push(structuredClone(envelope)); artifacts.versions.push(...structuredClone(envelope.aggregate.versions)); artifacts.selections.push(...structuredClone(envelope.aggregate.selections)); artifacts.query.push(structuredClone(envelope.aggregate.query));
      const revision = { revision_id: envelope.revision_id, placement: envelope.placement, placement_selection: envelope.placement_selection };
      artifacts.revisions.push(revision);
      current = { revision_number: current.revision_number + 1, placement: envelope.placement, query_digest: envelope.aggregate.query.digest, aggregate_digest: envelope.aggregate_digest, revision_id: envelope.revision_id };
      const settled = { status: "settled", receipt: { operation_id: envelope.operation_id }, placement_request_digest: envelope.placement_request_digest }; receipts.set(envelope.operation_id, settled); return settled;
    },
  };
  return { service: createPlacementGenerationFoundation(adapter), state: () => structuredClone({ current, currentChat, artifacts }), rebind: (namespace) => { currentChat = { chat_revision_id: id("owner-revision", namespace === nsA ? 50 : 51), namespace_id: namespace }; }, raceRebind: (namespace) => { nextChatAfterRead = { chat_revision_id: id("owner-revision", namespace === nsA ? 50 : 51), namespace_id: namespace }; }, failNext: (code) => { fail = Object.assign(new Error(code), { code }); } };
}

test("composes a complete 256-family aggregate with a distinct immutable placement family through one commit", async () => {
  const f = conformer();
  const semanticSelections = Array.from({ length: 256 }, (_, n) => ({ family_id: id("case", 1000 + n), version_id: id("version", 2000 + n) }));
  const semanticVersions = semanticSelections.map((selection) => ({ ...selection, content: { schema: "opaque@1", n: selection.family_id }, content_digest: successorDigest({ schema: "opaque@1", n: selection.family_id }) }));
  const settled = await f.service.commit(request(1, 0, placement(id("version", 3000)), aggregate(undefined, { documents: [{ id: "d" }], edges: [] }, semanticSelections, semanticVersions)));
  const state = f.state(), envelope = state.artifacts.commits[0];
  assert.equal(settled.placement_changed, true); assert.equal(settled.query_changed, true);
  assert.equal(envelope.aggregate.selections.length, 257, "placement is in addition to the full 256 semantic capacity");
  assert.equal(new Set(envelope.aggregate.selections.map((item) => item.family_id)).size, 257);
  assert.equal(envelope.placement_selection.kind, "chat_default");
  assert.equal(envelope.placement_content.commit_identity, id("owner-revision", 101));
  assert.equal(envelope.placement_content.predecessor_version_id, null);
  const replay = await f.service.commit(request(1, 0, placement(id("version", 3000)), aggregate(undefined, { documents: [{ id: "d" }], edges: [] }, semanticSelections, semanticVersions)));
  assert.equal(replay.receipt.operation_id, "placement:1");
  assert.equal(f.state().artifacts.commits.length, 1, "replay produces no partial or duplicate artifacts");
});

test("changed aggregate, placement, selection, and Chat guard replays reject without receipt disclosure or writes", async () => {
  const f = conformer();
  const original = request(9, 0, placement(id("version", 39)), aggregate(id("version", 38), { documents: [{ id: "original" }], edges: [] }));
  await f.service.commit(original);
  const before = f.state().artifacts;
  const changedQuery = structuredClone(original); changedQuery.aggregate.query = { documents: [{ id: "changed" }], edges: [] }; changedQuery.aggregate.query.digest = successorDigest({ documents: changedQuery.aggregate.query.documents, edges: [] });
  const changedVersion = structuredClone(original); changedVersion.aggregate.versions[0].version_id = id("version", 60); changedVersion.aggregate.versions[0].content = { schema: "opaque@1", version: id("version", 60) }; changedVersion.aggregate.versions[0].content_digest = successorDigest(changedVersion.aggregate.versions[0].content); changedVersion.aggregate.selections[0].version_id = id("version", 60);
  const changedSelection = structuredClone(original); changedSelection.aggregate.versions[0].family_id = id("case", 61); changedSelection.aggregate.selections[0].family_id = id("case", 61);
  const changedPlacement = structuredClone(original); changedPlacement.placement.placement_version_id = id("version", 62);
  for (const altered of [changedQuery, changedVersion, changedSelection, changedPlacement]) await assert.rejects(() => f.service.commit(altered), { code: "idempotency_mismatch" });
  f.rebind(nsB);
  const replay = await f.service.commit(original);
  assert.equal(replay.receipt.operation_id, original.operation_id, "an exact replay remains bound to its caller-selected Chat revision");
  assert.deepEqual(f.state().artifacts, before, "altered replays neither disclose a receipt nor write artifacts");
});

test("move reselects opaque semantics, advances only P; query-only change advances only R; irrelevant semantic does neither", async () => {
  const f = conformer(), semantic = aggregate(id("version", 40), { documents: [{ id: "same" }], edges: [] });
  const first = await f.service.commit(request(10, 0, placement(id("version", 41)), semantic));
  const moved = await f.service.commit(request(11, 1, placement(id("version", 42), nsB, id("placement-family", 30), id("version", 41)), semantic));
  assert.equal(first.placement_changed, true); assert.equal(first.query_changed, true);
  assert.equal(moved.placement_changed, true); assert.equal(moved.query_changed, false);
  const queryOnly = await f.service.commit(request(12, 2, placement(id("version", 42), nsB, id("placement-family", 30), id("version", 41)), aggregate(id("version", 43), { documents: [{ id: "changed" }], edges: [] })));
  assert.equal(queryOnly.placement_changed, false); assert.equal(queryOnly.query_changed, true);
  const irrelevant = await f.service.commit(request(13, 3, placement(id("version", 42), nsB, id("placement-family", 30), id("version", 41)), aggregate(id("version", 44), { documents: [{ id: "changed" }], edges: [] })));
  assert.equal(irrelevant.placement_changed, false); assert.equal(irrelevant.query_changed, false);
  assert.equal(f.state().artifacts.commits.length, 4);
});

test("Chat binding races return context_stale, while explicit Namespace moves and failed commits leave no partial aggregate artifacts", async () => {
  const f = conformer();
  const missingBinding = placement(id("version", 49)); delete missingBinding.chat_revision_id;
  await assert.rejects(() => f.service.commit(request(19, 0, missingBinding, aggregate())), { code: "placement_request_invalid" });
  assert.equal(f.state().artifacts.commits.length, 0, "a Chat-default request cannot infer a current binding");
  await f.service.commit(request(20, 0, placement(id("version", 50)), aggregate()));
  const before = f.state();
  f.raceRebind(nsB);
  await assert.rejects(() => f.service.commit(request(21, 1, placement(id("version", 51)), aggregate())), { code: "context_stale" });
  assert.deepEqual(f.state().artifacts, before.artifacts);
  const collisionVersion = id("version", 54), collisionFamily = id("placement-family", 30);
  const collisionAggregate = aggregate(collisionVersion, { documents: [], edges: [] }, [{ family_id: collisionFamily, version_id: collisionVersion }], [{ family_id: collisionFamily, version_id: collisionVersion, content: { schema: "opaque@1" }, content_digest: successorDigest({ schema: "opaque@1" }) }]);
  await assert.rejects(() => f.service.commit(request(22, 1, placement(id("version", 52), nsB, collisionFamily), collisionAggregate)), { code: "placement_family_collision" });
  assert.deepEqual(f.state().artifacts, before.artifacts);
  f.failNext("profile_changed");
  await assert.rejects(() => f.service.commit(request(23, 1, placement(id("version", 53), nsB), aggregate())), { code: "profile_changed" });
  assert.deepEqual(f.state().artifacts, before.artifacts);
});


test("disposable SQLite atomically projects canonical P/R and owner-neutral query material", { timeout: 60_000 }, async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-placement-pr-")); t.after(() => rm(root, { recursive: true, force: true }));
  const ids = { store: id("store", 400), workspace: id("workspace", 401), namespace: id("namespace", 402), namespaceRevision: id("owner-revision", 403), namespaceVersion: id("version", 404), childNamespace: id("namespace", 499), childNamespaceRevision: id("owner-revision", 498), childNamespaceVersion: id("version", 497), profile: id("profile", 405), profileRevision: id("owner-revision", 406), profileVersion: id("version", 407), selection: id("profile-selection", 408), selectionRevision: id("owner-revision", 409), selectionVersion: id("version", 410), slot: id("admission-slot", 411), initEvent: id("event", 412), project: id("project-default", 413), chat: id("chat", 414), case: id("case", 415), childCase: id("case", 496) };
  const store = path.join(root, "authority.sqlite3"), grant = path.join(root, "bootstrap.grant.json"), configuration = { source: { kind: "synthetic-test", locator: "placement-pr" }, authority_mode: "sqlite", sqlite: { database_url: store } };
  const record = (owner_id, revision_id, version_id, content) => ({ owner_id, revision_id, version_id, content, content_digest: successorDigest(content) });
  const init = { protocol: { id: "casebook-persistence-json", version: 2 }, operation: "initialize_store", request_version: 1, operation_id: "operation:placement-pr:bootstrap", store_id: ids.store,  authority_claim: { human_authorized: true, local_uid: process.getuid(), human_identity: "test", provenance: "disposable" }, configuration, initial: {
    root_namespace: record(ids.namespace, ids.namespaceRevision, ids.namespaceVersion, { schema: "namespace-bootstrap@1", display_name: "Root", parent_id: null, lifecycle: "active" }),
    private_profile: record(ids.profile, ids.profileRevision, ids.profileVersion, { schema: "admission-disclosure-profile@1", audience_ceiling: "private", lifecycle: "active", predecessor_revision_id: null, object_kinds: ["profile", "profile-selection", "namespace", "project-default", "chat", "case"], purposes: ["profile.manage", "profile.read", "context.manage", "context.read", "query.search", "substrate.commit_revision", "substrate.read", "receipt.read", "integrity.observe", "projection.rebuild"], bounds: { max_results: 100, max_traversal_depth: 8, max_export_bytes: 1024 }, projection: { locator: "redacted", export: "deny" }, disclosure: { receipts: true, events: true, checkpoints: true } }),
    profile_selection: record(ids.selection, ids.selectionRevision, ids.selectionVersion, { schema: "profile-selection@1", admission_slot_id: ids.slot, selected_profile_id: ids.profile, selected_profile_revision_id: ids.profileRevision, lifecycle: "active", activation_fence: 1 }), project_default: null, initialization_event_id: ids.initEvent,
  } };
  const auth = await createBootstrapAuthorizationDocument(init, { grant_path: grant }); init.request_digest = auth.request_digest; init.bootstrap_authorization = { path: grant, sha256: auth.sha256 }; await writeFile(grant, `${JSON.stringify(auth.document)}\n`, { mode: 0o600 });
  assert.equal((await initializeSuccessorStore(init)).ok, true);
  const admission = { kind: "sqlite_profile", binding: { selection_id: ids.selection, selection_revision_id: ids.selectionRevision, profile_id: ids.profile, profile_revision_id: ids.profileRevision, activation_fence: 1 } };
  const context = async (operation, extra) => { const value = { operation, operation_id: `operation:placement-pr:${operation}`, store_id: ids.store,  admission_slot_id: ids.slot, admission, configuration, ...extra }; value.request_digest = canonicalContextRequestDigest(ids.store, value); return invokeContextOperation(value); };
  assert.equal((await context("project_default.create", { project_default_id: ids.project, project_default_revision_id: id("owner-revision", 416), version_id: id("version", 417), expected_revision: 0, namespace_id: ids.namespace, event_id: id("event", 418) })).ok, true);
  assert.equal((await context("chat.establish", { chat_id: ids.chat, chat_revision_id: id("owner-revision", 419), version_id: id("version", 420), expected_revision: 0, use_project_default: true, event_id: id("event", 421) })).ok, true, "Project default establishes Chat before default placement");
  assert.equal((await context("namespace.create", { namespace_id: ids.childNamespace, namespace_revision_id: ids.childNamespaceRevision, version_id: ids.childNamespaceVersion, expected_revision: 0, parent_namespace_id: ids.namespace, event_id: id("event", 495), display_name: "Child", aliases: [] })).ok, true);
  const registry = createAdmissionRegistry({ operations: SUBSTRATE_ADMISSION_ROWS, adapters: [{ owner_kind: "case", adapter_version: 1, schemas: ["opaque-owner@1"], operations: ["substrate.commit_revision"], complete_owner: true, resource_deltas: true, events: true, results: true, projections: true, supported_guards: ["owner-policy-fence@1"] }], lifecycles: [{ owner_kind: "case", descriptor_version: 1, descriptor_kind: "selected-version-lifecycle@1", current_states: ["active"], mutation_states: ["active"] }] });
  const service = createPlacementGenerationFoundation(createSuccessorSqlitePlacementAdapter({ configuration, store_id: ids.store,  admission_slot_id: ids.slot, admission, mechanical_options: { admissionRegistry: registry } }));
  const commit = (number, expected_revision, placementValue, aggregateValue) => service.commit({ operation_id: `operation:placement-pr:${number}`, owner: { id: ids.case, kind: "case" }, expected_revision, revision_id: id("owner-revision", 430 + number), event: id("event", 440 + number), placement: placementValue, aggregate: aggregateValue });
  const p1 = placement(id("version", 450), null, id("placement-family", 451), null, id("owner-revision", 419)); p1.chat_id = ids.chat;
  const claim = { schema: "owner-exact-claim@1", claim_type: "alias", normalized_value: normalizeExactLocator("Alpha") };
  const caseAliasClaim = { schema: "owner-exact-claim@1", claim_type: "case-alias", normalized_value: normalizeExactLocator("Alpha") };
  const searchDocument = { schema: "case-resource-search@1", resource_id: id("knowledge", 456), resource_kind: "knowledge", search: { text: "current needle public text", metadata: { facets: [{ key: "phase", value: "current" }] } } };
  // Current-scale, canonical query material: this is indexed by the real
  // placement transaction, rather than by a query helper fixture.
  const currentScaleCorpus = Array.from({ length: 9_999 }, (_, index) => ({
    schema: "case-resource-search@1", resource_id: id("knowledge", 10_000 + index), resource_kind: "knowledge",
    search: { text: `current-scale needle corpus document ${index}`, metadata: { facets: [{ key: "phase", value: "bulk" }] } },
  }));
  const firstAggregate = aggregate(id("version", 452), { documents: [claim, caseAliasClaim, searchDocument, ...currentScaleCorpus], edges: [] }, [{ family_id: id("case", 453), version_id: id("version", 452) }], [{ family_id: id("case", 453), version_id: id("version", 452), content: { schema: "opaque@1" }, content_digest: successorDigest({ schema: "opaque@1" }) }]);
  await commit(1, 0, p1, firstAggregate);
  await service.commit({ operation_id: "placement-pr:child", owner: { id: ids.childCase, kind: "case" }, expected_revision: 0, revision_id: id("owner-revision", 494), event: id("event", 493), placement: placement(id("version", 492), ids.childNamespace, id("placement-family", 491)), aggregate: aggregate(id("version", 490), { documents: [{ ...searchDocument, resource_id: id("knowledge", 489), search: { text: "current needle child text", metadata: { facets: [{ key: "phase", value: "current" }] } } }], edges: [] }, [{ family_id: id("case", 488), version_id: id("version", 490) }], [{ family_id: id("case", 488), version_id: id("version", 490), content: { schema: "opaque@1" }, content_digest: successorDigest({ schema: "opaque@1" }) }] ) });
  assert.equal((await context("chat.rebind", { chat_id: ids.chat, chat_revision_id: id("owner-revision", 480), version_id: id("version", 481), expected_revision: 1, namespace_id: ids.namespace, event_id: id("event", 482), correlation: null })).ok, true);
  const replay = await commit(1, 0, p1, firstAggregate); assert.equal(replay.idempotent_replay, true, "an exact receipt replay does not resolve the Chat's current binding");
  const staleOwner = { id: id("case", 483), kind: "case" };
  const staleBefore = JSON.parse((await sqlite(await selectSqliteBinary(), store, `PRAGMA query_only=ON; SELECT count(*) count FROM owner_revisions WHERE owner_id='${staleOwner.id}';`, { args: ["-batch", "-bail", "-json"] })).stdout)[0].count;
  await assert.rejects(() => service.commit({ operation_id: "operation:placement-pr:stale-chat", owner: staleOwner, expected_revision: 0, revision_id: id("owner-revision", 484), event: id("event", 485), placement: p1, aggregate: firstAggregate }), { code: "context_stale" });
  const staleAfter = JSON.parse((await sqlite(await selectSqliteBinary(), store, `PRAGMA query_only=ON; SELECT count(*) count FROM owner_revisions WHERE owner_id='${staleOwner.id}';`, { args: ["-batch", "-bail", "-json"] })).stdout)[0].count;
  assert.equal(staleAfter, staleBefore, "a stale Chat binding publishes no owner artifacts");
  const alteredReplay = structuredClone(firstAggregate); alteredReplay.query = { documents: [{ id: "altered" }], edges: [], digest: successorDigest({ documents: [{ id: "altered" }], edges: [] }) };
  await assert.rejects(() => commit(1, 0, p1, alteredReplay), { code: "idempotency_mismatch" });
  const p2 = placement(id("version", 454), ids.namespace, id("placement-family", 451), id("version", 450));
  await commit(2, 1, p2, aggregate(id("version", 452), { documents: [claim, caseAliasClaim, searchDocument, ...currentScaleCorpus], edges: [] }, [{ family_id: id("case", 453), version_id: id("version", 452) }], []));
  await commit(3, 2, p2, aggregate(id("version", 455), { documents: [claim, caseAliasClaim, searchDocument, ...currentScaleCorpus, { id: "two" }], edges: [] }, [{ family_id: id("case", 453), version_id: id("version", 455) }], [{ family_id: id("case", 453), version_id: id("version", 455), content: { schema: "opaque@1", revised: true }, content_digest: successorDigest({ schema: "opaque@1", revised: true }) }]));
  const binary = await selectSqliteBinary(); const { stdout } = await sqlite(binary, store, "PRAGMA query_only=ON; SELECT placement_generation P,resource_generation R,(SELECT count(*) FROM owner_query_material) material,(SELECT query_digest FROM owner_query_current) query_digest FROM store_fence;", { args: ["-batch", "-bail", "-json"] });
  const row = JSON.parse(stdout)[0]; assert.deepEqual({ P: row.P, R: row.R, material: row.material }, { P: 3, R: 3, material: 4 }); assert.equal(row.query_digest, successorDigest({ documents: [claim, caseAliasClaim, searchDocument, ...currentScaleCorpus, { id: "two" }], edges: [] }));
  const found = await organizationalSearch({ store_id: ids.store,  admission_slot_id: ids.slot, admission, configuration, query: "needle", scope: "exact_namespace", namespace_id: ids.namespace, tags: [{ key: "phase", value: "current" }] });
  assert.equal(found.ok, true); assert.equal(found.result.order, "organizational@1"); assert.equal(found.result.matches.length, 1); assert.equal(found.result.matches[0].resource.id, searchDocument.resource_id); assert.equal(found.result.matches[0].snippet.includes("needle"), true);
  const alias = await resolveOrganizationalIdentity({ store_id: ids.store,  admission_slot_id: ids.slot, admission, configuration, selector: { namespace_id: ids.namespace, alias: "ALPHA" } });
  assert.equal(alias.ok, true); assert.equal(alias.result.status, "found"); assert.equal(alias.result.identity.id, ids.case);
  const resolve = (operation, extra) => invokeSuccessorMechanicalOperation({ operation, configuration, store_id: ids.store,  admission_slot_id: ids.slot, admission, ...extra });
  const currentBinding = await resolve("substrate.resolve_family_binding", { owner_kind: "case", family_id: id("case", 453), selector: { current: true } }); assert.equal(currentBinding.result.status, "found"); assert.equal(currentBinding.result.family.version_id, id("version", 455));
  const historicalBinding = await resolve("substrate.resolve_family_binding", { owner_kind: "case", family_id: id("case", 453), selector: { owner_revision_id: id("owner-revision", 431) } }); assert.equal(historicalBinding.result.family.version_id, id("version", 452));
  const resolvedClaim = await resolve("substrate.resolve_current_claim", { owner_kind: "case", claim_type: "alias", namespace_id: ids.namespace, normalized_value: normalizeExactLocator("ALPHA") }); assert.equal(resolvedClaim.result.status, "found"); assert.equal(resolvedClaim.result.owner.id, ids.case);
  const second = createPlacementGenerationFoundation(createSuccessorSqlitePlacementAdapter({ configuration, store_id: ids.store,  admission_slot_id: ids.slot, admission, mechanical_options: { admissionRegistry: registry } }));
  await second.commit({ operation_id: "operation:placement-pr:ambiguous", owner: { id: id("case", 470), kind: "case" }, expected_revision: 0, revision_id: id("owner-revision", 471), event: id("event", 472), placement: placement(id("version", 473), ids.namespace, id("placement-family", 474)), aggregate: aggregate(id("version", 475), { documents: [claim, caseAliasClaim], edges: [] }, [{ family_id: id("case", 476), version_id: id("version", 475) }], [{ family_id: id("case", 476), version_id: id("version", 475), content: { schema: "opaque@1" }, content_digest: successorDigest({ schema: "opaque@1" }) }]) });
  const ambiguous = await resolve("substrate.resolve_current_claim", { owner_kind: "case", claim_type: "alias", namespace_id: ids.namespace, normalized_value: normalizeExactLocator("alpha") }); assert.equal(ambiguous.result.status, "ambiguous"); assert.equal(JSON.stringify(ambiguous.result).includes(ids.case), false);
  const zero = await resolve("substrate.resolve_current_claim", { owner_kind: "case", claim_type: "alias", namespace_id: ids.namespace, normalized_value: normalizeExactLocator("missing") }); assert.deepEqual(zero.result, { status: "zero" });
  const fence = (await sqlite(binary, store, "PRAGMA query_only=ON; SELECT operation_fence FROM store_fence;", { args: ["-batch", "-bail", "-json"] })).stdout; const rebuilt = await resolve("projection.rebuild", { operation_id: "operation:placement-pr:rebuild", expected_fence: JSON.parse(fence)[0].operation_fence }); assert.equal(rebuilt.ok, true); const afterRebuild = await resolve("substrate.resolve_current_claim", { owner_kind: "case", claim_type: "alias", namespace_id: ids.namespace, normalized_value: normalizeExactLocator("alpha") }); assert.equal(afterRebuild.result.status, "ambiguous");


  const baseRequest = { protocol: { id: "casebook-persistence-json", version: 2 }, store_id: ids.store,  admission_slot_id: ids.slot, admission, configuration };
  const resolverRequests = [
    { operation: "namespace.resolve", path: ["root"] },
    { operation: "substrate.resolve_family_binding", owner_kind: "case", family_id: id("case", 453), selector: { current: true } },
    { operation: "substrate.resolve_current_claim", owner_kind: "case", claim_type: "alias", namespace_id: ids.namespace, normalized_value: normalizeExactLocator("missing") },
  ].map((request) => ({ ...baseRequest, ...request }));
  const allScopes = [
    { scope: "chat_default", chat_id: ids.chat },
    { scope: "global", namespace_id: ids.namespace },
    { scope: "workspace" },
    { scope: "exact_namespace", namespace_id: ids.namespace },
    { scope: "subtree", namespace_id: ids.childNamespace },
    { scope: "ancestors", namespace_id: ids.childNamespace },
  ];
  const assertPublicQueryDispatch = async (entrypoint, label) => {
    for (const request of resolverRequests) {
      const result = await invokeConnector(entrypoint, root, request);
      assert.equal(result.exitCode, 0, `${label} ${request.operation}: ${result.stderr}`);
      assert.equal(result.json.ok, true, `${label} ${request.operation}: ${JSON.stringify(result.json)}`);
      assert.equal(result.json.operation, request.operation, `${label} must return the declared typed operation`);
      assert.notEqual(result.json.failure?.code, "internal_failure");
    }
    let handoff;
    for (const scope of allScopes) {
      const result = await invokeConnector(entrypoint, root, { ...baseRequest, operation: "query.search", query: "needle", tags: [{ key: "phase", value: "current" }], ...scope });
      assert.equal(result.exitCode, 0, `${label} ${scope.scope}: ${result.stderr}`);
      assert.equal(result.json.ok, true, `${label} ${scope.scope}: ${JSON.stringify(result.json)}`);
      assert.equal(result.json.operation, "query.search");
      assert.equal(result.json.result.order, "organizational@1");
      assert.ok(result.json.result.matches.length >= 1, `${label} ${scope.scope} has lexical hits`);
      if (scope.scope === "workspace") assert.equal(result.json.result.total, 2, `${label} workspace includes every authority object`);
      if (scope.scope === "subtree") assert.equal(result.json.result.total, 1, `${label} child subtree does not alias workspace`);
      handoff ??= result.json.result.matches[0].handoff;
    }
    const paged = await invokeConnector(entrypoint, root, { ...baseRequest, operation: "query.search", query: "needle", scope: "workspace", limit: 100 });
    assert.equal(paged.exitCode, 0, `${label} current-scale first page: ${paged.stderr}`);
    assert.equal(paged.json.result.total, 10_001, `${label} queries the indexed current-scale corpus`);
    assert.equal(paged.json.result.matches.length, 100); assert.ok(paged.json.result.next_cursor);
    const resumed = await invokeConnector(entrypoint, root, { ...baseRequest, operation: "query.search", query: "needle", scope: "workspace", limit: 100, cursor: paged.json.result.next_cursor });
    assert.equal(resumed.exitCode, 0, `${label} current-scale continuation: ${resumed.stderr}`);
    assert.equal(resumed.json.result.matches.length, 100); assert.notEqual(resumed.json.result.matches[0].handoff, paged.json.result.matches[0].handoff);
    const outOfBounds = await invokeConnector(entrypoint, root, { ...baseRequest, operation: "query.search", query: "needle", scope: "workspace", limit: 100, cursor: `${paged.json.result.next_cursor}x` });
    assert.equal(outOfBounds.exitCode, 2); assert.equal(outOfBounds.json.failure.code, "query_cursor_invalid");
    const denied = await invokeConnector(entrypoint, root, { ...baseRequest, operation: "query.search", query: "needle", scope: "workspace", admission: { ...admission, binding: { ...admission.binding, activation_fence: 999 } } });
    assert.equal(denied.exitCode, 2, `${label} Profile denial is before query disclosure`); assert.equal(denied.json.failure.code, "profile_guard_denied"); assert.equal(denied.json.result, undefined);
    await sqlite(binary, store, `UPDATE profile_selection_current SET activation_fence=activation_fence+1 WHERE admission_slot_id='${ids.slot}';`, { args: ["-batch", "-bail"] });
    const changedProfile = await invokeConnector(entrypoint, root, { ...baseRequest, operation: "query.search", query: "needle", scope: "workspace" });
    assert.equal(changedProfile.exitCode, 2, `${label} changed Profile is rejected before query disclosure`); assert.equal(changedProfile.json.failure.code, "profile_guard_denied"); assert.equal(changedProfile.json.result, undefined);
    await sqlite(binary, store, `UPDATE profile_selection_current SET activation_fence=activation_fence-1 WHERE admission_slot_id='${ids.slot}';`, { args: ["-batch", "-bail"] });
    const zeroHits = await invokeConnector(entrypoint, root, { ...baseRequest, operation: "query.search", query: "no-such-token", scope: "workspace" });
    assert.equal(zeroHits.exitCode, 0, `${label} zero hits: ${zeroHits.stderr}`);
    assert.equal(zeroHits.json.result.total, 0); assert.deepEqual(zeroHits.json.result.matches, []);
    const ambiguousAlias = await invokeConnector(entrypoint, root, { ...baseRequest, operation: "query.resolve", selector: { namespace_id: ids.namespace, alias: "alpha" } });
    assert.equal(ambiguousAlias.exitCode, 0, `${label} query.resolve ambiguity: ${ambiguousAlias.stderr}`);
    assert.equal(ambiguousAlias.json.result.status, "ambiguous");
    const zeroAlias = await invokeConnector(entrypoint, root, { ...baseRequest, operation: "query.resolve", selector: { namespace_id: ids.namespace, alias: "missing" } });
    assert.equal(zeroAlias.exitCode, 0, `${label} query.resolve zero: ${zeroAlias.stderr}`);
    assert.equal(zeroAlias.json.result.status, "zero");
    const hydrated = await invokeConnector(entrypoint, root, { ...baseRequest, operation: "query.hydrate", handoff });
    assert.equal(hydrated.exitCode, 0, `${label} query.hydrate: ${hydrated.stderr}`);
    assert.equal(hydrated.json.result.status, "found");
  };
  await assertPublicQueryDispatch(path.resolve(new URL("../variants/sqlite/bin/casebook-persistence.mjs", import.meta.url).pathname), "source connector");
  const sandboxRoot = path.join(root, "generated-query-packages");
  const generated = await generateAndValidateSandbox({ sandboxRoot });
  for (const packageCopy of generated.results) await assertPublicQueryDispatch(path.join(packageCopy.package_root, "variants/sqlite/bin/casebook-persistence.mjs"), `${packageCopy.target} generated package`);

  // Public connector cursors bind only H/P/R. An unrelated operation-fence
  // advance resumes normally; each relevant generation returns its typed stale
  // result rather than silently restarting the search.
  const sourceEntrypoint = path.resolve(new URL("../variants/sqlite/bin/casebook-persistence.mjs", import.meta.url).pathname);
  const cursorRequest = { ...baseRequest, operation: "query.search", query: "needle", scope: "workspace", limit: 1 };
  const initialCursor = await invokeConnector(sourceEntrypoint, root, cursorRequest);
  assert.equal(initialCursor.exitCode, 0); assert.ok(initialCursor.json.result.next_cursor);
  await sqlite(binary, store, "UPDATE store_fence SET operation_fence=operation_fence+1 WHERE singleton=1;", { args: ["-batch", "-bail"] });
  const unrelatedResume = await invokeConnector(sourceEntrypoint, root, { ...cursorRequest, cursor: initialCursor.json.result.next_cursor });
  assert.equal(unrelatedResume.exitCode, 0, "unrelated generation/fence changes retain a valid continuation");
  const publicEntrypoints = [[sourceEntrypoint, "source connector"], ...generated.results.map((copy) => [path.join(copy.package_root, "variants/sqlite/bin/casebook-persistence.mjs"), `${copy.target} generated package`])];
  for (const [entrypoint, label] of publicEntrypoints) for (const [column, code, handoffCode] of [["hierarchy_generation", "query_cursor_h_stale", "query_handoff_h_stale"], ["placement_generation", "query_cursor_p_stale", "query_handoff_p_stale"], ["resource_generation", "query_cursor_r_stale", "query_handoff_r_stale"]]) {
    const fresh = await invokeConnector(entrypoint, root, cursorRequest);
    assert.equal(fresh.exitCode, 0, label); assert.ok(fresh.json.result.next_cursor);
    const handoff = fresh.json.result.matches[0].handoff;
    await sqlite(binary, store, `UPDATE store_fence SET ${column}=${column}+1 WHERE singleton=1;`, { args: ["-batch", "-bail"] });
    const stale = await invokeConnector(entrypoint, root, { ...cursorRequest, cursor: fresh.json.result.next_cursor });
    assert.equal(stale.exitCode, 2, label); assert.equal(stale.json.failure.code, code);
    const staleHydration = await invokeConnector(entrypoint, root, { ...baseRequest, operation: "query.hydrate", handoff });
    assert.equal(staleHydration.exitCode, 2, label); assert.equal(staleHydration.json.failure.code, handoffCode);
    await sqlite(binary, store, `UPDATE store_fence SET ${column}=${column}-1 WHERE singleton=1;`, { args: ["-batch", "-bail"] });
  }
  assert.equal(await cleanupSandbox(sandboxRoot), true, "generated connector sandbox is removed after public E2E");

  assert.equal((await context("namespace.retire",  { namespace_id: ids.namespace, namespace_revision_id: id("owner-revision", 486), version_id: id("version", 487), expected_revision: 1, event_id: id("event", 488), display_name: "Root", aliases: [] })).ok, true);
  const staleChat = await invokeConnector(path.resolve(new URL("../variants/sqlite/bin/casebook-persistence.mjs", import.meta.url).pathname), root, { ...baseRequest, operation: "query.search", query: "needle", scope: "chat_default", chat_id: ids.chat });
  assert.equal(staleChat.exitCode, 2); assert.equal(staleChat.json.failure.code, "context_stale", "a retired Chat Namespace never silently restarts or falls back");
  const retiredOwner = { id: id("case", 489), kind: "case" };
  await assert.rejects(() => service.commit({ operation_id: "operation:placement-pr:retired-namespace", owner: retiredOwner, expected_revision: 0, revision_id: id("owner-revision", 490), event: id("event", 491), placement: placement(id("version", 492), ids.namespace, id("placement-family", 493)), aggregate: firstAggregate }), { code: "context_stale" });
  const retiredArtifacts = JSON.parse((await sqlite(binary, store, `PRAGMA query_only=ON; SELECT count(*) count FROM owner_revisions WHERE owner_id='${retiredOwner.id}';`, { args: ["-batch", "-bail", "-json"] })).stdout)[0].count;
  assert.equal(retiredArtifacts, 0, "a retired explicit Namespace publishes no owner artifacts");

});
