import path from "node:path";
import { isValidatedFocusPlan, isValidatedPromptPlan } from "./navigation.mjs";

export const TRIAL_SESSION = "casebook-trial";
export const PINNED_SOURCE_COMMIT = "1f2487554b9fd42118f9e99ee06eb558bbb2391f";
export const PINNED_VERSION = "0.7.4";
export const PINNED_PROTOCOL = 17;
const validatedAvailabilities = new WeakSet();
const INTEGRATION_PROFILES = Object.freeze({
  pi: Object.freeze({ id: "pi", version: 6, minimumRestoreVersion: 2 }),
  opencode: Object.freeze({ id: "opencode", version: 9, minimumRestoreVersion: 5 }),
});
const SNAPSHOT_KEYS = new Set(["version", "protocol", "focused_workspace_id", "focused_tab_id", "focused_pane_id", "workspaces", "tabs", "panes", "layouts", "agents"]);
const PANE_KEYS = new Set(["pane_id", "terminal_id", "workspace_id", "tab_id", "focused", "cwd", "foreground_cwd", "label", "agent", "title", "terminal_title", "terminal_title_stripped", "display_agent", "agent_status", "state_labels", "tokens", "agent_session", "scroll", "revision"]);

function sameOfficialAgentSession(a, b) {
  return a?.source === b?.source && a?.agent === b?.agent && a?.kind === b?.kind && a?.value === b?.value;
}
function validOfficialAgentSession(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join(",") !== "agent,kind,source,value"
    || typeof value.value !== "string" || value.value.trim() === "") return false;
  return (value.source === "herdr:pi" && value.agent === "pi" && ["id", "path"].includes(value.kind))
    || (value.source === "herdr:opencode" && value.agent === "opencode" && value.kind === "id");
}
function validIntegrationProfile(value) {
  const profile = INTEGRATION_PROFILES[value?.id];
  return Boolean(profile && value.version === profile.version && value.minimumRestoreVersion === profile.minimumRestoreVersion);
}
function unavailable(reason, recovery, evidence = {}) { return { available: false, reason, recovery, evidence }; }
function exactKeys(value, allowed) { return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every(key => allowed.has(key)); }
function hasPinnedCapabilitiesShape(value) {
  return exactKeys(value, new Set(["live_handoff", "detached_server_daemon"]))
    && typeof value.live_handoff === "boolean" && typeof value.detached_server_daemon === "boolean";
}
function validRawPane(pane) {
  return exactKeys(pane, PANE_KEYS)
    && ["pane_id", "terminal_id", "workspace_id", "tab_id"].every(key => typeof pane[key] === "string" && pane[key].length > 0)
    && typeof pane.focused === "boolean" && typeof pane.agent_status === "string"
    && Number.isSafeInteger(pane.revision) && pane.revision >= 0
    && (pane.agent_session == null || validOfficialAgentSession(pane.agent_session));
}
function validRawSnapshot(snapshot) {
  return exactKeys(snapshot, SNAPSHOT_KEYS)
    && snapshot.version === PINNED_VERSION && snapshot.protocol === PINNED_PROTOCOL
    && ["workspaces", "tabs", "panes", "layouts", "agents"].every(key => Array.isArray(snapshot[key]))
    && snapshot.panes.every(validRawPane)
    && ["focused_workspace_id", "focused_tab_id", "focused_pane_id"].every(key => snapshot[key] == null || typeof snapshot[key] === "string");
}
function bindingMatchesPane(binding, pane) {
  return Number.isSafeInteger(binding?.generation) && binding.generation > 0
    && ["paneId", "workspaceId", "tabId", "terminalId"].every(key => typeof binding[key] === "string" && binding[key].length > 0)
    && validOfficialAgentSession(binding.officialAgentSession)
    && pane.pane_id === binding.paneId && pane.workspace_id === binding.workspaceId
    && pane.tab_id === binding.tabId && pane.terminal_id === binding.terminalId
    && sameOfficialAgentSession(pane.agent_session, binding.officialAgentSession);
}

