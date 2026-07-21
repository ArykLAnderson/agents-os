import path from "node:path";
import { appendPin, identifyCurrentSession, parsePins, planProjectActivation, resolveOfficialSession, validateRegistry } from "./model.mjs";
import { atomicWriteJson, loadPins, loadRegistry, statePaths, transactionalHistory, transactionalPins } from "./storage.mjs";
import { createHerdrClient } from "./herdr-client.mjs";

function contextFrom(env) {
  let context; try { context = JSON.parse(env.HERDR_PLUGIN_CONTEXT_JSON ?? ""); } catch { throw new Error("plugin invocation context is missing or invalid"); }
  if (!context || typeof context !== "object" || Array.isArray(context)) throw new Error("plugin invocation context is missing or invalid");
  return context;
}
export function recordSuccessfulFocus(history, { projectCanonicalId, canonicalSessionId, cause, success }) {
  if (cause !== "human" || success !== true) return structuredClone(history);
  return { schemaVersion: 1, projects: { ...history.projects, [projectCanonicalId]: canonicalSessionId } };
}
async function visibleRefusal(message, { client, writeResult }) {
  await writeResult({ schemaVersion: 1, status: "refused", message, recordedAt: new Date().toISOString() });
  await client.openPopup("result");
  return { status: "refused", message };
}
function pinPath(scope, paths) { return scope === "project" ? paths.projects : paths.locals; }
function projectStatus(canonicalId, registry) {
  const claims = registry.projects.filter((project) => project.canonicalId === canonicalId);
  if (claims.length !== 1) return claims.length ? "ambiguous" : "missing";
  return claims[0].reconciliationState === "current" ? "unique" : "stale";
}
function resolvedPaths(options, env) {
  const paths = options.paths ?? statePaths(env); const stateRoot = options.stateRoot ?? paths.root;
  return options.paths ?? { ...paths, root: stateRoot, registry: path.join(stateRoot, "bindings", "registry.json"), projects: path.join(stateRoot, "project-pins.json"), locals: path.join(stateRoot, "local-pins.json"), history: path.join(stateRoot, "focus-history.json"), result: path.join(stateRoot, "action-result.json") };
}

