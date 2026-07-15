import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const script = path.join(repoRoot, "scripts", "agents-os.mjs");

function runFixture(args, env) {
  return spawnSync(process.execPath, [script, "document-system-fixture", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

test("document-system fixture resolves its configured root and creates the complete proof checks", async () => {
  const workRoot = await mkdtemp(path.join(os.tmpdir(), "document-system-fixture-"));
  try {
    const init = runFixture(["init", "fixture-case", "--artifact", "review-brief", "--proof-case", "C6-explanation"], {
      AGENT_OS_DOCUMENT_SYSTEM_WORK_ROOT: workRoot,
    });
    assert.equal(init.status, 0, init.stderr);
    assert.equal(JSON.parse(init.stdout).workRoot, workRoot);

    const proofChecks = path.join(workRoot, "document-system", "proof-cases", "C6-explanation", "checks");
    await readFile(path.join(proofChecks, "fidelity-review.md"), "utf8");

    const inspect = runFixture(["inspect", "fixture-case", "--artifact", "review-brief", "--proof-case", "C6-explanation"], {
      AGENT_OS_DOCUMENT_SYSTEM_WORK_ROOT: workRoot,
    });
    assert.equal(inspect.status, 0, inspect.stderr);
    assert.equal(JSON.parse(inspect.stdout).status, "ok");
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }
});
