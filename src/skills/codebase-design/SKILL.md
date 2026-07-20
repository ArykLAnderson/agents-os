---
name: codebase-design
description: Shared vocabulary for designing deep modules. Use when designing or improving an interface, choosing a seam, or making code more testable and AI-navigable.
---

# Codebase Design

Design deep modules: substantial behavior behind a small interface, placed at a clean seam and testable through that interface.

## Vocabulary

- **Module:** anything with a Contract and implementation.
- **Interface:** the operations or information through which a consumer crosses a module seam. It is part of the Contract, not the whole Contract.
- **Implementation:** behavior hidden inside a module.
- **Seam:** a place behavior can change without editing the consumer.
- **Adapter:** a concrete implementation occupying a seam.
- **Leverage:** capability consumers receive from a small Contract.
- **Locality:** change, knowledge, bugs, and verification concentrated in one place.
- **Secrets:** decisions, complexity, policy, data representation, sequencing, failure handling, or variation a module hides so consumers do not need to know them.
- **Contract:** everything consumers may rely on across a seam, including operations, types, invariants, state and authority semantics, ordering, errors, configuration, and consequential limits.
- **Depth:** useful capability and complexity absorbed by a module relative to the Contract burden imposed on consumers.
- **Unity:** the degree to which a module's responsibilities form one coherent system concept and one coherent reason to change.
- **Ownership:** explicit authority and responsibility for change, canonical state and mutation, observation, operation, repair, migration, and retirement.

Use these terms consistently. Prefer `seam` for a code-level change point and `Contract` when the promise is broader than an interface signature. Use `boundary` when trust, authority, process, deployment, or lifecycle—not only a code seam—is material.

## Diagnostic Lenses

Use `Secrets`, `Contract`, `Depth`, `Unity`, and `Ownership` as interacting questions, not a scorecard:

- What must this module hide, and what knowledge still leaks to consumers?
- Is its Contract sufficient for real consumers without exposing implementation Secrets?
- Does it absorb enough complexity to justify what consumers must learn?
- Do its responsibilities belong to one concept and reason to change?
- Is authority unambiguous across state, mutation, change, operation, repair, migration, and retirement?

A lens may expose tension another lens resolves: a slightly larger Contract can create greater Depth by hiding recovery policy, while splitting ownership can reveal that apparent Unity is false. Do not total, rank, or require equal performance across the lenses. A weak answer is a prompt to inspect evidence and trade-offs, not an automatic defect; a strong-sounding answer does not override consumer behavior or operational reality.

## Principles

- Seek small Contracts with deep implementations.
- Apply the deletion test: if deleting the module makes complexity vanish, it was likely a pass-through; if complexity reappears across consumers, the module was earning its keep.
- Treat the Contract as the test surface. Tests and consumers should cross the same seam.
- Accept dependencies rather than constructing them invisibly, and return results rather than hiding effects where practical.
- Do not create speculative seams. One adapter is hypothetical variation; two adapters demonstrate real variation.
- Prefer the highest seam that captures the real behavior. Fewer, deeper seams are usually better than many shallow ones.
- Give each material state, mutation, Contract, and schema one canonical owner and definition. Mark mirrors, caches, adapters, and projections as derived and state how they reconcile.
- When the correct shape is unclear, design the Contract at least twice and compare the diagnostic lenses plus migration cost.

This skill owns the vocabulary. Workflow skills decide when and how to apply it.