export async function invokeAction(action, options = {}) {
  const env = options.env ?? process.env; const paths = resolvedPaths(options, env);
  const readRegistry = options.readRegistry ?? (() => loadRegistry(paths.registry));
  const writeResult = options.writeResult ?? ((value) => atomicWriteJson(paths.result, value));
  const pinTransaction = options.pinTransaction ?? transactionalPins;
  const historyTransaction = options.historyTransaction ?? transactionalHistory;
  let client = options.client;
  if (["manage-projects", "manage-locals"].includes(action)) {
    if (!client) client = createHerdrClient({ env, route: { sessionName: "casebook-trial", configPath: env.HERDR_CONFIG_PATH, socketPath: env.HERDR_SOCKET_PATH, protocol: 17 } });
    await client.openPopup(action === "manage-projects" ? "project-manager" : "local-manager"); return { status: "opened" };
  }
  let registry;
  try { registry = validateRegistry(await readRegistry()); }
  catch (error) {
    if (!client) client = createHerdrClient({ env, route: { sessionName: "casebook-trial", configPath: env.HERDR_CONFIG_PATH, socketPath: env.HERDR_SOCKET_PATH, protocol: 17 } });
    return visibleRefusal(`Authoritative registry unavailable: ${error.message}`, { client, writeResult });
  }
  try {
    if (!client) client = createHerdrClient({ env, route: registry.route });
    const context = contextFrom(env);
    if (["pin-project", "pin-local"].includes(action)) {
      const agents = await client.listAgents();
      const current = identifyCurrentSession({ registry, agents, context, paneId: env.HERDR_PANE_ID });
      if (current.status !== "unique") return visibleRefusal(`Canonical current session unavailable (${current.status}).`, { client, writeResult });
      const scope = action === "pin-project" ? "project" : "local";
      const canonicalId = scope === "project" ? current.record.projectCanonicalId : current.record.canonicalId;
      if (scope === "project" && projectStatus(canonicalId, registry) !== "unique") return visibleRefusal("Canonical current project binding unavailable.", { client, writeResult });
      const result = await pinTransaction(pinPath(scope, paths), async pins => {
        const appended = appendPin(pins, canonicalId); return { pins: appended.pins, result: appended };
      });
      if (result.status === "full") return visibleRefusal(`${scope === "project" ? "Project" : "Local"} pins are full.`, { client, writeResult });
      return { status: result.status, slot: result.slot, canonicalId };
    }
    const match = /^(activate)-(project|local)-(\d)$/.exec(action);
    if (!match) return visibleRefusal(`Unknown action: ${action}`, { client, writeResult });
    const scope = match[2]; const slot = Number(match[3]);
    const pins = parsePins(await (options.loadPins ?? loadPins)(pinPath(scope, paths)));
    const pinned = pins.slots[slot - 1];
    if (!pinned) return visibleRefusal(`${scope === "project" ? "Project" : "Local"} pin ${slot} is empty.`, { client, writeResult });
    const agents = await client.listAgents();
    const current = identifyCurrentSession({ registry, agents, context, paneId: env.HERDR_PANE_ID });
    if (current.status !== "unique") return visibleRefusal(`Canonical current session unavailable (${current.status}).`, { client, writeResult });
    return await historyTransaction(paths.history, async history => {
      let canonicalSessionId, projectCanonicalId, resolution;
      if (scope === "local") {
        resolution = resolveOfficialSession(pinned, registry, agents);
        if (resolution.status !== "unique") throw new Error(`Local pin ${slot} unavailable (${resolution.status}).`);
        canonicalSessionId = pinned; projectCanonicalId = resolution.record.projectCanonicalId;
      } else {
        const plan = planProjectActivation({ targetProjectCanonicalId: pinned, currentSessionCanonicalId: current.record.canonicalId, registry, agents, history });
        if (plan.status !== "ready") throw new Error(`Project pin ${slot} unavailable (${plan.status}).`);
        ({ canonicalSessionId, projectCanonicalId, resolution } = plan);
      }
      await client.focusSession(resolution); // exact verified pane id; exit-0 body must attest the same official tuple and locators
      const next = recordSuccessfulFocus(history, { projectCanonicalId, canonicalSessionId, cause: "human", success: true });
      return { history: next, result: { status: "focused", canonicalSessionId, projectCanonicalId } };
    });
  } catch (error) { return visibleRefusal(error.message, { client, writeResult }); }
}

/** Event hooks are silent: any malformed/stale/ambiguous/IO condition returns ignored without popup or mutation. */
export async function handlePaneFocusedEvent(options = {}) {
  const env = options.env ?? process.env; const paths = resolvedPaths(options, env);
  try {
    if (env.HERDR_PLUGIN_EVENT !== "pane.focused") throw new Error("wrong event");
    const envelope = JSON.parse(env.HERDR_PLUGIN_EVENT_JSON ?? "");
    if (envelope?.event !== "pane_focused" || envelope?.data?.type !== "pane_focused") throw new Error("invalid pane.focused envelope");
    const paneId = envelope.data.pane_id; const workspaceId = envelope.data.workspace_id;
    if (typeof paneId !== "string" || !paneId || typeof workspaceId !== "string" || !workspaceId) throw new Error("missing focus locators");
    const registry = validateRegistry(await (options.readRegistry ?? (() => loadRegistry(paths.registry)))());
    const client = options.client ?? createHerdrClient({ env, route: registry.route });
    const agents = await client.listAgents();
    const candidates = registry.sessions.filter(record => record.binding.paneId === paneId && record.binding.workspaceId === workspaceId)
      .map(record => resolveOfficialSession(record.canonicalId, registry, agents))
      .filter(result => result.status === "unique" && result.agent.focused === true);
    if (candidates.length !== 1) throw new Error("focused canonical session unavailable");
    const resolution = candidates[0];
    const result = await (options.historyTransaction ?? transactionalHistory)(paths.history, async history => ({
      history: recordSuccessfulFocus(history, { projectCanonicalId: resolution.record.projectCanonicalId, canonicalSessionId: resolution.record.canonicalId, cause: "human", success: true }),
      result: { status: "recorded", canonicalSessionId: resolution.record.canonicalId, projectCanonicalId: resolution.record.projectCanonicalId },
    }));
    return result;
  } catch (error) { return { status: "ignored", reason: error.message }; }
}
