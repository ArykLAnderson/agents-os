# Work Items

A Work Item is a bounded contribution required to close one Leg. It may be technical or horizontal because the Leg—not every Work Item—guarantees vertical behavioral closure.

Every Work Item records:

- one clear responsibility and owner;
- one bounded implementation context;
- Blueprint Contracts realized or preserved;
- checkable completion at its own seam;
- immediate consumer/downstream use;
- required inputs and named delivery prerequisites;
- evidence produced;
- branch/system coherence after completion;
- verification independent from its writer, including the method and intended checker.

A Work Item exporting an interface, schema, adapter, migration, or other seam proves consumer sufficiency before acceptance. Internal completion is not enough when downstream work would need to invent missing behavior.

Avoid items that mix unrelated responsibilities, hide architecture decisions, have only activity-based completion, or exist without a reverse mapping to a Blueprint delta, Leg need, migration obligation, or evidence requirement.