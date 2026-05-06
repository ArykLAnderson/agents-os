---
name: to-issues
description: "Decompose a PRD into independently-grabbable vertical slice GitHub Issues with blocking relationships. TRIGGER when: the user wants to break a PRD into issues, says 'decompose this', 'create issues from this PRD', 'break this down into issues', or wants to prepare work for parallel agent execution. Explicit invocation: /to-issues [PRD path or number]"
user_invocable: true
argument_hint: "[PRD path, number, or omit to use most recent PRD]"
---

# To-Issues: PRD → Vertical Slice Issue Decomposition

Break a PRD into independently-grabbable GitHub Issues that can be executed in parallel by agents or humans.

## Process

### 1. Load the PRD

If `$ARGUMENTS` is provided:
- If it's a number (e.g., `001`), look for `docs/prds/NNN-*.md`
- If it's a path, read it directly
- Otherwise, find the most recently modified file in `docs/prds/`

Read the full PRD. If it doesn't follow the PRD template (problem, solution, user stories, implementation decisions), warn the user and suggest `/grill` first.

### 2. Load Architecture Context

Read the architecture manifest if it exists:
- `.agents-os/src/docs/architecture-layers.md` (project-level)

If absent, quickly infer system layers from the codebase structure (`apps/`, `services/`, `packages/`, database schemas).

Also read `CONTEXT.md` at the project root for domain terminology.

### 3. Identify Tracer-Bullet Vertical Slices

Group user stories and implementation decisions into **tracer-bullet vertical slices** — each slice fires a complete path through all relevant system layers, proving the integration works end-to-end. Prefer many thin slices over few thick ones.

**Vertical slice properties:**
- Crosses multiple layers (schema + service + API + minimal UI where applicable)
- Has clear acceptance criteria derived from user stories
- Can be implemented and tested without other slices being complete
- Produces observable behavior change (not just "add a database table")
- Is independently demoable — someone can see it working without the other slices

**Anti-horizontal-slicing rule:** Never create issues that live in a single layer. "Add all database tables" is horizontal — it builds infrastructure without proving anything works. "Add lexeme mastery tracking end-to-end" is vertical — it proves the full path. If you catch yourself grouping by layer (all schema, then all services, then all API), stop and regroup by behavior.

### 4. Decompose into Issues

For each vertical slice, create one or more issues. Each issue is an **agent brief** — behavioral, durable, no file paths.

**Issue format:**

```markdown
## Title: [Imperative verb] [what]

**Type:** HITL | AFK
**Slice:** [Which vertical slice this belongs to]
**Keystone:** #K (the keystone issue for this slice)
**Blocks:** #N, #M (issue numbers that cannot start until this completes)
**Blocked by:** #X, #Y (issues that must complete first)

### Current Behavior
[What the system does now — or "N/A" for greenfield]

### Desired Behavior
[What the system should do after this issue is complete]

### Key Interfaces
[Types, API contracts, or behavioral boundaries — NOT file paths]

### Acceptance Criteria
- [ ] [Observable, testable criterion]
- [ ] [Observable, testable criterion]

### Scope Boundaries
- IN: [what's included]
- OUT: [what's explicitly excluded — prevents agent scope creep]

### Test Strategy & Verification
[Hints for the builder agent: what kind of tests to write (table-driven, property-based, mock boundaries, etc.). Also serves as manual verification guide for PR reviewer — what to check on-device or in-browser that tests can't cover.]
```

### 5. Build the Dependency DAG

Establish blocking relationships:
- Schema/data model issues typically block service logic issues
- Service logic issues typically block API/integration issues
- Shared infrastructure (auth, config) blocks feature work
- Issues within the same slice may have internal ordering
- Issues across slices should be independent where possible

Verify: **no circular dependencies**. If you find a cycle, restructure the slices.

### 6. Triage Each Issue

Assign both a **role** and a **state**:

**Role (who can do this):**
- **AFK**: Can be executed by an agent without human input. Has clear acceptance criteria, no ambiguous design decisions remaining, no external service setup required.
- **HITL**: Requires human judgment, external service configuration, design decisions, or manual testing that agents can't perform.

