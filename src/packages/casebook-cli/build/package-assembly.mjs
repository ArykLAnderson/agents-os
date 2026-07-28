import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyPackageAssets } from "../lib/package-assets.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const canonicalProviderRoot = path.resolve(packageRoot, "../../skills/casebook-persistence");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const contained = (root, candidate) => candidate !== root && candidate.startsWith(`${root}${path.sep}`);
const invalid = () => { throw Error("package_assembly_invalid"); };
const run = async (file, args, options) => await new Promise((resolve, reject) => execFile(file, args, options, (error, stdout, stderr) => {
  if (error) reject(Object.assign(error, { stdout, stderr }));
  else resolve({ stdout, stderr });
}));

async function regularFile(candidate) {
  const info = await lstat(candidate);
  if (!info.isFile() || info.isSymbolicLink()) invalid();
  return await readFile(candidate);
}

function relative(root, value) {
  if (typeof value !== "string" || !value || path.isAbsolute(value) || path.normalize(value) !== value) invalid();
  const candidate = path.resolve(root, value);
  if (!contained(root, candidate)) invalid();
  return candidate;
}

function aggregateContentDigest(assets) {
  return digest(Buffer.from([...assets]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((asset) => `${asset.path}\0${asset.sha256}\n`)
    .join("")));
}

function validContract(contract, publicManifest) {
  if (!contract || contract.bridge?.id !== "casebook-persistence-bridge@1" || contract.provider?.id !== "casebook-persistence@0.19.0-successor") invalid();
  if (!/^[0-9a-f]{64}$/.test(contract.bridge.sha256) || !/^[0-9a-f]{64}$/.test(contract.provider.manifest_sha256) || !/^[0-9a-f]{64}$/.test(contract.provider.content_digest)) invalid();
  if (JSON.stringify(publicManifest?.bridge) !== JSON.stringify(contract.bridge) || JSON.stringify(publicManifest?.provider) !== JSON.stringify(contract.provider)) invalid();
  return contract;
}

async function packageContract(sourceRoot) {
  const metadata = JSON.parse((await regularFile(path.join(sourceRoot, "package.json"))).toString("utf8"));
  const publicManifest = JSON.parse((await regularFile(path.join(sourceRoot, "manifest.json"))).toString("utf8"));
  return validContract(metadata.casebookCli, publicManifest);
}

async function copyCanonicalProvider(sourceRoot, targetRoot, contract) {
  const manifestBytes = await regularFile(path.join(sourceRoot, "manifest.json"));
  if (digest(manifestBytes) !== contract.provider.manifest_sha256) invalid();
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (manifest.package?.id !== "casebook-persistence" || manifest.package?.version !== "0.19.0-successor" || manifest.content_digest?.sha256 !== contract.provider.content_digest || !Array.isArray(manifest.assets)) invalid();
  const seen = new Set();
  for (const asset of manifest.assets) {
    if (!asset || !/^[0-9a-f]{64}$/.test(asset.sha256) || seen.has(asset.path)) invalid();
    seen.add(asset.path);
    const source = relative(sourceRoot, asset.path);
    const bytes = await regularFile(source);
    if (digest(bytes) !== asset.sha256) invalid();
    const target = relative(targetRoot, asset.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes, { mode: 0o644 });
  }
  if (aggregateContentDigest(manifest.assets) !== contract.provider.content_digest) invalid();
  await mkdir(targetRoot, { recursive: true });
  await writeFile(path.join(targetRoot, "manifest.json"), manifestBytes, { mode: 0o644 });
}

async function copyCliSource(sourceRoot, targetRoot) {
  await mkdir(targetRoot, { recursive: true });
  const metadata = JSON.parse((await regularFile(path.join(sourceRoot, "package.json"))).toString("utf8"));
  delete metadata.scripts?.package;
  await writeFile(path.join(targetRoot, "package.json"), `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o644 });
  for (const entry of ["manifest.json", "bin", "lib", "schemas", "bridge/persistence-bridge.mjs"]) {
    const source = path.join(sourceRoot, entry);
    const target = path.join(targetRoot, entry);
    const info = await lstat(source);
    if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory())) invalid();
    await cp(source, target, { recursive: info.isDirectory(), dereference: false, force: false, errorOnExist: true });
  }
}

/**
 * Creates an isolated, self-contained npm package assembly from the canonical
 * provider source and returns its ordinary npm-pack archive. The caller owns
 * the returned cleanup function; failed assemblies remove only their fresh
 * /tmp directory before exposing the generic failure.
 */
export async function packageCli({ sourceRoot = packageRoot, providerRoot = canonicalProviderRoot, environment = {} } = {}) {
  let temporaryRoot;
  try {
    const contract = await packageContract(sourceRoot);
    temporaryRoot = await mkdtemp("/tmp/casebook-cli-package-");
    const assembledPackage = path.join(temporaryRoot, "package");
    await copyCliSource(sourceRoot, assembledPackage);
    await copyCanonicalProvider(providerRoot, path.join(assembledPackage, "bridge", "runtime", "casebook-persistence"), contract);
    await verifyPackageAssets(assembledPackage);
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const packed = JSON.parse((await run(npm, ["pack", "--json", "--ignore-scripts"], {
      cwd: assembledPackage,
      env: { ...process.env, ...environment },
      maxBuffer: 4 * 1024 * 1024,
    })).stdout);
    const filename = packed?.[0]?.filename;
    if (typeof filename !== "string" || path.basename(filename) !== filename) invalid();
    const archive = path.join(temporaryRoot, filename);
    await rename(path.join(assembledPackage, filename), archive);
    return {
      archive,
      assemblyRoot: temporaryRoot,
      cleanup: async () => await rm(temporaryRoot, { recursive: true, force: true }),
    };
  } catch {
    if (temporaryRoot) await rm(temporaryRoot, { recursive: true, force: true });
    const failure = Error("package_assembly_invalid");
    failure.temporaryRoot = temporaryRoot;
    throw failure;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  packageCli().then(({ archive }) => process.stdout.write(`${archive}\n`)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
