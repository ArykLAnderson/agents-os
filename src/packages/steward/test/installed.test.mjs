import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { packageSteward } from "../build/package-assembly.mjs";

const run = (file, args, options = {}, input = "") => new Promise((resolve, reject) => {
  const child = execFile(file, args, { maxBuffer: 1024 * 1024, ...options }, (error, stdout, stderr) => {
    if (error && error.code !== 0) return resolve({ code: error.code, stdout, stderr });
    if (error) return reject(error);
    resolve({ code: 0, stdout, stderr });
  });
  child.stdin.end(input);
});

test("the packed Steward facade installs and serves custody from an unrelated cwd", async (t) => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "steward-installed-"));
  t.after(() => rm(sandbox, { recursive: true, force: true }));
  const archive = await packageSteward();
  await writeFile(path.join(sandbox, "package.json"), '{"name":"consumer","private":true}\n');
  const installed = await run(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--ignore-scripts", archive], { cwd: sandbox });
  assert.equal(installed.code, 0, installed.stderr);
  const bin = path.join(sandbox, "node_modules", ".bin", "steward");
  const store = path.join(sandbox, "disposable-store.json");
  const invoke = async (request) => {
    const result = await run(bin, [], { cwd: path.join(os.tmpdir(), ".."), env: { ...process.env, STEWARD_STORE: store } }, `${JSON.stringify(request)}\n`);
    return { ...result, body: JSON.parse(result.stdout) };
  };
  const identity = await invoke({ operation: "identity.resolve" });
  assert.equal(identity.code, 0);
  const capabilities = await invoke({ operation: "capabilities" });
  assert.deepEqual(capabilities.body.result.groups, ["identity", "spaces", "intakes", "matters"]);
  const packageJson = JSON.parse(await readFile(path.join(sandbox, "node_modules", "@agents-os", "steward", "package.json"), "utf8"));
  assert.equal(packageJson.name, "@agents-os/steward");
});