**State (is this ready):**
- **ready**: Fully specified — acceptance criteria are clear, dependencies are identified, an agent or human can start immediately.
- **needs-info**: Missing context that blocks implementation. Note what's missing in the issue body.
- **wontfix**: Identified during decomposition as unnecessary. Don't create the issue — note it in the review summary as descoped.

Every issue starts as `ready` unless you flag it otherwise. If more than ~25% of issues are `needs-info`, the PRD probably needs another `/grill` pass before decomposition.

### 7. Present for Review

Display the full decomposition as a numbered list with:
- Issue title, role (HITL/AFK), and state (ready/needs-info)
- Blocking relationships as a DAG (text or ASCII art)
- Which vertical slice each issue belongs to
- Estimated complexity (S/M/L)

If any issues are `needs-info`, list what's missing and whether it blocks other issues.

**Do NOT publish issues yet.** Wait for the user to review, adjust, and approve.

### 8. Generate Keystone Issues

For each vertical slice, generate a **keystone issue** — the integration coordination point for the slice. The keystone is created **after** all child issues (it needs their numbers).

**Keystone issue format:**

```markdown
## Keystone: [Slice Name]

**Slice:** [slice name]
**PRD:** [link to PRD]
**Status:** Open

### Purpose
[1-2 sentences: what this slice proves end-to-end]

### Child Issues
- [ ] #N — [title]
- [ ] #M — [title]
- [ ] #P — [title]

### Acceptance Criteria
- [ ] [Slice-level behavioral criterion — domain language, Given/When/Then]
- [ ] [Integration-level: verifies the slice works as a whole, not per-issue]

### Scope Boundaries
- IN: [what the slice covers]
- OUT: [what's explicitly deferred]
```

**Rules:**
- 3-8 acceptance criteria per keystone. If you need more, the slice is too thick — split it.
- AC should be in domain language from CONTEXT.md — no implementation details.
- AC should be satisfiable only by the combined work of all child issues — no single child issue makes all AC pass.
- Labels: `keystone`, `slice:<name>`, `prd-NNN`. Do NOT add `afk` or `hitl` — the keystone is a coordination artifact, not a work item.
- The keystone is never assigned to a builder agent. It is owned by the merge/integration process.

**Keystone lifecycle:**
- **Open** — created, no child issues picked up yet
- **In Progress** — at least one child issue is being worked on
- **Blocked** — remaining unfinished child issues are all HITL (needs human attention)
- **Verifying** — all child issues closed, acceptance tests being written and run by merge agent
- **Done** — acceptance tests pass, slice merged

**Do NOT generate acceptance test files.** The keystone AC is the planning artifact. The merge/integration agent writes the executable acceptance test file during integration, when the code exists and interfaces are real.

### 9. Publish (on user approval)

Create GitHub Issues using `gh issue create`:

**Child issues first:**
- Title: the issue title
- Body: the full agent brief (with `Keystone:` field left as TBD)
- Labels: `afk` or `hitl`, `ready` or `needs-info`, `slice:<name>`, `prd-NNN`
- After creation, update blocking references with actual issue numbers

**Keystone issues last** (after all child issues have numbers):
- Title: `Keystone: <Slice Name>`
- Body: the keystone format from Step 8, with child issue numbers populated
- Labels: `keystone`, `slice:<name>`, `prd-NNN`
- After creation, update child issues to fill in their `Keystone: #K` field

If the user prefers local-only (no GitHub), write issues as individual markdown files in `docs/issues/` with the same format.

## Anti-Patterns

- **Don't create horizontal issues.** "Add all database tables" is horizontal. "Add lexeme mastery tracking end-to-end" is vertical.
- **Don't include file paths in issues.** They rot. Use behavioral descriptions and type interfaces.
- **Don't create issues smaller than a meaningful behavior change.** Each issue should produce something observable.
- **Don't create issues larger than ~1 day of agent work.** If an issue feels like it needs sub-tasks, it's probably two slices.
- **Don't skip the review step.** Always present the decomposition before publishing.

## Execution Modes

After issues are published, they can be executed via:
- **Single issue**: `/build <issue-number>` — one agent, one issue
- **Full PRD**: Orchestrator picks unblocked issues, spawns parallel agents
- **First N**: Orchestrator runs the first N unblocked issues only

The orchestrator is a separate concern. This skill only handles decomposition.
