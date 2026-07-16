# Adaptive Case-Backed Document Workflow

## Problem Statement

The current Case-backed document skills define useful individual capabilities, but they do not yet behave as one coherent document-production system. A human should be able to express document intent naturally, such as "draft an RFC from this chat" or "turn this into an HTML-formatted blog post," and have an agent guide a semi-automated process toward a high-quality result. Today, the human or agent must know which skills to invoke, in what order, what each operation expects, how state survives interruption, and how a failed quality check should recover.

The workflow must remain light. It should not become a rigid state machine, provenance ledger, synthetic test framework, or mandatory linear pipeline. It needs enough durable state to resume work, enough shared language to make operations interoperable, and enough quality gates to prevent unsupported or misleading documents. It must reuse context already present in the conversation and available sources before asking the human for information.

The current skill names also obscure that the skills form a bundle. Publication is overloaded: some destinations, particularly Notion, require a remotely staged draft for faithful review before a separate release decision. Storage also needs a safe convention that keeps working state out of version control without imposing personal or organization-specific paths.

## Solution

Introduce `document` as the coordinator and explicit entrypoint for an adaptive document lifecycle. Rename the existing capabilities as namespaced document operations:

- `document-intake`
- `document-reconcile`
- `document-compose`
- `document-shape`
- `document-trace`
- `document-review`
- `document-format`
- `document-publish`

The coordinator interprets document intent, establishes or resumes a document session, evaluates the document state space, and selects operations based on unmet quality conditions. It owns a lightweight, human-readable workflow manifest. Operations are not phases: they may repeat, run out of order, or be omitted when their quality purpose is already satisfied. Every operation returns a concise result describing changes, satisfied or invalidated conditions, blockers, and recommended next operations.

Reusable subject context lives in Cases. Document-specific state lives in document sessions. The configured Case workspace conventionally uses `.cases/`, with reusable context under `cases/<case-id>/` and document work under `documents/<document-id>/`. The workflow verifies that the configured workspace is not Git-visible before writing.

Genre and destination adapters extend the universal workflow conditions. Genre adapters define semantic obligations, reader outcomes, and whether structure is adaptive, recommended, or required. Destination adapters define representation constraints, available visual routes, remote staging behavior, and whether stage and release are distinct operations.

The publish workflow distinguishes staging from release. A staged remote artifact may become the authoritative presentation artifact for review when local rendering cannot faithfully represent the destination. Release requires separate destination-specific authorization.

## User Stories

