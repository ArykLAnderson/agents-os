# Global Agent Instructions

## UUID generation

When a UUID is needed, run `/usr/bin/uuidgen` instead of writing an inline Python, Node.js, or other ad hoc UUID generator. Use the generated value as-is unless the receiving format explicitly requires lowercase; when it does, run `/usr/bin/uuidgen | tr '[:upper:]' '[:lower:]'`.

## Authorization boundaries

Treat authorization as cumulative, scoped grants. A later explicit grant may expand an earlier boundary for the exact operation, target, and consequences visibly stated in the later request or question. Do not request confirmation for an operation already authorized by an accepted prompt.

A response authorizes every mechanical consequence explicitly listed in the prompt it answers when those consequences stay within the named targets and do not add a materially broader or irreversible effect. Routine local work required by a request to implement, fix, or create includes inspection, project-file edits, task-owned temporary files, formatting, and local verification; do not ask again for those reversible mechanics.

Do not make a semantic decision for the user when material behavior, scope, architecture, policy, migration, acceptance criteria, or trade-offs remain unresolved. Inspect and recommend when possible, then ask one bounded question when the answer requires human knowledge, preference, or authority.

Commits, pushes, pull requests, merges, deployments, releases, shared document or tracker writes, credentialed provider actions, spending, and destructive operations require explicit authority unless an owning workflow defines the named accepted request as a visible scoped grant for exact listed operations. A workflow-specific grant may intentionally exceed this default within that named scope. Ask again only when intent, target, scope, constraints, destination, visibility, review topology, or risk materially changes.

Before high-risk or hard-to-reverse effects, obtain explicit confirmation even when broader work is authorized. These include deleting or overwriting existing data, force-pushing, destructive infrastructure changes, production or shared-system mutation, irreversible migrations, permission or visibility changes, and actions with material financial, security, or user impact.

## Test quality

Never write tests that merely assert documentation, prompts, skill Markdown, configuration prose, or other static text contains or matches particular words, headings, or regular expressions. Such tests do not prove behavior and create brittle maintenance work.

Test observable behavior through an executable public interface. When a change is purely instructional or documentary and has no executable behavior, verify it through focused review, reference/link validation, generation/installation checks, or an actual consumer walkthrough—not a text-presence test disguised as a contract test.

## Casebook and Feature Atlas authority

For ordinary Case and Frame persistence, use the packaged `casebook` CLI and its Git/XDG workspace and store resolution. Read the [Casebook CLI reference](skills/casebook-persistence/references/cli.md); do not select a database, invoke a provider, use direct SQL, or treat Markdown as a fallback. `CASEBOOK_DATABASE_URL` and `CASEBOOK_SQLITE_BIN` are direct-provider or maintenance concerns, not ordinary CLI inputs.

Feature Atlas is separate. `CASEBOOK_DATABASE_URL` does not select or override Atlas storage. Unless an explicit Atlas destination is provided, use the current project's `.casebook/atlas` through the local filesystem adapter. If no dedicated Atlas adapter executable is installed, the Feature Atlas skill may perform adapter-owned filesystem reads and integrity checks; do not reject a valid local Atlas solely because a CLI is absent.
