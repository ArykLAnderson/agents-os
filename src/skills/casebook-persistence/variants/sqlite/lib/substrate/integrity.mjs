import { lstat } from "node:fs/promises";
import path from "node:path";
import { validateAuthorityConfiguration, ConfigurationError } from "../../../../shared/config.mjs";
import { loadAndValidateManifest } from "../../../../shared/manifest.mjs";
import { failure, PROTOCOL_ID, PROTOCOL_VERSION, RETRY_DISPOSITIONS, success } from "../../../../shared/protocol.mjs";
import { probeSqlite, selectSqliteBinary, sqlite } from "./diagnostics.mjs";
import { mechanicalDigest } from "./mechanical.mjs";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const UUID_ID = new RegExp(`^[a-z][a-z0-9_-]*:${UUID}$`);
const REQUEST_FIELDS = new Set(["protocol", "operation", "request_version", "store_id", "context", "configuration"]);
const CONTEXT_FIELDS = new Set(["view_id", "view_policy_revision_id", "purpose", "requested_audience_ceiling"]);
const DIGEST = /^[0-9a-f]{64}$/;

class IntegrityError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.code = code;
    this.failureClass = options.failureClass ?? "integrity.request_invalid";
    this.retryDisposition = options.retryDisposition ?? RETRY_DISPOSITIONS.NEVER;
    this.evidence = options.evidence ?? {};
  }
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function exact(value, fields, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !fields.has(key))) {
    throw new IntegrityError("integrity.request_invalid", `${label} contains unsupported or invalid fields.`);
  }
}

function requireId(value, field, prefix) {
  if (typeof value !== "string" || value.length > 128 || !UUID_ID.test(value)
    || (prefix && !value.startsWith(`${prefix}:`))) {
    throw new IntegrityError("integrity.request_invalid", `${field} must be a lowercase UUID-based identity.`);
  }
  return value;
}

function validateRequest(request) {
  exact(request, REQUEST_FIELDS, "request");
  if (request.request_version !== 1) throw new IntegrityError("integrity.request_invalid", "request_version must be 1.");
  requireId(request.store_id, "store_id", "store");
  exact(request.context, CONTEXT_FIELDS, "context");
  requireId(request.context.view_id, "context.view_id", "view");
  requireId(request.context.view_policy_revision_id, "context.view_policy_revision_id", "view-policy");
  if (typeof request.context.purpose !== "string" || !request.context.purpose.trim() || request.context.purpose.length > 512) {
    throw new IntegrityError("integrity.request_invalid", "context.purpose is required.");
  }
  if (request.context.requested_audience_ceiling != null && request.context.requested_audience_ceiling !== "private") {
    throw new IntegrityError("view_invalid", "Integrity observation cannot widen the active view.", { failureClass: "view_invalid" });
  }
}

async function queryJson(binary, database, query, { tolerateFailure = false } = {}) {
  try {
    const { stdout } = await sqlite(binary, database, `PRAGMA query_only = ON;\n${query}`, {
      args: ["-batch", "-bail", "-json"],
      maxBuffer: 8 * 1024 * 1024,
    });
    return { rows: JSON.parse(stdout || "[]"), error: null };
  } catch (error) {
    if (!tolerateFailure) throw error;
    return { rows: [], error: error?.stderr || error?.message || "sqlite inspection failed" };
  }
}