1. As a human author, I want to request a document in natural language, so that I do not need to know the skill bundle or operation order.
2. As a human author, I want to invoke `document` explicitly, so that I can intentionally begin or resume the full workflow.
3. As an experienced user, I want to invoke an individual `document-*` operation directly, so that I can perform focused work or recover a specific quality condition.
4. As an AI coordinator, I want document intent to include genre, purpose, audience, and available evidence, so that I can choose suitable operations.
5. As an AI coordinator, I want to infer the active topic thread rather than ingest the entire conversation blindly, so that unrelated discussion does not pollute the document.
6. As a human author, I want existing information in the conversation to be reused automatically, so that I am not asked questions I have already answered.
7. As an AI coordinator, I want to inspect the conversation, referenced Cases, supplied files, and permitted project context before asking for clarification, so that clarification is reserved for real gaps.
8. As a human author, I want related clarification questions grouped into a short round, so that the workflow is efficient without imposing an artificial one-question limit.
9. As a human author, I want clarification to stop when the document is sufficiently supported, so that I am not subjected to an endless interview in pursuit of completeness.
10. As an AI coordinator, I want to narrow scope, disclose uncertainty, or pause when many material gaps remain, so that weak context does not produce falsely authoritative output.
11. As an AI coordinator, I want context classified consistently regardless of whether it came from initial intake, prior chat, investigation, or later clarification, so that collection path does not change authority.
12. As a human author, I want clear statements and corrections treated as accepted context while tentative ideas remain provisional, so that brainstorming is not silently promoted into requirements.
13. As a reviewer, I want contested and superseded context retained, so that disagreements and changes remain understandable.
14. As a document maintainer, I want source entries to retain a locator and contextual quote when available, so that consequential claims can be checked later.
15. As a document maintainer, I want missing source links to be non-blocking when adequate quotation or source notes exist, so that the workflow remains portable across chat and source systems.
16. As a reader, I want reader-facing citations to use the strongest accessible original source, so that citations are useful to the intended audience.
17. As a human author, I want private chat links or verbatim quotes withheld from reader-facing output unless I authorize them, so that internal traceability does not cause accidental disclosure.
18. As an internal reader, I want ordinary company-internal sources cited normally when they are accessible to the intended audience, so that the workflow does not overstate privacy concerns.
19. As an AI coordinator, I want every session to know its intended audience and distribution boundary, so that source access, disclosure, citations, and formatting are evaluated correctly.
20. As a human author, I want an audience or distribution change treated as material, so that an internal draft is not released externally without renewed checks.
21. As a subject-matter owner, I want reusable context separated from document-specific state, so that one Case can support multiple documents without accumulating draft mechanics.
22. As a document author, I want one document session to reference multiple Cases or direct sources, so that cross-domain documents do not require a synthetic host Case.
23. As an AI coordinator, I want to resume a clearly matching document session automatically, so that interrupted work continues smoothly.
24. As a human author, I want a short candidate list when several sessions could match a resume request, so that unrelated documents are never merged implicitly.
25. As an AI coordinator, I want a lightweight manifest recording current facts and unmet conditions, so that the workflow can resume without replaying the conversation.
26. As a human collaborator, I want the manifest to remain readable and compact, so that workflow state does not become bureaucratic acceptance evidence.
27. As an AI coordinator, I want operations to report what they changed and what conditions they affected, so that one coordinator can maintain consistent session state.
28. As an operation invoked directly, I want to proceed when I have the capability-oriented inputs I need, so that I am not blocked solely by unconventional ordering.
29. As an operation with a trivial missing input, I want to recover it from available context, so that direct invocation remains useful.
30. As an operation with material missing prerequisites, I want to hand control to `document`, so that I do not duplicate coordinator logic.
31. As an AI coordinator, I want a small universal set of document conditions, so that operation selection is stable across genres without becoming a fixed transition table.
32. As a genre adapter, I want to add semantic obligations and quality conditions, so that genre-specific completeness is enforced at the adapter seam.
33. As a destination adapter, I want to add representation and publication conditions, so that target-specific behavior does not leak into the coordinator.
34. As a genre adapter author, I want to declare structure as adaptive, recommended, or required, so that both flexible writing and stable organizational templates are supported.
35. As a human author, I want one primary genre adapter plus optional organization or destination constraints, so that requirements compose without blending incompatible primary genres.
36. As a human author, I want a genre change to preserve reusable work, so that discovering the document is a decision brief rather than an RFC does not force a restart.
37. As an AI coordinator, I want to create semantic substance through `document-compose`, so that claims, requirements, decisions, and caveats come from supported context.
38. As an AI coordinator, I want to reorganize existing substance through `document-shape`, so that the reader journey improves without unsupported meaning being invented.
39. As a document author, I want compose and shape to be repeatable in either order, so that restructuring can expose missing content and new content can require reshaping.
40. As a document maintainer, I want material edits to invalidate affected trace, review, checkpoint, and representation conditions, so that old quality evidence is not trusted blindly.
41. As a document maintainer, I want grammar, formatting, and meaning-preserving restructuring treated as non-material, so that trivial edits do not force ceremonial rework.
42. As an AI coordinator, I want tracing selected according to genre, consequence, evidence, citation, and maintenance needs, so that low-risk documents avoid unnecessary formality.
43. As a reviewer, I want material claims, decisions, requirements, evidence synthesis, and meaning-bearing visuals mapped to understandable Case entries or sources, so that consequential content is supportable.
44. As a human author, I want lightweight traceability rather than line-level provenance, hashes, or immutable ledgers, so that the system remains usable.
45. As an AI coordinator, I want review lenses selected according to genre, risk, representation, and unresolved conditions, so that review effort is purposeful.
46. As a reviewer, I want fresh-reader review isolated from author reasoning when possible, so that comprehension problems are not hidden by privileged context.
47. As a fidelity reviewer, I want the relevant Cases and trace material, so that I can compare the artifact with accepted context.
48. As an AI coordinator, I want subagents used frequently for fresh perspective, independent investigation, and context preservation when available, so that review and research benefit from isolation.
49. As a portable skill user, I want the workflow to remain functional without subagents, so that execution is not tied to one harness.
50. As an AI coordinator, I want subagents to receive minimal self-contained packets and explicit authority limits, so that delegated work remains focused and safe.
51. As a human author, I want the coordinator to reconcile ordinary subagent disagreement, so that I am asked only about material ambiguity or authorial preference.
52. As a reviewer, I want findings classified as blocking or disclosable, so that honest limitations do not automatically prevent completion.
53. As a human author, I want only purpose-undermining or misleading gaps to block completion, so that uncertainty can be documented when appropriate.
54. As a human author, I want the final formatted output to be the normal review checkpoint, so that routine document production does not require approval at every operation.
55. As a human author of a long or risky document, I want intermediate outline or semantic checkpoints when they prevent material rework, so that the workflow adapts to document risk.
56. As an AI coordinator, I want to request an intermediate decision when evidence cannot resolve competing interpretations, so that authorial choices remain human-owned.
57. As a human author, I want material post-approval edits to invalidate approval while editorial changes do not, so that approval remains meaningful without being fragile.
58. As a formatter, I want target adapters to choose visual routes based on reader need, editability, accessibility, information type, and rendering support, so that visuals are appropriate rather than image-first.
59. As a technical reader, I want Mermaid used where editable technical relationships and flows are most useful, so that diagrams remain maintainable.
60. As a reader, I want SVG or semantic HTML used where precision, accessibility, or layout control matters, so that exact diagrams render reliably.
61. As a reader, I want generated images reserved for illustrative or conceptual communication, so that imprecise visuals do not replace structural diagrams.
62. As a reader, I want prose or tables used when a visual would add no comprehension, so that decoration does not obscure information.
63. As a formatter, I want to make only meaning-preserving target transformations, so that formatting does not become hidden authorship.
64. As a formatter, I want semantic target constraints returned to the coordinator, so that compose or shape can revise content through the correct operation.
65. As a human author, I want a faithful local preview when the target supports it, so that final review reflects the intended representation.
66. As a human author, I want a remote staged draft when exact local preview is impossible, so that I can review the real destination rendering before release.
67. As a publisher, I want stage and release treated as separate authorizations, so that permission to create a draft never implies permission to make it final.
68. As a destination adapter, I want to disclose when stage and release collapse into one externally visible write, so that the human understands the consequence before authorization.
69. As a publisher, I want destination identity, operation mode, artifact revision, audience, and write scope confirmed before external mutation, so that authorization is destination-specific.
70. As a collaborator, I want remote edits fetched and compared before updates or release, so that my changes are not overwritten by a stale local copy.
71. As an AI coordinator, I want material collaborator edits treated as new document context, so that affected checks rerun against the actual artifact.
72. As a document maintainer, I want a remote draft imported back when reliable round-trip support exists, so that the session has an up-to-date authoritative artifact.
73. As a document maintainer, I want remote authority and local divergence recorded when round-trip support is unreliable, so that synchronization is never falsely claimed.
74. As a publisher, I want a lightweight recovery path before destructive replacement or material remote updates, so that prior content can be restored.
75. As a human author, I want append-only and low-risk edits to avoid ceremonial rollback records, so that safety remains proportional.
76. As a publisher, I want semantic conflicts returned to the coordinator rather than resolved inside publication mechanics, so that external mutation remains separate from authorship.
77. As a human author, I want publication support to remain provider-neutral while only implementing destinations with safe existing adapters, so that the core does not speculate about unsupported APIs.
78. As a human author, I want unsupported destinations to produce a ready local artifact and manual handoff, so that lack of an adapter does not block completion.
79. As a human author, I want a document to be complete without being published, so that local deliverables are first-class outcomes.
80. As a human author, I want completion to include a soft publication handoff, so that I can stage or release the document without confusing approval with authorization.
81. As an AI coordinator, I want document completion to require a fit-for-purpose final representation, no unresolved blocking findings, no relevant stale checks, and satisfied human checkpoints, so that completion is evidence-based.
82. As a human author, I want remaining non-blocking limitations recorded, so that completion does not hide uncertainty.
83. As a document maintainer, I want major semantic checkpoints retained as milestone revisions, so that approved directions and rollback points survive without a complete revision tree.
84. As a document maintainer, I want intermediate drafts pruned when they no longer aid review, recovery, or explanation, so that the workspace stays light.
85. As a subject-matter owner, I want source Cases retained even when document drafts are pruned, so that reusable context is never deleted automatically.
86. As a project contributor, I want the default Case workspace to be `.cases/`, so that private workflow state has a recognizable project-local convention.
87. As a project contributor, I want `.cases/` added to `.gitignore` when the convention should be shared, so that collaborators inherit the safety rule.
88. As an individual contributor, I want `.git/info/exclude` recommended when I do not want to change `.gitignore`, so that local privacy does not require a repository change.
89. As a user with another storage preference, I want to configure an alternative Case workspace, so that the convention is not mandatory.
90. As a safety-conscious user, I want the workflow to verify that the configured Case workspace is not Git-visible before writing, so that setup assumptions cannot leak artifacts.
91. As a maintainer, I want old skill names removed rather than kept as aliases, so that discovery remains clear and the new namespace becomes canonical.
92. As a maintainer, I want shared behavior centralized in `document` and a small set of contracts, so that phase-like policy is not duplicated across operations.
93. As a maintainer, I want each operation to state its inputs, outputs, quality purpose, and return conditions, so that direct and coordinated invocation are predictable.
94. As a maintainer, I want generated adapters regenerated from canonical sources, so that generated files remain disposable rather than authoritative.
95. As a maintainer, I want repository validation and structured skill audits to verify this feature, so that verification matches the prompt-and-resource system being built.
96. As a maintainer, I want one realistic HTML-formatted blog-post dry run, so that natural routing, adaptive operations, formatting, review, and publication handoff are exercised end to end.
97. As a maintainer, I want the dry run to stop before external writes unless separately authorized, so that acceptance verification cannot accidentally publish.
98. As a maintainer, I do not want workflow runtime tests, mocked conversations, or synthetic document-quality harnesses, so that the implementation stays proportional.

