import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { validateAuthorityConfiguration, ConfigurationError } from "../../../../shared/config.mjs";
import { loadAndValidateManifest } from "../../../../shared/manifest.mjs";
import {
  failure,
  PROTOCOL_ID,
  PROTOCOL_VERSION,
  RETRY_DISPOSITIONS,
  SCHEMA_ID,
  SCHEMA_VERSION,
  success,
  unsupported,
} from "../../../../shared/protocol.mjs";
import {
  nodeRuntimeIncompatibility,
  probeSqlite,
  selectSqliteBinary,
} from "../substrate/diagnostics.mjs";
import {
  createInitializedStore,
  inspectStore,
  readStoreOperationReceipt,
  settleStoreOperationReceipt,
} from "../substrate/index.mjs";

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function digest(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateOperationId(value) {
  if (!nonEmpty(value) || value.length > 256) {
    throw new ConfigurationError("operation_id_invalid", "operation_id must be a non-empty bounded string.");
  }
  return value;
}

function validateAuthorityClaim(value, { requireHumanConfirmation = false } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.human_authorized !== true
    || !nonEmpty(value.acting_role)
    || !nonEmpty(value.authority_basis)) {
    throw new ConfigurationError(
      "human_authority_claim_required",
      "Exceptional store operations and receipt lookup require an explicit human authority claim.",
    );
  }
  if (requireHumanConfirmation && !nonEmpty(value.human_confirmation_reference)) {
    throw new ConfigurationError(
      "human_confirmation_reference_required",
      "Migration requires an explicit human confirmation reference.",
    );
  }
  const claim = {
    human_authorized: true,
    acting_role: value.acting_role.trim(),
    authority_basis: value.authority_basis.trim(),
  };
  for (const key of ["human_confirmation_reference", "causation", "correlation", "session"]) {
    if (value[key] != null) {
      if (!nonEmpty(value[key])) throw new ConfigurationError("authority_claim_invalid", `${key} must be a non-empty string when present.`);
      claim[key] = value[key].trim();
    }
  }
  return claim;
}

function initializationRequestDigest(storeId, operationId, authorityClaim) {
  return digest({
    operation: "initialize_store",
    operation_id: operationId,
    store_id: storeId,
    schema: { id: SCHEMA_ID, version: SCHEMA_VERSION },
    protocol: { id: PROTOCOL_ID, version: PROTOCOL_VERSION },
    initial_namespace: { key: "personal", lifecycle: "active" },
    initial_view: { audience_ceiling: "private", lifecycle: "active", namespace_grant: "personal" },
    authority_claim: authorityClaim,
  });
}

function exactObject(value, keys, code, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")) {
    throw new ConfigurationError(code, `${field} must contain exactly ${keys.join(", ")}.`);
  }
  return value;
}

function validateSchemaCondition(value, field) {
  exactObject(value, ["id", "version"], "schema_condition_invalid", field);
  if (!nonEmpty(value.id) || !Number.isInteger(value.version) || value.version < 1) {
    throw new ConfigurationError("schema_condition_invalid", `${field} must name a non-empty schema id and positive integer version.`);
  }
  return { id: value.id.trim(), version: value.version };
}

