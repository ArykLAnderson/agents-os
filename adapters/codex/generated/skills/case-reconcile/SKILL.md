---
name: case-reconcile
description: Reconcile new evidence, review findings, author decisions, supersession, and staleness into an existing Case. Use whenever drafting or review discovers semantic changes that could affect accepted Case meaning.
user-invocable: true
argument-hint: "[case path or reconciliation finding]"
---

<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

# Case Reconcile

Own semantic updates to an existing Case.

All substantive discoveries, author decisions, contradictions, stale support, unsupported artifact assertions, and review findings route through this skill. Drafting, shaping, formatting, review, and publishing skills may propose changes; they do not silently mutate accepted Case meaning.

## Contract

- Maintain the author-review queue as working state rather than a Case entry type.
- Classify materiality as `none`, `low`, `medium`, `high`, or `blocking`.
- Apply mechanical and low-risk updates when safe; require author approval for high-materiality changes.
- Interrupt immediately for blocking contradictions or unsupported meaning that would mislead downstream artifacts.
- Preserve history through supersession instead of destructive semantic rewriting.
- Create a new Case snapshot when accepted semantic changes materially affect downstream artifacts.
- Mark affected artifacts stale when their pinned support no longer satisfies their reader action.

## Invariants

- Agent consensus never becomes author authority.
- Semantic changes always route through `case-reconcile` before they become accepted Case state.
- Publication blockers from unsupported assertions, stale material support, authority conflicts, or missing trace coverage cannot be waived by formatting or publishing; waivers require author-approved reconciliation into a new snapshot.

## Boundary

- Do not compose or rewrite reader-facing documents.
- Do not publish external targets.
- Do not replace real stakeholder, legal, privacy, security, product, QA, or operations approval with agent review.

## Handoff

Return applied updates, queued author questions, snapshot decisions, affected artifact notices, and unresolved blockers.