## Implementation Decisions

### Coordinator Seam

- `document` is the highest coordination seam and the normal entrypoint for document intent. It is both model-invoked through natural language and explicitly user-invocable.
- The coordinator owns document-session state. It evaluates current conditions, chooses useful document operations, consolidates their results, and decides whether to continue, clarify, request a checkpoint, stage remotely, complete locally, or offer release.
- The coordinator does not enforce a phase sequence. It may use an opinionated default lifecycle as guidance, but operation selection is based on unmet conditions and capability-oriented prerequisites.
- Routine reversible choices may remain silent. The coordinator communicates when starting substantial work, changing scope, requesting clarification, encountering blockers, asking for checkpoints, staging remotely, or requesting release authorization.
- Existing conversation context is an available source. The coordinator infers the active topic boundary and gathers relevant prior statements before asking the human for information.
- Clarification follows this escalation order: recheck conversation and Case context; inspect supplied and permitted local sources; perform already-authorized bounded investigation; ask one focused round of related questions; then narrow scope, disclose an assumption, or pause.
- A clarification round should normally contain no more than a handful of material questions. Sequential questions are appropriate only when each answer changes what should be asked next.
- The coordinator uses subagents often when available and useful for context isolation, independent investigation, parallel source work, or fresh review. Portability requires a single-agent fallback.

