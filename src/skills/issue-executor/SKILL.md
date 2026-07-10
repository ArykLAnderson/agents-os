---
name: issue-executor
description: Implement exactly one already-triaged GitHub issue or local issue brief as a scoped, tested change. Use only when the user explicitly asks to implement one issue, or when an orchestrator delegates one atomic issue inside an isolated worktree. Do not use for milestones, PRDs, markdown tasklists, multi-issue requests, or “all slices”; use slice-build or the project orchestrator instead.
user-invocable: true
argument-hint: "<issue-number | issue-URL | issue-file-path>"
---

# Issue Executor

Implement one well-specified issue and return tested, inspectable evidence.

This is an **atomic worker**, not a top-level project orchestrator.

## Routing Boundary

Use this skill only when:

- the user explicitly requests one issue, or
- an orchestrator assigns one issue as an isolated work unit.

Do **not** use this skill when the request includes:

- all slices or the whole decomposition
- a milestone or PRD
- a markdown tasklist/checklist
- multiple issues
- broad implementation of a plan
- ambiguous scope that may contain multiple vertical slices

Route those requests to `slice-build` or the project’s multi-issue orchestrator even when an issue number is also mentioned.

## Input

Require one of:

- GitHub issue number
- GitHub issue URL
- local issue/brief file

If no issue is supplied, ask for one. Do not automatically select an issue, mutate labels, or claim work from a queue.

## Process

### 1. Establish the execution contract

Resolve and state:

- exact issue and title
- acceptance criteria
- in-scope and out-of-scope behavior
- implementation repository and base revision
- worktree/branch being used
- whether committing was explicitly authorized
- whether an orchestrator supplied additional constraints

If the issue is one part of a larger milestone, keep the issue boundary and report that the milestone remains incomplete.

### 2. Work in an isolated worktree

Follow project instructions and the worktree skill.

- Never modify a protected release worktree.
- Preserve unrelated changes.
- When invoked by an orchestrator, use the provided worktree and environment.
- When invoked directly, create or request an allowed issue worktree before production edits.

### 3. Read the issue and project context

For a GitHub issue, fetch its current title, body, labels, and relevant linked context. For a local brief, read the file completely.

Extract:

- desired behavior
- acceptance criteria
- scope boundaries
- key interfaces
- required testing or manual validation
- explicit dependencies and blockers

Then read relevant `AGENTS.md`, `CONTEXT.md`, canonical project docs, and existing implementation patterns.

Do not treat an issue body as the sole source of architectural truth when the project defines canonical specifications elsewhere.

### 4. Handle ambiguity without side effects

If important behavior cannot be resolved from the issue and canonical context:

1. Stop before guessing.
2. Report `BLOCKED` with the exact decision needed.
3. Comment, relabel, or modify the issue only if the user or orchestrator explicitly authorized those side effects.

Do not silently narrow or expand the issue.

### 5. Implement with focused TDD

Load the TDD skill when the issue changes tested behavior.

- Confirm the relevant failure before production implementation.
- Group closely related behavioral assertions when that creates a faster, clearer feedback loop.
- Implement only the issue’s required behavior.
- Keep tests focused on observable contracts rather than implementation details.
- Refactor while focused tests remain green.

For configuration, documentation, generated artifacts, or environment work where conventional TDD is not meaningful, use the narrowest available validation instead of manufacturing low-value tests.

### 6. Validate efficiently

Use progressive validation:

1. focused test for the changed behavior
2. relevant package/module typecheck or lint
3. affected integration or acceptance test
4. broader project checks only when required by the issue or repository policy

Do not rerun the entire suite after every small edit. Do run the complete required acceptance set before claiming the issue is done.

### 7. Review the issue change

Use focused read-only reviewers when risk or scope justifies them.

Typical choices:

- code quality for non-trivial implementation
- security for trust boundaries, auth, input, secrets, or persistence
- architecture for new seams, schemas, or cross-module ownership
- performance for query, algorithm, memory, or critical rendering changes

Return actionable findings to the implementation writer. Avoid a large generic reviewer battery for a small issue.

### 8. Verify every acceptance claim

Apply the verification skill.

For each acceptance criterion:

- identify the command or direct observation that proves it
- run or inspect that evidence
- read the result
- state what remains unverified

Passing unit tests alone does not prove native UI, deployed infrastructure, persistence, or another platform.

### 9. Respect commit and publication authority

Do not commit, push, open a PR, comment, or relabel unless:

- the user explicitly requested it, or
- the orchestrator contract explicitly grants that authority.

When committing is authorized, stage only issue-related files and follow repository commit conventions.

### 10. Return the worker result

Report concisely:

- issue number and title
- implementation revision/worktree
- acceptance criteria and evidence
- tests/checks run
- focused review findings
- files changed
- blockers or unverified gaps
- commit/PR status, if authorized
- larger milestone work that remains

When an orchestrator requires machine-readable completion, emit its requested completion or blocked signal exactly.

## Completion Standard

One issue is complete only when:

- every in-scope acceptance criterion is verified or explicitly blocked
- out-of-scope work was not silently implemented
- required generated artifacts and docs are synchronized
- the issue worktree contains no unrelated modifications from this worker
- the result does not imply completion of its parent milestone or remaining slices
