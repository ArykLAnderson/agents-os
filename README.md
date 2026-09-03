# Agent OS (global)

Harness-neutral source of truth for global agents.

- `src/` is authoritative for this scope.
- `adapters/*/generated/` is disposable output for this scope.
- Global and project roots intentionally have identical internal `src/` paths. Scope is inferred from the root location.
- Override semantics are replace-by-name via harness precedence; project resources win over global resources.
- Memory is exported as read-only context bundles in v1.
- `src/AGENTS.md` is the canonical global instruction file. Sync generates an adapter copy and installs it at each target's configured global-instructions path.

Run from the Agent OS root:

```sh
node scripts/agents-os.mjs sync
node scripts/agents-os.mjs doctor
```

User-local target exclusions live outside the repository at
`~/.config/agents-os/targets.json` (or `$XDG_CONFIG_HOME/agents-os/targets.json`):

```json
{
  "skillExcludes": {
    "opencode": ["youtube-transcript"]
  }
}
```

`AGENTS_OS_LOCAL_CONFIG` may point to a different file. Local configuration only
adds skill exclusions; repository configuration remains authoritative for targets,
adapter paths, and required public skills.
