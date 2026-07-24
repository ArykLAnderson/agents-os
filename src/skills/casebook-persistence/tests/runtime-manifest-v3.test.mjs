import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("SQLite runtime manifest admits ordinary schema-v3 local access", async () => {
  const manifest = JSON.parse(await readFile(path.join(packageRoot, "variants/sqlite/manifests/runtime.json"), "utf8"));
  assert.deepEqual(manifest.schema, {
    id: "casebook-persistence-sqlite",
    version: 3,
    compatible_versions: [3],
    store_initialization: "explicit_human_authorized",
  });
  assert.ok(manifest.supported_operations.includes("case.read"));
  assert.ok(manifest.supported_operations.includes("frame.list"));
  assert.ok(manifest.supported_operations.includes("common.search"));
  assert.equal(manifest.supported_operations.includes("export.preflight"), false);
  assert.equal(manifest.supported_operations.includes("events.page"), false);
  assert.equal(JSON.stringify(manifest).includes("view_policy"), false);
  assert.equal(manifest.implemented_slice_constraints.migration_execution.includes("1 to 3"), true);
});
