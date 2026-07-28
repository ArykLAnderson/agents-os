import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PACKAGE_ID, PROTOCOL_ID, PROTOCOL_VERSION, RESULT_ID, RESULT_VERSION, SCHEMA_ID, SCHEMA_VERSION, SELECTION_ID, SELECTION_VERSION, SUPPORTED_OPERATIONS, ORDINARY_CLI_OPERATIONS } from "./protocol.mjs";

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
  if (manifest.protocol?.id !== PROTOCOL_ID || manifest.protocol?.version !== PROTOCOL_VERSION || manifest.protocol?.compatible_versions?.join(",") !== String(PROTOCOL_VERSION)) problems.push("protocol");
  if (manifest.schema?.id !== SCHEMA_ID || manifest.schema?.version !== SCHEMA_VERSION || manifest.schema?.compatible_versions?.join(",") !== String(SCHEMA_VERSION)) problems.push("schema");
  if (manifest.result?.id !== RESULT_ID || manifest.result?.version !== RESULT_VERSION) problems.push("result");
  if (manifest.selection?.id !== SELECTION_ID || manifest.selection?.version !== SELECTION_VERSION || manifest.selection?.authority !== "per-invocation resolved target admission only") problems.push("selection");
  const expectedCapabilities = [`${SCHEMA_ID}@${SCHEMA_VERSION}`, `${SELECTION_ID}@${SELECTION_VERSION}`, `${PROTOCOL_ID}@${PROTOCOL_VERSION}`, `${RESULT_ID}@${RESULT_VERSION}`];
  if (JSON.stringify(manifest.ordinary_cli_capabilities) !== JSON.stringify(expectedCapabilities)
    || JSON.stringify(Object.keys(manifest.ordinary_cli_capability_contracts ?? {})) !== JSON.stringify(expectedCapabilities)
    || manifest.ordinary_cli_capability_contracts?.[`${SCHEMA_ID}@${SCHEMA_VERSION}`]?.authority !== "selected SQLite authority only"
    || manifest.ordinary_cli_capability_contracts?.[`${SELECTION_ID}@${SELECTION_VERSION}`]?.authority !== "per-invocation resolved target admission only"
    || manifest.ordinary_cli_capability_contracts?.[`${PROTOCOL_ID}@${PROTOCOL_VERSION}`]?.authority !== "verified connector transport only"
    || manifest.ordinary_cli_capability_contracts?.[`${RESULT_ID}@${RESULT_VERSION}`]?.authority !== "closed terminal result only") problems.push("ordinary_cli_capabilities");
  if (JSON.stringify(manifest.supported_operations) !== JSON.stringify(SUPPORTED_OPERATIONS)) problems.push("supported_operations");
  if (JSON.stringify(manifest.ordinary_cli_operations) !== JSON.stringify(ORDINARY_CLI_OPERATIONS)) problems.push("ordinary_cli_operations");

  const expectedOperationContracts = new Map([
    ["profile.create", ["human_operational", "profile.manage", "profile"]],
    ["profile.revise", ["human_operational", "profile.manage", "profile"]],
    ["profile.activate", ["human_operational", "profile.manage", "profile-selection"]],
    ["profile.retire", ["human_operational", "profile.manage", "profile,profile-selection"]],
    ["profile.read", ["ordinary_cli", "profile.read", "profile"]],
    ["profile.history", ["ordinary_cli", "profile.read", "profile"]],
    ["namespace.create", ["human_operational", "context.manage", "namespace"]], ["namespace.revise", ["human_operational", "context.manage", "namespace"]], ["namespace.retire", ["human_operational", "context.manage", "namespace"]], ["namespace.read", ["ordinary_cli", "context.read", "namespace"]], ["namespace.history", ["ordinary_cli", "context.read", "namespace"]], ["namespace.resolve", ["internal", "context.read", "namespace"]],
    ["project_default.create", ["human_operational", "context.manage", "project-default"]], ["project_default.revise", ["human_operational", "context.manage", "project-default"]], ["project_default.retire", ["human_operational", "context.manage", "project-default"]], ["project_default.read", ["ordinary_cli", "context.read", "project-default"]],
    ["chat.establish", ["host_context", "context.manage", "chat"]], ["chat.resume", ["host_context", "context.read", "chat"]], ["chat.fork", ["host_context", "context.manage", "chat"]], ["chat.rebind", ["host_context", "context.manage", "chat"]], ["chat.read", ["ordinary_cli", "context.read", "chat"]], ["chat.history", ["ordinary_cli", "context.read", "chat"]],
    ["substrate.commit_revision", ["internal", "substrate.commit_revision", ""]],
    ["substrate.get_receipt", ["internal", "receipt.read", ""]],
    ["substrate.read_owner_current", ["internal", "substrate.read", ""]],
    ["substrate.read_owner_revision", ["internal", "substrate.read", ""]],
    ["substrate.resolve_family_binding", ["internal", "substrate.read", ""]],
    ["substrate.resolve_current_claim", ["internal", "substrate.read", ""]],
    ["integrity.observe", ["internal", "integrity.observe", ""]],
    ["projection.rebuild", ["internal", "projection.rebuild", ""]],
    ["case.create", ["human_operational", "case.manage", "case"]],
    ["case.commit_revision", ["human_operational", "case.manage", "case"]],
    ["case.tombstone.commit", ["human_operational", "case.manage", "case"]],
    ["case.read", ["ordinary_cli", "case.read", "case"]],
    ["case.resolve", ["ordinary_cli", "case.read", "case"]],
    ["case.update", ["human_operational", "case.manage", "case"]],
    ["case.tombstone", ["human_operational", "case.manage", "case"]],
    ...["knowledge", "facet", "source", "evidence", "relationship"].flatMap((kind) => [
      ["read", ["ordinary_cli", "case.read", "case"]],
      ["create", ["human_operational", "case.manage", "case"]],
      ["update", ["human_operational", "case.manage", "case"]],
      ["tombstone", ["human_operational", "case.manage", "case"]],
    ].map(([action, contract]) => [`case.${kind}.${action}`, contract])),
    ...["frame.create", "frame.commit_revision", "frame.read", "frame.profile.read", "frame.profile.update", "frame.discovery.create", "frame.discovery.read", "frame.discovery.update", "frame.discovery.settle", "frame.discovery.tombstone", "frame.discovery.reopen", "frame.disposition_boundary.read", "frame.disposition_boundary.create", "frame.disposition_boundary.update", "frame.disposition_boundary.close", "frame.case_disposition.read", "frame.case_disposition.create", "frame.case_disposition.update", "frame.case_disposition.classify", "frame.case_disposition.settle"].map((operation) => [operation, [operation.endsWith(".read") || operation === "frame.read" ? "ordinary_cli" : "human_operational", operation.endsWith(".read") || operation === "frame.read" ? "frame.read" : "frame.manage", "frame"]]),
    ["query.search", ["ordinary_cli", "query.search", ""]],
    ["query.resolve", ["ordinary_cli", "query.search", ""]],
    ["query.hydrate", ["ordinary_cli", "query.search", ""]],
  ]);
  const operationContracts = manifest.operation_contracts;
  const rows = operationContracts?.operations;
  if (operationContracts?.manifest !== "closed-provider-derived-operation-contract@1"
    || operationContracts?.profile_fence !== "profile-selection-fence@1"
    || !Array.isArray(operationContracts?.optional_guards)
    || operationContracts.optional_guards.join(",") !== "owner-policy-fence@1"
    || !Array.isArray(rows)) problems.push("operation_contracts");
  else {
    const seen = new Set();
    for (const row of rows) {
      const expected = expectedOperationContracts.get(row?.operation);
      const guards = row?.operation === "substrate.commit_revision" ? "owner-policy-fence@1" : "";
      if (!expected || seen.has(row.operation) || row.capability_class !== expected[0]
        || row.profile_purpose !== expected[1] || row.required_owner_kinds?.join(",") !== expected[2]
        || row.optional_guards?.join(",") !== guards) problems.push(`operation_contract:${row?.operation ?? "unknown"}`);
      seen.add(row?.operation);
    }
    for (const operation of expectedOperationContracts.keys()) if (!seen.has(operation)) problems.push(`operation_contract_missing:${operation}`);
  }

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
