---
name: to-tickets
description: Break a spec, plan, or conversation into independently executable tracer-bullet tickets with explicit blocking relationships.
user_invocable: true
argument_hint: "[spec path, tracker reference, or current conversation]"
---

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

### 3. Identify Features Before Tickets

First partition the spec into **implementation features**. A feature is a coherent, independently releasable user or operator outcome that should be coordinated, integrated, verified, and shipped as one effort. **Each feature gets exactly one keystone.**

A broad spec may contain more than one feature, but parallel subsystems or workstreams inside one outcome are **tracks**, not features and not keystones. For example, entitlement, persistence, API, UI, and adapter tracks may all converge on one customer-visible feature.

**Feature boundary test:**
- Completion produces a coherent outcome recognizable in domain/product language.
- The outcome can be accepted and shipped independently of other proposed features.
- Its acceptance criteria require the integrated contribution of multiple child tickets.
- A future end-to-end implementation coordinator should naturally produce one integration effort and one feature PR. No such coordinator is currently installed.
- If two proposed keystones must both finish before either creates a meaningful outcome, merge them into one keystone and represent their work as parallel tracks.

Most bounded specs should produce one keystone; broad specs commonly produce two or three. More than three is a warning to justify every boundary explicitly. Never create a keystone merely because work can run in parallel, belongs to a subsystem, or has its own dependency chain.

Then decompose each feature into **tracer-bullet tickets**. Prefer tickets that fire a thin complete path through the relevant layers and prove observable behavior. Organize independently executable tickets into named parallel tracks beneath the feature when useful.

**Tracer-bullet ticket properties:**
- Has clear acceptance criteria derived from the feature stories.
- Can land green and be tested without unfinished sibling branches.
- Produces observable behavior or proves a durable integration seam.
- Is small enough for roughly one agent-day.
- Contributes directly to the parent keystone's integrated acceptance.

**Anti-horizontal-slicing rule:** Do not create broad layer-completion tickets such as "add all database tables." Prefer behavior such as "assign and explain an entitlement through the operator path." A narrow enabling ticket is allowed when a deep seam or mechanical migration cannot safely cross all layers in one day, provided it lands green, proves its contract, names the feature track it enables, and blocks a later tracer-bullet integration ticket.

**Wide-refactor exception:** A mechanical change whose blast radius cannot land green as a vertical slice should use expand–migrate–contract tickets. Add the new form beside the old, migrate callers in independently green batches, then delete the old form after all migrations. If batches cannot remain green independently, make them share an integration branch and block a final integrate-and-verify ticket.

### 4. Decompose Features into Issues

For each feature, create child issues across its tracer-bullet tracks. Each issue is an **agent brief** — behavioral, durable, no file paths. Do not create child keystones for tracks.

**Issue format:**

```markdown
## Title: [Imperative verb] [what]

**Type:** HITL | AFK
**Feature:** [Parent implementation feature]
**Track:** [Parallel workstream within the feature]
**Keystone:** #K (the one keystone for this feature)
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
- Issues within the same track may have internal ordering
- Tracks under one keystone should run independently where possible and converge at integration
- Separate features/keystones should be independently shippable; if they mutually block meaningful completion, reconsider the feature boundary

Verify: **no circular dependencies**. If you find a cycle, restructure the tickets or reconsider the feature boundary.

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
- Proposed feature/keystone boundaries and why each is independently shippable
- Issue title, role (HITL/AFK), and state (ready/needs-info)
- Blocking relationships as a DAG (text or ASCII art)
- Which feature and parallel track each issue belongs to
- Estimated complexity (S/M/L)
- Total child-ticket and keystone counts

If any issues are `needs-info`, list what's missing and whether it blocks other issues.

**Do NOT publish issues yet.** Wait for the user to review, adjust, and approve.

### 8. Generate Keystone Issues

For each accepted **implementation feature**, generate exactly one **keystone issue**. The keystone coordinates the entire feature across all of its parallel tracks; it is not a track, subsystem, phase, or large child ticket. Create it **after** all child issues because it needs their numbers.

**Keystone issue format:**

```markdown
## Keystone: [Feature Name]

**Feature:** [feature name]
**spec:** [link to spec]
**Status:** Open

