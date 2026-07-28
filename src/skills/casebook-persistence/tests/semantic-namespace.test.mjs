import assert from "node:assert/strict";
import test from "node:test";
import { canonicalNamespaceId, isStructuralNamespace, requireNamespaceId } from "../variants/sqlite/lib/context/namespace.mjs";
import { createPlacementGenerationFoundation } from "../variants/sqlite/lib/placement/index.mjs";
import { successorDigest } from "../variants/sqlite/lib/substrate/mechanical-successor.mjs";
import { assembleSuccessorCaseEnvelope } from "../variants/sqlite/lib/case/successor.mjs";
import { assembleSuccessorFrameEnvelope } from "../variants/sqlite/lib/frame/successor.mjs";

test("semantic Namespace IDs canonicalize to lowercase kebab paths and reject UUID identity", () => {
  assert.equal(canonicalNamespaceId("Project Research/Findings"), "namespace:project-research/findings");
  assert.equal(canonicalNamespaceId("namespace:Personal"), "namespace:personal");
  assert.equal(isStructuralNamespace("namespace:root"), true);
  assert.throws(() => requireNamespaceId("namespace:10000000-0000-4000-8000-000000000001"), /semantic_namespace_identity_required/);
});

test("Case and Frame successor envelopes fail closed without Namespace and never use structural root", async () => {
  const caseValue = { id: "case:10000000-0000-4000-8000-000000000001", state: "active", title: "Case", summary: "Summary", scope: "scope", provenance: { sources: [], support: [], authority: [] }, aliases: [], references: [], facets: [], entries: [], sources: [], relationships: [] };
  const frameValue = { id: "frame:10000000-0000-4000-8000-000000000002", status: "active", title: "Frame", outcome: "Outcome", discovery: [], disposition_boundaries: [], case_dispositions: [] };
  const common = { store_id: "store:10000000-0000-4000-8000-000000000003", operation_id: "operation:semantic-test", expected_revision: 0, commit_basis: "test" };
  assert.throws(() => assembleSuccessorCaseEnvelope({ ...common, case: caseValue }), (error) => error.rule === "namespace_required");
  assert.throws(() => assembleSuccessorFrameEnvelope({ ...common, frame: frameValue }), (error) => error.rule === "namespace_required");
  const adapter = { commit: async () => {}, readChatBinding: async () => null, readCurrent: async () => ({ revision_number: 0 }), readReceipt: async () => null, readRevision: async () => null, resolveNamespace: async () => ({ namespace_id: "namespace:root", namespace_revision_id: "owner-revision:10000000-0000-4000-8000-000000000004", lifecycle: "active" }) };
  const service = createPlacementGenerationFoundation(adapter);
  const query = { documents: [], edges: [], digest: successorDigest({ documents: [], edges: [] }) };
  await assert.rejects(() => service.commit({ aggregate: { normalized: {}, outbox: [], query, selections: [], versions: [], current_projection: {} }, event: "event:10000000-0000-4000-8000-000000000005", expected_revision: 0, operation_id: "operation:root-placement", owner: { id: caseValue.id, kind: "case" }, placement: { namespace_id: "namespace:root", origin: {}, placement_family_id: "placement-family:10000000-0000-4000-8000-000000000007", placement_version_id: "version:10000000-0000-4000-8000-000000000008", predecessor_version_id: null, provenance: {} }, revision_id: "owner-revision:10000000-0000-4000-8000-000000000006" }), (error) => error.code === "namespace_structural_only");
});
