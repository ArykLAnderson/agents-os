---
name: case-intake
description: Create the first approved Case snapshot from supplied sources and author input. Use when starting a portable Case-backed document workflow from conversations, notes, transcripts, documents, tickets, code observations, metrics, or research outputs.
user-invocable: true
argument-hint: "[source bundle or case slug]"
---

<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

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

## Boundary

- Do not compose, shape, format, publish, or review reader-facing documents.
- Do not perform open-ended discovery unless the author grants bounded discovery scope.
- Do not adopt company-specific, tracker-specific, chat-specific, wiki-specific, database-placement, or personal workspace defaults in the portable core.
- Route later semantic changes through `case-reconcile`.

## Handoff

Return the Case path, registered sources, unresolved material questions, and approved snapshot identifier. Downstream document work begins from pinned Case snapshots, not from mutable working notes.
