# Casebook CLI reference

Use the packaged `casebook` command for ordinary Case and Frame persistence. It is a SQLite-only public interface: it does not initialize a store and has no Markdown fallback. Do not invoke persistence variants, direct SQL, or provider internals in ordinary work.

## Resolution

- `--workspace <path>` accepts only an existing absolute workspace directory. Without it, the CLI resolves the real current directory, uses the nearest Git worktree root when one contains it, and otherwise uses that resolved directory. Bare repositories are not workspaces.
- The store is selected in this order: an explicit normalized absolute `--store <path>`; `$XDG_CONFIG_HOME/casebook/config.json`; then `$XDG_DATA_HOME/casebook/casebook.sqlite` (with normal XDG home defaults when those variables are absent). Project-local settings never select a store.
- `<workspace>/.casebook/settings.json` is optional Namespace context only: `{ "schema": "casebook-cli-settings@2", "namespace": "namespace:personal" }`. It must be a regular, safe JSON object with no extra keys. A legacy local settings file containing `store` refuses with `settings_store_authority_forbidden`; move store selection to XDG/global config.
- Namespace-scoped mutations and search resolve in this order: explicit `--namespace <semantic-id>`; legacy spelling `--namespace-id <semantic-id>` when supplied alone; then project-local settings. The canonical form is `namespace:<lowercase-kebab-segment>(/<segment>)*`. If no selector is available, the command refuses with `namespace_required`. Namespace selection never relocates existing content or grants workspace authority.
- `CASEBOOK_DATABASE_URL` and `CASEBOOK_SQLITE_BIN` are direct-provider or maintenance concerns, not CLI inputs. Do not use them to select ordinary Case or Frame persistence.

Use an explicit workspace or store only when it is already part of the user's request or configuration. Otherwise let the CLI resolve both.

## Commands and input

All commands emit exactly one `casebook-cli-result@2` JSON value on stdout. Mutations accept one complete Case or Frame aggregate through exactly one input mode:

- `--input '<JSON>'`; use `--input -` to read that JSON from standard input.
- `--input-file <absolute-normalized-path>` is a compatibility/fallback transport, not the recommended normal authoring path.
- `--draft` reads a compact authoring JSON object from stdin; it takes no value and cannot be combined with direct flags or another input mode. It is creation-only. Case drafts may provide `knowledge` (or a top-level `body`) with acting-role provenance; Frame drafts may provide compact `discovery` items or one top-level discovery shorthand. Canonical `entries` and `discovery` selections remain accepted unchanged.

Create commands also accept concise direct flags; these are creation-only. Case creation requires `--title`, `--summary`, `--scope`, `--body`, and `--acting-role`; `--authority-basis` is optional, and `--id` is optional. Frame creation requires `--title`, `--outcome`, `--discovery-title`, and `--discovery-body`; `--id` is optional. These flags expand only mechanical IDs, labels, arrays, provisional/private knowledge, and active/frontier/unclear Discovery defaults; they never invent semantic claims, sources, or provenance. Commit commands require one complete canonical aggregate through `--input`, `--input -`, or compatibility `--input-file`; direct authoring flags and `--draft` are refused before provider dispatch.

Do not supply either input mode to reads, search, receipt, or recent-operation commands. The available public commands are:

```sh
casebook create case --namespace <semantic-id> --commit-basis <text> [--input <json> | --draft | direct flags]
casebook delete case --namespace <semantic-id> --case-id <id> --expected-revision <positive-integer> --reason <text>
casebook read case --case-id <id> [--owner-revision-id <id>]
casebook commit case --namespace <semantic-id> --case-id <id> --expected-revision <positive-integer> \
  --commit-basis <text> --input -

casebook create frame --namespace <semantic-id> --commit-basis <text> [--input <json> | --draft | direct flags]
casebook delete frame --namespace <semantic-id> --frame-id <id> --expected-revision <positive-integer> --reason <text>
casebook read frame --frame-id <id> [--owner-revision-id <id>]
casebook commit frame --namespace <semantic-id> --frame-id <id> --expected-revision <positive-integer> \
  --commit-basis <text> --input -

casebook search --namespace <semantic-id> --query <text> [--limit 1..100] [--cursor <cursor>]
casebook receipt read --operation-id <id>
casebook operation status --operation-id <id>
casebook operation recent [--limit 1..20] [--before-operation-fence <positive-integer>]
```

For a commit, the aggregate ID must exactly equal its `--case-id` or `--frame-id`. A successful mutation returns its generated operation ID and revision. Search returns bounded candidates and a continuation cursor; it does not establish identity. `receipt read` and `operation status` are equivalent exact-operation observations.

Delete Case/Frame is revision-checked logical tombstoning, not physical purge: ordinary current reads/search hide the whole owner while durable history and receipts remain. Tombstoning an individual knowledge/Discovery item does not mean its whole owner was deleted. There is no ordinary public command for Frame list, resolve, Discovery, disposition, or history; direct initialization; migration; or storage-file editing. For a supported approximation, search for candidates and then read a stable returned ID. State an unavailable operation as a limitation rather than reaching around the CLI.

## Outcomes and recovery

- Exit `0`: success.
- Exit `1`: CLI refusal before dispatch, such as invalid grammar, input, workspace, or settings.
- Exit `2`: a target or provider refusal with a definitive result.
- Exit `3`: delivery is unknown for a mutation; its JSON result includes the exact operation ID that may have committed.

After exit `3`, run `casebook operation status --operation-id <exact-id>` and act on that exact observation before any further mutation. Never blindly retry the original command.

The CLI result is the ordinary receipt boundary. Keep its Case/Frame ID, revision, and mutation operation ID with the semantic work that produced it.
