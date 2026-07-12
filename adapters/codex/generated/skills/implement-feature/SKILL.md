---
name: implement-feature
description: Coordinate end-to-end implementation of an accepted feature ticket graph or keystone. Use when the user asks to implement a feature, finish a keystone, execute all tickets/slices, or implement and merge a multi-ticket effort. Runs bounded waves of ticket writers, independent review/fix loops, incremental feature integration, feature-level verification, archival implementation reporting, one final PR, and optional merge. Requires an accepted ticket graph; use `to-spec` and `to-tickets` first when scope is not yet decomposed.
user-invocable: true
argument-hint: "<ticket-graph | keystone | feature-map> [--merge]"
---

<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

# Implement Feature

Coordinate a complete accepted feature while keeping implementation, review, integration, and reporting in their proper skills.

This is a **thin model-driven coordinator**. It owns durable intent, assignments, evidence reconciliation, gates, tracker/PR lifecycle, and escalation. It should not become the fallback production-code writer.

## Preconditions and Routing

Require an accepted ticket graph, keystone, or equivalent feature map containing:

- feature goal and acceptance criteria
- atomic vertical tickets
- dependency edges
- scope boundaries
- canonical spec/ADR references

If the graph does not exist or the feature intent is unsettled, route through `engineering-workflow`, which may invoke `grill`, `to-spec`, and `to-tickets`. Do not silently decompose the feature inside this workflow.

Use:

- `ticket-executor` for one ticket writer
- `feature-integration` for integrating completed ticket branches and reconciling seams
- `resolving-merge-conflicts` for ordinary merge/rebase conflicts
- `zoom-out` when integration reveals incompatible intentions or repeated local fixes
- `verification` for evidence discipline
- `implementation-report` for the final archival report bundle
- `slice-build` only for local markdown milestones where tracker tickets are intentionally inappropriate

## Execution Authority

Default stop gate: **PR READY**.

If the user says “implement and merge,” passes `--merge`, or otherwise explicitly requests end-to-end merge, continue through checks, merge, tracker finalization, and cleanup without asking again for routine authorization.

Never bypass failing acceptance evidence or protected-branch/worktree policy.

## Durable Coordinator State

Before dispatching work, create the feature record under the repository’s shared home, outside disposable worktrees:

```text
<repo>/.agent/implement/<feature>/
  feature.md
  graph.md
  integration.md
  drift.md
  events.md

  <ticket>/
    state.md
    assignment.md
    evidence.md
    review.md
```

Use stable identifiers such as `keystone-44` and `ticket-115`, not mutable title slugs. Keep `.agent/` local/ignored unless project policy says otherwise.

Only the `implement-feature` coordinator writes this shared state. Child agents return results and write code/evidence in their assigned worktrees; they do not mutate coordinator state.

Treat state as durable **intent and history**, not unquestionable truth:

1. Before a side effect or dispatch, mark it `IN PROGRESS` and append an event.
2. Perform the action.
3. Reconcile against git, worktrees, child status, GitHub/PR state, and evidence.
4. Mark it `DONE`, `READY TO INTEGRATE`, `INTEGRATED`, `BLOCKED`, `NEEDS ATTENTION`, `FAILED`, or `CANCELLED`.

Every feature run receives a unique coordinator ID. Every ticket attempt receives a unique attempt ID, recorded starting HEAD, and active-writer token. Before replacing a stalled writer, cancel/interrupt or explicitly fence the prior attempt and record that it no longer has commit authority. A writer must confirm its attempt ID and expected starting/current HEAD before editing and again before committing. Never allow two live attempts to write the same ticket branch/worktree.

Local state alone is not a sufficient ownership signal. Publish and maintain a tracker-visible feature claim so other chats, machines, and work-selection passes can see that the keystone is active. On resume, reconcile every nonterminal state and tracker claim before launching new work.

Read [references/state-and-recovery.md](references/state-and-recovery.md) and use the bundled state templates.

## Process

### 1. Load and freeze accepted inputs

Read completely:

- feature/keystone and every ticket
- dependency graph
- canonical specification
- ADRs and plans linked by the feature
- domain glossary/context
- repository/worktree/testing instructions

Capture immutable initial snapshots for the later report archive. Record canonical URL/path, source revision, content digest, capture time, and graph fingerprint; a mutable source reference alone is insufficient. Record the accepted graph in `graph.md`. Any later source mutation is classified as an authorized correction, post-freeze drift, or untrusted mutation before it can affect execution.

