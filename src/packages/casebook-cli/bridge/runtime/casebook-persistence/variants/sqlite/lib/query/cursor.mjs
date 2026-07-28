import { createHmac, timingSafeEqual } from "node:crypto";
import { sqlite } from "../substrate/diagnostics.mjs";

const MAX_CURSOR_BYTES = 8192;
const object = (value) => value && typeof value === "object" && !Array.isArray(value);

export class QueryCursorError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function queryBinding(value) {
  // This digest is a non-secret request binding. Cursor integrity always uses
  // the store-local key below, never a public store identity or binding.
  return createHmac("sha256", "casebook-query-binding@1").update(JSON.stringify(value)).digest("hex");
}

export async function readStoreCursorSecret(binary, store) {
  const { stdout } = await sqlite(binary, store, "PRAGMA query_only=ON; SELECT secret_hex FROM reconciliation_cursor_keys WHERE singleton=1;", { args: ["-batch", "-bail", "-json"] });
  const row = JSON.parse(stdout || "[]")[0];
  if (!/^[0-9a-f]{64}$/.test(row?.secret_hex ?? "")) throw new QueryCursorError("query_cursor_key_unavailable", "The store-local cursor key is unavailable.");
  return row.secret_hex;
}
function integrity(payload, secret) { return createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex"); }

export function encodeCursor({ offset, binding, generations, secret }) {
  const payload = { v: 1, offset, binding, h: generations.h, p: generations.p, r: generations.r };
  return Buffer.from(JSON.stringify({ payload, integrity: integrity(payload, secret) }), "utf8").toString("base64url");
}

export function decodeCursor(value, binding, generations, secret) {
  if (value == null) return null;
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_CURSOR_BYTES) throw new QueryCursorError("query_cursor_invalid", "The organizational cursor is malformed or oversized.");
  let cursor;
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) throw new Error();
    cursor = JSON.parse(bytes.toString("utf8"));
  } catch { throw new QueryCursorError("query_cursor_invalid", "The organizational cursor is malformed or tampered."); }
  const p = cursor?.payload;
  const expected = object(p) && typeof secret === "string" ? integrity(p, secret) : "";
  if (!object(cursor) || !object(p) || Object.keys(cursor).sort().join(",") !== "integrity,payload"
    || Object.keys(p).sort().join(",") !== "binding,h,offset,p,r,v" || p.v !== 1
    || !Number.isSafeInteger(p.offset) || p.offset < 0 || ![p.h, p.p, p.r].every((n) => Number.isSafeInteger(n) && n >= 0)
    || typeof p.binding !== "string" || typeof cursor.integrity !== "string" || expected.length !== cursor.integrity.length
    || !timingSafeEqual(Buffer.from(expected), Buffer.from(cursor.integrity))) throw new QueryCursorError("query_cursor_invalid", "The organizational cursor is malformed or tampered.");
  if (p.binding !== binding) throw new QueryCursorError("query_cursor_mismatch", "The cursor does not bind this exact organizational query.");
  if (p.h !== generations.h) throw new QueryCursorError("query_cursor_h_stale", "The hierarchy generation advanced after this cursor was issued.");
  if (p.p !== generations.p) throw new QueryCursorError("query_cursor_p_stale", "The placement generation advanced after this cursor was issued.");
  if (p.r !== generations.r) throw new QueryCursorError("query_cursor_r_stale", "The resource generation advanced after this cursor was issued.");
  return p;
}
