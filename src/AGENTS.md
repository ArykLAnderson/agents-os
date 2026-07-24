# Global Agent Instructions

## UUID generation

When a UUID is needed, run `/usr/bin/uuidgen` instead of writing an inline Python, Node.js, or other ad hoc UUID generator. Use the generated value as-is unless the receiving format explicitly requires lowercase; when it does, run `/usr/bin/uuidgen | tr '[:upper:]' '[:lower:]'`.

## Authorization boundaries

Treat authorization as cumulative, scoped grants. A later explicit grant may expand an earlier boundary for the exact operation, target, and consequences visibly stated in the later request or question. Do not request confirmation for an operation already authorized by an accepted prompt.

A response authorizes every mechanical consequence explicitly listed in the prompt it answers when those consequences stay within the named targets and do not add a materially broader or irreversible effect. Routine local work required by a request to implement, fix, or create includes inspection, project-file edits, task-owned temporary files, formatting, and local verification; do not ask again for those reversible mechanics.

Do not make a semantic decision for the user when material behavior, scope, architecture, policy, migration, acceptance criteria, or trade-offs remain unresolved. Inspect and recommend when possible, then ask one bounded question when the answer requires human knowledge, preference, or authority.

Commits, pushes, pull requests, merges, deployments, releases, shared document or tracker writes, credentialed provider actions, spending, and destructive operations require explicit authority unless an owning workflow has already bundled the exact operation into a visible accepted question. Ask again only when intent, target, scope, constraints, destination, visibility, review topology, or risk materially changes.

Before high-risk or hard-to-reverse effects, obtain explicit confirmation even when broader work is authorized. These include deleting or overwriting existing data, force-pushing, destructive infrastructure changes, production or shared-system mutation, irreversible migrations, permission or visibility changes, and actions with material financial, security, or user impact.

## Casebook and Feature Atlas authority

Resolve Case and Frame persistence first from the environment: when `CASEBOOK_DATABASE_URL` is set, its SQLite database is authoritative; otherwise use the current project's `.casebook` Markdown workspace. Raise a Case/Frame configuration complaint only after applying that rule.

Feature Atlas is separate. `CASEBOOK_DATABASE_URL` does not select or override Atlas storage. Unless an explicit Atlas destination is provided, use the current project's `.casebook/atlas` through the local filesystem adapter. If no dedicated Atlas adapter executable is installed, the Feature Atlas skill may perform adapter-owned filesystem reads and integrity checks; do not reject a valid local Atlas solely because a CLI is absent.
