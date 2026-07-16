# Document Operation Result

Every document operation returns this compact result to its caller. It is a handoff, not a second manifest or an activity log. `document` records only the resulting current facts in `workflow.md`.

```markdown
## Operation Result: <document-operation>

- **Work performed:** <concise summary>
- **Changed:** <Cases, artifacts, or remote representations; `none` when applicable>
- **Conditions satisfied:** <condition names or `none`>
- **Conditions stale or invalidated:** <condition names and affected revision, or `none`>
- **Blocking findings:** <finding IDs, each labeled `completion` or `publication-invariant`, or `none`>
- **Disclosable findings:** <finding IDs or `none`>
- **Recommended next operations:** <operation and reason, or `none`>
```

When an operation receives a prior result, use its stated revisions, findings, and stale conditions rather than inferring completion from operation order. A direct operation returns this result to `document` when it cannot safely resolve a material document-level choice.

Use `completion` only for a human-overridable local completion blocker. Use `publication-invariant` for a non-waivable external-write blocker defined in `publication-readiness.md`.
