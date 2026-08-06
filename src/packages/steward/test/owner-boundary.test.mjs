import assert from "node:assert/strict";
import test from "node:test";
import { createStewardFacade } from "../lib/steward.mjs";

let facadeSequence = 0;

const envelope = {
  outcome: "deliver-owner-boundary",
  action: "software-implementation.admit",
  target: { kind: "feature", id: "F-009" },
  space_scope: { kind: "space", space_id: "space:agent-os" },
  matter_id: "matter:owner-boundary",
  consequences: ["source-edit", "commit"],
  monitoring_scope: { kind: "feature", id: "F-009" },
  lifetime: { kind: "one-action", expires_at: null },
  repository: "/Users/aryk/.agents-os",
  path: "/Users/aryk/.agents-os-worktrees/steward-space-successor",
  base: "origin/master@fd0c6a49cecb218bf60b458201e486599adde2f3",
  delivery_shape: "single_pr",
  delivery: { branch: "feature/steward-space-successor", worktree: "/Users/aryk/.agents-os-worktrees/steward-space-successor", pull_request_base: "master" },
  routine_mechanics: ["local-tests", "commit"],
  absent_operations: ["merge", "deploy"],
  invalidators: ["atlas-currentness"],
  atlas: { map_id: "FM-003", decision_id: "D" },
  authority: { kind: "ordinary", id: "approval:one" },
  effect_bindings: [{ effect: "local-test", binding: "approval:one" }],
};

function conformers({ handoff = { disposition: "HandoffWithLimitations", current: true, limitations: ["endpoint-unavailable"], forbidden_claims: ["real-endpoint-integration"], required_effects: ["local-test"] }, authorization = "authorized", admission = "admitted", recovery = "unknown" } = {}) {
  const answers = new Map();
  const bindings = new Map([
    ["binding:one", { id: "binding:one", focused: false }],
    ["binding:two", { id: "binding:two", focused: false }],
  ]);
  const calls = { directive: 0, admit: 0, recover: 0 };
  const orientation = (kind) => ({ orient: ({ artifact }) => ({ artifact: { ...artifact }, status: "stale", readiness: "needs-evidence", currentness: "stale", open_questions: [`question:${kind}`], decisions: [`decision:${kind}`], blockers: [`blocker:${kind}`], next_movement: `continue-${kind}`, missing_evidence: [`missing:${kind}`], conflicting_evidence: [] }) });
  const owners = {
    case: orientation("case"),
    frame: orientation("frame"),
    blueprint: orientation("blueprint"),
    prototype: { orient: ({ artifact }) => ({ artifact: { ...artifact }, question: "Does the boundary hold?", observations: ["observation:one"], verdict: "inconclusive", evidence: ["evidence:one"], limitations: ["synthetic"], locator: "prototype:one" }) },
    rfc: orientation("rfc"),
    atlas: {
      orient: orientation("atlas").orient,
      readHandoff: () => structuredClone(handoff),
    },
    interactionBinding: {
      create: ({ purpose, focus, artifact, scope }) => ({ binding: { id: "binding:created", purpose, focus, artifact, scope } }),
      focus: ({ binding_id }) => {
        const binding = bindings.get(binding_id);
        if (!binding) return { disposition: "refused", code: "binding_not_found" };
        binding.focused = true;
        return { binding: structuredClone(binding) };
      },
      resolve: ({ binding_id }) => {
        const binding = bindings.get(binding_id);
        if (!binding) return { disposition: "refused", code: "binding_not_found" };
        binding.resolved = true;
        return { binding: structuredClone(binding) };
      },
    },
    question: {
      project: ({ question_locator }) => ({ question: { locator: question_locator, condition: "open", owner: { kind: "frame", id: "frame:one" } } }),
      submitAnswer: ({ question_locator, answer }) => {
        const prior = answers.get(question_locator);
        if (prior && (prior.id !== answer.id || prior.body !== answer.body)) return { disposition: "refused", code: "answer_immutable_conflict" };
        answers.set(question_locator, { ...answer });
        return { disposition: "accepted", question: { locator: question_locator, condition: "open" }, answer: { ...answer } };
      },
    },
    directive: {
      authorize: ({ envelope: candidate }) => {
        calls.directive += 1;
        if (authorization === "guidance") return { disposition: "guidance" };
        if (authorization === "expired") return { disposition: "refused", code: "authority_expired" };
        return { disposition: "authorized", authorization: { kind: "ordinary", envelope: structuredClone(candidate) } };
      },
    },
    softwareImplementation: {
      admit: ({ envelope: candidate }) => {
        calls.admit += 1;
        if (admission === "unknown") return { disposition: "unknown", correlation_id: "si:unknown" };
        if (admission === "refused") return { disposition: "refused", correlation_id: "si:refused", blocker: { code: "base-stale", owner: "software-implementation" } };
        return { disposition: "admitted", correlation_id: "si:admitted", authorized_routine_mechanics: candidate.routine_mechanics, currentness: "current" };
      },
      recover: ({ correlation_id }) => {
        calls.recover += 1;
        if (recovery === "refused") return { disposition: "refused", correlation_id, blocker: { code: "base-stale", owner: "software-implementation" } };
        return { disposition: "unknown", correlation_id, currentness: "unknown" };
      },
    },
  };
  const databasePath = `/tmp/steward-owner-boundary-test-${process.pid}-${++facadeSequence}.json`;
  return { facade: createStewardFacade(databasePath, owners), databasePath, owners, bindings, calls };
}

