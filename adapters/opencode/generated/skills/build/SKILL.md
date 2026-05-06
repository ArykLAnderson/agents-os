---
name: build
description: "Single-issue executor with TDD discipline. Takes a GitHub Issue number/URL or local issue file, reads the agent brief, implements with red-green-refactor, runs lightweight quality review. Designed to be called standalone or by the orchestrator inside a worktree. TRIGGER when: user says 'build this issue', 'implement issue #N', 'work on #N', or explicitly invokes /build. Explicit invocation: /build [issue-number | issue-URL | issue-file-path]"
user_invocable: true
argument_hint: "[issue number, URL, or file path]"
---

<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

# Build: Single-Issue TDD Executor

Implement a single GitHub Issue (agent brief) using TDD discipline. This is the atomic unit of work in the pipeline — one issue in, tested code out.

## Process

### 1. Load the Issue

Parse `$ARGUMENTS`:
- **Number** (e.g., `42`): Run `gh issue view 42 --json title,body,labels` to fetch the agent brief
- **URL** (e.g., `https://github.com/owner/repo/issues/42`): Extract number, fetch via `gh`
- **File path** (e.g., `docs/issues/042-add-mastery-tracking.md`): Read the local file
- **No argument**: Run `gh issue list --label afk --state open --limit 10` and pick the first unblocked issue. If no AFK issues, list all open issues and ask.

### 2. Parse the Agent Brief

Extract from the issue body:
- **Desired Behavior** — what to build
- **Key Interfaces** — types and contracts to implement against
- **Acceptance Criteria** — the definition of done (checkboxes)
- **Scope Boundaries** — IN/OUT lists to prevent drift
- **Testing** — how to verify completion

If the issue body doesn't follow the agent brief format, treat it as a freeform description and implement accordingly. Warn that structured briefs produce better results.

### 3. Read Project Context

- `AGENTS.md` or `README.md` for project conventions
- project-specific `.agents-os` docs for domain vocabulary, testing conventions, and architecture layers
- `CONTEXT.md` at the project root for domain terminology
- Relevant existing code in the area you'll be modifying (explore the codebase)

### 3.5. Check for Ambiguity — BLOCKED Escape Hatch

Before implementing, verify the issue is fully specified. If you encounter ambiguity you can't resolve from the issue brief + project context:

1. **Leave a comment** on the GitHub issue: `gh issue comment <number> --body "BLOCKED: <description of what's ambiguous>"`
2. **Relabel** the issue: `gh issue edit <number> --remove-label ready --add-label needs-info`
3. **Signal** to the orchestrator: output `<result>BLOCKED: <reason></result>`

Do NOT guess. A wrong implementation is more expensive than a blocked signal. The CoS will surface `needs-info` issues in the daily briefing.

### 3.6. Locate or Generate Specs

Check for existing test files that cover this issue's scope:
- Look for test files referencing the issue number (e.g., `// ISSUE-42`)
- Look for test files matching the feature area in the standard test directory
- Check `tests/acceptance/` for slice-level acceptance tests related to this issue's slice

**If specs exist** with `// TODO: implement` markers — use them. This is the pre-written spec path.

**If no specs exist** — generate issue-level test skeletons from the acceptance criteria in the issue body. Write Given/When/Then-style tests in the appropriate test directory. These are unit/integration level, not slice-level.

**Dual-constraint rule:** Your issue-level unit tests passing does NOT mean you're done. The slice acceptance tests (in `tests/acceptance/`) are the real behavioral contract — they get verified at merge time, not here. But your unit tests must be independently correct.

### 4. Implement with TDD

Follow strict red-green-refactor discipline:

**For each acceptance criterion:**

1. **RED** — Write a failing test that encodes the criterion. Run it. Confirm it fails for the right reason.
2. **GREEN** — Write the minimum code to make the test pass. No more.
3. **REFACTOR** — Clean up duplication, improve names, extract if needed. Tests must stay green.

**Feedback loops — run after every change:**
- Type checking (if available): `npm run typecheck`, `tsc --noEmit`, etc.
- Tests: `npm test`, `bun test`, `pytest`, etc.
- Linting (if available): `npm run lint`, etc.

**Anti-patterns to avoid:**
- Writing all tests first, then all implementation (horizontal slicing)
- Writing implementation without tests
- Writing tests after implementation (not TDD)
- Implementing beyond what the acceptance criteria require
- Modifying code outside the scope boundaries

### 5. Commit

After all acceptance criteria pass, create a commit:

- **Message format**: `[ISSUE-N] <imperative summary>`
  - Example: `[ISSUE-42] Add lexeme mastery tracking with recognition/production scalars`
- Stage only files relevant to this issue
- Do NOT push (the orchestrator or user handles that)

### 6. Lightweight Quality Review

Spawn two reviewers in parallel (sonnet model):

**Code Quality** (`@code-quality-reviewer`):
- Complexity: no function > cyclomatic complexity 10
- Duplication: no copy-pasted blocks
- Readability: clear names, minimal comments needed
- Test quality: tests are behavioral, not implementation-coupled

**Security** (`@security-reviewer`):
- Input validation at system boundaries
- No hardcoded secrets
- No injection vectors (SQL, XSS, command)
- Auth/authz checks where required

If reviewers find issues:
- **Critical** (security vulnerabilities, data loss risks): Fix immediately, re-run tests
- **Major** (complexity, duplication): Fix if quick (<5 min), otherwise note in commit message
- **Minor** (style, naming): Skip — not worth the context cost

### 7. Verify Before Claiming Done

Apply the **verification** skill: for each acceptance criterion, identify the exact command that proves it, run it, read full output, confirm it supports your claim. Include verification evidence in the completion report.

### 8. Signal Completion

Report:
- Issue number and title
- Acceptance criteria: which passed, which were skipped (with reason)
- **Verification evidence: the command run and its result for each criterion**
- Test results: pass count, any skipped
- Review findings: critical/major items fixed, minor items noted
- Files changed: list with brief description

If running inside an orchestrator (detected by `ORCHESTRATOR_SESSION` env var):
- Write completion signal to stdout: `<result>COMPLETE</result>`
- If blocked or failed: `<result>BLOCKED: <reason></result>` or `<result>FAILED: <reason></result>`

## Orchestrator Integration

When called by the orchestrator (Sand Castle or similar):
- The orchestrator creates a worktree and sets `ORCHESTRATOR_SESSION=1`
- The orchestrator may set `DATABASE_URL` to a Neon branch connection string
- Use the provided `DATABASE_URL` for all database operations
- Do NOT push or merge — the orchestrator's merge phase handles that
- Do NOT run the full 4-reviewer battery — that happens at the vertical slice level

## Manual Usage

When called directly by a human:
- Works in the current working directory (no worktree)
- After completion, suggest: "Ready to commit and push? Or review the changes first?"
- If the issue is part of a vertical slice, mention: "This is one issue in slice X. Run `/build <next-issue>` to continue, or the orchestrator to run the full slice."
