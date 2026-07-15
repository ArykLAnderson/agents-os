---
name: case-intake
description: Create the first approved Case snapshot from supplied sources and author input. Use when starting a portable Case-backed document workflow from conversations, notes, transcripts, documents, tickets, code observations, metrics, or research outputs.
user-invocable: true
argument-hint: "[source bundle or case slug]"
---

# Case Intake

Create a portable Case from supplied source artifacts and author input.

A Case is a mechanical semantic ledger, not reader-facing prose. This skill registers sources, extracts candidate Case entries, identifies material gaps or contradictions, and creates the first snapshot only after the author approves the binding semantic content.

## Contract

- Register each supplied source before extracting meaning.
- Distinguish source evidence, author intent, accepted decisions, assumptions, risks, gaps, and actions.
- Preserve provenance and authority; source claims do not become current decisions unless the author states, approves, or explicitly delegates that authority.
- Ask concise material questions only when needed for the first snapshot.
- Create a first Case snapshot only after author approval.
- Use a configurable work root; never hard-code a personal or organization-specific path.

## Workspace Fixtures

For local repeatable checks, load `resources/workspace-fixtures.md`. It documents the portable Case workspace and proof evidence bundle layout plus the fixture init and inspect commands:

```sh
node scripts/agents-os.mjs document-system-fixture init <case-slug> [--root <path>] [--artifact <artifact-slug>] [--proof-case <case-id>]
node scripts/agents-os.mjs document-system-fixture inspect <case-slug> [--root <path>] [--artifact <artifact-slug>] [--proof-case <case-id>]
```

## Source Registration

Before any semantic extraction, load `resources/source-registration.md` and create one `SRC` entry for every distinct supplied artifact in the source bundle. Bundle names are only organizational labels; they never replace component source entries.

Registration records only source metadata and access limits:

- stable `SRC-###` ID
- kind
- title or human label
- location, locator, or unavailable reason
- capture date
- source updated/status, or `unknown`
- reliability notes when access, freshness, authorship, transcript quality, or source authority is materially limited

For inaccessible sources, register the known metadata with limited reliability and do not infer content from a title, URL, ticket key, or unavailable path.

## Boundary

- Do not compose, shape, format, publish, or review reader-facing documents.
- Do not perform open-ended discovery unless the author grants bounded discovery scope.
- Do not adopt company-specific, tracker-specific, chat-specific, wiki-specific, database-placement, or personal workspace defaults in the portable core.
- Route later semantic changes through `case-reconcile`.

## Extraction

After registration, load `resources/entry-extraction.md`. Extract only independently reviewable semantic atoms into the working Case ledger. Preserve the source locator, provenance, uncertainty, and non-binding status of source-derived material.

Load `resources/author-approval.md` after extraction and gap detection to prepare the concise author review. It governs proposed binding content and material questions; it does not create a snapshot.

After an explicit author response, load `resources/first-snapshot.md`. It governs outcome handling and the first immutable accepted snapshot. Do not create a snapshot from silence, agent consensus, a source claim, or a pending question.

## Progressive Resources

Load resources in this order: source registration, entry extraction, author approval, then first snapshot only after an explicit author response. Do not load reconciliation resources during intake.

## Handoff

Return the Case path, registered sources, unresolved material questions, and approved snapshot identifier. Downstream document work begins from pinned Case snapshots, not from mutable working notes.
