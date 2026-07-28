import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const bin = path.join(root, "bin/casebook.mjs");
async function invoke(args, env = {}, entrypoint = bin) {
  return await new Promise((resolve) => execFile(process.execPath, [entrypoint, ...args], {
    env: { ...process.env, ...env }, maxBuffer: 2 * 1024 * 1024,
  }, (error, stdout, stderr) => resolve({ code: error?.code ?? 0, json: JSON.parse(stdout), stderr })));
}
async function fixture() { return mkdtemp(path.join(os.tmpdir(), "wi033-cli-")); }

const fakeBridge = `
let text=""; for await(const chunk of process.stdin) text+=chunk;
const request=JSON.parse(text), mode=process.env.CASEBOOK_FAKE_MODE;
const target={schema:"casebook-resolved-target@1",store_id:"store:00000000-0000-4000-8000-000000000001",workspace_id:"workspace:00000000-0000-4000-8000-000000000002",root_namespace_id:"namespace:00000000-0000-4000-8000-000000000003",admission_slot_id:"admission-slot:00000000-0000-4000-8000-000000000004",profile_selection_id:"profile-selection:00000000-0000-4000-8000-000000000005",profile_selection_revision_id:"owner-revision:00000000-0000-4000-8000-000000000006",profile_id:"profile:00000000-0000-4000-8000-000000000007",profile_revision_id:"owner-revision:00000000-0000-4000-8000-000000000008",activation_fence:1,observed_operation_fence:1};
if(request.operation==="target.describe"){process.stdout.write(JSON.stringify(mode==="target-contradiction"?{ok:true,result:null}:{ok:true,result:target}));}
else if(mode==="signal"){process.kill(process.pid,"SIGTERM");}
else if(mode==="malformed"){process.stdout.write("not-json");}
else if(mode==="overflow"){process.stdout.write("x".repeat(1048577));}
else if(mode==="timeout"){setTimeout(()=>{},60000);}
else if(mode==="contradictory"){process.stdout.write(JSON.stringify({ok:true,result:null}));}
`;

