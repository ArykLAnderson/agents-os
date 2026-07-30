# Frame State

Persist current reality at natural boundaries, not after every turn. Frame state is one complete Frame aggregate; paths and search similarity do not define identity. Read and mutate it only through the packaged Casebook CLI in the [persistence procedure](persistence.md).

## Complete aggregate

The aggregate carries:

- a stable `frame:<uuid>` identity, home namespace, complete authority scope, lifecycle `status`, title, outcome, included and excluded scope, limitations, and completion condition;
- complete Case, Frame, downstream, and Artifact links with provenance and visible revision evidence when applicable;
- the complete selected `discovery` family;
- complete `disposition_boundaries` and `case_dispositions` arrays, including empty arrays for a new Frame with no accounted boundary; and
- authorization provenance that records applicable scope and duration without converting authorization into an instruction to act.

Statuses are descriptive: `active`, `completed`, `abandoned`, `superseded`, or whole-Frame terminal `tombstoned`. They do not route work. A lifecycle change is a `casebook commit frame` of the complete aggregate after an exact CLI read; never patch a storage file or omit unchanged families. Whole-Frame deletion is revision-checked logical tombstoning, not physical purge; current reads/search hide the Frame while history and receipts remain.

## Discovery state

Every precise attention item has a stable `discovery:<uuid>` identity and Frame-local display label such as `AT-014`. Active categories are `fog`, `frontier`, `blocked`, `contested`, `deferred`, and `out_of_scope`. Each active item states one unresolved question, `human_authority` as `not_required`, `required`, or `unclear`, and material dependencies or blockers. Do not persist assignment, routing, priority, confidence, timestamps, operation results, history, or recommended next actions.

Fog may remain unnumbered in working conversation until precise. Settled or individually tombstoned items retain stable identity and provenance in the authoritative aggregate; ordinary current-work views may omit them, while complete resume reads select all disposition accounting and all Discovery needed for semantic reconciliation. Tombstoning a knowledge/Discovery item does not delete its whole owner. Reopening preserves the settled version reference and explicit reopening basis.

Keep resolved items in active Discovery only while they explain an active dependency. Their reusable meaning belongs in Cases; rich evidence remains in retained Artifacts or sources.

## Natural-boundary accounting

Each material boundary has a stable `disposition-boundary:<uuid>`, display order, title or basis, retained-evidence locators, complete membership list, and `closure: "open" | "closed"`. Every listed member has exactly one `case-disposition:<uuid>` and exactly one of these shapes:

```json
{
  "classification_state": "pending_classification",
  "pending_reason": "why the result itself is not yet classifiable",
  "resume_condition": "the bounded evidence or human judgment needed"
}
```

```json
{
  "classification_state": "classified",
  "disposition": "intake | reconcile",
  "rationale": "semantic-owner judgment",
  "realization_state": "awaiting_case | settled",
  "case_id": "case:<uuid>",
  "case_operation_id": "caller-retained operation identity"
}
```

```json
{
  "classification_state": "classified",
  "disposition": "no_case",
  "no_case_reason": "why the material result has no independently reusable Case meaning"
}
```

Pending classification is temporary boundary state, not a fourth disposition or a substitute for judgment. Intake and Reconcile begin as `awaiting_case`; `settled` additionally requires exact visible `observed_case_revision_id` or `pinned_case_revision_id` evidence from the separate Case commit. Preserve affected Case entry display IDs, provenance, and evidence locators when known. No Case carries no Case realization fields.

A boundary cannot close while a member is pending classification or awaiting Case realization. A Frame cannot complete with an open or unsettled material boundary. Complete accounting still records every material result even when the boundary must remain open.

## Persistence receipt

The CLI returns owner revision and mutation operation evidence. Preserve its stable family IDs, revision, provenance, and any reported limitation with the aggregate. Do not infer completion, No Case, Case settlement, or human authority from storage success.