Do not reinterpret unchecked publication-template boxes as live tracker state when GitHub/local tracker evidence says the work already landed. Reconcile sources explicitly.

### 2. Claim the feature and reject duplicate execution

Before creating worktrees or dispatching writers:

1. Inspect the keystone/feature issue, child issues, open PRs, remote branches, shared coordinator state, and tracker comments/status for an existing implementation claim.
2. Treat a claim renewed within the last 24 hours as fresh by default. If another fresh claim exists, do not start, resume, or dispatch the feature; report who/what claimed it, the last heartbeat, and continue looking for other work when work selection is the caller's goal.
3. Never take over merely because a claim is older than 24 hours. Reconcile its coordinator/session status, PRs, branches, worktrees, commits, and latest tracker activity. If active work remains plausible, ask for direction or mark `NEEDS ATTENTION`. If the prior run is demonstrably abandoned, fence it, explain the takeover in the tracker, and issue a new coordinator ID.
4. Publish a machine-readable claim comment on the keystone or primary feature issue before the first implementation side effect. Include coordinator ID, `IN PROGRESS`, UTC start and heartbeat timestamps, feature branch/worktree when known, durable state path, and the 24-hour freshness rule. Store the comment ID/URL in `feature.md` so the same comment can be edited rather than creating heartbeat noise.
5. Apply the repository's existing in-progress project status or label when available. If the tracker has no equivalent and repository policy permits label management, create/use a plainly named `in-progress` label so ordinary issue lists expose active ownership without parsing comments. Do not invent a parallel status taxonomy when the tracker already has one; the claim comment remains the portable source of coordinator identity and freshness.
6. Renew the claim at least once every 12 hours while active and at every meaningful phase boundary or ticket-wave integration. Update the tracker-visible state to `VERIFYING`, `REPORTING`, `PR READY`, `BLOCKED`, or `NEEDS ATTENTION` when applicable.
7. When dispatching a ticket, publish the coordinator ID, ticket attempt ID, UTC assignment time, and active branch/worktree on that ticket using the same project-native status mechanism. Clear or finalize the ticket claim when it is integrated, cancelled, failed, or fenced.

A work-discovery or keystone-review pass must perform this collision check before recommending a feature. Freshly claimed work is already underway, not available work.

### 3. Establish feature integration topology

Create or reuse:

- one feature integration branch and worktree based on the intended target
- one isolated ticket branch/worktree per dispatched ticket
- no ticket-level PRs

Record target ref/SHA, feature branch, integration worktree, tracker URLs, and merge mode in `feature.md` and `integration.md`.

Never implement directly in protected release worktrees. Never allow concurrent writers in the feature integration worktree.

### 4. Select a bounded ticket wave

Find tickets whose dependencies are satisfied and whose contracts are stable enough to implement.

Choose a model-selected bounded wave:

- normally 1–3 concurrent ticket writers
- parallelize only genuinely independent work
- sequence seam-defining tickets before dependents
- reduce concurrency when write scopes, schemas, public contracts, or test infrastructure overlap

Record the chosen wave and rationale before dispatch.

### 5. Dispatch ticket writers

For each ticket:

1. Create/verify its isolated worktree from the current feature integration SHA.
2. Write `assignment.md` with ticket, allowed scope, unique attempt ID, active-writer token, starting SHA, acceptance criteria, canonical references, validation expectations, and stop rules.
3. Mark ticket `IN PROGRESS`.
4. Launch one primary writer with the `ticket-executor` skill. Require it to echo the attempt ID/start SHA and return a structured result containing result SHA, exact commit range, command/observation evidence, exit status, timestamps, environment, and artifact paths/digests.
5. Async/background execution is allowed when the work is independent; retain child run/session IDs.

The parent coordinates. It does not take over production implementation because a writer needs another pass.

### 6. Reconcile writer results

When a writer returns or stalls:

- inspect child status/transcript
- inspect worktree status, commits, and diff
- verify claimed commands/evidence
- preserve valid partial progress
- resume the same writer when continuity helps
- fence/cancel the old attempt before replacing it
- replace it with a fresh writer when context or approach is corrupted

Retry judgment is model-governed, but review remediation has a deterministic floor. Record an explicit `reviewRemediationCycles` counter in ticket state; increment it when an accepted review finding causes a writer remediation and the subsequent closure review still does not close the ticket. Judgment may invoke `zoom-out` earlier, but no third fixer is permitted after two consecutive failed closure cycles.

