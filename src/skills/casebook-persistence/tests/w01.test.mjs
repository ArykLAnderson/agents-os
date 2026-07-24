import assert from "node:assert/strict";
import test from "node:test";
import { loadAndValidateManifest } from "../shared/manifest.mjs";

test("manifest verifies the hard-cutover runtime package", async () => {
  const check = await loadAndValidateManifest();
  assert.equal(check.ok, true, check.problems.join(", "));
  assert.deepEqual(check.manifest.schema.compatible_versions, [3]);
  assert.equal(check.manifest.assets.some((asset) => asset.id === "sqlite-migration-v2"), false);
  assert.equal(check.manifest.assets.some((asset) => asset.id === "sqlite-migration-v3"), true);
  assert.equal(check.manifest.implemented_slice_constraints.migration_execution.includes("1 to 3"), true);
});
