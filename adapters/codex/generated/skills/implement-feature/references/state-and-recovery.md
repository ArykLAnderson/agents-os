# State and Recovery Protocol

The coordinator state is a durable document record of intent, transitions, and reconciled evidence. It is not a workflow engine and it is not automatically authoritative over git or the tracker.

## Location

Resolve the shared repository home rather than a disposable worktree. Store:

```text
<repo>/.agent/implement/<feature>/
```

For bare-repository worktree layouts, use the project home containing the common git directory and sibling worktrees.

Use stable identifiers:

- `keystone-44`
- `feature-frontier-lesson`
- `ticket-115`
- `local-ticket-003`

Avoid title-only slugs that change when tracker titles are edited.

## Single-writer rule

Only the `implement-feature` coordinator writes shared state.

Child agents may write implementation and test artifacts in their worktrees. They return results to the coordinator, which reconciles claims and updates state. Never let parallel children mutate the same feature or ticket state documents.

## Tracker-visible claims and leases

The local feature record prevents accidental duplication only on one shared filesystem. The tracker is the cross-chat and cross-machine coordination surface.

Before implementation begins, assign a unique coordinator ID and inspect the keystone/feature issue for machine-readable claim comments, project status, labels, open PRs, and recent implementation activity. Also reconcile remote branches, worktrees, local coordinator records, and child sessions when available.

The portable claim is one editable tracker comment containing:

```text
<!-- agent-os:implement-feature-claim:v1 -->
Coordinator: <unique ID>
State: IN PROGRESS
Started: <UTC timestamp>
Heartbeat: <UTC timestamp>
Fresh for: 24 hours
Feature branch/worktree: <ref/path or pending>
Coordinator state: <path or unavailable>
```

Store its comment ID/URL in `feature.md`. Prefer editing this comment for heartbeat/state changes over posting repeated comments. Apply an existing project-native `in-progress` status or label when available.

Freshness and collision rules:

- A claim with a heartbeat less than 24 hours old is fresh by default. Another coordinator or work-discovery pass must skip it.
- Renew at least every 12 hours and at meaningful phase transitions or wave integrations.
- Age alone never authorizes takeover. For an older claim, inspect sessions, PRs, branches, worktrees, commits, and tracker activity.
- If active work remains plausible, ask for direction or mark `NEEDS ATTENTION` rather than creating a competing writer.
- If abandonment is demonstrated, fence the prior coordinator/attempts, explain the takeover in the claim, and issue a new coordinator ID.
- Record `PR READY`, `DONE`, `CANCELLED`, `FAILED`, `BLOCKED`, or `NEEDS ATTENTION` visibly. Remove active status/labels when ownership ends, but preserve timestamps and links as history.

When a ticket enters an active wave, give it a tracker-visible assignment with coordinator ID, ticket attempt ID, UTC assignment/heartbeat, and branch/worktree. Finalize or clear that assignment when integrated, fenced, cancelled, or failed.

## Feature states

Recommended states:

- `INITIALIZING`
- `IN PROGRESS`
- `VERIFYING`
- `REPORTING`
- `PR READY`
- `MERGING`
- `NEEDS ATTENTION`
- `BLOCKED`
- `FAILED`
- `CANCELLED`
- `DONE`

## Ticket states

Recommended states:

- `PENDING`
- `READY`
- `IN PROGRESS`
- `VERIFYING`
- `REVIEWING`
- `READY TO INTEGRATE`
- `INTEGRATED`
- `NEEDS ATTENTION`
- `BLOCKED`
- `FAILED`
- `CANCELLED`
- `DONE`

## Baseline revisions

The initial accepted inputs remain immutable. Record an active baseline revision ID and graph fingerprint in `feature.md`, `graph.md`, and every ticket assignment.

When an explicitly human-approved architecture correction changes frozen assumptions, preserve the prior revision and add an append-only revision containing the proposal, cascade analysis, approval evidence, canonical source revisions/digests, revised ticket snapshots, and new graph fingerprint. Follow [architecture-baseline-realignment.md](architecture-baseline-realignment.md) for the canonical `agent-os-baseline-manifest-v1` fingerprint and approval-binding contract; use the bundled baseline revision and approval templates. Keep the affected chain blocked until canonical docs, tracker contracts, dependency edges, snapshots, and coordinator state agree. A partially published revision is not active.

