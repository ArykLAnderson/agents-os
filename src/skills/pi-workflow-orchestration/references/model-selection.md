# Model Selection

Model routing is execution policy, not identity. Choose it after defining the task contract.

| Alias | Use | Typical work |
|---|---|---|
| `research` | High-volume evidence collection where misses can be corrected by synthesis | web/local trawling, file inventory, source extraction |
| `fast` | Small, clear, low-risk tasks | formatting, bounded inspection, mechanical transforms |
| `execution` | Ordinary implementation and diagnosis | coding, tests, focused fixes |
| `review` | Ordinary independent checking | correctness validation, bounded review |
| `planning` | Cross-cutting reasoning with material constraints | architecture synthesis, route composition, migration planning |
| `aggregation` | Integrating several substantial outputs | research synthesis, review reconciliation support |
| `coordination` | Highest-consequence ambiguous coordination | multi-system decisions, difficult conflict reconciliation |

## Selection rules

1. Start with the cheapest alias that can reliably satisfy the contract.
2. Increase capability for ambiguity, cross-cutting constraints, consequential judgment, or difficult reconciliation—not merely for longer output.
3. Increase thinking for reasoning depth; do not upgrade the whole model when additional deliberation on the same capability is enough.
4. Research agents collect; a stronger owner or synthesizer evaluates contradictions and makes recommendations.
5. Ordinary implementation defaults to `execution`. Let the task prompt and repository skills define behavior.
6. Specialist review normally uses `review`; use `planning` only when the review itself requires architecture-level reconciliation.
7. The artifact owner performs final reconciliation. Never select a reviewer model as a substitute for assigning ownership.
8. Set the smallest tool list sufficient for the task. Read-only intent is not filesystem enforcement when `bash` is available.
9. Use concrete provider/model IDs only for experiments or diagnosed alias failures. Durable workflows use aliases.

## Thinking guidance

- `low`: mechanical, narrow, easily checked.
- `medium`: ordinary implementation, review, and synthesis.
- `high`: genuinely difficult architecture, security, migration, or conflict reasoning.

Explicit call-level `thinking` overrides an alias suffix. State why when using `high` repeatedly in one workflow.
