Generate a structured implementation plan for the following task:

$ARGUMENTS

## Instructions

1. Read the project's primary context file (look for AGENTS.md, CONTEXT.md, or README.md — use the first one found) to understand the project.
2. Run `git status` and `git log --oneline -10` to understand current state.
3. Explore the relevant parts of the codebase to understand existing patterns.
4. Check for active worktrees (`git worktree list`) to understand parallel development.
5. Assess task complexity to determine plan structure (see below).
6. Generate the plan.

## Complexity Assessment

After exploring the codebase, assess whether this task is simple or complex:

**Simple** (flat steps, no team delegation):
- Single file or small number of closely related files
- Clear, well-scoped change (bug fix, refactor, small feature)
- Low risk of breaking other parts of the system

**Complex** (tasks with agent assignments and dependency tracking):
- Multiple files across different modules
- Schema changes, API contract changes, or cross-cutting concerns
- High risk or high impact (security, data integrity, performance)
- Multiple logical phases that benefit from explicit ordering

## Output Format

Write the plan to `_plans/` at the bare repo root (find via `git rev-parse --git-common-dir`, then go to its parent). Create the directory if needed. Use a descriptive filename.

### For Simple Tasks

```markdown
# Plan: <Task Name>

## Context
Why this change is needed.

## Requirements
Bullet list of what must be true when done.

## Implementation Steps
Numbered steps with specific file paths and what changes in each.

## Files to Modify
Table of files with one-line description of the change.

## Parallelism & Conflicts
- Active worktrees and their branches
- Any conflict risks with other active work

## Verification
How to verify correctness — specific tests to run, behaviors to check, sanity checks.
Always include at least one concrete verification step, even for trivial changes.
```

### For Complex Tasks

```markdown
# Plan: <Task Name>

## Context
Why this change is needed.

## Requirements
Bullet list of what must be true when done.

## Team Members
- **Builder**: Implementation agent (or project-specific agent if more appropriate)
- **Validator**: Read-only verification agent

## Tasks

### Task 1: <Name>
- **Assigned To**: Builder
- **Depends On**: none
- **Description**: Detailed description of what to implement
- **Acceptance Criteria**: How to verify this task is correct

### Task 2: <Name>
- **Assigned To**: Builder
- **Depends On**: [1]
- **Description**: ...
- **Acceptance Criteria**: ...

(continue for all implementation tasks...)

### Task N: Validate Implementation
- **Assigned To**: Validator
- **Depends On**: [all prior task IDs]
- **Description**: Review all changes against requirements. Verify code correctness, patterns, conventions.
- **Validation Commands**: Specific test commands, lint checks, verification steps

## Files to Modify
Table of files with one-line description of the change.

## Parallelism & Conflicts
- Active worktrees and their branches
- Files/modules that may conflict with other active worktrees
- Shared resource concerns (schema migrations, API contracts, shared packages)
- Merge ordering recommendations if conflicts exist

## Acceptance Criteria
Overall success criteria for the entire plan.
```

## Guidelines

- Choose the simpler format unless the task clearly warrants team coordination.
- For complex plans: break work into focused tasks, order by dependency, always end with a Validator task.
- Keep task descriptions specific enough that the assigned agent can execute without ambiguity.
- Include file paths in descriptions where possible.
- Always include verification — even simple changes need a sanity check.

---

Do NOT implement anything. Only produce the plan document.
