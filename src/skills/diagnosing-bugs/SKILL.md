---
name: diagnosing-bugs
description: Diagnosis loop for hard bugs and performance regressions. Use when the user says diagnose or debug this, or reports something broken, throwing, failing, intermittent, or slow.
user-invocable: true
argument-hint: "[problem or failing behavior]"
---

# Diagnosing Bugs

A discipline for hard bugs. Read the relevant domain glossary and ADRs first. Skip a phase only with an explicit reason.

## 1. Build a tight feedback loop

Before theorizing, establish one agent-runnable command that exercises the exact symptom and can go red before the fix and green after it. Prefer, in order: a focused test, HTTP/CLI script, browser script, captured-trace replay, throwaway harness, fuzz loop, bisect harness, or differential comparison.

Tighten it until it is specific, deterministic, and fast. For a flake, raise the reproduction rate through repetition, concurrency, stress, or controlled timing. If no runnable loop can be built, report what was tried and request the missing environment or artifact; do not substitute code-reading speculation.

## 2. Reproduce and minimize

Run the loop and confirm it catches the user's exact failure. Remove inputs, callers, configuration, data, and steps one at a time until every remaining element is load-bearing.

## 3. Hypothesize

Produce 3–5 ranked, falsifiable hypotheses. Each must state a prediction. Show the ranking to the user, then proceed unless their knowledge changes it.

## 4. Instrument and test

Test one prediction at a time. Prefer debugger/REPL inspection, then narrowly targeted logs. Tag temporary instrumentation with a unique `[DEBUG-...]` prefix. For performance, establish a measured baseline and profile or bisect rather than adding broad logs.

If repeated local fixes move the problem, require special cases across callers, or reveal incompatible architectural intentions, invoke `zoom-out` before choosing another patch.

## 5. Fix at the correct seam

Use `codebase-design` to identify the highest seam that reproduces the real bug pattern. Turn the minimized reproduction into a failing regression test there, watch it fail, apply the smallest root-cause fix, watch it pass, and rerun the original loop.

If no correct seam exists, record that architectural finding rather than adding a misleading shallow test. After the bug is fixed, hand the finding to `improve-architecture`.

## 6. Close out

- Original reproduction is green.
- Regression test passes, or the missing seam is documented.
- All tagged instrumentation and throwaway harnesses are removed.
- The actual cause is recorded in the commit or PR context.
- Any domain contradiction is reconciled through `domain-modeling`.

Do not broaden diagnosis into an unrelated refactor before restoring correct behavior.
