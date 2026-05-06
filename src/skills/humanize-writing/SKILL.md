---
name: humanize-writing
description: Rewrite or edit drafts to remove generic AI voice and restore a more human, specific voice. TRIGGER when the user says "this sounds like AI", "make this sound more human", "remove the AI voice", "less corporate", "less generic", "rewrite in my voice", "make this less polished", or shares a draft that feels robotic. Also triggers on explicit /humanize-writing invocation.
user-invocable: true
argument-hint: "[draft, doc path, or brief]"
---

# Humanize Writing

Rewrite or edit prose that sounds generic, frictionless, corporate, or obviously AI-generated.

## When to Use This vs. Other Skills

- **`/note`** — quick capture, not editorial refinement
- **`/research`** — structured synthesis from a source
- **`/rfc-write`** — formal design or architecture writing
- **`/humanize-writing`** (this) — improve voice, rhythm, specificity, and naturalness in existing prose

## Core Principle

Do not merely paraphrase.

First remove AI-patterned prose. Then restore specificity, rhythm, and actual voice.

## Inputs To Gather

Before doing a full rewrite, identify:

- **Draft** — pasted text or file path
- **Audience** — who this is for
- **Goal** — what the piece should do
- **Voice anchor** — one of:
  - a sample of the user's writing
  - a writer/reference they like
  - 3-5 voice traits

If the user has no voice sample yet, do **not** block use of the skill. Proceed with best-effort humanization and include a gentle reminder at the end that adding a short voice sample later will help future rewrites sound more like them.

## Modes

### 1. Detect

Audit the draft for AI tells before editing.

Common categories:
- filler openings and throat-clearing
- vague authority or abstract claims
- hype adjectives and inflated verbs
- false-insight sentence structures
- over-signposting and generic transitions
- uniform sentence rhythm
- uniform paragraph structure
- overuse of em dashes
- generic abstractions instead of concrete nouns

Load and use [references/ai-tells-checklist.md](references/ai-tells-checklist.md) when auditing or rewriting.

### 2. Humanize

Rewrite to remove AI patterns.

Apply these rules:
- cut throat-clearing and generic setup
- replace vague claims with specifics, examples, names, or numbers when available
- vary sentence length and paragraph shape
- use contractions when appropriate for the target tone
- prefer direct verbs over inflated verbs
- remove buzzwords and figurative business clichés
- end on substance, not a generic summary paragraph

### 3. Voice Injection

After the draft no longer sounds generic, align it to the user's intended voice.

Adjust for:
- formality
- warmth
- sharpness/opinionation
- humor or dryness
- cadence
- jargon tolerance
- amount of polish vs. natural roughness

If no real voice anchor exists yet, do a neutral humanizing pass instead of guessing a false persona.

## Default Rewrite Heuristics

Strongly question words and phrases like:

- delve
- leverage
- robust
- comprehensive
- seamless
- pivotal
- landscape
- foster
- facilitate
- underscore
- navigate (figurative)
- it is important to note
- it is worth noting
- in conclusion
- when it comes to
- at the end of the day
- not only X, but also Y
- it's not just X, it's Y

Do not remove them mechanically if they are genuinely the best choice, but assume they are guilty until proven useful.

## Process

1. Read the draft.
2. Determine audience, goal, and whether a voice anchor exists.
3. If key context is missing, ask only for the minimum needed.
4. Audit the draft against [references/ai-tells-checklist.md](references/ai-tells-checklist.md).
5. Decide whether this needs:
   - light line edits
   - a full rewrite
   - rewrite plus voice injection
6. Produce one of:
   - an annotated AI-voice audit
   - a revised draft
   - a before/after comparison of representative edits
7. Briefly explain the main changes when useful.
8. If no voice sample exists yet, end with a short, gentle reminder to add one later for better personalization.

## Output Options

### AI Voice Audit
- top patterns found
- why they weaken the draft
- whether line edits or a full rewrite is warranted

### Humanized Draft
- revised full text
- minimal explanation unless the user asks for commentary

### Before/After Notes
- 3-7 representative edits
- what changed and why

## Escalation Rules

Pause and ask instead of guessing when:
- no draft is provided
- the audience or goal is materially unclear
- the user wants "my voice" but no sample or usable proxy exists
- the text needs factual support the model cannot invent

## Guidelines

- Specificity beats polish.
- Voice beats smoothness.
- Concrete nouns beat abstractions.
- A slightly uneven human sentence is often better than a perfect generic one.
- Do not invent experiences, data, or opinions the user did not imply.

## Confirmation

Report in 1-3 lines:
- what you changed
- whether you used a voice anchor
- whether this was a light edit or a full rewrite
- if relevant, a gentle reminder that a short voice sample can improve future passes
