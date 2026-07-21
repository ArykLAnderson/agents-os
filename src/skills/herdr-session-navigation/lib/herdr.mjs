import path from "node:path";
import { isValidatedFocusPlan, isValidatedPromptPlan } from "./navigation.mjs";

export const TRIAL_SESSION = "casebook-trial";
export const PINNED_SOURCE_COMMIT = "02a6e874f67800891b5a549297219ed6f3ce0f2f";
export const PINNED_PROTOCOL = 17;
const validatedAvailabilities = new WeakSet();

function unavailable(reason, recovery, evidence = {}) {
  return { available: false, reason, recovery, evidence };
}

function hasPinnedCapabilitiesShape(capabilities) {
  return capabilities
    && typeof capabilities === "object"
    && !Array.isArray(capabilities)
    && Object.keys(capabilities).every((key) => ["live_handoff", "detached_server_daemon"].includes(key))
    && typeof capabilities.live_handoff === "boolean"
    && typeof capabilities.detached_server_daemon === "boolean";
}

/** Pure injected proof matching pinned ping and session.snapshot shapes. Environment hints never prove context. */
export function detectHerdrAvailability(observation, expected) {
  if (!observation?.executable?.exists || !path.isAbsolute(observation.executable.path ?? "")) {
    return unavailable("missing-executable", "Install a compatible Herdr separately, then retry the named trial.");
  }
  if (observation.trialName !== TRIAL_SESSION) {
    return unavailable("wrong-session", `Route explicitly to ${TRIAL_SESSION}.`);
  }
  const configPath = path.normalize(observation.configPath ?? "");
  const casebookSuffix = path.join("herdr", "trials", "casebook", "config.toml");
  if (!path.isAbsolute(configPath) || configPath !== path.normalize(expected.configPath ?? "") || !configPath.endsWith(casebookSuffix)) {
    return unavailable("wrong-config", `Use the isolated config at ${expected.configPath}.`);
  }
  if (!path.isAbsolute(observation.socketPath ?? "")) {
    return unavailable("missing-socket", "Supply the explicit absolute socket locator; do not infer it from labels.");
  }
  const handshake = observation.handshake;
  if (!handshake?.ok) return unavailable("handshake-failed", "Attach to the named trial and obtain a fresh ping handshake.");
  if (handshake.sessionName !== TRIAL_SESSION || handshake.socketPath !== observation.socketPath) {
    return unavailable("handshake-mismatch", "Refresh the named-session/socket handshake before routing.");
  }
  if (handshake.protocol !== PINNED_PROTOCOL) {
    return unavailable("unsupported-protocol", `Pinned Herdr protocol ${PINNED_PROTOCOL} is required.`);
  }
  if (!hasPinnedCapabilitiesShape(handshake.capabilities)) {
    return unavailable("unsupported-capabilities", "Require the pinned ServerCapabilities object before enabling effects.");
  }

  const snapshot = observation.snapshot;
  if (snapshot?.protocol !== PINNED_PROTOCOL) {
    return unavailable("snapshot-protocol-mismatch", "Refresh a pinned-protocol api snapshot.");
  }
  if (snapshot.sessionName !== TRIAL_SESSION || snapshot.socketPath !== observation.socketPath) {
    return unavailable("snapshot-route-mismatch", "Bind the snapshot to the proven named session and socket.");
  }
  const current = (snapshot.panes ?? []).filter((pane) => pane.id === observation.currentPaneId);
  if (current.length !== 1) {
    return unavailable(current.length ? "ambiguous-current-pane" : "missing-current-pane", "Refresh the snapshot and require one current pane.");
  }
  const pane = current[0];
  if (pane.integration?.id !== expected.integration.id || pane.integration.schemaVersion !== expected.integration.schemaVersion) {
    return unavailable("integration-mismatch", "Load and verify the expected official Pi integration before enabling effects.");
  }
  if (pane.piSessionRef !== expected.piSessionRef) {
    return unavailable("pi-session-mismatch", "Reconcile the pane against the expected official Pi session reference.");
  }
  if (!Number.isSafeInteger(expected.bindingGeneration) || expected.bindingGeneration < 1 || pane.bindingGeneration !== expected.bindingGeneration) {
    return unavailable("binding-generation-mismatch", "Reconcile a positive current binding generation before enabling effects.");
  }

  const route = Object.freeze({
    executable: observation.executable.path,
    configPath: observation.configPath,
    sessionName: TRIAL_SESSION,
    socketPath: observation.socketPath,
  });
  const result = Object.freeze({
    available: true,
    reason: "verified",
    route,
    currentPane: Object.freeze({ id: pane.id, piSessionRef: pane.piSessionRef, bindingGeneration: pane.bindingGeneration }),
    protocol: handshake.protocol,
  });
  validatedAvailabilities.add(result);
  return result;
}

