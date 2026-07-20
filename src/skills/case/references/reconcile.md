# Reconcile

Reconcile is the semantic mutation seam after initial intake.

1. Bound one coherent batch of supplied evidence, decisions, corrections, scope qualifications, conflicts, or supersession and record its knowledge objective as `Examined for` on affected entries or sources.
2. Resolve exactly one workspace authority through the [persistence procedure](persistence.md), establish the stable Case identity through its typed surface, and call `case.read`. The returned complete aggregate and exact revision or digest are the only reconciliation base; do not read or edit a guessed Markdown path.
3. Identify affected entries and authority boundaries before changing the in-memory aggregate.
4. Preserve opposing meaning, stable identities, original support, provenance, and unchanged content families where disagreement or supersession matters.
5. Apply accepted changes only with applicable support and authority. Persistence mechanics never supply human judgment.
6. Run the full validation checklist across the changed Case and related Cases. Repair only derived or mechanical defects automatically; leave semantic defects explicit.
7. Invoke `case.commit_revision` once against the selected connector with the complete Case, commit basis, provenance, and exact concurrency token from the base read. On conflict, read again and reconcile semantically; never auto-merge, fall back, dual-write, or bypass the connector.

Reconcile does not discover evidence or decide questions reserved for human authority. Propose related Cases when subject, authority, lifecycle, retrieval context, or distribution boundary differs materially. Confirm splits that alter accepted scope, authority, or interpretation.
