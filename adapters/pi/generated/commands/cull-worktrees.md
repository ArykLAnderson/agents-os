<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

Launch a background worktree hygiene agent that inspects open git worktrees and removes stale ones.

## Instructions

This command is intentionally asynchronous. Do **not** do the culling work in the foreground chat.

1. Interpret `$ARGUMENTS` as optional guidance for the background run:
   - If it contains a path, use that as the repository/project root.
   - Otherwise use the current working directory and discover the bare/worktree root from there.
   - Treat any other text as extra keep/remove guidance from the user.

2. Before launching, list available subagents if required by the harness.

3. Start one async background subagent, preferring `worker` if available, otherwise `delegate`, with a task like:

   ```text
   You are the worktree hygiene agent. Inspect and cull stale git worktrees.

   User command arguments: $ARGUMENTS

   Scope:
   - Determine the target git repository from the provided path or current working directory.

   Rules:
   - Never delete local branches or remote branches unless the user explicitly asked for branch deletion in this invocation.
   - Never remove protected/canonical worktrees: `master`, `main`, `dev`, and canonical docs/config repos such as `docs`.
   - Preserve worktrees for open PRs or clearly active branches.
   - Preserve any worktree with tracked modifications.
   - Preserve any worktree with suspicious untracked files; report it instead of forcing removal.
   - It is acceptable to force-remove a stale worktree only when the only dirt is clearly disposable generated/runtime output such as `node_modules/`, `sessions/`, `.wrangler/`, `.expo/`, `sandcastle-verification/`, logs, caches, or similar.
   - Fetch/prune remotes before deciding, when network/GitHub access is available.
   - Use `gh pr list --state all` when available to identify merged/open PR branches.
   - Prefer evidence over age alone: merged into `origin/dev`/`origin/master`, contained in an integration branch, closed/merged PR, or obsolete Sandcastle issue branch.
   - Run `git worktree prune` after removals.

   Workflow:
   1. Run `git worktree list --porcelain` and summarize all open worktrees.
   2. Inspect cleanliness with `git status --porcelain` for each candidate.
   3. Check merge/PR status for candidate branches.
   4. Remove only safe stale worktrees with `git worktree remove` (or `--force` only for disposable generated/runtime dirt as described above).
   5. Leave all ambiguous worktrees in place and report why.
   6. Final report: removed worktrees, retained worktrees, dirty/ambiguous worktrees needing human attention, and any commands that failed.
   ```

4. Return immediately with the async run id and a one-line summary that the culling agent is running in the background. Do not wait for completion unless the user explicitly asks you to monitor it.
