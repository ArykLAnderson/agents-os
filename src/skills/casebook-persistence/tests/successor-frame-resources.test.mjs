import assert from "node:assert/strict";
import test from "node:test";
import { assembleSuccessorFrameEnvelope, FRAME_OPERATION_FIELDS } from "../variants/sqlite/lib/frame/successor.mjs";
import manifest from "../manifest.json" with { type: "json" };

const id = (kind, value) => `${kind}:91000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const ids = { store: id("store", 1), frame: id("frame", 2), namespace: id("namespace", 3), chat: id("chat", 4), chatRevision: id("owner-revision", 5), view: id("view", 6), policy: id("view-policy", 7), discovery: id("discovery", 8), boundary: id("disposition-boundary", 9), disposition: id("case-disposition", 10), case: id("case", 11) };
function frame() { return {
  id: ids.frame, status: "active", title: "Frame title", outcome: "A bounded outcome", included_scope: ["Frame-local meaning"], discovery: [{ id: ids.discovery, display_order: 0, lifecycle: "active", category: "frontier", title: "Question", body: "Queryable discovery body", human_authority: "required", dependencies: [] }],
  disposition_boundaries: [{ id: ids.boundary, display_order: 0, title: "Boundary", closure: "open", disposition_ids: [ids.disposition] }],
  case_dispositions: [{ id: ids.disposition, boundary_id: ids.boundary, result_summary: "Result", classification_state: "pending_classification", pending_reason: "Needs review", resume_condition: "Classify" }],
}; }
function request(operationId, value = frame(), placement = { namespace_id: ids.namespace }) { return {
  operation: "frame.create", request_version: 1, operation_id: `operation:successor-frame:${operationId}`, store_id: ids.store, expected_revision: 0, commit_basis: "successor Frame test", provenance: {},
  context: { view_id: ids.view, view_policy_revision_id: ids.policy, purpose: "test", requested_audience_ceiling: "private" }, frame: value, placement,
}; }

test("Frame-local successor assembler emits complete profile, Discovery, disposition resources and separate placement", () => {
  const built = assembleSuccessorFrameEnvelope(request("complete"));
  assert.equal(built.aggregate.selections.length, 4);
  assert.equal(built.aggregate.normalized.frame.home_namespace_id, undefined, "placement is not Frame semantic content");
  assert.equal(built.aggregate.versions.find((item) => item.family_id === ids.frame).content.home_namespace_id, undefined);
  assert.equal(built.placement.namespace_id, ids.namespace);
  assert.equal(built.aggregate.query.documents.length, 4);
  assert.equal(built.aggregate.query.edges.length, 0);
  assert.equal(built.aggregate.query.digest.length, 64);
});

test("Frame R matrix advances for profile/Discovery/disposition query meaning and not provenance-only meaning", () => {
  const baseline = frame();
  const provenanceOnly = structuredClone(baseline); provenanceOnly.authorization_provenance = { acting_role: "different" };
  const profileChange = structuredClone(baseline); profileChange.title = "Different title";
  const discoveryChange = structuredClone(baseline); discoveryChange.discovery[0].body = "Different query body";
  const dispositionChange = structuredClone(baseline); dispositionChange.case_dispositions[0].result_summary = "Different result";
  const a = assembleSuccessorFrameEnvelope(request("a", baseline));
  const b = assembleSuccessorFrameEnvelope(request("b", provenanceOnly));
  const c = assembleSuccessorFrameEnvelope(request("c", profileChange));
  const d = assembleSuccessorFrameEnvelope(request("d", discoveryChange));
  const e = assembleSuccessorFrameEnvelope(request("e", dispositionChange));
  assert.equal(a.aggregate.query.digest, b.aggregate.query.digest, "authorization provenance is not query material (no R advance)");
  for (const changed of [c, d, e]) assert.notEqual(a.aggregate.query.digest, changed.aggregate.query.digest, "selected query meaning advances R");
});

test("Frame placement supports exact Chat history selection without deriving semantic defaults", () => {
  const built = assembleSuccessorFrameEnvelope(request("chat", frame(), { chat_id: ids.chat, chat_revision_id: ids.chatRevision }));
  assert.deepEqual({ chat_id: built.placement.chat_id, chat_revision_id: built.placement.chat_revision_id }, { chat_id: ids.chat, chat_revision_id: ids.chatRevision });
  assert.equal(built.placement.namespace_id, undefined);
  assert.throws(() => assembleSuccessorFrameEnvelope(request("ambiguous", frame(), { chat_id: ids.chat })), { rule: "field_unsupported" });
});

test("published Frame operation contracts and exact request allowlists are closed", () => {
  const published = manifest.supported_operations.filter((operation) => operation.startsWith("frame."));
  assert.deepEqual([...FRAME_OPERATION_FIELDS.keys()], published);
  const rows = manifest.operation_contracts.operations.filter((row) => row.operation.startsWith("frame."));
  assert.equal(rows.length, published.length);
  for (const operation of published) {
    const row = rows.find((candidate) => candidate.operation === operation);
    const read = operation === "frame.read" || operation.endsWith(".read");
    assert.deepEqual(row, { operation, capability_class: read ? "ordinary_cli" : "human_operational", profile_purpose: read ? "frame.read" : "frame.manage", required_owner_kinds: ["frame"], optional_guards: [] });
    assert.equal(FRAME_OPERATION_FIELDS.get(operation).has("unexpected_top_level_field"), false);
  }
});

test("Frame rejects placement/legacy scope leakage and preserves complete selection bound", () => {
  const mismatched = frame(); mismatched.home_namespace_id = id("namespace", 99);
  assert.throws(() => assembleSuccessorFrameEnvelope(request("mismatch", mismatched)), { rule: "placement_namespace_mismatch" });
  const atLimit = frame();
  atLimit.discovery = Array.from({ length: 128 }, (_, index) => ({ id: `discovery:91000000-0000-4000-8000-${String(100 + index).padStart(12, "0")}`, display_order: index, lifecycle: "active", category: "frontier", title: `D${index}`, body: `B${index}`, human_authority: "not_required", dependencies: [] }));
  // The validator's Discovery bound is part of the complete Frame bound.
  assert.equal(assembleSuccessorFrameEnvelope(request("bounded", atLimit)).aggregate.selections.length, 131);
});
