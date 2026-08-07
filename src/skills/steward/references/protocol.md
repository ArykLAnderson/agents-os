# Steward package protocol

Load this reference for a selected Custody or Portfolio branch. Owner-specific orientation, binding, Question, Directive, and implementation requests are in [Owner Boundaries](owner-boundaries.md).

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

Resolve the physical directory with `pwd -P` because Codex and OpenCode may expose the skill through a symlink. Invoke the installed sibling executable from any cwd. The package uses `STEWARD_STORE` when explicitly set; otherwise it resolves `${XDG_DATA_HOME:-$HOME/.local/share}/agents-os/steward.json`. Keep that store selection stable for the invocation.

Input is exactly one JSON object on standard input. Output is exactly one JSON object:

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

Exit `0` means `success`; exit `2` means a typed refusal. Parse the envelope and preserve its status exactly. `capabilities.result` must report protocol `steward-result@1`, version `1`, and the installed groups before further use.

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

Create the durable Space selected by the Architect. Space IDs begin with `space:`. On `directory_revision_conflict`, reread the directory and preserve the selected identity.

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

Without an explicit home Space, omit `space_id`, `expected_space_revision`, `relevance_reason`, `owner_references`, and `return_condition`. The result then has an immutable Intake and `matter: null`. Include only exact supplied owner references, each as `{kind,id}` without copied owner state.

An unchanged replay key returns the original result with `replayed: true`; changed immutable content returns `intake_replay_conflict` and requires a new caller-owned replay identity.

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

A Space manifest includes every still-relevant Matter under that Space, including under a retired Space. Retain returned revisions and reread immediately before mutation.

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

Build this shape from an exact callable-owner result. Without one, omit the observation and retain the resulting coverage gap.

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

The package accepts `urgent`, `next-conversation`, `briefing`, or `quiet` when cited `attention_support` exactly supports that band, every true axis, and the action. Unsupported attention remains omitted.

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

Namespace mode is `filter` or `rank` and affects search ordering or filtering while identity, visibility, authority, and Portfolio coverage remain unchanged. Search completeness remains `not_established`.

### Read and render the result conservatively

The fields below bound the meaning supported by the result:

Use:

- `result.view.manifest.spaces[].matters[]` for represented still-relevant custody;
- `result.view.coverage.gaps` for missing, limited, unavailable, stale, unknown, or conflicting evidence;
- `result.view.returns[]` for `not_deferred`, `pending`, `satisfied`, or `uncheckable` return evaluation;
- `result.view.orientation.recommendations[]` only for evidence-supported band, axes, explanation, and smallest action;
- `result.view.orientation.indeterminate[]` for Matters without support;
- `result.comparison.status` for `no_baseline`, `unchanged`, `changed`, or `incomparable` and its exact limitations.

Scope absence applies only within the requested scope. A coverage gap remains an explicit limit on blocker, change, currentness, and completion claims.

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

Acknowledgement requires every represented owner observation to be re-observed identically. The default installed package currently has no owner endpoints, so a view with observations may be unavailable to acknowledge. A non-reproducible view, baseline conflict, or refusal leaves the baseline unchanged and intact; a successful identical replay may return `replayed: true`.
