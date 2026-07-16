# Research Report Composition Adapter

Use this adapter for an evidence-heavy report that helps a named reader decide whether, how, or under what limits to act. It is a selection contract, not a prose template and not a claim that the report independently establishes authority.

**Structure mode:** adaptive. Evidence obligations matter; exact section order does not.

## Reader Contract

Record the intended reader, the reader action, and the decision boundary before selecting entries. State whether the report recommends an action, compares evidence, records a limitation, or asks for a decision. A recommendation must be qualified when the Case preserves uncertainty, limited authority, or unresolved support.

## Selection Manifest

Create a composition manifest beside the draft. Bind it to the exact Case IDs and retained Case-state IDs when available. For every selected entry, record its fully qualified reference, role, and handling:

| Handling | Use |
|---|---|
| `claim` | A material reader-facing conclusion or established fact. |
| `evidence` | Support, measurement, observation, or source limitation needed to assess a claim. |
| `context` | Historical or explanatory material that prevents a misleading reading. |
| `limitation` | Caveat, authority boundary, uncertainty, or scope limit the reader must see. |
| `decision` | Accepted direction or explicit reader decision request. |
| `omitted` | Selected but intentionally not reader-facing; state why and where it remains inspectable. |
| `deferred` | Relevant but not usable until a stated condition is met. |

For each omission or deferral, state whether it changes the reader action. Do not omit a contradictory observation, rejected alternative, or weak-authority claim when its absence would make a selected conclusion look stronger than the snapshot supports.

## Required Report Basis

The composition identifies, in compact form:

- the current reader action and any qualified recommendation;
- the evidence that supports and limits that action;
- contradictory findings and their current status;
- authority boundaries: evidence may establish an observed result without independently selecting policy;
- blocking gaps and deferrable gaps;
- material source limitations, including staleness, incomplete attribution, and unavailable support;
- the recommended shaping strategy, normally `evidence-synthesis` for this adapter.

Use a `blocking` gap when it prevents the stated reader action. Use a `deferrable` gap when the report can honestly proceed with an explicit limit. If a selected entry supplies a historical or rejected alternative, distinguish it from the current accepted direction rather than silently normalizing it away.

## Reconciliation Triggers

Stop and route to `document-reconcile` when composition would require a new accepted conclusion, a new policy choice, a change to authority or confidence, a material caveat not present in the pinned snapshot, or a claim that lacks snapshot support. A draft may say that an authority approved a decision only when the Case carries the relevant approval reference.

## Handoff

Hand `document-shape` the composition manifest, draft basis, pinned snapshot set, selected-entry handling, reader contract, and visible limitations. Do not trace, review, format, or publish here.