function validateMigrationEnvelope(request) {
  if (request.operation_kind !== "migration") {
    throw new ConfigurationError("operation_kind_invalid", "migrate_store requires operation_kind migration.");
  }
  if (!nonEmpty(request.purpose)) {
    throw new ConfigurationError("operation_purpose_required", "migrate_store requires a non-empty purpose.");
  }
  if (!nonEmpty(request.store_id)) {
    throw new ConfigurationError("store_id_invalid", "migrate_store requires the exact affected store_id.");
  }
  exactObject(request.expected, ["store_id", "schema", "operation_fence"], "migration_preconditions_invalid", "expected");
  if (!nonEmpty(request.expected.store_id)
    || !Number.isInteger(request.expected.operation_fence)
    || request.expected.operation_fence < 1) {
    throw new ConfigurationError("migration_preconditions_invalid", "expected store_id and positive operation_fence are required.");
  }
  exactObject(request.target, ["schema"], "migration_target_invalid", "target");
  const expectedSchema = validateSchemaCondition(request.expected.schema, "expected.schema");
  const targetSchema = validateSchemaCondition(request.target.schema, "target.schema");
  exactObject(
    request.migration,
    ["id", "from_version", "to_version", "schema_asset_sha256", "manifest_sha256"],
    "migration_identity_invalid",
    "migration",
  );
  const migration = {
    id: request.migration.id,
    from_version: request.migration.from_version,
    to_version: request.migration.to_version,
    schema_asset_sha256: request.migration.schema_asset_sha256,
    manifest_sha256: request.migration.manifest_sha256,
  };
  if (!nonEmpty(migration.id)
    || !Number.isInteger(migration.from_version)
    || !Number.isInteger(migration.to_version)
    || !/^[0-9a-f]{64}$/.test(migration.schema_asset_sha256)
    || !/^[0-9a-f]{64}$/.test(migration.manifest_sha256)) {
    throw new ConfigurationError("migration_identity_invalid", "migration must name exact versions and lowercase SHA-256 asset digests.");
  }
  if (request.canonical_state_effect !== "schema-change") {
    throw new ConfigurationError("canonical_state_effect_invalid", "migrate_store must explicitly declare schema-change.");
  }
  if (!Array.isArray(request.requested_postcondition_evidence)
    || request.requested_postcondition_evidence.length === 0
    || request.requested_postcondition_evidence.some((item) => !nonEmpty(item))) {
    throw new ConfigurationError("postcondition_evidence_invalid", "migrate_store requires named postcondition evidence.");
  }
  return {
    operation_kind: "migration",
    purpose: request.purpose.trim(),
    store_id: request.store_id.trim(),
    expected: {
      store_id: request.expected.store_id.trim(),
      schema: expectedSchema,
      operation_fence: request.expected.operation_fence,
    },
    target: { schema: targetSchema },
    migration,
    canonical_state_effect: "schema-change",
    requested_postcondition_evidence: [...request.requested_postcondition_evidence],
  };
}

function migrationRequestDigest(operationId, envelope, authorityClaim) {
  return digest({
    protocol: { id: PROTOCOL_ID, version: PROTOCOL_VERSION },
    operation: "migrate_store",
    operation_id: operationId,
    ...envelope,
    authority_claim: authorityClaim,
  });
}

async function prepare(request) {
  const runtime = { path: process.execPath, version: process.versions.node };
  const runtimeFailure = nodeRuntimeIncompatibility(runtime);
  if (runtimeFailure) return { failure: runtimeFailure };

  const configuration = validateAuthorityConfiguration(request.configuration);
  if (configuration.authority_mode !== "sqlite") {
    return {
      failure: failure("sqlite_authority_required", "This operation requires explicitly selected sqlite authority.", {
        failureClass: "configuration_or_store_unavailable",
      }),
    };
  }

  const manifestCheck = await loadAndValidateManifest();
  if (!manifestCheck.ok) {
    return {
      failure: failure("asset_incompatible", "Package manifest or asset verification failed.", {
        failureClass: "asset_incompatible",
        retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
        evidence: { problems: manifestCheck.problems },
      }),
    };
  }

  const selected = await selectSqliteBinary(configuration.sqlite.sqlite_bin);
  const probe = await probeSqlite(selected.path, path.dirname(configuration.sqlite.store_path));
  if (!probe.ok) {
    return {
      failure: failure("sqlite_feature_unsupported", "Selected SQLite runtime does not satisfy package requirements.", {
        failureClass: "sqlite_feature_unsupported",
        retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
        evidence: { version: probe.version, features: probe.features, problems: probe.problems },
      }),
    };
  }

  return { configuration, manifestCheck, sqliteBinary: selected.path };
}

