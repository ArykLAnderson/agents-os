import { createResourceCapabilityRegistry } from "./registry.mjs";
import { createResourceFoundation } from "./foundation.mjs";
import { createOwnerLifecycleRegistry } from "./owner-lifecycle.mjs";
import { invokeSubstrateOperation } from "../substrate/index.mjs";
import { CASE_OWNER_LIFECYCLE_ADAPTERS } from "../case/resources/complete.mjs";

const SUBORDINATE_KINDS = new Set(["knowledge", "source", "evidence"]);
const RECORDED_VISIBILITIES = new Set(["private", "internal", "restricted", "portable", "public"]);
const subordinateRegistry = createResourceCapabilityRegistry([...SUBORDINATE_KINDS].map((resource_kind) => ({
  owner_kind: "case",
  resource_kind,
  capability_version: 1,
})));
const subordinateFoundation = createResourceFoundation({
  registry: subordinateRegistry,
  ownerLifecycles: createOwnerLifecycleRegistry(CASE_OWNER_LIFECYCLE_ADAPTERS),
});

function mechanicalRevisionId(value) {
  return `owner-revision:${value.slice(value.indexOf(":") + 1)}`;
}

function typedRevisionId(kind, value) {
  return `${kind}-revision:${value.slice(value.indexOf(":") + 1)}`;
}

function appliedView(value) {
  if (!value || typeof value !== "object") return null;
  const view_id = value.view_id ?? value.id;
  const view_policy_revision_id = value.view_policy_revision_id ?? value.policy_revision_id;
  return typeof view_id === "string" && typeof view_policy_revision_id === "string"
    ? { view_id, view_policy_revision_id }
    : null;
}

function exactAppliedView(result, context) {
  const observed = appliedView(result?.applied_view);
  return observed?.view_id === context.view_id
    && observed?.view_policy_revision_id === context.view_policy_revision_id;
}

function selectedVersion(result, familyId) {
  return result?.revision?.selected_versions?.find((item) => item.family_id === familyId) ?? null;
}

function historicalSelectors(reference) {
  return [reference.observed_revision_id, reference.pinned_revision_id].filter(Boolean);
}

function referencesInFrame(frame) {
  const references = [];
  for (const key of ["case_links", "frame_links", "downstream_links"]) references.push(...(frame[key] ?? []));
  for (const item of frame.discovery ?? []) references.push(...(item.dependencies ?? []));
  for (const disposition of frame.case_dispositions ?? []) {
    if (disposition.case_id == null) continue;
    references.push({
      target_kind: "case",
      target_id: disposition.case_id,
      observed_revision_id: disposition.observed_case_revision_id,
      pinned_revision_id: disposition.pinned_case_revision_id,
    });
  }
  const unique = new Map();
  for (const reference of references) {
    const selectors = historicalSelectors(reference);
    // C1 governs immutable observed/pinned evidence. Unversioned links carry no
    // historical authority claim and must not trigger a current-target probe.
    if (!selectors.length) continue;
    for (const revisionId of selectors) {
      unique.set(`${reference.target_kind}\0${reference.target_id}\0${revisionId}`, {
        target_kind: reference.target_kind,
        target_id: reference.target_id,
        referenced_revision_id: revisionId,
      });
    }
  }
  return [...unique.values()];
}

function failureStatus(result) {
  if (result?.failure?.code === "not_visible" || result?.result?.status === "not_visible") return "denied";
  return "unsupported";
}

function authorizedVersion(version, subordinate) {
  if (!version || version.content?.state === "hidden") return version ? "denied" : "unsupported";
  if (!subordinate) return "authorized";
  return RECORDED_VISIBILITIES.has(version.content?.visibility) ? "authorized" : "unsupported";
}

function lifecycleState(result, familyId) {
  const version = selectedVersion(result, familyId);
  if (!version || version.content?.state === "hidden") return null;
  return version.content?.state === "tombstoned" ? "tombstoned" : "active";
}

