---
name: zoom-out
description: Architectural recovery maneuver for an agent trapped in locally plausible fixes or incompatible intentions. Restate objectives, map the architecture, and find the correct reconciliation seam.
user-invocable: true
---

# Zoom Out

Pause local problem-solving when repeated fixes move the problem, special cases spread across callers, or independently coherent changes cannot be reconciled cleanly.

1. Restate the governing objective and observable behavior that must survive.
2. Recover the pre-existing, incoming, and integration intentions from specs, tickets, ADRs, tests, and history.
3. Map the relevant modules, callers, interfaces, ownership, and dependency direction using `codebase-design` vocabulary.
4. Identify which constraints are real and which come from the current attempted solution.
5. Locate the seam where the intentions can be reconciled with the least new complexity.
6. Return a concrete recommendation to the owning workflow, including contracts preserved, contracts changed, and any follow-up implementation cycle required.

Do not implement the redesign here. This is a recovery and reframing primitive invoked by coordinators, conflict resolution, diagnosis, review, and implementation workflows.
