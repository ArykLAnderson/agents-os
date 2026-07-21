const RESOLUTION_STATES = new Set(["current", "stale"]);
const validatedResolutions = new WeakSet();
const validatedFocusPlans = new WeakSet();
const validatedPromptPlans = new WeakSet();

function assertText(value, field) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${field} is required`);
  return value;
}

function positiveGeneration(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function bindingMatchesSnapshot(binding, snapshot) {
  if (!positiveGeneration(binding.generation)) return false;
  if (!assertableText(binding.sessionName) || binding.sessionName !== snapshot?.sessionName) return false;
  if (!assertableText(binding.socketPath) || binding.socketPath !== snapshot?.socketPath) return false;
  if (!assertableText(binding.piSessionRef) || !assertableText(binding.terminalId)) return false;
  if (!Number.isSafeInteger(binding.protocol) || binding.protocol !== snapshot?.protocol) return false;

  const panes = (snapshot?.panes ?? []).filter((pane) =>
    pane.id === binding.paneId
    && pane.workspaceId === binding.workspaceId
    && pane.tabId === binding.tabId
    && pane.terminalId === binding.terminalId
    && pane.piSessionRef === binding.piSessionRef
    && pane.bindingGeneration === binding.generation
  );
  if (panes.length !== 1) return false;

  if (binding.agentName != null) {
    const agents = (snapshot?.agents ?? []).filter((agent) =>
      agent.name === binding.agentName
      && agent.paneId === binding.paneId
      && agent.terminalId === binding.terminalId
      && agent.piSessionRef === binding.piSessionRef
      && agent.bindingGeneration === binding.generation
    );
    if (agents.length !== 1) return false;
  }
  return true;
}

function assertableText(value) {
  return typeof value === "string" && value.length > 0;
}

/** Resolve canonical identity through one generation-bearing binding in one named session/socket snapshot. */
export function resolveDestination(destination, bindings, snapshot) {
  const canonicalId = assertText(destination?.canonicalId, "destination.canonicalId");
  const claims = bindings.filter((binding) => binding.canonicalId === canonicalId);
  if (claims.length === 0) return { status: "missing", canonicalId };

  const currentClaims = claims.filter((binding) =>
    RESOLUTION_STATES.has(binding.reconciliationState)
    && binding.reconciliationState === "current"
    && (destination.generation == null || binding.generation === destination.generation)
    && bindingMatchesSnapshot(binding, snapshot)
  );

  if (currentClaims.length > 1 || claims.length > 1) {
    return { status: "ambiguous", canonicalId, claims: claims.map(bindingEvidence) };
  }
  if (currentClaims.length === 0) {
    return { status: "stale", canonicalId, claims: claims.map(bindingEvidence) };
  }
  const result = Object.freeze({ status: "unique", canonicalId, binding: Object.freeze(structuredClone(currentClaims[0])) });
  validatedResolutions.add(result);
  return result;
}

function bindingEvidence(binding) {
  return {
    canonicalId: binding.canonicalId,
    generation: binding.generation,
    backend: binding.backend,
    sessionName: binding.sessionName,
    socketPath: binding.socketPath,
    workspaceId: binding.workspaceId,
    tabId: binding.tabId,
    paneId: binding.paneId,
    terminalId: binding.terminalId,
    piSessionRef: binding.piSessionRef,
    protocol: binding.protocol,
    reconciliationState: binding.reconciliationState,
  };
}

/** Pins store stable identity only, never backend labels or locators. */
export function assignPin(pins, slot, canonicalId) {
  if (!Number.isInteger(slot) || slot < 1 || slot > 4) throw new RangeError("slot must be 1..4");
  return { ...pins, [slot]: assertText(canonicalId, "canonicalId") };
}

export function resolvePin(pins, slot, bindings, snapshot) {
  const canonicalId = pins?.[slot];
  return canonicalId ? resolveDestination({ canonicalId }, bindings, snapshot) : { status: "missing", slot };
}

/** Only an explicit human focus changes the two-destination history. */
export function recordFocus(history = {}, canonicalId, cause) {
  assertText(canonicalId, "canonicalId");
  if (cause !== "human") return { ...history };
  if (history.current === canonicalId) return { ...history };
  return { current: canonicalId, previous: history.current ?? history.previous ?? null };
}

export function toggleFocus(history = {}) {
  if (!history.current || !history.previous) return { status: "missing", history: { ...history } };
  return {
    status: "ready",
    canonicalId: history.previous,
    history: { current: history.previous, previous: history.current },
  };
}

export function planOpen({ canonicalId, kind = "recover", focus = false } = {}) {
  if (focus !== false) throw new Error("background open plans must set focus=false");
  return { effect: "session.open", canonicalId: assertText(canonicalId, "canonicalId"), kind, focus: false };
}

export function planFocus(resolution, cause = "human") {
  if (!validatedResolutions.has(resolution)) throw new Error("focus requires a validated unique current binding");
  if (cause !== "human") throw new Error("only explicit human focus may construct a focus plan");
  const plan = Object.freeze({ effect: "session.focus", binding: resolution.binding, cause: "human", focus: true });
  validatedFocusPlans.add(plan);
  return plan;
}

export function planPrompt({ resolution, exactContent, correlationId, approved } = {}) {
  if (approved !== true) throw new Error("prompt requires immediate human approval");
  if (!validatedResolutions.has(resolution)) throw new Error("prompt requires a validated unique current binding");
  if (!resolution.binding.agentName) throw new Error("prompt binding requires one source-verified agent name");
  const plan = Object.freeze({
    effect: "agent.prompt",
    binding: resolution.binding,
    exactContent: assertText(exactContent, "exactContent"),
    correlationId: assertText(correlationId, "correlationId"),
    approved: true,
    retry: "never-on-uncertain-delivery",
  });
  validatedPromptPlans.add(plan);
  return plan;
}

export function isValidatedFocusPlan(plan) {
  return validatedFocusPlans.has(plan);
}

export function isValidatedPromptPlan(plan) {
  return validatedPromptPlans.has(plan);
}
