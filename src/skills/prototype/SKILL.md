---
name: prototype
description: Builds the smallest disposable artifact that answers one explicit question with observable evidence. Use when testing a design assumption, state model, interaction, or UI direction before production implementation.
---

# Prototype

A prototype is disposable evidence for one explicit question. The question and evaluator determine its form.

## Execution Context

When a Frame or another coordinating workflow needs a prototype, keep the coordinator as the control plane and delegate the prototype to one fresh-context worker. The coordinator bounds the question, evaluator, authorization, constraints, and evidence contract; the worker owns building, iterative debugging, execution, evaluation, and authorized disposal. Return a compact result with the artifact locator, exact evidence or verification commands, limitations, and residual state. Keep detailed logs and scratch output in the prototype artifact rather than the coordinator's conversation.

An agent explicitly delegated the prototype is already the worker and does not delegate it again. Execute in the coordinating thread only when the discriminator is a single-pass operation requiring no iterative build or debugging and no substantial logs or scratch artifacts, or when the user explicitly requests inline execution. If fresh-context workers are unavailable, return the bounded prototype plan and the delegation limitation to the coordinator rather than silently running iterative work inline.

## 1. Bound The Question

State one answerable question before building. If the request contains several independent uncertainties, ask the user to choose one or split the work into separate prototypes.

Identify:

- the question;
- the evaluator: model, human, or joint;
- the observation that would support or reject the proposition;
- constraints needed to keep the artifact small.

Do not begin until the question can produce an observable result.

Proceed when the question, evaluator, proposition, observable discriminator, and scope constraint are explicit.

## 2. Select The Evidence Form

Choose the smallest form the evaluator can assess:

- **Model-evaluated:** prefer a minimal executable harness with inspectable output.
- **Human-evaluated:** use an interactive artifact by default; use a static form only when interaction cannot add relevant evidence.
- **Jointly evaluated:** combine human interaction with model-verifiable state or instrumentation.

For logic, state-machine, or business-rule questions, read [LOGIC_STATE.md](LOGIC_STATE.md).

For open-ended interface exploration, read [UI_VARIANTS.md](UI_VARIANTS.md).

Improvise another form when it answers the question more directly. Do not force a terminal or web interface onto evidence that needs neither.

Proceed when the chosen form lets the identified evaluator observe the discriminator directly.

## 3. Build For Disposal

Colocate the prototype with the code or system it informs and mark it clearly as a prototype. Keep it uncommitted by default.

Implement only enough fidelity, instrumentation, and error handling to make the observation trustworthy. There is no test-suite, production architecture, persistence, or polish obligation unless one is itself necessary to answer the question.

Make the relevant state and outcomes visible. Prefer one obvious command or action to run the prototype.

Proceed when the artifact has a runnable or presentable entry point and exposes the state or outcome needed for evaluation.

## 4. Evaluate

Run or present the artifact to its evaluator. Record observations rather than inferring success from the artifact merely running.

Use exactly one verdict:

- `supported`: observed evidence supports the proposition within stated limits;
- `rejected`: observed evidence contradicts the proposition;
- `inconclusive`: the prototype did not discriminate reliably.

Report:

```markdown
## Prototype Result

**Question:** <one question>
**Evaluator:** <model | human | joint>
**Verdict:** <supported | rejected | inconclusive>

### Observed Evidence
<what was actually observed>

### Limitations
<what the prototype did not establish>

### Disposition
- <artifact or output>: <delete pending approval | deleted with approval | retain as evidence | explicitly approved for promotion>
```

## 5. Dispose Or Promote

After capturing the result, recommend deletion by default and ask before deleting unless cleanup was already authorized. Inventory every created artifact, including scratch state and instrumentation output, and record its disposition and authorization status. If the user deliberately chooses promotion, carry the learned design into the normal engineering workflow and add appropriate architecture, tests, failure handling, security, and maintainability. Prototype code is not production-ready merely because its verdict was `supported`.

An `inconclusive` result may justify a new, separately bounded prototype. It does not justify leaving the current artifact indefinitely.
