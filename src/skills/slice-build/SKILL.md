---
name: slice-build
description: "Orchestrated executor for one local markdown milestone where tracker tickets are intentionally inappropriate, especially global Agent OS/Pi infrastructure work. Do not use for a feature ticket graph or keystone; use implement-feature. Explicit invocation: /slice-build [tasklist path] [--slice VS-N] [--task VS-NNN]"
user_invocable: true
argument_hint: "[tasklist path] [--slice VS-N] [--task VS-NNN]"
---

# Slice-Build: Markdown Vertical Slice Executor

Execute one milestone from a markdown vertical-slice tasklist using a coordinator pattern. This skill is for Agent OS / Pi / infrastructure work where tracker tickets are intentionally the wrong substrate. Accepted feature ticket graphs and keystones belong to `implement-feature`.

## Inputs

Parse `$ARGUMENTS`:

- `tasklist path`: markdown file containing milestone headings and checkbox tasks.
- `--slice VS-N`: optional milestone override.
- `--task VS-NNN`: optional single-task override inside the tasklist.
- No override: choose the first unblocked incomplete milestone.

If no tasklist path is supplied, look for a likely tasklist in this order:

1. `~/.agents-os/docs/prds/*tasks*.md`
2. `docs/prds/*tasks*.md`
3. `docs/*tasks*.md`

If multiple likely tasklists exist, ask the user to choose.

## Core Rules

- Default execution unit is **one vertical-slice milestone**, not the whole backlog.
- Stop at the milestone boundary.
- Implement tasks sequentially in v1.
- Use a coordinator loop: implement, validate, lightly review, fix, then mark done.
- Run a final deep slice review before claiming the milestone is complete.
- Do not create GitHub Issues.
- Do not commit unless the user explicitly asks.
- Do not use long-running dev servers.
- Preserve unrelated user changes.
- Mark a task complete only when there is validation evidence or an explicit not-applicable rationale.

## Tasklist Updates

The markdown tasklist is the durable source of truth.

Allowed updates:

- Change completed task checkboxes from `[ ]` to `[x]`.
- Add concise inline notes only when useful:
  - `Done: ...`
  - `Blocked: ...`
  - `Validation: ...`

Blocked tasks remain unchecked. Record the exact manual/HITL action needed under the task.

Noisy run details go to artifacts, not the tasklist.

## Artifact Location

Write run artifacts under:

```text
.pi/artifacts/slice-build/runs/<run-id>/
```

when operating in a project/repo where `.pi` is the local ignored runtime area.

If no appropriate project `.pi` root exists, use:

```text
~/.pi/agent/artifacts/slice-build/runs/<run-id>/
```

Recommended files:

```text
report.md
events.jsonl
changed-files.txt
validation.md
review.md
```

Do not normally reference these artifacts from the tasklist. Mention the run path in the final response.

## Process

### 1. Load And Parse Tasklist

Read the tasklist. Identify:

- milestone headings, e.g. `## Milestone VS-0 — ...`
- milestone goal
- acceptance criteria
- checkbox tasks
- blockers or manual-action notes

If the file does not contain recognizable milestones, ask before proceeding.

### 2. Select Work

Default:

1. Find the first milestone with unchecked tasks.
2. Skip only if it is explicitly blocked and a later milestone is clearly independent.
3. If ordering/dependencies are unclear, ask.

Overrides:

- `--slice VS-N`: execute that milestone.
- `--task VS-NNN`: execute only that task, but still consider the milestone acceptance criteria.

### 3. Plan The Milestone

Create a short execution plan:

- task order
- likely files/areas to inspect or edit
- validation commands to discover or run
- likely review focus
- expected blocker risks

Do not over-plan beyond the selected milestone.

### 4. Implement Each Task With A Review Loop

For each task in the selected milestone:

1. Implement only that task's required change.
2. Run focused validation appropriate to the change.
3. Run a lightweight review:
   - task correctness
   - scope drift
   - obvious regression risk
   - validation evidence exists
   - tasklist note accuracy
4. Fix issues from the light review.
5. Re-run focused validation if fixes changed behavior.
6. Mark the task complete only after validation/review passes.

Lightweight review can be performed by the coordinator directly or by a reviewer subagent if available and useful.

### 5. Handle Manual/HITL Blockers

If a task requires manual action:

1. Complete safe preceding work.
2. Leave the blocked task unchecked.
3. Add a short `Blocked:` note under that task.
4. Write exact manual action needed in the final response and run report.
5. Stop the milestone unless later tasks are explicitly independent.

Rerunning `/slice-build <tasklist>` should resume from the first unblocked incomplete task.

### 6. Final Deep Slice Review

After all tasks in the milestone appear complete, run a deep review before claiming success.

Review:

- milestone acceptance criteria satisfied
- all completed checkboxes have evidence
- blocked/skipped work is not hidden
- docs/config/code are coherent
- validation commands were run or explicitly not applicable
- tasklist accurately reflects the result
- no follow-on blocker is unrecorded

Use parallel reviewers if available and worth the overhead. Implementation remains sequential in v1.

### 7. Final Report

Respond with:

- tasklist path
- milestone or task executed
- tasks completed
- files changed
- validation run and result
- review result
- blockers/manual actions, if any
- artifact run path
- next recommended milestone/task

Keep the final response concise. The artifact report can hold details.

## Validation Guidance

Scale validation to the slice:

- Docs/spec slice: inspect generated docs; run markdown/schema/doctor checks if available.
- Config/schema slice: run validator/doctor and focused schema tests.
- Runtime/code slice: run focused unit tests, relevant doctor/sync checks, and manual checklist if required.

If no validation command exists, state why and use review/inspection evidence instead.

## Anti-Patterns

- Running the whole backlog in one invocation.
- Marking tasks done because files were edited but validation was not checked.
- Skipping a blocked task without recording the exact manual action.
- Turning the tasklist into a verbose run log.
- Creating GitHub Issues for global Agent OS infrastructure work.
- Parallelizing implementation before write scopes are proven disjoint.