A writer result is not ticket completion.

### 7. Review and remediate tickets

`implement-feature` owns independent ticket review.

1. Mark ticket `REVIEWING`.
2. Launch focused read-only reviewers selected by risk. Give every substantive finding a stable ID.
3. Synthesize findings and record a disposition for each ID: accepted, rejected with rationale, fixed, follow-up, or needs attention.
4. Send accepted fixes back to the same ticket writer.
5. Re-run affected verification.
6. Account explicitly for rejected or conflicting findings.
7. Before another fixer, invoke `zoom-out` when the counter reaches two failed closure cycles, a blocker moves to a new module/caller/trust/deployment seam, reviewer demand crosses ticket or dependency ownership, or special cases spread/reopen an invariant. Do not automatically accept a technically valid finding into the wrong ticket.
8. Fence the active writer and affected dependency chain, snapshot candidate/review lineage, write durable `zoom-out.md`, and record tracker-visible recovery state. Authorize at most one coherent redesign cycle from the recommendation, then run one consolidated risk/closure review. Recurrence becomes `NEEDS ATTENTION`.

Do not require unanimous reviewer approval. A ticket may advance when:

- no unresolved critical/high finding remains
- no acceptance, security, or architectural-contract violation remains
- rejected findings have rationale
- review-driven changes are reverified

Mark the ticket `READY TO INTEGRATE` only after its acceptance evidence and review converge.

### 8. Integrate every completed wave

After each wave reaches `READY TO INTEGRATE`, invoke `feature-integration`.

The integration workflow should:

- verify each ticket’s recorded base SHA, approved commit IDs/range, and ancestry; reject unexplained extra commits or branch-tip-only claims
- incorporate only the approved ticket commit range in dependency order
- delegate ordinary conflicts to `resolving-merge-conflicts`
- detect crossed seams or incompatible assumptions
- route focused refactors to a fresh writer rather than improvising in the merger
- run focused integration smoke checks
- return the resulting feature integration SHA and evidence

Record the integration SHA and mark included tickets `INTEGRATED`. Unlock the next dependency wave from that SHA.

Do not give a broad merger agent authority to implement unrelated fixes, run the entire final lifecycle, or push scope outward.

### 9. Diagnose verification failures before fixing

For ticket, integration, local acceptance, CI, or manual E2E failures, classify first:

- `feature-caused`
- `pre-existing`
- `environmental`
- `unrelated-subsystem`
- `unknown`

Read [references/verification-and-attention.md](references/verification-and-attention.md).

Before escalating, proactively inspect relevant specs, ADRs, plans, glossary terms, related tickets, git history, base-branch behavior, and prior findings. A blocker must arrive with a tangible recommended resolution, not a request for the human to debug from scratch.

Only feature-caused failures grant automatic fixer authority. Baseline or investigate the others. Before every fixer, record starting SHA and allowed scope; afterward compare commits/files and reverify.

Classify discovered work as `mandatory-to-preserve-contract`, `optional-debt`, or `intent-change`. Only mandatory work may join the active graph automatically, with a bounded ticket contract and recorded graph revision. Optional debt is deferred; intent changes require the drift/attention policy. Create follow-up tickets with evidence, dependencies, scope, and verification plan.

### 10. Remove invented requirements and track legitimate drift

Compare integrated behavior against initial accepted specs/tickets throughout execution and at finalization.

If behavior appears invented or unsupported:

1. Send it back to the responsible writer for removal.
2. Allow the implementer to justify it with concrete canonical intent or evidence.
3. If no credible justification exists, remove it and reverify.
4. Enter `NEEDS ATTENTION` only when the implementer presents a credible intent argument and reviewers/coordinator still cannot reconcile whether it belongs.

Do not burden the human with obvious hallucinated scope.

Maintain `drift.md` containing original requirement, final behavior, classification, rationale, evidence, authorization basis, affected tickets/contracts, verification, and canonical-doc update status. State explicitly when no drift exists.

### 11. Build the feature verification plan

Before final verification, record a feature-specific plan combining:

