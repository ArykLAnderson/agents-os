# Casebook Document Workflow

## Status

This document describes the Casebook architecture merged in PR #5. It supersedes the earlier design that used `.cases/`, eight independently invocable `document-*` operation skills, and a workflow manifest.

Canonical executable guidance remains in:

- `src/skills/case/`
- `src/skills/frame/`
- `src/skills/document/`
- `src/skills/prototype/`
- `src/skills/deliberate/`

If this document conflicts with those canonical skill packages, the skill packages govern current behavior until the documentation is reconciled.

## Problem

Knowledge work needs more than one monolithic document workflow:

- reusable meaning should survive any one deliverable;
- consequential uncertainty needs active framing and human judgment;
- reader-facing artifacts need editorial, trace, representation, acceptance, and publication concerns;
- prototypes and deliberations should remain useful standalone tools;
- live orchestration mechanics should not leak into semantic artifacts.

The system must remain adaptive. It should persist enough current semantic reality to resume and verify work without becoming a workflow engine, event ledger, rigid state machine, or mandatory sequence.

## Architecture

```text
Case
  reusable knowledge and source topology

Frame
  consequential uncertainty and outcome shaping
  ├─ Discovery
  ├─ Interview
  ├─ Modeling
  ├─ Structure
  ├─ Review
  ├─ optional Prototype
  ├─ optional Deliberate
  └─ optional Document

Document
  reader-facing semantic artifact
  ├─ Compose
  ├─ Shape
  ├─ Trace
  ├─ Review
  ├─ Format
  └─ Publish
```

These are capability relationships, not a fixed pipeline. A Frame chooses the smallest operation fitting the current uncertainty. A Document iterates among its internal playbooks according to unmet artifact needs. Prototype and Deliberate are standalone model-invoked capabilities that Frame may use without requiring a Casebook-specific return interface.

## Workspace

The default workspace is project-local `.casebook/`:

```text
.casebook/
  cases/<case-id>.md
  artifacts/<artifact-id>/artifact.md
  frames/<frame-id>/
    frame.md
    discovery.md
  documents/<document-id>/
    document.md
    <representations and supporting artifacts>
```

A user may provide another workspace root. Casebook material is intended to remain private. Repository configuration and the invoking workflow must ensure the effective workspace is not accidentally committed.

## Case

A Case is reusable knowledge about one bounded subject, not a mandatory format for every operation.

A Case contains:

- immutable identity plus mutable title and summary;
- scope and material exclusions;
- independently classifiable knowledge entries;
- sources with stable pinpoint locators where available;
- authority context when meaning depends on judgment or policy;
- directional relationships to Cases, entries, sources, artifacts, or external URIs.

Knowledge classification is `accepted`, `provisional`, `contested`, or `superseded`. Classification is distinct from provenance, freshness, historical scope, rejection, and canonicality.

Readable research, prototype, deliberation, review, or modeling output may be retained as a rich artifact when reduction to Case entries would lose important argument, method, context, or reproducibility. Retention is optional; Prototype and Deliberate remain valid without Casebook persistence.

## Frame

A Frame guides one consequential, under-specified natural-language outcome toward human acceptance.

It owns:

- the outcome and expressed scope;
- the current discovery boundary;
- compact Frame Discovery;
- stable references to relevant Cases and downstream work;
- factual active-authorization boundaries;
- limitations and completion state.

A Frame does not own:

- accepted Feature Atlas delivery state;
- task scheduling or operation history;
- generic callbacks or result logs;
- document drafts and document-local findings;
- human judgment.

Frame Discovery describes current fog, frontier, blockers, contestation, deferrals, and out-of-scope work. Status is descriptive (`active`, `completed`, `abandoned`, or `superseded`) and does not route work.

Frame may use Prototype for one discriminating empirical question and Deliberate for a bounded comparison among credible alternatives. It reconciles reusable consequential meaning into Cases when useful. When the requested outcome includes a durable reader-facing artifact, it may continue through Document.

## Document

A Document develops one accepted durable reader-facing artifact from Case-backed or directly supplied evidence.

It owns:

- intent, audience, reader action, genre, and artifact boundary;
- pinned Case states and direct sources;
- one authoritative semantic draft;
- knowledge gaps and artifact-local findings;
- trace state;
- target representations;
- conversational acceptance;
- factual publication state.

