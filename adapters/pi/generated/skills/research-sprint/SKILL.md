---
name: research-sprint
description: Parallel team investigation with cross-pollination. Spawns researchers who explore different angles of a question, share findings via messaging, and produce a synthesized research report. Use for open-ended exploration, technology evaluation, or multi-dimensional analysis.
user-invocable: true
argument-hint: <research question or topic>
---

<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

# Research Sprint: Parallel Pi Investigation

Use Pi subagents to investigate different dimensions of a question in parallel, then synthesize the findings. This skill is for the parent orchestrator. Do not ask child subagents to run subagents or use AgentOS team/task/message APIs.

## Process

### 1. Understand the Question

Read the research question. Gather context:
- What is being researched and why?
- What dimensions or angles need investigation?
- What decisions will this research inform?

### 2. Decompose into Tracks

Break the question into 2-4 independent research tracks. Each should explore a distinct dimension.

Example: "Should we use Supabase or build our own backend?"
- Track 1: Feature comparison and capability gaps
- Track 2: Operational cost and scaling characteristics
- Track 3: Developer experience and migration path

### 3. Select Subagents

For each track, determine the right subagent using this priority order:

**1. Check existing perspective agents** — glob `perspective-*.md` from both `~/.agents-os/src/agents/` (global) and `.agents-os/src/agents/` (project-scoped). Prefer project-scoped stateful perspectives when they fit — they bring richer domain context.

**2. Ad-hoc domain roles** — if the track needs specific domain expertise (e.g., "React performance specialist") that no existing perspective covers, define the role directly in the spawn prompt. No permanent agent needed for one-off roles.

**3. Create a permanent perspective** — invoke the `/create-perspective` skill when ALL of these are true:
   - The perspective would be repeatedly useful for this project's ongoing work
   - It represents a genuine, distinct viewpoint — not just a topic expert
   - There's a clear recurring decision pattern it serves ("business case")

   Placement is determined by the create-perspective skill:
   - **Global** (`~/.agents-os/src/agents/perspective-<name>.md`) — universally useful across projects
   - **Project-scoped** (`.agents-os/src/agents/perspective-<name>.md`) — domain-specific or stateful

**Stateful perspectives** have a "Before Starting" section that reads project docs (domain models, business goals, architecture decisions). When spawning a stateful perspective, ensure it has time to read its project context before starting research.

### 4. Run First-Round Research

Launch one parallel `subagent` task per track. Use `context: "fresh"` unless the track depends heavily on the current conversation. Prefer the built-in `researcher` for external evidence, `scout` for local codebase discovery, and perspective agents for viewpoint-driven analysis.

```typescript
subagent({
  tasks: [
    {
      agent: "<agent-name>",
      task: `Research track: <track focus>

Overall question: <research question and why it matters>
Sibling tracks: <list sibling tracks>

Deliver:
- key findings
- evidence and source/file references
- confidence level for each major claim
- implications for the overall decision
- findings that should be shared with sibling tracks`
    }
  ],
  context: "fresh"
})
```

### 5. Parent-Mediated Cross-Pollination

After first-round results return, identify cross-cutting findings and contradictions. If a finding materially changes another track, run a second parallel `subagent` pass with the relevant first-round excerpts injected into each task.

Second-round prompt shape:

```typescript
subagent({
  tasks: [
    {
      agent: "<same-or-new-agent>",
      task: `Revisit your track using these findings from sibling tracks:

<selected first-round findings>

Original track: <track focus>

Update your conclusion, call out contradictions, and state what changed.`
    }
  ],
  context: "fresh"
})
```

### 6. Synthesize

After all tracks complete:

```markdown
## Research Report: <topic>

### Question
<what was investigated and why>

### Findings by Track

**<Track 1>**:
<key findings, evidence, confidence levels, sources>

**<Track 2>**:
<key findings, evidence, confidence levels, sources>

### Cross-Cutting Insights
<discoveries that emerged from cross-pollination between tracks — findings one researcher shared that changed another's analysis>

### Recommendations
<actionable recommendations based on the combined findings>

### Open Questions
<what wasn't resolved and needs further investigation>
```
