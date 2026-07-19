import { constants as fsConstants } from "node:fs";
import { access, cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { aggregateContentDigest, sha256 } from "../shared/manifest.mjs";

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

export const SOURCE_PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const TARGET_LAYOUTS = Object.freeze({
  pi: "pi/skills/casebook-persistence",
  codex: "codex/skills/casebook-persistence",
  opencode: "opencode/skills/casebook-persistence",
});

function assertContained(root, candidate, label) {
  const relative = path.relative(root, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`${label} must be a child of the disposable sandbox root`);
  }
}

async function invoke(nodeBinary, entrypoint, cwd, home, request) {
  try {
    const result = await execFileWithInput(nodeBinary, [entrypoint], {
      cwd,
      encoding: "utf8",
      timeout: 20_000,
      maxBuffer: 2 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? "", HOME: home },
    }, `${JSON.stringify(request)}\n`);
    return { exitCode: 0, stdout: result.stdout, stderr: result.stderr, json: JSON.parse(result.stdout) };
  } catch (error) {
    const stdout = error.stdout ?? "";
    let json = {};
    try { json = JSON.parse(stdout); } catch { /* Preserve process evidence for the caller. */ }
    return { exitCode: error.code, stdout, stderr: error.stderr ?? "", json };
  }
}

async function verifyManifest(packageRoot) {
  const manifestBytes = await readFile(path.join(packageRoot, "manifest.json"));
  const manifest = JSON.parse(manifestBytes);
  const failures = [];
  for (const asset of manifest.assets) {
    const assetPath = path.resolve(packageRoot, asset.path);
    assertContained(packageRoot, assetPath, `manifest asset ${asset.path}`);
    if (sha256(await readFile(assetPath)) !== asset.sha256) failures.push(asset.path);
  }
  if (aggregateContentDigest(manifest.assets) !== manifest.content_digest.sha256) failures.push("content_digest");
  return { manifest, manifestSha256: sha256(manifestBytes), failures };
}

export async function generateAndValidateSandbox({ sandboxRoot, sqliteBinary, nodeBinary = process.execPath }) {
  if (!path.isAbsolute(sandboxRoot)) throw new Error("sandboxRoot must be absolute");
  sqliteBinary = await selectCompatibleSqliteBinary(sqliteBinary);
  await mkdir(sandboxRoot, { recursive: true });
  const root = await realpath(sandboxRoot);
  const source = await realpath(SOURCE_PACKAGE_ROOT);
  if (root === source || root.startsWith(`${source}${path.sep}`) || source.startsWith(`${root}${path.sep}`)) {
    throw new Error("sandboxRoot and source package must be unrelated");
  }
  await access(sqliteBinary, fsConstants.X_OK);

  const home = path.join(root, "home");
  const cwd = path.join(root, "unrelated-cwd");
  const destinations = path.join(root, "generated-layouts");
  const data = path.join(root, "synthetic-data");
  const probes = path.join(root, "probes");
  for (const directory of [home, cwd, destinations, data, probes]) {
    assertContained(root, directory, "sandbox resource");
    await mkdir(directory, { recursive: true });
  }

  const ledger = {
    version: 1,
    authority_class: "synthetic-disposable-l01-w01",
    owner: "casebook-persistence-sandbox-harness",
    root,
    retention: "delete-on-harness-completion",
    resources: [home, cwd, destinations, data, probes],
  };
  await writeFile(path.join(root, "resource-ledger.json"), `${JSON.stringify(ledger, null, 2)}\n`);

  const results = [];
  for (const [target, relativeDestination] of Object.entries(TARGET_LAYOUTS)) {
    const packageDestination = path.join(destinations, relativeDestination);
    assertContained(root, packageDestination, `${target} destination`);
    await mkdir(path.dirname(packageDestination), { recursive: true });
    await cp(source, packageDestination, { recursive: true, errorOnExist: true });

    const sourceManifest = await verifyManifest(source);
    const copiedManifest = await verifyManifest(packageDestination);
    if (sourceManifest.manifestSha256 !== copiedManifest.manifestSha256 || copiedManifest.failures.length) {
      throw new Error(`${target} manifest/asset bytes differ from source`);
    }

    const probeDirectory = path.join(probes, target);
    await mkdir(probeDirectory, { recursive: true });
    const configuredStore = path.join(data, `${target}.sqlite3`);
    const request = {
      protocol: { id: "casebook-persistence-json", version: 1 },
      operation: "diagnose",
      configuration: {
        source: { kind: "sandbox-harness", locator: `synthetic:${target}` },
        authority_mode: "sqlite",
        sqlite: { database_url: `file:${configuredStore}`, sqlite_bin: sqliteBinary },
      },
      probe_directory: probeDirectory,
    };
    const entrypoint = path.join(packageDestination, copiedManifest.manifest.entrypoints[0].path);
    const diagnostic = await invoke(nodeBinary, entrypoint, cwd, home, request);
    if (diagnostic.exitCode !== 0 || !diagnostic.json.ok) throw new Error(`${target} diagnostics failed: ${diagnostic.stderr}`);
    if (diagnostic.json.result.package.root !== packageDestination) throw new Error(`${target} used a source-tree fallback`);
    if (diagnostic.json.result.bounded_runtime_probe.configured_store_accessed !== false) throw new Error(`${target} accessed configured store`);
    if (await stat(configuredStore).then(() => true).catch(() => false)) throw new Error(`${target} created configured store`);
    if ((await readdir(probeDirectory)).length !== 0) throw new Error(`${target} left probe debris`);

    const unsupportedRequest = { ...request, operation: "case.create" };
    const unsupported = await invoke(nodeBinary, entrypoint, cwd, home, unsupportedRequest);
    if (unsupported.exitCode !== 2 || unsupported.json.failure?.code !== "not_yet_implemented") {
      throw new Error(`${target} did not fail closed for later operation`);
    }
    const mechanical = await invoke(nodeBinary, entrypoint, cwd, home, {
      ...request,
      operation: "commit_owner_revision",
    });
    if (mechanical.exitCode !== 2
      || mechanical.json.failure?.code !== "not_yet_implemented"
      || mechanical.json.failure?.evidence?.supported_operations?.includes("commit_owner_revision")) {
      throw new Error(`${target} shipped connector exposed a generic mechanical operation`);
    }

    results.push({
      target,
      package_root: packageDestination,
      manifest_sha256: copiedManifest.manifestSha256,
      content_digest: copiedManifest.manifest.content_digest.sha256,
      assets_verified: copiedManifest.manifest.assets.length,
      diagnostic: "passed",
      unsupported_later_operation: "passed",
      generic_mechanical_operation_rejected: "passed",
      configured_store_created: false,
      source_fallback: false,
    });
  }

  return { root, home, ledger, sqlite_binary: sqliteBinary, results };
}

