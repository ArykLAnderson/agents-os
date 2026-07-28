import {
  canonicalSuccessorCommitDigest, invokeSuccessorMechanicalOperation, successorDigest,
} from "../substrate/mechanical-successor.mjs";

const ID = /^[a-z][a-z0-9_-]*:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
const identity = (value, field, prefix) => {
  if (typeof value !== "string" || !ID.test(value) || (prefix && !value.startsWith(`${prefix}:`))) throw new PlacementError("placement_request_invalid", `${field} must be an exact ${prefix ?? ""} identity.`);
  return value;
};

export class PlacementError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// Aggregate façades own every semantic family and query representation. This
// seam adds exactly one owner-neutral placement family and uses one substrate
// commit; it never creates a follow-up semantic owner revision.
export const PLACEMENT_ADAPTER_CONTRACT = Object.freeze([
  "commit", "readChatBinding", "readCurrent", "readReceipt", "readRevision", "resolveNamespace",
]);

function placement(value) {
  const common = ["origin", "placement_family_id", "placement_version_id", "predecessor_version_id", "provenance"];
  if (exact(value, [...common, "namespace_id"])) return {
    namespace_id: identity(value.namespace_id, "placement.namespace_id", "namespace"),
    placement_family_id: identity(value.placement_family_id, "placement.placement_family_id", "placement-family"),
    placement_version_id: identity(value.placement_version_id, "placement.placement_version_id", "version"),
    origin: value.origin, provenance: value.provenance, predecessor_version_id: value.predecessor_version_id,
    selection: { kind: "namespace" },
  };
  if (exact(value, [...common, "chat_id", "chat_revision_id"])) return {
    chat_id: identity(value.chat_id, "placement.chat_id", "chat"),
    chat_revision_id: identity(value.chat_revision_id, "placement.chat_revision_id", "owner-revision"),
    placement_family_id: identity(value.placement_family_id, "placement.placement_family_id", "placement-family"),
    placement_version_id: identity(value.placement_version_id, "placement.placement_version_id", "version"),
    origin: value.origin, provenance: value.provenance, predecessor_version_id: value.predecessor_version_id,
    selection: { kind: "chat_default", chat_id: value.chat_id, chat_revision_id: value.chat_revision_id },
  };
  throw new PlacementError("placement_request_invalid", "Placement must use exact Chat defaulting or explicit Namespace mode.");
}
function aggregate(value) {
  if (!exact(value, ["current_projection", "normalized", "outbox", "query", "selections", "versions"])) throw new PlacementError("placement_request_invalid", "aggregate must be a complete opaque owner envelope.");
  if (!Array.isArray(value.versions) || !Array.isArray(value.selections) || value.versions.length > 256 || value.selections.length > 256 || !Array.isArray(value.outbox) || !value.normalized || !value.current_projection || !value.query || typeof value.query !== "object") throw new PlacementError("placement_request_invalid", "aggregate is not a bounded complete owner envelope.");
  if (!Array.isArray(value.query.documents) || !Array.isArray(value.query.edges) || typeof value.query.digest !== "string") throw new PlacementError("placement_request_invalid", "aggregate query material must include documents, edges, and digest.");
  if (successorDigest({ documents: value.query.documents, edges: value.query.edges }) !== value.query.digest) throw new PlacementError("placement_request_invalid", "aggregate query digest does not bind its canonical material.");
  return structuredClone(value);
}

// This digest deliberately excludes derived current-state effects. It binds
// the complete normalized caller meaning before receipt lookup, so a settled
// operation cannot disclose its result for a different aggregate, placement,
// Context guard, or P/R query request.
export function canonicalPlacementCommitRequestDigest(request, selected) {
  return successorDigest({ domain: "casebook-placement-generation-request@1", request: {
    operation_id: request.operation_id, owner: request.owner, expected_revision: request.expected_revision,
    revision_id: request.revision_id, event: request.event, aggregate: request.aggregate,
    placement: selected,
  } });
}

