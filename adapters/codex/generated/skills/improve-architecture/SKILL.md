---
name: improve-architecture
description: "Find deepening opportunities in a codebase — shallow modules, pass-through layers, leaky seams. TRIGGER when: user wants to improve architecture, find refactoring opportunities, consolidate tightly-coupled modules, or make a codebase more testable and AI-navigable. Explicit invocation: /improve-architecture [focus area]"
user_invocable: true
argument_hint: "[optional focus area — e.g., 'auth layer', 'data pipeline', 'API handlers']"
---

<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

# Improve Codebase Architecture

Surface architectural friction and propose **deepening opportunities** — refactors that turn shallow modules into deep ones. Grounded in Ousterhout's "A Philosophy of Software Design."

## Vocabulary

Use these terms consistently in every suggestion. Precise language prevents drift.

| Term | Definition |
|---|---|
| **Module** | Anything with an interface and an implementation (function, class, package, slice) |
| **Interface** | Everything a caller must know to use the module: types, invariants, error modes, ordering, config. Not just the type signature. |
| **Implementation** | The code inside |
| **Depth** | Leverage at the interface: a lot of behaviour behind a small interface. Deep = high leverage. Shallow = interface nearly as complex as the implementation. |
| **Seam** | Where an interface lives; a place behaviour can be altered without editing in place |
| **Adapter** | A concrete thing satisfying an interface at a seam |
| **Leverage** | What callers get from depth |
| **Locality** | What maintainers get from depth: change, bugs, knowledge concentrated in one place |

**Key heuristics:**
- **Deletion test:** Imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across N callers, it was earning its keep.
- **The interface is the test surface.**
- **One adapter = hypothetical seam. Two adapters = real seam.** Don't introduce a port unless two adapters are justified.

## Process

### 1. Gather Context

Before exploring code, silently load project context:
- Read `CONTEXT.md` at the project root if it exists — use its domain vocabulary
- Scan for an ADR/decisions directory (`docs/decisions/`, `docs/adr/`, or similar) — respect existing architectural decisions
- If `$ARGUMENTS` specifies a focus area, scope exploration to that area

### 2. Explore

Use the Agent tool with `agent_role=Explore` to walk the codebase organically, noting friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules shallow — interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but real bugs hide in how they're called?
- Where do tightly-coupled modules leak across their seams?
- Which parts are untested, or hard to test through their current interface?
- Where are there pass-through layers that add no depth?

Apply the **deletion test** to any shallow suspect.

### 3. Present Candidates

Present a numbered list. For each candidate:

- **Files** — which files/modules are involved
- **Problem** — why current architecture causes friction (use vocabulary above)
- **Friction type** — shallow module / pass-through / leaky seam / tight coupling / untestable interface
- **Proposed direction** — plain English description of what would change
- **Benefits** — explained in terms of **locality** and **leverage**, and how tests would improve

Use project domain vocabulary (from CONTEXT.md) for domain concepts, skill vocabulary (above) for architecture concepts.

**ADR conflicts:** Only surface when friction is real enough to warrant revisiting a prior decision. Mark clearly: "This conflicts with [ADR name] — worth revisiting if [condition]."

Do NOT propose interfaces yet. Ask: **"Which of these would you like to explore?"**

### 4. Deepen

Once the user picks a candidate, drill into the design. This is a conversation, not a monologue.

#### Dependency-Aware Strategy

Choose the deepening approach based on what the module depends on:

| Dependency type | Strategy | Test approach |
|---|---|---|
| **In-process** (pure computation) | Always deepenable. Merge shallow modules behind a deeper interface. | Test directly through the new interface. |
| **Local-substitutable** (DB, FS with local stand-ins like PGLite, in-memory FS) | Seam is internal. Deepen the module, use local substitute in tests. | Integration tests with local substitute. |
| **Remote but owned** (your own services) | Ports & adapters. Define a port, HTTP adapter for prod, in-memory adapter for tests. | Test through port with in-memory adapter. |
| **True external** (third-party APIs) | Inject as port with mock adapter. Minimize surface area of the port. | Mock adapter in tests. |

#### Seam Discipline

- Don't create a seam for a single adapter. One adapter = hypothetical seam at best.
- If you already have two concrete implementations (prod + test), that's a real seam worth a port.
- Premature abstraction is shallow by definition — it adds interface without adding depth.

#### Design It Twice

When the right interface isn't obvious, explore alternatives in parallel:

1. Frame the problem space: constraints, dependencies, illustrative code sketch
2. Propose 2-3 radically different interface designs:
   - **Minimal interface** — 1-3 entry points, maximum leverage
   - **Flexible interface** — many use cases, extension points
   - **Common-case interface** — default case is trivial, power features available but not required
3. Compare by depth, locality, seam placement. Give an opinionated recommendation.

#### Side Effects (Inline)

As decisions crystallize during deepening:
- **New domain term defined?** If CONTEXT.md exists, add the term now. Don't batch.
- **Existing term sharpened?** Update CONTEXT.md in place.
- **Decision worthy of an ADR?** Note it: "This is ADR-worthy: [decision summary]." Don't write the ADR inline — that's a separate workflow.

### 5. After Deepening

Once the refactor direction is agreed:
- Delete old unit tests on shallow modules once new tests at the deepened interface exist. Don't keep both.
- Tests assert on observable outcomes through the interface, not internal state.
- If the refactor is large enough to warrant tracked implementation, suggest the appropriate next step (issue, PR, implementation plan — whatever the project uses).

## Anti-Patterns

- **Don't propose interfaces before the user picks a candidate.** Premature specificity kills the conversation.
- **Don't deepen everything.** Some modules are intentionally shallow (thin wrappers, config, glue code). The deletion test catches these.
- **Don't introduce seams speculatively.** One adapter = no seam needed yet.
- **Don't ignore existing ADRs.** If a decision constrains the architecture, work within it or explicitly propose revisiting.
- **Don't use vague architecture language.** Say "shallow module" not "could be improved." Say "leaky seam" not "tight coupling." The vocabulary exists for a reason.