async function fakePackage(t) {
  const directory = await fixture();
  t.after(() => rm(directory, { recursive: true, force: true }));
  const packed = await new Promise((resolve, reject) => execFile("npm", ["pack", "--silent"], { cwd: root, encoding: "utf8" }, (error, stdout, stderr) => error ? reject(error) : resolve(stdout.trim().split(/\s+/).at(-1))));
  const archive = path.join(root, packed);
  await new Promise((resolve, reject) => execFile("tar", ["-xzf", archive, "-C", directory], (error, stdout, stderr) => error ? reject(error) : resolve()));
  await rm(archive, { force: true });
  const packageRoot = path.join(directory, "package");
  const bridgePath = path.join(packageRoot, "bridge", "persistence-bridge.mjs");
  await writeFile(bridgePath, fakeBridge);
  const metadataPath = path.join(packageRoot, "package.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  metadata.casebookCli.bridge.sha256 = createHash("sha256").update(await readFile(bridgePath)).digest("hex");
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`);
  return { directory, bin: path.join(packageRoot, "bin", "casebook.mjs") };
}

const mutationArgs = (workspace, store) => ["--workspace", workspace, "--store", store, "create", "case", "--commit-basis", "basis:synthetic", "--input", "{}"];

test("actual packaged entrypoint rejects grammar before authority resolution", async () => {
  const result = await invoke(["search"]);
  assert.equal(result.code, 1);
  assert.equal(result.json.schema, "casebook-cli-result@2");
  assert.equal(result.json.status, "refused");
  assert.equal(result.json.authority.status, "unresolved");
});

test("actual packaged entrypoint resolves an explicit non-Git workspace but does not create a missing store", async (t) => {
  const workspace = await fixture();
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const store = path.join(workspace, "missing.sqlite");
  const result = await invoke(["--workspace", workspace, "--store", store, "search", "--query", "hello"]);
  assert.equal(result.code, 2);
  assert.equal(result.json.authority.status, "workspace_resolved");
  assert.equal(result.json.authority.workspace, await import("node:fs/promises").then(({ realpath }) => realpath(workspace)));
  assert.equal(result.json.authority.store, null);
  assert.equal(result.json.failure.code, "store_unavailable");
});

test("unsafe consulted workspace settings refuses without falling through", async (t) => {
  const workspace = await fixture(), home = await fixture();
  t.after(async () => { await rm(workspace, { recursive: true, force: true }); await rm(home, { recursive: true, force: true }); });
  await mkdir(path.join(workspace, ".casebook"));
  await writeFile(path.join(workspace, ".casebook", "target.json"), "{}");
  await symlink(path.join(workspace, ".casebook", "target.json"), path.join(workspace, ".casebook", "settings.json"));
  const result = await invoke(["--workspace", workspace, "search", "--query", "hello"], { HOME: home, XDG_CONFIG_HOME: "", XDG_DATA_HOME: "" });
  assert.equal(result.code, 1);
  assert.equal(result.json.failure.code, "settings_unsafe");
  assert.equal(result.json.authority.status, "workspace_resolved");
});

test("schema-only workspace settings fall through to the XDG default", async (t) => {
  const workspace = await fixture(), home = await fixture(), data = await fixture();
  t.after(async () => { await rm(workspace, { recursive: true, force: true }); await rm(home, { recursive: true, force: true }); await rm(data, { recursive: true, force: true }); });
  await mkdir(path.join(workspace, ".casebook"));
  await writeFile(path.join(workspace, ".casebook", "settings.json"), '{"schema":"casebook-cli-settings@1"}');
  const result = await invoke(["--workspace", workspace, "search", "--query", "hello"], { HOME: home, XDG_CONFIG_HOME: path.join(home, "config"), XDG_DATA_HOME: data });
  assert.equal(result.code, 2);
  assert.equal(result.json.failure.code, "store_unavailable");
  assert.equal(result.json.authority.resolution_source, "xdg_default");
});

test("duplicate JSON settings keys refuse before target admission", async (t) => {
  const workspace = await fixture();
  t.after(() => rm(workspace, { recursive: true, force: true }));
  await mkdir(path.join(workspace, ".casebook"));
  await writeFile(path.join(workspace, ".casebook", "settings.json"), '{"schema":"casebook-cli-settings@1","store":"/tmp/a.sqlite","store":"/tmp/b.sqlite"}');
  const result = await invoke(["--workspace", workspace, "search", "--query", "hello"]);
  assert.equal(result.code, 1);
  assert.equal(result.json.failure.code, "json_duplicate_key");
  assert.equal(result.json.authority.status, "workspace_resolved");
});

test("duplicate aggregate keys refuse before bridge dispatch", async (t) => {
  const workspace = await fixture();
  t.after(() => rm(workspace, { recursive: true, force: true }));
  const result = await invoke(["--workspace", workspace, "--store", path.join(workspace, "missing.sqlite"), "create", "case", "--commit-basis", "basis", "--input", '{"id":"case:a","id":"case:b"}']);
  assert.equal(result.code, 1);
  assert.equal(result.json.failure.code, "json_duplicate_key");
  assert.equal(result.json.authority.status, "workspace_resolved");
});

test("explicit store short-circuits malformed lower precedence settings", async (t) => {
  const workspace = await fixture();
  t.after(() => rm(workspace, { recursive: true, force: true }));
  await mkdir(path.join(workspace, ".casebook"));
  await writeFile(path.join(workspace, ".casebook", "settings.json"), "not json");
  const result = await invoke(["--workspace", workspace, "--store", path.join(workspace, "missing.sqlite"), "search", "--query", "hello"]);
  assert.equal(result.code, 2);
  assert.equal(result.json.failure.code, "store_unavailable");
});

test("a contradictory target.describe never releases the selected store to the public authority", async (t) => {
  const fake = await fakePackage(t), workspace = path.join(fake.directory, "workspace");
  await mkdir(workspace);
  const selected = path.join(workspace, "candidate.sqlite");
  const result = await invoke(["--workspace", workspace, "--store", selected, "search", "--query", "hello"], { CASEBOOK_FAKE_MODE: "target-contradiction" }, fake.bin);
  assert.equal(result.code, 1);
  assert.equal(result.json.failure.code, "target_response_invalid");
  assert.equal(result.json.authority.status, "workspace_resolved");
  assert.equal(result.json.authority.store, null);
});

test("actual packaged entrypoint preserves a mutation reconciliation identity across bridge faults", { timeout: 90_000 }, async (t) => {
  const fake = await fakePackage(t), workspace = path.join(fake.directory, "workspace");
  await mkdir(workspace);
  for (const mode of ["signal", "malformed", "overflow", "timeout", "contradictory"]) {
    const store = path.join(workspace, `${mode}.sqlite`);
    await writeFile(store, "synthetic");
    const result = await invoke(mutationArgs(workspace, store), { CASEBOOK_FAKE_MODE: mode }, fake.bin);
    assert.equal(result.code, 3, `${mode}: ${result.stderr}\n${JSON.stringify(result.json)}`);
    assert.equal(result.json.status, "delivery_unknown", mode);
    assert.equal(result.json.authority.status, "target_admitted", mode);
    assert.equal(result.json.failure.evidence.commit_may_have_occurred, true, mode);
    assert.match(result.json.failure.evidence.operation_id, /^operation:[0-9a-f-]{36}$/, mode);
    assert.equal(result.json.failure.code, mode === "contradictory" ? "bridge_contradiction" : `bridge_${mode}`, mode);
  }
});