export function createPlacementGenerationFoundation(adapter) {
  if (!exact(adapter, PLACEMENT_ADAPTER_CONTRACT) || PLACEMENT_ADAPTER_CONTRACT.some((name) => typeof adapter[name] !== "function")) throw new PlacementError("placement_adapter_invalid", "A complete closed placement adapter is required.");

  async function envelope(request, current, selected, semantic, namespace) {
    if (!exact(request, ["aggregate", "event", "expected_revision", "operation_id", "owner", "placement", "revision_id"])) throw new PlacementError("placement_request_invalid", "placement commit has an incompatible shape.");
    if (!exact(request.owner, ["id", "kind"])) throw new PlacementError("placement_request_invalid", "owner must contain exactly id and kind.");
    const owner = { id: identity(request.owner.id, "owner.id", request.owner.kind), kind: request.owner.kind };
    identity(request.revision_id, "revision_id", "owner-revision"); identity(request.event, "event", "event");
    if (!Number.isInteger(request.expected_revision) || request.expected_revision < 0 || current.revision_number !== request.expected_revision) throw new PlacementError("revision_conflict", "The exact current owner revision changed.");
    if (!namespace || namespace.lifecycle !== "active" || !namespace.namespace_revision_id) throw new PlacementError("namespace_unavailable", "Placement requires exact active Context Namespace evidence.");
    const aggregateEnvelope = aggregate(request.aggregate);
    if (aggregateEnvelope.selections.some((item) => item?.family_id === selected.placement_family_id) || aggregateEnvelope.versions.some((item) => item?.family_id === selected.placement_family_id || item?.version_id === selected.placement_version_id)) throw new PlacementError("placement_family_collision", "Placement family/version must not collide with aggregate semantic material.");
    const placed = { namespace_id: selected.namespace_id, placement_family_id: selected.placement_family_id, placement_version_id: selected.placement_version_id };
    const placementChanged = !current.placement || Object.entries(placed).some(([key, value]) => current.placement[key] !== value);
    const queryChanged = current.query_digest !== aggregateEnvelope.query.digest;
    if (!placementChanged && !queryChanged && current.aggregate_digest === successorDigest({ normalized: aggregateEnvelope.normalized, selections: aggregateEnvelope.selections, versions: aggregateEnvelope.versions })) throw new PlacementError("placement_no_change", "Placement and complete aggregate envelope already match current state.");
    const placementContent = Object.freeze({ schema: "owner-placement-evidence@2", family_id: placed.placement_family_id, version_id: placed.placement_version_id, namespace_id: placed.namespace_id, origin: selected.origin, provenance: selected.provenance, predecessor_version_id: selected.predecessor_version_id, commit_identity: request.revision_id, selection: selected.selection });
    // An unchanged placement is reselected with the aggregate revision rather
    // than inserted again; every changed placement receives a new version.
    const versions = [...aggregateEnvelope.versions, ...(placementChanged ? [{ family_id: placed.placement_family_id, version_id: placed.placement_version_id, content: placementContent, content_digest: successorDigest(placementContent) }] : [])];
    const selections = [...aggregateEnvelope.selections, { family_id: placed.placement_family_id, version_id: placed.placement_version_id }];
    const aggregateDigest = successorDigest({ normalized: aggregateEnvelope.normalized, selections: aggregateEnvelope.selections, versions: aggregateEnvelope.versions });
    const projection = Object.freeze({ ...aggregateEnvelope.current_projection, _mechanical_placement: placed, _mechanical_query_digest: aggregateEnvelope.query.digest });
    const history = Object.freeze({ schema: "owner-placement-history@2", owner_id: owner.id, revision_id: request.revision_id, revision_number: current.revision_number + 1, placement: placed, placement_selection: selected.selection, placement_family_id: placed.placement_family_id, predecessor_version_id: selected.predecessor_version_id, commit_identity: request.revision_id });
    const placement_guard = Object.freeze({ namespace_id: namespace.namespace_id, namespace_revision_id: namespace.namespace_revision_id, chat: selected.chat ? { chat_id: selected.chat.chat_id, chat_revision_id: selected.chat.chat_revision_id } : null });
    return Object.freeze({ owner, expected_revision: request.expected_revision, revision_id: request.revision_id, operation_id: request.operation_id, event: request.event, placement_changed: placementChanged, query_changed: queryChanged, placement: placed, placement_selection: selected.selection, placement_content: placementContent, aggregate: { ...aggregateEnvelope, versions, selections }, aggregate_digest: aggregateDigest, current_projection: projection, placement_history: history, placement_guard, placement_request_digest: canonicalPlacementCommitRequestDigest({ ...request, owner, aggregate: aggregateEnvelope }, selected), commit_digest: successorDigest({ domain: "casebook-placement-generation@2", owner, expected_revision: request.expected_revision, placement: placed, aggregate_digest: aggregateDigest, query_digest: aggregateEnvelope.query.digest, revision_id: request.revision_id }) });
  }

  async function commit(request) {
    // Normalize all request-owned material before looking up a receipt. This
    // preserves retry settlement while refusing operation-id reuse without
    // exposing the earlier receipt or performing a write.
    const selected = placement(request?.placement);
    if (selected.selection.kind === "chat_default") {
      // This is an immutable revision lookup, not a resolution of the Chat's
      // current binding. The substrate guard below atomically rejects a
      // rebind after receipt lookup rather than reinterpreting this request.
      const chat = await adapter.readChatBinding({ chat_id: selected.chat_id, chat_revision_id: selected.chat_revision_id });
      if (!chat?.namespace_id) throw new PlacementError("context_stale", "The caller-selected Chat binding is no longer available.");
      selected.namespace_id = identity(chat.namespace_id, "chat.namespace_id", "namespace");
      selected.chat = { chat_id: selected.chat_id, chat_revision_id: selected.chat_revision_id };
    }

    if (!exact(request, ["aggregate", "event", "expected_revision", "operation_id", "owner", "placement", "revision_id"]) || !exact(request.owner, ["id", "kind"])) throw new PlacementError("placement_request_invalid", "placement commit has an incompatible shape.");
    const owner = { id: identity(request.owner.id, "owner.id", request.owner.kind), kind: request.owner.kind };
    identity(request.revision_id, "revision_id", "owner-revision"); identity(request.event, "event", "event");
    if (!Number.isInteger(request.expected_revision) || request.expected_revision < 0) throw new PlacementError("placement_request_invalid", "expected_revision must be a non-negative integer.");
    const aggregateEnvelope = aggregate(request.aggregate);
    const requestDigest = canonicalPlacementCommitRequestDigest({ ...request, owner, aggregate: aggregateEnvelope }, selected);
    const replay = await adapter.readReceipt({ operation_id: request.operation_id });
    if (replay) {
      if (replay.placement_request_digest === requestDigest) return replay;
      throw new PlacementError("idempotency_mismatch", "operation_id is settled for different canonical meaning.");
    }
    const namespace = await adapter.resolveNamespace({ namespace_id: selected.namespace_id });
    if (!namespace || namespace.lifecycle !== "active" || !namespace.namespace_revision_id) throw new PlacementError("context_stale", "Exact Context placement evidence is no longer active.");
    const current = await adapter.readCurrent({ owner });
    if (!current || !Number.isInteger(current.revision_number) || current.revision_number < 0) throw new PlacementError("placement_projection_invalid", "Adapter current owner projection is incomplete.");
    const built = await envelope({ ...request, owner, aggregate: aggregateEnvelope }, current, selected, null, namespace);
    const settled = await adapter.commit(built);
    return { ...settled, placement_changed: built.placement_changed, query_changed: built.query_changed, placement: built.placement, placement_selection: built.placement_selection };
  }
  async function resolve(request) {
    if (!exact(request, ["owner", "selector"]) || !exact(request.owner, ["id", "kind"])) throw new PlacementError("placement_request_invalid", "resolver requires exact owner and selector.");
    identity(request.owner.id, "owner.id", request.owner.kind);
    if (exact(request.selector, ["current"]) && request.selector.current === true) return adapter.readCurrent({ owner: request.owner });
    if (exact(request.selector, ["revision_id"])) { identity(request.selector.revision_id, "selector.revision_id", "owner-revision"); return adapter.readRevision({ owner: request.owner, revision_id: request.selector.revision_id }); }
    throw new PlacementError("placement_selector_invalid", "Resolver selects current or one exact placement revision.");
  }
  async function resolveSubordinate(request) {
    const resolved = await resolve(request);
    if (!resolved || !resolved.placement?.namespace_id) return { status: "not_visible" };
    return { status: "found", namespace_id: resolved.placement.namespace_id, placement_version_id: resolved.placement.placement_version_id, revision_id: resolved.revision_id };
  }
  return Object.freeze({ commit, resolve, resolveSubordinate });
}

