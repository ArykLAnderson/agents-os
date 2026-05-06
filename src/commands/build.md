Execute an implementation plan.

## Instructions

1. **Read the plan file**: `$ARGUMENTS`
   - If no argument provided, look for plans in `_plans/` at the bare repo root (find via `git rev-parse --git-common-dir`, then go to its parent). List available plans and ask which to execute.

2. **Read project context**: Look for `AGENTS.md`, `CONTEXT.md`, or `README.md` (first found) to understand project conventions. Check `.agents-os/src/docs/` for project-specific context (domain vocabulary, testing conventions, quality tooling config).

3. **Detect spec files**: Check if the plan references spec/test files, or if there are test files with Given/When/Then patterns and `// TODO: implement` markers in the relevant directories.

4. **Choose implementation approach**:
   - **With specs**: Run `spec-check` before implementation, confirm the referenced specs fail for the right reason, implement with the `tdd` skill's red-green-refactor discipline while respecting both issue-level tests and slice-level acceptance constraints, then run `spec-check` again after implementation.
   - **Without specs**: Work through the plan's implementation steps in order, following existing patterns and conventions. Use the `tdd` skill's red-green-refactor discipline when writing tested code. After each major step, briefly note what was done.
   - **With team tasks**: If the plan contains tasks with agent assignments (Assigned To, Depends On), delegate tasks to the assigned agents via subagents (builder, validator, or project-specific agents). Choose the most appropriate agent for each task — prefer project-specific specialized agents when they exist.

5. **Run acceptance criteria**: Execute any checks, tests, or verification steps listed in the plan. Always run relevant tests, even for simple builds.

6. **Parallel review and quality gates** (team builds only): When the plan has team task assignments, run after implementation is complete:
   - **@security-reviewer** — OWASP checklist, injection risks, secrets, auth flaws
   - **@architecture-reviewer** — coupling, abstraction quality, schema design, patterns
   - **@code-quality-reviewer** — complexity, duplication, coverage, quality-gates metrics
   - **@performance-reviewer** — N+1 queries, algorithmic complexity, memory, caching

   Each reviewer examines the changed files independently. Collect all findings into a unified review report.

   For solo builds (no team tasks), skip parallel review and quality gates — just run acceptance criteria and tests.

   **Model selection:** Reviewers default to sonnet. For critical builds (security-sensitive, production deployments, major refactors), override to opus. The user may also request opus explicitly.

7. **Doc sync**: After implementation and review, run the `doc-sync` skill to update project documentation. It will assess what changed (API contracts, schemas, architecture) and update relevant docs automatically. For changes that are purely internal with no interface or architectural impact, it will skip gracefully.

8. **Completion report**: When done, summarize:
   - Steps completed
   - Steps skipped (with reason)
   - Test/check results
   - Review findings (grouped by reviewer, sorted by severity) — team builds only
   - Documentation updates (what docs were modified or created)
   - Any issues or decisions made during implementation
