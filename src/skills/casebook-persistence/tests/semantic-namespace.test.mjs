import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalNamespaceId, isStructuralNamespace, requireNamespaceId } from "../variants/sqlite/lib/context/namespace.mjs";
import { createPlacementGenerationFoundation } from "../variants/sqlite/lib/placement/index.mjs";
import { successorDigest } from "../variants/sqlite/lib/substrate/mechanical-successor.mjs";
import { assembleSuccessorCaseEnvelope } from "../variants/sqlite/lib/case/successor.mjs";
import { assembleSuccessorFrameEnvelope } from "../variants/sqlite/lib/frame/successor.mjs";
import { selectSqliteBinary, sqlite } from "../variants/sqlite/lib/substrate/diagnostics.mjs";

test("semantic Namespace IDs canonicalize to lowercase kebab paths and reject UUID identity", () => {
  assert.equal(canonicalNamespaceId("Project Research/Findings"), "namespace:project-research/findings");
  assert.equal(canonicalNamespaceId("namespace:Personal"), "namespace:personal");
  assert.equal(isStructuralNamespace("namespace:root"), true);
  assert.throws(() => requireNamespaceId("namespace:10000000-0000-4000-8000-000000000001"), /semantic_namespace_identity_required/);
});

test("SQLite successor schema rejects malformed semantic Namespace paths at the storage boundary", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-namespace-schema-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = path.join(root, "schema.sqlite3");
  const schema = await readFile(new URL("../variants/sqlite/sql/schema-successor.sql", import.meta.url), "utf8");
  const binary = await selectSqliteBinary();
  await sqlite(binary, store, schema, { args: ["-batch", "-bail"] });
  await assert.rejects(
    () => sqlite(binary, store, "PRAGMA foreign_keys=OFF; INSERT INTO context_namespace_revisions VALUES('owner-revision:10000000-0000-4000-8000-000000000001','namespace:bad//path',1,NULL,'active','Bad','bad','[]',1,'2026-01-01T00:00:00.000Z');", { args: ["-batch", "-bail"] }),
    (error) => /constraint|SQLITE_CONSTRAINT/i.test(`${error.message} ${error.stderr ?? ""}`),
  );
});

test("migration proof identifies personal Namespace rather than relying on query order", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-namespace-proof-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = path.join(root, "legacy.sqlite3");
  const binary = await selectSqliteBinary();
  await sqlite(binary, store, `
    CREATE TABLE store_metadata (singleton INTEGER, schema_id TEXT, schema_version INTEGER);
    CREATE TABLE context_namespace_current (namespace_id TEXT, namespace_revision_id TEXT, lifecycle TEXT);
    CREATE TABLE context_namespace_revisions (namespace_revision_id TEXT, display_name TEXT, normalized_name TEXT);
    CREATE TABLE owners (owner_id TEXT, owner_kind TEXT);
    CREATE TABLE owner_current (owner_id TEXT, projection_json TEXT);
    INSERT INTO store_metadata VALUES(1,'casebook-persistence-sqlite-successor@1',1);
    INSERT INTO context_namespace_current VALUES('namespace:other','owner-revision:other','active');
    INSERT INTO context_namespace_current VALUES('namespace:personal','owner-revision:personal','active');
    INSERT INTO context_namespace_revisions VALUES('owner-revision:other','Other','other');
    INSERT INTO context_namespace_revisions VALUES('owner-revision:personal','Personal','personal');
    INSERT INTO owners VALUES('case:one','case');
    INSERT INTO owners VALUES('frame:two','frame');
    INSERT INTO owner_current VALUES('case:one','{"_mechanical_placement":{"namespace_id":"namespace:personal"}}');
    INSERT INTO owner_current VALUES('frame:two','{"_mechanical_placement":{"namespace_id":"namespace:personal"}}');
  `, { args: ["-batch", "-bail"] });
  const proofScript = path.resolve(new URL("../variants/sqlite/migrations/semantic-namespace-proof.mjs", import.meta.url).pathname);
  const result = await new Promise((resolve) => execFile(process.execPath, [proofScript, "--source", store], { encoding: "utf8" }, (error, stdout, stderr) => resolve({ error, stdout, stderr })));
  assert.equal(result.error, null, result.stderr);
  const proof = JSON.parse(result.stdout);
  assert.equal(proof.status, "proven");
  assert.deepEqual(proof.mapping, [{ from: "namespace:personal", to: "namespace:personal" }]);
  assert.equal(proof.preserved.current_aggregate_placements.every((item) => item.from_namespace === "namespace:personal"), true);
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
