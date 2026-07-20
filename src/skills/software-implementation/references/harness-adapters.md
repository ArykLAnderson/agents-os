# Harness Adapters

The portable coordinator calls this semantic port; target references own concrete syntax and capability claims.

## Port

- `prepare(role, tool_policy, cwd)` → effective capability and limitations;
- `launch(role_contract, task_contract, cwd, context_policy)` → correlated child identity;
- `launch_parallel(assignments)` → one identity per assignment, or explicit failure when required parallelism is unavailable;
- `await(children)` → correlated compact results;
- `inspect(child)` → current status/evidence;
- `resume(child, message)` and `cancel(child)` → `supported | unsupported | uncertain`;
- `collect(child, result_contract)` → normalized role result without discarding native evidence.

Fresh replacement with role Contract, task Contract, compact prior evidence, and explicit cwd is mandatory. Resume/cancel are optimizations.

Every adapter must:

- bind an explicit persistent working directory;
- launch bounded parallel assignments only when their independence is preserved;
- select the strongest available role/tool policy and state its actual result;
- keep child results correlated;
- report validator enforcement as `filesystem_enforced | tool_restricted_shell_mutable | instruction_only`;
- discover provider/PR capability without treating discovery as authority; and
- preserve operation-specific Effect Bindings.

It must not change task meaning, coordination policy, source authority, required proof, or external authority. Capability limitations are evidence, not permission to weaken a gate.

## Target Selection

Read exactly the active target reference before dispatch:

- [Pi](harnesses/pi.md)
- [Codex](harnesses/codex.md)
- [OpenCode](harnesses/opencode.md)

Generated native profiles may optimize policy and discovery, but portable skills plus inline role binding remain sufficient when native named agents are unavailable. Generation, installation, and Doctor verification are separate package-realization work, not coordinator runtime behavior.