---
name: feature-integration
description: Integrate one completed ticket wave or several completed branches into a feature integration branch, reconciling architectural seams and returning an integration SHA with focused evidence. Used by `implement-feature` after tickets are independently verified and reviewed.
user-invocable: false
---

<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

# Feature Integration

Integrate completed ticket branches while preserving the parent specification, ticket intent, domain contracts, and coherent module design.

This is coordinator-level integration work, not a generic merge helper and not the owner of the full feature lifecycle. It does not select new tickets, run final reporting, create/merge the feature PR, close trackers, or broaden scope to repair unrelated gates.

## Preconditions

Require:

- feature/keystone and accepted specification
- feature integration branch/worktree
- completed ticket branches, recorded base SHAs, approved commit IDs/ranges, and resulting SHAs
- ticket acceptance/review evidence
- dependency order
- approved baseline revision and graph fingerprint shared by every branch assignment
- current integration starting SHA

Every branch must be `READY TO INTEGRATE` under the owning `implement-feature` run.

## Process

1. Read the parent spec, active baseline revision/fingerprint, ticket graph, ticket descriptions, reviews, domain glossary, ADRs, and feature-level acceptance criteria.
2. Verify each assignment used that baseline, plus ticket base ancestry, approved commit range, resulting commits, and clean worktrees. Reject stale-baseline work, stale state, unexplained extra commits, or branch-tip-only evidence.
3. Integrate the completed wave in dependency order.
4. Delegate ordinary conflicts to `resolving-merge-conflicts`.
5. Detect integration failures: broken contracts, crossed seams, duplicated domain logic, branch-shaped special cases, incompatible assumptions, or shallow patches needed only to make integration green. Treat findings as proposals. For any substantive accepted blocker, freeze before improvising and return a packet with stable ID/evidence, protected criterion/spec/ADR, owning ticket/module/seam, observable-intent impact, boundary signals, proposed disposition/rationale, and bounded verification plan. The owning coordinator completes the review reconciliation checkpoint and dispositions every finding before any fixer dispatch.
6. Return an `ARCHITECTURAL_RECOVERY_REQUIRED` packet when two consecutive review-driven remediation cycles fail closure, a blocker moves to a new module/caller/ownership/authority/trust/mutation/persistence/deployment/HITL seam, reviewer demand crosses accepted ownership, intent becomes uncertain, or special cases spread/reopen an invariant. If the proposed correction changes frozen architecture or any downstream inherited contract/dependency/HITL boundary, mark `BASELINE_REALIGNMENT_REQUIRED` and identify the transitive impact; the owning coordinator must involve the human feature owner and publish a revised baseline before integration resumes. Integration must not improvise, mutate ticket scope, implement a recovery attempt, or permit a third ordinary local repair. A dedicated writer executes any coordinator-authorized attempt against the approved seam, baseline revision/fingerprint, token, and expected HEAD; integration resumes only after that result is independently closed.
7. Classify redesign:
   - **Internal:** preserves user-visible behavior, accepted spec, every inherited downstream contract/edge, ticket criteria, and domain meaning. The coordinator may authorize it.
   - **Potential intent drift:** appears unsupported, changes observable contracts, or has credible conflicting interpretations. Remove unsupported behavior by default; return a decision-ready finding only when credible evidence remains unresolved.
8. For an internal redesign, return a focused corrective brief under the owning approved ticket. Preserve reproducible integration state, state which contracts remain stable, and let the coordinator dispatch a fresh writer plus normal TDD, verification, and review. If a new graph node or edge is required, return `BASELINE_REALIGNMENT_REQUIRED` instead. The integration agent must not improvise the refactor.
9. Resume integration after the refactor lands.
10. Run focused smoke/integration checks for the newly combined wave.
11. Return the resulting integration SHA, included ticket SHAs, checks/evidence, drift observations, and unresolved risks to `implement-feature`.

## Write Ownership

Only one writer may modify the feature integration worktree at a time.

The integration role may perform mechanical merges and approved conflict resolutions. New production behavior, broad verification fixes, or cross-cutting refactors go to a dedicated writer with explicit scope.

## Scope and Verification

A broad failing check does not grant broad edit authority. Classify whether a failure is feature-caused, pre-existing, environmental, unrelated, or unknown and return the evidence to `implement-feature` for diagnosis/fixer routing.

Tie integration evidence to the resulting integration SHA. If HEAD changes, affected evidence becomes stale.

## Completion

Return:

- starting and resulting integration SHA
- approved baseline revision and graph fingerprint
- ticket branches/SHAs included
- conflicts and how they were resolved
- focused checks run
- architectural reconciliation/refactor tickets
- drift or needs-attention findings
- whether the wave is safe for dependent tickets

Do not mark tracker tickets closed or the feature `PR READY`; the owning coordinator does that.
