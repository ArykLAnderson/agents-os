// Vendored, plugin-local subset of the committed Agent OS navigation resolver.
// It deliberately preserves generation/session/socket/protocol and exact-one matching semantics.
function text(value) { return typeof value === "string" && value.length > 0; }
function positive(value) { return Number.isSafeInteger(value) && value > 0; }
function evidence(binding) {
  return { canonicalId: binding.canonicalId, generation: binding.generation, backend: binding.backend, sessionName: binding.sessionName, socketPath: binding.socketPath, workspaceId: binding.workspaceId, tabId: binding.tabId, paneId: binding.paneId, terminalId: binding.terminalId, piSessionRef: binding.piSessionRef, protocol: binding.protocol, reconciliationState: binding.reconciliationState };
}
function matches(binding, snapshot) {
  if (!positive(binding.generation) || !text(binding.sessionName) || binding.sessionName !== snapshot?.sessionName) return false;
  if (!text(binding.socketPath) || binding.socketPath !== snapshot?.socketPath || !text(binding.piSessionRef) || !text(binding.terminalId)) return false;
  if (!Number.isSafeInteger(binding.protocol) || binding.protocol !== snapshot?.protocol) return false;
  return (snapshot?.panes ?? []).filter(pane => pane.id === binding.paneId && pane.workspaceId === binding.workspaceId && pane.tabId === binding.tabId && pane.terminalId === binding.terminalId && pane.piSessionRef === binding.piSessionRef && pane.bindingGeneration === binding.generation).length === 1;
}
export function resolveDestination(destination, bindings, snapshot) {
  if (!text(destination?.canonicalId)) throw new TypeError("destination.canonicalId is required");
  const canonicalId = destination.canonicalId; const claims = bindings.filter(binding => binding.canonicalId === canonicalId);
  if (claims.length === 0) return { status: "missing", canonicalId };
  const current = claims.filter(binding => binding.reconciliationState === "current" && (destination.generation == null || binding.generation === destination.generation) && matches(binding, snapshot));
  if (claims.length > 1 || current.length > 1) return { status: "ambiguous", canonicalId, claims: claims.map(evidence) };
  if (current.length === 0) return { status: "stale", canonicalId, claims: claims.map(evidence) };
  return { status: "unique", canonicalId, binding: Object.freeze(structuredClone(current[0])) };
}
