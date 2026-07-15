# Case Reconciliation

`case-reconcile` owns semantic update ownership after the first accepted Case snapshot. A source, reviewer, drafting skill, or agent may report a finding, but only this flow classifies and applies it to the Case working ledger. Do not update accepted Case meaning through a document edit, review report, or queue note.

## Intake And Consolidation

Record each incoming report with its source or review locator, affected entries or artifacts, proposed change, and evidence. Consolidate reports that describe the same semantic issue into one finding before assigning materiality. Preserve every original report locator on the consolidated finding; do not count repeated agent reports as independent authority or multiply their priority.

Agent consensus is evidence for investigation only. It is not author authority and cannot accept a `DEC`, `REQ`, `CON`, `INT`, contradiction resolution, or synthesized current guidance. Only the author or explicitly declared delegated authority with an identity and scope may approve those changes.

## Materiality

Classify the effect on accepted meaning and downstream reader action, not the number of files changed:

| Materiality | Meaning | Handling |
|---|---|---|
| `none` | No Case meaning, authority, support, scope, confidence, or reader action changes. | Apply a mechanical correction and retain the current snapshot. |
| `low` | A bounded correction preserves accepted meaning and does not affect artifact support or reader action. | Apply when evidence is clear; record the finding and retain the current snapshot. |
| `medium` | A nonbinding observation, risk, gap, or action changes, or an artifact may need attention without changing accepted binding meaning. | Apply the ledger update when supported; batch any author question for the current reconciliation phase. |
| `high` | A proposed binding meaning, material caveat, source authority, interpretation, or downstream reader action changes. | Keep accepted meaning unchanged, queue a concise author question, and create a later snapshot only after approval. |
| `blocking` | Opposing binding claims, missing authority, unsupported meaning, or stale material support would mislead a downstream artifact. | Interrupt immediately. Do not batch, publish, or treat the affected meaning as accepted until resolved. |

A low-risk mechanical change is limited to spelling, formatting, stable IDs, locators, duplicate references, and equivalent wording. It must preserve statement meaning, type, status, provenance, approval, confidence, relations, evidence, scope, and reader action. If equivalence is uncertain, classify the change as material rather than applying it.

## Contradictions And Questions

When accessible evidence supports opposing claims that affect accepted binding meaning, preserve both entries, link them with `contradicts`, create or update a `GAP` linked to both, classify the finding as `blocking`, and interrupt for the author immediately. Never silently choose the majority view, latest review, or agent consensus.

For nonblocking `medium` or `high` findings, maintain one phase-batched author review containing three through seven distinct material questions where possible. State the question, why it matters, affected entries or artifacts, evidence locators, and an evidence-backed recommendation only when support exists. Keep unrelated mechanical updates out of the batch. A batch is a queue convenience, not authority or a provisional snapshot.

## Applying Updates

1. Consolidate duplicate reports and classify the single semantic finding.
2. Apply `none` and safe `low` mechanical updates to the working ledger, recording the finding and preserving the current snapshot.
3. Apply supported nonbinding `medium` updates with their provenance; queue unresolved material author questions for the reconciliation phase.
4. For `high` findings, retain accepted state and queue the proposed change. Do not use `author-approved` provenance or accepted status without a durable approval event.
5. For `blocking` findings, stop affected downstream work and issue the immediate author interrupt.
6. After explicit approval or correction resolves material changes, append superseding entries rather than destructively rewriting accepted history. Create a new Case snapshot when accepted semantic changes materially affect downstream artifacts, and mark those artifacts stale when their pinned support no longer satisfies reader action.

## Result

Return applied working-ledger updates, consolidated findings with original locators, the materiality decision, immediate blockers, phase-batched author questions, snapshot decision, and affected artifact notices. Do not compose, publish, or claim stakeholder approval.
