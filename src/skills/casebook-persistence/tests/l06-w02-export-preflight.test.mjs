import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mechanicalDigest } from "../variants/sqlite/lib/substrate/mechanical.mjs";
import { selectCompatibleSqliteBinary } from "./sandbox-harness.mjs";

const entrypoint = new URL("../variants/sqlite/bin/casebook-persistence.mjs", import.meta.url).pathname;
const protocol = { id: "casebook-persistence-json", version: 1 };
const ids = Object.freeze({
  target: "case:80b991a6-7c7c-4f86-8283-d0051b10eacf",
  partial: "case:d6d3435c-6e73-416f-93c5-4b2dd1e3eb75",
  facet: "facet:13c3cb6b-5256-46b0-b81b-91a6b216ecf2",
  frame: "frame:f8c710be-d380-45e7-b0f1-e21995f5779c",
  unknownFrame: "frame:a5a39d01-9aa5-45e4-97b4-c767e85ed04b",
  discovery: "discovery:faf528bc-61a5-4ca3-8997-adef9be896f9",
  unknownDiscovery: "discovery:87af6cb0-adca-4577-838f-5c111e9b510f",
});

function invoke(cwd, request, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [entrypoint], {
      cwd,
      env: { PATH: process.env.PATH ?? "", HOME: cwd, ...extraEnv },
      maxBuffer: 4 * 1024 * 1024,
    }, (error, stdout, stderr) => resolve({ code: error ? 2 : 0, json: JSON.parse(stdout), stderr }));
    child.stdin.end(JSON.stringify(request));
  });
}

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l06-w02-"));
  const sqliteBin = await selectCompatibleSqliteBinary();
  const configuration = {
    source: { kind: "test", locator: "l06-w02" },
    authority_mode: "sqlite",
    sqlite: { database_url: path.join(root, "store.db"), sqlite_bin: sqliteBin },
  };
  const initialized = await invoke(root, {
    protocol,
    operation: "initialize_store",
    operation_id: "operation:l06-w02:init",
    authority_claim: { human_authorized: true, acting_role: "test", authority_basis: "disposable export preflight" },
    configuration,
  });
  assert.equal(initialized.code, 0, initialized.stderr);
  const initialization = initialized.json.result.initialization;
  return {
    root,
    sqliteBin,
    configuration,
    initialization,
    common: {
      protocol,
      request_version: 1,
      store_id: initialization.store_id,
      context: {
        view_id: initialization.view.id,
        view_policy_revision_id: initialization.view.policy_revision_id,
        purpose: "deterministic private export preflight",
        requested_audience_ceiling: "private",
      },
      configuration,
    },
  };
}

function caseRecord(state, id, { title = "Export target", partial = false } = {}) {
  return {
    id,
    home_namespace_id: state.initialization.namespace.id,
    state: "active",
    title,
    summary: "Synthetic export owner",
    scope: "L06-W02",
    aliases: [],
    facets: partial ? [{
      id: ids.facet,
      state: "active",
      version: { key: "private-note", value: "not for portable output", visibility: "private" },
    }] : [],
    entries: [],
    sources: [],
    relationships: [],
    references: [],
  };
}

function frameRecord(state, id, discoveryId, observedRevision, status = "active") {
  const dependency = {
    target_kind: "case",
    target_id: ids.target,
    predicate: "depends-on",
    provenance: "synthetic export dependency",
    ...(observedRevision == null ? {} : { observed_revision_id: observedRevision }),
  };
  return {
    id,
    home_namespace_id: state.initialization.namespace.id,
    authority_scope_namespace_ids: [state.initialization.namespace.id],
    status,
    title: "Dependency-bearing Frame",
    outcome: "Preflight classifies dependency drift.",
    discovery: [{
      id: discoveryId,
      display_order: 0,
      lifecycle: "active",
      category: "frontier",
      title: "Export dependency",
      body: "Dependency freshness remains mechanical.",
      human_authority: "not_required",
      dependencies: [dependency],
    }],
    disposition_boundaries: [],
    case_dispositions: [],
  };
}

async function create(state, operation, operationId, ownerField, value) {
  const result = await invoke(state.root, {
    ...state.common,
    operation,
    operation_id: operationId,
    expected_revision: 0,
    commit_basis: "L06-W02 fixture",
    provenance: { acting_role: ownerField, authority_basis: "synthetic" },
    [ownerField]: value,
  });
  assert.equal(result.code, 0, result.stderr || JSON.stringify(result.json));
  return result.json.result.revision;
}

async function reviseCase(state, id, revision, value) {
  const result = await invoke(state.root, {
    ...state.common,
    operation: "case.commit_revision",
    operation_id: `operation:l06-w02:${id}:revise`,
    expected_revision: revision.number,
    commit_basis: "advance dependency",
    provenance: { acting_role: "case", authority_basis: "synthetic" },
    case: value,
  });
  assert.equal(result.code, 0, result.stderr || JSON.stringify(result.json));
  return result.json.result.revision;
}

