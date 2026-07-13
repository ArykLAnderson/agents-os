---
name: grill
description: "Adversarial alignment interview. TRIGGER when: the user wants to reach shared understanding before building, says 'grill me', 'let's align on this', 'interview me about this idea', or wants to stress-test a design concept. Explicit invocation: /grill [topic]"
user_invocable: true
argument_hint: "[topic or context to grill about]"
---

# Grill: Adversarial Alignment Protocol

Load `domain-modeling` whenever the conversation challenges, coins, or changes domain language. That skill owns glossary and ADR thresholds; this skill owns the interview.

Interview the user relentlessly about their idea until you reach a shared design concept. The goal is alignment, not a document. The conversation IS the asset.

## Process

### 1. Understand the Topic

If `$ARGUMENTS` is provided, use it as the starting context. Otherwise, ask the user what they want to be grilled about.

### 2. Gather Context (Doc-Aware)

Before starting questions, silently gather relevant project context:

- If a `CONTEXT.md` exists at the project root, read it for domain terminology. Challenge the user if their language conflicts with established terms.
- Spawn a **librarian** subagent (if the agent type exists) to retrieve relevant ADRs, discovery briefs, research docs, and prior decisions related to the topic. If no librarian agent exists, do a quick scan of `docs/decisions/INDEX.md` and `docs/discovery/INDEX.md` yourself.
- Do NOT re-litigate decisions that are already accepted in ADRs. Reference them and move on.

### 3. Grill

Ask questions **one at a time**. For each question:

1. Ask the question clearly
2. Provide your **recommended answer** based on what you know about the project, the domain, and the user's prior responses
3. Wait for the user to confirm, modify, or reject your recommendation

If a question can be answered by reading existing docs or code, investigate first instead of asking the user. Surface the answer briefly, then ask the next unresolved question.

If the user asks a question or challenges the framing, pause the grill flow and resolve that discussion before continuing. Resume only after the user is ready to proceed.

**Question properties:**
- Start broad (goals, constraints, users) then drill into specifics (implementation, edge cases, trade-offs)
- Challenge vague answers — ask for concrete examples or constraints
- Challenge terminology — if the user uses a term that conflicts with CONTEXT.md or is ambiguous, flag it immediately
- Surface hidden assumptions — "you said X, but that implies Y — is that intentional?"
- Cover: problem definition, users/personas, scope boundaries, implementation approach, testing strategy, what's explicitly out of scope, dependencies, risks
- Don't ask questions whose answers are already documented in ADRs or prior decisions

**Session length:** As many questions as needed. Typical sessions run 15-40 questions. The user says "wrap up" or "that's enough" when they're satisfied.

### 4. Wrap Up

When the user signals completion:

1. Summarize the key decisions and alignments reached (5-10 bullet points max)
2. Note any unresolved tensions or deferred decisions
3. **Present the implied scope** — list everything the grill designed in detail. This becomes the in-scope list for the PRD. Ask the user: "This is what I'd put in scope. Anything to defer?" Only move items out of scope if the user explicitly says so.
4. **For any deferred items** — note that they need a home outside the PRD (discovery brief, ADR, or issue). Out-of-scope in a PRD is an implementation constraint, not a work tracker. Deferred work that only lives in out-of-scope goes to the void.
5. Suggest the logical next step (usually `/doc prd` to capture as a PRD, or a specific implementation task)

Do NOT automatically produce a PRD or any other document. The next skill in the pipeline handles that.

## Anti-Patterns

- **Don't batch questions.** One question per message. Always.
- **Don't skip the recommended answer.** The user needs something to react to, not a blank slate.
- **Don't produce artifacts during grilling.** No PRDs, no plans, no code. Pure alignment.
- **Don't ask permission questions.** Not "would you like me to ask about testing?" — just ask about testing.
- **Don't re-ask decided things.** If an ADR says "we use Neon for the database," don't ask "what database should we use?"
- **Don't soften challenges.** If the user's idea has a flaw, say so directly. This is adversarial by design.

## Live CONTEXT.md Updates

During grilling, when a term is resolved, coined, or corrected — update CONTEXT.md immediately:

- **New term defined:** Add it to the appropriate table in CONTEXT.md right now. Don't batch it.
- **Existing term corrected:** Update the definition and "Avoid" column in place.
- **Terminology conflict surfaced:** If the user uses a word that conflicts with an existing CONTEXT.md entry, challenge it. If the user's usage wins, update CONTEXT.md. If the glossary wins, note the correction and move on.
- **Ambiguity flagged:** Add to the "Flagged Ambiguities" section with disambiguation guidance.

Tell the user what you changed: "Updated CONTEXT.md: added [term] = [definition]" — then continue grilling. Don't break flow for a discussion about the update.

**Why live updates:** Batching term definitions after grilling means they get lost or done inconsistently. The grill session IS the discovery moment — capture it when it's sharpest.

## ADR Side Effects

If a decision crystallizes that warrants an ADR:
- Note it: "This is ADR-worthy: [decision summary]"
- Do NOT write the ADR during grilling. That's a separate skill.
