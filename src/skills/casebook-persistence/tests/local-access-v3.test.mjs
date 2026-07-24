import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalCommitRequestDigest } from "../variants/sqlite/lib/substrate/mechanical.mjs";
import { invokeCaseOperation } from "../variants/sqlite/lib/case/index.mjs";

test("semantic commit digest excludes retired view context", () => {
  const envelope = { envelope_version: 1, operation_id: "operation:test", store_id: "store:11111111-1111-4111-8111-111111111111", request_digest: "0".repeat(64) };
  const withoutContext = canonicalCommitRequestDigest(envelope.store_id, null, envelope);
  const withLegacyContext = canonicalCommitRequestDigest(envelope.store_id, { view_id: "view:11111111-1111-4111-8111-111111111111" }, envelope);
  assert.equal(withoutContext, withLegacyContext);
});

test("ordinary Case requests reject retired context rather than accepting a visibility policy", async () => {
  const result = await invokeCaseOperation({
    protocol: { id: "casebook-persistence-json", version: 1 }, operation: "case.read", request_version: 1,
    store_id: "store:11111111-1111-4111-8111-111111111111", case_id: "case:11111111-1111-4111-8111-111111111111",
    context: { view_id: "view:11111111-1111-4111-8111-111111111111" }, configuration: {},
  });
  assert.equal(result.ok, false);
  assert.equal(result.failure.code, "case.invalid_representation");
});
