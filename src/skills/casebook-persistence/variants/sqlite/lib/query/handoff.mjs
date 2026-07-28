import { successorDigest } from "../substrate/mechanical-successor.mjs";

const MAX_HANDOFF_BYTES = 4096;
const object = (value) => value && typeof value === "object" && !Array.isArray(value);
export class QueryHandoffError extends Error { constructor(code, message) { super(message); this.code = code; } }

// A handoff is deliberately an opaque, compact identity reference. Search text,
// snippets, Profile handles, and authorization facts are never replayed from it.
export function encodeHandoff({ owner_id, owner_revision_id, resource_id, resource_kind, query_digest, generations }) {
  const payload = { v: 2, owner_id, owner_revision_id, resource_id, resource_kind, query_digest, h: generations?.h, p: generations?.p, r: generations?.r };
  return Buffer.from(JSON.stringify({ payload, integrity: successorDigest(payload) }), "utf8").toString("base64url");
}
export function decodeHandoff(value) {
  if (typeof value !== "string" || !value.length || value.length > MAX_HANDOFF_BYTES) throw new QueryHandoffError("query_handoff_invalid", "The compact handoff is malformed or oversized.");
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) throw new Error();
    const result = JSON.parse(bytes.toString("utf8")), p = result?.payload;
    if (!object(result) || !object(p) || Object.keys(result).sort().join(",") !== "integrity,payload"
      || Object.keys(p).sort().join(",") !== "h,owner_id,owner_revision_id,p,query_digest,r,resource_id,resource_kind,v"
      || p.v !== 2 || ![p.owner_id, p.owner_revision_id, p.resource_id, p.resource_kind, p.query_digest].every((item) => typeof item === "string" && item.length > 0)
      || ![p.h, p.p, p.r].every((item) => Number.isSafeInteger(item) && item >= 0)
      || result.integrity !== successorDigest(p)) throw new Error();
    return p;
  } catch { throw new QueryHandoffError("query_handoff_invalid", "The compact handoff is malformed or tampered."); }
}
