# Feature Atlas Representations

Represent the accepted delivery plan so a human or fresh implementation agent can understand it. Markdown files and GitHub Issues may differ in layout; preserve meaning rather than enforcing a universal schema.

## Core records

### Map Decision

A Map Decision records:

- its stable `D-*` identity and date;
- who accepted the exact Map candidate and where that acceptance is recorded;
- the accepted RFC/Blueprint revision and complete candidate or its durable locator;
- the prior Decision it supersedes, or `none`;
- a plain statement that it is current; and
- the boundary that acceptance authorizes Atlas publication, not implementation or external effects.

Keep prior Decisions readable. No digest, receipt, manifest, or transaction metadata is required.

### Map

A Map identifies:

- the accepted Map Decision and the RFC/Blueprint revision it realizes;
- scope, exclusions, and important limitations;
- Features and their owners;
- cross-Feature or external dependencies;
- convergence and proof responsibilities;
- current/superseded state; and
- links to authoritative source material.

Exactly one accepted Map Decision is current. Keep prior accepted Decisions visible. A changed current plan must identify what it supersedes and why.

### Feature

A Feature is a coherent delivery movement. It identifies:

- its Map owner and stable identity;
- outcome and immediate consumer;
- boundaries and coherent before/after state;
- optional Feature-local stages when they improve readability;
- owned Work Items and dependencies;
- convergence, compatibility, cleanup, and proof responsibilities; and
- current limitations and source links.

### Work Item

A Work Item identifies:

- its single Feature owner and optional local stage;
- bounded responsibility and immediate consumer;
- desired observable result;
- direct prerequisites;
- interfaces or boundaries that must remain stable;
- evidence it must produce and who checks it; and
- current limitations and source links.

Every implementation Work Item has exactly one Feature owner. Record a dependency at the consumer that needs it; reverse “blocks” views are convenience only.

## Identity and updates

Use stable readable IDs such as `D-*`, `FM-*`, `F-*`, and `WI-*`. The selected publication guide defines the simple bootstrap and allocation convention. IDs do not encode meaning. Preserve an ID only while ownership and responsibility remain materially the same; never recycle an old ID for unrelated work.

The accepted Map is the planning authority. Map, Feature, and Work Item pages or Issues are readable projections of it, not separately accepted plans. Correct mistakes visibly and preserve consequential accepted history; do not silently edit history to make current work appear conformant.

## Evidence and authority

Atlas records the minimum evidence allocation and links to authoritative sources. Git owns source history, tests own their results, PR systems own PR state, and providers own runtime facts. Atlas does not duplicate those systems or turn linked evidence into automatic acceptance.

Map acceptance authorizes faithful Atlas publication only. It does not authorize implementation, credentials, commits, pushes, PRs, merges, deployments, production effects, or spending.

## Implementation handoff

Feature Atlas returns one of:

```markdown
Handoff: HandoffReady | HandoffWithLimitations | HandoffRefusal
Publication: <method, destination, Map and current Decision locators>
Blueprint: <accepted RFC/Blueprint revision and locator>
Scope: <selected Feature and Work Item IDs, locators, owners, and outcomes>
Order: <direct prerequisites and convergence points>
Obligations: <compatibility, cleanup, proof responsibilities and owners>
Limitations: <affected work, forbidden claims, invalidators and source links, or none>
Authority boundary: <present/absent implementation and external-effect authority>
Fresh reread: <time, records read, complete and consistent | exact problem>
```

Return `HandoffReady` when every field is complete and no limitation blocks the selected work. Return `HandoffWithLimitations` only when the unaffected work and forbidden claims are explicit. Return `HandoffRefusal` for ambiguous ownership or dependencies, conflicting/incomplete publication, a non-current Decision, unreadable source records, or omitted authority. Never fill a missing field by inference.
