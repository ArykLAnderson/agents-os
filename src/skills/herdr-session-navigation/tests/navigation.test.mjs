import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assignPin, planFocus, planOpen, planPrompt, recordFocus, resolveDestination, resolvePin, toggleFocus } from "../lib/navigation.mjs";

const fixtureDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const fixture = async (name) => JSON.parse(await readFile(path.join(fixtureDir, name), "utf8"));

async function validResolution() {
  const data = await fixture("valid-context.json");
  return { data, resolution: resolveDestination({ canonicalId: data.binding.canonicalId, generation: data.binding.generation }, [data.binding], data.observation.snapshot) };
}

test("canonical resolution distinguishes unique, missing, ambiguous, and stale", async () => {
  const { data, resolution } = await validResolution();
  assert.equal(resolution.status, "unique");
  assert.equal(resolveDestination({ canonicalId: "frame:missing" }, [data.binding], data.observation.snapshot).status, "missing");
  const duplicate = await fixture("duplicate-binding.json");
  assert.equal(resolveDestination(duplicate.destination, duplicate.bindings, duplicate.snapshot).status, "ambiguous");
  const stale = await fixture("stale-binding.json");
  assert.equal(resolveDestination(stale.destination, stale.bindings, stale.snapshot).status, "stale");
});

test("resolution rejects raw pane locator/official-tuple mismatch and invalid registry generation", async () => {
  const { data } = await validResolution();
  const alterations = [
    { panes: data.observation.snapshot.panes.map((pane) => ({ ...pane, pane_id: "other" })) },
    { panes: data.observation.snapshot.panes.map((pane) => ({ ...pane, terminal_id: "other" })) },
    { panes: data.observation.snapshot.panes.map((pane) => ({ ...pane, agent_session: { ...pane.agent_session, value: "other" } })) },
  ];
  for (const alteration of alterations) {
    const snapshot = { ...data.observation.snapshot, ...alteration };
    assert.equal(resolveDestination({ canonicalId: data.binding.canonicalId }, [data.binding], snapshot).status, "stale");
  }
  assert.equal(resolveDestination({ canonicalId: data.binding.canonicalId }, [{ ...data.binding, generation: 0 }], data.observation.snapshot).status, "stale");
});

test("pins retain canonical identity rather than mutable locators", async () => {
  const { data } = await validResolution();
  const pins = assignPin({}, 1, data.binding.canonicalId);
  assert.deepEqual(pins, { 1: data.binding.canonicalId });
  assert.equal(resolvePin(pins, 1, [data.binding], data.observation.snapshot).status, "unique");
});

test("focus history changes only for humans and toggles a stable pair", () => {
  let history = recordFocus({}, "project:a", "human");
  assert.deepEqual(recordFocus(history, "project:background", "background"), history);
  history = recordFocus(history, "project:b", "human");
  const first = toggleFocus(history);
  assert.equal(first.canonicalId, "project:a");
  assert.equal(toggleFocus(first.history).canonicalId, "project:b");
});

test("background opens and focus plans cannot steal focus", async () => {
  assert.deepEqual(planOpen({ canonicalId: "frame:one" }), { effect: "session.open", canonicalId: "frame:one", kind: "recover", focus: false });
  assert.throws(() => planOpen({ canonicalId: "frame:one", focus: true }), /focus=false/);
  const { resolution } = await validResolution();
  assert.throws(() => planFocus(resolution, "background"), /explicit human/);
  assert.equal(planFocus(resolution, "human").cause, "human");
});

test("prompt approval is bound to a validated unique binding", async () => {
  const { resolution } = await validResolution();
  assert.throws(() => planPrompt({ resolution, exactContent: "hello", correlationId: "c1", approved: false }), /approval/);
  assert.throws(() => planPrompt({ resolution: { ...resolution }, exactContent: "hello", correlationId: "c1", approved: true }), /validated unique/);
  const plan = planPrompt({ resolution, exactContent: "hello", correlationId: "c1", approved: true });
  assert.equal(plan.binding.agentName, "Steward · frame:stable");
  assert.equal(plan.retry, "never-on-uncertain-delivery");
});
