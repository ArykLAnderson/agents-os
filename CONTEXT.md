# Domain Context

## Document Workflow

| Term | Definition | Avoid |
|---|---|---|
| Case | Reusable subject context containing sources, classified statements, decisions, and unresolved tensions. A Case may support multiple documents. | Using Case for a single document run or draft. |
| Case workspace | The configured private working area for Cases and document sessions, conventionally `.cases/`. | Assuming private means inaccessible to other local users; it means not tracked by the repository. |
| Document intent | A human request to create or continue a document of a particular genre from the conversation and available evidence. | Treating document intent as authorization to publish. |
| Document session | One resumable effort to produce a document. It owns its workflow manifest, drafts, reviews, formatted outputs, and publication records, and may reference multiple Cases. | Storing document-specific workflow state in a reusable Case. |
| Document operation | A composable action selected to address a current document need, such as intake, reconciliation, composition, review, or publication. Operations may repeat, run out of order, or be omitted. | Calling document operations phases or requiring a linear pipeline. |
| Document state space | The meaningful conditions through which a document progresses toward fitness for its intended purpose and audience. The coordinator selects operations based on unmet conditions rather than sequence position. | Implementing a rigid state machine or fixed transition table. |
| Work classification | A lightweight assessment of document work as simple, substantial, or high-risk based on subject complexity, reuse, consequence, uncertainty, audience, and obligations. It determines whether durable Case intake and stronger checks are needed. | Inferring effort from genre, requested length, or source count alone. |
| Reader-facing reference | A citation or evidence locator that the intended audience can resolve. Internal Case IDs, private trace anchors, and local filesystem paths remain provenance and do not become reader-facing references by default. | Publishing local paths or private workflow locators as citations. |
| Visual complexity | A routing assessment for semantic visuals. Simple visuals have few nodes and relationships that deterministic HTML, SVG, or Mermaid can render reliably. Complex visuals contain loops, lanes, nested boundaries, many connectors, or status-dependent paths and should prefer validated image generation when available. | Selecting a visual route solely from file format preference or assuming SVG is reliable at every complexity. |
| Grounded concept | An idea the intended audience either brings as an explicit prerequisite or that the artifact has already introduced with enough meaning to support later use. | Treating a familiar term to the author as automatically available to the reader. |
| Closed reader model | The reader's sufficient map of the subject: what exists, who acts, what enters and persists, how parts relate or transform, what leaves, where the lifecycle ends, and which decisions remain outside the system. | Clear local prose that leaves the overall subject loosely bound or dependent on privileged context. |
| Hook | The genre-appropriate entry device that orients attention toward the actual subject and establishes a problem, observation, tension, promise, decision, or question the artifact will fulfill. | Atmospheric or in-medias-res openings that create expectations without grounding the world needed to understand them. |
| Semantic basis | A loose, supported intermediate organized into meaning clusters, relationships, tensions, examples, and caveats. It separates Case accounting from prose and may be freely recombined during shaping while remaining traceable. | Rendering Case entries in order or treating one entry as one sentence or paragraph. |
| Natural flow | Reader-visible progression in which sentences and paragraphs connect through subject, implication, contrast, question, or example rather than merely sharing source support. | Assuming complete trace coverage or grammatical correctness proves readability. |
| Visual anchor | A semantic-layer record that gives one meaning-bearing visual its reader question, narrative placement, takeaway, cognitive budget, required meaning, omissions, and forbidden implications before rendering. | A node-and-edge inventory, generation prompt, or late formatting request for a comprehensive diagram. |
| Explanatory beat | A unit of prose and optional visual shaped together so each contributes distinct work to one moment in the reader journey. | Dropping a complete system diagram beside prose after the narrative is already fixed. |
| Stage | Write a non-final representation to a destination for faithful preview or revision. | Treating staging authorization as authorization to release. |
| Release | Authorize a staged destination representation as final for its intended audience. | Using release for the first external write when that write remains a draft. |
| Publish workflow | The destination-facing lifecycle that may include staging, remote revision, verification, and release. | Using publish as an ambiguous synonym for every external mutation. |

## Context Classification

| Term | Definition | Avoid |
|---|---|---|
| Accepted | Context the workflow may rely on as settled for the current purpose. | Assuming every user or assistant statement is accepted. |
| Provisional | Plausible context that still requires confirmation or verification before consequential use. | Presenting provisional context as fact. |
| Contested | Context for which material sources or participants disagree. | Silently choosing one side. |
| Superseded | Context replaced by a later accepted statement or decision while retained for history. | Deleting prior context needed to understand a change. |
