# Work Items

A Work Item is a bounded implementation contribution required to close one Feature-owned Leg. Every implementation Work Item belongs to exactly one Feature and one Leg. Map convergence and joint proof are planning/proof boundaries, not free-floating Map-owned implementation Work Items.

Every proposed Work Item records:

- a unique candidate-local label, later mechanically bound to one stable `WI-*` Atlas identity;
- owning Feature and owning Leg label;
- one responsibility and bounded implementation context;
- current behavior and desired coherent result;
- Blueprint Contracts realized or preserved;
- stable interfaces and explicit in/out boundaries;
- immediate consumer or downstream use;
- direct concrete prerequisites stored as `blocked by` at this consumer;
- convergence point and owner;
- evidence output and authoritative source-system locator expectations;
- focused writer-owned proof;
- intended independent checker and honest independence limitations;
- integrated, contextual E2E, and security responsibility allocated by the accepted proof profile;
- temporary-mechanism disposition and next action.

A Work Item exporting an interface, schema, adapter, migration, evidence seam, or other Contract proves consumer sufficiency before acceptance. Internal activity, file completion, or helper-level tests are insufficient when a downstream consumer would still need hidden sequencing, storage knowledge, or invented behavior.

A stable `WI-*` ID is allocated only during Atlas publication. It is not recycled. A successor may reuse it only when Feature owner, responsibility, boundaries, consumer, and acceptance meaning remain materially unchanged. Otherwise disposition the old Work Item and allocate a new identity; rehoming requires its own named-human Atlas Decision.

Avoid items that mix unrelated responsibilities, conceal architecture decisions, have activity-only completion, duplicate a Map/Feature convergence obligation, or cannot reverse-map to Blueprint coverage, a Leg need, migration/operational work, cleanup, or evidence.
