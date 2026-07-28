import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { graphRows } from "../variants/sqlite/lib/query/graph.mjs";
import { decodeCursor, encodeCursor, queryBinding } from "../variants/sqlite/lib/query/cursor.mjs";
import { SUPPORTED_OPERATIONS } from "../shared/protocol.mjs";
import { createBootstrapAuthorizationDocument } from "../variants/sqlite/lib/substrate/bootstrap.mjs";
import { sqlite } from "../variants/sqlite/lib/substrate/diagnostics.mjs";
import { cleanupSandbox, generateAndValidateSandbox } from "./sandbox-harness.mjs";

const id = (kind, n) => `${kind}:90000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function invoke(binary, cwd, request) { return new Promise((resolve) => { const child = execFile(process.execPath, [binary], { cwd, env: { ...process.env, HOME: cwd } }, (error, stdout, stderr) => resolve({ code: error ? 2 : 0, stderr, json: JSON.parse(stdout) })); child.stdin.end(`${JSON.stringify(request)}\n`); }); }
function profile() { return { schema: "admission-disclosure-profile@1", audience_ceiling: "private", lifecycle: "active", predecessor_revision_id: null, object_kinds: ["profile", "profile-selection"], purposes: ["profile.manage", "profile.read", "query.search"], bounds: { max_results: 10, max_traversal_depth: 8, max_export_bytes: 1000 }, projection: { locator: "redacted", export: "deny" }, disclosure: { receipts: true, events: true, checkpoints: true } }; }

async function initialize(binary, root, store, suffix) {
  const values = { store: id("store", suffix), workspace: id("workspace", suffix), namespace: "namespace:root", nsrev: id("owner-revision", suffix), nsversion: id("version", suffix), profile: id("profile", suffix), prev: id("owner-revision", suffix + 1), pversion: id("version", suffix + 1), selection: id("profile-selection", suffix), srev: id("owner-revision", suffix + 2), sversion: id("version", suffix + 2), slot: id("admission-slot", suffix), event: id("event", suffix) };
  const { successorDigest } = await import("../variants/sqlite/lib/substrate/mechanical-successor.mjs"), record = (owner_id, revision_id, version_id, content) => ({ owner_id, revision_id, version_id, content, content_digest: successorDigest(content) }), grant = path.join(root, `grant-${suffix}.json`);
  const request = { protocol: { id: "casebook-persistence-json", version: 2 }, request_version: 1, operation: "initialize_store", operation_id: `operation:wi024:${suffix}`, store_id: values.store,  authority_claim: { human_authorized: true, local_uid: process.getuid(), human_identity: "test", provenance: "test" }, initial: { root_namespace: record(values.namespace, values.nsrev, values.nsversion, { schema: "namespace-bootstrap@1", display_name: "Root", parent_id: null, lifecycle: "active" }), private_profile: record(values.profile, values.prev, values.pversion, profile()), profile_selection: record(values.selection, values.srev, values.sversion, { schema: "profile-selection@1", admission_slot_id: values.slot, selected_profile_id: values.profile, selected_profile_revision_id: values.prev, lifecycle: "active", activation_fence: 1 }), project_default: null, initialization_event_id: values.event }, configuration: { source: { kind: "test", locator: "wi024" }, authority_mode: "sqlite", sqlite: { database_url: store } } };
  const authorization = await createBootstrapAuthorizationDocument(request, { grant_path: grant }); request.request_digest = authorization.request_digest; request.bootstrap_authorization = { path: grant, sha256: authorization.sha256 }; await writeFile(grant, `${JSON.stringify(authorization.document)}\n`, { mode: 0o600 });
  const initialized = await invoke(binary, root, request); assert.equal(initialized.code, 0, initialized.stderr);
  return { protocol: request.protocol, configuration: request.configuration, store_id: values.store,  admission_slot_id: values.slot, admission: { kind: "sqlite_profile", binding: { selection_id: values.selection, selection_revision_id: values.srev, profile_id: values.profile, profile_revision_id: values.prev, activation_fence: 1 } } };
}

test("explicit graph material authorizes both endpoints before a deterministic cycle can be disclosed", () => {
  const a = id("knowledge", 1), b = id("knowledge", 2), hidden = id("knowledge", 3);
  const rows = [{ owner_id: id("case", 1), namespace_id: id("namespace", 1), documents_json: JSON.stringify([
    { resource_id: a, resource_kind: "knowledge" }, { resource_id: b, resource_kind: "knowledge" },
  ]), edges_json: JSON.stringify([
    { relationship_id: id("relationship", 2), source_resource_id: b, target: { kind: "knowledge", id: a }, predicate: "supports" },
    { relationship_id: id("relationship", 1), source_resource_id: a, target: { kind: "knowledge", id: b }, predicate: "supports" },
    { relationship_id: id("relationship", 3), source_resource_id: b, target: { kind: "knowledge", id: hidden }, predicate: "must-not-disclose" },
  ]) }];
  const graph = graphRows(rows);
  assert.equal(graph.nodes.size, 2);
  assert.deepEqual(graph.edges.map((edge) => edge.edge_id), [id("relationship", 1), id("relationship", 2)]);
  assert.equal(JSON.stringify(graph).includes(hidden), false);
});

test("graph query cursor binds every graph scope and fails on H/P/R change without exposing cursor fields", () => {
  const generations = { h: 1, p: 2, r: 3 }, secret = "a".repeat(64);
  const binding = queryBinding({ graph: "traverse", scope: "exact_namespace", namespace: "namespace:personal", start: { kind: "knowledge", id: id("knowledge", 1) } });
  const cursor = encodeCursor({ offset: 0, binding, generations, secret });
  assert.equal(typeof cursor, "string");
  assert.throws(() => decodeCursor(cursor, binding, { h: 1, p: 3, r: 3 }, secret), { code: "query_cursor_p_stale" });
  assert.throws(() => decodeCursor(cursor, `${binding}x`, generations, secret), { code: "query_cursor_mismatch" });
  assert.throws(() => decodeCursor(cursor, binding, generations, "b".repeat(64)), { code: "query_cursor_invalid" });
});

test("connector protocol admits only explicit graph and provider-local reconciliation operations", () => {
  for (const operation of ["graph.neighbors", "graph.traverse", "graph.path", "events.page", "query.snapshot_reconcile.begin", "query.snapshot_reconcile.page", "query.snapshot_reconcile.finish", "query.snapshot_reconcile.checkpoint"]) assert.equal(SUPPORTED_OPERATIONS.includes(operation), true);
  assert.equal(SUPPORTED_OPERATIONS.includes("graph.semantic"), false);
});

test("generated Pi, Codex, and OpenCode connectors retain opaque snapshot handoff, expiry, and closed admission", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wi024-generated-"));
  try {
    const generated = await generateAndValidateSandbox({ sandboxRoot: root });
    for (const [index, copy] of generated.results.entries()) {
      const binary = path.join(copy.package_root, "variants/sqlite/bin/casebook-persistence.mjs"), store = path.join(root, `${copy.target}.sqlite3`), base = await initialize(binary, root, store, 100 + index * 10);
      const begin = await invoke(binary, root, { ...base, operation: "query.snapshot_reconcile.begin" }); assert.equal(begin.code, 0, `${copy.target}: ${begin.stderr}`);
      const tampered = await invoke(binary, root, { ...base, operation: "query.snapshot_reconcile.page", snapshot_token: `${begin.json.result.snapshot_token}x`, cursor: begin.json.result.first_cursor }); assert.equal(tampered.json.failure.code, "reconcile_cursor_invalid"); assert.equal(JSON.stringify(tampered.json).includes("snapshot_id"), false);
      await sqlite(generated.sqlite_binary, store, "UPDATE reconciliation_snapshots SET expires_at='2000-01-01T00:00:00.000Z';", { args: ["-batch", "-bail"] });
      const expired = await invoke(binary, root, { ...base, operation: "query.snapshot_reconcile.page", snapshot_token: begin.json.result.snapshot_token, cursor: begin.json.result.first_cursor }); assert.equal(expired.json.failure.code, "snapshot_expired"); assert.equal(expired.json.result, undefined);
      const fresh = await invoke(binary, root, { ...base, operation: "query.snapshot_reconcile.begin" }), page = await invoke(binary, root, { ...base, operation: "query.snapshot_reconcile.page", snapshot_token: fresh.json.result.snapshot_token, cursor: fresh.json.result.first_cursor }); assert.equal(page.code, 0); const finish = await invoke(binary, root, { ...base, operation: "query.snapshot_reconcile.finish", snapshot_token: fresh.json.result.snapshot_token, completion_token: page.json.result.completion_token }); assert.equal(finish.code, 0); const events = await invoke(binary, root, { ...base, operation: "events.page", after_cursor: finish.json.result.event_cursor }); assert.equal(events.code, 0); const denied = await invoke(binary, root, { ...base, operation: "events.page", after_cursor: finish.json.result.event_cursor, admission: { kind: "sqlite_profile", binding: { ...base.admission.binding, activation_fence: 2 } } }); assert.equal(denied.json.failure.code, "profile_guard_denied");
    }
  } finally { assert.equal(await cleanupSandbox(root), true); await rm(root, { recursive: true, force: true }); }
});