### Universal Document Conditions

The coordinator reasons over a small universal core. These are conditions, not states in a formal state machine:

- Document intent, intended audience, and distribution boundary are understood sufficiently for the current work.
- Context is sufficient for the document's purpose; material conflicts are resolved, represented as contested, or disclosed.
- A fit-for-purpose semantic artifact exists.
- Material claims, decisions, requirements, evidence synthesis, citations, and meaning-bearing visuals are traceable when genre, consequence, or reader trust requires it.
- No unresolved blocking review finding remains unless the human explicitly overrides it with a short reason.
- The intended local or staged target representation has been inspected sufficiently for its destination.
- Adaptive human checkpoints required by length, risk, uncertainty, or prior decisions are satisfied.
- External staging and release have separate, explicit destination-specific authorization whenever the adapter distinguishes them.
- Release has been fetched or otherwise verified when publication was requested.

Genre, organization, and destination adapters may contribute additional conditions. The manifest records applicable conditions and current evidence without encoding valid transition tables.

### Operation Seam

- The eight namespaced skills are document operations, not phases.
- Each operation declares its quality purpose, required capabilities or inputs, outputs, conditions it may satisfy, conditions it may invalidate, blockers it can return, and circumstances in which control should return to `document`.
- Every operation returns a concise common result:
  - work performed;
  - Cases, artifacts, or remote representations changed;
  - conditions satisfied;
  - conditions invalidated or made stale;
  - blocking and disclosable findings;
  - recommended next operations.
