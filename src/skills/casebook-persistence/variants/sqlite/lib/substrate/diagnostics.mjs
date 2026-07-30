import { mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateAuthorityConfiguration, ConfigurationError } from "../../../../shared/config.mjs";
import { loadAndValidateManifest, PACKAGE_ROOT, sha256 } from "../../../../shared/manifest.mjs";
import { failure, RETRY_DISPOSITIONS, SCHEMA_ID, SCHEMA_VERSION, success } from "../../../../shared/protocol.mjs";
import { DatabaseSync, inspectVendoredAssets, VENDORED_ASSET_DIGESTS, executeSqlite } from "./embedded-sqlite.mjs";

const REQUIRED_FEATURES = Object.freeze(["json", "strict", "returning", "fts5", "foreign_keys", "wal"]);
const SQL_ASSET = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../sql/schema-successor.sql");
const RUNTIME_ASSET = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../manifests/runtime.json");

export const PINNED_RUNTIME_CONTRACT = Object.freeze({
  contract: "casebook-sqlite-wasm-runtime@1",
  ownership: "package-vendored-runtime-assets",
  node_engine: ">=22",
  sqlite: Object.freeze({
    package: "@sqlite.org/sqlite-wasm",
    package_version: "3.53.0-build1",
    module: "variants/sqlite/vendor/sqlite-wasm-3.53.0-build1/dist/node.mjs",
    wasm: "variants/sqlite/vendor/sqlite-wasm-3.53.0-build1/dist/sqlite3.wasm",
    license_notice: "variants/sqlite/vendor/sqlite-wasm-3.53.0-build1/LICENSE-NOTICE.txt",
    assets: VENDORED_ASSET_DIGESTS,
    version: "3.53.0",
    source_id: "2026-04-09 11:41:38 4525003a53a7fc63ca75c59b22c79608659ca12f0131f52c18637f829977f20b",
    features: Object.freeze({ json: true, strict: true, returning: true, fts5: true, foreign_keys: true, wal: true }),
    persistence: "bounded-package-lock-atomic-fsync-replace",
  }),
});

function sameContract(actual, required = PINNED_RUNTIME_CONTRACT) { return JSON.stringify(actual) === JSON.stringify(required); }
function supportedNode(version = process.versions.node) { return Number.parseInt(String(version).split(".")[0], 10) >= 22; }

export function inspectEmbeddedRuntime() {
  const assets = inspectVendoredAssets();
  if (!assets.ok) return { ...PINNED_RUNTIME_CONTRACT, sqlite: { ...PINNED_RUNTIME_CONTRACT.sqlite, assets: assets.actual, version: null, source_id: null, features: Object.fromEntries(REQUIRED_FEATURES.map((feature) => [feature, false])) } };
  const db = new DatabaseSync(":memory:");
  try {
    const identity = db.prepare("SELECT sqlite_version() version,sqlite_source_id() source_id,sqlite_compileoption_used('OMIT_WAL') omit_wal").get();
    const json = db.prepare("SELECT json_valid('{\"ok\":true}') ok").get().ok === 1;
    db.exec("CREATE TABLE strict_probe(value TEXT) STRICT; PRAGMA foreign_keys=ON;");
    const returning = db.prepare("INSERT INTO strict_probe(value) VALUES ('ok') RETURNING value").get().value === "ok";
    db.exec("CREATE VIRTUAL TABLE fts_probe USING fts5(content)");
    const fts5 = db.prepare("SELECT count(*) count FROM fts_probe").get().count === 0;
    const foreignKeys = db.prepare("SELECT foreign_keys FROM pragma_foreign_keys").get().foreign_keys === 1;
    return {
      contract: "casebook-sqlite-wasm-runtime@1", ownership: "package-vendored-runtime-assets", node_engine: ">=22",
      sqlite: {
        ...PINNED_RUNTIME_CONTRACT.sqlite,
        assets: assets.actual,
        version: identity.version,
        source_id: identity.source_id,
        features: { json, strict: true, returning, fts5, foreign_keys: foreignKeys, wal: identity.omit_wal === 0 },
      },
    };
  } finally { db.close(); }
}

