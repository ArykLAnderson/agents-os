import test from "node:test";
import assert from "node:assert/strict";
import { createHerdrClient, parseAgentListResponse, parseFocusResponse } from "../lib/herdr-client.mjs";
import { handlePaneFocusedEvent, recordSuccessfulFocus, invokeAction } from "../lib/runtime.mjs";

const env = { HERDR_BIN_PATH: "/opt/herdr", HERDR_CONFIG_PATH: "/home/a/.config/herdr/trials/casebook/config.toml", HERDR_SOCKET_PATH: "/tmp/casebook.sock", HERDR_PANE_ID: "pane-a", HERDR_PLUGIN_CONTEXT_JSON: '{"focused_pane_id":"pane-a"}' };
const route = { sessionName: "casebook-trial", configPath: env.HERDR_CONFIG_PATH, socketPath: env.HERDR_SOCKET_PATH, protocol: 17 };
const focusRecord = {
  canonicalId: "session-a", projectCanonicalId: "project-a", generation: 1, reconciliationState: "current", role: "interaction",
  officialAgentSession: { source:"herdr:pi", agent: "pi", kind: "id", value: "official-a" },
  binding: { workspaceId: "workspace-a", tabId: "tab-a", paneId: "pane-a", terminalId: "terminal-a" },
};
const focusedAgent = (overrides = {}) => ({ name: "any-name", terminal_id: "terminal-a", workspace_id: "workspace-a", tab_id: "tab-a", pane_id: "pane-a", focused: true, agent_session: { ...focusRecord.officialAgentSession }, ...overrides });
const focusBody = (agent = focusedAgent()) => JSON.stringify({ result: { type: "agent_info", agent } });

test("client uses exact explicit session argv, inherited proof env, no shell, and no retry", async () => {
  const calls = [];
  const executor = async (executable, args, options) => { calls.push({ executable, args, options }); return { status: 0, stdout: calls.length === 1 ? JSON.stringify({ result: { type: "agent_list", agents: [] } }) : focusBody(), stderr: "" }; };
  const client = createHerdrClient({ env, route, executor });
  assert.deepEqual(await client.listAgents(), []);
  await client.focusSession({ record: focusRecord });
  assert.deepEqual(calls.map(c => c.args), [["--session", "casebook-trial", "agent", "list"], ["--session", "casebook-trial", "agent", "focus", "pane-a"]]);
  assert.ok(calls.every(c => c.executable === "/opt/herdr" && c.options.shell === false && c.options.env.HERDR_CONFIG_PATH === env.HERDR_CONFIG_PATH && c.options.env.HERDR_SOCKET_PATH === env.HERDR_SOCKET_PATH));
  assert.equal(calls.length, 2);
});

test("client refuses missing route proof and uncertain/nonzero/invalid output", async () => {
  assert.throws(() => createHerdrClient({ env: { ...env, HERDR_SOCKET_PATH: "/wrong" }, route, executor: async () => ({}) }), /socket/);
  assert.throws(() => createHerdrClient({ env: { ...env, HERDR_BIN_PATH: "herdr" }, route, executor: async () => ({}) }), /absolute/);
  assert.throws(() => parseAgentListResponse("no"), /JSON/);
  assert.throws(() => parseFocusResponse(JSON.stringify({ result: { type: "agent_list", agents: [] } }), focusRecord), /unexpected/);
  assert.throws(() => parseFocusResponse(focusBody(focusedAgent({ pane_id: "wrong" })), focusRecord), /mismatch/);
  const calls = [];
  const client = createHerdrClient({ env, route, executor: async (...args) => { calls.push(args); return { status: 7, stdout: "", stderr: "bad" }; } });
  await assert.rejects(client.focusSession({ record: focusRecord }), /failed|uncertain/); assert.equal(calls.length, 1);
});

test("popup uses manifest entrypoint with exact argv", async () => {
  const calls = [];
  const client = createHerdrClient({ env, route, executor: async (executable, args, options) => { calls.push({ executable, args, options }); return { status: 0, stdout: "{}", stderr: "" }; } });
  await client.openPopup("project-manager");
  assert.deepEqual(calls[0].args, ["--session", "casebook-trial", "plugin", "pane", "open", "--plugin", "aryk.pins", "--entrypoint", "project-manager", "--placement", "popup"]);
});

test("history changes only after successful human focus", () => {
  const history = { schemaVersion: 1, projects: { p: "old" } };
  assert.deepEqual(recordSuccessfulFocus(history, { projectCanonicalId: "p", canonicalSessionId: "new", cause: "background", success: true }), history);
  assert.deepEqual(recordSuccessfulFocus(history, { projectCanonicalId: "p", canonicalSessionId: "new", cause: "human", success: false }), history);
  assert.equal(recordSuccessfulFocus(history, { projectCanonicalId: "p", canonicalSessionId: "new", cause: "human", success: true }).projects.p, "new");
});

