---
name: humanize-writing
description: Rewrite existing prose to remove generic AI voice and recover a specific human voice. Trigger when the user asks to unslop, de-slop, humanize, remove AI tells, sound less corporate or generic, rewrite in their voice, or make a draft less polished and robotic.
user-invocable: true
argument-hint: "[draft, doc path, or brief]"
---

# Humanize writing

Edit existing prose without changing its claims, uncertainty, scope, commitments, or intended audience.

## Inputs

Read the draft and identify its audience and purpose. Use a sample of the user's writing when one exists. Otherwise use the requested traits or make a neutral cleanup pass. Do not invent a persona, experience, fact, or opinion.

Ask a question only when a missing audience, purpose, or authority decision would materially change the result. A missing voice sample does not block a neutral pass.

## Audit

Use [references/ai-tells-checklist.md](references/ai-tells-checklist.md). Look for:

- throat-clearing before the useful point
- vague authority, unsupported confidence, or abstract claims
- hype adjectives and inflated verbs
- theatrical insight or honesty framing
- generic transitions and repeated conclusions
- uniform sentence and paragraph rhythm
- em dashes, curly quotes, and ornamental punctuation
- forced three-part lists and false "from X to Y" ranges
- synonym cycling for one concept
- abstractions where a concrete noun or mechanism is available
- praise, agreement, or validation without reasoning

Decorative emoji are allowed when they improve scanning or communicate status. Remove them only when they are filler or conflict with the intended channel.

## Rewrite

Start with the useful point. State each fact once. Use straight quotes and apostrophes. Do not use em dashes. Do not manufacture a three-item list for rhythm.

Replace vague claims with available specifics, examples, names, or numbers. Prefer direct verbs and concrete nouns. Use contractions when they fit the voice. Vary sentence length without making the prose choppy. End on substance instead of restating the piece.

Keep defined technical and domain terms. Question a suspect word by asking whether it identifies a real distinction or merely decorates an ordinary idea. Do not replace one accepted term with several synonyms.

Preserve useful irregularity. A slightly uneven sentence can sound more human than a polished generic sentence. Do not add deliberate errors or fake informality.

## Return

Default to the revised draft with little or no commentary. If the user asks for analysis, return either a short audit or representative before-and-after edits. Explain only changes that help the user judge the result.

Before returning, ask: "Which sentence still sounds generated, and what concrete change would fix it?" Make that change when it preserves meaning.
