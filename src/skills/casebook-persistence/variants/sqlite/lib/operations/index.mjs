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

function validateAuthorityClaim(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.human_authorized !== true
    || !nonEmpty(value.acting_role)
    || !nonEmpty(value.authority_basis)) {
    throw new ConfigurationError(
      "human_authority_claim_required",
      "initialize_store and store-operation receipt lookup require an explicit human authority claim.",
    );
  }
  const claim = {
    human_authorized: true,
    acting_role: value.acting_role.trim(),
    authority_basis: value.authority_basis.trim(),
  };
  for (const key of ["causation", "correlation", "session"]) {
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
  if (receipt.operation_kind !== "initialize_store") {
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
    if (request.operation === "get_store_operation_receipt") return await getStoreOperationReceipt(request);
    return unsupported(request.operation);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      const authorityError = error.code === "human_authority_claim_required" || error.code === "authority_claim_invalid";
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