function invoke(facade, operation, request = {}) {
  const response = facade.invoke({ operation, ...request });
  return response.envelope;
}

test("OwnerBoundaryService preserves exact artifact orientation, binding-local focus, and owner Question state", () => {
  const { facade, bindings } = conformers();
  for (const kind of ["case", "frame", "blueprint", "rfc", "atlas"]) {
    const result = invoke(facade, `owner.${kind}.orient`, { artifact: { id: `${kind}:one`, revision: `${kind}-revision:one` } });
    assert.equal(result.status, "success");
    assert.equal(result.result.orientation.status, "stale");
    assert.deepEqual(result.result.orientation.blockers, [`blocker:${kind}`]);
  }
  const prototype = invoke(facade, "owner.prototype.orient", { artifact: { id: "prototype:one", revision: "prototype-revision:one" } });
  assert.equal(prototype.result.orientation.verdict, "inconclusive");
  assert.deepEqual(prototype.result.orientation.limitations, ["synthetic"]);

  const created = invoke(facade, "owner.bindings.create", { purpose: "continue-frame", focus: { kind: "space", space_id: "space:one" }, artifact: { id: "frame:one", revision: "frame-revision:one" } });
  assert.equal(created.result.binding.purpose, "continue-frame");
  const focus = invoke(facade, "owner.bindings.focus", { binding_id: "binding:one" });
  assert.equal(focus.result.binding.focused, true);
  assert.equal(bindings.get("binding:two").focused, false);
  const resolved = invoke(facade, "owner.bindings.resolve", { binding_id: "binding:one" });
  assert.equal(resolved.result.binding.resolved, true);
  assert.equal(bindings.get("binding:two").focused, false);

  const question = invoke(facade, "owner.questions.project", { question_locator: "question:one" });
  assert.equal(question.result.question.condition, "open");
  const answer = invoke(facade, "owner.answers.submit", { question_locator: "question:one", answer: { id: "answer:one", body: "Keep it open" } });
  assert.equal(answer.result.question.condition, "open");
  const replay = invoke(facade, "owner.answers.submit", { question_locator: "question:one", answer: { id: "answer:one", body: "Keep it open" } });
  assert.equal(replay.status, "success");
  const conflicting = invoke(facade, "owner.answers.submit", { question_locator: "question:one", answer: { id: "answer:two", body: "Close it" } });
  assert.equal(conflicting.failure.code, "answer_immutable_conflict");
  const closure = invoke(facade, "owner.questions.close", { question_locator: "question:one" });
  assert.equal(closure.failure.code, "operation_unavailable");
});

