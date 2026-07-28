# Publish

Publication mutates an external destination. Keep it separate from representation.

1. Confirm publication is requested and identify destination, stage or release action, collaborators, data classification, attachments, and authorization scope. Before every Notion create, update, move, attachment, comment, or database mutation, present the exact destination and intended effects and obtain a fresh explicit human approval in the current conversation. Prior approval of the document, its content, its location, or a different publication step does not authorize the mutation. Staging and release each require explicit authorization before their external mutation.
2. Check semantic acceptance, target inspection, trace coverage, unresolved findings, links, attachment readiness, and rollback feasibility. Unsupported material assertions, reader-action-relevant stale support, authority or classification conflicts, missing material trace coverage, and untraced material visual or table assertions block both staging and release.
3. Fetch the existing remote artifact when supported and compare it with the session's last observed revision. Preserve unfamiliar collaborator changes and remote identifiers; prefer append or targeted updates over replacement. Stop on semantic conflict rather than overwriting it.
4. With explicit stage authorization, stage a preview or draft when the destination supports it.
5. Obtain explicit release authorization before release.
6. Perform the smallest authorized mutation.
7. Fetch the remote artifact and verify title, content, hierarchy, links, attachments, permissions, and revision.
8. Record factual destination, remote revision, authorization scope, and verification in the session.

For Notion, treat drafting and publication as separate boundaries: prepare a local or otherwise non-mutating preview first, then stop for the approval required in step 1. After approval, fetch the destination and its schema before writing. Use native blocks for the representation. Prefer targeted updates over full replacement; never delete child pages or databases without explicit confirmation after showing what would be removed.

Attachments must use final resolvable references at the authorized destination, have appropriate retention, and provide text equivalents for reader-critical meaning. Missing, temporary, inaccessible, or unverified assets block publication.

Prepare rollback notes before consequential replacement or attachment mutation: prior revision or recoverable source, affected collaborators, attachment recovery details, and restoration method. A successful API response is not publication success until post-write verification passes.

If a write is partial or verification fails, stop further release, preserve evidence, fetch the observed destination state and final asset locators, and record the remote revision. Before any corrective mutation, fetch again, compare with the pre-write and expected revisions, preserve unfamiliar edits, and stop on semantic conflict. Correct only within an unexpired authorization envelope; renew authority when scope expands. Re-run full post-write verification before recording success.
