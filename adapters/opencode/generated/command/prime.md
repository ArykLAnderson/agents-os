<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

Load project context and summarize the current state.

## Instructions

1. **Project context**: Read the file specified below.
   - If a specific file was provided: read `$ARGUMENTS`
   - Otherwise: look for these files in order and read the first one found: `AGENTS.md`, `AGENTS.md`, `README.md`

2. **Git state**: Run `git status` and `git log --oneline -10` to understand the current branch, uncommitted changes, and recent history.

3. **Worktree context**: Run `git worktree list` to detect the worktree layout.
   - If inside a worktree: report the bare repo root, which worktree this is, and other active worktrees
   - Check for `_plans/` at the bare repo root and list its contents if it exists
   - If not a worktree layout: note this (the project may not be converted yet)

4. **Summarize** the project concisely:
   - What is this project? (1-2 sentences)
   - Worktree: which worktree are we in, what other worktrees exist?
   - What branch are we on and what's the recent activity?
   - Any uncommitted changes or work in progress?
   - Active plans in `_plans/` (if any)
   - Key technologies/patterns in use

Keep the summary short and actionable — this is context-loading, not a deep dive.