test("OwnerBoundaryService permits only legal Atlas handoffs with a complete exact authority envelope", () => {
  const refused = conformers({ handoff: { disposition: "HandoffRefusal", current: true, limitations: [], forbidden_claims: [] } });
  const refusal = invoke(refused.facade, "implementation.admission.prepare", { atlas: { map_id: "FM-003", decision_id: "D" }, requested_outcome: { permitted_limitations: [], forbidden_claims: [] }, envelope });
  assert.equal(refusal.failure.code, "atlas_handoff_refused");
  assert.equal(refused.calls.directive, 0);

  const ready = conformers({ handoff: { disposition: "HandoffReady", current: true, limitations: [], forbidden_claims: [], required_effects: ["local-test"] } });
  assert.equal(invoke(ready.facade, "implementation.admission.prepare", { atlas: { map_id: "FM-003", decision_id: "D" }, requested_outcome: { permitted_limitations: [], claims: [] }, envelope }).status, "success");
  const stale = conformers({ handoff: { disposition: "HandoffReady", current: false, limitations: [], forbidden_claims: [], required_effects: ["local-test"] } });
  assert.equal(invoke(stale.facade, "implementation.admission.prepare", { atlas: { map_id: "FM-003", decision_id: "D" }, requested_outcome: { permitted_limitations: [], claims: [] }, envelope }).failure.code, "atlas_handoff_not_current");

  const incompatible = conformers();
  const limitation = invoke(incompatible.facade, "implementation.admission.prepare", { atlas: { map_id: "FM-003", decision_id: "D" }, requested_outcome: { permitted_limitations: [], forbidden_claims: [] }, envelope });
  assert.equal(limitation.failure.code, "atlas_limitation_incompatible");
  assert.equal(incompatible.calls.directive, 0);
  const forbidden = invoke(incompatible.facade, "implementation.admission.prepare", { atlas: { map_id: "FM-003", decision_id: "D" }, requested_outcome: { permitted_limitations: ["endpoint-unavailable"], claims: ["real-endpoint-integration"] }, envelope });
  assert.equal(forbidden.failure.code, "atlas_forbidden_claim");

  const guidance = conformers({ authorization: "guidance" });
  const guidanceResult = invoke(guidance.facade, "implementation.admission.prepare", { atlas: { map_id: "FM-003", decision_id: "D" }, requested_outcome: { permitted_limitations: ["endpoint-unavailable"], forbidden_claims: [] }, envelope });
  assert.equal(guidanceResult.failure.code, "guidance_not_authorization");
  const expired = conformers({ authorization: "expired" });
  assert.equal(invoke(expired.facade, "implementation.admission.prepare", { atlas: { map_id: "FM-003", decision_id: "D" }, requested_outcome: { permitted_limitations: ["endpoint-unavailable"], forbidden_claims: [] }, envelope }).failure.code, "authority_expired");

  const authorized = conformers();
  const prepared = invoke(authorized.facade, "implementation.admission.prepare", { atlas: { map_id: "FM-003", decision_id: "D" }, requested_outcome: { permitted_limitations: ["endpoint-unavailable"], forbidden_claims: [] }, envelope });
  assert.equal(prepared.status, "success");
  assert.deepEqual(prepared.result.envelope, envelope);
  assert.equal(typeof prepared.result.envelope_digest, "string");
  assert.equal(authorized.calls.directive, 1);

  const omitted = invoke(authorized.facade, "implementation.admission.prepare", { atlas: { map_id: "FM-003", decision_id: "D" }, requested_outcome: { permitted_limitations: ["endpoint-unavailable"], forbidden_claims: [] }, envelope: { ...envelope, effect_bindings: [] } });
  assert.equal(omitted.failure.code, "authority_envelope_invalid");
  const incomplete = invoke(authorized.facade, "implementation.admission.prepare", { atlas: { map_id: "FM-003", decision_id: "D" }, requested_outcome: { permitted_limitations: ["endpoint-unavailable"], forbidden_claims: [] }, envelope: { ...envelope, target: undefined } });
  assert.equal(incomplete.failure.code, "authority_envelope_invalid");
  const extraEffect = invoke(authorized.facade, "implementation.admission.prepare", { atlas: { map_id: "FM-003", decision_id: "D" }, requested_outcome: { permitted_limitations: ["endpoint-unavailable"], forbidden_claims: [] }, envelope: { ...envelope, effect_bindings: [...envelope.effect_bindings, { effect: "deploy", binding: "approval:one" }] } });
  assert.equal(extraEffect.failure.code, "authority_effect_bindings_mismatch");
});