function resultFor(anomalyClass, components, evidence, options = {}) {
  const safety = {
    none: { canonical_reads: "safe", canonical_writes: "safe", affected_projection_reads: "safe" },
    canonical_mechanical_unsafe: { canonical_reads: "unsafe", canonical_writes: "blocked", affected_projection_reads: "unsafe" },
    projection_only: { canonical_reads: "safe", canonical_writes: "safe", affected_projection_reads: "unsafe" },
    semantic_evidence: { canonical_reads: "evidence_only_for_affected_owners", canonical_writes: "owner_reconciliation_only", affected_projection_reads: "unsafe" },
    asset_protocol: { canonical_reads: "blocked", canonical_writes: "blocked", affected_projection_reads: "unsafe" },
  }[anomalyClass];
  const allowed = {
    none: ["integrity.observe", "ordinary_typed_operations", "snapshot_store"],
    canonical_mechanical_unsafe: ["diagnose", "integrity.observe", "restore_store"],
    projection_only: ["integrity.observe", "ordinary_typed_canonical_operations", "projection.rebuild", "snapshot_store"],
    semantic_evidence: ["integrity.observe", ...new Set((options.owners ?? []).flatMap((owner) => [`${owner.kind}.read`, `${owner.kind}.commit_revision`]))],
    asset_protocol: ["diagnose", "integrity.observe"],
  }[anomalyClass];
  const owners = [...(options.owners ?? [])]
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    .map(({ id, kind }) => ({ id, kind, operation: `${kind}.commit_revision` }));
  const digestInput = {
    domain: "casebook-integrity-evidence@1",
    anomaly_class: anomalyClass,
    affected_visible_components: components,
    evidence,
  };
  return success("integrity.observe", {
    status: "observed",
    anomaly_class: anomalyClass,
    affected_visible_components: components,
    read_write_safety: safety,
    evidence_digest: mechanicalDigest(digestInput),
    evidence: {
      algorithm: "sha256",
      domain: digestInput.domain,
      checks: evidence.checks,
      canonical_fence: evidence.canonical_fence ?? null,
    },
    allowed_operations: allowed,
    owner_reconciliation_handoff: anomalyClass === "semantic_evidence"
      ? { required: true, handoff_kind: "owner_reconciliation", owners, automatic_mutation_performed: false }
      : null,
    canonical_state_effect: "none",
    repair_performed: false,
  });
}

function assetCondition(problems) {
  return problems.some((problem) => problem.startsWith("asset_digest:"))
    ? "asset_digest_mismatch"
    : "asset_or_manifest_incompatible";
}

async function visibleStoreState(binary, storePath, request) {
  const metadataResult = await queryJson(binary, storePath, `
    SELECT store_id,schema_id,schema_version,protocol_id,protocol_version
    FROM store_metadata WHERE singleton=1 LIMIT 1;
  `, { tolerateFailure: true });
  if (metadataResult.error || metadataResult.rows.length !== 1) {
    return { mechanicalFailure: metadataResult.error ?? "store metadata is not singular" };
  }
  const metadata = metadataResult.rows[0];
  if (metadata.store_id !== request.store_id) {
    return { failure: failure("not_visible", "The requested store state is not visible.", { failureClass: "not_visible", evidence: {} }) };
  }
  const viewResult = await queryJson(binary, storePath, `
    SELECT vpr.view_policy_revision_id
    FROM view_policy_revisions vpr
    JOIN view_families vf ON vf.view_id=vpr.view_id
    JOIN view_policy_namespace_grants grant ON grant.view_policy_revision_id=vpr.view_policy_revision_id
    JOIN namespaces ns ON ns.namespace_id=grant.namespace_id AND ns.lifecycle='active'
    WHERE vpr.view_policy_revision_id=${sqlText(request.context.view_policy_revision_id)}
      AND vpr.view_id=${sqlText(request.context.view_id)}
      AND vpr.lifecycle='active' AND vpr.audience_ceiling='private'
    LIMIT 1;
  `, { tolerateFailure: true });
  if (viewResult.error) return { mechanicalFailure: viewResult.error };
  if (!viewResult.rows.length) {
    return { failure: failure("view_invalid", "The exact active integrity-observation view is unavailable.", {
      failureClass: "view_invalid", retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE, evidence: {},
    }) };
  }
  const fenceResult = await queryJson(binary, storePath, "SELECT operation_fence FROM store_fence WHERE singleton=1 LIMIT 1;", { tolerateFailure: true });
  return { metadata, canonicalFence: fenceResult.rows[0]?.operation_fence ?? null };
}

async function visibleOwners(binary, storePath, request) {
  const result = await queryJson(binary, storePath, `
    SELECT o.owner_id,o.owner_kind,o.home_namespace_id,c.revision_id,c.revision_number,c.projection_json,
      r.normalized_json,r.representation_id,r.representation_version,
      profile.version_id AS profile_version_id,profile.content_json AS profile_content_json,
      profile.content_digest AS profile_content_digest
    FROM owners o
    JOIN owner_current c ON c.owner_id=o.owner_id
    JOIN owner_revisions r ON r.revision_id=c.revision_id
    JOIN view_policy_namespace_grants grant ON grant.namespace_id=o.home_namespace_id
      AND grant.view_policy_revision_id=${sqlText(request.context.view_policy_revision_id)}
    JOIN view_policy_revisions policy ON policy.view_policy_revision_id=grant.view_policy_revision_id
      AND policy.view_id=${sqlText(request.context.view_id)} AND policy.lifecycle='active'
    JOIN json_each(policy.object_kinds_json) kind ON kind.value=o.owner_kind
    LEFT JOIN owner_revision_selections selected ON selected.revision_id=r.revision_id AND selected.family_id=o.owner_id
    LEFT JOIN owner_versions profile ON profile.version_id=selected.version_id
    ORDER BY o.owner_kind,o.owner_id;
  `, { tolerateFailure: true });
  return result;
}

