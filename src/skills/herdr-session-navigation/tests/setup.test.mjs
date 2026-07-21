import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runSetup } from "../setup.mjs";

async function absent(target) {
  try { await access(target); return false; } catch { return true; }
}

test("dry run writes nothing and reports live paths as untouched", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "herdr-setup-"));
  const destination = path.join(root, "stage");
  const plan = await runSetup({ apply: false, destination, herdrPath: null }, { HOME: path.join(root, "home") });
  assert.equal(plan.mode, "dry-run");
  assert.equal(await absent(destination), true);
  assert.match(plan.liveConfigUntouched, /herdr\/trials\/casebook\/config.toml$/);
});

test("explicit apply copies only into an existing real staging directory", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "herdr-setup-"));
  const destination = path.join(root, "stage");
  await mkdir(destination);
  const env = { HOME: path.join(root, "home"), XDG_STATE_HOME: path.join(root, "state") };
  await runSetup({ apply: true, destination, herdrPath: null }, env);
  const output = path.join(destination, "config.toml");
  assert.match(await readFile(output, "utf8"), /resume_agents_on_restore = false/);
  await assert.rejects(() => runSetup({ apply: true, destination, herdrPath: null }, env), /unmanaged existing file/);
  await assert.rejects(() => runSetup({ apply: true, destination: path.join(root, "missing"), herdrPath: null }, env), /existing non-symlink/);
});

test("apply refuses direct and symlink aliases of live config/state roots", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "herdr-setup-"));
  const home = path.join(root, "home");
  const configRoot = path.join(home, ".config/herdr/trials/casebook");
  const stateRoot = path.join(home, ".local/state/agent-os/herdr-trials/casebook");
  await mkdir(configRoot, { recursive: true });
  await mkdir(stateRoot, { recursive: true });
  const env = { HOME: home };
  await assert.rejects(() => runSetup({ apply: true, destination: configRoot, herdrPath: null }, env), /must not be a live/);
  await assert.rejects(() => runSetup({ apply: true, destination: stateRoot, herdrPath: null }, env), /must not be a live/);

  const alias = path.join(root, "outside-looking-stage");
  await symlink(configRoot, alias, "dir");
  await assert.rejects(() => runSetup({ apply: true, destination: alias, herdrPath: null }, env), /must not be a live/);
  assert.equal(await absent(path.join(configRoot, "config.toml")), true);

  const aliasParent = path.join(root, "alias-parent");
  await symlink(path.dirname(configRoot), aliasParent, "dir");
  const nested = path.join(aliasParent, "casebook");
  await assert.rejects(() => runSetup({ apply: true, destination: nested, herdrPath: null }, env), /must not be a live/);
  assert.equal(await absent(path.join(configRoot, "config.toml")), true);
});

test("unmanaged staging content is left untouched", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "herdr-setup-"));
  const destination = path.join(root, "stage");
  await mkdir(destination);
  await writeFile(path.join(destination, "sentinel"), "unchanged");
  await runSetup({ apply: true, destination, herdrPath: null }, { HOME: path.join(root, "home") });
  assert.equal(await readFile(path.join(destination, "sentinel"), "utf8"), "unchanged");
});