test("OwnerBoundaryService delegates admission and recovery only to Software Implementation and projects attributable blockers", () => {
  const admitted = conformers();
  const prepared = invoke(admitted.facade, "implementation.admission.prepare", { atlas: { map_id: "FM-003", decision_id: "D" }, requested_outcome: { permitted_limitations: ["endpoint-unavailable"], forbidden_claims: [] }, envelope });
  const result = invoke(admitted.facade, "implementation.admission.submit", prepared.result);
  assert.equal(result.result.admission.disposition, "admitted");
  assert.deepEqual(result.result.admission.authorized_routine_mechanics, envelope.routine_mechanics);
  assert.equal(admitted.calls.directive, 1);
  assert.equal(admitted.calls.admit, 1);

  const unknown = conformers({ admission: "unknown" });
  const unknownPrepared = invoke(unknown.facade, "implementation.admission.prepare", { atlas: { map_id: "FM-003", decision_id: "D" }, requested_outcome: { permitted_limitations: ["endpoint-unavailable"], forbidden_claims: [] }, envelope });
  const unknownResult = invoke(unknown.facade, "implementation.admission.submit", unknownPrepared.result);
  assert.equal(unknownResult.result.admission.disposition, "unknown");
  const restartedFacade = createStewardFacade(unknown.databasePath, unknown.owners);
  const blindRetry = invoke(restartedFacade, "implementation.admission.submit", unknownPrepared.result);
  assert.equal(blindRetry.failure.code, "admission_recovery_required");
  assert.equal(unknown.calls.admit, 1);
  const recovered = invoke(unknown.facade, "implementation.admission.recover", { correlation_id: "si:unknown" });
  assert.equal(recovered.result.recovery.disposition, "unknown");
  const unresolvedRetry = invoke(unknown.facade, "implementation.admission.submit", unknownPrepared.result);
  assert.equal(unresolvedRetry.failure.code, "admission_recovery_required");
  assert.equal(unknown.calls.admit, 1);
  assert.equal(unknown.calls.recover, 1);

  const settled = conformers({ admission: "unknown", recovery: "refused" });
  const settledPrepared = invoke(settled.facade, "implementation.admission.prepare", { atlas: { map_id: "FM-003", decision_id: "D" }, requested_outcome: { permitted_limitations: ["endpoint-unavailable"], forbidden_claims: [] }, envelope });
  invoke(settled.facade, "implementation.admission.submit", settledPrepared.result);
  const settlement = invoke(settled.facade, "implementation.admission.recover", { correlation_id: "si:unknown" });
  assert.equal(settlement.result.recovery.disposition, "refused");
  const settledReplay = invoke(settled.facade, "implementation.admission.submit", settledPrepared.result);
  assert.equal(settledReplay.result.admission.disposition, "refused");
  assert.equal(settled.calls.admit, 1);

  const blocked = conformers({ admission: "refused" });
  const blockedPrepared = invoke(blocked.facade, "implementation.admission.prepare", { atlas: { map_id: "FM-003", decision_id: "D" }, requested_outcome: { permitted_limitations: ["endpoint-unavailable"], forbidden_claims: [] }, envelope });
  const blocker = invoke(blocked.facade, "implementation.admission.submit", blockedPrepared.result);
  const projection = invoke(blocked.facade, "implementation.portfolio.project", { admission: blocker.result.admission });
  assert.equal(projection.result.observation.owner.kind, "software-implementation");
  assert.equal(projection.result.observation.condition, "blocked");
  const resume = invoke(blocked.facade, "implementation.admission.resume", { correlation_id: "si:refused" });
  assert.equal(resume.failure.code, "operation_unavailable");
});

test("the installed default facade exposes typed unavailable boundaries instead of substitute owners", () => {
  const facade = createStewardFacade("/tmp/steward-owner-boundary-unavailable.json");
  assert.equal(invoke(facade, "owner.bindings.focus", { binding_id: "binding:one" }).failure.code, "interaction_binding_unavailable");
  assert.equal(invoke(facade, "owner.bindings.resolve", { binding_id: "binding:one" }).failure.code, "interaction_binding_unavailable");
  assert.equal(invoke(facade, "owner.directives.authorize", { envelope }).failure.code, "standing_directive_unavailable");
  assert.equal(invoke(facade, "implementation.admission.submit", { envelope, envelope_digest: "digest" }).failure.code, "software_implementation_unavailable");
});
