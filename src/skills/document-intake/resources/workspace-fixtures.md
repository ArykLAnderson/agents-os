# Workspace Layout

The document system uses a configurable Case workspace selected by the author, project, or invoking environment. Prefer an existing declared private workspace. Otherwise conventionally use `<project-root>/.cases/`.

Document-system working files are private and uncommitted by default. Before creating the root:

1. Determine whether the selected path is inside a Git worktree.
2. If it is, check whether the planned root is ignored by Git.
3. If the root is ignored, create or reuse it without further location approval.
4. If the root is Git-visible, warn the author before writing and offer two explicit choices: add the root to the repository's ignore rules, or use another local/private path outside the committable tree.
5. Do not silently modify ignore rules, stage artifacts, or treat a hidden directory name as proof that Git ignores it.

Only create document artifacts in a tracked or otherwise committable path when the author explicitly chooses that location for material intended to be shared. Committing, publishing, or moving private working artifacts into tracked documentation is a separate action requiring explicit author intent.

## Case And Session Layout

Each Case uses this logical storage contract:

```text
<case-workspace>/
  cases/<case-id>/
    CASE.md
    sources/
    snapshots/
  documents/<document-id>/
    workflow.md
    semantic/
    target/
    reviews/
    publish/
```

Later operations may add source bundle files, accepted Case updates, semantic artifacts, trace updates, review reports, and publication records inside this shape without mixing reusable Case context with document-session state.

Record the resolved Case workspace in the Case handoff. Verify required local files and links using the host environment's ordinary filesystem capabilities; this resource does not require a particular initializer, parser, or validator.

This private-by-default rule covers the complete workspace: supplied source copies, author responses and approvals, Case state, manifests, drafts, traces, reviews, reader simulations, presentation evidence, screenshots, generated images and prompt records, publication plans, and readiness evidence.
