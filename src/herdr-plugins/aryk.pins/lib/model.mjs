import path from "node:path";
import { resolveDestination } from "./resolver.mjs";

export const SCHEMA_VERSION = 1;
export const SLOT_COUNT = 4;
export const TRIAL_SESSION = "casebook-trial";
export const PINNED_PROTOCOL = 17;

function text(value, field) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${field} is required`);
  return value;
}
function generation(value, field) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${field} must be a positive integer`);
  return value;
}
function slotNumber(slot) {
  if (!Number.isInteger(slot) || slot < 1 || slot > SLOT_COUNT) throw new RangeError("slot must be 1..4");
  return slot - 1;
}

export function emptyPins() { return { schemaVersion: SCHEMA_VERSION, slots: Array(SLOT_COUNT).fill(null) }; }
export function parsePins(value) {
  if (!value || value.schemaVersion !== SCHEMA_VERSION) throw new TypeError("unsupported pin schemaVersion");
  if (!Array.isArray(value.slots) || value.slots.length !== SLOT_COUNT) throw new TypeError("pins must contain exactly four slots");
  const slots = value.slots.map((item, index) => item == null ? null : text(item, `slots[${index}]`));
  return { schemaVersion: SCHEMA_VERSION, slots };
}
export function appendPin(pinsValue, canonicalIdValue) {
  const pins = parsePins(pinsValue); const canonicalId = text(canonicalIdValue, "canonicalId");
  const existing = pins.slots.indexOf(canonicalId);
  if (existing >= 0) return { status: "existing", slot: existing + 1, pins };
  const free = pins.slots.indexOf(null);
  if (free < 0) return { status: "full", pins };
  pins.slots[free] = canonicalId;
  return { status: "pinned", slot: free + 1, pins };
}
export function clearPin(pinsValue, slot) {
  const pins = parsePins(pinsValue); pins.slots[slotNumber(slot)] = null; return pins;
}
export function reorderPins(pinsValue, fromSlot, toSlot) {
  const pins = parsePins(pinsValue); const from = slotNumber(fromSlot); const to = slotNumber(toSlot);
  const [item] = pins.slots.splice(from, 1); pins.slots.splice(to, 0, item); pins.slots.length = SLOT_COUNT; return pins;
}

function validateSession(record, index) {
  text(record?.canonicalId, `sessions[${index}].canonicalId`);
  text(record?.projectCanonicalId, `sessions[${index}].projectCanonicalId`);
  generation(record?.generation, `sessions[${index}].generation`);
  if (!["current", "stale"].includes(record?.reconciliationState)) throw new TypeError(`sessions[${index}].reconciliationState is invalid`);
  if (!["steward", "interaction"].includes(record?.role)) throw new TypeError(`sessions[${index}].role is invalid`);
  const official = record.officialPiSession;
  if (official?.source !== "pi" || official?.agent !== "pi" || !["session_id", "session_path"].includes(official?.kind) || !text(official?.value, `sessions[${index}].officialPiSession.value`)) {
    throw new TypeError(`sessions[${index}] requires an official Pi session binding`);
  }
  for (const key of ["workspaceId", "tabId", "paneId", "terminalId"]) text(record?.binding?.[key], `sessions[${index}].binding.${key}`);
}
export function validateRegistry(value) {
  if (!value || value.schemaVersion !== SCHEMA_VERSION) throw new TypeError("unsupported authoritative registry schemaVersion");
  const route = value.route;
  if (route?.sessionName !== TRIAL_SESSION) throw new TypeError(`registry route must name ${TRIAL_SESSION}`);
  if (!path.isAbsolute(route?.configPath ?? "")) throw new TypeError("registry configPath must be absolute");
  if (!path.isAbsolute(route?.socketPath ?? "")) throw new TypeError("registry socketPath must be absolute");
  if (route?.protocol !== PINNED_PROTOCOL) throw new TypeError(`registry protocol must be ${PINNED_PROTOCOL}`);
  if (!Array.isArray(value.projects) || !Array.isArray(value.sessions)) throw new TypeError("registry projects and sessions arrays are required");
  value.projects.forEach((project, index) => {
    text(project?.canonicalId, `projects[${index}].canonicalId`); generation(project?.generation, `projects[${index}].generation`);
    if (!["current", "stale"].includes(project?.reconciliationState)) throw new TypeError(`projects[${index}].reconciliationState is invalid`);
    text(project?.stewardSessionCanonicalId, `projects[${index}].stewardSessionCanonicalId`);
  });
  value.sessions.forEach(validateSession);
  const officialOwners = new Map(); const bindingOwners = new Map();
  for (const session of value.sessions) {
    const officialKey = JSON.stringify([session.officialPiSession.source, session.officialPiSession.agent, session.officialPiSession.kind, session.officialPiSession.value]);
    const bindingKey = JSON.stringify([session.binding.workspaceId, session.binding.tabId, session.binding.paneId, session.binding.terminalId]);
    const officialOwner = officialOwners.get(officialKey); const bindingOwner = bindingOwners.get(bindingKey);
    if (officialOwner && officialOwner !== session.canonicalId) throw new TypeError(`cross-canonical collision in official Pi session: ${officialOwner} and ${session.canonicalId}`);
    if (bindingOwner && bindingOwner !== session.canonicalId) throw new TypeError(`cross-canonical collision in live binding: ${bindingOwner} and ${session.canonicalId}`);
    officialOwners.set(officialKey, session.canonicalId); bindingOwners.set(bindingKey, session.canonicalId);
  }
  return structuredClone(value);
}
function sameOfficial(a, b) { return a?.source === b?.source && a?.agent === b?.agent && a?.kind === b?.kind && a?.value === b?.value; }
function agentMatchesRecord(agent, record) {
  return sameOfficial(agent?.agent_session, record.officialPiSession)
    && agent?.workspace_id === record.binding.workspaceId && agent?.tab_id === record.binding.tabId
    && agent?.pane_id === record.binding.paneId && agent?.terminal_id === record.binding.terminalId;
}