function storeStateFailure(state) {
  if (state.status === "migration_required") {
    return failure("schema_migration_required", "The configured store requires an explicit compatible migration.", {
      failureClass: "schema_migration_required",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      correctiveGuidance: "Do not retry ordinary access or initialize over this store. Run a separately authorized migration or restore operation.",
      evidence: state.evidence,
    });
  }
  return failure(state.code ?? "store_unavailable", "The configured store is unavailable and was not modified.", {
    failureClass: "store_unavailable",
    retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
    correctiveGuidance: "Inspect, restore, or explicitly remove the incompatible/partial disposable store before initialization.",
    evidence: state.evidence,
  });
}

function assetDigest(manifest, assetId) {
  return manifest.assets.find((asset) => asset.id === assetId)?.sha256 ?? null;
}

async function initializeStore(request) {
  const operationId = validateOperationId(request.operation_id);
  const authorityClaim = validateAuthorityClaim(request.authority_claim);
  const prepared = await prepare(request);
  if (prepared.failure) return prepared.failure;

  const { configuration, manifestCheck, sqliteBinary } = prepared;
  const storePath = configuration.sqlite.store_path;
  const state = await inspectStore(sqliteBinary, storePath);

  if (state.status === "available") {
    // Receipt-first recovery: the requested operation receipt is examined before
    // any attempt to reinterpret or repeat initialization.
    const requestReceipt = await readStoreOperationReceipt(sqliteBinary, storePath, operationId);
    if (requestReceipt) {
      const expectedDigest = initializationRequestDigest(state.metadata.store_id, operationId, authorityClaim);
      if (requestReceipt.operation_kind !== "initialize_store" || requestReceipt.request_digest !== expectedDigest) {
        return failure("idempotency_mismatch", "operation_id is already settled for a different canonical request.", {
          failureClass: "idempotency_mismatch",
          retryDisposition: RETRY_DISPOSITIONS.NEVER,
          correctiveGuidance: "Do not retry with this operation_id. Reconcile against the settled receipt.",
          evidence: { operation_id: operationId, settled_kind: requestReceipt.operation_kind },
        });
      }
      return success("initialize_store", requestReceipt.result);
    }

    const original = await readStoreOperationReceipt(
      sqliteBinary,
      storePath,
      state.metadata.initialization_operation_id,
    );
    if (!original || original.operation_kind !== "initialize_store") {
      return storeStateFailure({ status: "unavailable", code: "store_partial_initialization", evidence: { initialization_receipt: "unavailable" } });
    }
    return success("initialize_store", original.result);
  }

  if (state.status !== "absent") return storeStateFailure(state);

  const initializedAt = new Date().toISOString();
  const identities = {
    storeId: `store:${randomUUID()}`,
    namespaceId: `namespace:${randomUUID()}`,
    viewId: `view:${randomUUID()}`,
    viewPolicyRevisionId: `view-policy:${randomUUID()}`,
  };
  const requestDigest = initializationRequestDigest(identities.storeId, operationId, authorityClaim);
  const migration = {
    id: "0001-initialize-store",
    schema_asset_sha256: assetDigest(manifestCheck.manifest, "sqlite-schema"),
    manifest_sha256: assetDigest(manifestCheck.manifest, "sqlite-migrations"),
  };
  const initialization = {
    store_id: identities.storeId,
    namespace: { id: identities.namespaceId, key: "personal", lifecycle: "active" },
    view: {
      id: identities.viewId,
      policy_revision_id: identities.viewPolicyRevisionId,
      policy_revision: 1,
      lifecycle: "active",
      audience_ceiling: "private",
      namespace_ids: [identities.namespaceId],
    },
    schema: {
      id: SCHEMA_ID,
      version: SCHEMA_VERSION,
      asset_sha256: migration.schema_asset_sha256,
      migration: { id: migration.id, manifest_sha256: migration.manifest_sha256 },
    },
    protocol: { id: PROTOCOL_ID, version: PROTOCOL_VERSION },
    package: {
      manifest_sha256: manifestCheck.manifest_sha256,
      content_digest: manifestCheck.manifest.content_digest.sha256,
    },
    initialized_at: initializedAt,
  };
  const resultDigest = digest(initialization);
  const result = {
    status: "settled",
    initialization,
    receipt: {
      operation_id: operationId,
      operation_kind: "initialize_store",
      store_id: identities.storeId,
      request_digest: requestDigest,
      outcome: "initialized",
      result_digest: resultDigest,
      settled_at: initializedAt,
      failure_class: null,
      retry_disposition: RETRY_DISPOSITIONS.NEVER,
      operation_fence: 1,
    },
  };

  try {
    await createInitializedStore(sqliteBinary, storePath, {
      identities,
      initializedAt,
      authorityClaim,
      protocol: { id: PROTOCOL_ID, version: PROTOCOL_VERSION },
      migration,
      receipt: {
        operation_id: operationId,
        request_digest: requestDigest,
        result_digest: resultDigest,
        result,
      },
    });
  } catch (error) {
    return failure("initialization_unavailable", "Atomic store initialization did not complete and no partial store is exposed as usable.", {
      failureClass: "store_unavailable",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE,
      correctiveGuidance: "Query the store-operation receipt before any retry. Inspect any existing target through explicit operator action.",
      evidence: { target_previously_absent: true, failure: error?.code ?? "initialization_failed" },
    });
  }
  return success("initialize_store", result);
}

