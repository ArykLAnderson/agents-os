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
- Accepted Route, ticket graph, keystone, or bounded multi-task outcome requiring coordinated implementation → `software-implementation` in `route` or `ad_hoc` mode as appropriate.
- One clear bounded Task Contract with an assigned worktree → `coding-worker` directly.
- Independent verification of one implemented task or integrated convergence boundary → `focused-validator` directly.
- Idea needing one-session alignment → `grill`, invoking `domain-modeling` when language changes.
- Design question requiring runnable evidence → `prototype` directly, or `software-implementation` in `prototype` mode when multiple writers/gates require coordination.
- One bounded external question → `research`; multiple independent tracks → `research-sprint`; competing judgments → `deliberate`.
- Huge effort whose route cannot fit in one session → `wayfinder`.
- Settled conversation needing a durable specification → `to-spec`.
- Settled spec needing executable vertical tickets → `to-tickets`.
- Architectural health survey → `improve-architecture`; selected module/interface design → `codebase-design`.
- Coordinator trapped in repeated local fixes or incompatible intentions → `zoom-out`, then return to the owning workflow.

## Normal Flow

`Frame → Blueprint → Route → software-implementation → PR` is the full accepted-feature path. Shorter work enters at the smallest sufficient surface: a direct Coding Worker for one complete Task Contract, or Software Implementation for coordination, convergence, proportional release gates, or authorized PR preparation.

Planning and evidence never imply implementation, external-effect, PR, or landing authority. The selected workflow must receive those authorities explicitly. Research produces evidence, not decisions. Improve Architecture produces candidates, not refactors.

## Routing Rules

- Keep discovery through ticket creation in one context when it remains sharp; use a durable handoff when it does not.
- Start task writers in fresh contexts or safely resumable exclusive worktrees.
- Do not recreate the retired Deliver, Implement Feature, Ticket Executor, Feature Integration, or Slice Build workflows as aliases or parallel paths.
- Do not triage tickets produced by `to-tickets`; triage is for raw incoming reports and requests.
- A ticket locator alone does not determine scope: route one complete bounded task to Coding Worker and a graph/keystone to Software Implementation.
- Re-route when the kind of uncertainty changes. Do not force the current skill to absorb another skill's responsibility.
