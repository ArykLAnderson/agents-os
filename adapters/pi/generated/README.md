<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

# pi Adapter (global)

Generated from this scope's canonical `src`. Harness/resource precedence composes global and project scopes; this adapter output intentionally contains only global resources.

## Manual Setup

- Complete provider OAuth/auth in pi.
- Point the harness at this generated directory or copy/symlink as appropriate.
- Do not edit generated files directly.

## Known V1 Degradation

- Team-style workflows are expressed as parent-orchestrated pi-subagents rounds, not as AgentOS team/task state.
