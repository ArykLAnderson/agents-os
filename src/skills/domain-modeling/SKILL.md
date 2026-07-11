---
name: domain-modeling
description: Build and sharpen a project's domain model. Use when terminology is ambiguous, domain behavior needs stress-testing, or durable language and decisions must be recorded.
---

# Domain Modeling

Actively sharpen the project's domain language while designing. Merely reading an established glossary is a normal habit; invoke this skill when changing or challenging the model.

## Discipline

- Read the relevant `CONTEXT.md`, context map, glossary, and ADRs before changing language.
- Challenge overloaded or conflicting terms immediately. Propose one precise canonical term for each concept.
- Invent concrete edge cases that expose unclear relationships and lifecycle rules.
- Cross-check stated behavior against code. Surface contradictions rather than silently choosing one source.
- Update the appropriate `CONTEXT.md` as soon as terminology is settled. Keep it a glossary, free of implementation details.
- Create files lazily, only when there is something durable to record.

## ADR threshold

Offer an ADR only when the decision is all three:

1. Hard to reverse.
2. Surprising without its context.
3. The result of a genuine trade-off.

Specifications own desired behavior; `CONTEXT.md` owns domain language; ADRs own consequential implementation decisions. Do not mix these roles.
