import { createHash } from "node:crypto";
import path from "node:path";
import { validateAuthorityConfiguration, ConfigurationError } from "../../../../shared/config.mjs";
import { loadAndValidateManifest } from "../../../../shared/manifest.mjs";
import { failure, PROTOCOL_ID, PROTOCOL_VERSION, RETRY_DISPOSITIONS, SCHEMA_ID, success } from "../../../../shared/protocol.mjs";
import { probeSqlite, selectSqliteBinary, sqlite } from "../substrate/diagnostics.mjs";
import { inspectStore, readStoreOperationReceipt } from "../substrate/index.mjs";

const DESCRIPTOR_FIELDS = ["asset", "descriptor_version", "module_id", "module_protocol", "module_schema", "provider_compatibility"];
const ASSET_FIELDS = ["asset_version", "format", "statements"];
const REGISTRY_STATEMENTS = Object.freeze([
  `CREATE TABLE optional_module_installations (
    module_id TEXT PRIMARY KEY,
    descriptor_version INTEGER NOT NULL CHECK (descriptor_version > 0),
    module_schema_id TEXT NOT NULL,
    module_schema_version INTEGER NOT NULL CHECK (module_schema_version > 0),
    module_protocol_id TEXT NOT NULL,
    module_protocol_version INTEGER NOT NULL CHECK (module_protocol_version > 0),
    asset_sha256 TEXT NOT NULL,
    descriptor_sha256 TEXT NOT NULL,
    descriptor_json TEXT NOT NULL CHECK (json_valid(descriptor_json)),
    asset_json TEXT NOT NULL CHECK (json_valid(asset_json)),
    installed_at TEXT NOT NULL,
    install_operation_id TEXT NOT NULL UNIQUE REFERENCES store_operation_receipts(operation_id)
  ) STRICT`,
  `CREATE TABLE optional_module_retirements (
    module_id TEXT PRIMARY KEY REFERENCES optional_module_installations(module_id),
    retired_at TEXT NOT NULL,
    retirement_operation_id TEXT NOT NULL UNIQUE REFERENCES store_operation_receipts(operation_id)
  ) STRICT`,
  `CREATE TRIGGER optional_module_installations_immutable_update BEFORE UPDATE ON optional_module_installations BEGIN SELECT RAISE(ABORT, 'optional module installation is immutable'); END`,
  `CREATE TRIGGER optional_module_installations_immutable_delete BEFORE DELETE ON optional_module_installations BEGIN SELECT RAISE(ABORT, 'optional module installation is immutable'); END`,
  `CREATE TRIGGER optional_module_retirements_immutable_update BEFORE UPDATE ON optional_module_retirements BEGIN SELECT RAISE(ABORT, 'optional module retirement is immutable'); END`,
  `CREATE TRIGGER optional_module_retirements_immutable_delete BEFORE DELETE ON optional_module_retirements BEGIN SELECT RAISE(ABORT, 'optional module retirement is immutable'); END`,
]);

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
  return value;
}
function canonicalJson(value) { return JSON.stringify(canonicalValue(value)); }
function digest(value) { return createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex"); }
function sqlText(value) { return value == null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`; }
function normalizeSql(value) { return value.trim().replace(/;\s*$/, "").replace(/\s+/g, " "); }
function exactObject(value, fields, code, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join("\0") !== [...fields].sort().join("\0")) {
    throw new ConfigurationError(code, `${label} must contain exactly ${fields.join(", ")}.`);
  }
}
function positiveIdentity(value, label) {
  exactObject(value, ["id", "version"], "module_descriptor_invalid", label);
  if (typeof value.id !== "string" || !/^[a-z][a-z0-9.-]{1,127}$/.test(value.id) || !Number.isInteger(value.version) || value.version < 1) {
    throw new ConfigurationError("module_descriptor_invalid", `${label} must contain a stable lowercase id and positive version.`);
  }
  return { id: value.id, version: value.version };
}
function compatibility(value, label) {
  exactObject(value, ["id", "versions"], "module_descriptor_invalid", label);
  if (typeof value.id !== "string" || !Array.isArray(value.versions) || !value.versions.length || value.versions.some((item) => !Number.isInteger(item) || item < 1)) {
    throw new ConfigurationError("module_descriptor_invalid", `${label} must contain an id and supported positive versions.`);
  }
  return { id: value.id, versions: [...new Set(value.versions)].sort((a, b) => a - b) };
}
function validateAsset(asset, moduleId) {
  exactObject(asset, ASSET_FIELDS, "module_asset_invalid", "asset");
  if (asset.asset_version !== 1 || asset.format !== "sqlite-schema-statements-v1" || !Array.isArray(asset.statements) || !asset.statements.length) {
    throw new ConfigurationError("module_asset_invalid", "asset must be a non-empty sqlite-schema-statements-v1 asset at version 1.");
  }
  const prefix = `${moduleId.replaceAll("-", "_")}__`;
  const objects = [];
  const seen = new Set();
  for (const raw of asset.statements) {
    if (typeof raw !== "string" || raw.length > 64 * 1024 || /;\s*\S/.test(raw)
      || /\b(?:DROP|ALTER|INSERT|UPDATE|DELETE|REPLACE|ATTACH|DETACH|PRAGMA|VACUUM|SELECT|REFERENCES)\b|\bFOREIGN\s+KEY\b/i.test(raw)) {
      throw new ConfigurationError(
        "module_asset_unsafe",
        "Module assets may contain only bounded, single CREATE TABLE or CREATE INDEX statements without foreign-key/reference clauses.",
      );
    }
    const statement = normalizeSql(raw);
    let match = /^CREATE TABLE\s+([a-z][a-z0-9_]*)\s*\(/i.exec(statement);
    let type = "table";
    let tableName;
    if (!match) {
      match = /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+([a-z][a-z0-9_]*)\s+ON\s+([a-z][a-z0-9_]*)\s*\(/i.exec(statement);
      type = "index";
      tableName = match?.[2];
    }
    const name = match?.[1];
    if (!name || !name.startsWith(prefix) || (tableName && !tableName.startsWith(prefix)) || seen.has(name)) {
      throw new ConfigurationError("module_asset_unsafe", `Every module object must be uniquely named with prefix ${prefix}.`);
    }
    seen.add(name);
    objects.push({ type, name, sql: statement, sql_sha256: digest(statement) });
  }
  return { asset: { asset_version: 1, format: asset.format, statements: asset.statements.map(normalizeSql) }, objects };
}
function validateDescriptor(descriptor, asset) {
  exactObject(descriptor, DESCRIPTOR_FIELDS, "module_descriptor_invalid", "descriptor");
  if (descriptor.descriptor_version !== 1 || typeof descriptor.module_id !== "string" || !/^[a-z][a-z0-9-]{2,63}$/.test(descriptor.module_id)) {
    throw new ConfigurationError("module_descriptor_invalid", "descriptor_version must be 1 and module_id must be a stable lowercase module identity.");
  }
  exactObject(descriptor.provider_compatibility, ["protocol", "schema"], "module_descriptor_invalid", "provider_compatibility");
  exactObject(descriptor.asset, ["format", "sha256"], "module_descriptor_invalid", "descriptor.asset");
  if (descriptor.asset.format !== "sqlite-schema-statements-v1" || !/^[0-9a-f]{64}$/.test(descriptor.asset.sha256)) {
    throw new ConfigurationError("module_descriptor_invalid", "descriptor.asset must bind the supported format and exact lowercase SHA-256 digest.");
  }
  const validatedAsset = validateAsset(asset, descriptor.module_id);
  return {
    descriptor: {
      descriptor_version: 1,
      module_id: descriptor.module_id,
      module_schema: positiveIdentity(descriptor.module_schema, "module_schema"),
      module_protocol: positiveIdentity(descriptor.module_protocol, "module_protocol"),
      provider_compatibility: {
        schema: compatibility(descriptor.provider_compatibility.schema, "provider_compatibility.schema"),
        protocol: compatibility(descriptor.provider_compatibility.protocol, "provider_compatibility.protocol"),
      },
      asset: { ...descriptor.asset },
    },
    ...validatedAsset,
    assetDigest: digest(validatedAsset.asset),
  };
}
function validateAuthorityClaim(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.human_authorized !== true
    || typeof value.acting_role !== "string" || !value.acting_role.trim()
    || typeof value.authority_basis !== "string" || !value.authority_basis.trim()) {
    throw new ConfigurationError("human_authority_claim_required", "Module installation and retirement require an explicit human authority claim.");
  }
  const claim = {
    human_authorized: true,
    acting_role: value.acting_role.trim(),
    authority_basis: value.authority_basis.trim(),
  };
  for (const key of ["human_confirmation_reference", "causation", "correlation", "session"]) {
    if (value[key] != null) {
      if (typeof value[key] !== "string" || !value[key].trim()) {
        throw new ConfigurationError("authority_claim_invalid", `${key} must be a non-empty string when present.`);
      }
      claim[key] = value[key].trim();
    }
  }
  return claim;
}
function validateOperationId(value) {
  if (typeof value !== "string" || !value.trim() || value.length > 256) throw new ConfigurationError("operation_id_invalid", "operation_id must be a non-empty bounded string.");
  return value;
}
async function queryJson(binary, storePath, query) {
  const { stdout } = await sqlite(binary, storePath, `PRAGMA query_only=ON;\n${query}`, { args: ["-batch", "-bail", "-json"], maxBuffer: 4 * 1024 * 1024 });
  return JSON.parse(stdout || "[]");
}
async function prepare(request) {
  const configuration = validateAuthorityConfiguration(request.configuration);
  if (configuration.authority_mode !== "sqlite") return { failure: failure("sqlite_authority_required", "Optional modules require explicitly selected sqlite authority.") };
  const manifest = await loadAndValidateManifest();
  if (!manifest.ok) return { failure: failure("asset_incompatible", "Package manifest or asset verification failed.", { evidence: { problems: manifest.problems } }) };
  const selected = await selectSqliteBinary(configuration.sqlite.sqlite_bin);
  const probe = await probeSqlite(selected.path, path.dirname(configuration.sqlite.store_path));
  if (!probe.ok) return { failure: probe.failure };
  const state = await inspectStore(selected.path, configuration.sqlite.store_path);
  if (state.status !== "available") return { failure: failure(state.code ?? "store_unavailable", "The configured store is not safely available for optional-module lifecycle operations.", { failureClass: "store_unavailable", evidence: state.evidence ?? {} }) };
  return { binary: selected.path, storePath: configuration.sqlite.store_path, state };
}
function compatibilityClassification(validated, state) {
  const schema = validated.descriptor.provider_compatibility.schema;
  const protocol = validated.descriptor.provider_compatibility.protocol;
  if (schema.id !== state.metadata.schema_id || !schema.versions.includes(state.metadata.schema_version) || protocol.id !== state.metadata.protocol_id || !protocol.versions.includes(state.metadata.protocol_version)) {
    return { status: "incompatible", classification: "provider_incompatible", code: "module_provider_incompatible", exposure: "disabled" };
  }
  if (validated.assetDigest !== validated.descriptor.asset.sha256) return { status: "incompatible", classification: "asset_incompatible", code: "module_asset_digest_mismatch", exposure: "disabled" };
  return null;
}
function integrityUnsafe(code = "module_subsystem_integrity_unsafe") {
  return { status: "integrity_unsafe", classification: "partial_state", code, exposure: "disabled" };
}
async function inspectInstalledModules(binary, storePath) {
  const orphanRetirements = await queryJson(binary, storePath, `SELECT r.module_id FROM optional_module_retirements r LEFT JOIN optional_module_installations i USING(module_id) WHERE i.module_id IS NULL LIMIT 1;`);
  if (orphanRetirements.length) return integrityUnsafe("module_retirement_binding_missing");
  const installations = await queryJson(binary, storePath, `SELECT i.*, r.retired_at, r.retirement_operation_id FROM optional_module_installations i LEFT JOIN optional_module_retirements r USING(module_id) ORDER BY i.module_id;`);
  for (const installed of installations) {
    let descriptor;
    let asset;
    let validated;
    try {
      descriptor = JSON.parse(installed.descriptor_json);
      asset = JSON.parse(installed.asset_json);
      validated = validateDescriptor(descriptor, asset);
    } catch {
      return integrityUnsafe("module_installed_descriptor_malformed");
    }
    if (canonicalJson(descriptor) !== installed.descriptor_json
      || canonicalJson(asset) !== installed.asset_json
      || digest(validated.descriptor) !== installed.descriptor_sha256
      || validated.assetDigest !== installed.asset_sha256
      || validated.descriptor.asset.sha256 !== validated.assetDigest
      || installed.module_id !== validated.descriptor.module_id
      || installed.module_schema_id !== validated.descriptor.module_schema.id
      || installed.module_schema_version !== validated.descriptor.module_schema.version
      || installed.module_protocol_id !== validated.descriptor.module_protocol.id
      || installed.module_protocol_version !== validated.descriptor.module_protocol.version) {
      return integrityUnsafe("module_installed_binding_mismatch");
    }
    const prefix = `${installed.module_id.replaceAll("-", "_")}__`;
    const rows = await queryJson(binary, storePath, `SELECT type,name,sql FROM sqlite_schema WHERE name GLOB ${sqlText(`${prefix}*`)} ORDER BY name;`);
    const expected = new Map(validated.objects.map((item) => [item.name, item]));
    if (rows.length !== expected.size || rows.some((row) => {
      const binding = expected.get(row.name);
      return !binding || row.type !== binding.type || typeof row.sql !== "string" || digest(normalizeSql(row.sql)) !== binding.sql_sha256;
    })) return integrityUnsafe("module_installed_objects_partial_or_corrupt");
  }
  return null;
}
async function inspectLifecycle(binary, storePath, validated, state) {
  const expectedRegistry = REGISTRY_STATEMENTS.map((sql) => {
    const match = /^CREATE (TABLE|TRIGGER)\s+([a-z0-9_]+)/i.exec(sql);
    return { type: match[1].toLowerCase(), name: match[2], sql_sha256: digest(normalizeSql(sql)) };
  });
  const names = [...expectedRegistry, ...validated.objects].map((item) => sqlText(item.name)).join(",");
  const rows = await queryJson(binary, storePath, `SELECT type,name,sql FROM sqlite_schema WHERE name IN (${names}) ORDER BY name;`);
  const byName = new Map(rows.map((row) => [row.name, row]));
  const registryPresent = expectedRegistry.filter((item) => byName.has(item.name));
  if (registryPresent.length && (registryPresent.length !== expectedRegistry.length || registryPresent.some((item) => byName.get(item.name).type !== item.type || typeof byName.get(item.name).sql !== "string" || digest(normalizeSql(byName.get(item.name).sql)) !== item.sql_sha256))) {
    return { status: "integrity_unsafe", classification: "partial_state", code: "module_registry_partial_or_corrupt", exposure: "disabled" };
  }
  const objectPresent = validated.objects.filter((item) => byName.has(item.name));
  if (!registryPresent.length) {
    if (objectPresent.length) return { status: "integrity_unsafe", classification: "partial_state", code: "module_partial_state", exposure: "disabled" };
    const incompatible = compatibilityClassification(validated, state);
    return incompatible ?? { status: "absent", classification: "absent", code: "module_absent", exposure: "disabled", registry_present: false };
  }
  const subsystemFailure = await inspectInstalledModules(binary, storePath);
  if (subsystemFailure) return subsystemFailure;
  const incompatible = compatibilityClassification(validated, state);
  if (incompatible) return incompatible;
  const installs = await queryJson(binary, storePath, `SELECT i.*, r.retired_at, r.retirement_operation_id FROM optional_module_installations i LEFT JOIN optional_module_retirements r USING(module_id) WHERE i.module_id=${sqlText(validated.descriptor.module_id)};`);
  if (!installs.length) {
    if (objectPresent.length) return { status: "integrity_unsafe", classification: "partial_state", code: "module_partial_state", exposure: "disabled" };
    return { status: "absent", classification: "absent", code: "module_absent", exposure: "disabled", registry_present: true };
  }
  const installed = installs[0];
  const descriptorSha256 = digest(validated.descriptor);
  if (installed.descriptor_sha256 !== descriptorSha256 || installed.asset_sha256 !== validated.assetDigest || installed.descriptor_json !== canonicalJson(validated.descriptor)) {
    return { status: "incompatible", classification: "installed_descriptor_incompatible", code: "module_installed_descriptor_mismatch", exposure: "disabled", installed_descriptor_sha256: installed.descriptor_sha256 };
  }
  if (objectPresent.length !== validated.objects.length || objectPresent.some((item) => byName.get(item.name).type !== item.type || digest(normalizeSql(byName.get(item.name).sql)) !== item.sql_sha256)) {
    return { status: "integrity_unsafe", classification: "partial_state", code: "module_partial_state", exposure: "disabled" };
  }
  return installed.retired_at
    ? { status: "retired", classification: "logically_retired", code: "module_retired", exposure: "disabled", installed_at: installed.installed_at, retired_at: installed.retired_at }
    : { status: "healthy", classification: "healthy", code: "module_healthy", exposure: "enabled", installed_at: installed.installed_at };
}
function requestDigest(operation, request, descriptor, assetDigest, authorityClaim) {
  return digest({ protocol: { id: PROTOCOL_ID, version: PROTOCOL_VERSION }, operation, operation_id: request.operation_id, store_id: request.store_id, descriptor, asset_sha256: assetDigest, authority_claim: authorityClaim ?? null });
}
function idempotencyFailure(operationId, receipt) {
  return failure("idempotency_mismatch", "operation_id is already settled for a different module lifecycle request.", { failureClass: "idempotency_mismatch", evidence: { operation_id: operationId, settled_kind: receipt.operation_kind } });
}
async function diagnoseModule(request) {
  const validated = validateDescriptor(request.descriptor, request.asset);
  const prepared = await prepare(request);
  if (prepared.failure) return prepared.failure;
  if (request.store_id != null && request.store_id !== prepared.state.metadata.store_id) return failure("authority_binding_mismatch", "The requested store identity does not match configured authority.", { failureClass: "authority_binding_mismatch" });
  const diagnosis = await inspectLifecycle(prepared.binary, prepared.storePath, validated, prepared.state);
  return success("module.diagnose", { descriptor_version: 1, module_id: validated.descriptor.module_id, descriptor_sha256: digest(validated.descriptor), asset_sha256: validated.assetDigest, store_id: prepared.state.metadata.store_id, ...diagnosis });
}
async function installModule(request) {
  const operationId = validateOperationId(request.operation_id);
  const authorityClaim = validateAuthorityClaim(request.authority_claim);
  const validated = validateDescriptor(request.descriptor, request.asset);
  const prepared = await prepare(request);
  if (prepared.failure) return prepared.failure;
  if (request.store_id !== prepared.state.metadata.store_id) return failure("authority_binding_mismatch", "The requested store identity does not match configured authority.", { failureClass: "authority_binding_mismatch" });
  const requestSha256 = requestDigest("module.install", request, validated.descriptor, validated.assetDigest, authorityClaim);
  const replay = await readStoreOperationReceipt(prepared.binary, prepared.storePath, operationId);
  if (replay) return replay.operation_kind === "module_install" && replay.request_digest === requestSha256 ? success("module.install", replay.result) : idempotencyFailure(operationId, replay);
  const diagnosis = await inspectLifecycle(prepared.binary, prepared.storePath, validated, prepared.state);
  if (diagnosis.status !== "absent") return failure(diagnosis.code, "Optional module installation preconditions failed closed.", { failureClass: diagnosis.classification, evidence: diagnosis });
  const settledAt = new Date().toISOString();
  const nextFence = prepared.state.operation_fence + 1;
  const outcome = { module_id: validated.descriptor.module_id, descriptor_sha256: digest(validated.descriptor), asset_sha256: validated.assetDigest, lifecycle: "active", exposure: "enabled", installed_at: settledAt };
  const result = { status: "settled", terminal: { outcome: "installed", code: "module_installed", failure_class: null, retry_disposition: "never", canonical_state_effect: "module-schema-addition" }, module: outcome, receipt: { operation_id: operationId, operation_kind: "module_install", store_id: prepared.state.metadata.store_id, request_digest: requestSha256, outcome: "installed", result_digest: digest(outcome), settled_at: settledAt, failure_class: null, retry_disposition: "never", operation_fence: nextFence } };
  const registrySql = diagnosis.registry_present ? "" : `${REGISTRY_STATEMENTS.join(";\n")};`;
  const sql = `.bail on\nPRAGMA busy_timeout=5000;\nPRAGMA foreign_keys=ON;\nBEGIN IMMEDIATE;\n${registrySql}\n${validated.asset.statements.join(";\n")};\nINSERT INTO store_operation_receipts(operation_id,operation_kind,store_id,request_digest,outcome,result_json,result_digest,authority_claim_json,settled_at,failure_class,retry_disposition,operation_fence) VALUES(${sqlText(operationId)},'module_install',${sqlText(prepared.state.metadata.store_id)},${sqlText(requestSha256)},'installed',${sqlText(JSON.stringify(result))},${sqlText(digest(outcome))},${sqlText(JSON.stringify(authorityClaim))},${sqlText(settledAt)},NULL,'never',${nextFence});\nINSERT INTO optional_module_installations VALUES(${sqlText(validated.descriptor.module_id)},1,${sqlText(validated.descriptor.module_schema.id)},${validated.descriptor.module_schema.version},${sqlText(validated.descriptor.module_protocol.id)},${validated.descriptor.module_protocol.version},${sqlText(validated.assetDigest)},${sqlText(digest(validated.descriptor))},${sqlText(canonicalJson(validated.descriptor))},${sqlText(canonicalJson(validated.asset))},${sqlText(settledAt)},${sqlText(operationId)});\nCREATE TEMP TABLE module_guard(value INTEGER CHECK(value=1));\nUPDATE store_fence SET operation_fence=${nextFence} WHERE singleton=1 AND operation_fence=${prepared.state.operation_fence};\nINSERT INTO module_guard VALUES(changes());\nCOMMIT;`;
  try { await sqlite(prepared.binary, prepared.storePath, sql, { args: ["-batch", "-bail"], timeout: 20_000, maxBuffer: 4 * 1024 * 1024 }); }
  catch { const uncertain = await readStoreOperationReceipt(prepared.binary, prepared.storePath, operationId); if (uncertain?.operation_kind === "module_install" && uncertain.request_digest === requestSha256) return success("module.install", uncertain.result); return failure("module_install_failed", "Atomic optional-module installation did not settle.", { failureClass: "module_integrity_unsafe", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR }); }
  return success("module.install", result);
}
async function retireModule(request) {
  const operationId = validateOperationId(request.operation_id);
  const authorityClaim = validateAuthorityClaim(request.authority_claim);
  const validated = validateDescriptor(request.descriptor, request.asset);
  const prepared = await prepare(request);
  if (prepared.failure) return prepared.failure;
  if (request.store_id !== prepared.state.metadata.store_id) return failure("authority_binding_mismatch", "The requested store identity does not match configured authority.", { failureClass: "authority_binding_mismatch" });
  const requestSha256 = requestDigest("module.retire", request, validated.descriptor, validated.assetDigest, authorityClaim);
  const replay = await readStoreOperationReceipt(prepared.binary, prepared.storePath, operationId);
  if (replay) return replay.operation_kind === "module_retire" && replay.request_digest === requestSha256 ? success("module.retire", replay.result) : idempotencyFailure(operationId, replay);
  const diagnosis = await inspectLifecycle(prepared.binary, prepared.storePath, validated, prepared.state);
  if (diagnosis.status !== "healthy") return failure(diagnosis.code, "Optional module retirement preconditions failed closed.", { failureClass: diagnosis.classification, evidence: diagnosis });
  const settledAt = new Date().toISOString();
  const nextFence = prepared.state.operation_fence + 1;
  const outcome = { module_id: validated.descriptor.module_id, descriptor_sha256: digest(validated.descriptor), asset_sha256: validated.assetDigest, lifecycle: "retired", exposure: "disabled", retired_at: settledAt, data_preservation: "all-module-objects-preserved" };
  const result = { status: "settled", terminal: { outcome: "retired", code: "module_retired", failure_class: null, retry_disposition: "never", canonical_state_effect: "logical-retirement" }, module: outcome, receipt: { operation_id: operationId, operation_kind: "module_retire", store_id: prepared.state.metadata.store_id, request_digest: requestSha256, outcome: "retired", result_digest: digest(outcome), settled_at: settledAt, failure_class: null, retry_disposition: "never", operation_fence: nextFence } };
  const sql = `.bail on\nPRAGMA busy_timeout=5000;\nPRAGMA foreign_keys=ON;\nBEGIN IMMEDIATE;\nINSERT INTO store_operation_receipts(operation_id,operation_kind,store_id,request_digest,outcome,result_json,result_digest,authority_claim_json,settled_at,failure_class,retry_disposition,operation_fence) VALUES(${sqlText(operationId)},'module_retire',${sqlText(prepared.state.metadata.store_id)},${sqlText(requestSha256)},'retired',${sqlText(JSON.stringify(result))},${sqlText(digest(outcome))},${sqlText(JSON.stringify(authorityClaim))},${sqlText(settledAt)},NULL,'never',${nextFence});\nINSERT INTO optional_module_retirements VALUES(${sqlText(validated.descriptor.module_id)},${sqlText(settledAt)},${sqlText(operationId)});\nCREATE TEMP TABLE module_guard(value INTEGER CHECK(value=1));\nUPDATE store_fence SET operation_fence=${nextFence} WHERE singleton=1 AND operation_fence=${prepared.state.operation_fence};\nINSERT INTO module_guard VALUES(changes());\nCOMMIT;`;
  try { await sqlite(prepared.binary, prepared.storePath, sql, { args: ["-batch", "-bail"], timeout: 20_000, maxBuffer: 4 * 1024 * 1024 }); }
  catch { const uncertain = await readStoreOperationReceipt(prepared.binary, prepared.storePath, operationId); if (uncertain?.operation_kind === "module_retire" && uncertain.request_digest === requestSha256) return success("module.retire", uncertain.result); return failure("module_retire_failed", "Atomic optional-module retirement did not settle.", { failureClass: "module_integrity_unsafe", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR }); }
  return success("module.retire", result);
}

export async function invokeModuleOperation(request) {
  try {
    if (request.operation === "module.diagnose") return await diagnoseModule(request);
    if (request.operation === "module.install") return await installModule(request);
    if (request.operation === "module.retire") return await retireModule(request);
    return null;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      const authority = error.code === "human_authority_claim_required";
      return failure(error.code, error.message, { failureClass: authority ? "authority_required" : "configuration_or_asset_incompatible", evidence: error.evidence });
    }
    return failure("module_lifecycle_internal_failure", "Optional-module lifecycle operation failed without accepted mutation.", { failureClass: "internal_failure", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR, evidence: { error_code: "unexpected_exception" } });
  }
}
