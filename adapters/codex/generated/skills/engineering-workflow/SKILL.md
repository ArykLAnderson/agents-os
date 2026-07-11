---
name: engineering-workflow
description: Model-invoked router for choosing and handing off between Agent OS engineering workflows. Use when the correct workflow or next phase is unclear.
user-invocable: false
---

<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

# Engineering Workflow Router

Choose the smallest workflow that matches the current uncertainty. This skill routes work; it does not perform the detailed workflow itself.

## Entry routing

- Broken, failing, intermittent, or slow behavior → `diagnosing-bugs`.
- Ordinary in-progress merge/rebase conflicts → `resolving-merge-conflicts`.
- Accepted ticket graph/keystone requiring end-to-end implementation → `implement-feature`.
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
- Local markdown milestone execution where tracker tickets are intentionally inappropriate → `slice-build`.

## Normal flow

`grill` → optional evidence (`research`, `prototype`, `deliberate`) → `to-spec` → `to-tickets` → `implement-feature` → `implementation-report` archive during feature finalization.

Inside `implement-feature`, ticket work is delegated to fresh `ticket-executor` writers and completed waves are reconciled through `feature-integration`.

Wayfinder feeds this flow once its fog is cleared. Research produces evidence, not decisions. Improve-architecture produces candidates, not refactors. Domain-modeling and codebase-design are shared vocabulary layers beneath other workflows.

## Routing rules

- Keep discovery through ticket creation in one context when it remains sharp; use a durable handoff when it does not.
- Start implementation ticket writers in fresh contexts.
- Do not invoke `implement-feature` until an accepted ticket graph/keystone exists. The parent agent may choose `to-spec` and `to-tickets` first.
- Do not triage tickets produced by `to-tickets`; triage is for raw incoming reports and requests.
- Do not route a multi-ticket feature to `ticket-executor` merely because one ticket number appears in the prompt.
- Re-route when the kind of uncertainty changes. Do not force the current skill to absorb another skill's responsibility.
