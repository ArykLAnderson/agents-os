# Markdown publication

Use the destination in `.casebook/atlas-method.md` with ordinary file tools.

## Bootstrap

Preserve an existing readable layout. For an empty Atlas, use:

```text
<destination>/map.md                 # `# FM-001 — <Map name>`
<destination>/decisions/D-001.md
<destination>/features/F-001.md
<destination>/work-items/WI-001.md
```

Create only the directories and records needed by the accepted Map. `map.md` is the `FM-*` Map record and carries that ID in its heading. Allocate the next unused numeric ID for each kind, starting at `001`: `D-*`, `FM-*`, `F-*`, and `WI-*`.

## Read and publish

1. Inspect the selected destination for its readable Map entry point and current Decision. In an empty store use the bootstrap layout above; in an established store follow its existing links and naming. Stop if more than one record plausibly claims to be current or no exact current Decision can be resolved.
2. Stop on duplicate IDs, contradictory current Decisions, or changed ownership that the accepted Map does not explain.
3. Write the accepted Decision as a new file. Then create or update `map.md`, Feature files, and Work Item files to match it. Preserve prior Decision files and established IDs whose meaning is unchanged.
4. Reread every changed record and compare it with the accepted Map. Report the exact files changed and any incomplete or conflicting part.

Use direct, understandable file edits. If that cannot safely represent the accepted change, return `capability_unproven` rather than creating a helper publisher or new persistence design. Git operations require their own authority.
