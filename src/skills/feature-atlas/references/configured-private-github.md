# Configured Private GitHub Issues

Use these instructions only when private GitHub Issues is the Feature Atlas's configured canonical tracker. Feature Atlas policy remains defined in domain language by [the canonical Issue representations](issue-representations.md).

## Required configuration and safety

Obtain the exact `<owner>/<repository>` locator before publishing. The repository must be the configured dedicated private Issues repository, separate from source repositories. Never infer it from the current Git remote, create it as a convenience, or treat its Git tree as canonical planning storage.

Before every create or update session:

```sh
gh repo view <owner>/<repository> --json nameWithOwner,visibility,hasIssuesEnabled,url
```

Proceed only when `nameWithOwner` is exact, `visibility` is `PRIVATE`, Issues are enabled, and access succeeds. Otherwise stop and ask for the missing setup or explicit destination correction. Use `--repo <owner>/<repository>` on Issue commands so the current working repository cannot redirect publication.

The existing request to create or shape an Atlas, Map, or Feature authorizes proposed/shaping Issue creation in this already configured tracker. A named human's acceptance of a Feature decomposition authorizes mechanical creation or update of its accepted Work Item Issues. Those mechanical actions need no second publication prompt. Ask separately before publishing elsewhere, transferring canonical authority, or changing an understood-private destination to public.

## Find before allocating or creating

Search open and closed Issues, including comments, for the exact Atlas-qualified ID and the candidate local ID. For example, inspect results for both `FA-001 / F-014` and `F-014`:

```sh
gh issue list --repo <owner>/<repository> --state all --limit 1000 --search '"FA-001 / F-014" in:title,body,comments'
gh issue list --repo <owner>/<repository> --state all --limit 1000 --search '"F-014" in:title,body,comments'
```

Do not assume an empty truncated result is exhaustive; narrow or continue the search as needed. Inspect plausible matches with `gh issue view --comments`. Reuse the one canonical Issue when identity and ownership match. Stop rather than allocating or updating when results collide, conflict, or remain ambiguous. Repeat the search immediately before creating a newly allocated ID.

Use readable titles beginning with the stable ID, such as `FM-002 — Feature Atlas v1 delivery`. Issue numbers and title text may change without changing identity.

## Create and maintain Issues

Prepare the body from the applicable canonical template, then use ordinary GitHub operations with the repository explicit:

```sh
gh issue create --repo <owner>/<repository> --title '<ID> — <name>' --body-file <prepared-body>
gh issue edit <issue-number> --repo <owner>/<repository> --body-file <prepared-body>
gh issue comment <issue-number> --repo <owner>/<repository> --body-file <prepared-comment>
```

After creation, replace any pending self-locator with the returned canonical Issue URL. For every Map, Feature, and Work Item, verify that the body names both the stable owner ID and canonical owner Issue URL. A Work Item must name exactly one scope owner.

When GitHub native parent/sub-Issue relationships are available, they may mirror Atlas → Map → Feature → Work Item ownership for navigation. They do not define identity or authority. Never place a Map under an Atlas Index Segment, and never place a Work Item under a dependency instead of its declared scope owner.

Labels are optional presentation aids except for `atlas-current`. Keep exactly one Index Segment for an Atlas marked `atlas-current`. To rotate:

1. Create the next `AIS-<NNN>` Issue and identify the same Atlas in its body.
2. Link the previous and next segments as useful; do not add hashes.
3. Remove `atlas-current` from the old segment and add it to the new segment.
4. Update both segment states and the Atlas root's current-segment locator.
5. Confirm Maps still point to the Atlas root as owner and are not native children of either segment.

Choose rotation based on readability and context pressure, not a fixed count. Create the live Atlas hierarchy or rotate a real segment only when an authorized shaping invocation requires that publication in this configured tracker.

## Body and comment discipline

- Keep the Issue body current and concise; do not append dated history to it.
- Post the named-human Decision or other material-history comment before editing accepted current state.
- Do not describe an agent-authored comment, Issue creation, label, or body edit as acceptance.
- Link to pull requests, branches, reports, and source repositories rather than copying their detailed evidence.
- Re-read the rendered body and latest comments after mutation. Confirm stable identity, exact owner ID/URL, accepted-versus-proposed separation, current state, and next action are clear.
