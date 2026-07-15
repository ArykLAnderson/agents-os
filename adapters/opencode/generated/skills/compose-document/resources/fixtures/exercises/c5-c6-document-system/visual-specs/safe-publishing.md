# Safe Publishing Visual Spec

- **Reader question:** What must pass before an external write, and what does this exercise do instead?
- **Support:** `AU-506`; qualified local publish instructions and `notion-safe-publish.md`.
- **Allowed assertions:** authorization, destination/permission, update safety, trace/assets, write, and read-back are distinct checks; this exercise stops before authorization.
- **Forbidden implications:** these checks happened; Notion is the chosen target; a local file is published.
- **Elements:** six gate labels, blocked-before-write marker, no-write result, caption, and text equivalent.
- **Trace:** `#diagram-safe-publishing`, `AU-506`.
- **Accessibility:** alt: “A publication path is blocked before the external write because authorization and destination checks are absent.”
- **Validation:** the blocked marker precedes write; grouped connectors join only adjacent gates in the declared order; all unperformed checks are visibly conditional; inspect desktop and narrow rendering.
