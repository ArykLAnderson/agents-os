---
name: zoom-out
description: Architectural recovery maneuver for an agent trapped in locally plausible fixes or incompatible intentions. Restate objectives, map the architecture, and find the correct reconciliation seam.
user-invocable: true
---

# Zoom Out

`zoom-out` is the heavyweight escalation from the universal review reconciliation checkpoint. It is not required for clearly same-seam local omissions; pause local problem-solving when findings cross boundaries, contradict governing intent, spread special cases, or repeated fixes fail closure.

## Mandatory triggers

Invoke this maneuver before another fixer when any of these occurs:

- two consecutive review-driven remediation cycles on one ticket fail closure
- a checkpoint finds an ADR/spec contradiction, ticket ownership crossing, genuine intent uncertainty, or a new module, caller, ownership, authority, trust, mutation, persistence, deployment, or HITL boundary
- reviewer demand crosses accepted ticket scope or dependency ownership
- special cases spread or reopen the same invariant

This is a deterministic floor; sound judgment may trigger it earlier.

## Procedure

1. Freeze the active writer and affected dependency chain; do not dispatch another fixer.
2. Snapshot candidate and review lineage, including SHAs, finding IDs, dispositions, remediation-cycle count, and observed boundary movement.
3. Create a durable `zoom-out.md` in the owning workflow state.
4. Map governing objectives, accepted intents, modules/callers, ownership, dependency direction, and real constraints using `codebase-design` vocabulary.
5. Disposition every finding as `local`, `later-ticket`, `intent-change`, or `rejected`, with evidence and rationale. Do not automatically absorb technically valid work into the wrong ticket.
6. Identify the reconciliation seam and return a concrete recommendation stating contracts preserved, contracts changed, and verification required.
7. Determine whether the recommendation preserves the frozen architecture and every downstream inherited contract. If it changes a spec/ADR assumption, shared boundary, dependency, ticket decomposition/ownership, or HITL gate, return `BASELINE_REALIGNMENT_REQUIRED` with the proposed invariant and transitive ticket/DAG impact. The owning workflow must enter `NEEDS ATTENTION`, involve the human feature owner, and follow its architecture-baseline realignment protocol; this skill cannot authorize the change.
8. Retain pre-zoom history. For a contract-preserving internal seam, acceptance may start a distinct durable `recoverySolveAttempts` counter at 0. For architecture movement, start that counter only after explicit human approval and complete publication of the revised canonical docs, tracker contracts, immutable snapshots, baseline revision, and graph fingerprint. Record the accepted seam, budget, current attempt, findings, and stop conditions in `zoom-out.md`.
9. Authorize at most two bounded solve attempts within that seam and active baseline; each consists of implementation, affected verification, and closure review. Attempt 1 is the coherent redesign.
10. If attempt-1 closure finds only a local, non-obvious omission within the documented seam—with no architecture movement, new module, caller, ownership, authority, trust, mutation, persistence, deployment, or HITL boundary, intent change, or special-case spread—attempt 2 is automatically allowed. Scope it narrowly to accepted attempt-1 closure findings; it may not broaden or reframe the recommendation. Run focused verification and consolidated closure.
11. Return `NEEDS ATTENTION` immediately for renewed boundary movement or intent uncertainty during either attempt. Architecture movement returns to human-owned baseline realignment rather than being absorbed into attempt 2. Stop when attempt 2 fails closure on any substantive accepted finding; there is no attempt 3.

Do not implement the redesign here. This is a recovery and reframing primitive invoked by coordinators, conflict resolution, diagnosis, review, and implementation workflows.