function migrationPreconditionFailure(code, message, evidence) {
  return failure(code, message, {
    failureClass: "migration_precondition_failed",
    retryDisposition: RETRY_DISPOSITIONS.NEVER,
    correctiveGuidance: "Do not retry this operation ID. Reconcile the named store and exact schema conditions first.",
    evidence,
  });
}

async function migrateStore(request) {
  const operationId = validateOperationId(request.operation_id);
  const authorityClaim = validateAuthorityClaim(request.authority_claim, { requireHumanConfirmation: true });
  const envelope = validateMigrationEnvelope(request);
  if (envelope.store_id !== envelope.expected.store_id) {
    return migrationPreconditionFailure(
      "expected_store_mismatch",
      "The affected store and expected store identities do not match.",
      { affected_store_id: envelope.store_id, expected_store_id: envelope.expected.store_id },
    );
  }

  const prepared = await prepare(request);
  if (prepared.failure) return prepared.failure;
  const { configuration, sqliteBinary } = prepared;
  const storePath = configuration.sqlite.store_path;
  const state = await inspectStore(sqliteBinary, storePath);
  if (state.status !== "available") return storeStateFailure(state);

  // Establish immutable resolved-store scope before either replay or any new
  // exceptional receipt is admitted. A request naming another store never
  // writes an audit row into the configured store.
  if (envelope.store_id !== state.metadata.store_id) {
    return migrationPreconditionFailure(
      "expected_store_mismatch",
      "The configured store does not have the exact authorized store identity.",
      { expected_store_id: envelope.store_id, observed_store_id: state.metadata.store_id },
    );
  }

  const requestDigest = migrationRequestDigest(operationId, envelope, authorityClaim);
  const existing = await readStoreOperationReceipt(sqliteBinary, storePath, operationId);
  if (existing) {
    if (existing.operation_kind !== "migration" || existing.request_digest !== requestDigest) {
      return failure("idempotency_mismatch", "operation_id is already settled for a different canonical request.", {
        failureClass: "idempotency_mismatch",
        retryDisposition: RETRY_DISPOSITIONS.NEVER,
        correctiveGuidance: "Do not retry with this operation_id. Reconcile against the settled store-scoped receipt.",
        evidence: { operation_id: operationId, settled_kind: existing.operation_kind },
      });
    }
    return success("migrate_store", existing.result);
  }

  const observed = {
    store_id: state.metadata.store_id,
    schema: { id: state.metadata.schema_id, version: state.metadata.schema_version },
    operation_fence: state.operation_fence,
  };
  const schemaMatches = envelope.expected.schema.id === observed.schema.id
    && envelope.expected.schema.version === observed.schema.version;
  const fenceMatches = envelope.expected.operation_fence === observed.operation_fence;
  const migrationMatches = envelope.migration.from_version === envelope.expected.schema.version
    && envelope.migration.to_version === envelope.target.schema.version
    && envelope.target.schema.id === envelope.expected.schema.id
    && envelope.target.schema.version > envelope.expected.schema.version;

  let terminal;
  if (!schemaMatches) {
    terminal = {
      outcome: "rejected",
      code: "expected_schema_mismatch",
      failure_class: "migration_precondition_failed",
      retry_disposition: RETRY_DISPOSITIONS.NEVER,
      canonical_state_effect: "none",
    };
  } else if (!fenceMatches) {
    terminal = {
      outcome: "conflict",
      code: "expected_store_fence_mismatch",
      failure_class: "migration_precondition_failed",
      retry_disposition: RETRY_DISPOSITIONS.AFTER_RECONCILE,
      canonical_state_effect: "none",
    };
  } else if (!migrationMatches) {
    terminal = {
      outcome: "rejected",
      code: "migration_chain_invalid",
      failure_class: "migration_precondition_failed",
      retry_disposition: RETRY_DISPOSITIONS.NEVER,
      canonical_state_effect: "none",
    };
  } else {
    // L07-W01 terminates at the authorized envelope. L07-W02 will replace
    // this explicit boundary with snapshot-first transactional execution.
    terminal = {
      outcome: "blocked",
      code: "migration_execution_not_available",
      failure_class: "operation_unsupported",
      retry_disposition: RETRY_DISPOSITIONS.NEVER,
      canonical_state_effect: "none",
    };
  }

  const settledAt = new Date().toISOString();
  const preconditions = {
    expected: envelope.expected,
    observed,
    target: envelope.target,
    migration: envelope.migration,
  };
  const resultDigest = digest({ terminal, preconditions });
  const receipt = {
    operation_id: operationId,
    operation_kind: "migration",
    store_id: state.metadata.store_id,
    request_digest: requestDigest,
    outcome: terminal.outcome,
    result_digest: resultDigest,
    settled_at: settledAt,
    failure_class: terminal.failure_class,
    retry_disposition: terminal.retry_disposition,
    operation_fence: state.operation_fence + 1,
  };
  const result = { status: "settled", terminal, preconditions, receipt };
  let settled;
  try {
    settled = await settleStoreOperationReceipt(sqliteBinary, storePath, {
      receipt,
      authorityClaim,
      result,
      expectedOperationFence: state.operation_fence,
    });
  } catch (error) {
    // A concurrent caller may have inserted the same immutable operation ID
    // after our receipt-first read. Resolve that race from durable store state;
    // unrelated write failures remain classified by the outer boundary.
    settled = await readStoreOperationReceipt(sqliteBinary, storePath, operationId);
    if (!settled) throw error;
  }
  if (!settled) {
    return failure("store_operation_conflict", "The store operation fence changed before settlement.", {
      failureClass: "migration_precondition_failed",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE,
      correctiveGuidance: "Lookup this operation receipt, then reconcile the current store fence before using a new operation ID.",
      evidence: { expected_operation_fence: state.operation_fence },
    });
  }
  if (settled.operation_kind !== "migration" || settled.request_digest !== requestDigest) {
    return failure("idempotency_mismatch", "operation_id settled concurrently for a different canonical request.", {
      failureClass: "idempotency_mismatch",
      retryDisposition: RETRY_DISPOSITIONS.NEVER,
      correctiveGuidance: "Do not retry with this operation_id. Reconcile against the settled store-scoped receipt.",
      evidence: { operation_id: operationId, settled_kind: settled.operation_kind },
    });
  }
  return success("migrate_store", settled.result);
}

