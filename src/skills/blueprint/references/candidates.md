# Module Candidates

Use a compact module candidate as Blueprint's working unit before committing to a fully specified design.

For each candidate record:

- **Responsibility:** the coherent capability it owns and what it deliberately does not own.
- **Secrets:** complexity, policy, failure behavior, representation, or variation hidden from consumers.
- **Contract:** the rough promises consumers may rely on and deliberate omissions.
- **Depth:** capability and complexity absorbed relative to Contract burden.
- **Unity:** fit with system concepts, analogous operations, and one coherent reason to change.
- **Ownership:** who or what owns canonical state and mutation plus change, observation, operation, repair, migration, and retirement.
- **Placement:** existing module adapted, genuinely new responsibility, or refactor of poor allocation.
- **Canonization:** which Contract, state, and schemas become canonical; which old or duplicate surfaces remain temporarily; and how every derived view reconciles.
- **Evidence/Findings:** support, uncertainty, risks, and discriminating evidence still needed.

The five shared codebase-design terms are diagnostic lenses, not fields to score or total. Use them to expose trade-offs and leaked knowledge. Reject a candidate for evidence-backed insufficiency, confused responsibility, or ambiguous authority—not for failing an invented numeric threshold.

Compare at least two materially different candidates when the choice is hard to reverse, high-fan-out, crosses authority/trust/lifecycle/deployment boundaries, moves state or mutation ownership, introduces a durable abstraction or schema, replaces an established Contract, or is costly if wrong.

Do not manufacture straw alternatives when evidence already eliminated them or an accepted existing module cleanly owns a local reversible change. Do not reopen inherited accepted architecture merely to create apparent choice. Alternatives should target decisions Blueprint still owns.

Disposition each candidate as selected for refinement, rejected with reason, retained fallback, needs evidence, or requires Architect judgment. Reconcile supporting alternatives, evidence, and dispositions into Casework at a natural boundary. The accepted Blueprint links to that Casework and contains exactly one selected architecture; it does not preserve several alternatives as coequal target designs. Selection of a consequential candidate remains explicit Architect authority.
