---
name: to-tickets
description: Break a spec, plan, or conversation into independently executable tracer-bullet tickets with explicit blocking relationships.
user_invocable: true
argument_hint: "[spec path, tracker reference, or current conversation]"
---

<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

# To Tickets: Spec → Tracer-Bullet Ticket Decomposition

Break a spec into independently executable tickets that can be worked by agents or humans. Use local one-file-per-ticket storage or the configured issue tracker.

## Process

### 1. Load the spec

If `$ARGUMENTS` names a path or tracker reference, load its complete body and discussion. Otherwise use the current conversation or the repository's most recent durable spec according to its existing conventions.

Read the full spec. If it doesn't follow the spec template (problem, solution, user stories, implementation decisions), warn the user and suggest `/grill` first.

### 2. Load Architecture Context

Read the architecture manifest if it exists:
- `.agents-os/src/docs/architecture-layers.md` (project-level)

If absent, quickly infer system layers from the codebase structure (`apps/`, `services/`, `packages/`, database schemas).

Read the relevant domain glossary and ADRs. Invoke `domain-modeling` if decomposition reveals a terminology conflict rather than resolving it ad hoc.

### 3. Identify Tracer-Bullet Vertical Slices

Group user stories and implementation decisions into **tracer-bullet vertical slices** — each slice fires a complete path through all relevant system layers, proving the integration works end-to-end. Prefer many thin slices over few thick ones.

**Vertical slice properties:**
- Crosses multiple layers (schema + service + API + minimal UI where applicable)
- Has clear acceptance criteria derived from user stories
- Can be implemented and tested without other slices being complete
- Produces observable behavior change (not just "add a database table")
- Is independently demoable — someone can see it working without the other slices

**Anti-horizontal-slicing rule:** Never create issues that live in a single layer. "Add all database tables" is horizontal — it builds infrastructure without proving anything works. "Add lexeme mastery tracking end-to-end" is vertical — it proves the full path. If you catch yourself grouping by layer (all schema, then all services, then all API), stop and regroup by behavior.

**Wide-refactor exception:** A mechanical change whose blast radius cannot land green as a vertical slice should use expand–migrate–contract tickets. Add the new form beside the old, migrate callers in independently green batches, then delete the old form after all migrations. If batches cannot remain green independently, make them share an integration branch and block a final integrate-and-verify ticket.

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

Every issue starts as `ready` unless you flag it otherwise. If more than ~25% of issues are `needs-info`, the spec probably needs another `/grill` pass before decomposition.

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
**spec:** [link to spec]
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
- Labels: `keystone`, `slice:<name>`, `spec-NNN`. Do NOT add `afk` or `hitl` — the keystone is a coordination artifact, not a work item.
- The keystone is never assigned to a ticket writer. It is owned by the `implement-feature` coordinator; `feature-integration` only integrates completed waves and runs focused integration checks.

**Keystone lifecycle:**
- **Open** — created, no child tickets dispatched yet
- **In Progress** — at least one child ticket is being implemented, reviewed, or integrated
- **Needs Attention / Blocked** — an investigated decision or external/manual dependency blocks the affected graph
- **Verifying** — all required child tickets are integrated; `implement-feature` is running feature-level acceptance, manual E2E, deep review, drift, and reporting gates
- **PR Ready** — gates and current PR checks pass; non-keystone child tickets are closed and linked to the feature PR/report
- **Done** — feature PR is merged and target ancestry/landing criteria are verified

**Do NOT generate acceptance test files during decomposition.** The keystone AC is the planning contract. During final verification, `implement-feature` assigns executable black-box acceptance-test work to a scoped writer when needed, then runs and records the feature gate. `feature-integration` does not own final acceptance or tracker lifecycle.

### 9. Publish (on user approval)

Create GitHub Issues using `gh issue create`:

**Child issues first:**
- Title: the issue title
- Body: the full agent brief (with `Keystone:` field left as TBD)
- Labels: `afk` or `hitl`, `ready` or `needs-info`, `slice:<name>`, `spec-NNN`
- After creation, update blocking references with actual issue numbers

**Keystone issues last** (after all child issues have numbers):
- Title: `Keystone: <Slice Name>`
- Body: the keystone format from Step 8, with child issue numbers populated
- Labels: `keystone`, `slice:<name>`, `spec-NNN`
- After creation, update child issues to fill in their `Keystone: #K` field

For local tracking, write one file per ticket under the repository's existing issue convention, or `.scratch/<feature>/issues/` when none exists. Number files in dependency order and record blocking edges by ticket number/title.

## Anti-Patterns

- **Don't create horizontal issues.** "Add all database tables" is horizontal. "Add lexeme mastery tracking end-to-end" is vertical.
- **Don't include file paths in issues.** They rot. Use behavioral descriptions and type interfaces.
- **Don't create issues smaller than a meaningful behavior change.** Each issue should produce something observable.
- **Don't create issues larger than ~1 day of agent work.** If an issue feels like it needs sub-tasks, it's probably two slices.
- **Don't skip the review step.** Always present the decomposition before publishing.

## Execution Modes

After issues are published, they can be executed via:
- **Single ticket**: `/ticket-executor <ticket>` — one atomic writer
- **Full feature/keystone**: `/implement-feature <ticket-graph-or-keystone>` — bounded ticket waves, integration, verification, reporting, and one final PR
- **First N**: `implement-feature` may be invoked with an explicit bounded scope when the accepted graph allows a partial run

The orchestrator is a separate concern. This skill only handles decomposition. `implement-feature` coordinates execution and invokes `feature-integration` for completed waves, including dedicated refactor cycles when ticket branches cannot be reconciled at the correct seam.
