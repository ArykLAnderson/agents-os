---
name: create-agent-os-artifact
description: Create or update an Agent OS artifact in canonical src form, then regenerate adapter outputs and verify the target harness copies. Use when asked to add or modify Agent OS agents, skills, commands, pair definitions, hooks, or related harness artifacts.
user-invocable: true
argument-hint: <what to create or update, and for which harness>
---

# Create Agent OS Artifact

Create or modify Agent OS artifacts by editing the canonical `src/` tree first, then regenerating adapter outputs, then verifying the generated copy for the active harness.

## Core Rule

**Never treat `adapters/*/generated/` as the source of truth.**

Always:
1. Decide the canonical source location in `src/`
2. Author or edit the normalized source there
3. Regenerate adapters
4. Inspect generated output for the target harness
5. If something looks wrong, fix the source or generator assumptions — not the generated file directly

## Current Active Targets

Read `~/.agents-os/config/targets.json` if needed, but the current supported generated targets are:
- `pi`
- `codex`
- `opencode`

If the user asks for Cursor, Claude Code, Cloud Code, or another harness that is **not** in the configured targets:
- still create the canonical Agent OS source artifact in `src/`
- do **not** invent fake generated output layouts
- report that adapter generation for that harness is not wired yet
- if useful, leave clear notes in the source artifact about expected degradation or future adapter needs

## Canonical Placement Rules

Choose the source path by artifact type:

| Artifact type | Canonical source path |
| --- | --- |
| Agent | `~/.agents-os/src/agents/<name>.md` |
| Skill | `~/.agents-os/src/skills/<name>/SKILL.md` |
| Skill support file | `~/.agents-os/src/skills/<name>/...` |
| Command | `~/.agents-os/src/commands/<name>.md` |
| Hook | `~/.agents-os/src/hooks/...` |
| Source documentation for Agent OS runtime/usage | `~/.agents-os/src/docs/...` |

If the artifact is project-specific rather than global, use the same internal path under `.agents-os/src/...` in the project root.

## Normalized Format Rules

### Agents

Agents are single markdown files with YAML frontmatter and body instructions.

Required frontmatter:
- `name`
- `description`

Common optional frontmatter:
- `model` using Agent OS tiers or aliases (`cheap`, `fast`, `normal`, `smart`, `deep`)
- `tools`
- `memory`
- `skills`
- other harness-neutral metadata already used in this repo

Guidelines:
- Prefer harness-neutral wording in the body
- If specifying tools for Pi compatibility, use lowercase Pi tool names
- Keep the file canonical; adapter-specific model/tool rewriting happens during generation
- Put concrete model routes in `config/models.json`, not individual artifacts. For example, local OpenCode may lower `smart` or `deep` to LiteLLM GPT-5.6 routes while another environment maps the same tiers differently.

### Skills

Skills live in a directory and must have `SKILL.md` at the root.

Rules:
- Frontmatter must be the first content in `SKILL.md`
- Required frontmatter: `name`, `description`
- Set `user-invocable: true` only if the user should be able to run it as `/name`
- Keep supporting templates/references/examples beside the skill in the same directory when relevant
- Put reusable instructions in the skill directory, not in generated adapter folders

### Commands

Commands are markdown instruction files at `src/commands/<name>.md`.

Rules:
- Write the command in canonical markdown form
- Use `$ARGUMENTS` when the command takes user input
- Do not add generated headers manually

### Other Structured Artifacts

When creating structured runtime artifacts:
- use the canonical `src/` subtree
- follow existing local patterns exactly
- keep target-specific implementation details isolated and clearly named
- prefer shared semantics first, target-specific lowering later

## Harness-Specific Artifact Rule

If the requested artifact is mainly for one harness (for example a Pi-oriented extension, plugin, or runtime helper):
- still create the most normalized canonical source possible in `src/`
- isolate genuinely target-specific details in clearly target-labeled files or directories
- do not pretend every target has parity if it does not
- document degradation or unsupported adapters explicitly
- verify the active harness output most carefully

## Workflow

### 1. Understand the requested artifact

Determine:
- artifact type
- global vs project scope
- intended harness today
- whether it is shared across harnesses or target-specific with degraded fallbacks elsewhere

### 2. Check for an existing artifact first

Search the relevant `src/` area for duplicates or near-duplicates.
If an artifact already exists, prefer modifying it instead of creating a competing version.

### 3. Author the canonical source

Write the artifact in the proper `src/` location.
Follow existing naming and formatting conventions already present in Agent OS.

### 4. Regenerate adapters

Run the Agent OS sync flow from a repo that has `scripts/agents-os.mjs`, or otherwise use the local project script that owns generation.

Standard regeneration command:

```sh
node scripts/agents-os.mjs sync
```

If you need to regenerate only the global Agent OS root from another repo, set the environment so the project scope does not accidentally diverge.

### 5. Run doctor checks when possible

Validate the source and generated outputs:

```sh
node scripts/agents-os.mjs doctor
```

Treat warnings/errors as real feedback. If doctor reveals a formatting or schema issue, fix the canonical source.

### 6. Verify generated outputs for the active harness

Inspect the generated copy for the harness the user cares about most.

Generated output locations:
- Pi agent: `~/.agents-os/adapters/pi/generated/agents/`
- Pi command: `~/.agents-os/adapters/pi/generated/commands/`
- Pi skill: `~/.agents-os/adapters/pi/generated/skills/`
- Codex agent: `~/.agents-os/adapters/codex/generated/agents/`
- Codex command: `~/.agents-os/adapters/codex/generated/commands/`
- Codex skill: `~/.agents-os/adapters/codex/generated/skills/`
- opencode agent: `~/.agents-os/adapters/opencode/generated/agent/`
- opencode command: `~/.agents-os/adapters/opencode/generated/command/`
- opencode skill: `~/.agents-os/adapters/opencode/generated/skills/`

Verify at least:
- the generated file exists in the expected place
- generated header was added
- frontmatter/body ordering is still valid
- target-specific shape looks correct for that harness
- model/tool conversions look reasonable
- any supporting files were copied across

### 7. Fix at the source if verification fails

If the generated copy is wrong:
- fix the canonical `src/` artifact, or
- if truly necessary, fix the generation pipeline in `scripts/agents-os.mjs`

Never hand-edit the generated file as the real solution.

## Special Guidance for Future Adapters

When the user wants something aimed at a future harness:
- create the normalized source now
- keep assumptions adapter-agnostic where possible
- explicitly note what cannot yet be generated
- do not claim full support until the target is added to `config/targets.json` and the sync pipeline actually emits it

## Final Report

When done, report:
- what artifact was created or updated
- its canonical source path
- which adapters were regenerated
- which generated files you inspected
- any target-specific degradations or unsupported harnesses
- whether follow-up generator work is needed
