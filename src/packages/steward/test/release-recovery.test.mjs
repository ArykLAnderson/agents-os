import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createStewardFacade } from "../lib/steward.mjs";

let sequence = 0;

async function fixture(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "steward-release-recovery-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return path.join(dir, "steward.json");
}

function invoke(facade, operation, request = {}) {
  return facade.invoke({ operation, ...request }).envelope;
}

function createMatter(facade, suffix = String(++sequence), ownerReferences = [{ kind: "frame", id: `frame:${suffix}` }]) {
  const identity = invoke(facade, "identity.resolve");
  const spaceId = `space:${suffix}`;
  const space = invoke(facade, "spaces.create", {
    expected_directory_revision: identity.result.directory.revision,
    space: { id: spaceId, name: `Space ${suffix}` },
  });
  const capture = invoke(facade, "intakes.capture", {
    replay_key: `capture:${suffix}`,
    content: `Intent ${suffix}`,
    provenance: { source: "architect" },
    space_id: spaceId,
    expected_space_revision: space.result.space.revision,
    relevance_reason: "The intent remains relevant",
    owner_references: ownerReferences,
  });
  if (capture.status !== "success") return { space: space.result.space, capture };
  return { space: capture.result.space, matter: capture.result.matter, capture };
}

function observation(matterId, extra = {}) {
  return {
    id: `observation:${matterId}`,
    matter_id: matterId,
    owner: { kind: "frame", id: "frame:owner" },
    artifact: { id: "frame:owner", revision: "frame-revision:one" },
    represented_revision: "frame-revision:one",
    currentness: "currentness:one",
    observed_at: "2026-08-06T00:00:00.000Z",
    condition: "current",
    limitations: [],
    ...extra,
  };
}

const envelope = {
  outcome: "repair-steward-release",
  action: "software-implementation.admit",
  target: { kind: "feature", id: "F-009" },
  space_scope: { kind: "space", space_id: "space:agent-os" },
  matter_id: "matter:release-repair",
  consequences: ["source-edit", "commit"],
  monitoring_scope: { kind: "feature", id: "F-009" },
  lifetime: { kind: "one-action", expires_at: null },
  repository: "/Users/aryk/.agents-os",
  path: "/Users/aryk/.agents-os-worktrees/steward-space-successor",
  base: "origin/master@ded555f4c5562bde22848524e8613360c6dbdb03",
  delivery_shape: "single_pr",
  delivery: {
    branch: "feature/steward-space-successor",
    worktree: "/Users/aryk/.agents-os-worktrees/steward-space-successor",
    pull_request_base: "master",
  },
  routine_mechanics: ["local-tests", "commit"],
  absent_operations: ["merge", "deploy", "release"],
  invalidators: ["atlas-currentness"],
  atlas: { map_id: "FM-003", decision_id: "23B6E157-7CA9-4DAD-8AE4-F7312492B417" },
  authority: { kind: "ordinary", id: "approval:release-repair" },
  effect_bindings: [],
};

function completeHandoff(overrides = {}) {
  return {
    disposition: "HandoffReady",
    current: true,
    map_id: envelope.atlas.map_id,
    decision_id: envelope.atlas.decision_id,
    scope: {
      features: [{ id: "F-009", owner: "owner:steward-boundaries", outcome: "Exact owner boundaries" }],
      work_items: [{ id: "WI-038", feature_id: "F-009", owner: "owner:wi-038", outcome: "Conforming owner adapters" }],
    },
    order: { dependencies: [{ consumer: "WI-038", prerequisite: "F-009" }], convergence: ["F-009"] },
    obligations: ["Validate exact owner-specific contracts"],
    limitations: [],
    forbidden_claims: [],
    required_effects: [],
    authority_boundary: { implementation: "present", external_effects: "none" },
    fresh_reread: { status: "complete_consistent", observed_at: "2026-08-06T00:00:00.000Z" },
    ...overrides,
  };
}

function admissionOwners({ handoff = completeHandoff(), throwAfterSubmit = false } = {}) {
  const calls = { correlate: 0, admit: 0 };
  return {
    calls,
    owners: {
      atlas: { readHandoff: () => structuredClone(handoff) },
      directive: {
        authorize: ({ envelope: candidate }) => ({ disposition: "authorized", authorization: { kind: "ordinary", envelope: structuredClone(candidate) } }),
      },
      softwareImplementation: {
        correlate: () => {
          calls.correlate += 1;
          return { correlation_id: "software-implementation-correlation:release-repair" };
        },
        admit: ({ envelope: candidate, correlation_id }) => {
          calls.admit += 1;
          if (throwAfterSubmit) throw new Error("transport ended after possible delivery");
          return {
            disposition: "admitted",
            correlation_id,
            currentness: "software-implementation-currentness:one",
            observed_at: "2026-08-06T00:00:00.000Z",
            authorized_routine_mechanics: candidate.routine_mechanics,
          };
        },
        recover: ({ correlation_id }) => ({ disposition: "unknown", correlation_id, currentness: "software-implementation-currentness:one", observed_at: "2026-08-06T00:00:01.000Z" }),
      },
    },
  };
}