function projectionMismatch(row, profile, projection) {
  if (!profile || !projection || projection.id !== row.owner_id || projection.home_namespace_id !== row.home_namespace_id) return true;
  if (row.owner_kind === "case") {
    return projection.schema !== "case-current@2"
      || projection.case_version_id !== row.profile_version_id
      || projection.state !== profile.state
      || projection.title !== profile.title
      || projection.summary !== profile.summary;
  }
  if (row.owner_kind === "frame") {
    return projection.schema !== "frame-current@1"
      || projection.frame_version_id !== row.profile_version_id
      || projection.status !== profile.status
      || projection.title !== profile.title
      || projection.outcome !== profile.outcome;
  }
  return true;
}

async function inspectVisibleRecords(binary, storePath, request, rows) {
  const semantic = [];
  const projections = [];
  const ownersById = new Map(rows.map((row) => [row.owner_id, { id: row.owner_id, kind: row.owner_kind }]));
  for (const row of rows) {
    let profile;
    let projection;
    let normalized;
    try {
      profile = JSON.parse(row.profile_content_json);
      projection = JSON.parse(row.projection_json);
      normalized = JSON.parse(row.normalized_json);
    } catch {
      semantic.push({ row, condition: "malformed_owner_record" });
      continue;
    }
    if (!row.profile_version_id || !DIGEST.test(row.profile_content_digest ?? "")
      || mechanicalDigest(profile) !== row.profile_content_digest
      || normalized[`${row.owner_kind}_family_id`] !== row.owner_id
      || normalized[`${row.owner_kind}_version_id`] !== row.profile_version_id) {
      semantic.push({ row, condition: "malformed_owner_record" });
      continue;
    }
    if (projectionMismatch(row, profile, projection)) {
      projections.push({ row, condition: "projection_mismatch" });
    }
    for (const link of projection.identity_links ?? []) {
      const endpoint = link?.to;
      if (!endpoint || !["case", "frame", "knowledge", "source", "evidence"].includes(endpoint.kind)) continue;
      if (ownersById.has(endpoint.id)) continue;
      const found = await queryJson(binary, storePath, `SELECT 1 AS present FROM owner_family_bindings WHERE family_id=${sqlText(endpoint.id)} LIMIT 1;`);
      if (!found.rows.length) {
        semantic.push({ row, condition: "dangling_semantic_link" });
        break;
      }
    }
  }
  return { semantic, projections };
}

