# Verification, Drift, and Needs Attention

## Feature verification plan

Build the final gate from the actual feature rather than a hardcoded global battery.

### Required repository health

Read project policy and run applicable:

- tests
- lint/format checks
- typecheck
- build/package/export checks

### Behavioral acceptance

Run black-box acceptance tests through public interfaces. Prefer observable behavior over source scans or implementation-coupled assertions.

### Manual E2E

Derive a mandatory matrix from accepted criteria and supported surfaces. For each required row:

- record exact build/integration SHA
- record platform, environment/device/browser, and app/build version
- document account/test-data setup
- document steps and result
- capture screenshots for meaningful states where appropriate
- preserve sanitized backend/persistence evidence when claimed
- record cleanup/teardown
- state what was not proven

An unexecuted required row blocks `PR READY` unless an explicitly authorized waiver is recorded with rationale and impact.

Compilation is not native E2E. Fixture display is not full product-path E2E when it bypasses the architecture under test.

### Deep automated review

Select reviewers according to risk. Give each substantive finding a stable ID and record its disposition. Broad review passes when:

- no unresolved critical/high finding remains
- no acceptance, security, or architectural-contract violation remains
- disagreements and rejected findings have rationale
- non-blocking tangible debt has a follow-up ticket
- review-driven changes are reverified

Unanimous approval is not required. Every substantive finding must be accounted for.

## Failure classification

Before dispatching a fixer, classify the failed gate:

- `feature-caused`
- `pre-existing`
- `environmental`
- `unrelated-subsystem`
- `unknown`

Use target-branch comparison, changed paths, affected subsystem, canonical docs, and prior evidence. When practical, rerun the specific failed command against a clean target worktree.

Only feature-caused failures grant automatic edit authority.

## Proactive investigation packet

A blocker or needs-attention item must contain:

- failure and reproduction
- classification and confidence
- feature impact
- evidence and relevant SHAs
- related specs, ADRs, plans, glossary terms, tickets, and history
- likely root cause
- recommended resolution
- exact proposed scope
- verification plan
- risks/tradeoffs
- alternatives
- specific human decision or action, if any

Do not hand the user an unexplained log and ask them to debug it.

## Fixer scope protocol

Before a fixer:

1. Record intent and `IN PROGRESS`.
2. Record starting SHA and expected/allowed scope.
3. Dispatch the appropriate existing writer or fresh specialist.
4. Inspect resulting commits and changed files.
5. Compare against allowed scope and root cause.
6. Revert/remove unsupported scope expansion through the responsible writer.
7. Rerun the affected gate on the resulting SHA.

Broad gate failure does not imply broad repository edit authority.

## Follow-up tickets

Create a follow-up ticket automatically when investigation reveals distinct implementation work that:

- preserves accepted intent
- has clear evidence and scope
- can be verified independently
- belongs in the tracker graph as blocking or deferred work

Include evidence, dependencies, proposed behavior, boundaries, and verification plan.

When the proposed work changes accepted intent, public contract, domain meaning, or an ADR, prepare the ticket/decision brief but move to `NEEDS ATTENTION` before publishing or changing the graph if the intent remains genuinely disputed.

## Invented requirements and drift

The drift gate exists to remove hallucinated requirements, not to make implementation evolution bureaucratic.

### Unsupported behavior

Default action: send it back for removal and reverify.

The implementer may justify it with canonical intent or concrete evidence. If the justification is weak or absent, remove it without escalating to the human.

### Credible disagreement

Enter `NEEDS ATTENTION` only when:

- the implementer provides a credible evidence-backed intent argument, and
- reviewers/coordinator still disagree whether it belongs, or
- removal would contradict another accepted feature contract.

Prepare the proactive investigation packet with a recommendation.

### Drift ledger

For each material drift, record:

- original requirement
- final behavior
- classification
- why it changed
- evidence
- authorization basis
- affected tickets/contracts
- verification
- canonical spec/docs status

State explicitly when no material drift exists. Include the ledger in the PR review summary and archived implementation report.

## Needs Attention propagation

Pause the affected ticket and dependency chain. Continue independent tickets only when their work cannot prejudice the unresolved decision.

Block integration or finalization when the decision affects a shared contract, feature acceptance, security boundary, or required platform behavior.

## Review ratchet and architectural recovery

### Review reconciliation checkpoint

After any initial, closure, integration, or security review returns a substantive accepted finding that prevents advancement, freeze fixer dispatch. Findings are proposals, not instructions; worker roles return an evidence packet and do not adjudicate architecture. The coordinator records for every substantive finding:

