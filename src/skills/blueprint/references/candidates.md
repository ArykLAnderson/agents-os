# Boundary Candidates

Use a compact boundary candidate as Blueprint's working unit before committing to a fully specified module.

For each candidate record:

- **Responsibility:** the coherent capability it owns and what it deliberately does not own.
- **Secrets:** complexity, policy, failure behavior, or variation hidden from consumers.
- **Contract:** the rough promises consumers may rely on and deliberate omissions.
- **Depth:** capability and complexity absorbed relative to interface burden.
- **Unity:** fit with system concepts, analogous operations, and one coherent reason to change.
- **Ownership:** who or what owns change, observation, operation, repair, migration, and retirement.
- **Placement:** existing boundary adapted, genuinely new responsibility, or refactor of poor allocation.
- **Evidence/Findings:** support, uncertainty, risks, and discriminating evidence still needed.

Compare at least two materially different candidates when the choice is hard to reverse, high-fan-out, crosses authority/trust/lifecycle/deployment boundaries, moves state or mutation ownership, introduces a durable abstraction, replaces an established interface, or is costly if wrong.

Do not manufacture straw alternatives when evidence already eliminated them or an accepted existing boundary cleanly owns a local reversible change. Do not reopen inherited accepted architecture merely to create apparent choice. Alternatives should target decisions Blueprint still owns.

Disposition each candidate as selected for refinement, rejected with reason, retained fallback, needs evidence, or requires human judgment. Selection of a consequential candidate remains human authority.