- Operations do not independently own the session manifest. `document` records their returned results. A directly invoked operation may create or update minimal durable session state only when ongoing coordination is useful.
- Direct invocation proceeds based on available capabilities, not proof that earlier operations ran. Trivial missing inputs may be recovered from conversation or configured workspace context. Material workflow gaps return to `document`.
- `document-intake` and `document-reconcile` may operate on reusable Cases without creating a document session.
- `document-compose` creates or materially expands semantic content. It decides what supported substance the document contains.
- `document-shape` organizes supported semantic content around a reader journey or decision need. It must not invent unsupported substance.
- `document-trace` maps consequential content to understandable Case entries or named sources. It is selected by genre and risk rather than required universally.
- `document-review` selects relevant isolated lenses and returns one consolidated finding register. Review lenses remain resources rather than separate public skills.
- `document-format` creates a target representation and may make only meaning-preserving transformations. Semantic revision needs return to `document`.
- `document-publish` owns external mutation, destination fetches, staging, remote conflict detection, recovery preparation, release, and destination verification. It does not own semantic authorship or duplicate document review.

### Case Contract

- A Case is reusable subject context and may support multiple document sessions.
- A Case contains source references, normalized context entries, classifications, accepted decisions, unresolved tensions, conflicts, and supersession relationships.
- Context classification uses exactly these core statuses:
  - `accepted`: settled enough to rely on for the current purpose;
  - `provisional`: plausible but requiring confirmation or verification before consequential use;
  - `contested`: materially disputed by sources or participants;
  - `superseded`: replaced by later accepted context but retained for understanding.
- Provenance such as author-provided, assistant-suggested, investigated, or extracted is distinct from classification.
- Addressable sources should retain a best-effort locator and a short exact quote with enough local context to verify consequential meaning. Speaker or source identity and relevant extraction context should be retained when useful.
- Missing locators are not blocking when adequate quotation or source notes exist.
- Explicit user decisions and corrections may become accepted context. Tentative ideas, alternatives, and assistant-generated suggestions remain provisional until confirmed or independently supported.
- Durable subject context discovered during drafting or review returns to the Case under the same classification rules. Conflicts with accepted context invoke reconciliation rather than silent replacement.
- Reader-facing citations prefer the strongest source accessible to the intended audience. Internal trace records also identify the Case entry that justified use.
- Verbatim or identifying private source material requires human authorization before reader-facing use. Internal sources generally accessible to the intended internal audience do not require artificial disclosure warnings.