### Purpose
[1-2 sentences: the independently releasable outcome this feature proves end-to-end]

### Child Issues
- [ ] #N — [title]
- [ ] #M — [title]
- [ ] #P — [title]

### Acceptance Criteria
- [ ] [Feature-level behavioral criterion — domain language, Given/When/Then]
- [ ] [Integration-level: verifies the slice works as a whole, not per-issue]

### Scope Boundaries
- IN: [what the slice covers]
- OUT: [what's explicitly deferred]
```

**Rules:**
- 3-8 acceptance criteria per keystone. If you need more, sharpen the feature-level outcome before splitting; split only when the resulting features are independently meaningful and shippable.
- AC should be in domain language from CONTEXT.md — no implementation details.
- AC should be satisfiable only by the combined work of all child issues — no single child issue makes all AC pass.
- Labels: `keystone`, `slice:<feature-name>`, `spec-NNN`. Existing trackers may retain `slice:` as the label namespace, but it identifies the feature boundary, not an internal workstream. Do NOT add `afk` or `hitl` — the keystone is a coordination artifact, not a work item.
- The keystone is never assigned to a task writer. `software-implementation` owns authorized graph coordination, delegated wave integration, convergence, and proportional feature gates.

**Keystone lifecycle:**
- **Open** — created, no child tickets dispatched yet
- **In Progress** — at least one child ticket is being implemented, reviewed, or integrated
- **Needs Attention / Blocked** — an investigated decision or external/manual dependency blocks the affected graph
- **Verifying** — all required child tickets are integrated; an authorized owning coordinator is running feature-level acceptance, manual E2E, review, drift, and reporting gates
- **PR Ready** — gates and current PR checks pass; non-keystone child tickets are closed and linked to the feature PR/report
- **Done** — feature PR is merged and target ancestry/landing criteria are verified

**Do NOT generate acceptance test files during decomposition.** The keystone AC is the planning contract. During final verification, an authorized Software Implementation coordinator assigns executable black-box acceptance-test work to a scoped Coding Worker when needed, then delegates and records the declared feature gate.

### 9. Publish (on user approval)

Create GitHub Issues using `gh issue create`:

**Child issues first:**
- Title: the issue title
- Body: the full agent brief (with `Keystone:` field left as TBD)
- Labels: `afk` or `hitl`, `ready` or `needs-info`, `slice:<name>`, `spec-NNN`
- After creation, update blocking references with actual issue numbers

**Keystone issues last** (after all child issues have numbers):
- Title: `Keystone: <Feature Name>`
- Body: the keystone format from Step 8, with child issue numbers populated
- Labels: `keystone`, `slice:<feature-name>`, `spec-NNN`
- After creation, update child issues to fill in their `Keystone: #K` field

For local tracking, write one file per ticket under the repository's existing issue convention, or `.scratch/<feature>/issues/` when none exists. Number files in dependency order and record blocking edges by ticket number/title.

## Anti-Patterns

- **Don't create a keystone per track.** Parallel entitlement, persistence, adapter, API, or UI tracks belong under one feature keystone when they converge on one outcome.
- **Don't mistake dependency chains for features.** A workstream having its own DAG does not make it independently shippable.
- **Don't create broad horizontal issues.** "Add all database tables" is horizontal. "Add lexeme mastery tracking end-to-end" is vertical. Narrow independently green enabling seams are allowed only when they block an explicit integration ticket.
- **Don't include file paths in issues.** They rot. Use behavioral descriptions and type interfaces.
- **Don't create issues smaller than a meaningful behavior change.** Each issue should produce something observable.
- **Don't create issues larger than ~1 day of agent work.** If an issue feels like it needs sub-tasks, it is probably two tickets under the same feature.
- **Don't skip the review step.** Always present the decomposition before publishing.

## Execution Modes

After issues are published:
- **Single bounded ticket:** form a complete Task Contract and invoke `coding-worker` in an explicit worktree.
- **Full feature/keystone or bounded multi-ticket execution:** invoke `software-implementation` with the accepted graph, authority, integration base, execution-map locator, and proof profile.

Coordination is a separate concern. This skill only handles decomposition and never grants implementation, external-effect, PR, or landing authority.
