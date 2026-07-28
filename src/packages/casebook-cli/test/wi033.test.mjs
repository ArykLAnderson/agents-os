import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, lstat, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { packageCli } from "../build/package-assembly.mjs";
import { verifyPackageAssets } from "../lib/package-assets.mjs";

const root = path.resolve(import.meta.dirname, "..");
const providerRoot = path.resolve(root, "../../skills/casebook-persistence");
const duplicateRoot = path.join(root, "bridge", "runtime", "casebook-persistence");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const run = (file, args, options = {}) => new Promise((resolve, reject) => execFile(file, args, options, (error, stdout, stderr) => {
  if (error) return reject(Object.assign(error, { stdout, stderr }));
  resolve({ stdout, stderr });
}));
const missing = async (candidate) => await assert.rejects(lstat(candidate), { code: "ENOENT" });
const bin = path.join(root, "bin/casebook.mjs");
async function invoke(args, env = {}, executable = bin) {
  return await new Promise((resolve) => execFile(process.execPath, [executable, ...args], {
    env: { ...process.env, ...env }, maxBuffer: 2 * 1024 * 1024,
  }, (error, stdout, stderr) => resolve({ code: error?.code ?? 0, json: JSON.parse(stdout), stderr })));
}
async function packedBin(t) {
  const packed = await packageCli();
  t.after(() => packed.cleanup());
  return path.join(packed.assemblyRoot, "package", "bin", "casebook.mjs");
}
async function fixture() { return mkdtemp(path.join(os.tmpdir(), "wi033-cli-")); }

test("CLI rejects closed grammar before authority resolution", async (t) => {
  const result = await invoke(["search"], {}, await packedBin(t));
  assert.equal(result.code, 1);
  assert.equal(result.json.schema, "casebook-cli-result@2");
  assert.equal(result.json.status, "refused");
  assert.equal(result.json.authority.status, "unresolved");
});

test("CLI refuses unsafe and duplicate local input before target admission", async (t) => {
  const executable = await packedBin(t);
  const workspace = await fixture();
  t.after(() => rm(workspace, { recursive: true, force: true }));
  await mkdir(path.join(workspace, ".casebook"));
  await writeFile(path.join(workspace, ".casebook", "settings.json"), "not json");
  const malformed = await invoke(["--workspace", workspace, "search", "--query", "hello"], {}, executable);
  assert.equal(malformed.code, 1);
  assert.equal(malformed.json.failure.code, "json_invalid");
  const aggregate = await invoke(["--workspace", workspace, "--store", path.join(workspace, "missing.sqlite"), "create", "case", "--commit-basis", "basis", "--input", '{"id":"case:a","id":"case:b"}'], {}, executable);
  assert.equal(aggregate.code, 1);
  assert.equal(aggregate.json.failure.code, "json_duplicate_key");
  assert.equal(aggregate.json.authority.status, "workspace_resolved");
});

test("package assembly derives a self-contained manifest-pinned provider from canonical source without tracked runtime", async (t) => {
  const before = (await run("git", ["status", "--porcelain"], { cwd: root })).stdout;
  await missing(duplicateRoot);
  const packed = await packageCli();
  t.after(() => packed.cleanup());
  const packageDirectory = path.join(packed.assemblyRoot, "package");
  const packageMetadata = JSON.parse(await readFile(path.join(packageDirectory, "package.json"), "utf8"));
  assert.equal(packageMetadata.scripts.package, undefined);
  await missing(path.join(packageDirectory, "build"));
  const sourceManifest = await readFile(path.join(providerRoot, "manifest.json"));
  const assembledManifest = await readFile(path.join(packageDirectory, packageMetadata.casebookCli.provider.manifest));
  assert.deepEqual(assembledManifest, sourceManifest);
  assert.equal(digest(assembledManifest), packageMetadata.casebookCli.provider.manifest_sha256);
  const providerManifest = JSON.parse(sourceManifest);
  for (const asset of providerManifest.assets) {
    const source = await readFile(path.join(providerRoot, asset.path));
    const assembled = await readFile(path.join(packageDirectory, "bridge", "runtime", "casebook-persistence", asset.path));
    assert.equal(digest(source), asset.sha256, asset.path);
    assert.deepEqual(assembled, source, asset.path);
  }
  const verified = await verifyPackageAssets(packageDirectory);
  assert.deepEqual(verified.provider, packageMetadata.casebookCli.provider);
  assert.equal((await run("git", ["status", "--porcelain"], { cwd: root })).stdout, before);
});

test("failed package assembly cleans only its owned temporary path and leaves isolated HOME and config untouched", async (t) => {
  const sandbox = await fixture();
  const provider = path.join(sandbox, "provider");
  const home = path.join(sandbox, "home");
  const config = path.join(sandbox, "config");
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  await cp(providerRoot, provider, { recursive: true });
  await mkdir(config, { recursive: true });
  const sentinel = path.join(home, ".casebook", "sentinel");
  await mkdir(path.dirname(sentinel), { recursive: true });
  await writeFile(sentinel, "do not touch\n");
  await writeFile(path.join(provider, "shared", "config.mjs"), "tampered\n");
  let failedAssembly;
  await assert.rejects(packageCli({ providerRoot: provider, environment: { HOME: home, XDG_CONFIG_HOME: config } }), (error) => {
    assert.match(error.message, /package_assembly_invalid/);
    failedAssembly = error.temporaryRoot;
    return true;
  });
  assert.match(failedAssembly, /^\/tmp\/casebook-cli-package-/);
  await missing(failedAssembly);
  assert.equal(await readFile(sentinel, "utf8"), "do not touch\n");
  assert.deepEqual(await readFile(path.join(provider, "shared", "config.mjs"), "utf8"), "tampered\n");
});