### Document Session Manifest

- The manifest is lightweight, human-readable coordination state, not an event log or provenance ledger.
- It records:
  - document intent and working title or topic;
  - intended audience and distribution boundary;
  - referenced Cases and direct sources;
  - primary genre adapter and optional organization or destination constraint adapters;
  - adapter structure modes;
  - applicable universal and adapter-contributed conditions;
  - completed and stale checks;
  - unresolved blocking and disclosable findings;
  - current semantic and target artifact paths or locators;
  - simple revision identifiers and retained milestone revisions;
  - human checkpoints and whether material edits invalidated them;
  - staging, remote-authority, release, and publication-verification status;
  - recommended next operations.
- It references operation-owned details rather than duplicating every trace, review, or publication record.
- It does not require cryptographic hashes, commit fingerprints, event sourcing, or exhaustive transition history.
- Resume matching uses active conversation context, genre, title or topic, referenced Cases, and recent manifests. Automatic resume requires one clearly dominant candidate; otherwise the coordinator asks the human to choose.
- Two sessions are never merged implicitly.

### Materiality and Staleness

- A material change alters a claim, decision, requirement, recommendation, scope boundary, risk, evidence interpretation, intended audience, distribution boundary, or meaning-bearing visual.
- Material changes invalidate only affected trace, review, checkpoint, citation, disclosure, or representation conditions.
- Grammar, formatting, and meaning-preserving restructuring are non-material.
- When materiality is uncertain, the coordinator reruns the relevant check rather than asking the human.
- The workflow uses simple revision identifiers and explicit stale markers. It does not require immutable artifacts or content digests.

### Genre and Constraint Adapters

- One primary genre adapter defines semantic obligations and reader outcomes.
- Optional constraint adapters may add organization templates or destination requirements.
- A genre adapter declares its structure mode as `adaptive`, `recommended`, or `required`.
- Initial generic adapters should favor adaptive semantic obligations rather than deterministic section templates unless an existing external contract requires stability.
- Switching the primary genre adapter is permitted and preserves reusable work. The coordinator reevaluates genre-specific conditions.
- Two primary genres are not blended implicitly. Distinct deliverables become sibling document sessions that may share Cases.
- Adapter choice is inferred from intended outcome, audience, and decision stage. The coordinator asks only when plausible alternatives would materially change evidence or structure.

### Review and Recovery

- Review lenses are selected according to genre, risk, representation, and unresolved conditions.
- Case fidelity and fresh-reader comprehension are defaults for substantive Case-backed documents. Genre review applies when a genre adapter defines obligations. Editorial review applies before completion. Presentation review applies only when a target representation exists.
- Fresh-reader review should receive the artifact, audience, and purpose while intentionally omitting author reasoning and prior review discussion unless needed by the selected lens.
- Fidelity review receives relevant Case and trace context.
- Review returns consolidated findings classified as blocking or disclosable.
- A finding blocks completion only when it undermines the document's purpose or could materially mislead the intended reader. Other uncertainty appears as an assumption, limitation, risk, or open question.
- Only the human may override a blocking finding. The override includes a short reason.
- Review identifies the evidence or revision need but does not duplicate investigation, intake, composition, shaping, tracing, formatting, or publication behavior. The coordinator routes recovery to the suitable operation and reruns affected checks.

### Human Checkpoints

- Final-output review is the normal checkpoint.
- Intermediate checkpoints are selected adaptively for long, high-risk, structurally uncertain, or interpretively ambiguous documents, or when the human asks for one.
- The coordinator may request an outline or section checkpoint when it prevents substantial rework.
- It may request an authorial decision when evidence cannot resolve competing interpretations.
- Material semantic edits after approval invalidate the affected approval. Editorial and formatting-only changes do not.
- Document approval never authorizes external staging or release.

### Formatting and Visuals

