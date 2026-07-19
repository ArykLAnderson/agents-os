import { constants as fsConstants } from "node:fs";
import { access, mkdtemp, readFile, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { validateAuthorityConfiguration, ConfigurationError } from "../../../../shared/config.mjs";
import { loadAndValidateManifest, PACKAGE_ROOT, sha256 } from "../../../../shared/manifest.mjs";
import { failure, RETRY_DISPOSITIONS, SCHEMA_ID, SCHEMA_VERSION, success } from "../../../../shared/protocol.mjs";

const execFileAsync = promisify(execFile);

function execFileWithInput(file, args, options, input) {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
    child.stdin.end(input);
  });
}

const REQUIRED_FEATURES = Object.freeze(["json", "strict", "returning", "fts5", "foreign_keys", "wal"]);
const REQUIRED_NODE_VERSION = Object.freeze([22, 0, 0]);
const REQUIRED_NODE_VERSION_TEXT = ">=22.0.0";
const SQL_ASSET = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../sql/schema-v1.sql");

function versionTuple(text) {
  const match = String(text).match(/^(\d+)\.(\d+)\.(\d+)/);
  return match ? match.slice(1).map(Number) : null;
}

function versionAtLeast(actual, required) {
  for (let i = 0; i < required.length; i += 1) {
    if (actual[i] > required[i]) return true;
    if (actual[i] < required[i]) return false;
  }
  return true;
}

async function findOnPath(name) {
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try {
      await access(candidate, fsConstants.X_OK);
      return realpath(candidate);
    } catch {
      // Continue to the next PATH entry.
    }
  }
  return null;
}

async function selectSqliteBinary(configured) {
  const candidate = configured ?? await findOnPath("sqlite3");
  if (!candidate) throw new ConfigurationError("sqlite_binary_unavailable", "No capability-checkable sqlite3 binary was selected.");
  await access(candidate, fsConstants.X_OK).catch(() => {
    throw new ConfigurationError("sqlite_binary_unavailable", "The selected sqlite3 binary is not executable.", { selected: candidate });
  });
  return { path: await realpath(candidate), source: configured ? "configuration.sqlite.sqlite_bin" : "PATH" };
}

async function sqlite(binary, database, sql) {
  return execFileWithInput(binary, [database], {
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" },
  }, sql);
}

