---
name: engineering-workflow
description: Model-invoked router for choosing and handing off between Agent OS engineering workflows. Use when the correct workflow or next phase is unclear.
user-invocable: false
---

# Engineering Workflow Router

Choose the smallest workflow that matches the current uncertainty. This skill routes work; it does not perform the detailed workflow itself.

## Entry Routing

- Broken, failing, intermittent, or slow behavior → `diagnosing-bugs`.
- Ordinary in-progress merge/rebase conflicts → `resolving-merge-conflicts`.
- Current accepted Feature Atlas execution handoff requiring coordinated implementation → `software-implementation` only with an explicit Delivery Contract that preserves its Map Decision, Feature/Leg/Work Item identities, prerequisites, convergence, proof profile, typed limitations, successor-currentness, and separate effect authority. The installed coordinator is generic and not yet a proven conforming handoff consumer; stop rather than flattening or silently upgrading the handoff.
- Legacy accepted Route packages, ticket graphs, or keystones are evidence/fixtures, not current planning authority. Use `ad_hoc` mode only under separately explicit scope and authority; never present it as realization of an unreconciled Atlas plan.
- One clear bounded Task Contract with an assigned worktree → `coding-worker` directly.
- Independent verification of one implemented task or integrated convergence boundary → `focused-validator` directly.
- Idea needing one-session alignment → `grill`, invoking `domain-modeling` when language changes.
- Design question requiring runnable evidence → `prototype` directly, or `software-implementation` in `prototype` mode when multiple writers/gates require coordination.
- One bounded external question → `research`; multiple independent tracks → `research-sprint`; competing judgments → `deliberate`.
- Huge effort whose route cannot fit in one session → `wayfinder`.
- Settled conversation needing a durable specification → `to-spec`.
- Settled ad hoc spec with no governing accepted Atlas Map and separately authorized ticket publication → `to-tickets`. Accepted Blueprint/Map delivery instead enters ephemeral `route` (or `/shape-feature` compatibility entry) and exact Map-wide Atlas acceptance.
- Architectural health survey → `improve-architecture`; selected module/interface design → `codebase-design`.
- Coordinator trapped in repeated local fixes or incompatible intentions → `zoom-out`, then return to the owning workflow.

## Normal Flow

`Frame → Blueprint → ephemeral Route → trusted Map Decision → Feature Atlas publication/handoff → separately authorized implementation → PR` is the full accepted-feature path. Route composes but persists no accepted plan; Atlas is the sole durable accepted planning authority. Shorter work enters at the smallest sufficient surface: a direct Coding Worker for one complete Task Contract, or Software Implementation for generic/ad hoc coordination when its explicit Contract is sufficient.

Planning and evidence never imply implementation, external-effect, PR, or landing authority. The selected workflow must receive those authorities explicitly. Research produces evidence, not decisions. Improve Architecture produces candidates, not refactors.

## Routing Rules

- Keep discovery through ticket creation in one context when it remains sharp; use a durable handoff when it does not.
- Start task writers in fresh contexts or safely resumable exclusive worktrees.
- Do not recreate the retired Deliver, Implement Feature, Ticket Executor, Feature Integration, or Slice Build workflows as aliases or parallel paths.
- Do not triage tickets produced by `to-tickets`; triage is for raw incoming reports and requests.
- A locator alone does not determine scope: route one complete bounded Task Contract to Coding Worker. A current Atlas handoff may enter coordinated implementation only without changing accepted ownership, prerequisites, convergence, proof, or limitations; a legacy graph/keystone does not acquire Atlas authority by being dispatched.
- Re-route when the kind of uncertainty changes. Do not force the current skill to absorb another skill's responsibility.