function destination(state, name, classification = "private_inspection") {
  return {
    classification,
    temporary_path: path.join(state.root, `${name}.preflight`),
    final_path: path.join(state.root, `${name}.final`),
  };
}

function preflight(state, options = {}, extraEnv = {}) {
  return invoke(state.root, {
    ...state.common,
    operation: "export.preflight",
    operation_id: options.operationId ?? "operation:l06-w02:preflight",
    authority_claim: { human_authorized: true, acting_role: "architect", authority_basis: "disposable logical export" },
    mode: options.mode ?? "current",
    audience: options.audience ?? "private",
    destination: options.destination,
    owners: options.owners,
  }, extraEnv);
}

async function exists(value) {
  return stat(value).then(() => true).catch(() => false);
}

async function canonicalCounts(state) {
  return new Promise((resolve, reject) => execFile(state.sqliteBin, ["-batch", "-noheader", state.configuration.sqlite.database_url,
    "SELECT (SELECT count(*) FROM owner_revisions)||'|'||(SELECT count(*) FROM owner_events)||'|'||(SELECT count(*) FROM store_operation_receipts);"],
  { encoding: "utf8" }, (error, stdout, stderr) => error ? reject(new Error(stderr)) : resolve(stdout.trim())));
}

test("current preflight aggregates required fragments deterministically at one fence and renders only a private temporary bundle", async () => {
  const state = await setup();
  try {
    const targetRevision = await create(state, "case.create", "operation:l06-w02:target:create", "case", caseRecord(state, ids.target));
    await create(state, "frame.create", "operation:l06-w02:frame:create", "frame", frameRecord(state, ids.frame, ids.discovery, targetRevision.id));
    const before = await canonicalCounts(state);
    const firstDestination = destination(state, "first");
    const first = await preflight(state, {
      destination: firstDestination,
      owners: [
        { kind: "frame", id: ids.frame, requirement: "required" },
        { kind: "case", id: ids.target, requirement: "required", evidence_selection: [] },
      ],
    });
    assert.equal(first.code, 0, first.stderr || JSON.stringify(first.json));
    const result = first.json.result;
    assert.equal(result.status, "ready", JSON.stringify(result));
    assert.equal(result.currentness, "current_at_observation_fence");
    assert.equal(Number.isInteger(result.observation_fence), true);
    assert.deepEqual(result.manifest.owners.map((item) => `${item.owner.kind}:${item.owner.id}`), [
      `case:${ids.target}`,
      `frame:${ids.frame}`,
    ]);
    assert.equal(result.manifest.owners.every((item) => item.status === "ready"), true);
    assert.equal(result.manifest.applied_policy.view_policy_revision_id, state.common.context.view_policy_revision_id);
    assert.equal(result.manifest.digest, mechanicalDigest(Object.fromEntries(Object.entries(result.manifest).filter(([key]) => key !== "digest"))));
    assert.equal(result.bundle.digest, result.manifest.bundle_digest);
    const { digest: _manifestDigest, bundle_digest: _bundleDigest, ...bundleManifestCore } = result.manifest;
    assert.equal(result.bundle.digest, mechanicalDigest({ manifest: bundleManifestCore, files: result.bundle.files }));
    assert.deepEqual(JSON.parse(await readFile(path.join(firstDestination.temporary_path, result.bundle.manifest_path), "utf8")), result.manifest);
    assert.equal(await exists(firstDestination.final_path), false);
    assert.equal((await stat(firstDestination.temporary_path)).mode & 0o777, 0o700);
    for (const file of result.bundle.files) {
      assert.equal((await stat(path.join(firstDestination.temporary_path, file.path))).mode & 0o777, 0o600);
      assert.equal((await readFile(path.join(firstDestination.temporary_path, file.path))).length > 0, true);
    }
    assert.equal(await canonicalCounts(state), before);

    const stableManifest = structuredClone(result.manifest);
    const stableDigest = result.bundle.digest;
    await rm(firstDestination.temporary_path, { recursive: true, force: true });
    const secondDestination = destination(state, "second");
    const second = await preflight(state, {
      operationId: "operation:l06-w02:preflight:repeat",
      destination: secondDestination,
      owners: [
        { kind: "case", id: ids.target, requirement: "required", evidence_selection: [] },
        { kind: "frame", id: ids.frame, requirement: "required" },
      ],
    });
    assert.equal(second.code, 0, second.stderr || JSON.stringify(second.json));
    assert.deepEqual(second.json.result.manifest, stableManifest);
    assert.equal(second.json.result.bundle.digest, stableDigest);
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("current mode blocks materially stale and unknown live dependencies while explicit historical mode records drift informationally", async () => {
  const state = await setup();
  try {
    const targetRecord = caseRecord(state, ids.target);
    const targetRevision = await create(state, "case.create", "operation:l06-w02:target:create", "case", targetRecord);
    const frameRevision = await create(state, "frame.create", "operation:l06-w02:frame:create", "frame", frameRecord(state, ids.frame, ids.discovery, targetRevision.id));
    await create(state, "frame.create", "operation:l06-w02:unknown:create", "frame", frameRecord(state, ids.unknownFrame, ids.unknownDiscovery, null));
    targetRecord.summary = "A later current dependency revision";
    await reviseCase(state, ids.target, targetRevision, targetRecord);

    for (const [ownerId, expectedState] of [[ids.frame, "materially_stale"], [ids.unknownFrame, "unknown"]]) {
      const selectedDestination = destination(state, `blocked-${expectedState}`);
      const blocked = await preflight(state, {
        operationId: `operation:l06-w02:blocked:${expectedState}`,
        destination: selectedDestination,
        owners: [{ kind: "frame", id: ownerId, requirement: "required" }],
      });
      assert.equal(blocked.code, 0, blocked.stderr || JSON.stringify(blocked.json));
      assert.equal(blocked.json.result.status, "blocked");
      assert.equal(blocked.json.result.manifest.dependencies[0].state, expectedState);
      assert.equal(blocked.json.result.manifest.blockers.some((item) => item.code === `${expectedState}_live_dependency`), true);
      assert.equal(blocked.json.result.final_output.created, false);
      assert.equal(await exists(selectedDestination.final_path), false);
      assert.equal(await exists(selectedDestination.temporary_path), false);
    }

    const historicalDestination = destination(state, "historical");
    const historical = await preflight(state, {
      operationId: "operation:l06-w02:historical",
      mode: "historical",
      destination: historicalDestination,
      owners: [{ kind: "frame", id: ids.frame, requirement: "required", revision_id: frameRevision.id }],
    });
    assert.equal(historical.code, 0, historical.stderr || JSON.stringify(historical.json));
    assert.equal(historical.json.result.status, "ready");
    assert.equal(historical.json.result.currentness, "non_current_historical");
    assert.equal(historical.json.result.manifest.dependencies[0].state, "historical");
    assert.equal(historical.json.result.manifest.dependencies[0].blocking, false);
    assert.equal(await exists(historicalDestination.final_path), false);
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("optional admission requires an owner-declared nonconsequential partial and fence/policy failures leave no output", async () => {
  const state = await setup();
  try {
    await create(state, "case.create", "operation:l06-w02:partial:create", "case", caseRecord(state, ids.partial, { partial: true }));
    const requiredDestination = destination(state, "required-partial", "publication_staging");
    const required = await preflight(state, {
      operationId: "operation:l06-w02:required-partial",
      audience: "public",
      destination: requiredDestination,
      owners: [{ kind: "case", id: ids.partial, requirement: "required" }],
    });
    assert.equal(required.code, 0, required.stderr || JSON.stringify(required.json));
    assert.equal(required.json.result.status, "blocked");
    assert.equal(required.json.result.manifest.blockers.some((item) => item.code === "required_fragment_partial"), true);
    assert.equal(await exists(requiredDestination.temporary_path), false);
    assert.equal(await exists(requiredDestination.final_path), false);

    const optionalDestination = destination(state, "optional-partial", "publication_staging");
    const optional = await preflight(state, {
      operationId: "operation:l06-w02:optional-partial",
      audience: "public",
      destination: optionalDestination,
      owners: [{ kind: "case", id: ids.partial, requirement: "optional" }],
    });
    assert.equal(optional.code, 0, optional.stderr || JSON.stringify(optional.json));
    assert.equal(optional.json.result.status, "ready");
    assert.equal(optional.json.result.manifest.owners[0].status, "partial_nonconsequential");
    assert.equal(optional.json.result.manifest.owners[0].admission, "optional_nonconsequential");

    await rm(optionalDestination.temporary_path, { recursive: true, force: true });
    const fenceDestination = destination(state, "fence-change");
    const changedFence = await preflight(state, {
      operationId: "operation:l06-w02:fence-change",
      destination: fenceDestination,
      owners: [{ kind: "case", id: ids.partial, requirement: "required" }],
    }, { CASEBOOK_PERSISTENCE_TEST_FAULT: "advance_fence_after_corpus_prepare" });
    assert.equal(changedFence.code, 0, changedFence.stderr || JSON.stringify(changedFence.json));
    assert.equal(changedFence.json.result.status, "blocked");
    assert.equal(changedFence.json.result.manifest.blockers.some((item) => item.code === "observation_fence_inconsistent"), true);
    assert.equal(await exists(fenceDestination.temporary_path), false);
    assert.equal(await exists(fenceDestination.final_path), false);
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});
