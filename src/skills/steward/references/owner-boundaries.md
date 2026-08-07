# Steward owner boundaries

Load the section matching the requested owner outcome: semantic orientation, an interaction binding, an owner-bound Question or Answer, Directive evaluation, or implementation admission. All calls use the installed executable and result envelope from [Package Protocol](protocol.md#resolve-and-invoke).

## Semantic orientation and bindings

### Orient exact artifacts

Requests are:

```json
{
  "operation": "owner.frame.orient",
  "artifact": { "id": "frame:exact-id", "revision": "frame-revision:exact" }
}
```

Replace `frame` with `case`, `blueprint`, `prototype`, `rfc`, or `atlas`. Supply the exact stable identity and exact owner revision.

A successful owner result preserves common fields:

```text
artifact {id, revision}
represented_revision
currentness
condition
observed_at
evidence[]
limitations[]
```

It then carries owner-defined fields rather than a generic workflow status:

- Case: `status`, `knowledge[]`, `sources[]`.
- Frame: `status`, `outcome`, `open_questions[]`, `next_movement`.
- Blueprint: `status`, `readiness`, `open_questions[]`, `decisions[]`, `blockers[]`, `next_movement`, `missing_evidence[]`, `conflicting_evidence[]`.
- Prototype: `question`, `observations[]`, `verdict`, `locator`.
- RFC: `status`, `readiness`, exact `source` artifact.
- Atlas: `status`, `handoff`, `dependencies[]`, `proof[]`.

Preserve those owner-defined meanings and limitations verbatim.

The generated installed package currently has no real artifact owner endpoints. Typed failures such as `frame_orientation_unavailable` or `blueprint_orientation_unavailable` mean the named owner could not be reached; orient the Architect back to the supplied durable artifact and dedicated owner capability.

### Relay one explicit binding request

Create for a Space-focused interaction:

```json
{
  "operation": "owner.bindings.create",
  "purpose": "Continue the exact Frame boundary",
  "focus": { "kind": "space", "space_id": "space:agent-os" },
  "artifact": { "id": "frame:exact-id", "revision": "frame-revision:exact" }
}
```

Cross-Space focus is `{ "kind": "cross-space" }`. Existing bindings may be addressed only by exact ID:

```json
{"operation":"owner.bindings.resolve","binding_id":"binding:exact-id"}
```

```json
{"operation":"owner.bindings.focus","binding_id":"binding:exact-id"}
```

Create, resolve, and focus are distinct owner actions. They change binding-owner state while Frame or Blueprint retains its semantic work. The installed package returns `interaction_binding_unavailable` when the dedicated interaction cannot be opened.

## Questions, Answers, and Decisions

Link only an exact owner-attributable Question to a current Matter:

```json
{
  "operation": "matters.questions.link",
  "matter_id": "matter:exact-id",
  "expected_revision": 1,
  "question": {
    "owner": { "kind": "frame", "id": "frame:exact-id" },
    "locator": "question:exact-id",
    "revision": "question-revision:exact"
  }
}
```

Read owner state when its endpoint exists:

```json
{"operation":"owner.questions.project","question_locator":"question:exact-id"}
```

Submit one immutable Answer through the linked Question owner:

```json
{
  "operation": "matters.answers.submit",
  "matter_id": "matter:exact-id",
  "expected_revision": 2,
  "answer": {
    "id": "answer:caller-owned-stable-id",
    "body": "The Architect's exact answer"
  }
}
```

Steward relays the linked Question's exact owner, locator, and revision. It retains the Answer ID and attributable owner result while the owner retains immutable Answer content. An exact replay returns the original result; changed content or identity remains a distinct request.

The requesting owner closes a Question. `matters.questions.close` reconciles an exact terminal `resolved`, `superseded`, or `withdrawn` owner result; absent that endpoint it returns `question_owner_unavailable`. Preserve the owner's Decision locator and condition because Steward has no Decision mutation operation.

## Directive evaluation

Call `owner.directives.authorize` for a complete cumulative implementation envelope. Guidance returns `guidance_not_authorization`; admission requires current, applicable, matching authority.

The installed package has no real Standing Directive owner and returns `standing_directive_unavailable`. A new admission therefore waits for an exact current authority result.

## Implementation admission

Implementation admission is a strict two-call boundary: successful prepare, then submission of that prepare result's exact envelope and digest.

### Preconditions before package submission

Require all of these from exact current owners:

1. a current accepted Atlas `HandoffReady` or bounded `HandoffWithLimitations`, including exact Map/Decision, complete Feature/Work Item ownership, dependencies/convergence, obligations, limitations, forbidden claims, required effects, implementation authority, and a complete-consistent fresh reread;
2. one explicit implementation request and target covered by that handoff;
3. one complete cumulative envelope with every allowed routine mechanic, absent operation, invalidator, and required external/live Effect Binding visible;
4. one exact current ordinary approval or applicable Standing Grant for that same envelope; and
5. requested claims compatible with every handoff limitation.

Continue to Software Implementation submission only while every precondition remains satisfied; otherwise return the exact owner-supported blocker.

### Exact cumulative envelope

```json
{
  "outcome": "Bounded observable delivery outcome",
  "action": "software-implementation.admit",
  "target": { "kind": "work-item", "id": "WI-042" },
  "space_scope": { "kind": "space", "space_id": "space:agent-os" },
  "matter_id": "matter:exact-id",
  "consequences": ["local source edits", "tests", "commit", "non-force branch push", "draft PR update"],
  "monitoring_scope": { "kind": "work-item", "id": "WI-042" },
  "lifetime": { "kind": "one-action", "expires_at": null },
  "repository": "ArykLAnderson/agents-os",
  "path": "/exact/persistent/worktree",
  "base": "origin/master@exact-commit",
  "delivery_shape": "single_pr",
  "delivery": {
    "branch": "feature/exact-branch",
    "worktree": "/exact/persistent/worktree",
    "pull_request_base": "master"
  },
  "routine_mechanics": ["local source edits", "focused verification", "commit", "non-force branch push", "matching draft PR update"],
  "absent_operations": ["force push", "merge", "deployment", "release", "credentials", "production mutation"],
  "invalidators": ["successor Atlas Decision", "changed base", "changed branch or worktree", "scope or effect expansion"],
  "atlas": {
    "map_id": "FM-003",
    "decision_id": "EXACT-CURRENT-DECISION"
  },
  "authority": {
    "kind": "ordinary",
    "id": "approval:exact-visible-action"
  },
  "effect_bindings": [
    { "effect": "exact-external-effect", "binding": "effect-binding:exact-id" }
  ]
}
```

Envelope keys are closed. `target` is exactly `{kind,id}`. `space_scope.kind` is `space` with `space_id`, or `cross-space`. `monitoring_scope` is exactly `{kind,id}`. `lifetime` is exactly `{kind,expires_at}`. `delivery` is exactly `{branch,worktree,pull_request_base}`. `atlas` and `authority` are exact two-field objects. Every `effect_bindings` entry is exactly `{effect,binding}`, with no duplicate effect. Use `[]` when the Atlas handoff requires no external/live effects.

Build every value from the exact accepted handoff, current repository and worktree, current authority, and explicit requested consequences.

### Prepare

```json
{
  "operation": "implementation.admission.prepare",
  "atlas": {
    "map_id": "FM-003",
    "decision_id": "EXACT-CURRENT-DECISION"
  },
  "requested_outcome": {
    "permitted_limitations": ["exact accepted limitation compatible with the request"],
    "claims": ["exact claim the requested delivery would make"]
  },
  "envelope": {}
}
```

Use the full exact envelope above. Preparation asks the Atlas owner for a complete current handoff and the Directive owner for exact authorization. It returns the normalized `envelope`, `envelope_digest`, `atlas_handoff`, and `authorization` only if both owners admit their portions.

The default generated package contains no owner conformers. It therefore returns a typed owner unavailability (currently `atlas_handoff_unavailable` before Directive evaluation). The capabilities manifest also declares `standing_directive_unavailable` and `software_implementation_unavailable`. This result leaves admission at the unavailable owner boundary.

### Submit only after successful prepare

Pass exactly the successful `result.envelope` and `result.envelope_digest`:

```json
{
  "operation": "implementation.admission.submit",
  "envelope": {},
  "envelope_digest": "exact-digest-returned-by-prepare"
}
```

The submit request contains exactly `operation`, the returned `envelope`, and the returned `envelope_digest`. The installed package returns `software_implementation_unavailable` when this endpoint is absent.

A successful owner response has `admission.disposition` of `admitted`, `refused`, or `unknown`, plus exact `correlation_id`, `currentness`, `observed_at`, and `limitations`. `admitted` echoes the exact authorized routine mechanics; delivery coordination remains with Software Implementation.

### Unknown recovery and Portfolio projection

If submission returns an exact `unknown` admission, recover by its exact owner correlation:

```json
{
  "operation": "implementation.admission.recover",
  "correlation_id": "exact-owner-correlation-id"
}
```

Retain the unknown result and correlation until recovery reaches an exact owner disposition; one-use approval consumption remains unknown in the meantime.

Project an exact owner admission/blocker onto one Matter without copying delivery state:

```json
{
  "operation": "implementation.portfolio.project",
  "matter_id": "matter:exact-id",
  "admission": {
    "disposition": "refused",
    "correlation_id": "software-implementation-correlation:exact",
    "currentness": "owner-defined-currentness",
    "observed_at": "2026-08-06T10:00:00.000Z",
    "blocker": {
      "code": "authority-required",
      "owner": "software-implementation"
    },
    "limitations": []
  }
}
```

Project only the exact owner response. The result is a custody observation for later Portfolio composition; any delivery action returns to its owner and current authority.
