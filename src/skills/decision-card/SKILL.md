---
name: decision-card
description: Decision card for asking or interpreting a context-bearing human question that requires human knowledge, authority, preference, consequential judgment, permission, or explicit acceptance. Use when the question needs orientation, material definitions, a recommendation, trade-offs, or visible confirmation scope. Routine conversational and low-context factual questions stay conversational.
---

# Decision Card

Ask the human only for what the human must supply. Resolve available facts first, continue model-resolvable work, and return control only when the answer materially changes or authorizes what happens next.

## Compose The Card

Use a **delta-first decision card** whose length matches the difficulty and consequence of the question:

- **Context:** always include this section. Give enough plain-language, delta-first orientation to answer after an attention switch. Name the current area, the established facts that affect the decision, and what this answer controls. Unlike the optional sections below, Context is mandatory and must never be omitted.
- **Meaning:** define only terms whose interpretation materially affects the answer. Omit this section when ordinary language is sufficient.
- **Recommendation:** state the strongest supported choice directly. Surface the precise new or corrected meaning that sharpens the choice. For a pure knowledge question with no honest recommendation, omit this section.
- **Why / consequences:** give the few decisive effects in brief bullets. Include material disagreement, risk, hidden cost, irreversibility, external effects, or what remains unauthorized. Omit consequences that do not distinguish the answer.
- **Decision:** ask one bounded question. Its visible proposition must state the full scope of what confirmation accepts or authorizes.
- **Decision sequence title:** when the card belongs to a multi-question interview or decision sequence, put the rough progress estimate in the decision heading using `Next decision [est. x/y]: <topic>`, where `x` is the current decision number and `y` is the current estimated total. Treat the estimate as orientation, not a commitment. Update `y` as soon as a response, new evidence, or planned follow-up materially changes the expected total. Do not repeat a separate remaining-question estimate elsewhere in the card.

Default to one consequential question at a time. Group at most three only when each is short, concrete, answerable in a phrase, shares the same context, and has low cognitive load. Ask rationale or a consequential trade-off alone.

## Scale The Card

Compress routine, reversible choices. Expand hard-to-reverse, high-risk, contested, unfamiliar, authorization-bearing, or context-heavy choices enough to support judgment. Distribute depth across successive decisions.

Keep detailed evidence, modeling, alternatives, and implementation mechanics in their owning artifact or working state. Keep optional depth there; include decision-critical depth in the card.

## Preserve Human Authority

Confirmation accepts only the visible proposition, never unstated rationale, adjacent work, implementation permission, external effects, or implications hidden in another artifact. State exclusions when a short answer such as “yes” could otherwise be overread.

Test the answer against the question and established evidence:

- A direct answer accepts or rejects only the proposition shown.
- A partial answer resolves only the part it addresses.
- An ambiguous answer gets one focused follow-up rather than a guessed interpretation.
- A changed premise reopens the affected reasoning before action.

At a natural boundary, restate the exact accepted propositions when doing so lets the human correct accidental agreement.

## Quality Check

Before sending, verify:

1. The question cannot be answered through available evidence or further model work.
2. A `Context` section is present, sufficient after an attention switch, and contains no broad recap.
3. Any recommendation is explicit and supported.
4. Any material trade-offs and residual exclusions are visible.
5. There is one clear answer target, or a permitted low-load group of at most three.
6. No terse answer can authorize more than the human can see.
7. A multi-question sequence uses the `Next decision [est. x/y]: <topic>` heading, with a current estimate rather than a knowingly stale total.

The card is complete when the human can answer every bounded question without opening another artifact and the answer cannot silently expand its own scope.

The decision interaction is complete when the answer's resolved scope is explicit, ambiguity or changed premises have been handled, and no acceptance or authority beyond the visible proposition has been carried forward.
