import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  canonicalJson,
  INTERCHANGE_MANIFEST,
  L01_IDENTITY_RULE,
  L01_INTERCHANGE_FORMAT,
  L01_WORKSPACE_PROFILE,
  sha256,
  WORKSPACE_MARKER,
} from "../shared/l01-interchange.mjs";
import { SUPPORTED_OPERATIONS } from "../shared/protocol.mjs";
import { selectCompatibleSqliteBinary } from "./sandbox-harness.mjs";

const packageRoot = path.resolve(new URL("..", import.meta.url).pathname);
const sqliteEntrypoint = path.join(packageRoot, "variants/sqlite/bin/casebook-persistence.mjs");
const markdownEntrypoint = path.join(packageRoot, "variants/markdown/bin/casebook-persistence.mjs");
const protocol = { id: "casebook-persistence-json", version: 1 };
const frameId = "frame:12858d4b-f6d4-42e5-bef4-54ddf18bf5b1";
const discoveryId = "discovery:de1d5b10-2084-4ff1-b2b4-cdfe31073047";

function invoke(entrypoint, cwd, request) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [entrypoint], {
      cwd,
      env: { PATH: process.env.PATH ?? "", HOME: cwd },
      maxBuffer: 4 * 1024 * 1024,
    }, (error, stdout, stderr) => resolve({
      code: error ? 2 : 0,
      json: JSON.parse(stdout),
      stderr,
    }));
    child.stdin.end(JSON.stringify(request));
  });
}

function sqliteConfiguration(store, sqliteBin, locator) {
  return {
    source: { kind: "final-review-test", locator },
    authority_mode: "sqlite",
    sqlite: { database_url: store, sqlite_bin: sqliteBin },
  };
}

async function initialize(root, sqliteBin, label) {
  const configuration = sqliteConfiguration(path.join(root, `${label}.db`), sqliteBin, `workspace:${label}`);
  const response = await invoke(sqliteEntrypoint, root, {
    protocol,
    operation: "initialize_store",
    operation_id: `operation:final-review:${label}:init`,
    authority_claim: { human_authorized: true, acting_role: "test", authority_basis: "bounded final-review repair" },
    configuration,
  });
  assert.equal(response.code, 0, response.stderr || JSON.stringify(response.json));
  return { configuration, initialization: response.json.result.initialization };
}

function common(state, purpose = "final-review regression") {
  return {
    protocol,
    request_version: 1,
    store_id: state.initialization.store_id,
    context: {
      view_id: state.initialization.view.id,
      view_policy_revision_id: state.initialization.view.policy_revision_id,
      purpose,
      requested_audience_ceiling: "private",
    },
    configuration: state.configuration,
  };
}

async function exists(value) {
  return stat(value).then(() => true).catch(() => false);
}

function sqliteScalar(binary, store, sql) {
  return new Promise((resolve, reject) => execFile(binary, ["-batch", "-noheader", store, sql], { encoding: "utf8" },
    (error, stdout, stderr) => error ? reject(new Error(stderr)) : resolve(stdout.trim())));
}

