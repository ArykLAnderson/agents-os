# Logic And State Prototypes

Use this branch for state machines, workflows, business rules, data models, and other behavior that is difficult to judge from static prose.

## Model Evaluation

Build a minimal executable harness that drives representative and boundary transitions. Make inputs, transitions, outputs, invariant violations, and final state inspectable. Prefer deterministic scenarios that the model can run and compare against the proposition.

## Human Evaluation

When exploration itself supplies evidence, prefer a small interactive TUI. Expose the available actions, current state, transition result, and relevant history after each action. Include only scenarios that discriminate the stated question.

## Joint Evaluation

Combine an interactive surface with machine-readable or plainly inspectable instrumentation. The human evaluates whether the behavior makes sense; the model verifies transitions, invariants, and observed state.

Keep the harness in memory unless persistence is part of the question. A local scratch file or database may be used when necessary, with an unmistakable disposable name. Include it in the final disposition and remove it when approved cleanup occurs.