test("a killed writer cannot leave StewardStore permanently locked", async (t) => {
  const store = await fixture(t);
  const modulePath = path.resolve(import.meta.dirname, "..", "lib", "steward.mjs");
  const source = `import { StewardStore } from ${JSON.stringify(modulePath)};\nconst store = new StewardStore(process.argv[1]);\nstore.transact(() => { process.stdout.write("locked\\n"); Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0); });\n`;
  const writer = spawn(process.execPath, ["--input-type=module", "--eval", source, store], { stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("writer never acquired the transaction lock")), 2_000);
    writer.once("error", reject);
    writer.stdout.once("data", () => { clearTimeout(timeout); resolve(); });
  });
  writer.kill("SIGKILL");
  await new Promise((resolve) => writer.once("exit", resolve));

  const recoverySource = `import { createStewardFacade } from ${JSON.stringify(modulePath)};\nconst response = createStewardFacade(process.argv[1]).invoke({ operation: "identity.resolve" });\nprocess.stdout.write(JSON.stringify(response.envelope));\nprocess.exitCode = response.exitCode;\n`;
  const recovered = spawn(process.execPath, ["--input-type=module", "--eval", recoverySource, store], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  recovered.stdout.on("data", (chunk) => { stdout += chunk; });
  const result = await new Promise((resolve) => {
    const timeout = setTimeout(() => { recovered.kill("SIGKILL"); resolve({ code: "timeout", stdout }); }, 2_000);
    recovered.once("exit", (code) => { clearTimeout(timeout); resolve({ code, stdout }); });
  });
  assert.equal(result.code, 0);
  assert.equal(JSON.parse(result.stdout).status, "success");
});

test("Portfolio acknowledgement independently re-observes owners and durably supports restart comparison", async (t) => {
  const store = await fixture(t);
  const setup = createStewardFacade(store);
  const { matter } = createMatter(setup, "acknowledgement");
  const represented = observation(matter.id);
  const request = { scope: { kind: "global" }, observations: [represented] };
  const composed = invoke(setup, "portfolio.compose", request);

  const unavailable = invoke(setup, "portfolio.acknowledge", { view_id: composed.result.view.id, view_request: request, expected_baseline_revision: 0 });
  assert.equal(unavailable.failure.code, "view_reobservation_unavailable");

  const owners = { frame: { observe: ({ observation: expected }) => structuredClone(expected) } };
  const admitted = createStewardFacade(store, owners);
  const acknowledged = invoke(admitted, "portfolio.acknowledge", { view_id: composed.result.view.id, view_request: request, expected_baseline_revision: 0 });
  assert.equal(acknowledged.status, "success");
  assert.deepEqual(acknowledged.result.baseline.manifest, composed.result.view.manifest);

  const restarted = createStewardFacade(store, owners);
  const changed = invoke(restarted, "portfolio.compose", { ...request, observations: [{ ...represented, represented_revision: "frame-revision:two", artifact: { ...represented.artifact, revision: "frame-revision:two" }, condition: "blocked" }] });
  assert.equal(changed.result.comparison.status, "changed");
  const incomparable = invoke(restarted, "portfolio.compose", { scope: { kind: "global" }, observations: [] });
  assert.equal(incomparable.result.comparison.status, "incomparable");
});