test("SQLite binds canonical source, mode, and store identity and rejects configuration substitution", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-final-authority-"));
  try {
    const sqliteBin = await selectCompatibleSqliteBinary();
    const first = await initialize(root, sqliteBin, "first");
    const second = await initialize(root, sqliteBin, "second");

    const valid = await invoke(sqliteEntrypoint, root, {
      ...common(first), operation: "common.list", owner_kinds: ["case", "frame"],
    });
    assert.equal(valid.code, 0, valid.stderr || JSON.stringify(valid.json));

    const locatorSubstitution = structuredClone(first.configuration);
    locatorSubstitution.source.locator = "workspace:substituted";
    const changedLocator = await invoke(sqliteEntrypoint, root, {
      ...common(first), configuration: locatorSubstitution, operation: "common.list", owner_kinds: ["case", "frame"],
    });
    assert.equal(changedLocator.code, 2);
    assert.equal(changedLocator.json.failure.code, "authority_binding_mismatch");
    const diagnosticSubstitution = await invoke(sqliteEntrypoint, root, {
      protocol, operation: "diagnose", probe_directory: root, configuration: locatorSubstitution,
    });
    assert.equal(diagnosticSubstitution.code, 2);
    assert.equal(diagnosticSubstitution.json.failure.code, "authority_binding_mismatch");

    const changedStore = await invoke(sqliteEntrypoint, root, {
      ...common(first), configuration: second.configuration, operation: "common.list", owner_kinds: ["case", "frame"],
    });
    assert.equal(changedStore.code, 2);
    assert.equal(changedStore.json.failure.code, "authority_binding_mismatch");

    const dual = structuredClone(first.configuration);
    dual.markdown = { workspace_root: path.join(root, "markdown") };
    const dualConfigured = await invoke(sqliteEntrypoint, root, {
      ...common(first), configuration: dual, operation: "common.list", owner_kinds: ["case", "frame"],
    });
    assert.equal(dualConfigured.code, 2);
    assert.equal(dualConfigured.json.failure.code, "dual_authority_rejected");
    assert.equal(await exists(path.join(root, "markdown")), false);

    const unbound = await initialize(root, sqliteBin, "unbound");
    await sqliteScalar(sqliteBin, unbound.configuration.sqlite.database_url,
      "DROP TRIGGER store_authority_binding_immutable_delete; DELETE FROM store_authority_binding;");
    const ordinaryUnbound = await invoke(sqliteEntrypoint, root, {
      ...common(unbound), operation: "common.list", owner_kinds: ["case", "frame"],
    });
    assert.equal(ordinaryUnbound.code, 2);
    assert.equal(await sqliteScalar(sqliteBin, unbound.configuration.sqlite.database_url, "SELECT count(*) FROM store_authority_binding;"), "0");
    const rebound = await invoke(sqliteEntrypoint, root, {
      protocol,
      operation: "get_store_operation_receipt",
      operation_id: "operation:final-review:unbound:init",
      store_id: unbound.initialization.store_id,
      context: { ...common(unbound).context, purpose: "explicitly authorize first compatible binding" },
      authority_claim: { human_authorized: true, acting_role: "operator", authority_basis: "first authorized binding" },
      configuration: unbound.configuration,
    });
    assert.equal(rebound.code, 0, rebound.stderr || JSON.stringify(rebound.json));
    assert.equal(rebound.json.result.status, "settled");
    assert.equal(await sqliteScalar(sqliteBin, unbound.configuration.sqlite.database_url,
      "SELECT source_locator||'|'||authority_mode||'|'||store_id FROM store_authority_binding;"),
    `workspace:unbound|sqlite|${unbound.initialization.store_id}`);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("SQLite Frame create requires explicit disposition arrays while explicit empty arrays are canonical", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-final-frame-"));
  try {
    const sqliteBin = await selectCompatibleSqliteBinary();
    const state = await initialize(root, sqliteBin, "frame");
    const frame = {
      id: frameId,
      home_namespace_id: state.initialization.namespace.id,
      authority_scope_namespace_ids: [state.initialization.namespace.id],
      status: "active",
      title: "Explicit disposition parity",
      discovery: [{
        id: discoveryId,
        display_order: 0,
        lifecycle: "active",
        category: "frontier",
        title: "Verify omission semantics",
        body: "Empty is explicit; omitted is legacy-only.",
        human_authority: "not_required",
        dependencies: [],
      }],
    };
    const create = (operationId, value) => invoke(sqliteEntrypoint, root, {
      ...common(state), operation: "frame.create", operation_id: operationId, expected_revision: 0,
      commit_basis: "final-review parity", provenance: { acting_role: "test", authority_basis: "accepted defect" }, frame: value,
    });

    const omitted = await create("operation:final-review:frame:omitted", frame);
    assert.equal(omitted.code, 2);
    assert.equal(omitted.json.failure.code, "frame.invalid_representation");
    assert.equal(omitted.json.failure.evidence.violations[0].rule, "complete_disposition_sets_required");

    const explicit = await create("operation:final-review:frame:explicit", {
      ...frame, disposition_boundaries: [], case_dispositions: [],
    });
    assert.equal(explicit.code, 0, explicit.stderr || JSON.stringify(explicit.json));
    assert.deepEqual(explicit.json.result.frame.disposition_boundaries, []);
    assert.deepEqual(explicit.json.result.frame.case_dispositions, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Markdown diagnose verifies the selected authority workspace without mutation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-final-markdown-diagnose-"));
  try {
    const workspace = path.join(root, "workspace");
    await mkdir(workspace);
    const manifest = canonicalJson({ manifest_version: 1, format: L01_INTERCHANGE_FORMAT, identity_rule: L01_IDENTITY_RULE, records: [] });
    const ids = {
      store: "store:8492e9cb-34e5-4bcb-9ea3-71618863409d",
      view: "view:5779fd50-4a82-4e6a-92ee-19a9348ce0aa",
      policy: "view-policy:15d15ee2-313b-452d-9fb0-9795cbc69c72",
    };
    const marker = canonicalJson({
      configuration_version: 1,
      authority_mode: "markdown",
      profile: L01_WORKSPACE_PROFILE,
      workspace_id: ids.store,
      view: { id: ids.view, policy_revision_id: ids.policy, audience_ceiling: "private" },
      interchange_manifest_sha256: sha256(manifest),
    });
    await writeFile(path.join(workspace, INTERCHANGE_MANIFEST), manifest);
    await writeFile(path.join(workspace, WORKSPACE_MARKER), marker);
    const response = await invoke(markdownEntrypoint, root, {
      protocol,
      operation: "diagnose",
      request_version: 1,
      store_id: ids.store,
      context: { view_id: ids.view, view_policy_revision_id: ids.policy, purpose: "diagnose selected authority", requested_audience_ceiling: "private" },
      configuration: { source: { kind: "final-review-test", locator: "workspace:markdown" }, authority_mode: "markdown", markdown: { workspace_root: workspace } },
    });
    assert.equal(response.code, 0, response.stderr || JSON.stringify(response.json));
    assert.equal(response.json.result.status, "passed");
    assert.equal(response.json.result.selected_variant, "markdown");
    assert.equal(response.json.result.workspace.workspace_id, ids.store);
    assert.equal(response.json.result.workspace.authority_mode, "markdown");
    assert.equal(response.json.result.workspace.profile, L01_WORKSPACE_PROFILE);
    assert.equal(await readFile(path.join(workspace, INTERCHANGE_MANIFEST), "utf8"), manifest);
    assert.equal(await readFile(path.join(workspace, WORKSPACE_MARKER), "utf8"), marker);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("package/runtime versions and advertised per-entrypoint operations remain consistent", async () => {
  const manifest = JSON.parse(await readFile(path.join(packageRoot, "manifest.json"), "utf8"));
  const runtime = JSON.parse(await readFile(path.join(packageRoot, "variants/sqlite/manifests/runtime.json"), "utf8"));
  const markdown = JSON.parse(await readFile(path.join(packageRoot, "variants/markdown/variant.json"), "utf8"));
  assert.equal(manifest.package.version, runtime.package.version);
  assert.equal(markdown.supported_operations.includes("diagnose"), true);
  const union = [...new Set([...runtime.supported_operations, ...markdown.supported_operations])].sort();
  assert.deepEqual([...manifest.supported_operations].sort(), union);
  assert.deepEqual([...SUPPORTED_OPERATIONS].sort(), union);
  assert.equal(runtime.supported_operations.includes("interchange.parse"), false);
  assert.equal(markdown.supported_operations.includes("initialize_store"), false);
  const install = await readFile(path.join(packageRoot, "INSTALL.md"), "utf8");
  const skill = await readFile(path.join(packageRoot, "SKILL.md"), "utf8");
  for (const stale of ["Later event, checkpoint, and snapshot query surfaces remain unavailable", "purge execution, publication/file mutation", "L01-W05 only implements"]) {
    assert.equal(install.includes(stale) || skill.includes(stale), false, stale);
  }
});
