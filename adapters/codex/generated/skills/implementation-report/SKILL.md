---
name: implementation-report
description: Create an evidence-backed, visually polished HTML report after implementation is complete. Use when the user asks for a developer report, implementation walkthrough, post-build report, founder-facing technical explanation, architecture report, or durable proof of completed work. Produces a reader-first narrative with screenshots, native Pi-generated architecture diagrams, verification evidence, explicit scope boundaries, risks, and next decisions.
user-invocable: true
argument-hint: "[issue | PR | commit | worktree] [--mode standard|showcase] [--audience founder|product|engineering|mixed] [--publish]"
---

<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

# Implementation Report

Turn completed work into a durable, self-contained HTML report that explains what changed, how it works, what proves it, and what remains incomplete.

This skill runs **after implementation**. It is not a substitute for `issue-executor`, `slice-build`, `/doc-sync`, release notes, an RFC, or raw test logs.

## Defaults

- **Mode:** `standard`
- **Audience:** `mixed`, with user value before implementation detail
- **Output:** self-contained HTML plus local assets and sanitized evidence
- **Publishing:** never commit, push, open a PR, or upload unless the user explicitly asks or passes `--publish`
- **Evidence:** reuse trustworthy existing evidence before running new work
- **Diagrams:** use Pi’s native `imagegen` tool from the installed image-generation plugin; never wrap Codex CLI or another model CLI to generate images

If the subject or exact implementation revision cannot be determined, ask one focused question before proceeding. Avoid a long intake interview.

## Modes

### Standard

Use for routine completed work.

- Reuse existing CI, test, and implementation artifacts.
- Run only lightweight or targeted missing verification.
- Capture screenshots only when behavior is visual.
- Generate 2–3 diagrams selected for decision value.
- Keep the report compact enough to read in 10–20 minutes.
- Use one writer; do not create a review council by default.

### Showcase

Use for milestones, vertical slices, founder reviews, or when requested explicitly.

- Perform fresh manual E2E where practical and safe.
- Capture multiple meaningful user-visible states.
- Gather API, persistence, lifecycle, and teardown evidence when relevant.
- Generate up to 6 progressively deeper diagrams.
- Include glossary, risk analysis, and a detailed evidence index.
- Use at most two focused read-only scouts when the implementation is broad: one implementation mapper and one audience/editorial reviewer. The parent remains the only report writer.

## Process

### 1. Anchor the report

Resolve and record:

- issue, PR, commit, branch, or completed worktree
- exact implementation commit
- canonical specifications, ADRs, and project instructions
- intended audience and mode
- canonical report destination
- whether publishing was requested

Read repository instructions before touching files. Prefer canonical docs/config locations over branch-local copies when the project defines them.

Do not report against a moving branch without recording the commit inspected.

### 2. Build an evidence inventory

Before rerunning anything, inventory:

- CI run URLs and statuses
- commands already run and preserved output
- test harness artifacts
- screenshots or recordings
- API payloads and database observations
- security or architecture review findings
- known platform or environment gaps
- code paths that implement each important claim

Create an evidence manifest based on [templates/evidence-manifest.json](templates/evidence-manifest.json). Every material claim must become one of:

- `verified` — backed by inspected evidence
- `observed` — directly seen during a manual run
- `inferred` — supported by code/architecture but not executed
- `unverified` — explicitly not proven
- `future` — proposed or deferred work

Read [references/evidence-standards.md](references/evidence-standards.md) before gathering or publishing evidence.

### 3. Fill only meaningful evidence gaps

Use this order:

1. Reuse trustworthy, revision-matched evidence.
2. Run lightweight verification when evidence is missing or stale.
3. Run targeted integration or manual E2E only when it proves an important user or system boundary.
4. Avoid paid services, persistent infrastructure, or model calls unless already approved.

For visual behavior, load and follow the relevant browser/device skill. Capture deliberate states such as:

- entry, loading, or precondition
- primary successful result
- important transition
- selected or locally changed state
- meaningful error or limitation

Do not capture screenshots merely to decorate the report.

Never claim a platform passed because a bundle compiled. Never call a path E2E if fixtures bypass the architecture being demonstrated.

### 4. Plan the reader journey

Start with the learner/customer-visible result and descend into technical detail.

Use this default sequence, removing sections that add no value:

1. Executive result and decision needed
2. User-visible behavior
3. Observed evidence
4. Deliberate scope boundary
5. Plain-language mental model
6. Full system flow
7. Internal architecture
8. Data, trust, and lifecycle boundaries
9. Verification status
10. Risks and unresolved gaps
11. Next decisions or slices
12. Glossary and evidence index