test("Portfolio binds owner-event return and attention to exact cited support", async (t) => {
  const store = await fixture(t);
  const facade = createStewardFacade(store);
  const { matter } = createMatter(facade, "attention");
  const deferred = invoke(facade, "matters.transition", {
    matter_id: matter.id,
    expected_revision: matter.revision,
    transition: "deferred",
    relevance_reason: matter.relevance_reason,
    deferral_reason: "Wait for the exact owner event",
    return_condition: { kind: "owner_event", value: "event:wanted" },
  });
  const unrelated = observation(matter.id, { condition: "satisfied" });
  const pending = invoke(facade, "portfolio.compose", { scope: { kind: "global" }, observations: [unrelated] });
  assert.equal(pending.result.view.returns[0].status, "pending");

  const unsupported = invoke(facade, "portfolio.compose", {
    scope: { kind: "global" },
    observations: [observation(matter.id)],
    attention: [{
      matter_id: matter.id,
      band: "urgent",
      evidence_ids: [`observation:${matter.id}`],
      axes: { human_needed: false, independently_progressing: false, observation_limited: false },
      smallest_action: { text: "Interrupt the Architect", evidence_id: `observation:${matter.id}` },
    }],
  });
  assert.equal(unsupported.failure.code, "attention_evidence_unsupported");

  const exact = observation(matter.id, {
    id: "observation:exact-event",
    event_id: "event:wanted",
    condition: "satisfied",
    attention_support: {
      bands: ["urgent"],
      axes: { human_needed: true, independently_progressing: false, observation_limited: false },
      actions: ["Review the exact returned event"],
    },
  });
  const supported = invoke(facade, "portfolio.compose", {
    scope: { kind: "global" },
    observations: [exact],
    attention: [{
      matter_id: deferred.result.matter.id,
      band: "urgent",
      evidence_ids: [exact.id],
      axes: { human_needed: true, independently_progressing: false, observation_limited: false },
      smallest_action: { text: "Review the exact returned event", evidence_id: exact.id },
    }],
  });
  assert.equal(supported.status, "success");
  assert.equal(supported.result.view.returns[0].status, "satisfied");
});

test("Namespace associations are canonical and Portfolio accepts filter/rank context only", async (t) => {
  const store = await fixture(t);
  const facade = createStewardFacade(store);
  const { space, matter } = createMatter(facade, "namespace");
  const malformed = invoke(facade, "spaces.associations.set", {
    space_id: space.id,
    expected_revision: space.revision,
    association: { namespace_id: "namespace:", include_descendants: false, expected_association_revision: 0 },
  });
  assert.equal(malformed.failure.code, "namespace_id_invalid");
  const associated = invoke(facade, "spaces.associations.set", {
    space_id: space.id,
    expected_revision: space.revision,
    association: { namespace_id: "namespace:agent-platform", include_descendants: false, expected_association_revision: 0 },
  });
  assert.equal(associated.status, "success");
  const authority = invoke(facade, "portfolio.compose", {
    scope: { kind: "global" },
    observations: [observation(matter.id)],
    namespace_context: { namespace_id: "namespace:agent-platform", mode: "authority" },
  });
  assert.equal(authority.failure.code, "namespace_context_mode_invalid");
});

test("Matter custody rejects copied owner state and Question closure requires an exact owner result", async (t) => {
  const store = await fixture(t);
  const defaultFacade = createStewardFacade(store);
  const copied = createMatter(defaultFacade, "copied-owner", [{ copied_owner_state: { status: "done" } }]);
  assert.equal(copied.capture.failure.code, "owner_reference_invalid");
  const identity = invoke(defaultFacade, "identity.resolve");
  const space = invoke(defaultFacade, "spaces.create", { expected_directory_revision: identity.result.directory.revision, space: { id: "space:question", name: "Question" } });
  const capture = invoke(defaultFacade, "intakes.capture", {
    replay_key: "capture:question",
    content: "Question intent",
    provenance: { source: "architect" },
    space_id: "space:question",
    expected_space_revision: space.result.space.revision,
    relevance_reason: "Owner result is pending",
    owner_references: [{ kind: "frame", id: "frame:question-owner" }],
  });
  const linked = invoke(defaultFacade, "matters.questions.link", {
    matter_id: capture.result.matter.id,
    expected_revision: capture.result.matter.revision,
    question: { owner: { kind: "frame", id: "frame:question-owner" }, locator: "question:one", revision: "question-revision:one" },
  });
  const spoofed = invoke(defaultFacade, "matters.questions.close", {
    matter_id: linked.result.matter.id,
    expected_revision: linked.result.matter.revision,
    owner: { kind: "frame", id: "frame:question-owner" },
    disposition: "withdrawn",
    result_locator: "result:spoofed",
  });
  assert.equal(spoofed.failure.code, "question_owner_unavailable");

  const owners = {
    question: {
      project: () => ({
        question: {
          locator: "question:one",
          owner: { kind: "frame", id: "frame:question-owner" },
          represented_revision: "question-revision:one",
          currentness: "question-currentness:two",
          condition: "withdrawn",
          observed_at: "2026-08-06T00:00:00.000Z",
          result_locator: "result:owner-withdrawal",
          withdrawal_basis: "The owner no longer needs an answer",
          evidence: ["owner-receipt:withdrawal"],
          limitations: [],
        },
      }),
    },
  };
  const verified = createStewardFacade(store, owners);
  const closed = invoke(verified, "matters.questions.close", { matter_id: linked.result.matter.id, expected_revision: linked.result.matter.revision });
  assert.equal(closed.status, "success");
  assert.equal(closed.result.matter.question.state, "withdrawn");
  assert.equal(closed.result.matter.question.result_locator, "result:owner-withdrawal");
});