/** Adapt the publisher-owned generation to the committed fail-closed resolver; AgentInfo supplies only fresh locators/session evidence. */
export function resolveOfficialSession(canonicalId, registryValue, agents = []) {
  const registry = validateRegistry(registryValue);
  const claims = registry.sessions.filter((item) => item.canonicalId === canonicalId);
  const bindings = claims.map((record) => {
    const exactAgents = agents.filter((agent) => agentMatchesRecord(agent, record));
    return {
      canonicalId: record.canonicalId, generation: record.generation, backend: "herdr",
      sessionName: registry.route.sessionName, socketPath: registry.route.socketPath, protocol: registry.route.protocol,
      workspaceId: record.binding.workspaceId, tabId: record.binding.tabId, paneId: record.binding.paneId,
      terminalId: record.binding.terminalId, piSessionRef: record.officialPiSession.value,
      reconciliationState: record.reconciliationState,
    };
  });
  const panes = [];
  for (const record of claims) for (const agent of agents.filter((item) => agentMatchesRecord(item, record))) {
    panes.push({ id: agent.pane_id, workspaceId: agent.workspace_id, tabId: agent.tab_id, terminalId: agent.terminal_id, piSessionRef: agent.agent_session.value, bindingGeneration: record.generation });
  }
  const resolution = resolveDestination({ canonicalId }, bindings, { sessionName: registry.route.sessionName, socketPath: registry.route.socketPath, protocol: registry.route.protocol, panes });
  if (resolution.status !== "unique") return resolution;
  const record = claims[0]; const exact = agents.filter((agent) => agentMatchesRecord(agent, record));
  if (exact.length !== 1) return { status: exact.length > 1 ? "ambiguous" : "stale", canonicalId };
  return { ...resolution, record, agent: exact[0] };
}

export function identifyCurrentSession({ registry, agents, context, paneId }) {
  if (!paneId || context?.focused_pane_id !== paneId) return { status: "context-mismatch" };
  const claims = registry.sessions.filter((record) => record.binding.paneId === paneId);
  const current = claims.map((record) => resolveOfficialSession(record.canonicalId, registry, agents)).filter((result) => result.status === "unique" && result.record.binding.paneId === paneId);
  return current.length === 1 ? current[0] : { status: current.length > 1 || claims.length > 1 ? "ambiguous" : "missing" };
}
function uniqueProject(canonicalId, registry) {
  const claims = registry.projects.filter((project) => project.canonicalId === canonicalId);
  if (claims.length !== 1) return { status: claims.length ? "ambiguous" : "missing" };
  if (claims[0].reconciliationState !== "current") return { status: "stale" };
  return { status: "unique", project: claims[0] };
}
export function planProjectActivation({ targetProjectCanonicalId, currentSessionCanonicalId, registry: value, agents, history }) {
  const registry = validateRegistry(value); const target = uniqueProject(targetProjectCanonicalId, registry);
  if (target.status !== "unique") return target;
  const currentClaims = registry.sessions.filter((session) => session.canonicalId === currentSessionCanonicalId);
  if (currentClaims.length !== 1) return { status: currentClaims.length ? "ambiguous-current" : "missing-current" };
  const current = resolveOfficialSession(currentSessionCanonicalId, registry, agents);
  if (current.status !== "unique") return { status: `current-${current.status}` };
  let canonicalSessionId;
  if (current.record.projectCanonicalId === targetProjectCanonicalId) canonicalSessionId = target.project.stewardSessionCanonicalId;
  else canonicalSessionId = history?.projects?.[targetProjectCanonicalId];
  if (!canonicalSessionId) return { status: "missing-history" };
  const resolution = resolveOfficialSession(canonicalSessionId, registry, agents);
  if (resolution.status !== "unique" || resolution.record.projectCanonicalId !== targetProjectCanonicalId) return { status: resolution.status === "unique" ? "wrong-project" : resolution.status };
  if (current.record.projectCanonicalId === targetProjectCanonicalId && resolution.record.role !== "steward") return { status: "steward-unavailable" };
  return { status: "ready", canonicalSessionId, projectCanonicalId: targetProjectCanonicalId, resolution };
}

export function renderManager(scope, pinsValue, registryValue) {
  const pins = parsePins(pinsValue); let registry;
  try { registry = validateRegistry(registryValue); } catch { registry = null; }
  const collection = scope === "project" ? registry?.projects : registry?.sessions;
  const lines = [`${scope === "project" ? "Project" : "Local"} pins`];
  pins.slots.forEach((id, index) => {
    let state = "empty";
    if (id) { const claims = (collection ?? []).filter((item) => item.canonicalId === id); state = claims.length === 1 ? claims[0].reconciliationState : "unavailable"; }
    lines.push(`${index + 1}  ${id ?? "—"}  [${state}]`);
  });
  lines.push("j/k select  J/K reorder  c clear  q/Esc exit"); return lines.join("\n");
}
export function reduceManagerState(state, action) {
  let selected = state.selected; let pins = parsePins(state.pins); let exit = state.exit;
  if (action === "down") selected = Math.min(4, selected + 1);
  if (action === "up") selected = Math.max(1, selected - 1);
  if (action === "move-up" && selected > 1) { pins = reorderPins(pins, selected, selected - 1); selected--; }
  if (action === "move-down" && selected < 4) { pins = reorderPins(pins, selected, selected + 1); selected++; }
  if (action === "clear") pins = clearPin(pins, selected);
  if (action === "exit") exit = true;
  return { selected, pins, exit };
}
