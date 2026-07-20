import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  cleanupSandbox,
  generateAndValidateSandbox,
  selectCompatibleSqliteBinary,
} from "./sandbox-harness.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceEntrypoint = path.join(packageRoot, "variants/sqlite/bin/casebook-persistence.mjs");
const protocol = { id: "casebook-persistence-json", version: 1 };
const ids = Object.freeze({
  case: "case:10453ec2-3f1e-4da9-b4a3-7f84d8f6257d",
  alias: "alias:ce7a6e51-76c6-4413-b958-464fb7c86775",
  frame: "frame:20bd36b7-26e5-42a8-b423-d321867fb278",
  discovery: "discovery:cdb82c54-3af4-4324-b13f-71c5833bd679",
  unknownCase: "case:dfc14ea2-dcf8-4367-bcb4-177ff3f7b733",
  caseOnlyView: "view:35b6c586-7e30-4d8f-a7ba-a9556484ca10",
  caseOnlyPolicy: "view-policy:d31004e4-eae2-46a3-b0d1-a3c73d12271b",
});
const authorityClaim = Object.freeze({ human_authorized: true, acting_role: "architect", authority_basis: "disposable L04-W02 evidence" });

function invoke(entrypoint, cwd, request) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [entrypoint], {
      cwd, encoding: "utf8", timeout: 30_000, maxBuffer: 4 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? "", HOME: cwd },
    }, (error, stdout, stderr) => resolve({ code: error ? 2 : 0, json: stdout ? JSON.parse(stdout) : {}, stderr }));
    child.stdin.end(`${JSON.stringify(request)}\n`);
  });
}

async function setup(entrypoint = sourceEntrypoint, label = "source") {
  const root = await mkdtemp(path.join(os.tmpdir(), `casebook-l04-w02-${label}-`));
  const sqliteBinary = await selectCompatibleSqliteBinary();
  const configuration = { source: { kind: "synthetic-test", locator: `l04-w02:${label}` }, authority_mode: "sqlite", sqlite: { database_url: path.join(root, "store.sqlite3"), sqlite_bin: sqliteBinary } };
  const initialized = await invoke(entrypoint, root, { protocol, operation: "initialize_store", operation_id: `operation:l04-w02:${label}:init`, authority_claim: authorityClaim, configuration });
  assert.equal(initialized.code, 0, initialized.stderr || JSON.stringify(initialized.json));
  const initialization = initialized.json.result.initialization;
  return { root, entrypoint, configuration, initialization, context: { view_id: initialization.view.id, view_policy_revision_id: initialization.view.policy_revision_id, purpose: "bounded mixed-owner discovery", requested_audience_ceiling: "private" } };
}

function common(state) { return { protocol, request_version: 1, store_id: state.initialization.store_id, context: state.context, configuration: state.configuration }; }

async function seed(state) {
  const caseResult = await invoke(state.entrypoint, state.root, {
    ...common(state), operation: "case.create", operation_id: "operation:l04-w02:case", expected_revision: 0,
    commit_basis: "synthetic identity candidate", provenance: { acting_role: "case" },
    case: { id: ids.case, home_namespace_id: state.initialization.namespace.id, state: "active", title: "Mixed owner needle", summary: "Semantic Case payload must be hydrated only by Case.", scope: "Disposable", aliases: [{ id: ids.alias, state: "active", version: { value: "mixed-owner-alias", kind: "lookup" } }], facets: [], entries: [], sources: [], relationships: [], references: [] },
  });
  assert.equal(caseResult.code, 0, caseResult.stderr || JSON.stringify(caseResult.json));
  const frameResult = await invoke(state.entrypoint, state.root, {
    ...common(state), operation: "frame.create", operation_id: "operation:l04-w02:frame", expected_revision: 0,
    commit_basis: "synthetic identity candidate", provenance: { acting_role: "frame", authority_basis: "disposable namespace scope" },
    frame: {
      id: ids.frame, home_namespace_id: state.initialization.namespace.id, authority_scope_namespace_ids: [state.initialization.namespace.id], status: "active", title: "Mixed owner needle",
      outcome: "Semantic Frame payload must be hydrated only by Frame.",
      case_links: [{ target_kind: "case", target_id: ids.case, observed_revision_id: caseResult.json.result.revision.id, predicate: "tracks", provenance: "synthetic explicit link" }],
      discovery: [{ id: ids.discovery, display_order: 0, lifecycle: "active", category: "frontier", title: "Identity handoff", body: "No substrate brief.", human_authority: "not_required", dependencies: [] }],
    },
  });
  assert.equal(frameResult.code, 0, JSON.stringify(frameResult.json));
  return { caseResult, frameResult };
}

