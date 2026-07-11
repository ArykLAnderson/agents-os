---
name: doc-sync
description: Keep project documentation in sync with code changes. Updates API references, schema docs, and architectural overviews after implementation. Invoked by issue-executor or standalone after manual changes.
user-invocable: true
argument-hint: "[optional: specific files or directory to check]"
---

# Doc Sync: Automatic Documentation Updates

Keep project documentation current with code changes. Focuses on interface-level and architectural-level documentation — not internal implementation details.

## What Gets Updated

### Always update (interface changes):
- **API contracts** — new/changed/removed endpoints, request/response shapes, authentication requirements. Update swagger/OpenAPI specs, API reference docs, or equivalent.
- **Schema changes** — database schema, data model changes, new entities or relationships. Update data model docs, ERDs, or schema reference.
- **Public interfaces** — shared packages, exported types, SDK surfaces, webhook contracts. Update reference docs for anything consumers depend on.
- **Configuration changes** — new environment variables, feature flags, config options that operators or deployers need to know about.

### Update selectively (architectural changes):
- **New major components** — a new service, a new subsystem, a significant new module. Add a high-level overview of what it does and how it fits into the system. Not implementation reference — architectural context.
- **Changed structural patterns** — if the implementation introduces or changes a pattern that governs how the project works (e.g., switching from REST to event-driven for a subsystem, introducing a new data flow pattern). Document the pattern at a high level.
- **Removed components** — if a major component is removed or replaced, update architecture docs to reflect the new state.

### Never update (internal implementation):
- Language-level interface changes (e.g., a Go interface refactored, a TypeScript type renamed internally)
- Internal function signatures, private methods, implementation utilities
- Test file organization or test helper changes
- Code style or formatting changes
- Dependency version bumps (unless they change behavior)

## Process

1. **Determine what changed**: If invoked by `issue-executor`, look at the changes made during implementation. If standalone, use `git diff` against the base branch (or `$ARGUMENTS` for specific files).

2. **Classify changes** against the three categories above. If everything falls in "never update," report "no doc updates needed" and stop.

3. **Find relevant docs**: Search the project for existing documentation:
   - API docs: swagger/OpenAPI specs, API reference markdown, route documentation
   - Schema docs: data model docs, ERDs, migration notes, schema reference
   - Architecture docs: system design docs, ADRs, component overviews
   - Project config: `.agents-os/src/docs/`, README sections, deployment docs
   - RFC that prompted this work: check `_plans/` for the related RFC

4. **Update existing docs** to reflect the changes. Principles:
   - Keep it high-level. Document *what* and *why*, not *how*.
   - Match the style and depth of the existing docs — don't introduce more detail than what's already there.
   - If no relevant doc exists for an interface change, create a minimal one rather than leaving the change undocumented.
   - For architecture docs, think "would a new team member understand the system from this?" not "could someone reimplement it from this?"

5. **Report what was updated**: List each doc file modified and a one-line summary of what changed. If new docs were created, note that explicitly.

## Scope Control

This skill is deliberately narrow. It catches the documentation updates that matter most (interface contracts and architectural context) and ignores the noise (implementation details). The goal is keeping docs trustworthy as a high-level reference, not maintaining exhaustive implementation documentation.