- stable ID and evidence; the frozen acceptance criterion, spec, or ADR it protects
- owning module, ticket, or seam, and whether observable intent changes
- boundary signals: a new module/caller/ownership/authority/trust/mutation/persistence/deployment/HITL seam, reopened invariant, multiplying special cases, or credible competing interpretations
- disposition: `local`, `later-ticket`, `intent-change`, or `rejected`, with explicit rationale for rejected or deferred work
- bounded verification plan

Do not dispatch a writer/fixer until every finding has a disposition; reviewer unanimity is unnecessary. If all accepted findings are bounded defects inside the documented seam, continue ordinary remediation or the active recovery attempt without `zoom-out`. Invoke `zoom-out` immediately for an ADR/spec contradiction, ticket ownership crossing, any new listed boundary, an invariant reopened after repair, spreading special cases, or genuine intent uncertainty. The checkpoint neither increments nor resets counters; only the documented failed-closure semantics do.

### Architecture baseline realignment gate

When the accepted resolution changes a frozen architecture assumption, shared inherited contract, dependency, ticket decomposition/ownership, or HITL boundary, read [architecture-baseline-realignment.md](architecture-baseline-realignment.md). Enter `NEEDS ATTENTION — BASELINE REALIGNMENT`; fence the affected transitive dependency chain and do not remediate, integrate, or dispatch against the old graph.

This gate is always human-owned. The coordinator prepares the recommendation and cascade matrix, but explicit approval is required for both the revised architectural highlights and inferred downstream ticket/DAG consequences. Approval of the immediate correction alone is insufficient. Preserve original inputs, then publish canonical docs, tracker contracts, immutable revised snapshots, and a new graph fingerprint as one workflow-level transaction. No solve attempt begins until publication is complete and reconciled.

Treat these as review-ratchet signals:

- a closure review reopens an accepted finding or the same invariant
- remediation introduces a blocker in a new module, caller, ownership, authority, trust, mutation, persistence, deployment, or HITL seam
- a reviewer requests work outside accepted ticket scope or dependency ownership
- branch-shaped special cases multiply instead of restoring one contract

Maintain `reviewRemediationCycles` per ticket. Increment it only when accepted review findings dispatch remediation and the next closure review fails to close the ticket. Rewording, reviewer fanout, or retries within the same remediation do not increment it. Two consecutive failed closure cycles mandate `zoom-out` before any third fixer; judgment may stop earlier.

Fence the writer and affected dependency chain and preserve a durable recovery packet in `zoom-out.md` with:

- ticket, coordinator/run, attempt, and writer-token identifiers
- candidate/base/result SHAs and exact commit lineage
- retained `reviewRemediationCycles`, separate `recoverySolveAttempts`, and timestamps
- review finding IDs, evidence, dispositions, and closure outcomes
- boundary movement and affected modules/callers/ownership/authority/trust/mutation/persistence/deployment/HITL seams
- accepted objectives, intents, scope, ownership, dependencies, and constraints
- finding classification as `local`, `later-ticket`, `intent-change`, or `rejected`
- accepted reconciliation seam, preserved/changed contracts, redesign scope, risks, and consolidated verification plan
- two-attempt recovery budget, current attempt number, per-attempt findings, and stop conditions
- tracker state and fenced dependency chain

Acceptance retains pre-zoom history. If contracts are unchanged, acceptance starts a distinct durable `recoverySolveAttempts` counter at 0. If architecture or downstream assumptions change, that counter starts only after the human-approved baseline revision is fully published and reconciled. Baseline deliberation/publication consumes no solve attempt. Each bounded solve attempt includes implementation, affected verification, and closure review. Attempt 1 is the coherent redesign. Attempt 2 is automatic only when attempt-1 closure accepts a local, non-obvious omission inside the documented seam and current baseline, without architecture movement, a new module/caller/ownership/authority/trust/mutation/persistence/deployment/HITL boundary, intent change, or special-case spread; it is narrowly limited to those findings, cannot reframe recovery, and receives focused verification plus consolidated closure.

Stop immediately as `NEEDS ATTENTION` for renewed boundary movement or intent uncertainty during either attempt. Architecture movement returns to human-owned baseline realignment rather than being absorbed into attempt 2. Stop after attempt 2 fails closure for any substantive accepted finding; there is no attempt 3. Reset `reviewRemediationCycles` and `recoverySolveAttempts` only after successful closure/integration as appropriate, never for superficial green tests, renamed findings, replacement writers, or local patches.
