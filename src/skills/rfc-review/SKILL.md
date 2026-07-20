---
name: rfc-review
description: Review an RFC/architecture document by spawning relevant fresh-context reviewer agents. Use after /rfc-write or after manual edits to re-review. Can be invoked repeatedly.
user-invocable: true
argument-hint: "[path to RFC document]"
---

# RFC Review: Fresh-Context Architecture Review

Consult `domain-modeling` for terminology or domain-behavior conflicts and `codebase-design` for interface, seam, depth, and locality claims.

Spawn relevant reviewer agents as fresh-context subagents to analyze an RFC document. Each reviewer examines the RFC independently and reports findings.

## Process

1. **Locate the RFC**: Use `$ARGUMENTS` if provided. If not, check `_plans/` for the most recently modified RFC file (files matching `rfc-*.md`).

2. **Assess which reviewers are relevant** based on the RFC content:

   | Reviewer | When to include |
   |---|---|
   | `@architecture-reviewer` | **Always** — every RFC needs structural review |
   | `@security-reviewer` | RFC touches: authentication, authorization, user data, API endpoints, secrets, external integrations |
   | `@performance-reviewer` | RFC touches: database queries, caching, real-time systems, large data sets, algorithmic complexity, concurrent operations |
   | `@code-quality-reviewer` | RFC proposes: significant new code, complex business logic, patterns that affect maintainability |

   Include only the reviewers that are genuinely relevant. A UI copy change RFC doesn't need a performance review.

3. **Spawn reviewers in parallel** as fresh-context subagents. Each reviewer receives:
   - The full RFC document content
   - The project's AGENTS.md for context
   - A focused prompt: "Review this RFC from your specialty perspective. Report concerns, risks, gaps, and suggestions. Be specific — reference sections of the RFC by name."

4. **Collect and present findings** organized by reviewer:

   ```
   ## RFC Review: [RFC Title]

   ### Architecture Review
   - [findings...]

   ### Security Review (if included)
   - [findings...]

   ### Performance Review (if included)
   - [findings...]

   ### Code Quality Review (if included)
   - [findings...]

   ### Summary
   - Critical concerns (must address before planning)
   - Recommendations (should address)
   - Minor suggestions (nice to have)
   ```

5. **Await user input**. Do not auto-fix or auto-update the RFC. The user decides which findings to address.

## Re-invocation

This skill can be invoked repeatedly after edits:

```
(user edits RFC in conversation or directly)
/rfc-review _plans/rfc-spaced-repetition.md
→ re-runs relevant reviewers on updated document
```

Each invocation spawns fresh-context reviewers — they don't carry context from previous reviews. This is intentional: fresh eyes catch different things.

## Guidelines

- Always include architecture-reviewer. The others are conditional.
- Reviewers are read-only — they report findings, they don't modify the RFC.
- Keep the review focused on the design, not implementation details. Implementation belongs in separately authorized `coding-worker` or `software-implementation` execution after planning/decomposition.
- If the RFC is thin or vague, the primary finding should be "this RFC needs more detail in [sections]" rather than guessing what was intended.
