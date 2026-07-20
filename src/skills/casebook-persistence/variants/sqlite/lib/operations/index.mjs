import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, realpath, rm, stat } from "node:fs/promises";
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
  applyMigrationV2,
  createInitializedStore,
  createVerifiedMigrationSnapshot,
  inspectStore,
  readStoreOperationReceipt,
  restoreVerifiedMigrationSnapshot,
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

function validateProtocolCondition(value, field) {
  exactObject(value, ["id", "version"], "protocol_condition_invalid", field);
  if (!nonEmpty(value.id) || !Number.isInteger(value.version) || value.version < 1) {
    throw new ConfigurationError("protocol_condition_invalid", `${field} must name a non-empty protocol id and positive integer version.`);
  }
  return { id: value.id.trim(), version: value.version };
}

function validateAssetCondition(value, field) {
  exactObject(value, ["schema_asset_sha256", "migration_manifest_sha256"], "migration_assets_invalid", field);
  if (!/^[0-9a-f]{64}$/.test(value.schema_asset_sha256)
    || !/^[0-9a-f]{64}$/.test(value.migration_manifest_sha256)) {
    throw new ConfigurationError("migration_assets_invalid", `${field} must name exact lowercase SHA-256 digests.`);
  }
  return { ...value };
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
  exactObject(request.safety, ["store_class", "authorization_reference"], "disposable_store_authorization_required", "safety");
  if (request.safety.store_class !== "disposable" || !nonEmpty(request.safety.authorization_reference)) {
    throw new ConfigurationError("disposable_store_authorization_required", "This delivery slice permits migration only for an explicitly authorized disposable store.");
  }
  exactObject(request.expected, ["store_id", "schema", "protocol", "assets", "operation_fence"], "migration_preconditions_invalid", "expected");
  if (!nonEmpty(request.expected.store_id)
    || !Number.isInteger(request.expected.operation_fence)
    || request.expected.operation_fence < 1) {
    throw new ConfigurationError("migration_preconditions_invalid", "expected store_id and positive operation_fence are required.");
  }
  exactObject(request.target, ["schema", "protocol"], "migration_target_invalid", "target");
  const expectedSchema = validateSchemaCondition(request.expected.schema, "expected.schema");
  const expectedProtocol = validateProtocolCondition(request.expected.protocol, "expected.protocol");
  const expectedAssets = validateAssetCondition(request.expected.assets, "expected.assets");
  const targetSchema = validateSchemaCondition(request.target.schema, "target.schema");
  const targetProtocol = validateProtocolCondition(request.target.protocol, "target.protocol");
  exactObject(
    request.migration,
    ["id", "from_version", "to_version", "schema_asset_sha256", "manifest_sha256"],
    "migration_identity_invalid",
    "migration",
  );
  const migration = { ...request.migration };
  if (!nonEmpty(migration.id)
    || !Number.isInteger(migration.from_version)
    || !Number.isInteger(migration.to_version)
    || !/^[0-9a-f]{64}$/.test(migration.schema_asset_sha256)
    || !/^[0-9a-f]{64}$/.test(migration.manifest_sha256)) {
    throw new ConfigurationError("migration_identity_invalid", "migration must name exact versions and lowercase SHA-256 asset digests.");
  }
  exactObject(request.snapshot, ["path", "on_success", "on_failure"], "migration_snapshot_invalid", "snapshot");
  if (!nonEmpty(request.snapshot.path) || !path.isAbsolute(request.snapshot.path)
    || request.snapshot.on_success !== "delete" || request.snapshot.on_failure !== "retain") {
    throw new ConfigurationError("migration_snapshot_invalid", "snapshot must name an absolute target with delete-on-success and retain-on-failure handling.");
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
    safety: { store_class: "disposable", authorization_reference: request.safety.authorization_reference.trim() },
    expected: {
      store_id: request.expected.store_id.trim(),
      schema: expectedSchema,
      protocol: expectedProtocol,
      assets: expectedAssets,
      operation_fence: request.expected.operation_fence,
    },
    target: { schema: targetSchema, protocol: targetProtocol },
    migration,
    snapshot: { ...request.snapshot },
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

function migrationTerminal(outcome, code, failureClass, retryDisposition, canonicalStateEffect) {
  return {
    outcome,
    code,
    failure_class: failureClass,
    retry_disposition: retryDisposition,
    canonical_state_effect: canonicalStateEffect,
  };
}

async function settleMigrationResult(sqliteBinary, storePath, state, operationId, requestDigest, authorityClaim, body) {
  const settledAt = body.settledAt ?? new Date().toISOString();
  const resultDigest = digest({
    terminal: body.terminal,
    preconditions: body.preconditions,
    snapshot: body.snapshot ?? null,
    postconditions: body.postconditions ?? null,
    recovery: body.recovery ?? null,
  });
  const receipt = {
    operation_id: operationId,
    operation_kind: "migration",
    store_id: state.metadata.store_id,
    request_digest: requestDigest,
    outcome: body.terminal.outcome,
    result_digest: resultDigest,
    settled_at: settledAt,
    failure_class: body.terminal.failure_class,
    retry_disposition: body.terminal.retry_disposition,
    operation_fence: state.operation_fence + 1,
  };
  const result = {
    status: "settled",
    terminal: body.terminal,
    preconditions: body.preconditions,
    ...(body.snapshot ? { snapshot: body.snapshot } : {}),
    ...(body.postconditions ? { postconditions: body.postconditions } : {}),
    ...(body.recovery ? { recovery: body.recovery } : {}),
    receipt,
  };
  let settled;
  try {
    settled = await settleStoreOperationReceipt(sqliteBinary, storePath, {
      receipt,
      authorityClaim,
      result,
      expectedOperationFence: state.operation_fence,
    });
  } catch (error) {
    settled = await readStoreOperationReceipt(sqliteBinary, storePath, operationId);
    if (!settled) throw error;
  }
  if (!settled) return null;
  return settled.operation_kind === "migration" && settled.request_digest === requestDigest ? settled : false;
}

function controlledMigrationBoundary(name) {
  const fault = process.env.CASEBOOK_PERSISTENCE_TEST_FAULT;
  if (fault === name) process.kill(process.pid, "SIGKILL");
  if (name === "migration_after_commit_before_health_verification"
    && ["migration_fail_after_commit_before_health_verification", "migration_restore_fail_after_quarantine"].includes(fault)) {
    throw Object.assign(new Error("controlled post-commit health-selection failure"), { code: "migration_health_selection_fault" });
  }
}

async function cleanupSettledMigrationSnapshot(existing, envelope) {
  const recorded = existing.result?.snapshot;
  if (existing.outcome !== "migrated"
    || envelope.snapshot.on_success !== "delete"
    || recorded?.path !== envelope.snapshot.path) return;
  try {
    const [bytes, info] = await Promise.all([readFile(recorded.path), stat(recorded.path)]);
    if (info.isFile()
      && info.size === recorded.size_bytes
      && createHash("sha256").update(bytes).digest("hex") === recorded.sha256) {
      await rm(recorded.path);
    }
  } catch {
    // Receipt recovery remains authoritative even when deferred cleanup cannot
    // prove the retained file still matches the recorded successful snapshot.
  }
}

function retainedMigrationEvidence(snapshot, authorityClaim, quarantinePath = null) {
  const common = {
    owner: authorityClaim.acting_role,
    authoritative: false,
    retention: "until_operator_reconciliation",
    cleanup: "delete_after_receipt_and_health_reconciliation",
  };
  return [
    {
      kind: "pre_migration_snapshot",
      path: snapshot.path,
      sha256: snapshot.sha256,
      size_bytes: snapshot.size_bytes,
      ...common,
    },
    ...(quarantinePath ? [{ kind: "quarantined_migrated_store", path: quarantinePath, ...common }] : []),
  ];
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
  const { configuration, manifestCheck, sqliteBinary } = prepared;
  const storePath = configuration.sqlite.store_path;
  const storeReal = await realpath(storePath).catch(() => null);
  const snapshotParent = await realpath(path.dirname(envelope.snapshot.path)).catch(() => null);
  if (!snapshotParent || (storeReal && path.resolve(envelope.snapshot.path) === storeReal)) {
    return migrationPreconditionFailure(
      "snapshot_target_invalid",
      "The exact snapshot target must be a distinct absent file under an existing directory.",
      { snapshot_parent_available: Boolean(snapshotParent), distinct_from_store: path.resolve(envelope.snapshot.path) !== storeReal },
    );
  }

  const state = await inspectStore(sqliteBinary, storePath);
  if (state.status !== "available") return storeStateFailure(state);
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
    await cleanupSettledMigrationSnapshot(existing, envelope);
    return success("migrate_store", existing.result);
  }

  const observed = {
    store_id: state.metadata.store_id,
    schema: { id: state.metadata.schema_id, version: state.metadata.schema_version },
    protocol: { id: state.metadata.protocol_id, version: state.metadata.protocol_version },
    assets: {
      schema_asset_sha256: state.migrations.initial.schema_asset_digest,
      migration_manifest_sha256: state.migrations.initial.migration_manifest_digest,
    },
    operation_fence: state.operation_fence,
  };
  const preconditions = {
    expected: envelope.expected,
    observed,
    target: envelope.target,
    migration: envelope.migration,
    safety: envelope.safety,
  };
  const schemaMatches = canonicalJson(envelope.expected.schema) === canonicalJson(observed.schema);
  const protocolMatches = canonicalJson(envelope.expected.protocol) === canonicalJson(observed.protocol)
    && canonicalJson(envelope.target.protocol) === canonicalJson({ id: PROTOCOL_ID, version: PROTOCOL_VERSION });
  const sourceAssetsMatch = canonicalJson(envelope.expected.assets) === canonicalJson(observed.assets);
  const fenceMatches = envelope.expected.operation_fence === observed.operation_fence;
  const migrationMatches = envelope.migration.id === "0002-migration-snapshot-evidence"
    && envelope.migration.from_version === 1
    && envelope.migration.to_version === 2
    && envelope.target.schema.id === SCHEMA_ID
    && envelope.target.schema.version === 2
    && envelope.expected.schema.id === SCHEMA_ID
    && envelope.expected.schema.version === 1;
  const targetAssetsMatch = envelope.migration.schema_asset_sha256 === assetDigest(manifestCheck.manifest, "sqlite-migration-v2")
    && envelope.migration.manifest_sha256 === assetDigest(manifestCheck.manifest, "sqlite-migrations");
  const requiredEvidence = ["asset_identity", "healthy_exposure", "integrity", "protocol_identity", "schema_identity"];
  const evidenceMatches = [...envelope.requested_postcondition_evidence].sort().join("\0") === requiredEvidence.join("\0");

  let terminal = null;
  if (!schemaMatches) terminal = migrationTerminal("rejected", "expected_schema_mismatch", "migration_precondition_failed", RETRY_DISPOSITIONS.NEVER, "none");
  else if (!protocolMatches) terminal = migrationTerminal("rejected", "expected_protocol_mismatch", "migration_precondition_failed", RETRY_DISPOSITIONS.NEVER, "none");
  else if (!sourceAssetsMatch) terminal = migrationTerminal("rejected", "expected_source_asset_mismatch", "migration_precondition_failed", RETRY_DISPOSITIONS.NEVER, "none");
  else if (!fenceMatches) terminal = migrationTerminal("conflict", "expected_store_fence_mismatch", "migration_precondition_failed", RETRY_DISPOSITIONS.AFTER_RECONCILE, "none");
  else if (!migrationMatches) terminal = migrationTerminal("rejected", "migration_chain_invalid", "migration_precondition_failed", RETRY_DISPOSITIONS.NEVER, "none");
  else if (!targetAssetsMatch) terminal = migrationTerminal("rejected", "migration_asset_mismatch", "asset_incompatible", RETRY_DISPOSITIONS.NEVER, "none");
  else if (!evidenceMatches) terminal = migrationTerminal("rejected", "postcondition_evidence_mismatch", "migration_precondition_failed", RETRY_DISPOSITIONS.NEVER, "none");
  else if (await lstat(envelope.snapshot.path).then(() => true).catch(() => false)) {
    terminal = migrationTerminal("rejected", "snapshot_target_exists", "migration_precondition_failed", RETRY_DISPOSITIONS.NEVER, "none");
  }

  if (terminal) {
    const settled = await settleMigrationResult(
      sqliteBinary, storePath, state, operationId, requestDigest, authorityClaim,
      { terminal, preconditions },
    );
    if (settled === false) {
      return failure("idempotency_mismatch", "operation_id settled concurrently for a different request.", { failureClass: "idempotency_mismatch" });
    }
    if (!settled) {
      return failure("store_operation_conflict", "The store operation fence changed before settlement.", {
        failureClass: "migration_precondition_failed",
        retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE,
      });
    }
    return success("migrate_store", settled.result);
  }

  let snapshot;
  try {
    snapshot = await createVerifiedMigrationSnapshot(sqliteBinary, storePath, envelope.snapshot.path, envelope.expected);
  } catch (error) {
    // Exact concurrent retries share the snapshot locator and operation ID. The
    // losing caller must recover the winner's immutable receipt rather than
    // report an unrelated snapshot failure while settlement is in flight.
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const concurrent = await readStoreOperationReceipt(sqliteBinary, storePath, operationId).catch(() => null);
      if (concurrent) {
        if (concurrent.operation_kind !== "migration" || concurrent.request_digest !== requestDigest) {
          return failure("idempotency_mismatch", "operation_id settled concurrently for a different request.", {
            failureClass: "idempotency_mismatch",
            retryDisposition: RETRY_DISPOSITIONS.NEVER,
          });
        }
        return success("migrate_store", concurrent.result);
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return failure("migration_snapshot_failed", "The exact pre-migration snapshot could not be created and verified; the store was not migrated.", {
      failureClass: "migration_execution_failure",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      evidence: { error_code: error?.code ?? "snapshot_failed", store_id: state.metadata.store_id },
    });
  }
  controlledMigrationBoundary("migration_after_snapshot_verified");

  const settledAt = new Date().toISOString();
  const successTerminal = migrationTerminal("migrated", "migration_completed", null, RETRY_DISPOSITIONS.NEVER, "schema-change");
  const postconditions = {
    schema: envelope.target.schema,
    protocol: envelope.target.protocol,
    assets: {
      schema_asset_sha256: envelope.migration.schema_asset_sha256,
      migration_manifest_sha256: envelope.migration.manifest_sha256,
    },
    integrity: { quick_check: "ok", foreign_key_violations: 0 },
    healthy_exposure: true,
  };
  const resultDigest = digest({ terminal: successTerminal, preconditions, snapshot, postconditions });
  const receipt = {
    operation_id: operationId,
    operation_kind: "migration",
    store_id: state.metadata.store_id,
    request_digest: requestDigest,
    outcome: "migrated",
    result_digest: resultDigest,
    settled_at: settledAt,
    failure_class: null,
    retry_disposition: RETRY_DISPOSITIONS.NEVER,
    operation_fence: state.operation_fence + 1,
  };
  const successResult = {
    status: "settled",
    terminal: successTerminal,
    preconditions,
    snapshot,
    postconditions,
    receipt,
  };

  let executionError = null;
  try {
    await applyMigrationV2(sqliteBinary, storePath, {
      receipt,
      authorityClaim,
      result: successResult,
      expectedOperationFence: state.operation_fence,
      migration: envelope.migration,
      snapshot,
    });
    controlledMigrationBoundary("migration_after_commit_before_health_verification");
    const exposed = await inspectStore(sqliteBinary, storePath);
    if (exposed.status !== "available"
      || exposed.metadata.schema_version !== 2
      || exposed.metadata.protocol_id !== PROTOCOL_ID
      || exposed.metadata.protocol_version !== PROTOCOL_VERSION
      || exposed.operation_fence !== state.operation_fence + 1) {
      throw Object.assign(new Error("post-migration health gate failed"), { code: "migration_health_gate_failed" });
    }
  } catch (error) {
    executionError = error;
  }

  if (!executionError) {
    await rm(envelope.snapshot.path, { force: true });
    return success("migrate_store", successResult);
  }

  let current = await inspectStore(sqliteBinary, storePath);
  let recovery;
  if (current.status === "available" && current.metadata.schema_version === 1) {
    recovery = { disposition: "prior_health_retained", quarantine_path: null };
  } else {
    recovery = await restoreVerifiedMigrationSnapshot(sqliteBinary, storePath, envelope.snapshot.path, operationId);
    current = recovery.restored ?? { status: "unavailable" };
  }
  if (current.status !== "available" || current.metadata.schema_version !== 1) {
    return failure("migration_failed_store_quarantined", "Migration failed and prior health could not be restored; the named store is unavailable and quarantined.", {
      failureClass: "migration_execution_failure",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      evidence: {
        store_id: state.metadata.store_id,
        snapshot: { path: snapshot.path, sha256: snapshot.sha256, size_bytes: snapshot.size_bytes },
        quarantine_path: recovery.quarantine_path,
        error_code: executionError?.code ?? "migration_failed",
        recovery_error_code: recovery.error_code ?? "restore_failed",
        retained_evidence: retainedMigrationEvidence(snapshot, authorityClaim, recovery.quarantine_path),
      },
    });
  }

  const failureTerminal = migrationTerminal(
    "failed",
    recovery.disposition === "prior_health_retained"
      ? "migration_execution_failed_prior_health_retained"
      : "migration_execution_failed_prior_health_restored",
    "migration_execution_failure",
    RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
    "none",
  );
  const settled = await settleMigrationResult(
    sqliteBinary, storePath, current, operationId, requestDigest, authorityClaim,
    {
      terminal: failureTerminal,
      preconditions,
      snapshot,
      recovery: {
        disposition: recovery.disposition,
        snapshot_retained: true,
        quarantine_path: null,
        execution_error_code: executionError?.code ?? "migration_failed",
        evidence_owner: authorityClaim.acting_role,
        retained_evidence: retainedMigrationEvidence(snapshot, authorityClaim),
      },
    },
  );
  if (!settled) {
    return failure("migration_failure_receipt_unavailable", "Prior health is available but the failure receipt could not be settled.", {
      failureClass: "migration_execution_failure",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE,
      evidence: { snapshot: { path: snapshot.path, sha256: snapshot.sha256 } },
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
