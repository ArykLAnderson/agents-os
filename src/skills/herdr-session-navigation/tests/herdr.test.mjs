import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import * as herdr from "../lib/herdr.mjs";
import { planFocus, planPrompt, resolveDestination } from "../lib/navigation.mjs";

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixture = async (name) => JSON.parse(await readFile(path.join(fixtureDir, name), "utf8"));

async function validProofAndResolution() {
  const data = await fixture("valid-context.json");
  const availability = herdr.detectHerdrAvailability(data.observation, data.expected);
  const resolution = resolveDestination({ canonicalId: data.binding.canonicalId, generation: data.binding.generation }, [data.binding], data.observation.snapshot);
  return { data, availability, resolution };
}

test("availability matches pinned numeric protocol and ServerCapabilities shape", async () => {
  const { availability } = await validProofAndResolution();
  assert.equal(availability.available, true);
  assert.equal(availability.protocol, 17);
  assert.equal(herdr.PINNED_PROTOCOL, 17);

  for (const [name, reason] of [["outside-herdr.json", "missing-executable"], ["wrong-session.json", "wrong-session"], ["unsupported-protocol.json", "unsupported-protocol"]]) {
    const data = await fixture(name);
    const denied = herdr.detectHerdrAvailability(data.observation, data.expected);
    assert.equal(denied.available, false);
    assert.equal(denied.reason, reason);
  }
  const valid = await fixture("valid-context.json");
  assert.equal(herdr.detectHerdrAvailability({ ...valid.observation, ping: { ...valid.observation.ping, capabilities: ["agent.prompt"] } }, valid.expected).reason, "unsupported-capabilities");
});

test("availability accepts exact Pi and OpenCode wire tuples and rejects unsupported evidence", async () => {
  const data = await fixture("valid-context.json");
  const pi = structuredClone(data);
  const piOfficial = { source: "herdr:pi", agent: "pi", kind: "path", value: "/tmp/pi-session.jsonl" };
  pi.expected.integration = { id: "pi", version: 6, minimumRestoreVersion: 2 };
  pi.expected.binding.officialAgentSession = piOfficial;
  pi.observation.integrationStatus = { ...pi.observation.integrationStatus, id: "pi", installedVersion: 6, expectedVersion: 6 };
  pi.observation.snapshot.panes[0].agent_session = piOfficial;
  pi.observation.snapshot.agents[0].agent_session = piOfficial;
  assert.equal(herdr.detectHerdrAvailability(pi.observation, pi.expected).available, true);

  const badProfile = structuredClone(data); badProfile.observation.integrationStatus.state = "outdated";
  assert.equal(herdr.detectHerdrAvailability(badProfile.observation, badProfile.expected).reason, "integration-mismatch");
  for (const officialAgentSession of [
    { source: "herdr:pi", agent: "opencode", kind: "id", value: "x" },
    { source: "herdr:opencode", agent: "opencode", kind: "path", value: "/tmp/x" },
  ]) {
    const bad = structuredClone(data); bad.expected.binding.officialAgentSession = officialAgentSession;
    assert.match(herdr.detectHerdrAvailability(bad.observation, bad.expected).reason, /official-agent-session|invalid-expected-binding/);
  }
});

test("availability requires exact pinned raw snapshot and separate adapter evidence", async () => {
  const data = await fixture("valid-context.json");
  for (const mutate of [
    value => { value.observation.snapshot.sessionName = "invented"; },
    value => { delete value.observation.snapshot.workspaces; },
    value => { value.observation.snapshot.panes[0].bindingGeneration = 4; },
    value => { delete value.observation.integrationStatus; },
    value => { value.observation.snapshot.panes[0].agent_session = null; },
  ]) {
    const bad = structuredClone(data); mutate(bad);
    assert.equal(herdr.detectHerdrAvailability(bad.observation, bad.expected).available, false);
  }
});

