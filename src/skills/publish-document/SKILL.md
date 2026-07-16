---
name: publish-document
description: Safely publish formatted Case-backed documents only after identity, trace, asset, destructive-write, and rendered-output checks pass. Use when writing to external destinations or recording final target locators.
user-invocable: true
argument-hint: "[formatted artifact] [destination]"
---

# Publish Document

Own external writes and post-publish verification for Case-backed documents.

Publishing is separate from formatting. It verifies destination identity, permissions, update mode, destructive-write risk, attachments, trace blockers, rendered output, and final locator recording before treating a publication as complete.

## Contract

- Verify destination identity before any external write.
- Fetch existing content before destructive updates.
- Check permissions, update mode, attachment lifecycle, accessibility requirements, and asset readiness.
- Refuse publication when trace or semantic blockers exist.
- Perform the external write only when checks pass and authority is explicit.
- Fetch and inspect the published result before claiming success.
- Record final page, block, element, attachment, and target locators needed by the trace sidecar.

## Publication Invariant

Publication cannot waive unsupported assertions, missing material anchors, stale support affecting reader action, status or authority conflicts, or untraced material visual/table assertions. Any waiver requires author-approved `case-reconcile` output and a new Case snapshot.

## Boundary

- Do not format or rewrite meaning.
- Do not automatically publish to real team destinations without explicit authorization.
- Do not interpret a local artifact's presence in a Git-visible path as authorization to stage, commit, push, or publish it.
- Do not encode company-specific, database-placement, tracker-specific, chat-specific, wiki-specific, or personal path defaults in the portable core.

## Progressive Resources

Load only the publication resources needed for the selected destination and mode from `resources/`.
