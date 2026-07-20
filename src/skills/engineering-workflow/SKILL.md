---
name: engineering-workflow
description: Model-invoked router for choosing and handing off between Agent OS engineering workflows. Use when the correct workflow or next phase is unclear.
user-invocable: false
---

# Engineering Workflow Router

Choose the smallest workflow that matches the current uncertainty. This skill routes work; it does not perform the detailed workflow itself.

## Entry routing

- Broken, failing, intermittent, or slow behavior → `diagnosing-bugs`.
- Ordinary in-progress merge/rebase conflicts → `resolving-merge-conflicts`.
- Accepted Route, ticket graph, or keystone requiring end-to-end implementation → no installed coordinator currently; the replacement implementation package is under redesign. Do not invent or restore one implicitly.
- Integration of a completed ticket wave or several completed branches → `feature-integration`.
- Clear, single-ticket behavior change → `ticket-executor` or direct implementation when no tracker contract is needed.
- Idea needing one-session alignment → `grill`, invoking `domain-modeling` when language changes.
- Design question requiring runnable evidence → `prototype`.
- One bounded external question → `research`; multiple independent tracks → `research-sprint`; competing judgments → `deliberate`.
- Huge effort whose route cannot fit in one session → `wayfinder`.
- Settled conversation needing a durable specification → `to-spec`.
- Settled spec needing executable vertical tickets → `to-tickets`.
- Architectural health survey → `improve-architecture`; selected module/interface design → `codebase-design`.
- Coordinator trapped in repeated local fixes or incompatible intentions → `zoom-out`, then return to the owning workflow.

## Normal flow

No canonical implementation flow is currently installed. The former Deliver and Implement Feature coordinators are archived pending a substantially different Route implementation design.

Existing planning and evidence capabilities may still produce accepted artifacts, but an accepted Route, ticket graph, or keystone does not select or authorize an implementation coordinator by implication. Research produces evidence, not decisions. Improve-architecture produces candidates, not refactors.

## Routing rules

- Keep discovery through ticket creation in one context when it remains sharp; use a durable handoff when it does not.
- Start implementation ticket writers in fresh contexts.
- Do not restore or emulate the archived Deliver or Implement Feature workflows. Stop at the implementation boundary unless a separately authorized bounded execution path is explicit.
- Do not triage tickets produced by `to-tickets`; triage is for raw incoming reports and requests.
- Do not route a multi-ticket feature to `ticket-executor` merely because one ticket number appears in the prompt.
- Re-route when the kind of uncertainty changes. Do not force the current skill to absorb another skill's responsibility.
