# Domain Context

## Casebook

| Term | Definition | Avoid |
|---|---|---|
| Casebook workspace | The configured private working area for Cases, Frames, Documents, and retained artifacts, conventionally `.casebook/`. | Treating the workspace as workflow-runtime state or assuming privacy without checking repository visibility. |
| Case | Reusable knowledge about one bounded subject. A Case contains independently classifiable knowledge, sources, authority context, relationships, and retained rich artifacts when reduction would lose important meaning. | Using a Case as the mandatory format for every operation, a document draft, or an execution log. |
| Knowledge entry | One independently classifiable semantic unit in a Case whose support, authority, scope, and relationships can be assessed together. | Combining claims whose classification, support, authority, or scope differs. |
| Retained artifact | A readable research, prototype, deliberation, review, or modeling artifact kept when reducing it to Case entries would lose important argument, method, context, or reproducibility. | Requiring Prototype or Deliberate to implement a Case-specific return interface. |
| Frame | One resumable effort to guide a consequential, under-specified outcome from uncertainty toward human acceptance. It owns the outcome boundary, Frame Discovery, active authorization facts, limitations, and stable downstream-work references. | Treating Frame as a task scheduler, event log, fixed phase sequence, or substitute for human judgment. |
| Discovery map | A compact projection of unresolved fog, frontier questions, blockers, contestation, deferrals, and exclusions for one Frame. | Persisting assignments, routing instructions, operation history, confidence scores, or recommended next actions. |
| Document | One resumable effort to create an accepted durable reader-facing artifact from Case-backed or directly supplied evidence. It owns editorial intent, one authoritative semantic draft, artifact-local findings, representations, acceptance, and factual publication state. | Storing reusable subject meaning in the Document or treating a target file as proof of completion. |
| Prototype | A disposable artifact built to answer one explicit question through observable evidence and exactly one verdict: supported, rejected, or inconclusive. | Treating runnable prototype code as production-ready or requiring prototypes to persist through Casebook. |
| Deliberation | A bounded comparison of two or three credible alternatives through decision-specific forced perspectives, preserving consequential disagreement and remaining human judgment. | Voting, confidence averaging, fixed debate theater, or treating a recommendation as a decision. |

## Casebook Actors

| Term | Definition | Avoid |
|---|---|---|
| Architect | Human owner of design, consequential judgment, and semantic acceptance. | Treating agent recommendation or silence as Architect authority. |
| Steward | The Architect's Casebook interface for custody, continuity, session surfaces, briefing, and attention. | Making Steward a semantic owner or implementation coordinator. |
| Marshal | Actor that runs a delivery operation through Deliver, coordinating Hand work and Clerk engagement against an accepted Route. | Allowing coordination to override Clerk judgment, redesign accepted intent, or absorb Steward custody. |
| Clerk | Independent checker of conformance, evidence, and workmanship. | Coordinating the work it must independently judge or allowing Marshal to rewrite/suppress findings. |
| Hand | Actor performing bounded implementation or other execution work. | Making a Hand responsible for consequential design, coordination authority, or human acceptance. |

## Casebook Boundaries

- Cases own reusable subject meaning.
- Frames own active uncertainty and the route toward a bounded accepted outcome.
- Documents own reader-facing semantic artifacts and their factual representation, acceptance, and publication state.
- Prototype and Deliberate are standalone capabilities that Frame may invoke when useful; neither requires a Casebook-specific integration contract.
- Feature Atlas owns accepted delivery intent, Feature and Work Item identity, named Decisions, and canonical tracker representation.
- Workflow Runtime owns live execution, participants, operations, cancellation, recovery, and journal truth.
- Git, trackers, publication destinations, and other external systems remain authoritative for facts they own. Casebook records stable locators rather than replacing them.

## Document Language

| Term | Definition | Avoid |
|---|---|---|
| Semantic draft | The authoritative meaning-bearing Document revision from which target representations are produced. | Editing a target representation as an independent semantic authority. |
| Genre | The semantic obligations and reader outcome expected of a document, such as an RFC, PRD, research report, change brief, implementation report, explanation, or blog post. | Treating genre as a fixed visual template. |
| Reader-facing reference | A citation or evidence locator the intended audience can resolve. Internal Case IDs and private paths remain provenance by default. | Publishing private workflow locators as citations. |
| Stage | Write a non-final representation to a destination for faithful preview or revision. | Treating staging authorization as release authorization. |
| Release | Authorize a staged destination representation as final for its intended audience. | Assuming document acceptance authorizes publication. |
| Publication | The separately authorized destination-facing work of staging or releasing a representation and verifying the resulting remote state. | Treating a successful API response as verified publication. |

## Context Classification

| Term | Definition | Avoid |
|---|---|---|
| Accepted | Support establishes the current meaning; applicable authority is also present when meaning depends on a decision, policy, approval, ownership, or delegated judgment. | Treating every participant statement as accepted knowledge. |
| Provisional | Useful current meaning remains qualified by uncertainty. | Presenting provisional context as settled fact. |
| Contested | Material positions disagree and each position retains its own support, scope, and authority where applicable. | Silently selecting one position or collapsing disagreement into confidence. |
| Superseded | Earlier meaning has been replaced by later accepted meaning while remaining available to explain the change. | Deleting history needed to understand why meaning changed. |