test("all argv plans require unforgeable proof, explicit --session, and source-attested snapshot", async () => {
  const { availability, resolution } = await validProofAndResolution();
  const plans = [
    herdr.planSnapshotCommand(availability),
    herdr.planBackgroundWorkspaceOpen(availability, { cwd: "/tmp/hostile path;echo nope", label: "a; $(nope)" }),
    herdr.planBackgroundTabOpen(availability, { workspaceId: "w 1", cwd: "/tmp/project", label: "tab;name" }),
    herdr.planPaneFocusCommand(availability, planFocus(resolution)),
  ];
  for (const plan of plans) {
    assert.deepEqual(plan.args.slice(0, 2), ["--session", "casebook-trial"]);
    assert.equal(plan.env.HERDR_CONFIG_PATH, availability.route.configPath);
    assert.equal(plan.env.HERDR_SOCKET_PATH, availability.route.socketPath);
    assert.equal(plan.routing.proof, "validated-availability");
  }
  assert.deepEqual(plans[0].args, ["--session", "casebook-trial", "api", "snapshot"]);
  assert.deepEqual(plans[3].args, ["--session", "casebook-trial", "agent", "focus", "pane-1"]);
  assert.ok(plans[1].args.includes("/tmp/hostile path;echo nope"));
  const forged = { available: true, protocol: 17, route: { executable: "/not/proven/herdr", configPath: "/tmp/config.toml", sessionName: "casebook-trial", socketPath: "/tmp/unproven.sock" } };
  assert.throws(() => herdr.planSnapshotCommand(forged), /validated Herdr availability proof/);
});

test("focus receipt attestation matches Pi and OpenCode tuples plus every locator", async () => {
  const { data } = await validProofAndResolution();
  const response = binding => ({ result: { type: "agent_info", agent: {
    focused: true, workspace_id: binding.workspaceId, tab_id: binding.tabId,
    pane_id: binding.paneId, terminal_id: binding.terminalId,
    agent_session: binding.officialAgentSession,
  } } });
  assert.equal(herdr.attestPaneFocusResponse(response(data.binding), data.binding).pane_id, "pane-1");
  const pi = { ...data.binding, officialAgentSession: { source: "herdr:pi", agent: "pi", kind: "id", value: "pi-1" } };
  assert.equal(herdr.attestPaneFocusResponse(JSON.stringify(response(pi)), pi).agent_session.kind, "id");
  assert.throws(() => herdr.attestPaneFocusResponse(response({ ...data.binding, paneId: "wrong" }), data.binding), /target mismatch/);
});

test("prompt request exactly matches pinned schema and resolved target", async () => {
  const { availability, resolution } = await validProofAndResolution();
  const pinned = await fixture("pinned-api-schema.json");
  const prompt = planPrompt({ resolution, exactContent: "exact text", correlationId: "correlation-1", approved: true });
  const plan = herdr.planAgentPromptRequest(availability, prompt);
  assert.deepEqual(plan.request, pinned.agentPromptRequest);
  assert.deepEqual(Object.keys(plan.request).sort(), ["id", "method", "params"]);
  assert.deepEqual(Object.keys(plan.request.params).sort(), ["target", "text"]);
  assert.equal(plan.request.params.target, resolution.binding.agentName);
  assert.throws(() => herdr.planAgentPromptRequest(availability, { ...prompt, binding: { ...prompt.binding, agentName: "Other" } }), /approved uniquely resolved/);
  assert.deepEqual(Object.keys(herdr).filter((name) => /close|delete|stop|purge|sendKeys/i.test(name)), []);
});

test("prompt and focus reject a uniquely resolved binding from another proven route", async () => {
  const { availability, data } = await validProofAndResolution();
  const otherSnapshot = structuredClone(data.observation.snapshot);
  const otherBinding = { ...data.binding, socketPath: "/tmp/other.sock" };
  const otherResolution = resolveDestination({ canonicalId: otherBinding.canonicalId }, [otherBinding], otherSnapshot);
  const otherPrompt = planPrompt({ resolution: otherResolution, exactContent: "no", correlationId: "other", approved: true });
  assert.throws(() => herdr.planAgentPromptRequest(availability, otherPrompt), /proven route/);
  assert.throws(() => herdr.planPaneFocusCommand(availability, planFocus(otherResolution)), /proven route/);
});

test("Herdr effects reject wrong backend while pane focus does not require an agent label", async () => {
  const { availability, data } = await validProofAndResolution();

  const tmuxBinding = { ...data.binding, backend: "tmux" };
  const tmuxResolution = resolveDestination({ canonicalId: tmuxBinding.canonicalId }, [tmuxBinding], data.observation.snapshot);
  assert.throws(() => herdr.planPaneFocusCommand(availability, planFocus(tmuxResolution)), /Herdr pane binding/);
  const tmuxPrompt = planPrompt({ resolution: tmuxResolution, exactContent: "no", correlationId: "tmux", approved: true });
  assert.throws(() => herdr.planAgentPromptRequest(availability, tmuxPrompt), /proven route/);

  const { agentName: _ignored, ...agentlessBinding } = data.binding;
  const agentlessResolution = resolveDestination({ canonicalId: agentlessBinding.canonicalId }, [agentlessBinding], data.observation.snapshot);
  assert.deepEqual(herdr.planPaneFocusCommand(availability, planFocus(agentlessResolution)).args.slice(-3), ["agent", "focus", "pane-1"]);
});
