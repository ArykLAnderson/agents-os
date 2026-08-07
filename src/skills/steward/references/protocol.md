# Steward package protocol

Load this reference only after the main skill has classified the request as custody, Portfolio, or exact owner-boundary work. It defines private invocation mechanics, not user-facing vocabulary or a response template. Execute these mechanics without progress narration. Keep requests, envelopes, operation names, stable identities, revisions, replay material, manifests, and raw failures solely as internal package-call state—not as implementation-report or status-summary metadata—unless the main skill's narrow disclosure exceptions apply. Owner-specific orientation, binding, Question, Directive, and implementation requests are in [Owner Boundaries](owner-boundaries.md).

## Resolve and invoke

The generated skill and package are siblings under one adapter's `generated/` directory. Starting from the absolute path of the `SKILL.md` that loaded this reference:

```sh
LOADED_STEWARD_SKILL_DIR="<absolute directory containing the installed steward/SKILL.md>"
STEWARD_SKILL_DIR="$(CDPATH= cd -- "$LOADED_STEWARD_SKILL_DIR" && pwd -P)"
STEWARD="$STEWARD_SKILL_DIR/../../packages/steward/bin/steward.mjs"
test -f "$STEWARD"
printf '%s\n' '{"operation":"capabilities"}' | node "$STEWARD"
printf '%s\n' '{"operation":"identity.resolve"}' | node "$STEWARD"
```

Resolve the physical directory with `pwd -P` because Codex and OpenCode may expose the skill through a symlink. Do not search `src/`, import `lib/steward.mjs`, use a canonical checkout, or guess a provider path. Run from any cwd. The package uses `STEWARD_STORE` when explicitly set; otherwise it resolves `${XDG_DATA_HOME:-$HOME/.local/share}/agents-os/steward.json`. Do not change that selection during an ordinary invocation.

Input is exactly one JSON object on standard input. Output is exactly one JSON object. Capture and parse this output as internal working state; do not paste it into an ordinary reply:

```json
{
  "schema": "steward-result@1",
  "status": "success",
  "operation": "identity.resolve",
  "result": {}
}
```

or:

```json
{
  "schema": "steward-result@1",
  "status": "refused",
  "operation": "identity.resolve",
  "failure": { "code": "...", "message": "..." }
}
```

Exit `0` means `success`; exit `2` means a typed refusal. Parse the envelope before making a claim. Never rewrite a refusal as success, absence, completion, or safe retry. `capabilities.result` must report protocol `steward-result@1`, version `1`, and the installed groups before further use. Retain the exact machine result internally, then translate it into the meaningful human outcome, blocker, conflict, or recovery step. A typed code is not the default wording for the user.

For a new capture replay key or other new caller-owned identifier, use `/usr/bin/uuidgen`; retain the exact resulting value with the request. Do not generate an ID ad hoc in model text.

## Custody requests

### Resolve the singleton and directory

```json
{"operation":"identity.resolve"}
```

The result returns `steward` and `directory`. `directory.spaces` is the exact current active/retired Space set and `directory.revision` is required by `spaces.create`. These are call inputs, not ordinary confirmation details.

### Create an explicitly requested Space

```json
{
  "operation": "spaces.create",
  "expected_directory_revision": 0,
  "space": { "id": "space:agent-os", "name": "Agent OS" }
}
```

Only create when the Architect explicitly selected the durable Space. Space IDs begin with `space:`. A stale directory returns `directory_revision_conflict`; reread and do not silently rename or redirect.

### Capture Intake, optionally with one Matter

With an explicit active home Space:

```json
{
  "operation": "intakes.capture",
  "replay_key": "capture:EXACT-UUID",
  "content": "The Architect's expressed intent, verbatim",
  "provenance": {
    "source": "conversation",
    "captured_by": "steward",
    "source_locator": "caller-supplied locator when one exists"
  },
  "space_id": "space:agent-os",
  "expected_space_revision": 1,
  "relevance_reason": "Why the expressed intent remains relevant",
  "owner_references": [
    { "kind": "frame", "id": "frame:exact-id" }
  ]
}
```

Without an explicit home Space, omit `space_id`, `expected_space_revision`, `relevance_reason`, `owner_references`, and `return_condition`. The result then has an immutable Intake and `matter: null`. Do not invent owner references; each is exactly `{kind,id}` and carries no copied owner state.

An unchanged replay key returns the original result with `replayed: true`; changed immutable content returns `intake_replay_conflict`. Do not retry changed content under the old key.

### Place a previously unplaced Intake

```json
{
  "operation": "matters.place",
  "intake_id": "intake:exact-id",
  "space_id": "space:agent-os",
  "expected_space_revision": 2,
  "relevance_reason": "Why the intent remains relevant here",
  "owner_references": [
    { "kind": "blueprint", "id": "blueprint:exact-id" }
  ],
  "return_condition": { "kind": "none" }
}
```

Placement is idempotent for an Intake already linked to a Matter. A retired Space returns `space_retired`.

### Read stable custody

```json
{"operation":"matters.read","matter_id":"matter:exact-id"}
```

```json
{"operation":"spaces.manifest","space_id":"space:agent-os"}
```

A Space manifest includes every still-relevant Matter under that Space, including under a retired Space. Keep the returned revisions internally for any mutation, but reread immediately before mutating. Confirm the resulting human consequence rather than announcing the revision or manifest identity.

### Transition a Matter

Deferral:

