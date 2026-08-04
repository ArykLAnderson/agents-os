# Production Design RFC: <outcome>

> Lossless reader-facing projection from a fixed Design/RFC Case revision. Document may govern editorial representation only; do not hand-edit it as a semantic design authority. Reconcile every semantic change into the source Case, fix a new revision, and rematerialize.

**Status:** materialized-review | accepted | superseded
**Readiness:** fresh-worker executable candidate | fresh-worker executable — <blockers or evidence>
**Source Design/RFC Case:** <case identity/fixed revision>
**Materialization receipt:** <document-system receipt/revision>
**Rigor:** direct | focused | full — <why>
**Frame boundary source:** <locator/revision>
**Evidence considered:** <prototype/terrain locators and limits>
**Atlas materialization:** <Atlas identity/current decision, when accepted>
**HTML review representation:** <document identity, HTML path/URI, representation revision, browser-inspection state>

> The acceptance package must include a self-contained browser-reviewable HTML companion designed for a reader returning with cold context. It should read as a visual narrative, not a Markdown document placed inside an HTML shell. Every visual is a traced projection of the fixed Case, not new design meaning.

## HTML reader journey and visual language

Open with an orientation sequence that answers, in this order:

1. **Why this exists:** the user/system problem, why it matters now, and the recognizable outcome.
2. **Project-wide context:** the product mission or user journey this serves, the relevant global architecture, and the constraints or neighboring capabilities that make this design legible.
3. **Where it fits:** the selected boundary inside that wider project landscape and its immediate external relationships.
4. **Architecture at a glance:** the selected shape, principal owners, and old → new change on one screen.
5. **How to read this RFC:** a short visual map of the sections and decisions that follow.

Then reveal detail progressively: responsibilities and interfaces → state/authority → main flows → failures/recovery → delivery route → acceptance and handoff. A reader should understand the overall plan before encountering contract tables or implementation detail.

Use visuals generously. Aim for a meaningful visual beside each major concept or short prose cluster rather than several dense paragraphs between a few large diagrams. Small visuals—annotated cards, before/after sketches, mini state transitions, responsibility tiles, timelines, boundary callouts, and focused flow fragments—are encouraged alongside full architecture, sequence, state, and dependency diagrams. Do not add decorative imagery or manufacture redundant diagrams to satisfy a count.

Every visual includes:

- a declarative title and one-sentence takeaway;
- labels and a legend sufficient without surrounding prose;
- nearby explanation of why the visual matters;
- alt text or an equivalent accessible text description;
- trace to the relevant Case claim(s); and
- clear distinction among current state, selected design, future/deferred work, and failure paths.

Prefer self-contained inline SVG, HTML/CSS visual components, and rendered diagrams that remain sharp when zoomed or printed. Keep a consistent visual grammar for owners, boundaries, state, authority, success, failure, and deferred work. Inspect desktop and narrow layouts; diagrams may scroll or expand, but must not become illegible thumbnails.

## 0. Cold-context orientation

- **Why now:** <problem and consequence in reader language>
- **Recognizable outcome:** <what becomes possible or reliable>
- **Project-wide setting:** <how this outcome serves the product/user journey and fits the global architecture; include only context needed to orient this RFC>
- **Current → selected change:** <one concise before/after statement>
- **Reading map:** <what the reader will understand in each section>

**Required visuals:** context/problem sketch; project landscape or user-journey map with a clear “you are here”; global architecture view highlighting this RFC's boundary and adjacent systems; architecture-at-a-glance diagram; before/after shape. Combine only when one visual genuinely carries both meanings. Reuse or trace current project-level diagrams when authoritative; do not redraw the wider project in a way that invents or contradicts global architecture.

## 1. Recognizable outcome and external boundary

- **Immediate consumer and outcome:**
- **External technical guarantees:** <what consumers/operators may rely on>
- **Scope / exclusions:**
- **Boundary assumptions and unresolved authority:**
- **Open human decision queue:** <only consequential unresolved choices; `none` when accepted authority/evidence fixes them>

> Internal machinery is deliberately excluded from this section.

**Required visuals:** consumer/outcome journey; in-scope/out-of-scope boundary; guarantee/assumption callouts. Prefer several focused visuals over one overloaded boundary diagram.

## 2. Selected design (internal machinery)

