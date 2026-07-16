---
name: document-intake
description: Create or extend reusable Case context from supplied sources and author input. Use when document work needs normalized, classified subject context from conversations, notes, transcripts, documents, tickets, code observations, metrics, or research outputs.
user-invocable: true
argument-hint: "[source bundle or case slug]"
---

# Document Intake

Create or extend a portable Case from supplied source artifacts and author input.

A Case is reusable subject context, not reader-facing prose or a document-session ledger. This operation registers sources, extracts classified context entries, identifies material gaps or contradictions, and creates the first accepted Case state only when approval is required.

## Operation Contract

- **Inputs:** relevant conversation thread, supplied sources, optional Case, and bounded intake scope.
- **Outputs:** registered sources, classified Case entries, material gaps, and an approved Case update when needed.
- **Quality purpose:** make reusable context inspectable without promoting tentative or disputed material to settled meaning.
- **Return:** report work performed; changed Cases or artifacts; conditions satisfied or made stale; blocking and disclosable findings; and recommended next operations. Return control to `document` when a material document-session, audience, or artifact decision is missing.

Load `../document/resources/operation-result.md` before returning a result.

- Register each supplied source before extracting meaning.
- Distinguish source evidence, author intent, accepted decisions, assumptions, risks, gaps, and actions.
- Preserve provenance and authority; source claims do not become current decisions unless the author states, approves, or explicitly delegates that authority.
- Ask concise material questions only when needed for the first snapshot.
- Create a first accepted Case state only after author approval when proposed binding meaning requires it.
- Use a configurable Case workspace. Conventionally use project-local `.cases/`; never hard-code a personal or organization-specific path.
- Before writing, check whether the selected root is inside a Git worktree and whether the planned files are ignored. Do not create document-system artifacts in a Git-visible path without warning the author and receiving an explicit location choice.

## Case Contract

Load `resources/case-contract.md` before creating or materially updating a Case. It defines the reusable Case boundary, the four context classifications, source locator-plus-quote expectations, and the separation from document sessions.

## Workspace Layout

Load `resources/workspace-fixtures.md` when initializing or locating Case files. It defines the private-by-default portable Case workspace layout without requiring a repository-specific script or fixed filesystem root.

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
- Route later semantic changes through `document-reconcile`.

## Extraction

After registration, load `resources/entry-extraction.md`. Extract only independently reviewable context atoms into the working Case ledger. Preserve the source locator, contextual quote when available, provenance, classification, uncertainty, and non-binding status of source-derived material.

Load `resources/author-approval.md` after extraction and gap detection to prepare the concise author review. It governs proposed binding content and material questions; it does not create a snapshot.

After an explicit author response, load `resources/first-snapshot.md`. It governs outcome handling and the first retained accepted state. Do not create a snapshot from silence, agent consensus, a source claim, or a pending question.

## Progressive Resources

Load resources in this order: source registration, entry extraction, author approval, then first snapshot only after an explicit author response. Do not load reconciliation resources during intake.

## Handoff

Return the Case path, registered sources, unresolved material questions, and accepted-state identifier. Downstream document work begins from classified Case context, not mutable working notes.
