import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  appendPin, clearPin, emptyPins, parsePins, reorderPins, validateRegistry,
  resolveOfficialSession, planProjectActivation, reduceManagerState, renderManager,
} from "../lib/model.mjs";
import { atomicWriteJson, loadPins, savePins, transactionalPins } from "../lib/storage.mjs";

const route = { sessionName: "casebook-trial", configPath: "/home/a/.config/herdr/trials/casebook/config.toml", socketPath: "/tmp/casebook.sock", protocol: 17 };
const session = (canonicalId, projectCanonicalId, paneId, role = "interaction", generation = 1) => ({
  canonicalId, projectCanonicalId, generation, reconciliationState: "current", role,
  officialAgentSession: { source:"herdr:pi", agent: "pi", kind: "id", value: `${canonicalId}-official` },
  binding: { workspaceId: `w-${projectCanonicalId}`, tabId: `t-${canonicalId}`, paneId, terminalId: `term-${canonicalId}` },
});
const registry = {
  schemaVersion: 1, route,
  projects: [
    { canonicalId: "project-a", generation: 1, reconciliationState: "current", stewardSessionCanonicalId: "session-a-steward" },
    { canonicalId: "project-b", generation: 1, reconciliationState: "current", stewardSessionCanonicalId: "session-b-steward" },
  ],
  sessions: [session("session-a-steward", "project-a", "pane-a-s", "steward"), session("session-a-local", "project-a", "pane-a"), session("session-b-steward", "project-b", "pane-b-s", "steward"), session("session-b-local", "project-b", "pane-b")],
};
const agentFor = (record, overrides = {}) => ({
  name: `agent-${record.canonicalId}`, terminal_id: record.binding.terminalId,
  workspace_id: record.binding.workspaceId, tab_id: record.binding.tabId, pane_id: record.binding.paneId,
  agent_session: { ...record.officialAgentSession }, ...overrides,
});

test("append is first-free, full-safe, and idempotent", () => {
  let pins = emptyPins();
  let result = appendPin(pins, "project-a");
  assert.equal(result.status, "pinned"); assert.deepEqual(result.pins.slots, ["project-a", null, null, null]);
  assert.equal(appendPin(result.pins, "project-a").status, "existing");
  pins = { schemaVersion: 1, slots: ["a", "b", "c", "d"] };
  assert.equal(appendPin(pins, "e").status, "full");
});

test("pins reorder and clear while retaining four slots", () => {
  const pins = { schemaVersion: 1, slots: ["a", "b", "c", null] };
  assert.deepEqual(reorderPins(pins, 3, 1).slots, ["c", "a", "b", null]);
  assert.deepEqual(clearPin(pins, 2).slots, ["a", null, "c", null]);
});

test("pin and authoritative registry schemas fail closed", () => {
  assert.throws(() => parsePins({ schemaVersion: 2, slots: [] }), /schema/);
  assert.throws(() => parsePins({ schemaVersion: 1, slots: ["a"] }), /four/);
  assert.throws(() => validateRegistry({ ...registry, route: { ...route, sessionName: "wrong" } }), /casebook-trial/);
  assert.throws(() => validateRegistry({ ...registry, sessions: [{ ...registry.sessions[0], officialAgentSession: { source: "fake", agent: "pi", kind: "id", value: "x" } }] }), /official agent/);
});

test("registry allowlists only exact Pi and OpenCode official tuples", () => {
  const base = registry.sessions[0];
  const withOfficial = officialAgentSession => ({ ...registry, sessions: [{ ...base, officialAgentSession }] });
  assert.doesNotThrow(() => validateRegistry(withOfficial({ source: "herdr:pi", agent: "pi", kind: "path", value: "/tmp/pi.jsonl" })));
  assert.doesNotThrow(() => validateRegistry(withOfficial({ source: "herdr:opencode", agent: "opencode", kind: "id", value: "oc-session" })));
  for (const officialAgentSession of [
    { source: "herdr:pi", agent: "opencode", kind: "id", value: "x" },
    { source: "herdr:opencode", agent: "opencode", kind: "path", value: "/tmp/x" },
    { source: "herdr:opencode", agent: "opencode", kind: "id", value: "" },
    { source: "pi", agent: "pi", kind: "id", value: "x" },
  ]) assert.throws(() => validateRegistry(withOfficial(officialAgentSession)), /official agent|required/);
  assert.throws(() => validateRegistry({ ...registry, sessions: [{ ...base, officialPiSession: base.officialAgentSession }] }), /officialPiSession/);
});

test("registry rejects cross-canonical official-session and exact-binding collisions", () => {
  const original = registry.sessions[1];
  const alias = { ...structuredClone(original), canonicalId: "session-alias" };
  assert.throws(() => validateRegistry({ ...registry, sessions: [...registry.sessions, alias] }), /collision.*official agent/i);
  const bindingAlias = { ...structuredClone(original), canonicalId: "session-binding-alias", officialAgentSession: { ...original.officialAgentSession, value: "different-official" } };
  assert.throws(() => validateRegistry({ ...registry, sessions: [...registry.sessions, bindingAlias] }), /collision.*live binding/i);
});