```json
{
  "operation": "matters.transition",
  "matter_id": "matter:exact-id",
  "expected_revision": 1,
  "transition": "deferred",
  "relevance_reason": "Current reason this intent remains relevant",
  "deferral_reason": "Why attention is intentionally deferred",
  "return_condition": {
    "kind": "time",
    "value": "2026-09-01T09:00:00.000Z"
  }
}
```

`return_condition.kind` is exactly `time`, `owner_event`, or `next_review`; `value` is an exact timestamp or owner-defined event/review identifier. Other transitions are `active`, `quiet`, `released` (or alias `release`), and `restored` (or alias `return`). Every transition requires the current `relevance_reason`. A released Matter is not in the still-relevant manifest; restoration makes it active and relevant again. Transition changes custody only.

## Portfolio requests

### Compose

Minimal honest composition:

```json
{
  "operation": "portfolio.compose",
  "scope": { "kind": "global" },
  "observations": []
}
```

Space scope is:

```json
{"kind":"space","space_id":"space:agent-os"}
```

Optional `as_of` is an ISO timestamp for evaluating `time` and `next_review` return conditions. Omit it to use call time.

An exact owner observation has this request shape:

```json
{
  "id": "observation:stable-owner-id",
  "matter_id": "matter:exact-id",
  "owner": { "kind": "blueprint", "id": "blueprint:exact-id" },
  "artifact": { "id": "blueprint:exact-id", "revision": "blueprint-revision:exact" },
  "represented_revision": "blueprint-revision:exact",
  "currentness": "owner-defined-currentness",
  "observed_at": "2026-08-06T10:00:00.000Z",
  "condition": "owner-defined-condition",
  "limitations": ["exact owner-reported limitation"]
}
```

Optional owner-returned fields are `event_id`, `blocker`, and:

```json
{
  "attention_support": {
    "bands": ["next-conversation"],
    "axes": {
      "human_needed": true,
      "independently_progressing": false,
      "observation_limited": false
    },
    "actions": ["Return to the exact Blueprint decision"]
  }
}
```

Never author this shape from inference. It must preserve an actual exact owner result. If no callable owner produced it, omit it and retain the resulting coverage gap.

An evidence-supported attention input is:

```json
{
  "matter_id": "matter:exact-id",
  "band": "next-conversation",
  "evidence_ids": ["observation:stable-owner-id"],
  "axes": {
    "human_needed": true,
    "independently_progressing": false,
    "observation_limited": false
  },
  "smallest_action": {
    "text": "Return to the exact Blueprint decision",
    "evidence_id": "observation:stable-owner-id"
  }
}
```

The package accepts only `urgent`, `next-conversation`, `briefing`, or `quiet`, and only when cited `attention_support` exactly supports that band, every true axis, and the action. Omit attention rather than infer it.

Full request shape:

```json
{
  "operation": "portfolio.compose",
  "scope": { "kind": "global" },
  "as_of": "2026-08-06T10:00:00.000Z",
  "observations": [],
  "attention": [],
  "namespace_context": {
    "namespace_id": "namespace:agent-platform",
    "mode": "filter"
  },
  "search": {
    "results": [
      {
        "id": "case:exact-id",
        "provenance": { "source": "casebook-search" },
        "represented_revision": "case-revision:exact",
        "condition": "partial"
      }
    ],
    "continuation": {
      "cursor": "owner-supplied-cursor",
      "limitations": ["eventually_convergent"]
    }
  }
}
```

Namespace mode is `filter` or `rank`; it cannot affect identity, visibility, authority, or Portfolio coverage. Search remains `not_established` for completeness.

### Read and render the result conservatively

The fields below determine what may be said; they are not a checklist to print. Render the supported meaning in concise ordinary language, retain evidence locators and view machinery internally, and mention a technical field only under the main skill's disclosure exceptions.

Use:

- `result.view.manifest.spaces[].matters[]` for represented still-relevant custody;
- `result.view.coverage.gaps` for missing, limited, unavailable, stale, unknown, or conflicting evidence;
- `result.view.returns[]` for `not_deferred`, `pending`, `satisfied`, or `uncheckable` return evaluation;
- `result.view.orientation.recommendations[]` only for evidence-supported band, axes, explanation, and smallest action;
- `result.view.orientation.indeterminate[]` for Matters without support;
- `result.comparison.status` for `no_baseline`, `unchanged`, `changed`, or `incomparable` and its exact limitations.

Do not describe a Matter omitted from a requested Space scope as globally absent. Do not convert a coverage gap into no blocker, no change, current, or complete.

### Read and acknowledge baselines

```json
{"operation":"portfolio.baselines.read"}
```

After the Architect explicitly acknowledges the exact rendered view, replay the exact original composition request as `view_request`:

```json
{
  "operation": "portfolio.acknowledge",
  "view_id": "view:exact-id",
  "view_request": {
    "scope": { "kind": "global" },
    "observations": [],
    "attention": []
  },
  "expected_baseline_revision": 0
}
```

Acknowledgement requires every represented owner observation to be re-observed identically. The default installed package currently has no owner endpoints, so a view with observations may be unavailable to acknowledge. Explain that the acknowledged baseline did not change and what the user can do next; keep the raw refusal code private unless it is needed for recovery or requested for audit. Do not strip observations to force acknowledgement. A non-reproducible view, baseline conflict, or another refusal leaves the baseline unchanged. A successful identical replay may return `replayed: true`, which is also internal plumbing by default.
