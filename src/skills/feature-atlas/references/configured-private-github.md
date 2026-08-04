# Private GitHub Issues publication

Use the private repository in `.casebook/atlas-method.md`. With `gh`, verify that exact repository, private visibility, Issues availability, and current access. Use `--repo <owner>/<repository>` on every command.

## Bootstrap

Preserve an existing readable Issue convention. For an empty Atlas:

- create one Map Issue titled `FM-001 — <Map name>`;
- record each accepted Map Decision as a dated comment headed `Decision D-001`;
- create Feature Issues titled `F-001 — <Feature name>`;
- create Work Item Issues titled `WI-001 — <Work Item name>`; and
- link owned records from the Map and Feature Issues.

Allocate the next unused numeric ID for each kind, starting at `001`. Search exact title prefixes before allocating; stop on duplicates or ambiguous current Maps.

## Read and publish

1. Inspect the selected repository for its readable Map entry point and current Decision. In an empty Atlas use the bootstrap titles above; in an established Atlas follow its existing links and naming. Stop if search and linked navigation leave more than one plausible current Map or no exact current Decision.
2. Stop on identity collisions, contradictory current Decisions, unclear predecessors, or inaccessible accepted history.
3. Add the accepted Decision comment, then create or update Map, Feature, and Work Item Issues to match it. Never edit prior accepted Decision comments.
4. Reread changed Issues and report their URLs plus any incomplete or conflicting part.

Use ordinary `gh issue` commands. If they cannot safely represent the accepted change, return `capability_unproven` rather than creating new publication machinery.
