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
import { cleanupSandbox, generateAndValidateSandbox } from "./sandbox-harness.mjs";

const protocol = { id: "casebook-persistence-json", version: 1 };
const ids = {
  store: "store:05800006-f3e3-46d3-9902-f1b6307fb835",
  view: "view:a04102fc-e74d-48cb-b1fe-f2c64b7f7068",
  policy: "view-policy:096bee50-ca68-4b50-a367-da7ec316015a",
};
const sourceEntrypoint = new URL("../variants/markdown/bin/casebook-persistence.mjs", import.meta.url).pathname;

function invoke(entrypoint, cwd, request) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [entrypoint], {
      cwd,
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", HOME: cwd },
    }, (error, stdout, stderr) => resolve({
      exitCode: error ? 2 : 0,
      json: JSON.parse(stdout),
      stderr,
    }));
    child.stdin.end(JSON.stringify(request));
  });
}

function emptyManifest() {
  return {
    manifest_version: 1,
    format: L01_INTERCHANGE_FORMAT,
    identity_rule: L01_IDENTITY_RULE,
    records: [],
  };
}

function marker(manifestBytes, overrides = {}) {
  return {
    configuration_version: 1,
    authority_mode: "markdown",
    profile: L01_WORKSPACE_PROFILE,
    workspace_id: ids.store,
    view: {
      id: ids.view,
      policy_revision_id: ids.policy,
      audience_ceiling: "private",
    },
    interchange_manifest_sha256: sha256(manifestBytes),
    ...overrides,
  };
}

async function createWorkspace(root, markerOverrides = {}) {
  await mkdir(root, { recursive: true });
  const manifestBytes = canonicalJson(emptyManifest());
  const authorityMarker = marker(manifestBytes, markerOverrides);
  await writeFile(path.join(root, INTERCHANGE_MANIFEST), manifestBytes);
  await writeFile(path.join(root, WORKSPACE_MARKER), canonicalJson(authorityMarker));
  return { authorityMarker, manifestBytes };
}

function configuration(root, overrides = {}) {
  return {
    source: { kind: "synthetic-test", locator: "l05-w01-exclusive-authority" },
    authority_mode: "markdown",
    markdown: { workspace_root: root },
    ...overrides,
  };
}

function request(root, authorityMarker, configurationOverrides = {}) {
  return {
    protocol,
    operation: "common.list",
    request_version: 1,
    store_id: ids.store,
    context: {
      view_id: ids.view,
      view_policy_revision_id: ids.policy,
      purpose: "verify exclusive Markdown installation",
      requested_audience_ceiling: "private",
    },
    configuration: configuration(root, configurationOverrides),
    owner_kinds: ["case", "frame"],
  };
}

async function removeAndVerify(root) {
  await rm(root, { recursive: true, force: true });
  assert.equal(await stat(root).then(() => true).catch(() => false), false);
}

