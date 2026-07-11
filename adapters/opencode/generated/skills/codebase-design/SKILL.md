---
name: codebase-design
description: Shared vocabulary for designing deep modules. Use when designing or improving an interface, choosing a seam, or making code more testable and AI-navigable.
---

<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

# Codebase Design

Design deep modules: substantial behavior behind a small interface, placed at a clean seam and testable through that interface.

## Vocabulary

- **Module:** anything with an interface and implementation.
- **Interface:** everything callers must know: types, invariants, ordering, errors, configuration, and performance constraints.
- **Implementation:** behavior hidden inside a module.
- **Depth:** leverage delivered per unit of interface a caller must learn.
- **Seam:** a place behavior can change without editing the caller.
- **Adapter:** a concrete implementation occupying a seam.
- **Leverage:** capability callers receive from a small interface.
- **Locality:** change, knowledge, bugs, and verification concentrated in one place.

Use these terms consistently. Prefer `seam` over the overloaded `boundary`, and `interface` over the narrower `signature`.

## Principles

- Seek small interfaces with deep implementations.
- Apply the deletion test: if deleting the module makes complexity vanish, it was likely a pass-through; if complexity reappears across callers, the module was earning its keep.
- Treat the interface as the test surface. Tests and callers should cross the same seam.
- Accept dependencies rather than constructing them invisibly, and return results rather than hiding effects where practical.
- Do not create speculative seams. One adapter is hypothetical variation; two adapters demonstrate real variation.
- Prefer the highest seam that captures the real behavior. Fewer, deeper seams are usually better than many shallow ones.
- When the correct shape is unclear, design the interface at least twice and compare depth, locality, and migration cost.

This skill owns the vocabulary. Workflow skills such as `improve-architecture`, `diagnosing-bugs`, `to-spec`, and `feature-integration` decide when and how to apply it.
