import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PACKAGE_ID, PROTOCOL_ID, PROTOCOL_VERSION, SCHEMA_ID, SCHEMA_VERSION } from "./protocol.mjs";

export const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const MANIFEST_PATH = path.join(PACKAGE_ROOT, "manifest.json");

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function aggregateContentDigest(assets) {
  const canonical = [...assets]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(({ path: assetPath, sha256: digest }) => `${assetPath}\0${digest}\n`)
    .join("");
  return sha256(Buffer.from(canonical));
}

export async function loadAndValidateManifest() {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  const problems = [];
  if (manifest.manifest_version !== 1) problems.push("manifest_version");
  if (manifest.package?.id !== PACKAGE_ID) problems.push("package.id");
  if (manifest.protocol?.id !== PROTOCOL_ID || manifest.protocol?.version !== PROTOCOL_VERSION) problems.push("protocol");
  if (manifest.schema?.id !== SCHEMA_ID || manifest.schema?.version !== SCHEMA_VERSION) problems.push("schema");

  const rootReal = await realpath(PACKAGE_ROOT);
  for (const asset of manifest.assets ?? []) {
    const candidate = path.resolve(PACKAGE_ROOT, asset.path);
    const candidateReal = await realpath(candidate).catch(() => null);
    if (!candidateReal || (candidateReal !== rootReal && !candidateReal.startsWith(`${rootReal}${path.sep}`))) {
      problems.push(`asset_path:${asset.path}`);
      continue;
    }
    const actual = sha256(await readFile(candidateReal));
    if (actual !== asset.sha256) problems.push(`asset_digest:${asset.path}`);
  }
  if (aggregateContentDigest(manifest.assets ?? []) !== manifest.content_digest?.sha256) problems.push("content_digest");

  return {
    ok: problems.length === 0,
    problems,
    manifest,
    manifest_path: MANIFEST_PATH,
    package_root: PACKAGE_ROOT,
    manifest_sha256: sha256(await readFile(MANIFEST_PATH)),
  };
}