Cases own reusable subject meaning. Frames own broader uncertainty. Workflow Runtime owns execution mechanics.

Document uses internal playbooks rather than separate public operation skills:

- **Compose:** establish a supported semantic basis satisfying one primary genre.
- **Shape:** organize meaning around the reader journey without inventing unsupported substance.
- **Trace:** connect consequential semantic units to Case support and accessible reader references where needed.
- **Review:** select fresh lenses according to current risk and return consolidated findings.
- **Format:** produce and inspect faithful target representations without hidden semantic authorship.
- **Publish:** perform separately authorized external staging or release and verify remote state.

The playbooks may repeat, be omitted, or run in another order. A material semantic change invalidates affected trace, review, representation, acceptance, and publication conclusions.

Document status is descriptive: `active`, `completed`, `abandoned`, or `superseded`. A completed Document returns to `active` after a material edit. Optional publication remaining pending does not reopen it unless publication belongs to the requested artifact boundary.

## Completion

Creating a file is not completion.

A Document may recommend completion when:

- the requested artifact boundary is met;
- applicable trace, review, representation, and publication obligations are complete or explicitly not applicable;
- no unresolved blocking finding remains without human disposition;
- every requested representation has been inspected in its rendered medium;
- material changes have not made relevant evidence stale;
- current state is persisted;
- the human accepts the current revision conversationally.

When these conditions hold, persist `status: completed` with the accepted revision. Publication is optional unless requested. Acceptance does not authorize staging or release.

A Frame may recommend completion only after comparing the claim with persisted Frame state and any linked Document state. Material work described as active, stale, blocked, pending review, unverified, or unaccepted prevents a truthful completion claim.

## Publication

Publication remains separate from representation and semantic acceptance.

Before external mutation, identify:

- destination;
- stage or release action;
- collaborators and existing remote state;
- data classification and attachments;
- authorization scope;
- rollback feasibility.

Stage and release each require explicit authorization. Fetch and compare existing remote state when supported, preserve unfamiliar collaborator changes, perform the smallest authorized mutation, then fetch or inspect the resulting destination before claiming success.

## Boundaries With Other Systems

### Route and Feature Atlas

Route ephemerally composes complete Feature Map candidates from one or more exact accepted Blueprints and current terrain. It owns no durable accepted plan or stable planning identity. Exact trusted-human Map acceptance precedes publication.

Feature Atlas is the sole durable accepted planning authority. It owns stable Map, Feature, and Work Item identities; immutable current/successor Map Decisions; Map-owned Blueprint coverage and cross-Feature/cross-Map planning; Feature-owned contained Legs and Work Item DAGs; and canonical tracker projection. A Case, Frame, Blueprint, Route session, reviewer, or execution map may inform or consume planning but does not replace Atlas authority. Map acceptance authorizes no implementation or external effect.

### Workflow Runtime

Workflow Runtime owns live tasks, participants, branches, loops, cancellation, settlement, recovery, and journal truth. Casebook files persist semantic reality rather than runtime instructions or event history.

### Source systems

Git owns revisions and ancestry. Trackers own tracker state. Publication destinations own remote representations. Casebook records locators and relevant observations rather than becoming a universal source of truth.

## Verification

Verification should inspect observable guidance and persisted artifacts rather than inventing a synthetic workflow runtime.

At minimum:

- canonical links resolve;
- generated adapters are synchronized from `src/`;
- the effective workspace is safe from accidental repository tracking;
- Case integrity checks pass;
- Prototype records actual observation and one bounded verdict;
- Deliberate evaluates every credible alternative without false consensus;
- Frame completion agrees with persisted Frame and linked Document state;
- Document completion includes current trace/review evidence and rendered-representation inspection;
- publication success includes post-write verification.

## Out Of Scope

- A rigid Casebook state machine or transition table.
- A universal Case format for all Agent OS operations.
- Requiring Prototype or Deliberate to implement a Case-specific return contract.
- Workflow runtime journals, scheduling, leases, callbacks, or recovery state inside Cases, Frames, or Documents.
- Cryptographic manifests as proof of semantic correctness.
- Automatic publication or delegated human judgment.
- Treating current built-in genres or destinations as a mature plugin contract.
