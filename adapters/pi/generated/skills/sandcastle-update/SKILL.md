---
name: sandcastle-update
description: "Update the forked Sand Castle orchestrator from upstream. Diffs upstream changes against local customizations, presents them as curated suggestions — never takes them at face value. TRIGGER when: user says 'update sandcastle', 'sync sandcastle', 'check sandcastle upstream', or wants to pull orchestrator improvements. Explicit invocation: /sandcastle-update"
user_invocable: true
argument_hint: "[upstream repo URL or branch, defaults to main sandcastle repo]"
---

<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

# Sand Castle Update: Curated Upstream Sync

The Sand Castle orchestrator is a fork with significant local customizations. Upstream updates are **suggestions**, not mandates. Every change must be evaluated against our customizations and either adopted, adapted, or rejected.

## Process

### 1. Identify Upstream Source

If `$ARGUMENTS` provides a repo URL or branch, use that. Otherwise, check if a remote named `upstream` exists:

```
git remote get-url upstream 2>/dev/null
```

If no upstream remote exists, ask the user for the source repo URL and add it:

```
git remote add upstream <url>
```

### 2. Fetch Upstream Changes

```
git fetch upstream main --no-tags
```

### 3. Diff Against Local

Generate a diff of the `.sandcastle/` directory between our fork and upstream:

```
git diff HEAD...upstream/main -- .sandcastle/
```

If no changes, report "Upstream is in sync with local. Nothing to do."

### 4. Categorize Changes

For each changed file, categorize:

- **New file upstream** — review for adoption. Does it solve a problem we have?
- **Modified file we also modified** — this is the dangerous case. Our customizations may conflict.
- **Modified file we haven't touched** — safe to adopt if it doesn't break our conventions.
- **Deleted file upstream** — check if we still need it.

### 5. Present the Diff as Curated Suggestions

For each change, present:

```
### <filename>
**Category:** new | modified-conflict | modified-safe | deleted
**Upstream change:** <1-2 sentence summary>
**Our customization:** <what we changed and why, if applicable>
**Recommendation:** adopt | adapt | reject
**Reasoning:** <why>
```

**Rules for recommendations:**
- If upstream adds something our pipeline already handles differently (e.g., inline TDD that our `/build` skill handles), **reject**.
- If upstream improves infrastructure we haven't customized (e.g., Docker, CI), **adopt**.
- If upstream changes overlap with our customizations, **adapt** — take the improvement, preserve our conventions.
- Never recommend adopting a change that would undo a decision from an ADR or PRD.

### 6. Apply on User Approval

For each approved change:
- **Adopt:** Apply the upstream change directly.
- **Adapt:** Show the upstream change and our current version side-by-side, then write a merged version that takes the upstream improvement while preserving our customization.
- **Reject:** Skip. Note the rejection reason in case it's relevant for future syncs.

After applying, run a quick sanity check:
- Does `npx tsx .sandcastle/main.mts --help` still work (or at least parse)?
- Are all prompt files valid markdown with expected `{{VAR}}` placeholders?

### 7. Report

Summarize what was adopted, adapted, and rejected. If any adapted changes need testing, note that.

## Anti-Patterns

- **Don't blindly merge upstream.** Every change must be evaluated against our customizations.
- **Don't lose local customizations.** If upstream changes a file we've heavily modified, the default is reject unless there's a clear improvement.
- **Don't adopt upstream patterns that conflict with our skill system.** Our pipeline uses `/build`, `/debug`, `/verification` — upstream may have its own patterns.
- **Don't update without presenting the diff first.** Always show the user what's changing.
