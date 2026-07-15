# RFC Composition Adapter

Select an RFC basis for a technical direction, decision, or review action.

## Reader Contract

- Name the intended technical reader and any Case-backed action requested: approve a direction, reject it, request a bounded follow-up, or review a proposal. Keep a supplied exercise action distinct from Case-backed meaning.
- State the current decision, proposal, or uncertainty in the first composed unit. Do not imply approval when the selected Case entries do not carry it.
- When the selected direction is already accepted, do not ask the reader to approve it again. Either produce a decision record with no reader action, or record any supplied exercise review action as external context rather than Case authority.
- Use the pinned snapshot set as the only source of accepted meaning. Preserve the Case ID for every selected entry.

## Selection Manifest

Create `selection-manifest.md` beside the composition. Include:

- artifact ID, genre, reader action, Case IDs, and immutable snapshot IDs;
- selected entries, each with its intended RFC role and fully qualified reference;
- omitted or deferred entries, with a reader-facing reason;
- blocking gaps and conflicts that prevent the requested reader action;
- the recommended shaping strategy and whether it is a fit.

Select decisions, requirements, constraints, risks, alternatives, observations, and intent only when they affect the requested action. Historical or rejected entries may be selected as context, but label them as such. Do not use disputed entries as support for a recommendation.

## Composition Basis

Produce a draft basis in this order when the material fits:

1. Decision or review ask.
2. Context and scope.
3. Proposed or current direction.
4. Evidence, alternatives, and trade-offs.
5. Risks, open gaps, and requested follow-up.

The basis is not reader shaping. It must retain the selected entry references or stable semantic-unit labels so a later strategy can create anchors without rediscovering support.

## Stop Conditions

Stop and report a blocking gap when the Case cannot support the stated decision, the action is ambiguous, selected entries conflict without a resolved Case decision, or a material assertion would require new accepted meaning. If the intended action would authorize implementation, ownership, schedule, rollout, or another fact absent from the Case, narrow the action or route a bounded question to `case-reconcile`; do not silently repair the gap in the RFC.
