# Configured Private GitHub Issues Adapter

Use this adapter only when private GitHub Issues is the configured canonical Feature Atlas. It conforms to [the storage adapter contract](storage-adapters.md); domain identity, ownership, Decision authority, currentness, handoff, and projection semantics remain defined by [the canonical representations](issue-representations.md).

`gh` examples below are adapter-owned mechanics. Route, Software Implementation, and other domain consumers never invoke them or parse Issue records directly; they consume exact Feature Atlas domain operations and adapter receipts.

## Fail-Closed Capability And Destination Preflight

Before any accepted publication, a separately authorized bounded provider prototype must already prove:

- authenticated actor and bounded human-authority provenance can be retained and verified;
- external accepted snapshots, when needed, are immutable/versioned, lifetime-retained, audience-compatible, and cryptographically content-bound;
- open/closed Issue and comment identity searches can be exhaustive enough for find-before-create;
- accepted Decision history and current projections can be reread without treating editable display text as authority;
- uncertain create/edit/comment results can be recovered by exhaustive reread before retry.

Until that evidence exists for the exact configured provider/account/repository, Map publication is unsupported. Stop; do not weaken trusted acceptance, infer provenance from comment prose, invent external storage, or fall back to Feature-first publication.

Obtain the exact `<owner>/<repository>` and expected visibility. The repository must be the configured dedicated private Issues repository, separate from source repositories. Never infer it from the current Git remote, create it for convenience, broaden visibility, or substitute another account.

Inside the configured adapter, before every authorized mutation session:

```sh
gh repo view <owner>/<repository> --json nameWithOwner,visibility,hasIssuesEnabled,url
```

Proceed only when identity is exact, visibility is `PRIVATE`, Issues are enabled, access succeeds, and the capability evidence above applies. Use `--repo <owner>/<repository>` on every Issue command.

Route composition and human discussion authorize no tracker mutation. Only a verified exact Map Acceptance Package authorizes the narrow Publisher's configured Atlas projection. That authority does not extend to another destination, visibility change, implementation dispatch, source mutation, PR, merge, or deployment.

## Exhaustive Find Before Create

Search open and closed Issues and comments for the Atlas-qualified stable ID, unqualified stable ID, Map Decision identity, and candidate-local label. For example:

```sh
gh issue list --repo <owner>/<repository> --state all --limit 1000 --search '"FA-001 / F-014" in:title,body,comments'
gh issue list --repo <owner>/<repository> --state all --limit 1000 --search '"F-014" in:title,body,comments'
```

A truncated empty result is not exhaustive. Narrow/continue the search and inspect every plausible match with comments. Reuse exactly one record only when stable identity, owner, current Map Decision, and accepted local-label meaning agree. Stop on ambiguity, owner mismatch, duplicate identity, durable-binding conflict, or contradictory accepted content. Repeat search immediately before creation.

An allocated number remains tentative until successful create/reuse plus post-write reread establishes its binding. If another actor wins a race before binding, reread exhaustively and select a different collision-free value. Never recycle an established identity or silently remap an accepted label.

## Narrow Recoverable Publisher

The Publisher calls Feature Atlas domain mutation operations; this adapter implements them with prepared bodies/comments derived mechanically from the exact accepted Map Decision:

```sh
gh issue create --repo <owner>/<repository> --title '<ID> — <name>' --body-file <prepared-body>
gh issue edit <issue-number> --repo <owner>/<repository> --body-file <prepared-body>
gh issue comment <issue-number> --repo <owner>/<repository> --body-file <prepared-comment>
```

For a new Map, create a minimum shell only if needed to host its Decision. It must say `no accepted candidate`, reveal no proposed semantics, and remain non-authoritative if Decision recording fails.

Recoverable order:

1. Reread destination, capability evidence, authority provenance, exact bindings, expected predecessor, provider Decisions, and collisions.
2. Create/recover the minimum Map shell and record the immutable current `Decision — Map candidate` with verified authority provenance and required external content binding.
3. Create/reuse Feature and Work Item identities from exact accepted local labels. Legs remain Feature-contained by default.
4. Reread all created records; resolve every owner, self, dependency, Decision, and provider endpoint locator; update child projections in a second pass.
5. Refresh Feature bodies and the Map body last, including current Decision, label mappings, graph/proof/history, publication state, limitations, and next action. Update Atlas/Index navigation only as needed.
6. Reread rendered bodies and comments. Verify identity, exact owner, Decision/currentness, accepted meaning, edge direction, locator completeness, visibility, and one-current-Decision status.

Native sub-Issue relationships may mirror Atlas → Map → Feature → Work Item for navigation. They never define ownership or authority. A Leg need not become an Issue. Never put a Map under an Index Segment as semantic parent, or a Work Item under a dependency instead of its Feature owner.

Keep bodies current and concise. Preserve append-only semantic history through new Decision/correction/observation comments rather than silently rewriting accepted history. Do not persist a mutable reverse `Blocks` field; derived reverse views cite their source consumer and observation time.

## Partial Failure And Uncertain Results

GitHub mutations are non-transactional. If any operation fails or has an uncertain result, stop and return the Map Decision locator, successful record locators, exact failed operation, incomplete/pending projections, and safe resume action. Search/reread before retry.

Do not repost the Decision, delete successful records, roll back/recycle IDs, create replacements to hide partial state, choose semantic conflict resolution, or follow a newer Decision silently. Resume from the exact Decision and established bindings. When possible, project `publication incomplete`; normal execution handoff remains refused until stable references and current projection are complete.

## Observations And Source Links

GitHub text does not make a source fact true. Retain an observation only when the owning workflow/source authority initiates the bounded operation and the adapter verifies identity, authorization, provenance, locator/environment, audience, and integrity. Unverifiable results are `unknown`. Link to Git, tests, PRs, reports, deployments, and runtime/provider evidence rather than copying detailed facts or secrets.

The adapter returns exact domain identities, immutable Decision comment/snapshot locators, rendered reread results, and receipts. Issue numbers, labels, native parentage, editable bodies, and `gh` output remain provider mechanics and never become the interface consumed by Route or Software Implementation.
