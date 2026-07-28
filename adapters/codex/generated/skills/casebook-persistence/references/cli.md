# Casebook CLI reference

Use the packaged `casebook` command for ordinary Case and Frame persistence. It is a SQLite-only public interface: it does not initialize a store and has no Markdown fallback. Do not invoke persistence variants, direct SQL, or provider internals in ordinary work.

## Resolution

- `--workspace <path>` accepts only an existing absolute workspace directory. Without it, the CLI resolves the real current directory, uses the nearest Git worktree root when one contains it, and otherwise uses that resolved directory. Bare repositories are not workspaces.
- The store is selected in this order: an explicit normalized absolute `--store <path>`; `<workspace>/.casebook/settings.json`; `$XDG_CONFIG_HOME/casebook/config.json`; then `$XDG_DATA_HOME/casebook/casebook.sqlite` (with normal XDG home defaults when those variables are absent).
- A settings file must be a regular, safe JSON object whose only allowed keys are `schema` and `store`, with `schema` exactly `"casebook-cli-settings@1"`. `store` may be omitted or `null` to permit the next source in the order; when non-null, it must be an absolute normalized string. Malformed, unsafe, changed, extra, or otherwise invalid settings refuse the command and never silently fall through.
- `CASEBOOK_DATABASE_URL` and `CASEBOOK_SQLITE_BIN` are direct-provider or maintenance concerns, not CLI inputs. Do not use them to select ordinary Case or Frame persistence.

Use an explicit workspace or store only when it is already part of the user's request or configuration. Otherwise let the CLI resolve both.

## Commands and input

All commands emit exactly one `casebook-cli-result@2` JSON value on stdout. Mutations accept one complete Case or Frame aggregate through exactly one input mode:

- `--input '<JSON>'`; use `--input -` to read that JSON from standard input.
- `--input-file <absolute-normalized-path>`.

Do not supply either input mode to reads, search, receipt, or recent-operation commands. The available public commands are:

```sh
casebook create case --commit-basis <text> [--namespace-id <id>] --input <json>
casebook read case --case-id <id> [--owner-revision-id <id>]
casebook commit case --case-id <id> --expected-revision <positive-integer> \
  --commit-basis <text> [--namespace-id <id>] --input <json>

casebook create frame --commit-basis <text> [--namespace-id <id>] --input <json>
casebook read frame --frame-id <id> [--owner-revision-id <id>]
casebook commit frame --frame-id <id> --expected-revision <positive-integer> \
  --commit-basis <text> [--namespace-id <id>] --input <json>

casebook search --query <text> [--namespace-id <id>] [--limit 1..100] [--cursor <cursor>]
casebook receipt read --operation-id <id>
casebook operation status --operation-id <id>
casebook operation recent [--limit 1..20] [--before-operation-fence <positive-integer>]
```

For a commit, the aggregate ID must exactly equal its `--case-id` or `--frame-id`. A successful mutation returns its generated operation ID and revision. Search returns bounded candidates and a continuation cursor; it does not establish identity. `receipt read` and `operation status` are equivalent exact-operation observations.

There is no ordinary public command for Frame list, resolve, Discovery, disposition, or history; direct initialization; migration; or storage-file editing. For a supported approximation, search for candidates and then read a stable returned ID. State an unavailable operation as a limitation rather than reaching around the CLI.

## Outcomes and recovery

- Exit `0`: success.
- Exit `1`: CLI refusal before dispatch, such as invalid grammar, input, workspace, or settings.
- Exit `2`: a target or provider refusal with a definitive result.
- Exit `3`: delivery is unknown for a mutation; its JSON result includes the exact operation ID that may have committed.

After exit `3`, run `casebook operation status --operation-id <exact-id>` and act on that exact observation before any further mutation. Never blindly retry the original command.

The CLI result is the ordinary receipt boundary. Keep its Case/Frame ID, revision, and mutation operation ID with the semantic work that produced it.
