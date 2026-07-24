---
name: writing-shape
description: Writing, exploit — shape fixed raw material into an article paragraph by paragraph.
user-invocable: true
---

<what-to-do>

The user has passed (or will pass) a markdown file of raw material. Treat it as the input pile — anything from a tidy list of fragments to a wall of unstructured prose to a transcript. The format does not matter. Read it end-to-end before doing anything else.

Then run a shaping session that produces a separate article document. This is **exploit**: exploration is done, so commit to a structure and mine the fixed pile. Do not edit the raw material file.

If the user did not say where to save the article, ask once and remember the path. The user will be editing the article file during the session; always re-read it before writing so their edits are preserved.

</what-to-do>

<supporting-info>

## The loop

1. **Read the pile.** Read the input file in full. Form a sense of what's in it.
2. **Establish prerequisites.** Settle what the reader already knows. Everything else must be grounded before a later block leans on it.
3. **Draft 2–3 candidate openings.** Each implies a different thesis or angle. The chosen opening defines what the rest must do.
4. **Grow paragraph by paragraph.** The next block may lean only on grounded concepts and may ground new ones. Deliberately choose prose, list, table, callout, quote, or code.
5. **Append as you go.** Write each agreed block immediately.
6. **Loop until done.** The user decides when the article is complete.

For a guided journey rather than an opening-led argument, use **beat mode**: offer 2–3 genuinely different reachable next beats, state what each grounds and unlocks, let the user choose one, and write only that beat. Re-read the article, update the grounded set, and repeat until the journey reaches a natural end.

## Grounding

A concept is grounded when the reader brings it as a prerequisite or an earlier block has introduced it. Track the grounded set. If the next move requires an ungrounded concept, ground it first or change the move. The central trade-off is how much knowledge to require up front versus teach inside the article.

## Conversational feel

This is a grilling session inverted. In ideation, the question was "what are you actually noticing?" Here it's "what is this article actually arguing, and in what order does the reader need to hear it?" Push back. Refuse to let weak transitions slide. If a paragraph doesn't earn its place, cut it.

Specific moves to keep using:

- "What does this paragraph do for the reader that the previous one didn't?"
- "If I cut this, what breaks?"
- "Is this prose, or should it be a list? Why prose?"
- "This sentence is doing two jobs — split it or pick one."
- "The opening promised X. We've drifted to Y. Either re-thread it or change the opening."

## Pulling from the pile

Treat the raw material as a quarry, not a script. Pull a fragment, rework it to fit the surrounding paragraph, and place it. A fragment may be split across multiple paragraphs, merged with another, or paraphrased. The pile's job is to be mined; the article's job is to read as one voice.

If the pile lacks something the article needs, name the gap explicitly: "We need an example here and the pile doesn't have one — give me one now or we cut this section."

## Format arguments to actually have

When choosing how to render a beat, weigh these tradeoffs out loud with the user, not silently:

- **Prose vs. list.** Prose carries argument; lists carry parallel items. If items aren't truly parallel, prose is better. If they are, a list is faster to scan.
- **Inline vs. callout.** Tips, warnings, and asides go in callouts (`> [!TIP]`, `> [!NOTE]`) — but only if they'd genuinely derail the main argument inline. Otherwise leave them inline.
- **Table vs. repeated structure.** If the same shape repeats 3+ times with the same fields, a table. Otherwise prose with bold leads.
- **Quote vs. paraphrase.** Quote when the original wording is the point. Paraphrase when only the idea matters.
- **Code block vs. inline code.** Multi-line, runnable, or illustrative → block. Single token or identifier → inline.

## Writing rhythm

Append to the article file as each block is agreed. Re-read the file from disk before every write — the user may have edited between turns. Never overwrite blindly. If the user wants a paragraph rewritten, edit that specific paragraph in place; leave the rest alone.

## Out of scope

- Mining for new fragments that aren't in the pile (the pile is the input — if it's incomplete, name the gap and either get the user to fill it or cut the section).
- Editing the raw material file.
- Publishing, formatting for a specific platform, or adding frontmatter the user didn't ask for.

</supporting-info>