Read [references/report-structure.md](references/report-structure.md) for section intent and editorial guidance.

The primary narrative must remain understandable without reading code, SQL, or diagram internals. Put low-level detail after the reader understands why it matters.

### 5. Select and generate diagrams

Read [references/diagram-selection.md](references/diagram-selection.md).

Choose diagrams by the question they answer, not by a fixed quota. Typical choices:

- slice boundary
- end-to-end system flow
- test environment lifecycle
- component/ports-and-adapters architecture
- persistence model
- trust-boundary or payload-redaction view
- sequence/timing view

For every selected diagram:

1. Write a diagram brief using [templates/diagram-brief.md](templates/diagram-brief.md).
2. Identify the source evidence for each relationship.
3. Render it directly with Pi’s native `imagegen` tool available in the current session.
4. Save the output beneath the report asset directory.
5. Inspect the generated image at report size.
6. Iterate if labels, arrows, hierarchy, or terminology are unclear.
7. Add a caption and text equivalent to the report.

**Do not invoke Codex CLI, Gemini CLI, or any other wrapped model CLI for image generation.** If Pi’s native `imagegen` tool is unavailable, ask the user to reload or explicitly approve a non-image fallback. Do not silently substitute another generation pipeline.

### 6. Build the report

Create a portable package such as:

```text
reports/
  issue-123-implementation-report.html
  assets/issue-123/
    screenshots/
    diagrams/
    evidence/
```

The HTML should:

- embed its CSS
- use only local visual/evidence assets except deliberate external source links
- work when opened directly from disk
- be responsive and printable
- include semantic headings, alt text, captions, and text equivalents
- distinguish `Observed`, `Implemented`, `Unverified`, and `Future` visually
- expose preserved evidence through relative links
- use the project’s real terminology
- avoid generic dashboard/card-grid aesthetics

Load the frontend-design skill when available, then follow [references/visual-style.md](references/visual-style.md). Choose a context-specific editorial direction rather than cloning a fixed house template.

### 7. Validate claims and presentation

Run the bundled static validator:

```bash
node scripts/validate-report.mjs path/to/report.html
```

Then open the report with browser automation and verify at minimum:

- desktop viewport around 1440×1000
- mobile viewport around 390×844
- no console or page errors
- no broken images
- no page-level horizontal overflow
- diagrams legible at rendered size
- tables and code blocks independently scroll on narrow screens
- navigation remains usable
- the report begins with value, evidence status, and limitations

Also verify:

- all important claims are tied to evidence or explicitly qualified
- future work cannot be mistaken for shipped work
- screenshots contain no secrets or identifying data
- evidence artifacts are sanitized
- SVG/XML and JSON evidence parse
- color contrast and heading order are accessible

Read [references/quality-gates.md](references/quality-gates.md) for the final checklist.

### 8. Publish only when authorized

If `--publish` was passed or the user explicitly requested publication:

1. Confirm the work is in an allowed documentation worktree/branch.
2. Stage only report-related files.
3. Run final validation from the staged content.
4. Commit using the repository’s conventions.
5. Push and open a PR with report scope, evidence, validation, and known gaps.

Otherwise, leave the report uncommitted and provide its local path.

## Efficiency Rules

- Do not repeat broad discovery already completed during implementation.
- Do not rerun the entire test suite merely for theater.
- Do not ask multiple subagents to produce overlapping reports.
- Do not generate every diagram type.
- Do not preserve huge raw logs when a sanitized excerpt and source reference prove the claim.
- Do not make the reader reconstruct the result from repository structure.
- Prefer one evidence inventory, one editorial plan, one writer, and one focused review pass.

## Hard Truthfulness Rules

- Separate “compiled,” “automated test passed,” and “manually observed.”
- Describe synthetic inputs at the seam where they enter; do not call them fake if they still cross the real product architecture.
- Do not imply a tap was submitted, graded, persisted, or authoritative unless evidence proves each step.
- Do not call data immutable when only one mutation path was tested; state the actual mechanism.
- Do not call generation replayable unless referenced implementation and inputs remain available.
- Do not hide platform gaps behind aggregate wording.
- Do not overclaim retention, deletion, security, accessibility, or production readiness.

## Completion Report

When done, report concisely:

- report path
- implementation commit covered
- mode and audience
- screenshots and diagrams included
- verification performed
- important unverified gaps
- publication/PR status, if any
