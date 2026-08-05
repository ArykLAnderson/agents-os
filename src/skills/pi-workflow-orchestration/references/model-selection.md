# Model Selection

Model routing is execution policy, not identity. Choose it after defining the task contract.

Aliases select inference capability only. They do not define task identity, authority, tools, methodology, or system-prompt behavior; the task contract and explicitly loaded skills own those concerns.

| Alias | Capability | Route |
|---|---|---|
| `mechanical` | Narrow, low-risk work with cheap verification | Luna/medium |
| `workhorse` | Default for research, implementation, review, validation, and synthesis | Luna/high |
| `involved` | Cross-cutting reasoning and intermediate higher-order judgment | Terra/high |
| `exceptional` | Ambiguous, consequential, final higher-order judgment | Sol/high |

## Selection rules

1. Select an explicit alias on every workflow `agent()` call; never inherit the parent model accidentally.
2. Default to `workhorse` regardless of whether the task is research, implementation, review, validation, or synthesis. Use `mechanical` only when the work is genuinely narrow and cheaply verified.
3. Escalate to `involved` for cross-cutting constraints or an admitted intermediate higher-order checkpoint, not merely for longer output or because an artifact is called a plan.
4. Escalate to `exceptional` only for an admitted final higher-order checkpoint or exceptional judgment where material ambiguity and consequence coincide. State the reason in the task contract.
5. Put task behavior and authority in the task contract. Load a specialist skill only when durable methodology is needed; never infer either from the model alias.
6. Basic review, focused validation, and repair loops remain `workhorse`. Review timing or the word “final” alone does not justify escalation.
7. The artifact owner performs final reconciliation. Never select a stronger model as a substitute for assigning ownership.
8. Set the smallest tool list sufficient for the task. Read-only intent is not filesystem enforcement when `bash` is available.
9. Use concrete provider/model IDs only for experiments or diagnosed alias failures. Durable workflows use aliases.

## Thinking guidance

Alias configuration owns thinking level. Callers should not override it merely because work is routine. Use an explicit call-level override only for a diagnosed experiment or alias failure, and state why.
