# Behavior-To-Design Coverage

Maintain an explicit many-to-many coverage model from every accepted behavior and material quality to its design disposition.

For each obligation identify:

- authoritative Frame/Case entry and exact examined revision;
- responsible module or modules and lifecycle owner;
- governing Contract, state, failure, and schema semantics;
- relevant consumer walkthroughs;
- prototypes, repository evidence, or assurance evidence;
- unresolved Finding, limitation, or explicit deferral with owner and acceptance effect; and
- reverse links from each design element to the behavior it serves.

One behavior may require several modules; one module may serve many behaviors. Do not force a one-to-one table. Also reverse-check every module, Contract surface, state, and schema against an accepted need, material quality, or justified operational requirement.

Coverage exposes rather than conceals gaps. Invalid states include:

- accepted behavior with no responsible design element or explicit Finding;
- a responsibility spanning modules with no canonical authority or reconciliation rule;
- Contract surface, state, or schema with no accepted consumer need, quality obligation, or justified operational requirement;
- evidence that does not test the claim it supports;
- provisional or superseded knowledge presented as accepted authority;
- deferred behavior without an owner, rationale, or effect on current acceptance;
- `N/A` used for an unknown, unsupported claim, or undecided owner; or
- implementation work masquerading as architecture coverage.

Coverage is sufficient when every material forward and reverse mapping is resolved or explicitly visible for Architect disposition and Route would not need to invent behavior or architecture to explain why an element exists. A table is optional; semantic coverage is not. Keep the representation proportional to risk.
