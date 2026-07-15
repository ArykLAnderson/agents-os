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