export async function cleanupSandbox(root) {
  await rm(root, { recursive: true, force: true });
  return !(await stat(root).then(() => true).catch(() => false));
}

async function sqliteIsCompatible(candidate) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-sqlite-screen-"));
  try {
    const binary = await realpath(candidate);
    await access(binary, fsConstants.X_OK);
    const database = path.join(temporary, "features.sqlite3");
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
    const { stdout, stderr } = await execFileWithInput(binary, [database], {
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" },
    }, sql);
    const lower = stdout.toLowerCase();
    return !stderr.trim()
      && lower.includes("json=1")
      && lower.includes("returning=ok")
      && lower.includes("fts5=0")
      && lower.includes("foreign_keys=1")
      && lower.split(/\s+/).includes("wal");
  } catch {
    return false;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function selectCompatibleSqliteBinary(explicit = process.env.CASEBOOK_TEST_SQLITE_BIN) {
  if (explicit) {
    const candidate = path.resolve(explicit);
    if (!await sqliteIsCompatible(candidate)) {
      throw new Error(`Explicit sqlite3 binary is unavailable or incompatible: ${candidate}`);
    }
    return realpath(candidate);
  }

  const candidates = [];
  const seen = new Set();
  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (!directory) continue;
    const candidate = path.join(directory, "sqlite3");
    try {
      const resolved = await realpath(candidate);
      if (!seen.has(resolved)) {
        seen.add(resolved);
        candidates.push(resolved);
      }
    } catch {
      // Continue to the next PATH entry.
    }
  }
  const systemCandidate = "/usr/bin/sqlite3";
  try {
    const resolved = await realpath(systemCandidate);
    if (!seen.has(resolved)) candidates.push(resolved);
  } catch {
    // The system candidate is optional.
  }
  for (const candidate of candidates) {
    if (await sqliteIsCompatible(candidate)) return candidate;
  }
  throw new Error("No compatible sqlite3 found; pass --sqlite-bin /absolute/path");
}

async function main() {
  const args = process.argv.slice(2);
  const valueAfter = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : null;
  };
  const requestedRoot = valueAfter("--sandbox-root");
  const sqliteBinary = await selectCompatibleSqliteBinary(valueAfter("--sqlite-bin") ?? undefined);
  const root = requestedRoot ? path.resolve(requestedRoot) : await mkdtemp(path.join(os.tmpdir(), "casebook-persistence-w01-"));
  const keep = args.includes("--keep");
  let report;
  try {
    report = await generateAndValidateSandbox({ sandboxRoot: root, sqliteBinary });
  } finally {
    if (!keep) await cleanupSandbox(root);
  }
  process.stdout.write(`${JSON.stringify({ ...report, cleanup_verified: keep ? false : !(await stat(root).then(() => true).catch(() => false)) }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
