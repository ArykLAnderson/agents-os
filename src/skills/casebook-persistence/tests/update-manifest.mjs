import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateContentDigest, sha256 } from "../shared/manifest.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetDefinitions = [
  ["skill-guidance", "SKILL.md", "model_guidance"],
  ["human-install-guidance", "INSTALL.md", "human_documentation"],
  ["shared-protocol", "shared/protocol.mjs", "module"],
  ["shared-configuration", "shared/config.mjs", "module"],
  ["shared-manifest", "shared/manifest.mjs", "module"],
  ["l01-interchange", "shared/l01-interchange.mjs", "module"],
  ["markdown-variant", "variants/markdown/variant.json", "variant_manifest"],
  ["markdown-entrypoint", "variants/markdown/bin/casebook-persistence.mjs", "entrypoint"],
  ["markdown-workspace", "variants/markdown/lib/workspace.mjs", "module"],
  ["markdown-interchange", "variants/markdown/lib/interchange.mjs", "module"],
  ["sqlite-entrypoint", "variants/sqlite/bin/casebook-persistence.mjs", "entrypoint"],
  ["sqlite-diagnostics", "variants/sqlite/lib/substrate/diagnostics.mjs", "module"],
  ["sqlite-substrate", "variants/sqlite/lib/substrate/index.mjs", "module"],
  ["sqlite-identity-discovery", "variants/sqlite/lib/substrate/discovery.mjs", "module"],
  ["sqlite-observation", "variants/sqlite/lib/substrate/observation.mjs", "module"],
  ["sqlite-impact-projection", "variants/sqlite/lib/substrate/impact.mjs", "module"],
  ["sqlite-mechanical-envelope", "variants/sqlite/lib/substrate/mechanical.mjs", "module"],
  ["case-facade", "variants/sqlite/lib/case/index.mjs", "module"],
  ["frame-facade", "variants/sqlite/lib/frame/index.mjs", "module"],
  ["sqlite-common-subset", "variants/sqlite/lib/common/index.mjs", "module"],
  ["exceptional-operations", "variants/sqlite/lib/operations/index.mjs", "module"],
  ["sqlite-schema", "variants/sqlite/sql/schema-v1.sql", "sql"],
  ["sqlite-migration-v2", "variants/sqlite/migrations/0002-migration-snapshot-evidence.sql", "sql"],
  ["sqlite-migrations", "variants/sqlite/migrations/manifest.json", "migration_manifest"],
  ["sqlite-runtime", "variants/sqlite/manifests/runtime.json", "runtime_manifest"],
];

const manifestPath = path.join(packageRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.assets = await Promise.all(assetDefinitions.map(async ([id, relativePath, kind]) => ({
  id,
  path: relativePath,
  kind,
  sha256: sha256(await readFile(path.join(packageRoot, relativePath))),
})));
manifest.content_digest.sha256 = aggregateContentDigest(manifest.assets);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${manifest.assets.length} assets; content ${manifest.content_digest.sha256}\n`);