- The final output is the best available target representation, not merely semantic Markdown.
- Destination adapters define supported and preferred visual routes. There is no global generated-image-first hierarchy.
- Mermaid is appropriate for editable technical relationships and flows.
- SVG or semantic HTML is appropriate for precise, accessible, layout-controlled diagrams.
- Generated images are appropriate for illustrative, conceptual, or presentation-oriented communication where exact structure matters less.
- Prose and tables are preferred when a diagram would not materially improve comprehension.
- A material visual records the reader question it answers and the selected route. Decorative choices do not require workflow paperwork.
- Lack of image-generation capability cannot block an otherwise complete document. The adapter chooses an available fallback.
- When exact pre-publication rendering is impossible, the workflow discloses that limitation and may stage remotely for faithful review.

### Publish Workflow

- `document-publish` retains its recognizable public intent while owning the full destination-facing publish workflow.
- Canonical modes are:
  - `stage`: write a non-final destination representation for preview or revision;
  - `release`: authorize the destination representation as final for its intended audience.
- A destination adapter maps stage and release to native operations. If the destination has no draft semantics, it states that stage and release collapse into one externally visible write before requesting authorization.
- All external mutations remain within `document-publish`, including remote draft staging requested by the coordinator during formatting or review.
- Stage authorization does not authorize release. Both are destination-specific and identify the target, operation mode, artifact revision, intended audience, and write scope.
- For a remote-review lifecycle, the coordinator may run `document-format`, `document-publish(stage)`, `document-review`, semantic recovery operations, and `document-publish(release)` in whatever order current conditions require.
- Before updating or releasing a staged draft, fetch the current remote representation when supported and compare it semantically with the last observed revision.
- Preserve unfamiliar collaborator edits. Material conflicts return to the coordinator rather than being overwritten.
- Reliable round-trip adapters import the staged representation back as the latest artifact revision. When reliable import is unavailable, the remote draft is authoritative for presentation while local semantic source remains supporting material; the manifest records divergence.
- Before destructive replacement or material update, preserve a recoverable destination revision, fetched snapshot, or local restoration copy. Append-only low-risk edits do not require ceremonial rollback records.
- Release is verified by fetching or inspecting the resulting destination representation before success is claimed.
- Unsupported destinations produce a ready local artifact and manual handoff rather than speculative API behavior.

### Storage and Retention

- The conventional Case workspace is project-local `.cases/`.
- The internal convention is:

  ```text
  .cases/
    cases/<case-id>/
    documents/<document-id>/
  ```

- A configured alternative workspace is allowed.
- Before writing, the workflow verifies that the effective workspace is not Git-visible.
- Prefer `.gitignore` when the convention should be shared with collaborators. If the human does not want to modify `.gitignore`, recommend `.git/info/exclude`.
- When no safe preference has been established, guide the human through one-time selection rather than silently choosing an external personal path.
- The base skill family does not define installer mechanics or contain product, organization, or personal path instructions.
- Retain the current semantic artifact, current target representation, and milestone revisions useful for accepted direction, pre-reconciliation comparison, remote staging, or rollback.
- Milestone retention is automatic and lightweight. Intermediate drafts may be pruned when no longer useful.
- Human-approved milestone revisions are not deleted without confirmation. Source Cases are never deleted automatically.

### Completion and Handoff

- A document workflow is complete when:
  - the intended final local or staged representation exists;
  - applicable universal and adapter conditions are satisfied;
  - no unresolved blocking finding remains unless explicitly overridden;
  - no relevant quality check or human checkpoint is stale;
  - required adaptive human review is complete;
  - remaining non-blocking limitations and optional next actions are recorded.
- Publication is not required for document completion.
- Completion ends with a soft publication handoff when a publishable target exists. The coordinator summarizes readiness and limitations, identifies compatible destinations, and asks whether the human wants to stage or release.
- If publication is declined or deferred, mark the document complete and publication pending or not requested.
- If accepted, collect destination-specific authorization and invoke `document-publish` in the requested mode.

### Naming and Migration