export function embeddedRuntimeIncompatibility(actual = inspectEmbeddedRuntime()) {
  if (supportedNode() && sameContract(actual)) return null;
  return failure("embedded_runtime_incompatible", "The package-vendored SQLite WASM bytes, source, or required features do not match the trusted runtime contract.", {
    failureClass: "runtime_incompatible", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
    evidence: { selected: actual, required: PINNED_RUNTIME_CONTRACT, node: { selected: process.versions.node, required: PINNED_RUNTIME_CONTRACT.node_engine } },
  });
}

export function nodeRuntimeIncompatibility(runtime) {
  return supportedNode(runtime.version) ? null : failure("embedded_runtime_incompatible", "The Node.js launcher does not satisfy the supported package engine range.", {
    failureClass: "runtime_incompatible", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
    evidence: { selected: runtime.version, required: PINNED_RUNTIME_CONTRACT.node_engine },
  });
}

export async function admitEmbeddedRuntime(internal = {}) {
  const actual = internal.runtime ?? inspectEmbeddedRuntime();
  const incompatible = embeddedRuntimeIncompatibility(actual);
  if (incompatible) return incompatible;
  try {
    const [packageManifest, runtimeBytes] = await Promise.all([
      readFile(path.join(PACKAGE_ROOT, "manifest.json"), "utf8").then(JSON.parse), readFile(RUNTIME_ASSET),
    ]);
    const runtimeManifest = JSON.parse(runtimeBytes);
    const runtimeAsset = packageManifest.assets?.find((asset) => asset.path === "variants/sqlite/manifests/runtime.json");
    const requiredRuntimeAssets = new Map([
      [PINNED_RUNTIME_CONTRACT.sqlite.module, VENDORED_ASSET_DIGESTS.node_mjs],
      [PINNED_RUNTIME_CONTRACT.sqlite.wasm, VENDORED_ASSET_DIGESTS.sqlite3_wasm],
      [PINNED_RUNTIME_CONTRACT.sqlite.license_notice, VENDORED_ASSET_DIGESTS.license_notice],
    ]);
    if (!sameContract(packageManifest.runtime) || !sameContract(runtimeManifest.runtime) || runtimeAsset?.sha256 !== sha256(runtimeBytes)) throw new Error("runtime contract binding mismatch");
    for (const [assetPath, digest] of requiredRuntimeAssets) if (packageManifest.assets?.find((asset) => asset.path === assetPath)?.sha256 !== digest) throw new Error("vendored runtime asset binding mismatch");
    return null;
  } catch {
    return failure("runtime_contract_asset_incompatible", "The package manifest does not bind the exact vendored SQLite WASM runtime assets.", {
      failureClass: "asset_incompatible", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      evidence: { manifest_path: path.join(PACKAGE_ROOT, "manifest.json") },
    });
  }
}

export async function selectSqliteBinary(configured, internal = {}) {
  if (configured != null) throw new ConfigurationError("sqlite_runtime_override_rejected", "The package-vendored SQLite WASM runtime cannot be overridden.");
  const incompatible = embeddedRuntimeIncompatibility(internal.runtime ?? inspectEmbeddedRuntime());
  if (incompatible) throw new ConfigurationError(incompatible.failure.code, incompatible.failure.message, incompatible.failure.evidence);
  return { path: process.execPath, source: "package-vendored-sqlite-wasm", contract: PINNED_RUNTIME_CONTRACT };
}

export async function sqlite(_runtime, database, sql, options = {}) {
  const readOnly = options.readOnly ?? /^\s*PRAGMA\s+query_only\s*=\s*ON\s*;/i.test(String(sql));
  try { return executeSqlite(database, sql, { json: (options.args ?? []).includes("-json"), timeout: options.timeout ?? 10_000, readOnly }); }
  catch (error) { error.stdout ??= ""; error.stderr ??= error.message; throw error; }
}

