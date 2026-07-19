# Dependencies

Every Route edge names a concrete delivery prerequisite. Examples:

- a Contract must exist before its consumer can integrate;
- a migration must preserve data before canonical authority moves;
- an adapter must support a compatibility state before an old path retires;
- platform evidence must validate an assumption before broad implementation;
- a vertical Leg must settle before another can rely on its behavior.

Ordering preference, convenience, team habit, or “do this first” is not a dependency. Investigate whether it hides an interface, evidence, migration, authority, resource, or integration prerequisite. If none exists, omit the edge and allow independent work.

Keep the graph acyclic at the Leg/Work Item level. A conceptual loop usually means the seam is underdesigned, two items form one indivisible responsibility, an explicit reconciliation/convergence item is missing, or the Blueprint Contract is insufficient.

At dependency convergence points, name who integrates the inputs, what compatibility assumptions must agree, and what evidence proves the joined result.