---
name: prototype
description: Builds the smallest disposable artifact that answers one explicit software-design question with observable evidence.
---
# Prototype: evidence with no preservation pressure

A prototype answers **one** question. It is not an early production branch, foundation, or deliverable.

## Bound before building

Write: question; proposition; evaluator; observable discriminator; smallest rung; disposable location; permitted effects; stop condition. Split independent questions. Use synthetic/local resources unless separately authorized.

Choose only the needed evidence shape:

- **Question probe:** prove/refute one API, state, process, or failure assumption.
- **Consequential seam probe:** exercise the smallest real ownership/process/state boundary whose interaction remains uncertain.
- **Thin recognizable tracer:** connect enough seams for the immediate consumer to recognize the outcome. Make uncertain seams real; represent already-settled seams with fixed fixtures, skeletal façades, or cited prior evidence.
- **Targeted stress probe:** add one representative restart, interruption, authority, external-system, or meaningful failure to the seam whose failure semantics can change the design.
- **Routeability walkthrough:** not prototype implementation or prose drafting. A fresh worker analyzes the Frame, evidence, atomic Design/RFC Case claims, owners, failures, and route and identifies any architecture it would still have to invent.

Do not advance merely to look thorough. A later shape does not imply greater production completeness. Persistence, tests, and fidelity are allowed only when they are necessary to distinguish the proposition. Reuse prior evidence rather than rebuilding settled seams.

When the proposed architecture joins consequential seams, Design needs one thin recognizable outcome across the uncertain seams and the smallest decision-relevant stress evidence before fresh-worker execution. The tracer must represent the intended public responsibility boundaries closely enough to reveal missing ownership or contract decisions, but it need not implement every final grammar variant, refusal, hardening control, or ordinary conformance rule. Known contract obligations belong as atomic claims in the Design/RFC Case and later implementation tests; prose is materialized only after routeability.

Stop prototype coding when further changes would merely implement an already-selected design. Promote the observation, limits, and exposed contract obligations; do not polish a disposable copy into shadow production. If a routeability walkthrough finds a genuine evidence-dependent architecture unknown, commission one narrower question or seam probe rather than extending the tracer by default.

## Result record

```markdown
Question: ...
Proposition: ...
Rung / evaluator: ...
Observation: ...
Verdict: supported | rejected | inconclusive
Limits: ...
Decision consequence: ...
Artifacts: deleted | retained as evidence at <locator> | cleanup blocked because ...
```

A successful prototype supports only its stated proposition in its stated environment. It cannot promote its code, create a production commitment, satisfy unrelated proof, or substitute for design/implementation review. Promote only the question, observation, verdict, limits, and design consequence into the effort's boundary/evidence notebook. Keep a separate result file only when evidence is non-repeatable, costly to reconstruct, or consumed directly downstream. Delete prototype-owned code/data and redundant raw reports by default. Promotion copies named learned decisions/evidence into Design—not code by implication.

A prototype direction is normally autonomous because it is disposable. If choosing which proposition to test would itself commit the effort to a consequential architecture or exclude a human-owned alternative, surface that bounded decision first.

Use an explicitly disposable root/branch and declare that no code is promotable. A production branch, production package path, or code intended for retention is not a prototype location. If production edits begin before readiness, stop, quarantine those commits as implementation terrain, and restart the unanswered experiment disposably rather than continuing to earn confidence through preservation-bound code.

## Proportional review

Review depth follows the claim:

- **Question probe:** self-check the discriminator. Add one light generalist only when the result changes a meaningful decision; add a specialist only for privilege/credentials, irreversible or external effects, surprising evidence, or a consequential architecture choice.
- **Consequential seam probe:** one `../blueprint/review-mandates/prototype-light.md` generalist pass. Add one focused specialist only for the named uncertain seam.
- **Thin recognizable tracer:** one independent generalist reruns the outcome. Add one focused specialist for the primary material seam.
- **Targeted stress probe:** one evidence validator for the selected failure interval; add another specialist only when the stress crosses a distinct consequential boundary. Security review is not automatic.
- **Routeability/final RFC:** perform analytical fresh-worker and immediate-consumer walkthroughs rather than building more prototype code by default; focused specialists remain trigger-driven.

Use `../blueprint/review-mandates/prototype-evidence.md` when evidence quality itself is consequential or disputed, not automatically for every assembly. Do not launch an architecture/security/recovery panel merely because code is called a prototype. Early review seeks a false discriminator, boundary escape, obvious big mistake, or seam that later hardening would require—not production completeness.

Keep the prototype and bounded evidence available until required independent reviewers finish. Cleanup remains owned by the coordinating workflow or parent after evidence disposition, not by a writer whose output still requires review.
