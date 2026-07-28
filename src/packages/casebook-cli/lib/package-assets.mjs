import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir, readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const aggregateContentDigest = (assets) => digest(Buffer.from([...assets]
  .sort((left, right) => left.path.localeCompare(right.path))
  .map((asset) => `${asset.path}\0${asset.sha256}\n`)
  .join("")));
const contained = (rootPath, candidate) => candidate !== rootPath && candidate.startsWith(`${rootPath}${path.sep}`);

async function asset(relative, expected) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative) || path.normalize(relative) !== relative) throw Error("bridge_asset_invalid");
  const candidate = path.resolve(root, relative);
  if (!contained(root, candidate)) throw Error("bridge_asset_invalid");
  const listed = await lstat(candidate);
  if (!listed.isFile() || listed.isSymbolicLink()) throw Error("bridge_asset_invalid");
  const file = await open(candidate, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = await file.stat();
    if (!opened.isFile() || opened.isSymbolicLink() || listed.dev !== opened.dev || listed.ino !== opened.ino || digest(await file.readFile()) !== expected) throw Error("bridge_asset_invalid");
  } finally {
    await file.close();
  }
  return candidate;
}

async function runtimeFiles(directory, runtimeRoot, files = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const candidate = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw Error("bridge_asset_invalid");
    if (entry.isDirectory()) await runtimeFiles(candidate, runtimeRoot, files);
    else if (entry.isFile()) files.push(path.relative(runtimeRoot, candidate));
    else throw Error("bridge_asset_invalid");
  }
  return files;
}

async function verifyProviderRuntime(manifestPath, provider) {
  const runtimeRoot = path.dirname(manifestPath);
  const runtimeInfo = await lstat(runtimeRoot);
  if (!runtimeInfo.isDirectory() || runtimeInfo.isSymbolicLink()) throw Error("bridge_asset_invalid");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.package?.id !== "casebook-persistence" || manifest.content_digest?.sha256 !== provider.content_digest || !Array.isArray(manifest.assets)) throw Error("bridge_asset_invalid");

  const declared = new Map();
  for (const entry of manifest.assets) {
    if (!entry || typeof entry.path !== "string" || !/^[0-9a-f]{64}$/.test(entry.sha256) || path.isAbsolute(entry.path) || !entry.path || path.normalize(entry.path) !== entry.path || declared.has(entry.path)) throw Error("bridge_asset_invalid");
    const candidate = path.resolve(runtimeRoot, entry.path);
    if (!contained(runtimeRoot, candidate)) throw Error("bridge_asset_invalid");
    const info = await lstat(candidate);
    if (!info.isFile() || info.isSymbolicLink() || digest(await readFile(candidate)) !== entry.sha256) throw Error("bridge_asset_invalid");
    declared.set(entry.path, entry);
  }
  const actual = (await runtimeFiles(runtimeRoot, runtimeRoot)).filter((file) => file !== "manifest.json");
  const expected = new Set(declared.keys());
  if (actual.length !== expected.size || actual.some((file) => !expected.has(file)) || [...expected].some((file) => !actual.includes(file))) throw Error("bridge_asset_invalid");
  if (aggregateContentDigest(manifest.assets) !== manifest.content_digest.sha256) throw Error("bridge_asset_invalid");
}

/**
 * Verifies the fixed bridge and complete package-relative provider snapshot
 * before the CLI can spawn the bridge or dynamically import provider code.
 */
export async function verifyPackageAssets() {
  try {
    const metadata = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    const contract = metadata.casebookCli;
    if (!contract || contract.bridge?.id !== "casebook-persistence-bridge@1" || contract.provider?.id !== "casebook-persistence@0.19.0-successor") throw Error("bridge_asset_invalid");
    await asset(contract.bridge.path, contract.bridge.sha256);
    const manifestPath = await asset(contract.provider.manifest, contract.provider.manifest_sha256);
    await verifyProviderRuntime(manifestPath, contract.provider);
    return { bridge: contract.bridge, provider: contract.provider };
  } catch {
    throw Error("bridge_asset_invalid");
  }
}
