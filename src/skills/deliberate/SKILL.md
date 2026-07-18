---
name: deliberate
description: Compares credible alternatives through decision-specific forced perspectives and preserves consequential disagreement. Use when choosing among architecture, technology, product, policy, or operational options with real trade-offs.
---

# Deliberate

Deliberate one bounded decision.

## 1. Bound The Decision

Establish these prerequisites:

- one decision;
- two or three credible alternatives;
- shared criteria;
- available evidence;
- constraints and relevant tensions;
- who retains consequential judgment.

If fewer than two credible alternatives are present, surface plausible alternatives, reframe the decision, or ask one focused question before proceeding. Narrow or split a request with more than three. Improve or replace straw alternatives before analysis. Ask only for missing input that materially changes the comparison; otherwise state assumptions.

Proceed when one decision, two or three credible alternatives, shared criteria, material constraints, available evidence, and the human authority boundary are explicit.

## 2. Generate Forced Perspectives

Create two to four decision-specific perspectives. Each is a materially distinct mandate derived from this decision, not a persistent persona or keyword-selected council.

Choose mandates that expose real tensions in the shared criteria. Examples of mandate shapes include optimizing the binding constraint, protecting the most exposed party, testing reversibility under uncertainty, or challenging the dominant causal assumption. Name them for their mandate, not as characters.

Every perspective must evaluate every alternative. A perspective is not an advocate assigned to one option.

## 3. Evaluate In Parallel

Use fresh-context reviewers in parallel when subagents are available; otherwise perform the perspectives sequentially while keeping their mandates distinct. Give each the same decision context, alternatives, criteria, evidence, and constraints.

Require each perspective to return:

```markdown
### <Mandate>

- **Alternative evaluations:** <every alternative under shared criteria>
- **Evidence:** <supported observations and sources>
- **Assumptions:** <claims not established by evidence>
- **Counterevidence:** <facts or arguments pulling the other way>
- **Trade-offs:** <what this mandate accepts or rejects>
- **Current conclusion:** <comparative conclusion and why>
- **Would change if:** <disconfirming evidence or condition>
```

Before synthesis, verify that every perspective evaluated every alternative and supplied each field. Repair incomplete evaluations before continuing.

Do not use votes, confidence averaging, or a raw debate transcript as synthesis.

## 4. Challenge Consequential Disagreement

After the first evaluation, identify disagreement that could materially change the recommendation or expose an unacceptable consequence. If none exists, skip challenge.

When it exists, run one targeted challenge pass only on the disputed claim, criterion, or evidence. Ask the affected perspectives to address the strongest counterposition and say whether the new examination changes their conclusion. Do not run fixed debate rounds or require defend-or-concede theater.

## 5. Synthesize Without False Consensus

Produce:

```markdown
## Deliberation: <decision>

### Alternatives And Criteria
<bounded alternatives, shared criteria, and constraints>

### Perspective Findings
<material conclusions, evidence, assumptions, and disconfirming conditions>

### Agreement
<supported convergence, if any>

### Contestation
<remaining disagreement and why it matters>

### Recommendation
<best-supported alternative, criteria that drive it, and material limitations;
or why current evidence does not justify a recommendation>

### Remaining Human Judgment
<trade-offs, authority choices, or evidence gaps the deliberation cannot resolve>
```

Preserve tensions when different criteria support different alternatives. A recommendation is advice under stated evidence and assumptions, not an automatic decision or implementation plan.