test("owner orientation adapters reject arbitrary shapes and accept exact owner-specific evidence", async (t) => {
  const store = await fixture(t);
  const invalid = createStewardFacade(store, { case: { orient: () => ({}) }, prototype: { orient: () => ({}) } });
  assert.equal(invoke(invalid, "owner.case.orient", { artifact: { id: "case:one", revision: "case-revision:one" } }).failure.code, "owner_result_invalid");
  assert.equal(invoke(invalid, "owner.prototype.orient", { artifact: { id: "prototype:one", revision: "prototype-revision:one" } }).failure.code, "owner_result_invalid");

  const exact = createStewardFacade(store, {
    case: {
      orient: ({ artifact }) => ({ artifact, represented_revision: artifact.revision, currentness: "case-currentness:one", condition: "current", observed_at: "2026-08-06T00:00:00.000Z", status: "active", knowledge: ["knowledge:one"], sources: ["source:one"], evidence: ["case-receipt:one"], limitations: [] }),
    },
    prototype: {
      orient: ({ artifact }) => ({ artifact, represented_revision: artifact.revision, currentness: "prototype-currentness:one", condition: "complete", observed_at: "2026-08-06T00:00:00.000Z", question: "Does the seam hold?", observations: ["observation:one"], verdict: "supported", evidence: ["evidence:one"], limitations: [], locator: "prototype-result:one" }),
    },
  });
  assert.equal(invoke(exact, "owner.case.orient", { artifact: { id: "case:one", revision: "case-revision:one" } }).status, "success");
  assert.equal(invoke(exact, "owner.prototype.orient", { artifact: { id: "prototype:one", revision: "prototype-revision:one" } }).status, "success");
});

test("ambiguous Software Implementation delivery is durably unknown before retry", async (t) => {
  const store = await fixture(t);
  const { owners, calls } = admissionOwners({ throwAfterSubmit: true });
  const facade = createStewardFacade(store, owners);
  const prepared = invoke(facade, "implementation.admission.prepare", { atlas: envelope.atlas, requested_outcome: { permitted_limitations: [], claims: [] }, envelope });
  assert.equal(prepared.status, "success");
  const ambiguous = invoke(facade, "implementation.admission.submit", prepared.result);
  assert.equal(ambiguous.status, "success");
  assert.equal(ambiguous.result.admission.disposition, "unknown");
  assert.equal(ambiguous.result.admission.correlation_id, "software-implementation-correlation:release-repair");

  const restarted = createStewardFacade(store, owners);
  const retry = invoke(restarted, "implementation.admission.submit", prepared.result);
  assert.equal(retry.failure.code, "admission_recovery_required");
  assert.equal(calls.admit, 1);
});

test("Software Implementation blocker projection is a direct Portfolio observation", async (t) => {
  const store = await fixture(t);
  const facade = createStewardFacade(store);
  const { matter } = createMatter(facade, "implementation-projection");
  const projected = invoke(facade, "implementation.portfolio.project", {
    matter_id: matter.id,
    admission: {
      disposition: "refused",
      correlation_id: "software-implementation-correlation:blocker",
      currentness: "software-implementation-currentness:blocker",
      observed_at: "2026-08-06T00:00:00.000Z",
      blocker: { code: "authority-required", owner: "software-implementation" },
      limitations: [],
    },
  });
  assert.equal(projected.status, "success");
  const composed = invoke(facade, "portfolio.compose", { scope: { kind: "global" }, observations: [projected.result.observation] });
  assert.equal(composed.status, "success");
  assert.equal(composed.result.view.manifest.observations[0].matter_id, matter.id);
  assert.equal(composed.result.view.manifest.observations[0].condition, "blocked");
});

test("admission requires complete Atlas ownership/dependencies while allowing effect-free envelopes", async (t) => {
  const store = await fixture(t);
  const incomplete = admissionOwners({ handoff: { disposition: "HandoffReady", current: true, limitations: [], forbidden_claims: [], required_effects: [] } });
  const refused = invoke(createStewardFacade(store, incomplete.owners), "implementation.admission.prepare", { atlas: envelope.atlas, requested_outcome: { permitted_limitations: [], claims: [] }, envelope });
  assert.equal(refused.failure.code, "atlas_handoff_invalid");

  const complete = admissionOwners();
  const prepared = invoke(createStewardFacade(store, complete.owners), "implementation.admission.prepare", { atlas: envelope.atlas, requested_outcome: { permitted_limitations: [], claims: [] }, envelope });
  assert.equal(prepared.status, "success");
  assert.deepEqual(prepared.result.envelope.effect_bindings, []);
});