export function createHistoricalVisibilityService({
  resolveBinding,
  readOwnerRevision,
  readOwnerCurrent,
}) {
  if (![resolveBinding, readOwnerRevision, readOwnerCurrent].every((operation) => typeof operation === "function")) {
    throw new TypeError("Historical visibility requires exact binding, owner-history, and current-owner resolvers.");
  }

  async function exactHistorical(request, reference, operationFence = null) {
    const subordinate = SUBORDINATE_KINDS.has(reference.target_kind);
    const revisionId = mechanicalRevisionId(reference.referenced_revision_id);
    let binding = null;
    if (subordinate) {
      const resolved = await resolveBinding({
        store_id: request.store_id,
        context: request.context,
        configuration: request.configuration,
        resource_kind: reference.target_kind,
        resource_id: reference.target_id,
        selector: { owner_revision_id: revisionId },
      });
      if (!resolved?.ok || resolved.result?.status !== "found") return { status: failureStatus(resolved) };
      if (!exactAppliedView(resolved.result, request.context)
        || (operationFence != null && resolved.result.operation_fence !== operationFence)) return { status: "unsupported" };
      binding = resolved.result;
    }
    const targetOwner = subordinate
      ? binding.binding.owner
      : { id: reference.target_id, kind: reference.target_kind };
    const exact = await readOwnerRevision({
      operation: "read_owner_revision",
      store_id: request.store_id,
      context: request.context,
      configuration: request.configuration,
      owner: targetOwner,
      revision_id: revisionId,
    });
    if (!exact?.ok) return { status: failureStatus(exact) };
    if (!exactAppliedView(exact.result, request.context)) return { status: "unsupported" };
    const fence = exact.result.operation_fence;
    if ((operationFence != null && fence !== operationFence)
      || (binding && (binding.operation_fence !== fence
        || binding.binding.owner_revision.id !== exact.result.revision.id
        || binding.binding.owner.id !== exact.result.owner.id))) {
      return { status: "unsupported" };
    }
    if (!subordinate && (exact.result.owner.id !== reference.target_id || exact.result.owner.kind !== reference.target_kind)) {
      return { status: "denied" };
    }
    const familyId = subordinate ? reference.target_id : exact.result.owner.id;
    const version = selectedVersion(exact.result, familyId);
    if (binding && binding.binding.version_id !== version?.version_id) return { status: "unsupported" };
    const authorization = authorizedVersion(version, subordinate);
    if (authorization !== "authorized") return { status: authorization };
    return { status: "authorized", owner: exact.result.owner, familyId, version, revision: exact.result.revision, fence, subordinate };
  }

  async function observeCurrent(request, reference, historical) {
    const subordinate = historical.subordinate;
    let binding = null;
    if (subordinate) {
      const resolved = await resolveBinding({
        store_id: request.store_id,
        context: request.context,
        configuration: request.configuration,
        resource_kind: reference.target_kind,
        resource_id: reference.target_id,
        selector: { current: true },
      });
      if (!resolved?.ok || resolved.result?.status !== "found" || !exactAppliedView(resolved.result, request.context)) return null;
      binding = resolved.result;
    }
    const current = await readOwnerCurrent({
      operation: "read_owner_current",
      store_id: request.store_id,
      context: request.context,
      configuration: request.configuration,
      owner: subordinate ? binding.binding.owner : historical.owner,
    });
    if (!current?.ok || !exactAppliedView(current.result, request.context)) return null;
    const observationFence = current.result.operation_fence;
    if (!Number.isInteger(observationFence) || (binding && (binding.operation_fence !== observationFence
      || binding.binding.owner_revision.id !== current.result.revision.id))) return null;
    const familyId = subordinate ? reference.target_id : current.result.owner.id;
    const state = lifecycleState(current.result, familyId);
    if (state == null) return null;
    const currentVersion = selectedVersion(current.result, familyId);
    const driftState = state === "tombstoned"
      ? "tombstoned"
      : current.result.revision.id === historical.revision.id && currentVersion.version_id === historical.version.version_id
        ? "current"
        : "advanced";
    return {
      target_kind: reference.target_kind,
      target_id: reference.target_id,
      referenced_revision_id: reference.referenced_revision_id,
      state: driftState,
      current_revision_id: typedRevisionId(reference.target_kind, current.result.revision.id),
      authorization_fence: historical.fence,
      observation_fence: observationFence,
    };
  }

  return Object.freeze({
    async authorizeFrame({ request, frame }) {
      // Profile admission is applied by each exact owner-history/current read.
      // A Frame carries no placement or authority-scope claim of its own.
      const authorizedReferences = [];
      let operationFence = null;
      for (const reference of referencesInFrame(frame)) {
        const historical = await exactHistorical(request, reference, operationFence);
        if (historical.status !== "authorized") return { status: historical.status };
        operationFence ??= historical.fence;
        authorizedReferences.push({ reference, historical });
      }
      const observations = [];
      for (const { reference, historical } of authorizedReferences) {
        const observation = await observeCurrent(request, reference, historical);
        if (observation) observations.push(observation);
      }
      return {
        status: "authorized",
        applied_view: { view_id: request.context.view_id, view_policy_revision_id: request.context.view_policy_revision_id },
        ...(operationFence == null ? {} : { operation_fence: operationFence }),
        observations,
      };
    },
  });
}

const defaultService = createHistoricalVisibilityService({
  resolveBinding: (request) => subordinateFoundation.resolveBinding(request),
  readOwnerRevision: (request) => invokeSubstrateOperation(request),
  readOwnerCurrent: (request) => invokeSubstrateOperation(request),
});

export function authorizeFrameHistoricalVisibility(input) {
  return defaultService.authorizeFrame(input);
}