test("exclusive Markdown installation rejects missing, ambiguous, dual, fallback, and hot-switch configuration without mutation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l05-w01-exclusive-"));
  try {
    const workspaceRoot = path.join(root, "workspace");
    const { authorityMarker, manifestBytes } = await createWorkspace(workspaceRoot);
    const markerPath = path.join(workspaceRoot, WORKSPACE_MARKER);
    const manifestPath = path.join(workspaceRoot, INTERCHANGE_MANIFEST);

    const valid = await invoke(sourceEntrypoint, root, request(workspaceRoot, authorityMarker));
    assert.equal(valid.exitCode, 0, valid.stderr);
    assert.equal(valid.json.result.items.length, 0);

    const invalidConfigurations = [
      {
        name: "missing authority",
        configuration: {
          source: { kind: "synthetic-test", locator: "missing" },
          markdown: { workspace_root: workspaceRoot },
        },
        code: "authority_mode_invalid",
      },
      {
        name: "ambiguous authority",
        configuration: configuration(workspaceRoot, { authority_mode: ["markdown", "sqlite"] }),
        code: "authority_mode_invalid",
      },
      {
        name: "dual authority",
        configuration: configuration(workspaceRoot, { sqlite: { database_url: path.join(root, "forbidden.sqlite3") } }),
        code: "dual_authority_rejected",
      },
      {
        name: "fallback authority",
        configuration: configuration(workspaceRoot, { fallback_authority_mode: "sqlite" }),
        code: "configuration_field_unsupported",
      },
      {
        name: "nested fallback locator",
        configuration: configuration(workspaceRoot, {
          markdown: { workspace_root: workspaceRoot, sqlite_fallback: path.join(root, "forbidden.sqlite3") },
        }),
        code: "configuration_field_unsupported",
      },
      {
        name: "ordinary configuration hot switch",
        configuration: {
          source: { kind: "synthetic-test", locator: "hot-switch" },
          authority_mode: "sqlite",
          sqlite: { database_url: path.join(root, "forbidden.sqlite3") },
        },
        code: "markdown_authority_required",
      },
    ];

    for (const scenario of invalidConfigurations) {
      const rejected = await invoke(sourceEntrypoint, root, {
        ...request(workspaceRoot, authorityMarker),
        configuration: scenario.configuration,
      });
      assert.equal(rejected.exitCode, 2, scenario.name);
      assert.equal(rejected.json.failure.code, scenario.code, scenario.name);
    }

    assert.equal(await stat(path.join(root, "forbidden.sqlite3")).then(() => true).catch(() => false), false);
    assert.equal(await readFile(manifestPath, "utf8"), manifestBytes);
    assert.equal(await readFile(markerPath, "utf8"), canonicalJson(authorityMarker));

    await writeFile(markerPath, canonicalJson({ ...authorityMarker, authority_mode: "sqlite" }));
    const switchedMarker = await invoke(sourceEntrypoint, root, request(workspaceRoot, authorityMarker));
    assert.equal(switchedMarker.exitCode, 2);
    assert.equal(switchedMarker.json.failure.code, "authority_switch_requires_migration");
    assert.equal(await readFile(markerPath, "utf8"), canonicalJson({ ...authorityMarker, authority_mode: "sqlite" }));
  } finally {
    await removeAndVerify(root);
  }
});

test("missing or ambiguous installation markers fail closed without content or SQLite fallback", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l05-w01-marker-"));
  try {
    const missingRoot = path.join(root, "missing-marker");
    await mkdir(missingRoot);
    const manifestBytes = canonicalJson(emptyManifest());
    await writeFile(path.join(missingRoot, INTERCHANGE_MANIFEST), manifestBytes);
    const missing = await invoke(sourceEntrypoint, root, request(missingRoot, marker(manifestBytes)));
    assert.equal(missing.exitCode, 2);
    assert.equal(missing.json.failure.code, "markdown.workspace_unavailable");

    const ambiguousRoot = path.join(root, "ambiguous-marker");
    const { authorityMarker } = await createWorkspace(ambiguousRoot, { authority_mode: ["markdown", "sqlite"] });
    const ambiguous = await invoke(sourceEntrypoint, root, request(ambiguousRoot, authorityMarker));
    assert.equal(ambiguous.exitCode, 2);
    assert.equal(ambiguous.json.failure.code, "authority_state_ambiguous");

    assert.equal(await stat(path.join(root, "casebook.sqlite3")).then(() => true).catch(() => false), false);
  } finally {
    await removeAndVerify(root);
  }
});

test("generated Pi, Codex, and OpenCode copies enforce the same exclusive Markdown installation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l05-w01-generated-"));
  try {
    const generated = await generateAndValidateSandbox({ sandboxRoot: root });
    for (const target of generated.results) {
      const workspaceRoot = path.join(root, `markdown-${target.target}`);
      const { authorityMarker } = await createWorkspace(workspaceRoot);
      const entrypoint = path.join(target.package_root, "variants/markdown/bin/casebook-persistence.mjs");
      const valid = await invoke(entrypoint, path.join(root, "unrelated-cwd"), request(workspaceRoot, authorityMarker));
      assert.equal(valid.exitCode, 0, `${target.target}: ${valid.stderr}`);

      const fallback = await invoke(entrypoint, path.join(root, "unrelated-cwd"), {
        ...request(workspaceRoot, authorityMarker),
        configuration: configuration(workspaceRoot, { fallback_authority_mode: "sqlite" }),
      });
      assert.equal(fallback.exitCode, 2, target.target);
      assert.equal(fallback.json.failure.code, "configuration_field_unsupported", target.target);
    }
  } finally {
    assert.equal(await cleanupSandbox(root), true);
  }
  assert.equal(await stat(root).then(() => true).catch(() => false), false);
});
