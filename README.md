# Agent OS (global)

Harness-neutral source of truth for global agents.

- `src/` is authoritative for this scope.
- `adapters/*/generated/` is disposable output for this scope.
- Global and project roots intentionally have identical internal `src/` paths. Scope is inferred from the root location.
- Override semantics are replace-by-name via harness precedence; project resources win over global resources.
- Memory is exported as read-only context bundles in v1.
- `src/disabled-skills/` preserves dormant skills without exporting them to any harness.
- Codex loads generated skills through symlinks from `~/.codex/skills/<name>` to `adapters/codex/generated/skills/<name>`.

Run from the Agent OS repository root:

```sh
node scripts/agents-os.mjs sync
node scripts/agents-os.mjs doctor
```

`sync` regenerates the configured Pi, Codex, and OpenCode adapters from `src/`. `doctor` checks target layouts and detects missing or stale generated skills.
