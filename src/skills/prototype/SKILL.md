---
name: prototype
description: Builds the smallest disposable artifact that answers one explicit question with observable evidence. Use when testing a design assumption, state model, interaction, or UI direction before production implementation.
---

# Prototype

A prototype is disposable evidence for one explicit question. The question and evaluator determine its form.

## Execution Context

When a Frame or another coordinating workflow needs a prototype, keep the coordinator as the control plane and delegate the prototype to one fresh-context worker. The coordinator bounds the question, evaluator, authorization, constraints, and evidence contract; the worker owns building, iterative debugging, execution, evaluation, and authorized disposal. Return a compact result with the artifact locator, exact evidence or verification commands, limitations, and residual state. Keep detailed logs and scratch output in the prototype artifact rather than the coordinator's conversation.

An agent explicitly delegated the prototype is already the worker and does not delegate it again. Execute in the coordinating thread only when the discriminator is a single-pass operation requiring no iterative build or debugging and no substantial logs or scratch artifacts, or when the user explicitly requests inline execution. If fresh-context workers are unavailable, return the bounded prototype plan and the delegation limitation to the coordinator rather than silently running iterative work inline.

## Authorization Boundary

Proceed without asking when the prototype is isolated, local, incurs no incremental charge, and all mutable runtime and data targets are prototype-owned. Standing local authority includes creating, starting, stopping, rebooting, fault-injecting, and deleting disposable VMs or containers; loopback listeners; synthetic data; temporary prototype-owned processes; and cleanup of prototype-owned files and runtime. It also includes ordinary public downloads and dependency resolution when dependencies are installed in a prototype-owned, unprivileged environment.

Ask only when the prototype would incur charges through external infrastructure or API usage without an existing bounded authorization; access production or shared credentials or resources; modify or delete pre-existing user data or unrelated processes; install or reconfigure privileged system-wide infrastructure; make consequential external writes; or risk destructive effects escaping the disposable boundary. Deleting prototype-owned resources is authorized cleanup, not a new destructive action.

When permission is required, present one grouped authorization batch covering objective, environment, credentials, data, effects, persistence, blast radius, and expected cost. Do not interrupt merely because an isolated local prototype creates or deletes disposable VMs or containers, reboots or fault-injects them, or terminates prototype-owned processes.

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

Place the prototype in a clearly marked, prototype-owned location adjacent to the code it informs when that location is local and unshared; otherwise use a separate isolated workspace. Keep it uncommitted by default. Colocation never authorizes mutation of the codebase, production system, shared environment, or other pre-existing resources it informs.

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
- <artifact or output>: <deleted as authorized cleanup | retained as evidence | cleanup blocked because it exceeds the prototype-owned boundary | explicitly approved for promotion>
```

## 5. Dispose Or Promote

After capturing the result, delete prototype-owned disposable resources by default under the standing authorization boundary unless the user requested retention. Ask before deletion only when ownership is uncertain or deletion could affect pre-existing, shared, production, or otherwise out-of-boundary resources. Inventory every created artifact, including scratch state and instrumentation output, and record its disposition and any residual state. If the user deliberately chooses promotion, carry the learned design into the normal engineering workflow and add appropriate architecture, tests, failure handling, security, and maintainability. Prototype code is not production-ready merely because its verdict was `supported`.

An `inconclusive` result may justify a new, separately bounded prototype. It does not justify leaving the current artifact indefinitely.
