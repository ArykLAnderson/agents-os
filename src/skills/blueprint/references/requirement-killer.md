# Requirement-Killer Pass

Run one explicit adversarial simplification pass after walkthroughs and before completion review. Its job is to release accumulated assurance pressure, not add another checklist of mechanisms.

Use a fresh-context reviewer or perspective that is instructed to side with the consumer and the simplest sufficient architecture. It must challenge the candidate rather than repair it in place.

## Inventory The Delta

Compare the admitted behavioral boundary and inherited architecture with the current candidate. List every post-admission addition involving:

- a consumer-visible error or failure mode;
- a required configuration state, manifest, allowlist, feature flag, or deployment prerequisite;
- a new interface, module, snapshot, plan, registry, classifier, validation phase, or handoff;
- a security, trust, privacy, correctness, consistency, or proof mechanism;
- a compatibility restriction, migration obligation, fallback change, or operational burden.

Do not let several small review dispositions hide one large cumulative redesign. Group additions by the premise that caused them and inspect the full mechanism chain.

## Challenge Each Requirement

For every addition ask:

1. Which exact accepted behavior, quality, or inherited architecture requires it?
2. What concrete failure or threat occurs without it?
3. Who controls the triggering input, what asset is protected, and what is the consequence?
4. Can the risk be eliminated structurally by removing a dependency or capability from the module?
5. Can unsupported optional data or behavior be skipped locally instead of failing the consumer request?
6. Does the consumer understand or have any action for the proposed error?
7. Does the mechanism create more Contract burden, configuration coupling, or failure surface than the behavior warrants?
8. If deleted, where does necessary complexity reappear? If nowhere material, delete it.

Unknown possibility is not evidence. Reviewer concern, severity labels, repeated agreement, and theoretical total correctness do not establish necessity.

## Produce Dispositions

Classify every challenged addition as:

- **retain:** required by cited accepted authority or concrete evidence, with the smallest sufficient mechanism;
- **simplify:** the concern is real but a smaller structural design handles it;
- **remove:** no accepted requirement or concrete risk justifies it;
- **human decision:** the choice changes consumer behavior, core architecture, security posture, configuration obligations, compatibility, or proof burden.

Every `human decision` is separately presented with `decision-card` before incorporation. Do not defer it into a bundled final acceptance question.

## Completion Evidence

Persist:

- the admitted-to-current delta inventory;
- the premise chains examined;
- retained, simplified, removed, and human-decision dispositions;
- the fresh-context simplification reviewer identity and mandate;
- links to each separately accepted consequential delta.

The pass fails if it only recommends more tests, validation, manifests, or proof. It succeeds when the candidate is the smallest architecture that satisfies accepted behavior and concrete material risks.
