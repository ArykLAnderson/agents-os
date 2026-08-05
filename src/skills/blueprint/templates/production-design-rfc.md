# Production Design RFC: <outcome>

> Lossless reader-facing projection from one fixed Design/RFC Case revision. The Case remains sole semantic design authority. Document governs editorial projection and representation; semantic change returns to the Case before rematerialization.

**Status:** materialized-review | accepted | superseded
**Readiness:** fresh-worker executable candidate | fresh-worker executable — <blockers/evidence>
**Source Design/RFC Case:** <identity/fixed revision>
**Materialization receipt:** <document identity/editorial revision>
**Frame boundary:** <locator/revision>
**Evidence considered:** <locators and limits>
**Exact HTML representation:** <identity/path/revision/checksum/browser state>
**Draft Atlas handoff:** non-authoritative/non-materializable — <blockers>

> This is an architecture explanation for a reader returning cold—not a Case dump, compliance form, or Markdown file placed inside HTML.

## Build the story before the document

Write an eight-sentence **explanatory spine** before drafting. Each sentence answers the question created by the previous one:

1. **Situation:** What is the product or system trying to accomplish, and where does this design sit?
2. **Tension:** Why can the obvious or current approach not safely deliver that outcome?
3. **Decisive move:** What single architectural idea resolves that tension?
4. **Consequent shape:** Which owners, boundaries, and contracts necessarily follow?
5. **Complete story:** How does one representative instance travel from entry to recognizable outcome?
6. **Stress story:** What revealing interruption or failure demonstrates why the shape is necessary?
7. **Realization:** How will one vertical route build and prove the design without invention?
8. **Decision:** What does accepting this exact representation settle, and what remains unauthorized?

This spine—not the Case's storage categories and not the headings below—is the document's primary structure. Choose a Document Shape strategy that serves it; a Production Design RFC usually uses a **mental model** journey and closes as a short **review briefing**.

Draft headings from the actual story. They may combine several beats or spend more than one section on a difficult beat. The only ordering rule is causal: ground a concept before depending on it, and make each primary section inherit a live question from the previous one.

If a consequential Case claim resists the spine, preserve fidelity first. Restructure the explanation, introduce a prerequisite, or place supporting detail in a compact appendix with an explicit trace. Never distort or silently omit Case meaning to improve the story; never flatten the main narrative into Case categories to prove coverage.

## What the main narrative must accomplish

These are completion tests, not a table of contents.

### Orient

A cold reader can locate the design inside the product journey and relevant global architecture, identify the precise “you are here” boundary, state the recognizable outcome, and explain the consequential weakness of the current/obvious approach. Include only context needed to make the design legible; wider project context is not permission to invent global architecture.

### Teach the decisive move

The reader can explain the architecture's central distinction, invariant, or authority move in plain language before naming modules. Show the selected shape and old/current → selected change on one screen. Introduce owners, state, contracts, operations, and recovery as consequences of that move, including what each owner deliberately does not own.

### Follow one complete instance

The reader can narrate one representative instance through accepted intent, state transitions, effects and observations, convergence/proof, consumer-visible outcome, and material renewal or terminal behavior. Internal movement IDs may annotate the story but may not become the story. Every transition states what becomes true, who owns that truth, and why the next transition is now possible.

### Stress the design

The reader can follow one representative applicable failure from interruption through persisted fact, restart/re-observation, bounded retry or refusal, attention/repair, and consumer-visible status. For irreversible external effects, make the crash interval explicit:

| Persisted fact before call | Effect / interruption interval | Restart observation | Is another effect allowed? | Consumer-visible status |
|---|---|---|---|---|
| | | | | |

Secondary failures belong in a compact matrix or appendix unless one changes the central model.

### Explain realization and proof

The reader can see one simplified vertical route, its immediate consumers, direct prerequisites, owners, convergence owner, and proof placement without choosing missing architecture:

| Movement | Immediate consumer | Direct prerequisite | Owner | Proof at consumer | Invention prohibited |
|---|---|---|---|---|---|
| | | | | | |

