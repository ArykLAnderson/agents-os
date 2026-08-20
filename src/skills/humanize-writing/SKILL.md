---
name: humanize-writing
description: Rewrite supplied prose in a specific, natural voice without changing meaning.
user-invocable: true
argument-hint: "[draft, doc path, or brief]"
---

# Humanize writing

Edit existing prose without changing its claims, uncertainty, scope, commitments, or intended audience.

## Inputs

Identify the audience and purpose. Use an available sample of the user's writing; otherwise use requested traits or make a neutral cleanup pass. Preserve the user's facts and opinions.

Ask a question only when a missing audience, purpose, or authority decision would materially change the result. A missing voice sample does not block a neutral pass.

## Audit

Audit the draft with [references/ai-tells-checklist.md](references/ai-tells-checklist.md).

## Rewrite

Start with the useful point and state each fact once. Replace vague claims with available specifics, examples, names, or numbers. Prefer direct verbs and concrete nouns. Use contractions when they fit the voice. Vary sentence length and paragraph shape without making the prose choppy. End on substance instead of restating the piece.

Keep defined technical and domain terms. Question a suspect word by asking whether it identifies a real distinction or merely decorates an ordinary idea. Keep one accepted term instead of cycling through synonyms.

Preserve useful irregularity. A slightly uneven human sentence can be better than a polished generic sentence. Keep natural variation without adding deliberate errors, fake informality, or an invented persona.

## Return

Default to the revised draft with little or no commentary. If the user asks for analysis, return either a short audit or representative before-and-after edits. Explain only changes that help the user judge the result.

Before returning, reread the revision for any generic sentence and make the smallest meaning-preserving correction.
