# Author Approval Questions

After extraction, present only the material author judgment needed before the first accepted snapshot. The working ledger may contain non-binding observations, gaps, alternatives, risks, assumptions, actions, and visual candidates without approval.

## What Requires Approval

Ask before the first snapshot adopts:

- initiative purpose or accepted intent
- current accepted decisions
- binding requirements or constraints
- authority of an older document or ticket
- resolution of a material contradiction
- agent inference or synthesis as current guidance

Do not ask for routine source registration, non-binding observations, source limitations, obvious open gaps, or proposed entries unless they affect one of the items above.

## Prompt Shape

Use concise natural prose, not a raw ledger dump:

```text
I can create the first semantic snapshot after you confirm these points.

What I extracted as current intent:
- <three to five material intent or purpose statements>

What I would treat as accepted decisions:
- <three to five proposed binding statements>

What still needs your call:
1. <material question, why it matters, and evidence-backed recommendation>

If this is right, approve the snapshot. Otherwise answer only the numbered items.
```

Keep the review to three through seven numbered material questions. Explain why each answer matters and include a recommendation only when the available evidence supports one. A blocking contradiction or missing authority that prevents an honest binding proposal must be asked immediately; other questions may be batched at the intake boundary.

## Approval Boundary

The review proposes content only. It must not claim that `SNAP-001` exists, convert a source claim into an accepted decision, or treat agent consensus as authority. After an author accepts, modifies, rejects, defers, or requests research, later snapshot creation belongs to the next intake step.

## Author Outcomes

Accept, correct, reject, defer, or request bounded research for each material proposal. Record the author's response as a durable approval event before changing semantic status or authority:

- **Approve:** adopt the approved material with an `Approval` reference and create the first snapshot only when all required material approval is present.
- **Correct:** apply the author-corrected meaning with an `Approval` reference; do not retain the proposed wording as accepted meaning.
- **Reject:** do not adopt the proposal; retain supported evidence as an `OBS`, `ALT`, `GAP`, `ASM`, or `RISK` with a type-appropriate non-accepted status.
- **Defer:** retain the current working ledger and open material gap; do not create an accepted snapshot.
- **Research:** retain or create the evidence gap and an `ACT` that names the bounded question and source scope; do not create an accepted snapshot until a later author response resolves the material item.

An absent, ambiguous, or partial response is not approval. Ask again when required material approval is missing.

## Approval Event

Record each accepted or corrected material response in a durable local approval event before creating the snapshot:

```markdown
# Approval Event APR-001

- **Authority:** author
- **Author:** <stable author identity or explicit local-author identity>
- **Recorded:** <YYYY-MM-DDTHH:MM:SSZ>
- **Locator:** <local response record and exact response anchor>
- **Outcome:** approve or correct
- **Approved entries:** <entry IDs>
- **Final wording:** <exact accepted or corrected statement for each approved entry>
```

`Authority` must be `author` or an explicitly declared delegated authority with an identity and scope. A source speaker, meeting consensus, agent, unnamed reviewer, or missing authority is not sufficient. The `Locator` and `Recorded` time bind approval to the exact final wording rather than to a general conversation or proposal.

Keep source provenance on entries that retain source evidence. Record author adoption separately with `Approval: APR-###`; do not overwrite `source-direct`, `source-quoted`, `agent-inferred`, or `agent-synthesized` merely to signal authority. Use `author-approved` provenance only when the final entry itself is new author-approved content without retained source-derived provenance.
