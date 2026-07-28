import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function asset(relative, expected) {
  const candidate = path.resolve(root, relative);
  const actual = await realpath(candidate);
  if (actual !== root && !actual.startsWith(`${root}${path.sep}`)) throw Error("bridge_asset_invalid");
  if (digest(await readFile(actual)) !== expected) throw Error("bridge_asset_invalid");
  return actual;
}

/**
 * Verifies the fixed bridge and its package-relative provider snapshot before
 * process dispatch. Neither identity is caller-provided or bridge-transported.
 */
export async function verifyPackageAssets() {
  const metadata = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  const contract = metadata.casebookCli;
  if (!contract || contract.bridge?.id !== "casebook-persistence-bridge@1" || contract.provider?.id !== "casebook-persistence@0.19.0-successor") throw Error("bridge_asset_invalid");
  await asset(contract.bridge.path, contract.bridge.sha256);
  const manifestPath = await asset(contract.provider.manifest, contract.provider.manifest_sha256);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.package?.id !== "casebook-persistence" || manifest.content_digest?.sha256 !== contract.provider.content_digest) throw Error("bridge_asset_invalid");
  return { bridge: contract.bridge, provider: contract.provider };
}