Approval evidence must bind approver identity/authority and decision source/time to the exact proposal digest, cascade digest, manifest digest, and candidate graph fingerprint. Assignments, reviews, integrations, and verification tied to an older revision are stale unless the cascade analysis explicitly marks them still applicable. Never infer approval of downstream contract changes from approval of only the immediate correction.

## Attempt fencing

Each ticket assignment has one active attempt ID and writer token. Record the approved baseline revision, graph fingerprint, expected starting SHA, and current branch HEAD.

Before replacing a writer:

1. interrupt/cancel it when possible;
2. mark its token fenced in ticket state;
3. verify the worktree/branch HEAD and preserve partial work;
4. issue a new attempt ID/token;
5. require the new writer to verify the token and HEAD before editing/commit.

A result from a fenced attempt may be inspected but must not be integrated without explicit reconciliation. Never run competing live writers in the same ticket worktree.

## Intent-before-action protocol

Before any side effect:

1. Update current state to `IN PROGRESS` or the relevant transitional state.
2. Record intended action, starting SHA, assigned agent/run ID, worktree, and expected evidence.
3. Append an event.
4. Perform the action.
5. Inspect external facts.
6. Record evidence and resulting SHA.
7. Move to the next stable state.

If the process dies between steps 4 and 6, the record correctly says what was intended without falsely claiming success.

## Events

`events.md` is append-only and concise. Each event should record:

```text
Timestamp
Feature/ticket
From state → to state
Intent/action
Agent/session ID when applicable
Starting/resulting SHA
Evidence paths or tracker links
Reason
```

Current state documents remain concise; the event log preserves transition history.

## Authority hierarchy

When records disagree, use this order:

1. the latest fully published, explicitly human-approved baseline revision defines current intent; immutable predecessor snapshots preserve historical intent and provenance;
2. git objects/ancestry and worktree facts define code state;
3. tracker and PR APIs define remote workflow state;
4. command/manual evidence keyed to a SHA defines verification state;
5. coordinator documents explain interpretation and intent but cannot override missing facts.

A tracker checkbox does not prove ancestry. A commit does not prove acceptance. A passing command without the tested SHA/environment is incomplete evidence. Unknown or contradictory facts block advancement until reconciled.

Evidence records should include attempt ID, commit SHA, command/observation, exit/result, timestamp, environment, artifact path, and digest when practical.

## Resume reconciliation

On resume, do not trust nonterminal state blindly.

Reconcile:

- worktree existence and cleanliness
- branch and HEAD SHA
- expected commit ancestry
- child agent/session status
- local/remote branch state
- tracker issue state, claim comment, claim freshness, and coordinator identity
- active baseline revision, graph fingerprint, approval evidence, canonical source digests, and agreement with tracker dependencies
- feature/docs PR state and head SHA
- validation evidence and the SHA it covers
- manual E2E artifacts

Examples:

- `IN PROGRESS`, child finished, clean worktree with commit → inspect result, then advance.
- `IN PROGRESS`, child gone, dirty worktree → preserve diff, diagnose, then resume or replace writer.
- `READY TO INTEGRATE`, commit already ancestor of feature branch → mark `INTEGRATED` after evidence reconciliation.
- `PR READY`, PR head differs from recorded SHA → invalidate readiness and return to verification/reporting.

## Retry policy

Retry decisions are model-governed.

Prefer:

- resume the same writer when it has useful context and a viable path
- replace with a fresh writer when context is corrupted or the approach is stuck
- preserve valid commits/diffs rather than restarting blindly
- stop when repeated attempts provide no new evidence or intent becomes uncertain

Record every attempt and why it was resumed, replaced, or stopped.

## Recovery safety

Never recover by:

- resetting an unknown dirty worktree without archiving/understanding it
- assuming a branch is merged from a ticket checkbox
- treating an open PR as proof its current head passed checks
- marking manual E2E complete from compilation
- accepting a stale/fenced writer result or old-baseline assignment without reconciliation
- recreating missing state by inventing prior decisions
- treating reviewer consensus, green tests, or approval of an immediate correction as human approval of inferred downstream architecture changes
- leaving tickets closed after the feature PR is abandoned or no longer contains their integration commit

Git, GitHub/local tracker state, and evidence are facts. State documents explain the coordinator’s intent and reconciled interpretation of those facts.
