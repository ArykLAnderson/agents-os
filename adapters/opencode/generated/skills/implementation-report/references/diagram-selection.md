# Diagram Selection and Native Rendering

Generate a diagram only when it answers a question more clearly than prose or a table.

## Native tool rule

Use Pi’s native `imagegen` tool exposed by the installed image-generation plugin after reload.

- Call `imagegen` directly.
- Do not shell out to Codex CLI, Gemini CLI, or another model CLI.
- Do not write wrapper code around an image-generation API.
- If the native tool is absent, ask for a reload or explicit fallback approval.
- Inspect and iterate on the actual rendered output; generated does not mean accepted.

For non-Pi adapters, prefer an equivalent harness-native image tool if one exists. If none exists, state the degradation rather than pretending parity.

## Selection heuristic

For each candidate diagram, write the question it answers. Keep it only if the answer is decision-relevant.

| Diagram | Use when the reader asks | Avoid when |
| --- | --- | --- |
| Slice boundary | “What shipped, where does it stop, and what comes next?” | Scope is already trivial and unambiguous. |
| System flow | “How does one user action cross the whole stack?” | The feature is isolated to one component. |
| Test environment | “What does the harness own and clean up?” | Verification is a single unit command. |
| Component architecture | “Which module owns each decision?” | It would only reproduce the folder tree. |
| Persistence model | “Why are these entities separate?” | Storage is not central to the change. |
| Trust boundary | “What data stays server-side?” | There is no meaningful authority transition. |
| Sequence/timing | “In what order do asynchronous actors interact?” | Static ownership is the real question. |

Defaults:

- Standard: 2–3 diagrams
- Showcase: 3–6 diagrams

Do not generate all types by habit.

## Diagram brief

Before rendering, record:

- reader question
- one-sentence takeaway
- audience depth
- entities/actors
- directional relationships
- shipped versus future styling
- verified versus inferred styling
- terms that must appear exactly
- terms that must not appear
- source paths supporting each relationship
- desired aspect ratio and report placement
- accessibility text equivalent

Use the bundled brief template.

## Visual grammar

Use one consistent grammar across a report:

- one accent color for the active shipped path
- neutral styling for context
- dashed or muted styling for future/unverified elements
- arrows that clearly encode direction
- labels adjacent to the relationship they describe
- no decorative icons that imply unsupported semantics
- no tiny paragraphs inside nodes

A diagram should have one dominant reading path. If it needs a legend longer than the diagram, simplify it.

## Architectural truthfulness

Validate every box and arrow against code or canonical documentation.

Common errors to reject:

- planner shown as generating exercise content
- client shown as grading when the server owns evaluation
- fixture shown as production service
- compile/build step shown as native runtime success
- storage deduplication shown as approved artifact reuse
- test-only auth shown as disabled auth
- “immutable” shown without the actual database or application mechanism
- future provider drawn as currently active

Use canonical domain terms consistently across prose and diagrams.

## Native generation prompt guidance

The prompt or tool input should include:

1. Exact title and takeaway
2. Canvas/aspect ratio
3. Named nodes and their grouping
4. Exact edge directions and labels
5. Active, future, blocked, and trust-boundary styles
6. Forbidden additions
7. Typography and minimum label-size requirements
8. Desired export format and background

Ask for architecture-diagram clarity, not illustrative concept art.

Avoid vague prompts such as “make a beautiful system diagram.”

## Review loop

After generation:

1. Open the output at full size.
2. Open it at the width it will have in the report.
3. Verify every required label is present and spelled correctly.
4. Verify arrows terminate at the intended node.
5. Verify future/blocked elements cannot be mistaken for shipped paths.
6. Verify no invented component or relationship appeared.
7. Check contrast and minimum text size.
8. Compare the caption and text equivalent to the visual.
9. Regenerate or edit through the native plugin if any critical issue remains.

Do not use unreadable output and rely on the caption to repair it.

## Accessibility

Every diagram needs:

- concise image alt text describing its purpose
- a caption stating the main conclusion
- a nearby expandable or visible text equivalent containing the important entities and relationships

The text equivalent must allow a reader to understand the architecture without seeing the image.