export async function probeSqlite(_runtime, probeDirectory) {
  if (!path.isAbsolute(probeDirectory)) throw new ConfigurationError("relative_path_rejected", "probe_directory must be absolute.", { field: "probe_directory" });
  const probeParent = await realpath(probeDirectory).catch(() => null);
  if (!probeParent) throw new ConfigurationError("probe_directory_unavailable", "probe_directory must already exist.");
  const temporary = await mkdtemp(path.join(probeParent, "casebook-persistence-probe-"));
  const database = path.join(temporary, "features.sqlite3");
  try {
    const sql = [
      "PRAGMA foreign_keys=ON;", "SELECT 'json=' || json_valid('{\"ok\":true}');",
      "CREATE TABLE strict_probe(value TEXT) STRICT;", "INSERT INTO strict_probe(value) VALUES ('ok') RETURNING 'returning=' || value;",
      "CREATE VIRTUAL TABLE fts_probe USING fts5(content);", "SELECT 'fts5=' || count(*) FROM fts_probe;",
      "SELECT 'foreign_keys=' || foreign_keys FROM pragma_foreign_keys;", "SELECT sqlite_version();", "SELECT sqlite_source_id();",
    ].join("\n");
    const { stdout } = await sqlite(null, database, sql);
    const lower = stdout.toLowerCase(), lines = stdout.trim().split("\n");
    const features = { json: lower.includes("json=1"), strict: lower.includes("returning=ok"), returning: lower.includes("returning=ok"), fts5: lower.includes("fts5=0"), foreign_keys: lower.includes("foreign_keys=1"), wal: true };
    const actual = inspectEmbeddedRuntime(), problems = REQUIRED_FEATURES.filter((feature) => !features[feature]);
    if (!sameContract(actual)) problems.push("exact_runtime_contract");
    return { ok: problems.length === 0, version: lines.at(-2), source_id: lines.at(-1), features, problems, source: "package-vendored-sqlite-wasm" };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

export async function diagnose(request) {
  try {
    const runtimeFailure = await admitEmbeddedRuntime(); if (runtimeFailure) return runtimeFailure;
    const configuration = validateAuthorityConfiguration(request.configuration), manifestCheck = await loadAndValidateManifest();
    if (!manifestCheck.ok) return failure("asset_incompatible", "Package manifest or asset verification failed.", { failureClass: "asset_incompatible", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR, evidence: { problems: manifestCheck.problems, manifest_path: manifestCheck.manifest_path } });
    const base = {
      configuration: { authority_mode: configuration.authority_mode, resolved_store_path: configuration.sqlite?.store_path ?? null, resolved_workspace_root: configuration.markdown?.workspace_root ?? null },
      interpreter: { path: process.execPath, version: process.versions.node, required_engine: PINNED_RUNTIME_CONTRACT.node_engine, role: "javascript-launcher-only" },
      package: { root: PACKAGE_ROOT, manifest_path: manifestCheck.manifest_path, manifest_sha256: manifestCheck.manifest_sha256, content_digest: manifestCheck.manifest.content_digest.sha256, assets_verified: manifestCheck.manifest.assets.length, source_isolation: "self-relative-package-root" },
      compatibility: { protocol: { compatible: true, id: manifestCheck.manifest.protocol.id, version: manifestCheck.manifest.protocol.version }, schema: { compatible: true, id: SCHEMA_ID, version: SCHEMA_VERSION, store_check: "successor-only" } },
    };
    if (configuration.authority_mode === "markdown") return success("diagnose", { ...base, selected_variant: "markdown", sqlite: { selected: false, reason: "markdown_authority_selected" }, bounded_runtime_probe: { status: "not_applicable", configured_store_accessed: false } });
    const selected = await selectSqliteBinary(), probe = await probeSqlite(selected.path, request.probe_directory), schemaBytes = await readFile(SQL_ASSET);
    const syntax = await sqlite(selected.path, ":memory:", schemaBytes.toString("utf8")).then(() => ({ ok: true, stderr: "" })).catch((error) => ({ ok: false, stderr: error.message }));
    if (!probe.ok || !syntax.ok) return failure("sqlite_feature_unsupported", "The package-vendored SQLite WASM runtime does not satisfy package diagnostics.", { failureClass: "sqlite_feature_unsupported", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR, evidence: { selected, probe, syntax } });
    return success("diagnose", { ...base, selected_variant: "sqlite", sqlite: { selected: true, engine: selected, version: probe.version, source_id: probe.source_id, required_features: REQUIRED_FEATURES, features: probe.features }, syntax: { schema_asset: path.relative(PACKAGE_ROOT, SQL_ASSET), sha256: sha256(schemaBytes), valid: true }, bounded_runtime_probe: { status: "passed", configured_store_accessed: false, temporary_probe_deleted: true } });
  } catch (error) {
    if (error instanceof ConfigurationError) return failure(error.code, error.message, { evidence: error.evidence });
    return failure("internal_failure", "Diagnostics failed before store access.", { failureClass: "internal_failure", retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR, evidence: { error: error instanceof Error ? error.message : String(error) } });
  }
}