function validateLookupContext(context) {
  if (!context || typeof context !== "object"
    || !nonEmpty(context.view_id)
    || !nonEmpty(context.view_policy_revision_id)
    || !nonEmpty(context.purpose)) {
    throw new ConfigurationError(
      "view_context_required",
      "Receipt lookup requires view_id, exact view_policy_revision_id, and purpose.",
    );
  }
  return {
    view_id: context.view_id,
    view_policy_revision_id: context.view_policy_revision_id,
    purpose: context.purpose,
  };
}

async function getStoreOperationReceipt(request) {
  const operationId = validateOperationId(request.operation_id);
  const authorityClaim = validateAuthorityClaim(request.authority_claim);
  const context = validateLookupContext(request.context);
  if (!nonEmpty(request.store_id)) {
    throw new ConfigurationError("store_id_invalid", "store_id is required for store-operation receipt lookup.");
  }
  const prepared = await prepare(request);
  if (prepared.failure) return prepared.failure;

  const { configuration, sqliteBinary } = prepared;
  const state = await inspectStore(sqliteBinary, configuration.sqlite.store_path);
  if (state.status !== "available") {
    // Receipt lookup has not established visibility yet. Keep this unavailable
    // union deliberately opaque; detailed store inspection belongs only in an
    // explicitly authorized operator diagnostic, never this recovery surface.
    return success("get_store_operation_receipt", {
      status: "store_unavailable",
      failure_class: state.status === "migration_required" ? "schema_migration_required" : "store_unavailable",
      code: state.code ?? "store_unavailable",
      retry_disposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
    });
  }

  const visible = request.store_id === state.metadata.store_id
    && context.view_id === state.view.view_id
    && context.view_policy_revision_id === state.view.view_policy_revision_id
    && state.view.lifecycle === "active"
    && state.view.store_operation_receipts_visible === 1;
  if (!visible) return success("get_store_operation_receipt", { status: "not_visible" });

  const receipt = await readStoreOperationReceipt(sqliteBinary, configuration.sqlite.store_path, operationId);
  if (!receipt) {
    return success("get_store_operation_receipt", {
      status: "absent_at_fence",
      operation_fence: state.operation_fence,
    });
  }
  // This public exceptional recovery surface is deliberately restricted to
  // accepted exceptional operation kinds. Owner commit receipts are private
  // mechanical material and must be recovered only through a future typed
  // owner façade operation, not leaked through store-operation lookup.
  if (!["initialize_store", "migration"].includes(receipt.operation_kind)) {
    return success("get_store_operation_receipt", { status: "not_visible" });
  }
  return success("get_store_operation_receipt", {
    status: "settled",
    receipt,
    lookup_authority_claim: authorityClaim,
  });
}

export async function invokeExceptionalOperation(request) {
  try {
    if (request.operation === "initialize_store") return await initializeStore(request);
    if (request.operation === "migrate_store") return await migrateStore(request);
    if (request.operation === "get_store_operation_receipt") return await getStoreOperationReceipt(request);
    return unsupported(request.operation);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      const authorityError = [
        "human_authority_claim_required",
        "human_confirmation_reference_required",
        "authority_claim_invalid",
      ].includes(error.code);
      return failure(error.code, error.message, {
        failureClass: authorityError ? "authority_required" : "configuration_or_store_unavailable",
        evidence: error.evidence,
      });
    }
    return failure("internal_failure", "Exceptional operation failed without mutating accepted store state.", {
      failureClass: "internal_failure",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      correctiveGuidance: "Inspect diagnostics and query any uncertain operation receipt before retrying.",
      evidence: { error_code: "unexpected_exception" },
    });
  }
}
