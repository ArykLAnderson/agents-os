---
name: zoom-out
description: Architectural recovery maneuver for an agent trapped in locally plausible fixes or incompatible intentions. Restate objectives, map the architecture, and find the correct reconciliation seam.
user-invocable: true
---

# Zoom Out

Pause local problem-solving when repeated fixes move the problem, special cases spread across callers, or independently coherent changes cannot be reconciled cleanly.

## Mandatory triggers

Invoke this maneuver before another fixer when any of these occurs:

- two consecutive review-driven remediation cycles on one ticket fail closure
- a new blocker moves outward to a new module, caller, trust boundary, or deployment seam
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
7. Authorize at most one coherent redesign cycle through the owning implementation workflow, followed by one consolidated closure review across the affected risks.
8. If the pattern recurs after that redesign, return `NEEDS ATTENTION` rather than another local repair.

Do not implement the redesign here. This is a recovery and reframing primitive invoked by coordinators, conflict resolution, diagnosis, review, and implementation workflows.