async function probeSqlite(binary, probeDirectory) {
  if (!path.isAbsolute(probeDirectory)) {
    throw new ConfigurationError("relative_path_rejected", "probe_directory must be absolute.", { field: "probe_directory" });
  }
  const probeParent = await realpath(probeDirectory).catch(() => null);
  if (!probeParent) throw new ConfigurationError("probe_directory_unavailable", "probe_directory must already exist.");
  const temporary = await mkdtemp(path.join(probeParent, "casebook-persistence-probe-"));
  const database = path.join(temporary, "features.sqlite3");
  try {
    const { stdout: versionStdout } = await execFileAsync(binary, ["--version"], { encoding: "utf8", timeout: 10_000 });
    const version = versionTuple(versionStdout.trim());
    if (!version || !versionAtLeast(version, [3, 37, 0])) {
      return { ok: false, version: versionStdout.trim(), features: {}, problems: ["sqlite_version"] };
    }

    const sql = [
      "PRAGMA foreign_keys=ON;",
      "SELECT 'json=' || json_valid('{\"ok\":true}');",
      "CREATE TABLE strict_probe(value TEXT) STRICT;",
      "INSERT INTO strict_probe(value) VALUES ('ok') RETURNING 'returning=' || value;",
      "CREATE VIRTUAL TABLE fts_probe USING fts5(content);",
      "SELECT 'fts5=' || count(*) FROM fts_probe;",
      "SELECT 'foreign_keys=' || foreign_keys FROM pragma_foreign_keys;",
      "PRAGMA journal_mode=WAL;",
    ].join("\n");
    let stdout = "";
    let stderr = "";
    try {
      ({ stdout, stderr } = await sqlite(binary, database, sql));
    } catch (error) {
      stdout = error.stdout ?? "";
      stderr = error.stderr ?? error.message;
    }
    const lower = stdout.toLowerCase();
    const features = {
      json: lower.includes("json=1"),
      strict: lower.includes("returning=ok"),
      returning: lower.includes("returning=ok"),
      fts5: lower.includes("fts5=0"),
      foreign_keys: lower.includes("foreign_keys=1"),
      wal: lower.split(/\s+/).includes("wal"),
    };
    const problems = REQUIRED_FEATURES.filter((feature) => !features[feature]);
    return { ok: problems.length === 0 && !stderr.trim(), version: versionStdout.trim(), features, problems, stderr: stderr.trim() };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export function nodeRuntimeIncompatibility(runtime) {
  const selectedNodeVersion = versionTuple(runtime.version);
  if (selectedNodeVersion && versionAtLeast(selectedNodeVersion, REQUIRED_NODE_VERSION)) return null;
  return failure("node_runtime_unsupported", "Selected Node.js runtime does not satisfy the package prerequisite.", {
    failureClass: "runtime_incompatible",
    retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
    evidence: {
      selected: { path: runtime.path, version: runtime.version },
      required: { version: REQUIRED_NODE_VERSION_TEXT },
    },
  });
}

export async function diagnose(request) {
  try {
    const runtime = { path: process.execPath, version: process.versions.node };
    const runtimeFailure = nodeRuntimeIncompatibility(runtime);
    if (runtimeFailure) return runtimeFailure;

    const configuration = validateAuthorityConfiguration(request.configuration);
    const manifestCheck = await loadAndValidateManifest();
    if (!manifestCheck.ok) {
      return failure("asset_incompatible", "Package manifest or asset verification failed.", {
        failureClass: "asset_incompatible",
        retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
        evidence: { problems: manifestCheck.problems, manifest_path: manifestCheck.manifest_path },
      });
    }

    const base = {
      configuration: {
        source: configuration.source,
        authority_mode: configuration.authority_mode,
        resolved_store_path: configuration.sqlite?.store_path ?? null,
        resolved_workspace_root: configuration.markdown?.workspace_root ?? null,
      },
      interpreter: { path: runtime.path, version: runtime.version, required_version: REQUIRED_NODE_VERSION_TEXT, invocation: "explicit-node" },
      package: {
        root: PACKAGE_ROOT,
        manifest_path: manifestCheck.manifest_path,
        manifest_sha256: manifestCheck.manifest_sha256,
        content_digest: manifestCheck.manifest.content_digest.sha256,
        assets_verified: manifestCheck.manifest.assets.length,
        source_isolation: "self-relative-package-root",
      },
      compatibility: {
        protocol: { compatible: true, id: manifestCheck.manifest.protocol.id, version: manifestCheck.manifest.protocol.version },
        schema: { compatible: true, id: SCHEMA_ID, version: SCHEMA_VERSION, store_check: "not_applicable_before_L01_W02" },
      },
    };

    if (configuration.authority_mode === "markdown") {
      return success("diagnose", {
        ...base,
        selected_variant: "markdown",
        sqlite: { selected: false, reason: "markdown_authority_selected" },
        bounded_runtime_probe: { status: "not_applicable", configured_store_accessed: false },
      });
    }

    const selected = await selectSqliteBinary(configuration.sqlite.sqlite_bin);
    const probe = await probeSqlite(selected.path, request.probe_directory);
    const schemaBytes = await readFile(SQL_ASSET);
    const syntax = await sqlite(selected.path, ":memory:", schemaBytes.toString("utf8"))
      .then(({ stderr }) => ({ ok: !stderr.trim(), stderr: stderr.trim() }))
      .catch((error) => ({ ok: false, stderr: error.stderr || error.message }));
    if (!probe.ok || !syntax.ok) {
      return failure("sqlite_feature_unsupported", "Selected SQLite runtime does not satisfy package diagnostics.", {
        failureClass: "sqlite_feature_unsupported",
        retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
        evidence: { selected, probe, syntax },
      });
    }

    return success("diagnose", {
      ...base,
      selected_variant: "sqlite",
      sqlite: {
        selected: true,
        binary: selected,
        version: probe.version,
        required_features: REQUIRED_FEATURES,
        features: probe.features,
      },
      syntax: { schema_asset: path.relative(PACKAGE_ROOT, SQL_ASSET), sha256: sha256(schemaBytes), valid: syntax.ok },
      bounded_runtime_probe: { status: "passed", configured_store_accessed: false, temporary_probe_deleted: true },
    });
  } catch (error) {
    if (error instanceof ConfigurationError) {
      return failure(error.code, error.message, { evidence: error.evidence });
    }
    return failure("internal_failure", "Diagnostics failed before store access.", {
      failureClass: "internal_failure",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      evidence: { error: error instanceof Error ? error.message : String(error) },
    });
  }
}
