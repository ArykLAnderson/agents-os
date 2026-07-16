# Source Registration

Register the supplied source bundle as inspectable `SRC` entries before semantic extraction begins.

## Inputs

A source bundle may contain active conversation notes, conversation wrap-ups, meeting notes, transcripts, existing documents, tracker items, code references, metrics, dashboards, research outputs, or unavailable sources. Treat the bundle manifest or user-provided grouping as an inventory, not as a source that replaces its components.

## Registration Flow

1. Inventory every distinct supplied artifact.
2. Assign stable, sequential source IDs in first-seen bundle order: `SRC-001`, `SRC-002`, and so on.
3. Normalize each artifact into a source entry using the contract below.
4. Preserve the narrowest stable locator provided by the bundle.
5. Record source freshness and status exactly when supplied; otherwise use `unknown`.
6. Record material reliability limits for access, freshness, authorship, transcript quality, source authority, generated research, or unavailable content.
7. Stop after source registration unless the author has supplied or approved extraction scope.

## Source Entry Shape

Use this Markdown shape in the Case `# Sources` section. The heading supplies the stable ID and human label; the fields preserve artifact identity, location, capture context, freshness, status, and material quality limits.

```markdown
### SRC-001: <short label>

- **Kind:** <kind>
- **Title:** <title or human label>
- **Location:** <location, locator, or local/unavailable: reason>
- **Quote:** <short exact contextual quote when available, otherwise source note or unavailable reason>
- **Captured:** <YYYY-MM-DD>
- **Source updated:** <date, revision, status timestamp, or unknown>
- **Source status:** <status or unknown>
- **Reliability:** <material limitations, or omit only when no limitation is material>
```

`Kind`, `Title`, `Location`, `Quote`, and `Captured` are required for every `SRC` entry. `Source updated` and `Source status` must be recorded with their supplied values or `unknown`. `Reliability` is required when a material quality limitation is known; it may be omitted only when no material limitation is known. A missing locator is non-blocking when a useful quote or source note remains.

### Provenance And Quality Mapping

`SRC` entries identify source artifacts. They do not use a `Provenance` field because provenance describes how a later semantic entry entered the Case model. During extraction, semantic entries reference their `SRC` entry and use the appropriate canonical provenance value: `source-direct`, `source-quoted`, `agent-inferred`, `agent-synthesized`, `author-stated`, or `author-approved`.

The source record carries source-quality context without creating a competing quality model:

| Source concept | `SRC` representation | Rule |
|---|---|---|
| Stable source identity | `SRC-###` heading | Keep the ID stable when the source label changes. |
| Source location and narrow locator | `Location` | Preserve the narrowest stable supplied locator. |
| Source capture context | `Captured` | Record when the artifact entered the Case. |
| Freshness or revision | `Source updated` | Preserve a supplied date, revision, or timestamp; otherwise use `unknown`. |
| Source lifecycle status | `Source status` | Preserve a supplied status; otherwise use `unknown`. |
| Access, authorship, transcript, freshness, or authority limitation | `Reliability` | Record only material limitations in declarative terms. |

`Reliability` is source metadata, not semantic confidence and not authority. Later semantic entries use `Confidence` only when their support or interpretation is uncertain, and preserve authority through their canonical provenance and type-appropriate status.

Accepted source kinds are descriptive labels, not a closed taxonomy. Prefer specific labels such as `current-conversation`, `conversation-wrap-up`, `meeting-notes`, `meeting-transcript`, `existing-document`, `tracker-item`, `code-reference`, `metric-set`, `dashboard`, `research-output`, or `unavailable-source`.

## Locator Guidance

- Local file: use the project-relative or bundle-relative path supplied by the source bundle or author for internal Case provenance only. Mark it as non-citable for audiences that cannot resolve that shared location; never copy a local filesystem path into reader-facing evidence merely because it is a valid Case locator.
- URL: use the supplied URL without fetching it unless bounded discovery is explicitly granted.
- Code: preserve the repository, path, symbol, function, schema, diff, commit, or line range supplied by the bundle. Do not inspect code unless the bundle supplies the file or grants bounded local discovery.
- Ticket: preserve the supplied ticket key, URL, title, comment, or status locator. Do not call tracker APIs unless explicitly authorized.
- Transcript: preserve timestamps or speaker/timestamp ranges when supplied.
- Metrics: preserve dashboard, query, experiment, date range, and revision locators when supplied.
- Unavailable source: use `local/unavailable: <reason>` or `unavailable: <reason>` and register only known metadata.

Line numbers are acceptable only when the supplied source uses them as the stable locator. Prefer symbols, headings, timestamps, block URLs, or semantic anchors when available.

## Reliability Notes

Add a reliability note when any limitation is material to later interpretation:

- unavailable or inaccessible content
- unknown source update time
- stale or historical status
- draft, working, or superseded source status
- weak speaker attribution
- incomplete transcript timestamps
- generated research summary without primary-source expansion
- metric date range, query, or dashboard revision ambiguity
- code locator without a fixed commit or generated interface revision
- ticket or document authority not declared

Reliability notes constrain later extraction; they do not make a source unusable by themselves.

## Bounded Discovery Rule

Source registration is not discovery. Register what the bundle supplies. Do not fetch URLs, call trackers, search connected systems, inspect repositories, expand research links, or infer missing source contents unless the author explicitly requested that bounded discovery scope.

If a supplied source cannot be accessed within the granted scope, register it as unavailable with limited reliability and continue.

## Prohibited During Registration

- Do not create `OBS`, `DEC`, `REQ`, `GAP`, or other non-source entries.
- Do not create the first snapshot.
- Do not infer facts from inaccessible source names, titles, URLs, or ticket keys.
- Do not collapse component artifacts into one bundle-level `SRC` entry.
- Do not replace source limitations with generic confidence scores.