async function observe(request) {
  validateRequest(request);
  let manifest;
  try {
    manifest = await loadAndValidateManifest();
  } catch {
    manifest = { ok: false, problems: ["manifest_unreadable"] };
  }
  if (!manifest.ok) {
    const condition = assetCondition(manifest.problems ?? []);
    return resultFor("asset_protocol", [
      { component: "package_assets", visibility: "installation", condition },
    ], { checks: { package_assets: "failed", store_accessed: false }, problems: manifest.problems ?? [] });
  }

  const configuration = validateAuthorityConfiguration(request.configuration);
  if (configuration.authority_mode !== "sqlite") {
    return failure("sqlite_authority_required", "Integrity observation requires explicitly selected sqlite authority.", {
      failureClass: "configuration_or_store_unavailable",
    });
  }
  const selected = await selectSqliteBinary(configuration.sqlite.sqlite_bin);
  const storeEntry = await lstat(configuration.sqlite.store_path).catch(() => null);
  if (!storeEntry?.isFile()) {
    return failure("store_unavailable", "The configured store is unavailable and was not created.", {
      failureClass: "store_unavailable",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      evidence: { store_present: Boolean(storeEntry), regular_file: storeEntry ? false : null },
    });
  }
  const probe = await probeSqlite(selected.path, path.dirname(configuration.sqlite.store_path));
  if (!probe.ok) {
    return resultFor("asset_protocol", [
      { component: "sqlite_runtime", visibility: "installation", condition: "sqlite_features_incompatible" },
    ], { checks: { package_assets: "passed", sqlite_runtime: "failed", store_accessed: false }, problems: probe.problems });
  }

  const state = await visibleStoreState(selected.path, configuration.sqlite.store_path, request);
  if (state.failure) return state.failure;
  if (state.mechanicalFailure) {
    return resultFor("canonical_mechanical_unsafe", [
      { component: "canonical_store", visibility: "exact_view", condition: "store_structure_unreadable" },
    ], { checks: { package_assets: "passed", sqlite_runtime: "passed", canonical_integrity: "failed" }, failure: state.mechanicalFailure });
  }
  const protocolCompatible = state.metadata.protocol_id === PROTOCOL_ID && state.metadata.protocol_version === PROTOCOL_VERSION;
  if (!protocolCompatible) {
    return resultFor("asset_protocol", [
      { component: "store_protocol", visibility: "exact_view", condition: "protocol_incompatible" },
    ], {
      checks: { package_assets: "passed", sqlite_runtime: "passed", store_protocol: "failed" },
      canonical_fence: state.canonicalFence,
      expected: { id: PROTOCOL_ID, version: PROTOCOL_VERSION },
      observed: { id: state.metadata.protocol_id, version: state.metadata.protocol_version },
    });
  }

  const quick = await queryJson(selected.path, configuration.sqlite.store_path, "SELECT quick_check AS finding FROM pragma_quick_check;", { tolerateFailure: true });
  const foreign = await queryJson(selected.path, configuration.sqlite.store_path, "SELECT \"table\" AS component,rowid,parent,fkid FROM pragma_foreign_key_check;", { tolerateFailure: true });
  const quickUnsafe = quick.error || quick.rows.some((row) => row.finding !== "ok");
  if (quickUnsafe || foreign.error || foreign.rows.length) {
    return resultFor("canonical_mechanical_unsafe", [
      { component: "canonical_store", visibility: "exact_view", condition: "sqlite_or_reference_integrity_failed" },
    ], {
      checks: { package_assets: "passed", sqlite_runtime: "passed", store_protocol: "passed", canonical_integrity: "failed" },
      canonical_fence: state.canonicalFence,
      quick_check_findings: quick.rows.length,
      foreign_key_findings: foreign.rows.length,
    });
  }

  const visible = await visibleOwners(selected.path, configuration.sqlite.store_path, request);
  if (visible.error) {
    return resultFor("canonical_mechanical_unsafe", [
      { component: "canonical_store", visibility: "exact_view", condition: "visible_owner_structure_unreadable" },
    ], { checks: { canonical_integrity: "failed" }, canonical_fence: state.canonicalFence });
  }
  const recordChecks = await inspectVisibleRecords(selected.path, configuration.sqlite.store_path, request, visible.rows);
  if (recordChecks.semantic.length) {
    const owners = [...new Map(recordChecks.semantic.map(({ row }) => [row.owner_id, { id: row.owner_id, kind: row.owner_kind }])).values()];
    const components = recordChecks.semantic.map(({ row, condition }) => ({
      component: "owner_semantic_record",
      owner: { id: row.owner_id, kind: row.owner_kind },
      condition,
    }));
    return resultFor("semantic_evidence", components, {
      checks: { package_assets: "passed", canonical_integrity: "passed", semantic_records: "evidence" },
      canonical_fence: state.canonicalFence,
      finding_count: components.length,
    }, { owners });
  }
  if (recordChecks.projections.length) {
    const components = recordChecks.projections.map(({ row, condition }) => ({
      component: "current_projection",
      owner: { id: row.owner_id, kind: row.owner_kind },
      condition,
    }));
    return resultFor("projection_only", components, {
      checks: { package_assets: "passed", canonical_integrity: "passed", semantic_records: "passed", projections: "failed" },
      canonical_fence: state.canonicalFence,
      finding_count: components.length,
    });
  }
  return resultFor("none", [], {
    checks: { package_assets: "passed", sqlite_runtime: "passed", store_protocol: "passed", canonical_integrity: "passed", semantic_records: "passed", projections: "passed" },
    canonical_fence: state.canonicalFence,
  });
}

export async function invokeIntegrityOperation(request) {
  try {
    if (request.operation !== "integrity.observe") return null;
    return await observe(request);
  } catch (error) {
    if (error instanceof IntegrityError || error instanceof ConfigurationError) {
      return failure(error.code, error.message, {
        failureClass: error.failureClass ?? "integrity.request_invalid",
        retryDisposition: error.retryDisposition ?? RETRY_DISPOSITIONS.NEVER,
        evidence: error.evidence ?? {},
      });
    }
    return failure("integrity.observation_failed", "Integrity observation failed without modifying the configured store.", {
      failureClass: "internal_failure",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      evidence: {},
    });
  }
}
