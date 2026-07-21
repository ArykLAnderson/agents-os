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
  assert.equal(herdr.detectHerdrAvailability({ ...valid.observation, handshake: { ...valid.observation.handshake, capabilities: ["agent.prompt"] } }, valid.expected).reason, "unsupported-capabilities");
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
  assert.ok(plans[1].args.includes("/tmp/hostile path;echo nope"));
  const forged = { available: true, protocol: 17, route: { executable: "/not/proven/herdr", configPath: "/tmp/config.toml", sessionName: "casebook-trial", socketPath: "/tmp/unproven.sock" } };
  assert.throws(() => herdr.planSnapshotCommand(forged), /validated Herdr availability proof/);
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
  const otherSnapshot = { ...data.observation.snapshot, socketPath: "/tmp/other.sock" };
  const otherBinding = { ...data.binding, socketPath: "/tmp/other.sock" };
  const otherResolution = resolveDestination({ canonicalId: otherBinding.canonicalId }, [otherBinding], otherSnapshot);
  const otherPrompt = planPrompt({ resolution: otherResolution, exactContent: "no", correlationId: "other", approved: true });
  assert.throws(() => herdr.planAgentPromptRequest(availability, otherPrompt), /proven route/);
  assert.throws(() => herdr.planPaneFocusCommand(availability, planFocus(otherResolution)), /proven route/);
});

test("Herdr effects reject wrong-backend and agentless bindings", async () => {
  const { availability, data } = await validProofAndResolution();

  const tmuxBinding = { ...data.binding, backend: "tmux" };
  const tmuxResolution = resolveDestination({ canonicalId: tmuxBinding.canonicalId }, [tmuxBinding], data.observation.snapshot);
  assert.throws(() => herdr.planPaneFocusCommand(availability, planFocus(tmuxResolution)), /Herdr agent binding/);
  const tmuxPrompt = planPrompt({ resolution: tmuxResolution, exactContent: "no", correlationId: "tmux", approved: true });
  assert.throws(() => herdr.planAgentPromptRequest(availability, tmuxPrompt), /proven route/);

  const { agentName: _ignored, ...agentlessBinding } = data.binding;
  const agentlessResolution = resolveDestination({ canonicalId: agentlessBinding.canonicalId }, [agentlessBinding], data.observation.snapshot);
  assert.throws(() => herdr.planPaneFocusCommand(availability, planFocus(agentlessResolution)), /Herdr agent binding/);
});
