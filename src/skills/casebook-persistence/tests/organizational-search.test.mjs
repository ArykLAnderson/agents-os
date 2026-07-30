import assert from "node:assert/strict";
import test from "node:test";
import { decodeCursor, encodeCursor, queryBinding } from "../variants/sqlite/lib/query/cursor.mjs";
import { decodeHandoff, encodeHandoff } from "../variants/sqlite/lib/query/handoff.mjs";

const id = (kind, n) => `${kind}:80000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const binding = queryBinding({ scope: "subtree", namespace_id: id("namespace", 1), terms: ["needle"], tags: [{ key: "phase", value: "current" }], limit: 25, order: "organizational@1" });
const generations = { h: 3, p: 7, r: 11 };

test("organizational@1 cursor is opaque, exact-query-bound, and reports typed H/P/R staleness without a restart", () => {
  const secret = "c".repeat(64), cursor = encodeCursor({ offset: 25, binding, generations, secret });
  assert.deepEqual(decodeCursor(cursor, binding, generations, secret), { v: 1, offset: 25, binding, h: 3, p: 7, r: 11 });
  assert.throws(() => decodeCursor(cursor, `${binding}x`, generations, secret), { code: "query_cursor_mismatch" });
  assert.throws(() => decodeCursor(cursor, binding, { h: 4, p: 7, r: 11 }, secret), { code: "query_cursor_h_stale" });
  assert.throws(() => decodeCursor(cursor, binding, { h: 3, p: 8, r: 11 }, secret), { code: "query_cursor_p_stale" });
  assert.throws(() => decodeCursor(cursor, binding, { h: 3, p: 7, r: 12 }, secret), { code: "query_cursor_r_stale" });
  assert.throws(() => decodeCursor(`${cursor}!`, binding, generations, secret), { code: "query_cursor_invalid" });
});

test("large disposable corpus handoffs are compact identity-only H/P/R-bound handles and reject tampering", () => {
  const corpus = Array.from({ length: 10_000 }, (_, index) => encodeHandoff({
    owner_id: id("case", index + 1), owner_revision_id: id("owner-revision", index + 1),
    resource_id: id("knowledge", index + 1), resource_kind: "knowledge", query_digest: "a".repeat(64), generations,
  }));
  assert.equal(corpus.length, 10_000);
  const decoded = decodeHandoff(corpus[9_999]);
  assert.deepEqual(decoded, { v: 2, owner_id: id("case", 10_000), owner_revision_id: id("owner-revision", 10_000), resource_id: id("knowledge", 10_000), resource_kind: "knowledge", query_digest: "a".repeat(64), h: 3, p: 7, r: 11 });
  assert.equal(corpus[0].includes("needle"), false, "handoffs do not carry snippets or query text");
  assert.throws(() => decodeHandoff(`${corpus[0]}!`), { code: "query_handoff_invalid" });
});