Describe one selected design and old-to-new change. Name only machinery needed to meet §1.

| Concern | Canonical owner | Consumer-facing contract / invariant | Failure, recovery, or reconciliation |
|---|---|---|---|
| State | | | |
| Mutation / authority | | | |
| External boundary | | | |
| Operation / repair | | | |

**Contracts/schemas:** <consumer-sufficient operations, data/state transitions, error outcomes; link rather than duplicate canonical sources>

**Required visuals:** module/responsibility diagram; interface map; canonical state-and-authority ownership view; main happy-path sequence. Add focused mini-diagrams wherever prose introduces a consequential seam or concept.

For any irreversible external mutation exposed to interruption or restart, include:

| Persisted checkpoint before call | Irreversible call / crash interval | Restart disposition | Is another call allowed? | Observable status |
|---|---|---|---|---|
| | | | | |

**When applicable visuals:** state machine; mutation timeline; crash-window sequence; restart/reconciliation decision tree.

## 3. Evidence and alternatives

- **Prototype/terrain result:** <claim supported/rejected/inconclusive, limits, consequence>
- **Material alternatives (including defer/do-less):** <rejected/selected rationale>
- **Human decision required:** <recommended choice, material alternative(s), trade-off, exact acceptance consequence; or `none — forced by accepted design/reversible realization`>
- **Intentional simplifications or borrowed mechanism:** <observed failure it addresses; mechanism it replaces/simplifies; deletion trigger>

**Required visuals:** alternatives comparison; evidence-to-decision map; selected-versus-rejected shape. Keep rationale adjacent to the visual rather than in a distant wall of prose.

## 4. Consequential walkthroughs

1. **Immediate consumer:** <analytical contract walkthrough; include real invocation/observation only when decision-changing evidence requires it>
2. **Representative applicable failure:** <analytical failure/recovery walkthrough appropriate to the accepted boundary; include exact crash/fault evidence only when that seam is decision-relevant>
3. **Recovery/cleanup:** <only if material>

State `N/A` only with a reason; unknowns are findings, not N/A.

**Required visuals:** immediate-consumer sequence; representative failure sequence; recovery/cleanup flow when material. Use step-level illustrations or callouts between diagrams where they reduce cognitive load.

## 5. Vertical delivery route

| Movement | Immediate consumer | Direct prerequisite | Owner | Evidence/proof | Architecture invention prohibited |
|---|---|---|---|---|---|
| | | | | | |

**Convergence / end-to-end owner:**
**Deferred work and why it does not block this outcome:**

**Required visuals:** vertical delivery route graph; dependency/convergence view; proof placement; deferred-versus-blocking work map.

## 6. Review and acceptance

- **Applicable advisory mandates/results:**
- **Advisory findings:** <observed condition, evidence/confidence, affected claim, proposed classification; reviewers do not accept/reject>
- **Design reconciliation:** <for every consequential finding: reconcile into source Case claims first; list affected claim IDs and disposition, then rematerialize; current readiness consequence or `none`; deferral trigger where applicable>
- **Requirement-Killer Pass:** <source Case reconciliation locator; current after material expansion; Design/Route retain/simplify/remove/defer/blocked claim consequences; required consumer/failure/fresh-worker rerun results>
- **HTML review representation:** <cold-context orientation check; visual inventory and cadence; Case trace; alt text/legends; desktop/narrow/browser, navigation, overflow, zoom, legibility, print, and asset/link inspection results; exact revision presented to the human>
- **Acceptance authority/provenance:** <bind the exact human-reviewed HTML representation, not a chat summary>
- **Known limitations / invalidation triggers:**

**Required visuals:** decision and review summary; resolved/blocked/deferred disposition view; acceptance boundary and invalidation triggers.

## 7. Atlas handoff

**Required visuals:** Blueprint → accepted RFC → Atlas Map Decision → implementation handoff chain, including the authority transition at each boundary.

Before acceptance, use `../contracts/atlas-handoff.md` to produce a non-authoritative draft handoff candidate for routeability review, with every missing acceptance, owner, decision, and evidence input named as a blocker. After acceptance and blocker resolution, Feature Atlas records the exact current Map Decision and publishes that fixed package through the project-selected guide. Atlas holds the authoritative current delivery plan; this RFC is its pinned design source.