Keep evidence limits, alternatives, intentional simplifications, deferrals, security/privacy/compatibility constraints, and operations beside the decision or seam they explain. Put exhaustive lookup material in appendices.

Include the non-authoritative draft Atlas handoff as part of this realization boundary, not as a new narrative climax. Show: fixed Case → exact accepted RFC → exact human-accepted Map Decision → configured-guide publication/reread → separately authorized implementation dispatch. Name all currently missing inputs as blockers. Use `../contracts/atlas-handoff.md`; do not create accepted Atlas state or invent Feature/Work Item decomposition. Atlas later binds to the accepted RFC externally; do not revise an accepted RFC merely to embed a later Atlas identity.

### Close on the decision

The final primary beat states the selected design, material rejected alternatives, remaining gates and invalidation triggers, exact HTML identity, and the precise consequence of acceptance. It explicitly withholds implementation, Atlas publication, provider effects, credentials, source edits, commits, deployment, release, and any other ungranted authority. The reader reaches this question with the complete architecture already in mind.

## Commission visuals; do not fill visual quotas

Create a visual only when spatial, temporal, structural, or comparative relationships are materially clearer than prose. Before rendering it, record:

- **Reader question** it answers;
- one-sentence **takeaway**;
- already-grounded **prerequisites**;
- **must-show** relationships, order, forks, state, or comparison;
- **forbidden implication** it must avoid;
- supporting **Case/context trace**;
- a concise caption or nearby plain-language **text explanation** when the visual carries meaning.

Commission the smallest set that carries the spine. Common anchors are one project landscape when needed, one architecture-at-a-glance view, one complete-instance sequence/state story, one material failure/recovery view, and one route/proof/authority-transition view. This is not a required count. Add a focused visual only for a distinct reader question; reuse an existing topology rather than redrawing it; remove a visual whose takeaway duplicates prose or another visual.

Each retained visual has a declarative title, takeaway, self-sufficient labels and legend where needed, a concise caption or nearby explanation, trace, and consistent current/selected/deferred/failure grammar. Integrate these quietly through captions, nearby prose, and appendices—never repeat a large metadata shell around every figure.

Prefer sharp inline SVG or semantic HTML/CSS. For the default private founder-review artifact, open the HTML and inspect one ordinary desktop width and one phone width for comfortable reading, obvious clipping, and broken visuals or navigation. Scrolling or reflow is acceptable when the relationship remains discoverable and legible. Add bespoke ARIA, accessibility audits, zoom matrices, full print/PDF inspection, multi-browser testing, or publication hardening only when explicitly requested or materially required by the audience or distribution boundary.

## Coverage ledger and appendices

After the narrative works, reconcile a private coverage ledger against the fixed Case. Every consequential claim is one of:

- represented in the main narrative;
- represented in a compact appendix;
- visibly qualified as a limitation/gap;
- deliberately omitted with reason and no effect on the reader's decision.

Use appendices for contract/schema lookup, secondary failures, evidence limits, alternatives and Requirement-Killer dispositions, detailed route allocation, trace/provenance/hashes/materialization receipt, and draft Atlas candidate details. Appendices support review; the architecture must remain understandable without reading them front to back.

## Acceptance readiness

The exact artifact is ready to present only when all are true:

1. A cold-reader pass using only the HTML can accurately retell the situation, tension, decisive move, consequent shape, complete story, stress story, realization route, and acceptance boundary without inventing architecture.
2. No primary section has an unclear purpose or causal connection.
3. Every primary passage and visual advances the explanatory spine; non-advancing coverage is removed or demoted.
4. The coverage ledger accounts for every consequential Case claim without changing meaning.
5. The HTML opens and remains comfortably readable at ordinary desktop and phone widths, with no obvious clipping, broken visuals, or broken navigation. Additional accessibility, zoom, print, browser-matrix, or publication QA applies only when requested or material to the stated audience/distribution boundary.
6. Human acceptance binds to the presented HTML representation, never a chat summary.