test("local activation focuses one official canonical agent session and records only that successful human focus", async () => {
  const record = structuredClone(focusRecord);
  const registry = {
    schemaVersion: 1, route,
    projects: [{ canonicalId: "project-a", generation: 1, reconciliationState: "current", stewardSessionCanonicalId: "session-a" }],
    sessions: [record],
  };
  const agent = { name: "unique-agent", terminal_id: "terminal-a", workspace_id: "workspace-a", tab_id: "tab-a", pane_id: "pane-a", agent_session: { ...record.officialAgentSession } };
  const focused = [], histories = [];
  const result = await invokeAction("activate-local-1", {
    env, readRegistry: async () => registry,
    client: { listAgents: async () => [agent], focusSession: async resolution => focused.push(resolution.record.binding.paneId), openPopup: async () => assert.fail("no refusal popup expected") },
    loadPins: async () => ({ schemaVersion: 1, slots: ["session-a", null, null, null] }),
    historyTransaction: async (_file, mutate) => { const outcome = await mutate({ schemaVersion: 1, projects: {} }); histories.push(outcome.history); return outcome.result; },
    writeResult: async () => {},
  });
  assert.equal(result.status, "focused"); assert.deepEqual(focused, ["pane-a"]); assert.equal(histories[0].projects["project-a"], "session-a");
});

test("pane.focused event revalidates exact official pane and records history without popup", async () => {
  const registry = {
    schemaVersion: 1, route,
    projects: [{ canonicalId: "project-a", generation: 1, reconciliationState: "current", stewardSessionCanonicalId: "session-a" }], sessions: [structuredClone(focusRecord)],
  };
  const histories = [], popups = [];
  const eventEnv = { ...env, HERDR_PLUGIN_EVENT: "pane.focused", HERDR_PLUGIN_EVENT_JSON: JSON.stringify({ event: "pane_focused", data: { type: "pane_focused", pane_id: "pane-a", workspace_id: "workspace-a" } }) };
  const result = await handlePaneFocusedEvent({
    env: eventEnv, readRegistry: async () => registry,
    client: { listAgents: async () => [focusedAgent()], openPopup: async id => popups.push(id) },
    historyTransaction: async (_file, mutate) => { const outcome = await mutate({ schemaVersion: 1, projects: {} }); histories.push(outcome.history); return outcome.result; },
  });
  assert.equal(result.status, "recorded"); assert.equal(histories[0].projects["project-a"], "session-a"); assert.deepEqual(popups, []);
  const ignored = await handlePaneFocusedEvent({ ...{ env: eventEnv, readRegistry: async () => registry }, client: { listAgents: async () => [focusedAgent({ pane_id: "wrong" })] }, historyTransaction: async () => assert.fail("must not mutate") });
  assert.equal(ignored.status, "ignored");
});

test("OpenCode id focus response and pane.focused receipt revalidate the exact official tuple", async () => {
  const record = structuredClone(focusRecord);
  record.officialAgentSession = { source: "herdr:opencode", agent: "opencode", kind: "id", value: "oc-session-42" };
  const ocAgent = { name: "OpenCode", terminal_id: "terminal-a", workspace_id: "workspace-a", tab_id: "tab-a", pane_id: "pane-a", focused: true, agent_status: "idle", agent_session: { ...record.officialAgentSession } };
  assert.equal(parseFocusResponse(JSON.stringify({ result: { type: "agent_info", agent: ocAgent } }), record).agent_session.kind, "id");

  const registry = { schemaVersion: 1, route, projects: [{ canonicalId: "project-a", generation: 1, reconciliationState: "current", stewardSessionCanonicalId: "session-a" }], sessions: [record] };
  const eventEnv = { ...env, HERDR_PLUGIN_EVENT: "pane.focused", HERDR_PLUGIN_EVENT_JSON: JSON.stringify({ event: "pane_focused", data: { type: "pane_focused", pane_id: "pane-a", workspace_id: "workspace-a" } }) };
  const writes = [];
  const result = await handlePaneFocusedEvent({ env: eventEnv, readRegistry: async () => registry, client: { listAgents: async () => [ocAgent] }, historyTransaction: async (_file, mutate) => { const outcome = await mutate({ schemaVersion: 1, projects: {} }); writes.push(outcome.history); return outcome.result; } });
  assert.equal(result.status, "recorded");
  assert.equal(writes[0].projects["project-a"], "session-a");
});

test("exit-zero wrong focus target never updates history", async () => {
  const client = createHerdrClient({ env, route, executor: async () => ({ status: 0, stdout: focusBody(focusedAgent({ terminal_id: "other" })), stderr: "" }) });
  await assert.rejects(client.focusSession({ record: focusRecord }), /mismatch/);
});

test("missing registry action fails visibly through result popup", async () => {
  const opened = [];
  const result = await invokeAction("pin-local", { stateRoot: "/absent", env, client: { openPopup: async id => opened.push(id) }, readRegistry: async () => { const e = new Error("missing registry"); e.code = "ENOENT"; throw e; }, writeResult: async () => {} });
  assert.equal(result.status, "refused"); assert.deepEqual(opened, ["result"]);
});