1. repository-mandated tests, lint/format, build, and typecheck
2. every ticket’s acceptance checks
3. model-selected integration checks based on actual crossed seams
4. black-box feature acceptance tests
5. a required surface/platform E2E matrix derived from accepted criteria and supported surfaces; each row records build SHA, environment/device, account/data setup, steps, result, artifacts/screenshots where appropriate, and cleanup
6. risk-selected deep automated reviews
7. advisory broad checks that do not automatically grant edit authority

Run the plan against the exact feature integration SHA. If fixes change HEAD, invalidate affected evidence and rerun it.

The feature is not ready while substantive deep-review findings, undocumented platform gaps, or required manual acceptance remain unresolved.

### 12. Create the archival implementation report

After integrated behavior is verified, invoke `implementation-report` in Showcase/archive mode.

The report belongs in the canonical docs repository, not the code feature branch. Create an isolated docs worktree/branch and archive bundle containing:

- HTML report and local assets
- architecture diagrams generated with Pi’s native `imagegen`
- screenshots and manual E2E evidence
- verification and review evidence
- initial accepted spec/ticket/graph snapshots
- final amended spec/ticket/graph snapshots
- outcomes, integration SHA, drift ledger, and provenance manifest

Open one docs PR. Record a provenance tuple of `(code PR head SHA, docs PR head SHA, archive manifest digest)` in both PRs. Any member change invalidates `PR READY` and requires report/PR-body regeneration and revalidation.

If the current harness cannot invoke Pi’s native `imagegen`, hand the report stage to a Pi-capable report worker. Do not silently omit required diagrams or substitute a wrapped model CLI.

Read [references/report-and-finalization.md](references/report-and-finalization.md).

### 13. Open the final feature PR

Push the feature integration branch and open one feature-level PR to the target branch. Ticket PRs are unnecessary.

The PR body must include:

- feature/keystone and included tickets
- exact integration SHA
- acceptance and verification summary
- manual E2E/platform status
- deep-review outcome
- specification-drift summary or explicit “no drift”
- unresolved risks/follow-ups
- archived implementation-report docs PR

Wait for PR checks and confirm they apply to the current head SHA. Route feature-caused failures through the diagnosis/fix/reverification loop.

### 14. Reach `PR READY`

When the code PR and docs archive PR are current and required gates pass:

- mark feature `PR READY`
- transition integrated tickets to `DONE` and close all non-keystone tickets
- comment each ticket with feature PR, integration SHA, evidence summary, and docs-report PR
- update the tracker-visible claim to `PR READY`, link both PRs, and stop active heartbeats; use the repository's review status if available
- update keystone checklist/status
- keep the keystone open until merge

If later changes invalidate a closed ticket’s criteria, the code PR is closed/abandoned/superseded, or the recorded integration commit is no longer represented by the active PR/target, reopen every affected ticket and reconcile the keystone. Create a new ticket only for genuinely distinct work.

Default execution stops here.

If the user cancels or the feature PR is intentionally abandoned, mark the feature `CANCELLED`, preserve the archive/state record, reopen affected tickets, update and release the tracker-visible claim, remove the active `in-progress` status/label when applicable, and clean or retain branches/worktrees according to explicit repository policy.

### 15. Merge mode

When merge authority was granted:

1. Confirm code PR head, approvals/checks, and docs report are current.
2. Merge according to repository branch-flow policy.
3. Verify the target branch contains the approved feature head/merge result.
4. Merge or finalize the docs archive PR according to docs policy.
5. Close the keystone after all landing criteria are satisfied.
6. Record final target and docs SHAs.
7. Finalize the tracker-visible claim as `DONE`, remove the active `in-progress` status/label when applicable, and retain the completion timestamp and landed PR/SHA in the claim comment.
8. Clean ticket/feature worktrees and branches according to repository policy.
9. Mark feature `DONE`.

## Needs Attention

`NEEDS ATTENTION` is a decision-ready state, not a raw failure bucket.

Use it only when the coordinator has investigated and cannot safely reconcile credible competing interpretations, contractual intent, risky scope expansion, or an external/manual decision.

Continue independent tickets that cannot prejudice the pending decision. Block affected dependencies and finalization when shared contracts or feature acceptance are uncertain.

## Completion Report

Return concisely:

- feature/keystone
- final state (`PR READY`, `DONE`, `NEEDS ATTENTION`, `BLOCKED`, `FAILED`)
- ticket outcomes and closed/reopened status
- feature and target SHAs
- verification/manual E2E/deep-review outcome
- code PR and docs report PR
- drift summary
- cleanup status
- durable state path
