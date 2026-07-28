import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateContentDigest, sha256 } from "../shared/manifest.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetDefinitions = [
  ["shared-protocol", "shared/protocol.mjs", "module"],
  ["shared-configuration", "shared/config.mjs", "module"],
  ["shared-manifest", "shared/manifest.mjs", "module"],
  ["sqlite-entrypoint", "variants/sqlite/bin/casebook-persistence.mjs", "entrypoint"],
  ["sqlite-diagnostics", "variants/sqlite/lib/substrate/diagnostics.mjs", "module"],
  ["sqlite-embedded-engine", "variants/sqlite/lib/substrate/embedded-sqlite.mjs", "module"],
  ["sqlite-bootstrap", "variants/sqlite/lib/substrate/bootstrap.mjs", "module"],
  ["sqlite-cli-admission", "variants/sqlite/lib/cli/index.mjs", "module"],
  ["sqlite-profile-service", "variants/sqlite/lib/profile/index.mjs", "module"],
  ["sqlite-context-service", "variants/sqlite/lib/context/index.mjs", "module"],
  ["sqlite-case-successor-adapter", "variants/sqlite/lib/case/successor.mjs", "module"],
  ["sqlite-frame-successor-adapter", "variants/sqlite/lib/frame/successor.mjs", "module"],
  ["sqlite-placement-generation", "variants/sqlite/lib/placement/index.mjs", "module"],
  ["sqlite-organizational-query", "variants/sqlite/lib/query/search.mjs", "module"],
  ["sqlite-graph-query", "variants/sqlite/lib/query/graph.mjs", "module"],
  ["sqlite-snapshot-reconcile", "variants/sqlite/lib/query/snapshot-reconcile.mjs", "module"],
  ["sqlite-query-cursor", "variants/sqlite/lib/query/cursor.mjs", "module"],
  ["sqlite-query-handoff", "variants/sqlite/lib/query/handoff.mjs", "module"],
  ["sqlite-admission-guards", "variants/sqlite/lib/resource/admission-guards.mjs", "module"],
  ["sqlite-frame-resource-complete", "variants/sqlite/lib/frame/resources/complete.mjs", "module"],
  ["sqlite-exact-normalization", "variants/sqlite/lib/resource/normalization.mjs", "module"],
  ["sqlite-owner-neutral-substrate", "variants/sqlite/lib/substrate/mechanical-successor.mjs", "module"],
  ["sqlite-successor-schema", "variants/sqlite/sql/schema-successor.sql", "sql"],
  ["sqlite-runtime", "variants/sqlite/manifests/runtime.json", "runtime_manifest"],
  ["sqlite-wasm-node-module", "variants/sqlite/vendor/sqlite-wasm-3.53.0-build1/dist/node.mjs", "vendored_runtime"],
  ["sqlite-wasm-binary", "variants/sqlite/vendor/sqlite-wasm-3.53.0-build1/dist/sqlite3.wasm", "vendored_runtime"],
  ["sqlite-wasm-license-notice", "variants/sqlite/vendor/sqlite-wasm-3.53.0-build1/LICENSE-NOTICE.txt", "license_notice"],
];
const manifestPath = path.join(packageRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
manifest.assets = await Promise.all(assetDefinitions.map(async ([id, relativePath, kind]) => ({ id, path: relativePath, kind, sha256: sha256(await readFile(path.join(packageRoot, relativePath))) })));
manifest.content_digest.sha256 = aggregateContentDigest(manifest.assets);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${manifest.assets.length} assets; content ${manifest.content_digest.sha256}\n`);
