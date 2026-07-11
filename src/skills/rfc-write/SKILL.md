---
name: rfc-write
description: Write an RFC/architecture document from a discovery conversation. Synthesizes discussion into a structured design doc, saves to _plans/, then automatically invokes /rfc-review for first-pass analysis.
user-invocable: true
argument-hint: "[feature or system name]"
---

# RFC Write: Architecture Document Authoring

Use established domain language. Invoke `domain-modeling` when the RFC exposes an unresolved concept; keep domain definitions in the glossary and implementation trade-offs in the RFC or ADR.

Synthesize the current discovery conversation into a structured RFC/architecture document.

## Process

1. **Gather context**: Review the conversation so far. Identify the problem, proposed approach, constraints, trade-offs, and open questions that were discussed.

2. **Write the RFC** with these sections:

   ### RFC Template

   ```markdown
   # RFC: [Title]

   **Status:** Draft
   **Date:** [today]
   **Author:** [user + Claude]

   ## Problem Statement
   What problem are we solving and why does it matter?

   ## Proposed Solution
   High-level approach. What are we building and how does it work?

   ## Design Details
   Detailed design — data models, component interactions, key algorithms,
   state management, error handling. Include diagrams or pseudocode where helpful.

   ## Alternatives Considered
   What other approaches were evaluated? Why were they rejected?

   ## Migration Strategy
   How do we get from the current state to the proposed state?
   Data migrations, feature flags, rollback plan.

   ## API / Interface Changes
   Any changes to public APIs, contracts, or interfaces that other
   systems or consumers depend on.

   ## Risks & Open Questions
   Known risks, unresolved questions, areas needing further investigation.
   ```

   Omit sections that genuinely don't apply (e.g., no Migration Strategy for a greenfield feature). Don't pad sections with filler.

3. **Save the RFC** to `_plans/` at the bare repo root (find via `git rev-parse --git-common-dir`, then go to its parent). Use a descriptive filename like `rfc-spaced-repetition-engine.md`.

4. **Automatically invoke `/rfc-review`** on the saved document. Do not wait for user input between writing and first review — chain them together.

## Guidelines

- Write from the discovery conversation, not from imagination. If something wasn't discussed, flag it in Risks & Open Questions rather than inventing an answer.
- Keep the RFC specific enough to plan from. Vague RFCs produce vague plans.
- Domain language only in the Problem Statement and Proposed Solution. Implementation details belong in Design Details.
- The RFC should be self-contained — a fresh agent reading only this document and the codebase should be able to create an implementation plan from it.
