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
  assert.deepEqual(capabilities.body.result.groups, ["identity", "spaces", "intakes", "matters", "portfolio", "orientation", "acknowledgement", "owner-boundaries", "implementation-admission"]);
  const unavailableBinding = await invoke({ operation: "owner.bindings.focus", binding_id: "binding:absent" });
  assert.equal(unavailableBinding.code, 2);
  assert.equal(unavailableBinding.body.failure.code, "interaction_binding_unavailable");
  const unavailableBindingCreate = await invoke({ operation: "owner.bindings.create", purpose: "orientation", focus: { kind: "space", space_id: "space:installed" }, artifact: { id: "frame:installed", revision: "frame-revision:one" } });
  assert.equal(unavailableBindingCreate.code, 2);
  assert.equal(unavailableBindingCreate.body.failure.code, "interaction_binding_unavailable");
  const unavailableBindingResolve = await invoke({ operation: "owner.bindings.resolve", binding_id: "binding:absent" });
  assert.equal(unavailableBindingResolve.code, 2);
  assert.equal(unavailableBindingResolve.body.failure.code, "interaction_binding_unavailable");
  const unavailableDirective = await invoke({ operation: "owner.directives.authorize", envelope: { outcome: "test", repository: "repo", path: "path", base: "base", delivery_shape: "single_pr", routine_mechanics: [], absent_operations: [], invalidators: [], atlas: { map_id: "FM-003", decision_id: "D" }, authority: { kind: "ordinary", id: "approval:test" }, effect_bindings: [{ effect: "local-test", binding: "approval:test" }] } });
  assert.equal(unavailableDirective.code, 2);
  assert.equal(unavailableDirective.body.failure.code, "standing_directive_unavailable");
  const unavailableAdmission = await invoke({ operation: "implementation.admission.submit", envelope: { outcome: "test", repository: "repo", path: "path", base: "base", delivery_shape: "single_pr", routine_mechanics: [], absent_operations: [], invalidators: [], atlas: { map_id: "FM-003", decision_id: "D" }, authority: { kind: "ordinary", id: "approval:test" }, effect_bindings: [{ effect: "local-test", binding: "approval:test" }] }, envelope_digest: "not-a-real-digest" });
  assert.equal(unavailableAdmission.code, 2);
  assert.equal(unavailableAdmission.body.failure.code, "software_implementation_unavailable");
  const space = await invoke({ operation: "spaces.create", expected_directory_revision: identity.body.result.directory.revision, space: { id: "space:installed", name: "Installed" } });
  const capture = await invoke({ operation: "intakes.capture", replay_key: "installed:portfolio", content: "Verify installed orientation", provenance: { source: "consumer" }, space_id: "space:installed", expected_space_revision: space.body.result.space.revision, relevance_reason: "Installed consumer proof", owner_references: [{ kind: "frame", id: "frame:installed" }] });
  const viewRequest = { scope: { kind: "global" }, observations: [{ id: "observation:installed", matter_id: capture.body.result.matter.id, owner: { kind: "frame", id: "frame:installed" }, artifact: { id: "frame:installed", revision: "frame-revision:1" }, represented_revision: "frame-revision:1", currentness: "current", observed_at: "2026-08-06T00:00:00.000Z", condition: "current", limitations: [] }] };
  const portfolio = await invoke({ operation: "portfolio.compose", ...viewRequest });
  assert.equal(portfolio.code, 0);
  const acknowledgement = await invoke({ operation: "portfolio.acknowledge", view_id: portfolio.body.result.view.id, view_request: viewRequest, expected_baseline_revision: 0 });
  assert.equal(acknowledgement.code, 2);
  assert.equal(acknowledgement.body.failure.code, "view_reobservation_unavailable");
  const packageJson = JSON.parse(await readFile(path.join(sandbox, "node_modules", "@agents-os", "steward", "package.json"), "utf8"));
  assert.equal(packageJson.name, "@agents-os/steward");
});
