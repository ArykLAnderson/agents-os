# Workflow keywords

Use these keywords as compact routing language. They improve recall; they do not grant authority or replace the owning skill's admission rules.

| Keyword | Meaning | Example phrases | Owner |
| --- | --- | --- | --- |
| `frame` | Set the external outcome, guarantees, exclusions, and human decisions. | "Frame this outcome." "What behavior still needs a decision?" | `frame` |
| `blueprint` | Select responsibilities, state ownership, contracts, and a delivery route. | "Blueprint the design." "Who should own this state?" | `blueprint` |
| `seam` | Design or improve one module boundary or interface. | "Find the right seam." "Make this easier to test." | `codebase-design` |
| `research` | Gather current evidence for one bounded question. | "Research why this exists." "Check the current implementation." | `research` |
| `diagnose` | Reproduce a failure, test competing causes, and prove the repair. | "Diagnose this flake." "Find the root cause." | `diagnosing-bugs` |
| `deliberate` | Compare credible options against explicit criteria. | "Deliberate Kafka versus Pub/Sub." | `deliberate` |
| `prototype` | Build the smallest disposable test of one design proposition. | "Prototype whether this API works." | `prototype` |
| `implement` | Execute accepted behavior within explicit scope and authority. | "Implement this contract." "Make the code change and verify it." | `coding-worker` or `software-implementation` |
| `validate` | Independently test one candidate against its Task or Convergence Contract. | "Validate this implementation." | `focused-validator` |
| `verify` | Support a claim with current observed evidence. | "Verify the fix." "Show the command and result." | `verification` |
| `blast-radius` | Find the non-local safety assumption behind a change and try to prove it. | "Check the blast radius." "What could this break?" | `blast-radius` |
| `watch` | Observe one changing subject until a declared predicate or stop condition. | "Watch CI until it finishes." "Wait for this deployment." | `watch` |
| `resume` | Recover governed work from current artifacts and live state. | "Resume this RFC." "Pick up the implementation." | Session-pickup design is pending in its Frame. |
| `document` | Produce or revise a governed reader-facing artifact. | "Write the RFC." "Turn this into a report." | `document` |
| `teach` | Build a stateful learning path across sessions. | "Teach me Go concurrency." | `teach` |
| `model` | Reconcile ambiguous domain terms and behavior. | "Model these lifecycle states." | `domain-modeling` |

Do not infer a keyword command from an incidental word inside a longer sentence. Route from the user's actual intent and the owning skill's trigger.
