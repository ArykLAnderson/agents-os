import { createHash } from "node:crypto";

const KIND = /^[a-z][a-z0-9_.-]{0,127}$/;
const SCHEMA = /^[a-z][a-z0-9_.-]{0,127}@\d+$/;
const ID = /^[a-z][a-z0-9_-]*:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DIGEST = /^[0-9a-f]{64}$/;
const PROFILE_HANDLE_KEYS = Object.freeze(["activation_fence", "profile_id", "profile_revision_id", "selection_id", "selection_revision_id"]);
const POLICY_GUARD_KEYS = Object.freeze([
  "admission_state_version_id", "expected_policy_content_digest", "expected_policy_owner_revision_id",
  "expected_policy_version_id", "expected_revocation_fence", "guard_kind", "policy_family_id",
  "policy_owner_id", "purpose", "required_disposition",
]);

export class AdmissionCapabilityError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = "AdmissionCapabilityError";
    this.code = code;
    this.failureClass = options.failureClass ?? "admission_unavailable";
    this.evidence = options.evidence ?? {};
  }
}

function object(value) { return value && typeof value === "object" && !Array.isArray(value); }
function exact(value, keys) { return object(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0"); }
function sqlText(value) { return value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`; }
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function digest(value) { return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex"); }
function requireKind(value, field) {
  if (typeof value !== "string" || !KIND.test(value)) throw new AdmissionCapabilityError("admission_registry_invalid", `${field} is invalid.`);
  return value;
}
function requireId(value, field) {
  if (typeof value !== "string" || !ID.test(value)) throw new AdmissionCapabilityError("admission_binding_invalid", `${field} is invalid.`);
  return value;
}

function validateOperationRow(value) {
  const keys = ["operation", "capability_class", "purpose", "owner_kinds", "profile_fence", "guard_kinds"];
  if (!exact(value, keys) || !["ordinary_cli", "host_context", "human_operational", "internal"].includes(value.capability_class)
    || !Array.isArray(value.owner_kinds) || !Array.isArray(value.guard_kinds)
    || new Set(value.owner_kinds).size !== value.owner_kinds.length || new Set(value.guard_kinds).size !== value.guard_kinds.length
    || value.profile_fence !== "profile-selection-fence@1") {
    throw new AdmissionCapabilityError("admission_registry_invalid", "An operation manifest row is incomplete or incompatible.");
  }
  requireKind(value.operation, "operation");
  requireKind(value.purpose, "purpose");
  for (const kind of value.owner_kinds) requireKind(kind, "owner_kinds[]");
  for (const kind of value.guard_kinds) if (kind !== "owner-policy-fence@1") throw new AdmissionCapabilityError("admission_registry_invalid", "An operation names an unsupported guard kind.");
  return Object.freeze({ ...value, owner_kinds: Object.freeze([...value.owner_kinds]), guard_kinds: Object.freeze([...value.guard_kinds]) });
}

function validateAdapter(value) {
  const keys = ["owner_kind", "adapter_version", "schemas", "operations", "complete_owner", "resource_deltas", "events", "results", "projections", "supported_guards"];
  if (!exact(value, keys) || !Number.isInteger(value.adapter_version) || value.adapter_version < 1
    || !Array.isArray(value.schemas) || !value.schemas.length || !Array.isArray(value.operations) || !value.operations.length
    || !Array.isArray(value.supported_guards) || new Set(value.operations).size !== value.operations.length
    || ![value.complete_owner, value.resource_deltas, value.events, value.results, value.projections].every((item) => item === true)) {
    throw new AdmissionCapabilityError("owner_adapter_unavailable", "An aggregate adapter registration is partial or incompatible.");
  }
  requireKind(value.owner_kind, "owner_kind");
  for (const operation of value.operations) requireKind(operation, "operations[]");
  for (const schema of value.schemas) if (typeof schema !== "string" || !SCHEMA.test(schema)) throw new AdmissionCapabilityError("owner_adapter_unavailable", "An aggregate adapter schema is invalid.");
  for (const guard of value.supported_guards) if (guard !== "owner-policy-fence@1") throw new AdmissionCapabilityError("owner_adapter_unavailable", "An aggregate adapter advertises an unsupported guard.");
  return Object.freeze({ ...value });
}

function validateLifecycle(value) {
  const keys = ["owner_kind", "descriptor_version", "descriptor_kind", "current_states", "mutation_states"];
  if (!exact(value, keys) || value.descriptor_kind !== "selected-version-lifecycle@1"
    || !Number.isInteger(value.descriptor_version) || value.descriptor_version < 1
    || !Array.isArray(value.current_states) || !value.current_states.length || !Array.isArray(value.mutation_states) || !value.mutation_states.length) {
    throw new AdmissionCapabilityError("owner_lifecycle_unavailable", "An owner lifecycle registration is missing or incompatible.");
  }
  requireKind(value.owner_kind, "owner_kind");
  for (const state of [...value.current_states, ...value.mutation_states]) requireKind(state, "lifecycle state");
  return Object.freeze({ ...value });
}

export function createAdmissionRegistry({ operations = [], adapters = [], lifecycles = [], guardKinds = ["owner-policy-fence@1"] } = {}) {
  if (![operations, adapters, lifecycles, guardKinds].every(Array.isArray)) throw new AdmissionCapabilityError("admission_registry_invalid", "Admission registry inputs must be closed arrays.");
  const guards = new Set(guardKinds);
  if (guards.size !== guardKinds.length || [...guards].some((kind) => kind !== "owner-policy-fence@1")) throw new AdmissionCapabilityError("admission_registry_invalid", "The guard registry is duplicated or unsupported.");
  const operationMap = new Map();
  for (const raw of operations) {
    const row = validateOperationRow(raw);
    if (operationMap.has(row.operation)) throw new AdmissionCapabilityError("admission_registry_invalid", "Duplicate operation manifest row.");
    operationMap.set(row.operation, row);
  }
  const adapterMap = new Map();
  for (const raw of adapters) {
    const adapter = validateAdapter(raw);
    if (adapterMap.has(adapter.owner_kind)) throw new AdmissionCapabilityError("owner_adapter_unavailable", "Duplicate aggregate adapter registration.");
    adapterMap.set(adapter.owner_kind, adapter);
  }
  const lifecycleMap = new Map();
  for (const raw of lifecycles) {
    const lifecycle = validateLifecycle(raw);
    if (lifecycleMap.has(lifecycle.owner_kind)) throw new AdmissionCapabilityError("owner_lifecycle_unavailable", "Duplicate owner lifecycle registration.");
    lifecycleMap.set(lifecycle.owner_kind, lifecycle);
  }
  for (const row of operationMap.values()) {
    for (const ownerKind of row.owner_kinds) {
      const adapter = adapterMap.get(ownerKind), lifecycle = lifecycleMap.get(ownerKind);
      if (!adapter || !adapter.operations.includes(row.operation)) throw new AdmissionCapabilityError("owner_adapter_unavailable", "An advertised operation lacks one complete aggregate adapter.");
      if (!lifecycle) throw new AdmissionCapabilityError("owner_lifecycle_unavailable", "An advertised operation lacks one closed lifecycle descriptor.");
      if (row.guard_kinds.some((kind) => !guards.has(kind) || !adapter.supported_guards.includes(kind))) throw new AdmissionCapabilityError("unsupported_guard", "An advertised operation lacks its required guard capability.");
    }
  }
  return Object.freeze({
    operation(operation) {
      const row = operationMap.get(operation);
      if (!row) throw new AdmissionCapabilityError("operation_admission_unavailable", "The operation is not in the closed admission manifest.");
      return row;
    },
    owner(ownerKind, operationAdmission = null) {
      const adapter = adapterMap.get(ownerKind), lifecycle = lifecycleMap.get(ownerKind);
      if (!adapter) throw new AdmissionCapabilityError("owner_adapter_unavailable", "The owner kind is not completely registered.");
      if (!lifecycle) throw new AdmissionCapabilityError("owner_lifecycle_unavailable", "The owner kind has no closed lifecycle descriptor.");
      if (operationAdmission != null) {
        const row = operationMap.get(operationAdmission.operation);
        if (!exact(operationAdmission, ["operation", "purpose"]) || !row || row.purpose !== operationAdmission.purpose || !adapter.operations.includes(row.operation)) {
          throw new AdmissionCapabilityError("owner_adapter_unavailable", "The owner kind has no complete adapter for the provider-derived operation and purpose.");
        }
        if (row.guard_kinds.some((kind) => !guards.has(kind) || !adapter.supported_guards.includes(kind))) {
          throw new AdmissionCapabilityError("unsupported_guard", "The owner adapter lacks the operation's registered guard capability.");
        }
      }
      return Object.freeze({ adapter, lifecycle });
    },
  });
}

export const PROFILE_OPERATION_ROWS = Object.freeze([
  ["profile.create", "profile.manage", ["profile"]],
  ["profile.revise", "profile.manage", ["profile"]],
  ["profile.activate", "profile.manage", ["profile-selection"]],
  ["profile.retire", "profile.manage", ["profile", "profile-selection"]],
  ["profile.read", "profile.read", ["profile"]],
  ["profile.history", "profile.read", ["profile"]],
].map(([operation, purpose, owner_kinds]) => Object.freeze({ operation, capability_class: operation.endsWith("read") || operation.endsWith("history") ? "ordinary_cli" : "human_operational", purpose, owner_kinds, profile_fence: "profile-selection-fence@1", guard_kinds: [] })));

const PROFILE_ADAPTER = Object.freeze({
  owner_kind: "profile", adapter_version: 1, schemas: ["admission-disclosure-profile@1"],
  operations: ["profile.create", "profile.revise", "profile.retire", "profile.read", "profile.history"],
  complete_owner: true, resource_deltas: true, events: true, results: true, projections: true, supported_guards: [],
});
const SELECTION_ADAPTER = Object.freeze({
  owner_kind: "profile-selection", adapter_version: 1, schemas: ["profile-selection@1"],
  operations: ["profile.activate", "profile.retire"], complete_owner: true, resource_deltas: true,
  events: true, results: true, projections: true, supported_guards: [],
});
const PROFILE_LIFECYCLES = Object.freeze(["profile", "profile-selection"].map((owner_kind) => Object.freeze({
  owner_kind, descriptor_version: 1, descriptor_kind: "selected-version-lifecycle@1",
  current_states: ["active"], mutation_states: ["candidate", "active", "superseded", "retired", "unavailable"],
})));

export const CONTEXT_OPERATION_ROWS = Object.freeze([
  ["namespace.create", "context.manage", ["namespace"], "ordinary_cli"], ["namespace.revise", "context.manage", ["namespace"], "human_operational"], ["namespace.retire", "context.manage", ["namespace"], "human_operational"], ["namespace.read", "context.read", ["namespace"], "ordinary_cli"], ["namespace.list", "context.read", ["namespace"], "ordinary_cli"], ["namespace.history", "context.read", ["namespace"], "ordinary_cli"], ["namespace.resolve", "context.read", ["namespace"], "internal"],
  ["project_default.create", "context.manage", ["project-default"], "human_operational"], ["project_default.revise", "context.manage", ["project-default"], "human_operational"], ["project_default.retire", "context.manage", ["project-default"], "human_operational"], ["project_default.read", "context.read", ["project-default"], "ordinary_cli"],
  ["chat.establish", "context.manage", ["chat"], "host_context"], ["chat.resume", "context.read", ["chat"], "host_context"], ["chat.fork", "context.manage", ["chat"], "host_context"], ["chat.rebind", "context.manage", ["chat"], "host_context"], ["chat.read", "context.read", ["chat"], "ordinary_cli"], ["chat.history", "context.read", ["chat"], "ordinary_cli"],
].map(([operation, purpose, owner_kinds, capability_class]) => Object.freeze({ operation, capability_class, purpose, owner_kinds, profile_fence: "profile-selection-fence@1", guard_kinds: [] })));
const CONTEXT_ADAPTERS = Object.freeze([
  ["namespace", ["context-namespace@1"], ["namespace.create", "namespace.revise", "namespace.retire", "namespace.read", "namespace.list", "namespace.history", "namespace.resolve"]],
  ["project-default", ["context-project-default@1"], ["project_default.create", "project_default.revise", "project_default.retire", "project_default.read"]],
  ["chat", ["context-chat@1"], ["chat.establish", "chat.resume", "chat.fork", "chat.rebind", "chat.read", "chat.history"]],
].map(([owner_kind, schemas, operations]) => Object.freeze({ owner_kind, adapter_version: 1, schemas, operations, complete_owner: true, resource_deltas: true, events: true, results: true, projections: true, supported_guards: [] })));
const CONTEXT_LIFECYCLES = Object.freeze(["namespace", "project-default", "chat"].map((owner_kind) => Object.freeze({ owner_kind, descriptor_version: 1, descriptor_kind: "selected-version-lifecycle@1", current_states: ["active"], mutation_states: ["active", "retired"] })));

export const CASE_OPERATION_ROWS = Object.freeze([
  ["case.create", "case.manage", "human_operational"],
  ["case.commit_revision", "case.manage", "human_operational"],
  ["case.tombstone.commit", "case.manage", "human_operational"],
  ["case.read", "case.read", "ordinary_cli"],
  ["case.resolve", "case.read", "ordinary_cli"],
  ["case.update", "case.manage", "human_operational"],
  ["case.tombstone", "case.manage", "human_operational"],
  ...["knowledge", "facet", "source", "evidence", "relationship"].flatMap((kind) => [
    ["read", "case.read", "ordinary_cli"], ["create", "case.manage", "human_operational"],
    ["update", "case.manage", "human_operational"], ["tombstone", "case.manage", "human_operational"],
  ].map(([action, purpose, capability_class]) => [`case.${kind}.${action}`, purpose, capability_class])),
].map(([operation, purpose, capability_class]) => Object.freeze({ operation, capability_class, purpose, owner_kinds: ["case"], profile_fence: "profile-selection-fence@1", guard_kinds: [] })));

export const FRAME_OPERATION_ROWS = Object.freeze([
  ["frame.create", "frame.manage", "human_operational"],
  ["frame.commit_revision", "frame.manage", "human_operational"],
  ["frame.read", "frame.read", "ordinary_cli"],
  ["frame.profile.read", "frame.read", "ordinary_cli"],
  ["frame.profile.update", "frame.manage", "human_operational"],
  ["frame.discovery.create", "frame.manage", "human_operational"],
  ["frame.discovery.read", "frame.read", "ordinary_cli"],
  ["frame.discovery.update", "frame.manage", "human_operational"],
  ["frame.discovery.settle", "frame.manage", "human_operational"],
  ["frame.discovery.tombstone", "frame.manage", "human_operational"],
  ["frame.discovery.reopen", "frame.manage", "human_operational"],
  ["frame.disposition_boundary.read", "frame.read", "ordinary_cli"],
  ["frame.disposition_boundary.create", "frame.manage", "human_operational"],
  ["frame.disposition_boundary.update", "frame.manage", "human_operational"],
  ["frame.disposition_boundary.close", "frame.manage", "human_operational"],
  ["frame.case_disposition.read", "frame.read", "ordinary_cli"],
  ["frame.case_disposition.create", "frame.manage", "human_operational"],
  ["frame.case_disposition.update", "frame.manage", "human_operational"],
  ["frame.case_disposition.classify", "frame.manage", "human_operational"],
  ["frame.case_disposition.settle", "frame.manage", "human_operational"],
].map(([operation, purpose, capability_class]) => Object.freeze({ operation, capability_class, purpose, owner_kinds: ["frame"], profile_fence: "profile-selection-fence@1", guard_kinds: [] })));

export const QUERY_ADMISSION_ROWS = Object.freeze([
  Object.freeze({ operation: "query.search", capability_class: "ordinary_cli", purpose: "query.search", owner_kinds: [], profile_fence: "profile-selection-fence@1", guard_kinds: [] }),
  Object.freeze({ operation: "query.resolve", capability_class: "ordinary_cli", purpose: "query.search", owner_kinds: [], profile_fence: "profile-selection-fence@1", guard_kinds: [] }),
  Object.freeze({ operation: "query.hydrate", capability_class: "ordinary_cli", purpose: "query.search", owner_kinds: [], profile_fence: "profile-selection-fence@1", guard_kinds: [] }),
  Object.freeze({ operation: "query.graph", capability_class: "ordinary_cli", purpose: "query.search", owner_kinds: [], profile_fence: "profile-selection-fence@1", guard_kinds: [] }),
  Object.freeze({ operation: "query.snapshot_reconcile", capability_class: "ordinary_cli", purpose: "query.search", owner_kinds: [], profile_fence: "profile-selection-fence@1", guard_kinds: [] }),
]);

export const SUBSTRATE_ADMISSION_ROWS = Object.freeze([
  Object.freeze({ operation: "substrate.commit_revision", capability_class: "internal", purpose: "substrate.commit_revision", owner_kinds: [], profile_fence: "profile-selection-fence@1", guard_kinds: ["owner-policy-fence@1"] }),
  Object.freeze({ operation: "substrate.get_receipt", capability_class: "internal", purpose: "receipt.read", owner_kinds: [], profile_fence: "profile-selection-fence@1", guard_kinds: [] }),
  // Closed, exact-target mechanical reads are intentionally separate from
  // aggregate semantics. They fence Profile before looking up target state.
  Object.freeze({ operation: "substrate.read_owner_current", capability_class: "internal", purpose: "substrate.read", owner_kinds: [], profile_fence: "profile-selection-fence@1", guard_kinds: [] }),
  Object.freeze({ operation: "substrate.read_owner_revision", capability_class: "internal", purpose: "substrate.read", owner_kinds: [], profile_fence: "profile-selection-fence@1", guard_kinds: [] }),
  Object.freeze({ operation: "substrate.resolve_family_binding", capability_class: "internal", purpose: "substrate.read", owner_kinds: [], profile_fence: "profile-selection-fence@1", guard_kinds: [] }),
  Object.freeze({ operation: "substrate.resolve_current_claim", capability_class: "internal", purpose: "substrate.read", owner_kinds: [], profile_fence: "profile-selection-fence@1", guard_kinds: [] }),
  Object.freeze({ operation: "integrity.observe", capability_class: "internal", purpose: "integrity.observe", owner_kinds: [], profile_fence: "profile-selection-fence@1", guard_kinds: [] }),
  Object.freeze({ operation: "projection.rebuild", capability_class: "internal", purpose: "projection.rebuild", owner_kinds: [], profile_fence: "profile-selection-fence@1", guard_kinds: [] }),
]);

// Case and Frame semantics are assembled by their owner-local adapters, while
// this registry admits the one owner-neutral transaction that publishes each.
const CASE_ADAPTER = Object.freeze({
  owner_kind: "case", adapter_version: 1, schemas: ["case-profile-final@1"],
  operations: [...CASE_OPERATION_ROWS.map((row) => row.operation), "substrate.commit_revision"], complete_owner: true, resource_deltas: true,
  events: true, results: true, projections: true, supported_guards: ["owner-policy-fence@1"],
});
const CASE_LIFECYCLE = Object.freeze({ owner_kind: "case", descriptor_version: 1, descriptor_kind: "selected-version-lifecycle@1", current_states: ["active"], mutation_states: ["active", "tombstoned"] });
const FRAME_ADAPTER = Object.freeze({
  owner_kind: "frame", adapter_version: 1, schemas: ["frame-profile@1"],
  operations: [...FRAME_OPERATION_ROWS.map((row) => row.operation), "substrate.commit_revision"], complete_owner: true, resource_deltas: true,
  events: true, results: true, projections: true, supported_guards: ["owner-policy-fence@1"],
});
const FRAME_LIFECYCLE = Object.freeze({ owner_kind: "frame", descriptor_version: 1, descriptor_kind: "selected-version-lifecycle@1", current_states: ["active"], mutation_states: ["active", "completed", "abandoned", "superseded"] });

export const FINAL_ADMISSION_REGISTRY = createAdmissionRegistry({
  operations: [...PROFILE_OPERATION_ROWS, ...CONTEXT_OPERATION_ROWS, ...CASE_OPERATION_ROWS, ...FRAME_OPERATION_ROWS, ...QUERY_ADMISSION_ROWS, ...SUBSTRATE_ADMISSION_ROWS],
  adapters: [PROFILE_ADAPTER, SELECTION_ADAPTER, ...CONTEXT_ADAPTERS, CASE_ADAPTER, FRAME_ADAPTER],
  lifecycles: [...PROFILE_LIFECYCLES, ...CONTEXT_LIFECYCLES, CASE_LIFECYCLE, FRAME_LIFECYCLE],
});

export function validateProfileHandle(value) {
  if (!exact(value, PROFILE_HANDLE_KEYS)) throw new AdmissionCapabilityError("admission_binding_invalid", "Profile admission binding must be exact.");
  for (const field of ["selection_id", "selection_revision_id", "profile_id", "profile_revision_id"]) requireId(value[field], field);
  if (!Number.isInteger(value.activation_fence) || value.activation_fence < 1) throw new AdmissionCapabilityError("admission_binding_invalid", "activation_fence must be positive.");
  return Object.freeze({ ...value });
}

export function validateOwnerPolicyGuard(value, purpose) {
  if (!exact(value, POLICY_GUARD_KEYS) || value.guard_kind !== "owner-policy-fence@1" || value.required_disposition !== "current-authorized") {
    throw new AdmissionCapabilityError("unsupported_guard", "The owner policy guard is missing or malformed.");
  }
  for (const field of ["policy_owner_id", "expected_policy_owner_revision_id", "policy_family_id", "expected_policy_version_id", "admission_state_version_id"]) requireId(value[field], field);
  if (!DIGEST.test(value.expected_policy_content_digest ?? "") || !Number.isInteger(value.expected_revocation_fence) || value.expected_revocation_fence < 0 || value.purpose !== purpose) {
    throw new AdmissionCapabilityError("authorization_changed", "The owner policy guard does not match provider-derived operation purpose.");
  }
  return Object.freeze({ ...value });
}

export function prepareAdmission({ registry = FINAL_ADMISSION_REGISTRY, operation, admissionSlotId, admission, ownerPolicyGuard = null, targetOwnerKind = null }) {
  const row = registry.operation(operation);
  if (!ID.test(admissionSlotId ?? "") || !exact(admission, ["binding", "kind"]) || admission.kind !== "sqlite_profile") {
    throw new AdmissionCapabilityError("admission_binding_invalid", "The SQLite Profile admission envelope is invalid.");
  }
  const binding = validateProfileHandle(admission.binding);
  if (targetOwnerKind != null) {
    requireKind(targetOwnerKind, "targetOwnerKind");
    registry.owner(targetOwnerKind, { operation: row.operation, purpose: row.purpose });
  }
  const guard = ownerPolicyGuard == null ? null : validateOwnerPolicyGuard(ownerPolicyGuard, row.purpose);
  if (guard && !row.guard_kinds.includes("owner-policy-fence@1")) throw new AdmissionCapabilityError("unsupported_guard", "The operation does not advertise an owner policy guard.");
  const evidence = {
    schema: "evaluated-admission-evidence@1", purpose: row.purpose, admission_slot_id: admissionSlotId,
    ...binding, ...(guard ? { owner_policy: {
      guard_kind: guard.guard_kind, policy_owner_id: guard.policy_owner_id,
      policy_owner_revision_id: guard.expected_policy_owner_revision_id, policy_family_id: guard.policy_family_id,
      policy_version_id: guard.expected_policy_version_id, admission_state_version_id: guard.admission_state_version_id,
      revocation_fence: guard.expected_revocation_fence, purpose: guard.purpose,
    } } : {}),
  };
  return Object.freeze({ row, admissionSlotId, binding, guard, targetOwnerKind, evidence: Object.freeze(evidence), evidenceDigest: digest(evidence) });
}

export function profileBindingPredicate(prepared) {
  const value = prepared, binding = value.binding;
  return `EXISTS(
    SELECT 1 FROM store_metadata m
    JOIN profile_selection_current s ON s.admission_slot_id=${sqlText(value.admissionSlotId)}
    JOIN owner_current selection_current ON selection_current.owner_id=s.selection_id AND selection_current.revision_id=s.selection_revision_id
    JOIN profile_selection_revisions selection_revision ON selection_revision.selection_revision_id=s.selection_revision_id AND selection_revision.selection_id=s.selection_id AND selection_revision.admission_slot_id=s.admission_slot_id
    JOIN profile_revision_records p ON p.profile_revision_id=s.profile_revision_id AND p.profile_id=s.profile_id
    JOIN owner_revision_selections profile_selection ON profile_selection.revision_id=p.profile_revision_id AND profile_selection.family_id=p.profile_id AND profile_selection.version_id=p.version_id
    JOIN owner_versions profile_version ON profile_version.version_id=p.version_id AND profile_version.owner_id=p.profile_id AND profile_version.family_id=p.profile_id
    WHERE m.singleton=1
      AND s.selection_id=${sqlText(binding.selection_id)}
      AND s.selection_revision_id=${sqlText(binding.selection_revision_id)}
      AND s.profile_id=${sqlText(binding.profile_id)}
      AND s.profile_revision_id=${sqlText(binding.profile_revision_id)}
      AND s.activation_fence=${binding.activation_fence}
      AND p.lifecycle='active'
      AND selection_revision.lifecycle='active'
      AND selection_revision.selected_profile_id=s.profile_id
      AND selection_revision.selected_profile_revision_id=s.profile_revision_id
      AND selection_revision.activation_fence=s.activation_fence
      AND p.content_json=profile_version.content_json AND p.content_digest=profile_version.content_digest
      AND json_extract(p.content_json,'$.schema')='admission-disclosure-profile@1'
  )`;
}

export function profileAdmissionPredicate(prepared) {
  const value = prepared;
  return `(${profileBindingPredicate(value)} AND EXISTS(
    SELECT 1 FROM profile_selection_current s
    JOIN profile_revision_records p ON p.profile_revision_id=s.profile_revision_id AND p.profile_id=s.profile_id
    WHERE s.admission_slot_id=${sqlText(value.admissionSlotId)}
      AND EXISTS(SELECT 1 FROM json_each(p.content_json,'$.purposes') WHERE value=${sqlText(value.row.purpose)})
      ${value.row.owner_kinds.map((kind) => `AND EXISTS(SELECT 1 FROM json_each(p.content_json,'$.object_kinds') WHERE value=${sqlText(kind)})`).join("\n      ")}
      ${value.targetOwnerKind ? `AND EXISTS(SELECT 1 FROM json_each(p.content_json,'$.object_kinds') WHERE value=${sqlText(value.targetOwnerKind)})` : ""}
      ${value.row.purpose === "receipt.read" ? "AND json_extract(p.content_json,'$.disclosure.receipts')=1" : ""}
  ))`;
}

export function ownerPolicyPredicate(prepared) {
  const guard = prepared.guard;
  if (!guard) return "1";
  return `EXISTS(
    SELECT 1 FROM owner_policy_admission_current a
    JOIN owner_current c ON c.owner_id=a.policy_owner_id AND c.revision_id=a.policy_owner_revision_id
    JOIN owner_revision_selections s ON s.revision_id=a.policy_owner_revision_id AND s.family_id=a.policy_family_id AND s.version_id=a.policy_version_id
    JOIN owner_versions v ON v.version_id=a.policy_version_id AND v.owner_id=a.policy_owner_id AND v.family_id=a.policy_family_id
    WHERE a.policy_owner_id=${sqlText(guard.policy_owner_id)}
      AND a.policy_owner_revision_id=${sqlText(guard.expected_policy_owner_revision_id)}
      AND a.policy_family_id=${sqlText(guard.policy_family_id)}
      AND a.policy_version_id=${sqlText(guard.expected_policy_version_id)}
      AND a.policy_content_digest=${sqlText(guard.expected_policy_content_digest)}
      AND v.content_digest=a.policy_content_digest
      AND a.admission_state_version_id=${sqlText(guard.admission_state_version_id)}
      AND a.projection_schema='owner-policy-admission-state@1'
      AND a.revocation_fence=${guard.expected_revocation_fence}
      AND a.disposition='current-authorized'
      AND EXISTS(SELECT 1 FROM json_each(a.purpose_scopes_json) WHERE value=${sqlText(prepared.row.purpose)})
  )`;
}

export function admissionEvidenceInsertSql(operationId, prepared) {
  const b = prepared.binding, policy = prepared.guard ? JSON.stringify(prepared.evidence.owner_policy) : null;
  return `INSERT INTO operation_admission_evidence VALUES(${sqlText(operationId)},${sqlText(prepared.row.purpose)},${sqlText(prepared.admissionSlotId)},${sqlText(b.selection_id)},${sqlText(b.selection_revision_id)},${sqlText(b.profile_id)},${sqlText(b.profile_revision_id)},${b.activation_fence},${sqlText(policy)},${sqlText(prepared.evidenceDigest)});`;
}
