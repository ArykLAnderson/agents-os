---
name: create-perspective
description: Create a new perspective agent — stateless (global) or stateful (project-scoped, grounded in project docs/plans/state). Use when a deliberation or research sprint needs a recurring perspective that doesn't exist yet, or when a project's domain warrants a dedicated viewpoint.
user-invocable: true
argument-hint: <description of the perspective needed and why>
---

# Create Perspective: Build a New Perspective Agent

Create a deeply characterized perspective agent for use in deliberation councils and research sprints.

## Perspective Types

### Stateless Perspectives
Universal viewpoints that work across any project. They bring a LENS (pragmatism, user focus, risk awareness) without needing project-specific knowledge.

- Placement: **Global** (`~/.agents-os/src/agents/perspective-<name>.md`)
- Examples: Pragmatist, Adversary, User Advocate

### Stateful Perspectives
Grounded in project artifacts. They read domain docs, business goals, architecture decisions, or other project state on every invocation, providing contextually informed analysis.

- Placement: **Project-scoped** (`.agents-os/src/agents/perspective-<name>.md`)
- Include a "Before Starting" section listing specific project docs to read
- Examples: Domain Expert, Product Strategist, Compliance Advocate

**Feedback loop:** Stateful perspectives naturally evolve with the project. They read project docs → participate in deliberation → accepted outcomes update the relevant Casebook or project authority → next invocation reads the updated state.

## Process

### 1. Understand the Need

From the arguments or conversation context:
- What viewpoint is missing from existing perspectives?
- What decisions will this perspective repeatedly participate in?
- Is this universally useful (stateless) or project-specific (stateful)?

### 2. Check Existing Perspectives

Glob `perspective-*.md` from both `~/.agents-os/src/agents/` and `.agents-os/src/agents/` to ensure no similar perspective exists. If one does, suggest modifying it instead of creating a duplicate.

### 3. Research Best Practices

Search the web for how others have implemented similar AI perspective/persona agents:
- What characterization makes this perspective genuinely distinct?
- What are the key instinctive questions this perspective asks?
- What biases or anti-patterns should be avoided?

Synthesize findings with the specific project's domain and needs.

### 4. Assess Project Documentation (stateful only)

For stateful perspectives, map the project's documentation landscape:
- What docs exist in `.agents-os/src/docs/`, `docs/`, or project root?
- What project artifacts inform this perspective? (schemas, roadmaps, domain models, compliance docs)
- Are there external dashboards, trackers, or references this perspective should be aware of?

If critical project docs don't exist yet, note what should be created for this perspective to be fully effective. Don't block creation — the perspective can work with partial state and improve as docs are added.

### 5. Draft the Agent

Follow the established structure:

```markdown
---
name: perspective-<name>
description: <specific delegation trigger — must distinguish from existing perspectives>
model: fast
tools: read, grep, find, ls
---

# <Name> Perspective

You are the <Name>. <One-line identity statement>

## Before Starting (stateful perspectives only)

Read the following project documents to ground your analysis in current state:
1. `.agents-os/src/docs/<relevant>.md` — <what it provides>
2. `docs/<relevant>` — <what it provides>

If any document doesn't exist, note the gap but proceed with available context.

## Core Philosophy

- <3-5 foundational beliefs>

## How You Think

When evaluating a proposal, you instinctively ask:
- <4-5 characteristic questions unique to this perspective>

## What You're Skeptical Of

- <4-5 things this perspective consistently pushes back on>

## In Debate

<2-3 sentences: what this perspective advocates for, how it engages with others, when it concedes>

## In Research

<2-3 sentences: what evidence this perspective prioritizes, what sources it trusts, how it evaluates options>
```

### 6. Validate Distinctness

Before saving, verify the perspective is genuinely distinct:
- Would it produce meaningfully different analysis than any existing perspective?
- Does it have characteristic questions no other perspective asks?
- In a 3-agent debate, would it pull the conversation in a direction the others wouldn't?

If not distinct enough, consider enriching an existing perspective instead.

### 7. Save

- **Stateless:** `~/.agents-os/src/agents/perspective-<name>.md`
- **Stateful:** `.agents-os/src/agents/perspective-<name>.md`

### 8. Report

Summarize:
- What was created and the reasoning
- Where it was placed (global vs project-scoped) and why
- Which council templates it naturally fits into (reference `~/.agents-os/src/skills/deliberate/councils.md`)
- For stateful: which project docs it reads, and any docs that should be created
- Suggest council template updates if this perspective enables a new council pattern