/** Pure proof over pinned raw ping/snapshot data plus explicit invocation and integration-status adapter evidence. */
export function detectHerdrAvailability(observation, expected) {
  if (!observation?.executable?.exists || !path.isAbsolute(observation.executable.path ?? "")) return unavailable("missing-executable", "Install a compatible Herdr separately, then retry the named trial.");
  const invocation = observation.invocation;
  if (invocation?.sessionName !== TRIAL_SESSION) return unavailable("wrong-session", `Route explicitly to ${TRIAL_SESSION}.`);
  const configPath = path.normalize(invocation?.configPath ?? "");
  const expectedConfigPath = path.normalize(expected?.configPath ?? "");
  const suffix = path.join("herdr", "trials", "casebook", "config.toml");
  if (!path.isAbsolute(configPath) || configPath !== expectedConfigPath || !configPath.endsWith(suffix)) return unavailable("wrong-config", `Use the isolated config at ${expected?.configPath}.`);
  if (!path.isAbsolute(invocation?.socketPath ?? "")) return unavailable("missing-socket", "Supply the explicit absolute socket locator; do not infer it from response fields.");

  const ping = observation.ping;
  if (!exactKeys(ping, new Set(["version", "protocol", "capabilities"])) || ping.version !== PINNED_VERSION) return unavailable("unsupported-version", `Pinned Herdr ${PINNED_VERSION} ping evidence is required.`);
  if (ping.protocol !== PINNED_PROTOCOL) return unavailable("unsupported-protocol", `Pinned Herdr protocol ${PINNED_PROTOCOL} is required.`);
  if (!hasPinnedCapabilitiesShape(ping.capabilities)) return unavailable("unsupported-capabilities", "Require the pinned ServerCapabilities object before enabling effects.");

  const integration = expected?.integration;
  const status = observation.integrationStatus;
  if (!validIntegrationProfile(integration)
    || !exactKeys(status, new Set(["type", "sourceCommand", "id", "state", "installedVersion", "expectedVersion"]))
    || status.type !== "herdr-integration-status-adapter-observation" || status.sourceCommand !== "herdr integration status"
    || status.id !== integration.id || status.state !== "current"
    || status.installedVersion !== integration.version || status.expectedVersion !== integration.version) {
    return unavailable("integration-mismatch", "Supply a current selected-profile adapter observation derived from herdr integration status.");
  }

  const snapshot = observation.snapshot;
  if (!validRawSnapshot(snapshot)) return unavailable("invalid-snapshot", "Refresh the exact pinned session.snapshot response; invented route or pane fields are not accepted.");
  const binding = expected?.binding;
  if (!bindingMatchesPane(binding, { pane_id: binding?.paneId, workspace_id: binding?.workspaceId, tab_id: binding?.tabId, terminal_id: binding?.terminalId, agent_session: binding?.officialAgentSession })) return unavailable("invalid-expected-binding", "Supply one positive-generation canonical expected binding.");
  if (binding.officialAgentSession.agent !== integration.id) return unavailable("official-agent-session-mismatch", "The selected integration and expected official tuple must agree.");
  const focused = snapshot.panes.filter(pane => pane.pane_id === snapshot.focused_pane_id && pane.focused === true);
  if (focused.length !== 1) return unavailable(focused.length ? "ambiguous-current-pane" : "missing-current-pane", "Require exactly one focused raw PaneInfo.");
  if (!bindingMatchesPane(binding, focused[0])) return unavailable("official-agent-session-mismatch", "The focused raw PaneInfo must exactly match the canonical expected binding and official tuple.");

  const route = Object.freeze({ executable: observation.executable.path, configPath: invocation.configPath, sessionName: TRIAL_SESSION, socketPath: invocation.socketPath });
  const result = Object.freeze({ available: true, reason: "verified", route, currentPane: Object.freeze({ id: focused[0].pane_id, officialAgentSession: Object.freeze(structuredClone(focused[0].agent_session)), bindingGeneration: binding.generation }), protocol: ping.protocol });
  validatedAvailabilities.add(result);
  return result;
}
function requireAvailability(value) { if (!validatedAvailabilities.has(value) || value.available !== true) throw new Error("a validated Herdr availability proof is required"); return value.route; }
function bindingMatchesRoute(binding, availability) {
  const route = availability.route;
  return binding?.backend === "herdr" && binding.sessionName === route.sessionName && binding.socketPath === route.socketPath
    && binding.protocol === availability.protocol && Number.isSafeInteger(binding.generation) && binding.generation > 0
    && validOfficialAgentSession(binding.officialAgentSession);
}
function command(availability, operationArgs) {
  const route = requireAvailability(availability);
  return { transport: "argv", executable: route.executable, args: ["--session", TRIAL_SESSION, ...operationArgs], env: { HERDR_CONFIG_PATH: route.configPath, HERDR_SOCKET_PATH: route.socketPath }, routing: { configPath: route.configPath, sessionName: route.sessionName, socketPath: route.socketPath, protocol: availability.protocol, proof: "validated-availability" } };
}
export function planSnapshotCommand(availability) { return command(availability, ["api", "snapshot"]); }
export function planBackgroundWorkspaceOpen(availability, { cwd, label }) { if (!path.isAbsolute(cwd ?? "")) throw new TypeError("cwd must be absolute"); return command(availability, ["workspace", "create", "--cwd", cwd, "--label", String(label), "--no-focus"]); }
export function planBackgroundTabOpen(availability, { workspaceId, cwd, label }) { if (!workspaceId) throw new TypeError("workspaceId is required"); if (!path.isAbsolute(cwd ?? "")) throw new TypeError("cwd must be absolute"); return command(availability, ["tab", "create", "--workspace", workspaceId, "--cwd", cwd, "--label", String(label), "--no-focus"]); }
export function planPaneFocusCommand(availability, focusPlan) {
  requireAvailability(availability);
  if (!isValidatedFocusPlan(focusPlan) || !bindingMatchesRoute(focusPlan.binding, availability) || typeof focusPlan.binding.paneId !== "string" || !focusPlan.binding.paneId) throw new Error("focus requires a validated uniquely resolved Herdr pane binding in the proven route");
  return command(availability, ["agent", "focus", focusPlan.binding.paneId]);
}
/** Attest the pinned agent focus result before a consumer records success/history. */
export function attestPaneFocusResponse(response, expectedBinding) {
  const value = typeof response === "string" ? JSON.parse(response) : response;
  const agent = value?.result?.type === "agent_info" ? value.result.agent : null;
  if (!agent || agent.focused !== true || agent.workspace_id !== expectedBinding?.workspaceId || agent.tab_id !== expectedBinding?.tabId
    || agent.pane_id !== expectedBinding?.paneId || agent.terminal_id !== expectedBinding?.terminalId
    || !sameOfficialAgentSession(agent.agent_session, expectedBinding?.officialAgentSession)) throw new Error("agent focus response target mismatch");
  return agent;
}
export function planAgentPromptRequest(availability, promptPlan) {
  const route = requireAvailability(availability);
  if (!isValidatedPromptPlan(promptPlan) || !bindingMatchesRoute(promptPlan.binding, availability)) throw new Error("agent.prompt requires an approved uniquely resolved binding in the proven route");
  return { transport: "socket-request", routing: { configPath: route.configPath, sessionName: route.sessionName, socketPath: route.socketPath, protocol: availability.protocol, proof: "validated-availability" }, request: { id: promptPlan.correlationId, method: "agent.prompt", params: { target: promptPlan.binding.agentName, text: promptPlan.exactContent } }, delivery: { retry: "never-on-uncertain", approved: true } };
}
