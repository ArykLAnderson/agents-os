---
name: frame
description: Frames a consequential software outcome into externally meaningful guarantees and decision-changing uncertainty without selecting internal machinery.
---
# Frame: external boundary, not machinery

Use for a software-system outcome that is ambiguous, consequential, or likely to acquire accidental architecture. Optimize for the earliest trustworthy connected production outcome, not exhaustive discovery. When ordinary Frame state must be created, resumed, or changed, read [references/persistence.md](references/persistence.md) and use the packaged Casebook CLI. For creation, prefer direct flags for a simple useful Frame or compact JSON on stdin with valueless `--draft` for richer creation. Changes require an exact read, preservation of all unchanged families and stable IDs, and a complete aggregate commit; shortcuts are creation-only. Whole-Frame delete is revision-checked logical tombstoning, not physical purge.

## Make the boundary

Record only:

1. **Outcome:** recognizable user/operator result and immediate consumer.
2. **External technical boundary:** observable behavior, reliability/security/latency/retention or recovery guarantees that consumers may rely on; constraints and exclusions.
3. **Evidence/terrain:** facts, source locators, confidence, and limitations.
4. **Questions:** classify as human authority, behavior, design, realization, or evidence. Keep only unresolved, boundary-changing human questions in a visible decision queue.
5. **Decision record:** selected boundary, alternatives/rejections where material, acceptance provenance, and why it is sufficient.

Do **not** put internal machinery here: modules, persistence tables, queues, retries, file layout, task order, or a preferred pattern. A technical guarantee belongs here only when externally meaningful (for example, “a completed request remains observable after restart”), not its mechanism (“use an outbox”).

## Navigate nonlinearly

- Inspect terrain before asking for facts the system can reveal.
- Treat an explicitly supplied outcome or immediate consumer as a boundary fact. Reopen it only when evidence conflicts or a proposed scope change is surfaced explicitly; do not manufacture ambiguity by listing adjacent consumers.
- Generate alternatives only if they could change the boundary or design; include do-less/defer where credible.
- Send a material behavior/quality contradiction back to Frame. Send responsibility, contract, state, or routeability questions to Design.
- Commission a Prototype only for an explicit proposition with an observable discriminator. A prototype does not accept behavior or architecture.
- Revisit the boundary when evidence invalidates an assumption. Revision is reconciliation, not failure.
- Surface a bounded human decision when external guarantees, scope, accepted risk, authority, or a hard-to-reverse compatibility commitment remains materially open. Recommend one choice and state its exact consequence. Do not ask the human to choose internal machinery or restate evidence the system can inspect.

## Guide the human boundary

Continuously advance toward Frame sufficiency. When evidence and supplied authority already converge, record that convergence without manufacturing an interview. When boundary-changing questions require human knowledge, judgment, preference, or authority, explicitly enter a guided interview unless the user pauses or opts out. Read [references/interview.md](references/interview.md), orient the user to the interview objective and current estimate, then ask one decision-card question at a time in dependency order.

Research synthesis is the interview input, not its substitute. Do not present a recommendation, persisted revision, or visible question list as though the Frame has converged while human-authority questions remain unanswered. State that the Frame is still active, distinguish established evidence from proposed boundary, and continue the interview until its natural persistence boundary.

Completion criterion: every boundary-changing human question is accepted, rejected, deliberately deferred, preserved as contested, or returned to evidence work; the accepted batch is reconciled into Frame state before changing operations.

## Route rigor

Select direct/focused/full using `../blueprint/README.md` criteria. State the trigger when escalating. Do not require a Frame database, Casebook state, review, or prototype merely because this skill was invoked.

## Completion for this lens

Frame is sufficient for Design when the outcome, immediate consumer, external guarantees, exclusions, material uncertainties, evidence limits, and authority-dependent decisions are visible, and every required human decision has completed the guided interview disposition above. An interview is not independently required when no human-owned uncertainty remains. Evidence coverage alone cannot resolve authority-dependent questions. It is not “complete” by producing internal design or a delivery plan.

Keep Frame in the effort's single boundary/evidence notebook by default. Do not create separate discovery, terrain, question, decision, and review files unless one independently meets the retention rule in `../blueprint/README.md`.

## Review

At coherent-boundary maturity, use `../blueprint/review-mandates/frame-boundary.md`. Review only relevant claims/risks; reviewers advise and cannot expand scope or acceptance rules.
