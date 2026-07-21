import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const agentOs = path.resolve(root, "../../..");
const expected = new Map([
  ["prefix+h", "aryk.pins.pin-project"], ["prefix+H", "aryk.pins.manage-projects"],
  ["prefix+t", "aryk.pins.pin-local"], ["prefix+T", "aryk.pins.manage-locals"],
  ["alt+j", "aryk.pins.activate-project-1"], ["alt+k", "aryk.pins.activate-project-2"],
  ["alt+l", "aryk.pins.activate-project-3"], ["alt+;", "aryk.pins.activate-project-4"],
  ["alt+m", "aryk.pins.activate-local-1"], ["alt+,", "aryk.pins.activate-local-2"],
  ["alt+.", "aryk.pins.activate-local-3"], ["alt+/", "aryk.pins.activate-local-4"],
]);
function commandBlocks(content) { return content.split("[[keys.command]]").slice(1).map(block => block.split("[[")[0]); }
function quoted(block, key) { return new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m").exec(block)?.[1]; }

test("both portable configs contain exactly the collision-free described key contract", () => {
  const files = [path.join(agentOs, "src/skills/herdr-session-navigation/examples/config.toml"), "/Users/aryk/.config/herdr/trials/casebook/config.toml"];
  for (const file of files) {
    const blocks = commandBlocks(fs.readFileSync(file, "utf8"));
    const keys = blocks.map(block => quoted(block, "key"));
    assert.equal(new Set(keys).size, keys.length, `${file} has a key collision`);
    const plugin = blocks.filter(block => quoted(block, "command")?.startsWith("aryk.pins."));
    assert.equal(plugin.length, 12);
    for (const block of plugin) {
      const key = quoted(block, "key");
      assert.equal(quoted(block, "type"), "plugin_action");
      assert.equal(quoted(block, "command"), expected.get(key));
      assert.ok(quoted(block, "description")?.trim());
    }
  }
});

test("manifest declares source-attested minimum, twelve actions, and popup panes", () => {
  const content = fs.readFileSync(path.join(root, "herdr-plugin.toml"), "utf8");
  assert.match(content, /1f2487554b9fd42118f9e99ee06eb558bbb2391f/);
  assert.match(content, /^min_herdr_version = "0\.7\.4"$/m);
  const actions = content.split("[[actions]]").slice(1).map(block => block.split("[[")[0]);
  assert.equal(actions.length, 12);
  assert.equal(new Set(actions.map(block => quoted(block, "id"))).size, 12);
  assert.ok(actions.every(block => quoted(block, "description")?.trim() && /command = \["node", "index\.mjs"/.test(block)));
  const panes = content.split("[[panes]]").slice(1).map(block => block.split("[[")[0]);
  for (const id of ["project-manager", "local-manager", "result"]) {
    const pane = panes.find(block => quoted(block, "id") === id);
    assert.ok(pane); assert.equal(quoted(pane, "placement"), "popup"); assert.ok(quoted(pane, "description")?.trim());
  }
  const events = content.split("[[events]]").slice(1).map(block => block.split("[[")[0]);
  assert.equal(events.length, 1); assert.equal(quoted(events[0], "on"), "pane.focused");
  assert.match(events[0], /command = \["node", "index\.mjs", "event", "pane\.focused"\]/);
  assert.doesNotMatch(content, /\[\[(startup|build)\]\]/);
});

test("docs record intentional default displacement and example uses named-session API socket", () => {
  const skillReadme = fs.readFileSync(path.join(agentOs, "src/skills/herdr-session-navigation/README.md"), "utf8");
  const dotfilesReadme = fs.readFileSync("/Users/aryk/.config/herdr/trials/casebook/README.md", "utf8");
  assert.match(skillReadme, /override Herdr's defaults for swap-left and rename-tab/);
  assert.match(dotfilesReadme, /displace Herdr's default swap-left and rename-tab/);
  const fixture = JSON.parse(fs.readFileSync(path.join(root, "examples/registry.example.json"), "utf8"));
  assert.match(fixture.route.socketPath, /\/casebook-trial\/herdr\.sock$/);
});

test("plugin model imports after relocation without files outside plugin root", async () => {
  const destination = fs.mkdtempSync(path.join(os.tmpdir(), "aryk-pins-relocated-"));
  fs.cpSync(root, path.join(destination, "aryk.pins"), { recursive: true });
  const relocated = path.join(destination, "aryk.pins");
  const model = await import(`${pathToFileURL(path.join(relocated, "lib/model.mjs")).href}?relocated=1`);
  assert.deepEqual(model.emptyPins().slots, [null, null, null, null]);
});
