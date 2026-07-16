# Artifact Trace V1

Create `artifact.trace.md` beside each artifact revision selected for review, target formatting, staging, release, or reuse when trace applies. The trace is a reviewable sidecar, not reader-facing prose and not a replacement for the Case.

## Header

Record the artifact path, revision label, retained Case-state references, applicable direct-source references, trace status, and any publication blockers. Case-state references must be explicit and never inferred from the current mutable Case pointer.

## Trace Units

Trace semantic units, not each sentence and not Case-entry order. A unit may synthesize several Case entries, and one Case entry may support several units. Use stable unit IDs such as `AU-001` and include:

- artifact anchor, table ID, or other stable target locator;
- visual anchor ID such as `VA-001` when the unit represents a meaning-bearing visual or table;
- visual assertions that the retained form must preserve, when applicable;
- assertion or bounded semantic summary;
- derivation label: `direct`, `synthesis`, `context`, `omission` (or `omission-accounting`), or `deferred`;
- fully qualified Case support references in the form `<case-id>/<snapshot-id>/<entry-id>`, or a named direct source reference from the session manifest;
- handling and visibility: visible, omitted, or deferred;
- status: supported, limited, unsupported, stale, conflict, or blocked;
- notes for authority, uncertainty, or reader-action limits.
- reader-facing reference: an audience-accessible URL, shared locator, approved substitute, or `none` with the handling reason. Internal Case references and local filesystem paths never satisfy this field for an audience that cannot resolve them.

Use a unit for each material decision, evidence synthesis, risk or gap, Case-backed reader action, and visual assertion. Do not require one trace unit per Case entry, prose paragraph, or sentence. Natural restructuring, interleaving, and transitions are allowed when the bounded assertion remains supportable. A material table needs one unit per material row when a table-level unit cannot honestly cover each row's distinct claim. An externally supplied review instruction may be recorded for context, but it is not a semantic unit, does not receive Case support, and cannot make the artifact publication-ready. `synthesis` may combine supported entries but may not create a new accepted Case meaning or erase disagreement. `direct` must preserve the relevant status, authority, and scope. An omission unit must explain why the reader can safely proceed without the selected entry and point to the composition manifest.

## Trace Shape

Use this minimum shape:

```markdown
# Artifact Trace

- **Artifact:** `...`
- **Revision:** `...`
- **Pinned snapshot set:** `case-id/SNAP-001`
- **Direct sources:** `SRC-001` or `<session direct-source label>` when applicable
- **Trace status:** reviewable | blocked | stale

## Units

### AU-001: recommendation

- **Locator:** `#recommendation`
- **Assertion:** ...
- **Derivation:** synthesis
- **Support:** case-id/SNAP-001/OBS-001; case-id/SNAP-001/DEC-001
- **Visibility:** visible
- **Status:** supported
- **Notes:** ...
- **Reader-facing reference:** <audience-accessible reference, or none: qualified/omitted>

## Accounting

| Selected entry | Handling | Trace unit | Reader-facing treatment |
|---|---|---|---|
```

## Blockers

Mark the trace `blocked` when a material assertion has no Case or named direct-source support, an anchor is missing, a selected contradiction or limitation is unaccounted for, a support reference is stale for the reader action, authority/status conflicts with the assertion, or a material table or visual assertion has no trace unit. Do not waive a blocker in the trace; route required meaning changes to `document-reconcile`.
