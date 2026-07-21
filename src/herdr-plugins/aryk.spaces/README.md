# Aryk Spaces (offline source plugin)

`aryk.spaces` is a self-contained Herdr 0.7.4 source plugin. Its `open-spaces` action opens one popup terminal picker combining authoritative semantic projects, a fresh `workspace list`, zoxide results when available, and configured shallow folder roots. It does not link/run Herdr during tests, mutate Casebook, invent semantic identity, or start Steward.

The picker prefers `fzf`, launched directly with argv and `shell: false`. Without it, an interactive numbered line picker is used; non-interactive use visibly refuses. Labels are display only and sanitized; selection identity is an exact generated row key. Safe path preview invokes `eza` or `fd` directly when available, otherwise shows plain path details. No Neovim is involved.

## Configuration and custody

Configuration is JSON at `${XDG_CONFIG_HOME:-~/.config}/herdr/trials/casebook/spaces.json`; absent config uses the checked-in example defaults. Roots have maximum depth 2 and explicit basename ignores. Discovery never follows directory symlinks. Every folder selection is physically resolved and must remain within a physically resolved allowed root.

State is beneath `${XDG_STATE_HOME:-~/.local/state}/agent-os/herdr-trials/casebook/spaces/`. `plain-workspaces.json` records the verified create receipt: workspace, tab, root-pane and terminal IDs plus canonical root realpath. Every use requires the workspace in a fresh list and a fresh `pane get` that exactly repeats all relationships and a cwd resolving to that root; stale/reused IDs are ignored. `pending-enrollments.json` contains machine-local requests for selected unopened semantic projects. Both use exclusive locks and fsync/rename replacement; crash-left locks fail closed. Existing symlinks in state paths are refused.

The publisher-owned registry remains `../bindings/registry.json`. The compatible schema extension adds two optional project fields: absolute `declaredRoot` and nonempty `displayName`. They are presentation/declaration only; canonical identity remains `canonicalId`. Registry values use the strict `aryk.pins` types, generations, official Pi tuple, and four-locator binding; cross-project reuse of a workspace is invalid. A semantic row becomes live only when a fresh `agent list` exactly attests an official current binding also present in the fresh workspace list. Runtime IDs are locators only. Folder/live deduplication requires an exact canonical realpath from a worktree checkout or a freshly re-attested plain create receipt; labels and CWD guesses are never used.

## Selection safety

- Live: focus exact `workspace_id`, requiring exit-zero `workspace_info` for that ID with `focused: true`.
- Semantic: require one unique current authoritative binding exactly repeated by a fresh official `agent list` tuple and present in a fresh workspace list. Stale/ambiguous refuses. Unopened records one pending enrollment request and explains that a trusted publisher must act.
- Folder: re-realpath and recheck containment before preview, then refresh the workspace list and plain pane attestations immediately before the effect. Exact multiple live roots refuse, one focuses, and none creates exactly `workspace create --cwd PATH --label plain:NAME --focus`. The complete `workspace_created` relationships and root cwd must validate before the receipt is recorded. If that recording fails after confirmed creation, the picker says not to retry.

All Herdr calls use absolute `HERDR_BIN_PATH`, argv, `shell: false`, and explicit `--session casebook-trial`. Semantic use additionally requires inherited config/socket equality with the registry. Focus/create are never retried after uncertain delivery. There are no destructive commands.

## Offline verification

```sh
node --test src/herdr-plugins/aryk.spaces/test/*.test.mjs
node --check src/herdr-plugins/aryk.spaces/index.mjs
python3 - <<'PY'
import tomllib
with open('src/herdr-plugins/aryk.spaces/herdr-plugin.toml','rb') as f: tomllib.load(f)
print('toml: ok')
PY
```

Limitation: a trusted publisher must populate the registry, including optional display/root declarations, and establish current semantic session bindings. Herdr 0.7.4 `workspace_list` does not expose a plain workspace CWD, so exact plain folder relinking relies on the plugin's complete post-create receipt plus fresh `pane get`; pre-existing non-worktree live workspaces remain Live-only.
