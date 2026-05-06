---
name: deliberate
description: Structured team debate using perspective agents. Spawns a council of forced-perspective agents who debate a topic in rounds, producing a synthesized recommendation. Use when facing architecture decisions, technology choices, or any proposal that benefits from adversarial analysis.
user-invocable: true
argument-hint: <topic or question to deliberate>
---

# Deliberate: Structured Perspective Debate

Run a multi-round debate using Pi subagents. Each perspective argues from its viewpoint, critiques the others, then defends or concedes. This skill is for the parent orchestrator. Do not ask child subagents to run subagents or use AgentOS team/task/message APIs.

Supporting file: `councils.md` — council templates with trigger keywords and default compositions.

## Process

### 1. Understand the Topic

Read the topic/question. Gather context:
- Read relevant source files, plans, or RFCs referenced
- Understand current state and constraints
- Identify what kind of decision this is

### 2. Auto-Select Council

Read `councils.md` for available templates. Then:

1. **Match the topic** against council template keywords
2. **Discover available perspectives** — glob `perspective-*.md` from both `~/.agents-os/src/agents/` and `.agents-os/src/agents/` (project-scoped)
3. **Map template to agents:**
   - Direct match (e.g., template says "Pragmatist", agent `perspective-pragmatist` exists) → use the agent
   - Project-scoped stateful perspective exists and fits better than a generic one → substitute it
   - No matching agent → use ad-hoc role defined in spawn prompt
4. **Default** to Architecture Council when no template clearly matches
5. **Announce briefly:** "Using Product Council: User Advocate, Pragmatist, Adversary" — proceed unless user overrides

**User override:** If the user specifies perspectives in the arguments, use those instead of auto-selection. Check for matching `perspective-*` agents first; fall back to ad-hoc roles.

**Technology choices** are special: spawn N advocate teammates (max 3) with ad-hoc roles, each arguing FOR their option and AGAINST the others. Don't use standard perspective agents.

### 3. Round 1 — State Positions

Launch one parallel `subagent` task per selected perspective. Use `context: "fresh"` unless the current conversation is itself necessary evidence.

```typescript
subagent({
  tasks: [
    {
      agent: "<perspective-agent-name>",
      task: `Round 1 deliberation.

Topic: <topic>
Context: <relevant context>

Argue from your perspective. Provide:
- position
- key arguments
- evidence or concrete examples
- recommendation
- confidence level`
    }
  ],
  context: "fresh"
})
```

Collect all Round 1 positions before proceeding.

### 4. Round 2 — Cross-Critique

Run a second parallel `subagent` pass. Include all Round 1 positions in every task and ask each perspective to critique the other positions.

```typescript
subagent({
  tasks: [
    {
      agent: "<same-perspective-agent>",
      task: `Round 2 deliberation.

Topic: <topic>

Round 1 positions:
<all positions>

Critique the other positions, not your own. Identify:
- incorrect assumptions
- missing evidence
- ignored risks
- strongest argument you disagree with`
    }
  ],
  context: "fresh"
})
```

Collect all Round 2 critiques before proceeding.

### 5. Round 3 — Defend or Concede

Run a final parallel `subagent` pass with the critiques included.

```typescript
subagent({
  tasks: [
    {
      agent: "<same-perspective-agent>",
      task: `Round 3 deliberation.

Topic: <topic>

Critiques of your position:
<relevant critiques>

Defend where critiques are wrong. Concede specific points where critiques are right. State your final recommendation and confidence level.`
    }
  ],
  context: "fresh"
})
```

Collect all final positions.

### 6. Synthesize

Collect all final positions and produce:

```markdown
## Deliberation Report: <topic>

### Council Used
<council name> — <why this council was selected>

### Perspectives
- **<name>**: <final position summary>
- **<name>**: <final position summary>
- **<name>**: <final position summary>

### Points of Agreement
<what all perspectives converged on>

### Points of Contention
<where they still disagree, and why — include the strongest argument from each side>

### Recommendation
<synthesized recommendation based on the arguments that survived challenge>

### Risk Register
<risks identified that should be tracked regardless of decision>
```