function discover(state, overrides = {}) {
  return invoke(state.entrypoint, state.root, {
    ...common(state), operation: "identity.discover", owner_kinds: ["case", "frame"],
    query: { text: "mixed owner needle" }, limit: 10, max_depth: 0, ...overrides,
  });
}

function hydrate(state, ownerKind, discovery, candidateIds, overrides = {}) {
  return invoke(state.entrypoint, state.root, {
    ...common(state), operation: `${ownerKind}.discovery.hydrate`, handoff_token: discovery.json.result.handoff_token,
    query_digest: discovery.json.result.query_digest, candidate_ids: candidateIds, ...overrides,
  });
}

test("mixed discovery returns identity-only candidates and owner façades hydrate exact bound revisions", async () => {
  const state = await setup();
  try {
    const seeded = await seed(state);
    const found = await discover(state);
    assert.equal(found.code, 0, found.stderr || JSON.stringify(found.json));
    assert.deepEqual(found.json.result.candidates.map((item) => item.owner_kind).sort(), ["case", "frame"]);
    assert.deepEqual(found.json.result.candidates.map((item) => Object.keys(item).sort()), [
      ["current_owner_revision", "home_namespace_id", "owner_kind", "stable_id"],
      ["current_owner_revision", "home_namespace_id", "owner_kind", "stable_id"],
    ]);
    assert.equal(found.json.result.applied_view.view_policy_revision_id, state.context.view_policy_revision_id);
    assert.equal(found.json.result.audience_ceiling, "private");
    assert.match(found.json.result.query_digest, /^[0-9a-f]{64}$/);
    assert.equal(typeof found.json.result.handoff_token, "string");
    assert.ok(found.json.result.handoff_token.length > 80);
    assert.equal(JSON.stringify(found.json.result).includes("Semantic Case payload"), false);
    assert.equal(JSON.stringify(found.json.result).includes("Semantic Frame payload"), false);

    const currentCase = await invoke(state.entrypoint, state.root, { ...common(state), operation: "case.read", case_id: ids.case });
    const changedCase = structuredClone(currentCase.json.result.case);
    changedCase.summary = "A later current revision must not widen an earlier handoff.";
    const revisedCase = await invoke(state.entrypoint, state.root, {
      ...common(state), operation: "case.commit_revision", operation_id: "operation:l04-w02:case:later", expected_revision: 1,
      commit_basis: "advance after identity query fence", provenance: { acting_role: "case" }, case: changedCase,
    });
    assert.equal(revisedCase.code, 0, revisedCase.stderr || JSON.stringify(revisedCase.json));

    const caseHydrated = await hydrate(state, "case", found, [ids.case]);
    const frameHydrated = await hydrate(state, "frame", found, [ids.frame]);
    assert.equal(caseHydrated.code, 0, caseHydrated.stderr || JSON.stringify(caseHydrated.json));
    assert.equal(frameHydrated.code, 0, frameHydrated.stderr || JSON.stringify(frameHydrated.json));
    assert.equal(caseHydrated.json.result.items[0].case.summary, "Semantic Case payload must be hydrated only by Case.");
    assert.equal(caseHydrated.json.result.items[0].revision.id, seeded.caseResult.json.result.revision.id);
    assert.equal(frameHydrated.json.result.items[0].frame.outcome, "Semantic Frame payload must be hydrated only by Frame.");
    assert.equal(frameHydrated.json.result.items[0].revision.id, seeded.frameResult.json.result.revision.id);
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("explicit traversal returns bounded visible links and policy limits reject widening", async () => {
  const state = await setup();
  try {
    await seed(state);
    const aliased = await discover(state, { query: { alias: { namespace_id: state.initialization.namespace.id, kind: "lookup", value: "Mixed-Owner-Alias" } }, owner_kinds: ["case"], limit: 1 });
    assert.equal(aliased.code, 0, aliased.stderr || JSON.stringify(aliased.json));
    assert.deepEqual(aliased.json.result.candidates.map((item) => item.stable_id), [ids.case]);
    const traversed = await discover(state, {
      query: { relationship: { start: [{ kind: "frame", id: ids.frame }], predicates: ["tracks"], direction: "outgoing" } },
      limit: 2, max_depth: 1,
    });
    assert.equal(traversed.code, 0, traversed.stderr || JSON.stringify(traversed.json));
    assert.deepEqual(traversed.json.result.candidates.map((item) => item.stable_id).sort(), [ids.case, ids.frame].sort());
    assert.deepEqual(traversed.json.result.links, [{ from: { kind: "frame", id: ids.frame }, to: { kind: "case", id: ids.case }, predicate: "tracks", direction: "outgoing", observed_revision_id: traversed.json.result.candidates.find((item) => item.stable_id === ids.case).current_owner_revision.id, depth: 1 }]);
    assert.equal(traversed.json.result.applied_bounds.max_depth, 1);
    assert.equal(traversed.json.result.applied_bounds.result_limit, 2);

    const tooMany = await discover(state, { limit: 101 });
    const tooDeep = await discover(state, { max_depth: 9 });
    assert.equal(tooMany.code, 2);
    assert.equal(tooMany.json.failure.code, "identity.discovery_invalid");
    assert.equal(tooDeep.code, 2);
    assert.equal(tooDeep.json.failure.code, "identity.discovery_invalid");
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("handoffs reject store, policy, query, kind, candidate, and token widening without leaking identity", async () => {
  const state = await setup();
  const other = await setup(sourceEntrypoint, "other");
  try {
    await seed(state);
    const found = await discover(state);
    const createPolicy = await invoke(state.entrypoint, state.root, {
      ...common(state), operation: "view_policy.create", operation_id: "operation:l04-w02:handoff-policy:create", authority_claim: authorityClaim,
      policy: { view_id: ids.caseOnlyView, view_policy_revision_id: ids.caseOnlyPolicy, home_namespace_id: state.initialization.namespace.id, audience_ceiling: "private", namespace_ids: [state.initialization.namespace.id], object_kinds: ["case"], limits: { max_results: 10, max_traversal_depth: 2 }, store_operation_receipts_visible: false },
    });
    assert.equal(createPolicy.code, 0, createPolicy.stderr || JSON.stringify(createPolicy.json));
    const activate = await invoke(state.entrypoint, state.root, {
      ...common(state), operation: "view_policy.activate", operation_id: "operation:l04-w02:handoff-policy:activate", authority_claim: authorityClaim,
      view_id: ids.caseOnlyView, view_policy_revision_id: ids.caseOnlyPolicy,
    });
    assert.equal(activate.code, 0, activate.stderr || JSON.stringify(activate.json));
    const otherPolicy = { ...state, context: { ...state.context, view_id: ids.caseOnlyView, view_policy_revision_id: ids.caseOnlyPolicy } };
    const attempts = [
      hydrate(state, "case", found, [ids.unknownCase]),
      hydrate(state, "case", found, [ids.frame]),
      hydrate(state, "case", found, [ids.case], { query_digest: "0".repeat(64) }),
      hydrate(state, "case", found, [ids.case], { handoff_token: `${found.json.result.handoff_token.slice(0, -1)}x` }),
      hydrate(other, "case", found, [ids.case]),
      hydrate(otherPolicy, "case", found, [ids.case]),
    ];
    for (const result of await Promise.all(attempts)) {
      assert.equal(result.code, 2);
      assert.equal(result.json.failure.code, "case.not_found_or_not_visible");
      assert.deepEqual(result.json.failure.evidence, {});
    }
  } finally {
    await rm(state.root, { recursive: true, force: true });
    await rm(other.root, { recursive: true, force: true });
  }
});

test("unknown and policy-invisible identities have indistinguishable empty discovery results", async () => {
  const state = await setup();
  try {
    await seed(state);
    const createPolicy = await invoke(state.entrypoint, state.root, {
      ...common(state), operation: "view_policy.create", operation_id: "operation:l04-w02:case-only:create", authority_claim: authorityClaim,
      policy: { view_id: ids.caseOnlyView, view_policy_revision_id: ids.caseOnlyPolicy, home_namespace_id: state.initialization.namespace.id, audience_ceiling: "private", namespace_ids: [state.initialization.namespace.id], object_kinds: ["case"], limits: { max_results: 10, max_traversal_depth: 2 }, store_operation_receipts_visible: false },
    });
    assert.equal(createPolicy.code, 0, createPolicy.stderr || JSON.stringify(createPolicy.json));
    const activate = await invoke(state.entrypoint, state.root, {
      ...common(state), operation: "view_policy.activate", operation_id: "operation:l04-w02:case-only:activate", authority_claim: authorityClaim,
      view_id: ids.caseOnlyView, view_policy_revision_id: ids.caseOnlyPolicy,
    });
    assert.equal(activate.code, 0, activate.stderr || JSON.stringify(activate.json));
    const narrowed = { ...state, context: { ...state.context, view_id: ids.caseOnlyView, view_policy_revision_id: ids.caseOnlyPolicy } };
    const invisible = await discover(narrowed, { query: { identity: { kind: "frame", id: ids.frame } }, owner_kinds: ["frame"], limit: 1 });
    const unknown = await discover(narrowed, { query: { identity: { kind: "case", id: ids.unknownCase } }, owner_kinds: ["case"], limit: 1 });
    assert.equal(invisible.code, 0, invisible.stderr || JSON.stringify(invisible.json));
    assert.equal(unknown.code, 0, unknown.stderr || JSON.stringify(unknown.json));
    const comparable = (value) => ({ status: value.result.status, candidates: value.result.candidates, links: value.result.links, completeness: value.result.result_completeness });
    assert.deepEqual(comparable(invisible.json), comparable(unknown.json));
    assert.deepEqual(invisible.json.result.candidates, []);
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("generated Pi, Codex, and OpenCode copies preserve mixed handoff behavior and clean up", async () => {
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "casebook-l04-w02-generated-"));
  try {
    const generated = await generateAndValidateSandbox({ sandboxRoot: sandbox });
    for (const item of generated.results) {
      const state = await setup(path.join(item.package_root, "variants/sqlite/bin/casebook-persistence.mjs"), item.target);
      try {
        await seed(state);
        const found = await discover(state);
        assert.equal(found.code, 0, found.stderr || JSON.stringify(found.json));
        assert.equal((await hydrate(state, "case", found, [ids.case])).code, 0);
        assert.equal((await hydrate(state, "frame", found, [ids.frame])).code, 0);
      } finally {
        await rm(state.root, { recursive: true, force: true });
      }
    }
  } finally {
    assert.equal(await cleanupSandbox(sandbox), true);
    assert.equal(await stat(sandbox).then(() => true).catch(() => false), false);
  }
});
