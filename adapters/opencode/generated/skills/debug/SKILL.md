---
name: debug
description: "Systematic debugging using competing hypotheses. Four-phase methodology: investigate → pattern analysis → hypothesis testing → fix. Prevents guess-and-check thrashing. TRIGGER when: a test fails unexpectedly, a bug is reported, behavior doesn't match expectations, or the user says 'debug this', 'why is this broken', 'figure out what's wrong'. Explicit invocation: /debug [description of problem]"
user_invocable: true
argument_hint: "[description of the problem or failing test]"
---

<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

# Debug: Systematic Root Cause Analysis

No fixes without root cause. Systematic investigation is faster than thrashing.

## Phase 1: Investigate

Gather evidence before forming any hypothesis.

- **Read the error.** Full stack trace, full log output. Not a summary — the actual text.
- **Reproduce consistently.** Find the exact command or action that triggers the failure. If you can't reproduce it, you can't verify a fix.
- **Trace backward.** Start at the symptom, trace data flow backward to the origin. The bug is rarely at the crash site — it's upstream where bad state was introduced.
- **Gather boundary evidence.** Log or inspect values at component boundaries (function inputs/outputs, API request/response, database query/result). This narrows the search space fast.

**Output of this phase:** A clear statement of what's happening vs. what should happen, and which component boundary the bad state crosses.

## Phase 2: Pattern Analysis

Find working reference points to compare against.

- **Find similar working code.** The codebase almost certainly has something analogous that works. Find it.
- **Document differences.** Line up the working version and the broken version. Every difference is a candidate.
- **Check recent changes.** `git log --oneline -20` on the affected files. `git diff HEAD~5 -- <file>`. Something changed — find what.
- **Check assumptions.** What does this code assume about its inputs, environment, or dependencies? Which assumptions could be wrong?

**Output of this phase:** A ranked list of differences and broken assumptions.

## Phase 3: Hypothesis Testing

One variable at a time. No shotgun fixes.

- **Form a specific hypothesis.** "The bug is caused by X because Y." Not "maybe it's something with Z."
- **Design a minimal test.** What's the smallest change that would confirm or refute this hypothesis?
- **Test it.** Make the one change. Observe the result.
- **Record the result.** Confirmed → move to Phase 4. Refuted → form next hypothesis from Phase 2 evidence.

**Rules:**
- One hypothesis at a time. Changing two things means you learn nothing.
- If a hypothesis is refuted, revert the test change before trying the next one.
- Never say "that didn't work, let me try something else" without recording what you learned from the failure.

## Phase 4: Fix

Now — and only now — write the fix.

1. **Write a failing test** that reproduces the bug. This test encodes the root cause, not just the symptom.
2. **Implement the fix.** Minimal change addressing the root cause.
3. **Run the failing test.** It must pass.
4. **Run the full test suite.** No regressions.
5. **Verify the original reproduction** from Phase 1 no longer triggers the bug.

## Red Flag: 3-Strike Rule

If three hypotheses from Phase 3 are refuted in a row:

**Stop. Do not form hypothesis #4.**

Instead, question your framing:
- Is the bug where you think it is? Re-examine Phase 1 boundary evidence.
- Are you debugging the right layer? (Could be infrastructure, configuration, environment, not code.)
- Is this a design problem, not a code problem? (Architecture won't be fixed by patching.)
- Should you ask the user for context you might be missing?

Escalate with what you know: "I've tested three hypotheses and all were wrong. Here's what I've ruled out: [list]. Here's what I think the real issue might be: [reframed hypothesis]. Before I continue, does this match your understanding?"

## Anti-Patterns

- **Guess-and-check:** Changing random things hoping something works. Every change must be driven by evidence.
- **Symptom patching:** Adding a nil check, try/catch, or fallback that masks the bug without fixing the cause.
- **Ignoring the error message:** The error message is evidence. Read all of it.
- **Fixing without reproducing:** If you can't trigger the bug, you can't confirm the fix.
- **Multi-variable changes:** Changing three things and declaring it fixed because the symptom went away. You don't know which change mattered.
- **Abandoning investigation for a rewrite:** "Let me just rewrite this function" is not debugging. The bug will follow you if you don't understand it.
