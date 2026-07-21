# Configured Local Filesystem / Git-Backed Adapter

Use this adapter only when a local filesystem root is the configured canonical Feature Atlas destination. It conforms to [the storage adapter contract](storage-adapters.md) and preserves [canonical representation semantics](issue-representations.md). A Git repository may retain and transport the records; Git does not accept Maps, select the current Decision, establish ownership, or satisfy prerequisites.

## Configuration And Preflight

Bind outside the Atlas records:

- exact canonical root identity and normalized absolute root path;
- adapter and representation-codec version;
- expected local audience, access/permission policy, backup/retention policy, and—if Git-backed—exact repository/worktree and allowed publication/remotes;
- trusted human authority/provenance verifier; and
- concurrency/serialization mechanism, hash algorithm/content-type rules, and receipt location.

Before reads or mutations, resolve the configured root without symlink/path escape, verify it is the expected destination, verify access and audience/permissions, and verify immutable Decision retention plus write-recovery capability. A Unix username, file author, Git author/signature, commit, or file ownership alone does not prove bounded Map acceptance authority. If private records are Git-backed, also verify configured remote visibility/access before any authorized publication; a local commit does not authorize a push.

Do not infer the root from the current source repository or create a nearby `.atlas` directory as fallback. Source repositories and Atlas storage may be separate even when both use Git.

## Representation Without A Universal Schema

The adapter's configured codec maps the existing canonical semantic representations to readable local records. Preserve all identity, owner, current Decision, local-label binding, dependency, convergence, proof, limitation, invalidator, evidence, and authority-boundary meaning. Do not invent a second JSON ontology or require callers to know mutation order.

A practical codec may keep mutable current projections by stable identity and append-only immutable Decisions/qualified observations separately, for example:

```text
<root>/atlas.<codec-extension>
<root>/maps/FM-*/current.<codec-extension>
<root>/maps/FM-*/decisions/<decision-content-id>.<codec-extension>
<root>/features/F-*.<codec-extension>
<root>/work-items/WI-*.<codec-extension>
<root>/receipts/<operation-id>.<receipt-extension>
```

This layout is illustrative, not canonical. Existing local codecs may use other names, split/combined records, or Markdown with frontmatter. The conformance test is whether domain operations recover the canonical semantics and exact current immutable Decision without path knowledge. Stable IDs are record content; filenames are navigation.

## Immutable Decisions And Locators

Write accepted Decision bytes once under the configured canonical content-type/byte rules. Verify them immediately after write and on every read. A bare mutable path is never an immutable Decision locator.

The adapter returns an adapter-qualified locator with enough retained information to reread exact bytes and verify integrity:

- filesystem-only: destination identity, durable record key/version, canonical content type, algorithm and content digest;
- Git-backed: exact repository identity plus commit and blob/object locator for the bytes, canonical content type and content digest; and
- externally referenced snapshot: its already required immutable/versioned locator and Decision-contained content binding.

Use a collision-resistant configured digest such as SHA-256 for new filesystem content bindings. A digest proves byte integrity, not human acceptance or semantic currentness. A Git commit/blob is immutable by content identity but remains usable only while the configured retention/audience guarantees keep it resolvable; branches, tags, `HEAD`, working-tree paths, commit messages, and Git authors are mutable/navigation/provenance inputs, not Atlas authority.

## Identity, Expected Predecessor, And Writes

Before creation or allocation, search all active records and retained immutable Decisions/observations under the configured codec for qualified/unqualified stable IDs, Decision identities, and candidate-local bindings. Search again inside the serialized mutation boundary. Stop on duplicates, owner mismatch, durable-binding conflict, unreadable retained history, or ambiguous codec results.

The adapter must serialize one root's semantic mutation or provide equivalent expected-predecessor/CAS behavior. Within that boundary:

1. reread the exact Map and verify the expected current predecessor, destination, authority package, accepted bytes/content binding, and identity collisions;
2. write and sync the immutable Decision to a temporary/staged object, verify digest/content type, then make it durably addressable without overwrite;
3. durably bind accepted local labels to stable identities;
4. write child current projections in two passes so every owner/edge locator resolves;
5. replace Feature then Map current projections atomically per record, with the Map last;
6. reread through the codec, compare exact Decision/owners/bindings/edges/currentness, and emit a durable receipt.

For a Git-backed codec, the adapter may use one or more commits as its mechanical transaction/retention vehicle. It still verifies the semantic expected predecessor before writing. A clean commit or fast-forward does not replace that check, and a merge never resolves semantic conflict automatically.

Never overwrite an immutable Decision/observation object, recycle an established ID, silently remap a label, or repair meaning by editing a projection. Same-filesystem rename plus file/directory sync (where supported) is the ordinary atomic current-projection replacement mechanism; the adapter must report the weaker observed guarantee when the filesystem cannot provide it.

## Receipts And Recovery

Every mutation receipt records adapter/destination identity, operation identity, exact expected/current Decision, acceptance/mutation authority locator, written content digests and durable locators, established label bindings, projection versions, reread result, Git commit/blob locators when applicable, and terminal state `complete | partial | uncertain`.

After interruption or an uncertain write:

1. reacquire the configured serialization boundary;
2. inspect the receipt/staged objects, immutable Decision store, current projections, and Git object/working-tree state when applicable;
3. verify bytes by digest and search all identities/bindings before retry;
4. if the exact Decision already exists, reuse it—never append/recommit a semantic duplicate merely to get a new receipt;
5. resume only pending mechanical projections from established bindings, refreshing Feature then Map last; and
6. reread through domain operations and emit a recovery receipt naming prior/superseding receipt relation.

If exact state cannot be distinguished, return `write_uncertain` or `publication_incomplete` with known successes and stop. Do not delete successful records, reset Git history, force-push, choose a conflict winner, or fabricate rollback. Restore from backups is a separately authorized integrity operation and must preserve exact immutable Decisions and locators.

## Consumer Boundary

Only this adapter reads paths or invokes Git. Route and Software Implementation consume `readCurrentMap`, `verifyPublication`, and `exportExecutionHandoff` domain results. They receive adapter-qualified locators/receipts but do not parse the directory, inspect `HEAD`, or treat a commit as the current Map Decision.