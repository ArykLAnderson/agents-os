# Glossary - Auditing Skills

This is the disclosed reference for [`audit-skill`](SKILL.md). The terms describe levers for making an agent follow a predictable process.

## Invocation

### Predictability

The degree to which a skill makes the agent behave the same way on every run. This means process determinism, not identical output.

### Model-Invoked

A skill the model can discover and invoke autonomously from its description. It pays permanent **context load** for that discoverability.

### User-Invoked

A skill intentionally invoked by the human. It avoids autonomous triggering but spends **cognitive load** because the human must remember when to use it.

### Description

The skill's machine-readable trigger and top-level **context pointer**. It states what the skill does and which distinct **branches** should invoke it.

### Context Pointer

A reference held in context that names out-of-context material and explains when to load it. Its wording determines whether the agent follows it reliably.

### Context Load

The tokens and attention permanently spent making a model-invoked skill discoverable.

### Cognitive Load

The cost to the human of remembering which user-invoked skills exist and when to use them.

### Router Skill

A user-invoked entry point that names related skills and explains when to choose each one.

### Granularity

How finely behavior is divided across skills. Finer model-invoked division spends context load; finer user-invoked division spends cognitive load.

## Information Hierarchy

### Information Hierarchy

The ranking of skill content by how immediately the agent needs it: in-skill **steps**, in-skill **reference**, then disclosed or external reference behind a context pointer.

### Steps

Ordered actions the agent performs. Each step should end with a clear **completion criterion**.

### Reference

Definitions, rules, facts, examples, and conditional instructions consulted on demand rather than performed in sequence.

### External Reference

Reference outside `SKILL.md`, loaded only through a context pointer. It may be a sibling skill file or a document outside the skill system.

### Progressive Disclosure

Moving conditional reference out of `SKILL.md` and behind a context pointer so every run carries only what it needs.

### Co-Location

Keeping a concept's definition, rules, and caveats together so consulting one part exposes its relevant neighbors.

### Sprawl

A skill whose length impairs attention and maintenance even when its content is live and unique. Cure it with progressive disclosure or a justified split.

## Steering

### Branch

A distinct mode of using a skill that causes a run to follow different instructions.

### Leading Word

A compact concept already represented in model pretraining that recruits useful prior behavior, such as _lesson_, _tracer bullet_, or _red_. It anchors both invocation and execution.

### Completion Criterion

The checkable condition that proves a step or body of reference has been fully applied. Strong criteria are clear and, where needed, exhaustive.

### Legwork

The investigation and execution performed inside a step. Demanding completion criteria and strong leading words increase it.

### Post-Completion Steps

Steps visible after the current step. They can pull attention forward and cause premature completion.

### Premature Completion

Ending a step before its criterion is met because attention shifts toward later work. First sharpen the criterion; split the sequence only when the criterion is inherently fuzzy and rushing is observed.

### Negation

Steering by naming prohibited behavior, which can make that behavior more available. Prefer a positive description of the target behavior; retain prohibitions only as necessary guardrails paired with that target.

## Pruning

### Single Source of Truth

The state in which each behavioral meaning has one authoritative location.

### Duplication

The same meaning appearing in multiple locations. It wastes tokens, increases maintenance cost, and gives the repeated idea unintended prominence.

### Relevance

Whether a line still bears on what the skill does. Relevant content can still be a **no-op**.

### Sediment

Stale layers accumulated because adding instructions feels safer than removing them.

### No-Op

An instruction that does not change model behavior compared with the default. Test each sentence independently and remove those that do not earn their load.
