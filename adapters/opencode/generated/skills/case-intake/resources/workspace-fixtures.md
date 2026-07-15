# Workspace Fixtures

The document system uses a configurable local work root. The default root is project-local:

```sh
node scripts/agents-os.mjs document-system-fixture init <case-slug>
```

This creates `<repo>/.agent-os/document-system-work/document-system/...` and is suitable for local fixture checks. To relocate the same logical layout, pass an explicit root or set `AGENT_OS_DOCUMENT_SYSTEM_WORK_ROOT`:

```sh
node scripts/agents-os.mjs document-system-fixture init <case-slug> --root /tmp/document-system-work
AGENT_OS_DOCUMENT_SYSTEM_WORK_ROOT=/tmp/document-system-work node scripts/agents-os.mjs document-system-fixture inspect <case-slug>
```

## Case Layout

Each initialized Case fixture mirrors the local storage contract:

```text
<work-root>/document-system/cases/<case-slug>/
  CASE.md
  sources/
    bundles/
  queue/author-review.md
  snapshots/
  artifacts/<artifact-slug>/
    artifact.md
    artifact.trace.md
    artifact.notion.md
    artifact.html
    assets/
    reviews/
    publish/
```

Later skills may add source bundle files, accepted Case snapshots, generated artifacts, trace updates, review reports, and publish records inside this shape without inventing new paths.

## Proof Layout

Fixture initialization also creates the proof evidence bundle shape:

```text
<work-root>/document-system/proof-cases/<case-id>/
  sources/
  case/CASE.md
  baseline/
  candidate/
    selection-manifest.md
    artifact.md
    artifact.trace.md
    artifact.notion.md
    artifact.html
    visual-specs/
    assets/
  reviews/
  checks/
    trace-coverage.md
    trace-maintenance.md
    concision-review.md
    reader-test.md
    presentation-check.md
    author-burden.md
    safe-publish.md
    post-publish-verification.md
  decision.md
```

Use `inspect` to verify a fixture after a test or manual edit:

```sh
node scripts/agents-os.mjs document-system-fixture inspect <case-slug> --artifact <artifact-slug> --proof-case <case-id>
```

The command prints JSON with the resolved work root and relevant directories. It exits non-zero and lists missing relative paths when the fixture contract is incomplete.
