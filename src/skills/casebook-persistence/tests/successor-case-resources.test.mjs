import assert from "node:assert/strict";
import test from "node:test";
import { assembleSuccessorCaseEnvelope } from "../variants/sqlite/lib/case/successor.mjs";

const id = (kind, value) => `${kind}:90000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const ids = { store: id("store", 1), case: id("case", 2), namespace: id("namespace", 3), chat: id("chat", 4), facet: id("facet", 5), knowledge: id("knowledge", 6), source: id("source", 7), evidence: id("evidence", 8), relationship: id("relationship", 9) };
function request(operationId, caseValue) { return { operation: "case.create", request_version: 1, operation_id: `operation:successor:${operationId}`, store_id: ids.store, expected_revision: 0, commit_basis: "successor Case test", provenance: {}, placement: { chat_id: ids.chat }, case: caseValue }; }
function completeCase() { return {
  id: ids.case, home_namespace_id: ids.namespace, state: "active", title: "Case title", summary: "Case summary", scope: "bounded", provenance: { sources: [], support: [], authority: [] }, aliases: ["Canonical Alias"], references: [],
  facets: [{ id: ids.facet, state: "active", version: { key: "state", value: "reviewed", visibility: "private" } }],
  entries: [{ id: ids.knowledge, state: "active", version: { display_label: "K-001", title: "Knowledge title", purpose: "proof", classification: "accepted", body: "queryable durable body", visibility: "private", provenance: { acting_role: "test" }, positions: [], relationships: [], references: [] } }],
  sources: [{ id: ids.source, state: "active", display_label: "S-001", version: { title: "Source title", accessed_at: "2026-07-24T00:00:00Z", examined_for: "proof", visibility: "private", locators: [{ kind: "origin", uri: "https://example.invalid/source", audience: "private" }] }, fragments: [{ id: ids.evidence, state: "active", version: { excerpt: "evidence", purpose: "proof", captured_at: "2026-07-24T00:00:00Z", visibility: "private" } }] }],
  relationships: [{ id: ids.relationship, state: "active", version: { subject: { kind: "case", id: ids.case }, predicate: "contains", object: { kind: "knowledge", id: ids.knowledge }, visibility: "private" } }],
}; }

test("Case-local successor assembler emits every canonical family, query material, and one Chat-default placement input", () => {
  const built = assembleSuccessorCaseEnvelope(request("all-families", completeCase()));
  assert.equal(built.aggregate.selections.length, 7, "the alias has a stable selected family");
  assert.equal(built.aggregate.normalized.case.id, ids.case);
  assert.equal(built.placement.chat_id, ids.chat);
  assert.equal(built.placement.placement_family_id.startsWith("placement-family:"), true);
  assert.equal(built.aggregate.query.documents.length, 7, "the exact alias claim is part of R");
  assert.deepEqual(built.aggregate.query.documents.find((document) => document.schema === "owner-exact-claim@1"), { schema: "owner-exact-claim@1", claim_type: "case-alias", normalized_value: "canonical alias" });
  assert.equal(built.aggregate.query.edges.length, 1);
  assert.equal(built.aggregate.query.digest.length, 64);
  assert.equal(built.aggregate.versions.every((version) => version.content_digest.length === 64), true);
});

test("aliases use stable selected families and exact claims independent of display casing", () => {
  const first = assembleSuccessorCaseEnvelope(request("alias-one", completeCase()));
  const changed = completeCase(); changed.aliases = [" canonical alias "];
  const second = assembleSuccessorCaseEnvelope(request("alias-two", changed));
  const firstAlias = first.aggregate.versions.find((version) => version.content.schema === "case-alias@1");
  const secondAlias = second.aggregate.versions.find((version) => version.content.schema === "case-alias@1");
  assert.equal(firstAlias.family_id, secondAlias.family_id);
  assert.notEqual(firstAlias.version_id, secondAlias.version_id);
  assert.equal(first.aggregate.query.digest, second.aggregate.query.digest, "display-only alias spelling cannot perturb exact resolver material");
});

test("query material advances only for searchable Case meaning, not provenance-only evidence", () => {
  const baseline = completeCase();
  const evidenceOnly = structuredClone(baseline);
  evidenceOnly.entries[0].version.provenance = { acting_role: "other-test" };
  const queryChange = structuredClone(baseline);
  queryChange.entries[0].version.body = "a different queryable body";
  const a = assembleSuccessorCaseEnvelope(request("baseline", baseline));
  const b = assembleSuccessorCaseEnvelope(request("evidence", evidenceOnly));
  const c = assembleSuccessorCaseEnvelope(request("query", queryChange));
  assert.equal(a.aggregate.query.digest, b.aggregate.query.digest, "irrelevant provenance does not advance R");
  assert.notEqual(a.aggregate.query.digest, c.aggregate.query.digest, "queryable semantic content advances R");
});

test("the complete Case selection bound reserves one selection for placement", () => {
  const atLimit = completeCase();
  // profile + 249 facets + knowledge/source/evidence/relationship + alias = 255
  atLimit.facets = Array.from({ length: 249 }, (_, index) => ({ id: `facet:90000000-0000-4000-8000-${String(100 + index).padStart(12, "0")}`, state: "active", version: { key: `k${index}`, value: `v${index}`, visibility: "private" } }));
  assert.equal(assembleSuccessorCaseEnvelope(request("at-limit", atLimit)).aggregate.selections.length, 255);
  const overflow = structuredClone(atLimit);
  overflow.facets.push({ id: "facet:90000000-0000-4000-8000-000000000999", state: "active", version: { key: "overflow", value: "overflow", visibility: "private" } });
  assert.throws(() => assembleSuccessorCaseEnvelope(request("overflow", overflow)), { rule: "resource_count_exceeded" });
});