export function createSuccessorSqlitePlacementAdapter(binding) {
  if (!exact(binding, ["admission", "admission_slot_id", "configuration", "mechanical_options", "store_id", "workspace_id"]) || (binding.mechanical_options != null && !exact(binding.mechanical_options, ["admissionRegistry"]))) throw new PlacementError("placement_adapter_invalid", "SQLite placement binding must be exact.");
  const base = Object.freeze({ configuration: binding.configuration, store_id: identity(binding.store_id, "store_id", "store"), workspace_id: identity(binding.workspace_id, "workspace_id", "workspace"), admission_slot_id: identity(binding.admission_slot_id, "admission_slot_id", "admission-slot"), admission: binding.admission });
  const mechanicalOptions = binding.mechanical_options ?? undefined;
  const read = async (operation, value) => { const result = await invokeSuccessorMechanicalOperation({ operation, ...base, ...value }, mechanicalOptions); if (!result.ok) throw new PlacementError(result.failure.code, result.failure.message); return result.result; };
  const context = async (operation, value) => { const { canonicalContextRequestDigest, invokeContextOperation } = await import("../context/index.mjs"); const request = { operation, ...base, ...value }; request.request_digest = canonicalContextRequestDigest(base.store_id, request); const result = await invokeContextOperation(request); if (!result.ok) throw new PlacementError(result.failure.code, result.failure.message); return result.result; };
  return Object.freeze({
    async readCurrent({ owner }) { const result = await read("substrate.read_owner_current", { owner }); if (result.status === "not_visible") return { revision_number: 0, placement: null, query_digest: null, aggregate_digest: null }; const p = result.current_projection ?? {}; return { revision_number: result.revision_number, revision_id: result.revision_id, placement: p._mechanical_placement ?? null, query_digest: p._mechanical_query_digest ?? null, aggregate_digest: result.normalized?._mechanical_aggregate_digest ?? null }; },
    async readReceipt({ operation_id }) { const result = await read("substrate.get_receipt", { operation_id }); return result.status === "settled" ? { ...result.result, receipt: result.receipt, idempotent_replay: true } : null; },
    async readRevision({ owner, revision_id }) { const result = await read("substrate.read_owner_revision", { owner, revision_id }); if (result.status === "not_visible") return null; const h = result.placement_history ?? {}; return { revision_id: result.revision_id, revision_number: result.revision_number, placement: h.placement ?? null, placement_selection: h.placement_selection ?? null }; },
    async readChatBinding({ chat_id, chat_revision_id }) { const result = await context("chat.history", { chat_id }); const row = result.revisions?.find((value) => value.chat_revision_id === chat_revision_id); return row ? { namespace_id: row.namespace_id } : null; },
    async resolveNamespace({ namespace_id }) { const result = await context("namespace.read", { namespace_id }); const row = result.revisions?.[0]; if (!row || row.lifecycle !== "active") return null;
      return { namespace_id, namespace_revision_id: row.namespace_revision_id, lifecycle: row.lifecycle };
    },
    async commit(envelope) {
      const raw = { envelope_version: 1, operation_id: envelope.operation_id, store_id: base.store_id, workspace_id: base.workspace_id, admission_slot_id: base.admission_slot_id, admission: base.admission, owner: envelope.owner, expected_revision: envelope.expected_revision,
        revision: { id: envelope.revision_id, number: envelope.expected_revision + 1, normalized: { ...envelope.aggregate.normalized, _mechanical_aggregate_digest: envelope.aggregate_digest }, versions: envelope.aggregate.versions, selections: envelope.aggregate.selections }, current_projection: envelope.current_projection, placement_history: envelope.placement_history, placement_guard: envelope.placement_guard, placement_request_digest: envelope.placement_request_digest, query: envelope.aggregate.query, generation_effects: { placement_changed: envelope.placement_changed, query_changed: envelope.query_changed }, event: { id: envelope.event, type: "placement.committed", payload: { owner_id: envelope.owner.id, revision_id: envelope.revision_id, placement: envelope.placement }, payload_digest: successorDigest({ owner_id: envelope.owner.id, revision_id: envelope.revision_id, placement: envelope.placement }) }, outbox: envelope.aggregate.outbox };
      raw.request_digest = canonicalSuccessorCommitDigest(base.store_id, raw);
      const result = await invokeSuccessorMechanicalOperation({ operation: "substrate.commit_revision", configuration: base.configuration, envelope: raw }, mechanicalOptions); if (!result.ok) throw new PlacementError(result.failure.code, result.failure.message);
      return { status: "settled", revision_id: envelope.revision_id, revision_number: envelope.expected_revision + 1, placement: envelope.placement, placement_selection: envelope.placement_selection, receipt: result.result.receipt, placement_changed: envelope.placement_changed, query_changed: envelope.query_changed, commit_digest: envelope.commit_digest };
    },
  });
}
