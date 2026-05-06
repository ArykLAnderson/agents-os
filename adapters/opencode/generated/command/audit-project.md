<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

Audit the current project's alignment with the global the active agent harness development environment.

$ARGUMENTS

## Instructions

1. **Read the global system reference**: Read `~/.agents-os/src/docs/runtime-model.md` to understand what the global environment provides and what it expects from projects.

2. **Assess the project**: Explore the current project to understand its nature:
   - Read `AGENTS.md`, `CONTEXT.md`, or `README.md` (whichever exists) for project context
   - Check `package.json`, `pubspec.yaml`, `Cargo.toml`, or equivalent for language/framework
   - Check for test directories and test files (what test runner, what patterns)
   - Check for `.agents-os/` directory and its contents (docs, agents, commands, skills, settings)
   - Check git status for project maturity (commit count, branch structure)
   - Identify the project's domain (does it have models, schemas, types that imply domain-specific vocabulary?)

3. **Evaluate each expectation against project needs**:

   ### Project Context File
   - Does `AGENTS.md` or `AGENTS.md` exist?
   - Does it contain: project structure, build/test commands, coding conventions, working guidelines?
   - Is it current? (Does it reference things that still exist?)

   ### Domain Documentation (`.agents-os/src/docs/domain.md`)
   - Does the project HAVE a domain? (A utility library may not. A business app does.)
   - If yes: does `domain.md` exist with vocabulary and terminology?
   - Assess by looking for: models, schemas, types, business logic directories

   ### Testing Documentation (`.agents-os/src/docs/testing.md`)
   - Does the project HAVE tests?
   - If yes: does `testing.md` exist with runner config, patterns, conventions?
   - Assess by looking for: test directories, test runner config (vitest.config, jest.config, etc.), existing test files

   ### Quality Gates Configuration (`.agents-os/src/docs/quality-gates.md`)
   - Does the project have enough tests to warrant quality gate tooling?
   - If yes: does `quality-gates.md` exist with coverage commands, complexity tools, mutation testing setup?
   - Assess by looking for: coverage config, existing quality tooling, CI quality checks

   ### Project-Specific Agents (`.agents-os/src/agents/`)
   - Would the project benefit from specialized agents beyond the global builder/validator?
   - Assess by looking for: specialized domains (ML, database, frontend) that warrant focused agents

   ### Project-Specific Commands (`.agents-os/src/commands/`)
   - Are there project-specific workflows that warrant dedicated commands?
   - Assess by looking for: complex build processes, deployment scripts, data pipelines

   ### Project-Specific Skills (`.agents-os/src/skills/`)
   - Are there project-specific methodologies or patterns to encode?
   - Most projects won't need these — the global skills cover the common cases

   ### Worktree Setup
   - Is this a bare git repo with worktrees? (check: `git rev-parse --is-bare-repository`, `git worktree list`)
   - If not: recommend conversion to bare repo + worktree layout
   - If yes: are worktrees properly bootstrapped? (dependencies installed, environment configured)
   - Does `_plans/` exist at the bare repo root for shared planning docs?
   - Are there stale worktrees? (branches already merged but worktree not removed — check with `git branch --merged`)

4. **Generate the audit report**:

## Output Format

Present findings as a structured report:

### Project Profile
One-paragraph summary: what is this project, what languages, what stage of maturity.

### Findings

For each area, report one of:
- **OK** — exists and is adequate
- **MISSING (recommended)** — doesn't exist but should, given the project's nature. Include a brief description of what should go in it.
- **MISSING (optional)** — doesn't exist but would add value. Lower priority.
- **NOT NEEDED** — doesn't apply to this project (explain why)
- **STALE** — exists but appears outdated or incomplete (explain what's wrong)

| Area | Status | Notes |
|------|--------|-------|
| Project context (AGENTS.md) | ... | ... |
| Domain docs | ... | ... |
| Testing docs | ... | ... |
| Quality gates config | ... | ... |
| Project agents | ... | ... |
| Project commands | ... | ... |
| Project skills | ... | ... |
| Worktree setup | ... | ... |

### Proposed Actions

Numbered list of specific changes, ordered by priority. For each:
- What to create or update
- What it should contain (brief outline, not full content)
- Why it matters

Do NOT create any files. Only report findings and propose actions. The user decides what to act on.