- Rename the existing skills to the `document-*` namespace.
- Do not retain compatibility wrappers or aliases for old names because the current names are not a stable released contract.
- Update all cross-skill references and descriptions to use operation and state-space language rather than phase and pipeline language.
- Keep `document-publish` despite its broader lifecycle because its natural intent remains recognizable.
- Canonical `src/` skill sources remain authoritative. Generated adapter output remains disposable and ignored by version control.
- `CONTEXT.md` owns the canonical terms established by this feature: Case, Case workspace, document intent, document session, document operation, document state space, stage, release, publish workflow, and context classifications.

## Testing Decisions

- Verification evaluates the skill package and its observable guidance, not a nonexistent workflow runtime.
- Run the repository's existing source validation and generation checks. These confirm repository integrity and adapter generation; they are not document-quality tests.
- Inspect generated adapters to ensure canonical skill names, descriptions, resources, and cross-skill references install correctly.
- Perform structured closure audits at the coordinator, operation, Case/manifest contract, adapter, review/recovery, storage, and publish-workflow seams.
- Audit walkthroughs should confirm at least:
  - natural document intent routes to `document`;
  - direct operation requests route to the intended `document-*` skill;
  - conversation context is reused before clarification;
  - operation selection responds to unmet conditions rather than fixed order;
  - material edits invalidate affected checks;
  - adaptive checkpoints do not force approval after every operation;
  - stage and release require distinct authorization where supported;
  - `.cases/` safety is verified before writes;
  - interruption and resumption are understandable from the lightweight manifest.
- Conduct one practical acceptance dry run using a realistic request to draft an HTML-formatted blog post.
- The dry run should exercise natural routing, conversation-first intake, genre adaptation, composition, reader-oriented shaping, selective tracing, review-driven recovery, HTML formatting, visual-route selection when useful, final rendered review, and a soft publication handoff.
- The dry run stops before external mutation unless staging or release receives separate explicit authorization.
- Findings from the dry run should result in bounded corrections to instructions or contracts, not automatic expansion into a workflow engine.
- Do not add workflow runtime code, mocked-conversation fixtures, synthetic document-quality tests, or a permanent end-to-end test harness.
- The pre-existing repository doctor failure concerning an unrelated excluded skill is not a feature regression, but validation results must report it accurately if it remains.

## Out of Scope

- A formal workflow runtime, database, rigid state machine, or transition table.
- Cryptographic artifact hashes, commit fingerprints, immutable provenance ledgers, event sourcing, or complete revision history.
- Automated document-generation quality scoring or document-quality test infrastructure.
- A new installer subsystem or formal installation contract.
- Product-specific, organization-specific, or personal setup instructions in the generic skill family.
- The contribution port or `INSTALL.md` for `mercari-growth-ai-resources`; that is separate work after local validation.
- Compatibility aliases for `case-intake`, `case-reconcile`, `compose-document`, `shape-document`, `trace-artifact`, `review-document`, `format-document`, or `publish-document`.
- Continuous dependency tracking between Cases and every document that references them.
- A generalized enterprise data-classification framework.
- Automatic reader-facing disclosure of internal sources that are normally accessible to the intended internal audience.
- Concrete publication implementations for destinations without safe existing adapters.
- Implicit merging of document sessions or primary genre adapters.
- Mandatory tracing, every review lens, generated imagery, remote staging, or publication for every document.
- Automatic production of a PRD, RFC, blog post, or other document merely because the workflow skill was installed.

## Further Notes

- The intended first proving ground is the generic Agent OS implementation in PR `#3`, tested under the user's personal constraints without introducing personal paths or organization-specific behavior.
- After remediation and the HTML blog-post dry run, contribution to `mercari-growth-ai-resources` should be tracked as separate work with its own setup documentation.
- Destination staging and release semantics are consequential enough to merit an ADR if this repository adopts ADRs in the future. No ADR structure currently exists, so this spec records the decision without creating an unsupported documentation system.
- The initial adapter set should remain flexible unless an adapter already represents an external stable template. Adapter-specific rigidity can be added later without changing the coordinator seam.
