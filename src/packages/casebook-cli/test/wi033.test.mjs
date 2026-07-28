import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const bin = path.join(root, "bin/casebook.mjs");
async function invoke(args, env = {}) {
  return await new Promise((resolve) => execFile(process.execPath, [bin, ...args], {
    env: { ...process.env, ...env }, maxBuffer: 2 * 1024 * 1024,
  }, (error, stdout, stderr) => resolve({ code: error?.code ?? 0, json: JSON.parse(stdout), stderr })));
}
async function fixture() { return mkdtemp(path.join(os.tmpdir(), "wi033-cli-")); }

test("CLI rejects closed grammar before authority resolution", async () => {
  const result = await invoke(["search"]);
  assert.equal(result.code, 1);
  assert.equal(result.json.schema, "casebook-cli-result@2");
  assert.equal(result.json.status, "refused");
  assert.equal(result.json.authority.status, "unresolved");
});

test("CLI refuses unsafe and duplicate local input before target admission", async (t) => {
  const workspace = await fixture();
  t.after(() => rm(workspace, { recursive: true, force: true }));
  await mkdir(path.join(workspace, ".casebook"));
  await writeFile(path.join(workspace, ".casebook", "settings.json"), "not json");
  const malformed = await invoke(["--workspace", workspace, "search", "--query", "hello"]);
  assert.equal(malformed.code, 1);
  assert.equal(malformed.json.failure.code, "json_invalid");
  const aggregate = await invoke(["--workspace", workspace, "--store", path.join(workspace, "missing.sqlite"), "create", "case", "--commit-basis", "basis", "--input", '{"id":"case:a","id":"case:b"}']);
  assert.equal(aggregate.code, 1);
  assert.equal(aggregate.json.failure.code, "json_duplicate_key");
  assert.equal(aggregate.json.authority.status, "workspace_resolved");
});
