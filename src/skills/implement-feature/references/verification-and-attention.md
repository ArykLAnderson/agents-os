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

Treat these as review-ratchet signals:

- a closure review reopens an accepted finding or the same invariant
- remediation introduces a blocker in a new module, caller, trust boundary, or deployment seam
- a reviewer requests work outside accepted ticket scope or dependency ownership
- branch-shaped special cases multiply instead of restoring one contract

Maintain `reviewRemediationCycles` per ticket. Increment it only when accepted review findings dispatch remediation and the next closure review fails to close the ticket. Rewording, reviewer fanout, or retries within the same remediation do not increment it. Two consecutive failed closure cycles mandate `zoom-out` before any third fixer; judgment may stop earlier.

Fence the writer and affected dependency chain and preserve a durable recovery packet in `zoom-out.md` with:

- ticket, coordinator/run, attempt, and writer-token identifiers
- candidate/base/result SHAs and exact commit lineage
- cycle counter and timestamps
- review finding IDs, evidence, dispositions, and closure outcomes
- boundary movement and affected modules/callers/trust/deployment seams
- accepted objectives, intents, scope, ownership, dependencies, and constraints
- finding classification as `local`, `later-ticket`, `intent-change`, or `rejected`
- recommended reconciliation seam, preserved/changed contracts, redesign scope, risks, and consolidated verification plan
- tracker state and fenced dependency chain

Reset the counter only after a documented zoom-out recommendation is accepted, one coherent redesign cycle completes, and its consolidated closure review succeeds. A superficial green test, renamed finding, replacement writer, or local patch does not reset it. Recurrence after the redesign is `NEEDS ATTENTION`.
