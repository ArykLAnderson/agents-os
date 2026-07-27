# Workflow execution policy migration

## Current state

As of 2026-07-26, Pi workflow agents use task-defined prompts plus independent call-level `model`, `thinking`, and `tools` selection.

No global workflow roles are active. The former 13 role files, old Pi subagent agent copies, and their regeneration script are quarantined at:

`~/.pi/agent/pi-extensible-workflows/quarantine/2026-07-26-explicit-role-bindings/`

The disabled migration script must not be run from quarantine.

## Why

`pi-extensible-workflows` allows either:

- an unroled agent with independent model/thinking/tools options; or
- a role whose prompt owns model/thinking/tools and forbids call-level overrides.

The former role installation coupled generic task identities to model routing and made it too easy to use reviewers as artifact writers. Current policy keeps ordinary implementation, research, synthesis, and authorship task-defined. Durable specialist doctrine belongs in skills or exact review mandates rather than model-bound role files.

## Active model aliases

Global workflow settings live at:

`~/.pi/agent/pi-extensible-workflows/settings.json`

Aliases currently available are `research`, `fast`, `execution`, `review`, `planning`, `aggregation`, and `coordination`. Workflows should prefer these aliases over concrete provider model names.

## Guidance

The canonical Pi-only workflow practice is maintained by Agent OS at:

`~/.agents-os/src/skills/pi-workflow-orchestration/`

After Agent OS sync, Pi loads its generated copy. Codex and OpenCode intentionally exclude that Pi-specific skill.

## Rollback

Rollback is deliberate, not automatic:

1. inspect the quarantine README and role files;
2. decide which role-bound prompts are still justified;
3. restore only those files to `~/.pi/agent/pi-extensible-workflows/roles/`;
4. do not restore the old generator wholesale unless role/model coupling is again accepted.

Historical settings backups remain:

- `~/.pi/agent/settings.json.pre-pi-subagents-removal-20260726`
- `~/.pi/agent/settings.json.pre-pi-extensible-workflows-20260725`
