import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadAndValidateManifest } from "../shared/manifest.mjs";
import { PROTOCOL_ID, PROTOCOL_VERSION, RESULT_ID, RESULT_VERSION, SCHEMA_ID, SCHEMA_VERSION, SELECTION_ID, SELECTION_VERSION, ORDINARY_CLI_OPERATIONS, success } from "../shared/protocol.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contracts = [
  `${SCHEMA_ID}@${SCHEMA_VERSION}`,
  `${SELECTION_ID}@${SELECTION_VERSION}`,
  `${PROTOCOL_ID}@${PROTOCOL_VERSION}`,
  `${RESULT_ID}@${RESULT_VERSION}`,
];

test("Candidate-4 v2 manifests advertise only the accepted shared contracts and retained endpoint boundary", async () => {
  const [source, runtime] = await Promise.all([
    readFile(path.join(packageRoot, "manifest.json"), "utf8").then(JSON.parse),
    readFile(path.join(packageRoot, "variants/sqlite/manifests/runtime.json"), "utf8").then(JSON.parse),
  ]);
  for (const manifest of [source, runtime]) {
    assert.deepEqual(manifest.protocol, { id: "casebook-persistence-json", version: 2, compatible_versions: [2] });
    assert.deepEqual(manifest.schema, { id: "sqlite_casebook", version: 2, compatible_versions: [2], store_initialization: "bootstrap-authorization@1" });
    assert.deepEqual(manifest.result, { id: "casebook-cli-result", version: 2 });
    assert.deepEqual(manifest.selection, { id: "casebook-resolved-target", version: 1, authority: "per-invocation resolved target admission only" });
    assert.deepEqual(manifest.ordinary_cli_capabilities, contracts);
    assert.deepEqual(Object.keys(manifest.ordinary_cli_capability_contracts), contracts);
    assert.deepEqual(manifest.ordinary_cli_operations, ORDINARY_CLI_OPERATIONS);
    for (const operation of ["case.create", "case.read", "frame.create", "frame.read", "query.search", "graph.neighbors", "query.snapshot_reconcile.checkpoint"])
      assert.equal(manifest.supported_operations.includes(operation), true, operation);
    assert.equal(JSON.stringify(manifest).includes("provider_local_organizational_lexical_query@1"), false);
    assert.equal(JSON.stringify(manifest).includes("provider_local_graph_reconciliation@1"), false);
  }
  const checked = await loadAndValidateManifest();
  assert.equal(checked.ok, true, checked.problems.join(", "));
});

test("Candidate-4 v2 terminal results name the accepted result contract", () => {
  assert.deepEqual(success("diagnose", { status: "available" }), {
    protocol: { id: "casebook-persistence-json", version: 2 },
    result_contract: { id: "casebook-cli-result", version: 2 },
    ok: true,
    operation: "diagnose",
    result: { status: "available" },
  });
});