test("official session resolution refuses missing, stale, duplicate, and locator mismatch", () => {
  const record = registry.sessions[1];
  assert.equal(resolveOfficialSession("session-a-local", registry, [agentFor(record)]).status, "unique");
  assert.equal(resolveOfficialSession("missing", registry, []).status, "missing");
  assert.equal(resolveOfficialSession("session-a-local", { ...registry, sessions: registry.sessions.map(s => s.canonicalId === "session-a-local" ? { ...s, reconciliationState: "stale" } : s) }, [agentFor(record)]).status, "stale");
  assert.equal(resolveOfficialSession("session-a-local", { ...registry, sessions: [...registry.sessions, structuredClone(record)] }, [agentFor(record)]).status, "ambiguous");
  assert.equal(resolveOfficialSession("session-a-local", registry, [agentFor(record, { pane_id: "other" })]).status, "stale");
});

test("same-project activation selects Steward; other project selects last human representation", () => {
  const agents = registry.sessions.map(agentFor);
  assert.equal(planProjectActivation({ targetProjectCanonicalId: "project-a", currentSessionCanonicalId: "session-a-local", registry, agents, history: { schemaVersion: 1, projects: {} } }).canonicalSessionId, "session-a-steward");
  assert.equal(planProjectActivation({ targetProjectCanonicalId: "project-b", currentSessionCanonicalId: "session-a-local", registry, agents, history: { schemaVersion: 1, projects: { "project-b": "session-b-local" } } }).canonicalSessionId, "session-b-local");
  assert.equal(planProjectActivation({ targetProjectCanonicalId: "project-b", currentSessionCanonicalId: "session-a-local", registry, agents, history: { schemaVersion: 1, projects: {} } }).status, "missing-history");
});

test("manager renders four states, reorders, clears, and exits", () => {
  const pins = { schemaVersion: 1, slots: ["session-a-local", "gone", null, null] };
  const output = renderManager("local", pins, registry);
  assert.match(output, /1 .*session-a-local.*current/); assert.match(output, /2 .*gone.*unavailable/); assert.match(output, /3 .*empty/); assert.match(output, /4 .*empty/);
  let state = { selected: 1, pins, exit: false };
  state = reduceManagerState(state, "down"); assert.equal(state.selected, 2);
  state = reduceManagerState(state, "move-up"); assert.deepEqual(state.pins.slots.slice(0, 2), ["gone", "session-a-local"]);
  state = reduceManagerState(state, "clear"); assert.equal(state.pins.slots[0], null);
  assert.equal(reduceManagerState(state, "exit").exit, true);
});

test("atomic persistence round-trips and leaves no temp file", async () => {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), "aryk-pins-"));
  const file = path.join(root, "project-pins.json");
  const pins = appendPin(emptyPins(), "project-a").pins;
  await savePins(file, pins);
  assert.deepEqual(await loadPins(file), pins);
  assert.deepEqual((await fs.readdir(root)).sort(), ["project-pins.json"]);
  await atomicWriteJson(file, { schemaVersion: 1, slots: ["project-b", null, null, null] });
  assert.equal((await loadPins(file)).slots[0], "project-b");
});

test("serialized concurrent appends have no lost update and leave no lock", async () => {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), "aryk-pins-lock-"));
  const file = path.join(root, "local-pins.json");
  await Promise.all(["session-a", "session-b"].map(canonicalId => transactionalPins(file, async pins => {
    await new Promise(resolve => setTimeout(resolve, 10));
    const result = appendPin(pins, canonicalId);
    return { pins: result.pins, result };
  })));
  assert.deepEqual(new Set((await loadPins(file)).slots.slice(0, 2)), new Set(["session-a", "session-b"]));
  assert.deepEqual((await fs.readdir(root)).sort(), ["local-pins.json"]);
});

test("pre-existing lock fails closed and is never deleted as stale", async () => {
  const root = await fs.mkdtemp(path.join(await fs.realpath(os.tmpdir()), "aryk-pins-stale-lock-"));
  const file = path.join(root, "project-pins.json"); const lock = `${file}.lock`;
  await fs.writeFile(lock, "unowned");
  await assert.rejects(transactionalPins(file, async pins => ({ pins, result: null }), { attempts: 1 }), /lock unavailable/);
  assert.equal(await fs.readFile(lock, "utf8"), "unowned");
});

test("state writes and reads refuse a symlinked parent", async () => {
  const realTmp = await fs.realpath(os.tmpdir());
  const root = await fs.mkdtemp(path.join(realTmp, "aryk-pins-symlink-"));
  const outside = await fs.mkdtemp(path.join(realTmp, "aryk-pins-outside-"));
  await fs.symlink(outside, path.join(root, "linked"));
  const file = path.join(root, "linked", "project-pins.json");
  await assert.rejects(savePins(file, emptyPins()), /symlink/i);
  await fs.writeFile(path.join(outside, "project-pins.json"), JSON.stringify(emptyPins()));
  await assert.rejects(loadPins(file), /symlink/i);
});
