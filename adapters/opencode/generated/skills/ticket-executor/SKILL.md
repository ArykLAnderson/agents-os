---
name: ticket-executor
description: Implement exactly one already-triaged local or tracker-backed ticket as a scoped, tested change. Use only when the user explicitly asks to implement one ticket, or when `implement-feature` delegates one atomic ticket inside an isolated worktree. Do not use for keystones, milestones, PRDs, ticket graphs, markdown tasklists, multi-ticket requests, or whole features; use `implement-feature` instead.
user-invocable: true
argument-hint: "<ticket-file-path | ticket-number | ticket-URL>"
---

<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

# Ticket Executor

Consume the established domain glossary and ADRs. Invoke `domain-modeling` only when implementation exposes a genuine contradiction; do not silently coin competing language. If review remediation repeats or moves across module contracts, stop as the atomic writer and return an `ARCHITECTURAL_RECOVERY_REQUIRED` packet to the coordinator. The coordinator owns `zoom-out`; this writer must not continue a third local repair.

Implement one well-specified ticket and return tested, inspectable evidence.

This is an **atomic writer**, not a feature orchestrator. When called by `implement-feature`, it does not own independent review, integration, PR creation, tracker closure, or feature state.

## Routing Boundary

Use this skill only when:

- the user explicitly requests one ticket, or
- `implement-feature` or another orchestrator assigns one ticket as an isolated work unit.

Do **not** use this skill when the request includes:

- a keystone, ticket graph, or multiple tickets
- all slices or the whole decomposition
- a milestone or PRD
- a markdown tasklist/checklist
- broad implementation of a plan
- ambiguous scope that may contain multiple vertical slices

Route accepted ticket graphs, keystones, and whole-feature requests to `implement-feature`.

## Input

Require one of:

- local ticket/brief file
- tracker ticket number or URL, only when the repository explicitly uses that tracker for implementation work

If no ticket is supplied, ask for one. Do not automatically select a ticket, mutate labels, create GitHub issues, or claim work from a shared queue.

## Process

### 1. Establish the execution contract

Resolve and state:

- exact ticket and title
- acceptance criteria
- in-scope and out-of-scope behavior
- implementation repository and base revision
- assigned worktree/branch
- allowed side effects and commit authority
- coordinator constraints, unique attempt ID/writer token, expected starting HEAD, and result format

If the ticket is part of a larger feature, preserve the ticket boundary and do not imply that the feature is complete.

### 2. Work in the assigned isolated worktree

Follow project instructions and the worktree skill.

- Never modify a protected release or integration worktree.
- Preserve unrelated changes.
- When invoked by an orchestrator, use the provided worktree, branch, environment, attempt token, and starting SHA. Verify the token/HEAD before editing and again before committing; abort if the attempt was fenced or the branch moved unexpectedly.
- When invoked directly, create or request an allowed ticket worktree before production edits.
- Do not write shared `.agent/implement/...` coordinator state.

### 3. Read the ticket and project context

For a local ticket, read the file completely. For a tracker-backed ticket, fetch its current title, body, labels/status, and linked context only when the repository explicitly uses that tracker for implementation coordination.

Extract:

- desired behavior
- acceptance criteria
- scope boundaries
- key interfaces
- required testing or manual validation
- explicit dependencies and blockers

Then read relevant `AGENTS.md`, `CONTEXT.md`, canonical specifications, ADRs, plans, and existing implementation patterns.

A ticket is not the sole source of architectural truth when the project defines canonical decisions elsewhere.

### 4. Handle ambiguity without inventing requirements

If behavior cannot be resolved from the ticket and canonical context:

1. Stop before guessing.
2. Return `BLOCKED` with the exact contradiction or decision needed.
3. Include the relevant source documents and a recommended resolution when possible.
4. Comment, relabel, or modify an external tracker ticket only when explicitly authorized and repository policy allows it.

Do not silently narrow, expand, or reinterpret the ticket.

### 5. Implement with focused TDD

Load the TDD skill when the ticket changes tested behavior.

- Confirm the relevant failure before production implementation.
- Group closely related behavioral assertions when that creates a faster, clearer loop.
- Implement only the ticket’s required behavior.
- Keep tests focused on observable contracts rather than implementation details.
- Refactor while focused tests remain green.

For configuration, documentation, generated artifacts, or environment work where conventional TDD is not meaningful, use the narrowest honest validation rather than manufacturing low-value tests.

### 6. Validate efficiently

Use progressive validation:

1. focused test for the changed behavior
2. relevant package/module typecheck or lint
3. affected integration or acceptance test
4. broader checks only when required by the ticket or project policy

Run the complete ticket acceptance set before reporting completion. Do not claim native, deployed, persistence, or cross-platform behavior from unit tests or compilation alone.

### 7. Commit when the execution contract authorizes it

When `implement-feature` delegates the ticket, commit accepted ticket changes on the assigned ticket branch and leave the worktree clean. Do not push, open a ticket PR, merge, close the ticket, or update the keystone; the coordinator owns those actions.

For standalone use, do not commit unless the user or repository workflow grants that authority.

Stage only ticket-related files and follow repository commit conventions.

### 8. Return the writer result

Return a structured result envelope containing:

- ticket identifier and title
- attempt ID/writer token
- starting and resulting commit SHA plus exact commit IDs/range
- branch/worktree
- acceptance criteria and evidence
- tests/checks with SHA, command/observation, timestamp, environment, exit/result, and artifact path/digest when practical
- files changed
- blockers or unverified gaps
- any suspected scope or contract conflict
- confirmation that the attempt token remained active and the worktree is clean

When an orchestrator requests a machine-readable result, emit it exactly.

## Review Ownership

When orchestrated, `implement-feature` owns independent review. It launches read-only reviewers, evaluates findings, and returns accepted fixes to this same writer. Do not spawn a competing implementation writer or declare the ticket integrated.

When used standalone, perform a focused self-review or use project review conventions without creating a large generic reviewer battery.

## Completion Standard

A ticket writer result is complete only when:

- every in-scope criterion is verified or explicitly blocked
- out-of-scope behavior was not silently implemented
- required generated artifacts and directly affected docs are synchronized
- the assigned worktree is clean
- the result contains enough evidence for the coordinator’s independent review
- it does not imply completion of the parent feature, integration, PR, or remaining tickets
