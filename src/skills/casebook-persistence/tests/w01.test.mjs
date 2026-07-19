import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateAuthorityConfiguration } from "../shared/config.mjs";
import { loadAndValidateManifest } from "../shared/manifest.mjs";
import { nodeRuntimeIncompatibility } from "../variants/sqlite/lib/substrate/diagnostics.mjs";
import { cleanupSandbox, generateAndValidateSandbox, SOURCE_PACKAGE_ROOT } from "./sandbox-harness.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("manifest validates all canonical runtime asset bytes and compatibility identities", async () => {
  const check = await loadAndValidateManifest();
  assert.equal(check.ok, true, check.problems.join(", "));
  assert.equal(check.manifest.assets.length, 16);
  assert.deepEqual(check.manifest.supported_operations, [
    "diagnose",
    "initialize_store",
    "get_store_operation_receipt",
  ]);
  assert.equal(check.manifest.schema.store_initialization, "explicit_human_authorized");
  assert.equal(check.manifest.assets.some((asset) => asset.path.includes("internal-mechanical-driver")), false);
});

test("diagnostics reject an older simulated Node.js runtime with classified version evidence", async () => {
  const result = nodeRuntimeIncompatibility({ path: "/synthetic/node", version: "21.7.3" });
  assert.equal(result.ok, false);
  assert.equal(result.failure.class, "runtime_incompatible");
  assert.equal(result.failure.code, "node_runtime_unsupported");
  assert.deepEqual(result.failure.evidence.selected, { path: "/synthetic/node", version: "21.7.3" });
  assert.deepEqual(result.failure.evidence.required, { version: ">=22.0.0" });
});

test("authority configuration selects exactly one mode and rejects relative or dual authority", () => {
  const sqlite = validateAuthorityConfiguration({
    source: { kind: "test", locator: "synthetic" },
    authority_mode: "sqlite",
    sqlite: { database_url: "/tmp/synthetic-casebook.sqlite3", sqlite_bin: "/tmp/sqlite3" },
  });
  assert.equal(sqlite.authority_mode, "sqlite");
  assert.throws(() => validateAuthorityConfiguration({
    source: { kind: "test", locator: "synthetic" },
    authority_mode: "sqlite",
    sqlite: { database_url: "relative.sqlite3" },
    markdown: { workspace_root: "/tmp/markdown" },
  }), { code: "dual_authority_rejected" });
  assert.throws(() => validateAuthorityConfiguration({
    source: { kind: "test", locator: "synthetic" },
    authority_mode: "markdown",
    markdown: { workspace_root: "relative" },
  }), { code: "relative_path_rejected" });
});

test("module direction remains private and substrate owner-neutral", async () => {
  const substrate = await readFile(path.join(packageRoot, "variants/sqlite/lib/substrate/index.mjs"), "utf8");
  assert.doesNotMatch(substrate, /lib\/(case|frame)|\.\.\/(case|frame)/);
  for (const owner of ["case", "frame"]) {
    const source = await readFile(path.join(packageRoot, `variants/sqlite/lib/${owner}/index.mjs`), "utf8");
    assert.match(source, /shared\/protocol\.mjs/);
    assert.match(source, /substrate\/index\.mjs/);
  }
  const operations = await readFile(path.join(packageRoot, "variants/sqlite/lib/operations/index.mjs"), "utf8");
  assert.doesNotMatch(operations, /lib\/(case|frame)|\.\.\/(case|frame)/);
  const entrypoint = await readFile(path.join(packageRoot, "variants/sqlite/bin/casebook-persistence.mjs"), "utf8");
  assert.match(entrypoint, /operations\/index/);
  assert.doesNotMatch(entrypoint, /mechanical|commit_owner_revision|read_owner_current|get_owner_operation_receipt/);
});

test("human installation guidance is not referenced or embedded by model-loaded files", async () => {
  const install = await readFile(path.join(packageRoot, "INSTALL.md"), "utf8");
  const modelLoaded = [path.join(packageRoot, "SKILL.md")];
  const references = path.join(packageRoot, "references");
  for (const entry of await readdir(references).catch(() => [])) modelLoaded.push(path.join(references, entry));
  for (const file of modelLoaded) {
    const content = await readFile(file, "utf8");
    assert.doesNotMatch(content, /INSTALL\.md/i);
    assert.equal(content.includes(install), false);
  }
});

test("sandboxed Pi, Codex, and OpenCode layouts validate from unrelated cwd and clean up", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-w01-test-"));
  try {
    const report = await generateAndValidateSandbox({ sandboxRoot: sandbox });
    assert.equal(path.isAbsolute(report.sqlite_binary), true);
    assert.equal(report.results.length, 3);
    assert.deepEqual(report.results.map((result) => result.target).sort(), ["codex", "opencode", "pi"]);
    for (const result of report.results) {
      assert.equal(result.diagnostic, "passed");
      assert.equal(result.unsupported_later_operation, "passed");
      assert.equal(result.generic_mechanical_operation_rejected, "passed");
      assert.equal(result.configured_store_created, false);
      assert.equal(result.source_fallback, false);
    }
    assert.equal(SOURCE_PACKAGE_ROOT.startsWith(sandbox), false);
  } finally {
    assert.equal(await cleanupSandbox(sandbox), true);
  }
  assert.equal(await stat(sandbox).then(() => true).catch(() => false), false);
});
