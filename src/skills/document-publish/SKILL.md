---
name: document-publish
description: Safely stage, update, release, and verify formatted documents at external destinations. Use for destination-facing writes, remote review, release, and final target locators.
user-invocable: true
argument-hint: "[formatted artifact] [destination]"
---

# Document Publish

Own external mutation and destination verification for Case-backed documents.

Publishing is separate from formatting. Its modes are `stage` (a non-final destination representation for review or revision) and `release` (authorization of that representation as final). It verifies destination identity, permissions, update mode, destructive-write risk, attachments, trace blockers, rendered output, and final locator recording.

## Operation Contract

- **Inputs:** formatted artifact revision, destination adapter, requested `stage` or `release` mode, exact destination identity, audience, write scope, and explicit mode-specific authorization.
- **Outputs:** local handoff for unsupported destinations or fetched destination state, recovery record when needed, remote locators, authority/divergence status, and verification result.
- **Quality purpose:** prevent stale, unauthorized, or destructive external writes while enabling faithful remote review.
- **Return:** report work performed; changed remote representations; conditions satisfied or made stale; blocking and disclosable findings; and recommended next operations. Return semantic conflicts and collaborator edits to `document`; never resolve them through mutation mechanics.

Load `../document/resources/operation-result.md` before returning a result.

- Verify destination identity, requested mode, artifact revision, intended audience, and write scope before any external write.
- Treat stage and release as distinct authorization requests whenever the destination supports separate draft semantics. If they collapse into one visible write, disclose that consequence before authorization.
- Fetch existing remote content before updates or release when supported; compare it with the last observed representation and preserve unfamiliar collaborator edits.
- Check permissions, update mode, attachment lifecycle, accessibility requirements, and asset readiness.
- Refuse publication when trace or semantic blockers exist.
- Prepare recovery only before destructive replacement or material update; append-only low-risk edits do not need ceremonial rollback records.
- Perform the external write only when checks pass and the requested mode's authority is explicit.
- Fetch and inspect the staged or released result before claiming success. Import it as the current artifact only when the adapter has reliable round-trip support; otherwise record remote presentation authority and local divergence.
- Record final page, block, element, attachment, and target locators needed by the trace sidecar.

## Publication Invariant

Publication cannot waive unsupported assertions, missing material anchors, stale support affecting reader action, status or authority conflicts, or untraced material visual/table assertions. Any waiver requires author-approved `document-reconcile` output and an updated Case state.

## Boundary

- Do not format or rewrite meaning.
- Do not automatically publish to real team destinations without explicit authorization.
- Do not interpret a local artifact's presence in a Git-visible path as authorization to stage, commit, push, or publish it.
- Do not encode company-specific, database-placement, tracker-specific, chat-specific, wiki-specific, or personal path defaults in the portable core.

## Progressive Resources

Load only the publication resources needed for the selected destination and mode from `resources/`.