function requireAvailability(availability) {
  if (!validatedAvailabilities.has(availability) || availability.available !== true) {
    throw new Error("a validated Herdr availability proof is required");
  }
  return availability.route;
}

function bindingMatchesRoute(binding, availability) {
  const route = availability.route;
  return binding?.backend === "herdr"
    && binding.sessionName === route.sessionName
    && binding.socketPath === route.socketPath
    && binding.protocol === availability.protocol
    && Number.isSafeInteger(binding.generation)
    && binding.generation > 0
    && typeof binding.piSessionRef === "string"
    && binding.piSessionRef.length > 0;
}

function command(availability, operationArgs) {
  const route = requireAvailability(availability);
  return {
    transport: "argv",
    executable: route.executable,
    args: ["--session", TRIAL_SESSION, ...operationArgs],
    env: {
      HERDR_CONFIG_PATH: route.configPath,
      HERDR_SOCKET_PATH: route.socketPath,
    },
    routing: {
      configPath: route.configPath,
      sessionName: route.sessionName,
      socketPath: route.socketPath,
      protocol: availability.protocol,
      proof: "validated-availability",
    },
  };
}

export function planSnapshotCommand(availability) {
  return command(availability, ["api", "snapshot"]);
}

export function planBackgroundWorkspaceOpen(availability, { cwd, label }) {
  if (!path.isAbsolute(cwd ?? "")) throw new TypeError("cwd must be absolute");
  return command(availability, ["workspace", "create", "--cwd", cwd, "--label", String(label), "--no-focus"]);
}

export function planBackgroundTabOpen(availability, { workspaceId, cwd, label }) {
  if (!workspaceId) throw new TypeError("workspaceId is required");
  if (!path.isAbsolute(cwd ?? "")) throw new TypeError("cwd must be absolute");
  return command(availability, ["tab", "create", "--workspace", workspaceId, "--cwd", cwd, "--label", String(label), "--no-focus"]);
}

export function planPaneFocusCommand(availability, focusPlan) {
  requireAvailability(availability);
  if (!isValidatedFocusPlan(focusPlan)
    || !bindingMatchesRoute(focusPlan.binding, availability)
    || typeof focusPlan.binding.agentName !== "string"
    || focusPlan.binding.agentName.length === 0) {
    throw new Error("focus requires a validated uniquely resolved Herdr agent binding in the proven route");
  }
  return command(availability, ["agent", "focus", focusPlan.binding.agentName]);
}

/** Pinned wire request: {id, method, params:{target,text}}; target comes only from the approved unique binding. */
export function planAgentPromptRequest(availability, promptPlan) {
  const route = requireAvailability(availability);
  if (!isValidatedPromptPlan(promptPlan) || !bindingMatchesRoute(promptPlan.binding, availability)) {
    throw new Error("agent.prompt requires an approved uniquely resolved binding in the proven route");
  }
  return {
    transport: "socket-request",
    routing: {
      configPath: route.configPath,
      sessionName: route.sessionName,
      socketPath: route.socketPath,
      protocol: availability.protocol,
      proof: "validated-availability",
    },
    request: {
      id: promptPlan.correlationId,
      method: "agent.prompt",
      params: { target: promptPlan.binding.agentName, text: promptPlan.exactContent },
    },
    delivery: { retry: "never-on-uncertain", approved: true },
  };
}
