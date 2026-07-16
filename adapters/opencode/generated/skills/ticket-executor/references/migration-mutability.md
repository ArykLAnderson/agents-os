# Migration Mutability and Recovery Rules

Use this reference whenever a ticket creates or changes a database migration, review finds a migration conflict, or the safe choice between rewriting, rolling back, and rolling forward is unclear.

## First principle

A Git commit is not the operational point of no return. **Shared application is.**

A migration becomes operationally immutable once it may have been applied to a non-disposable shared environment. Do not rewrite history that another database may already embody.

## Mutability table

| Migration state | May edit or squash the existing migration? | Required treatment |
| --- | --- | --- |
| Uncommitted in one isolated worktree; applied only to disposable databases | Yes | Edit freely. Recreate disposable databases and rerun the migration path. |
| Committed locally, unpushed, and never applied outside disposable databases | Yes | Confirm branch/worktree ownership and absence from shared environments. Amend or add a corrective local commit. Recreate disposable databases; do not edit their ledgers manually. |
| Pushed or under review, but confirmed never applied to a shared environment | Conditionally | Coordinate with reviewers and branch consumers before rewriting. Prefer a visible corrective commit unless squashing is explicitly safe. Revalidate every known consumer. |
| Applied to shared development, CI persistence, preview, staging, or another team environment | No | Treat as immutable. Add a new forward corrective migration. |
| Applied to production or application status is uncertain | No | Treat as immutable. Use a new forward corrective or compensating migration and an explicit rollout/recovery plan. Never assume it is safe to rewrite. |

When application status cannot be proven, choose the stricter row.

## Decision procedure

Before changing an existing migration, establish and record:

1. The exact migration filename/version and commit SHA.
2. Whether it was pushed, reviewed, merged, packaged, or released.
3. Every environment where it may have run.
4. Whether those databases are disposable.
5. Whether another branch or person may depend on the current definition.
6. Whether the migration tool records versions only or also verifies checksums.

Then choose one path:

- **Mutable local draft:** correct the existing migration and rebuild disposable databases.
- **Immutable applied migration:** preserve it and add a new forward correction.
- **Intentional feature removal:** prefer a new forward compensating migration over executing an old complex `down` in production.
- **Unknown state:** stop and request an operational decision; do not edit migration ledgers or guess.

## Rollback policy

A migration must use one explicit rollback posture:

| Posture | Requirement |
| --- | --- |
| Exactly reversible | `down` restores the prior schema behavior, definitions, ownership, privileges, constraints, indexes, triggers, and data contract. Prove it with up → down → up. |
| Forward-compensated | Historical migration remains immutable. A new migration deliberately restores or supersedes the prior state through the normal forward ledger. |
| Non-reversible | Declare automated rollback unsupported. Fail clearly rather than provide a partial or misleading `down`. Supply backup, restore, or compensating-forward procedures. |

Do not call a rollback safe merely because newly created tables are dropped. Objects replaced or altered from earlier migrations must also be restored.

## `CREATE OR REPLACE` and shared-object checklist

When a migration replaces an existing function, view, trigger implementation, policy, or other shared object:

- capture the prior definition;
- capture owner and ACL/grants;
- identify dependent triggers, views, procedures, and roles;
- make `down` restore the prior definition when the migration is still mutable and claims exact reversibility;
- preserve or explicitly restore owner and privileges;
- verify behavior, not only catalog text;
- if the migration is already immutable, use a new forward migration instead of editing it.

A `CREATE OR REPLACE` in `up` with no corresponding restoration in `down` is a review finding unless rollback is explicitly unsupported.

## Migration ledgers and lock files

- Never manually add, delete, or rewrite migration-ledger rows during ordinary development.
- Never mark a failed migration successful merely to unblock execution.
- For local disposable databases, destroy and recreate the database rather than repairing ledger state by hand.
- For shared environments, ledger repair is an incident/recovery operation requiring an explicit plan, database backup, exact observed state, and review.
- Do not confuse a migration runner's advisory lock with migration history. Release an abandoned lock only after proving no runner is active and following the tool's recovery procedure.

Editing an already-applied migration file does not normally cause a version-based migration runner to execute it again; it instead creates disagreement between existing databases and fresh installs.

## Lock and rollout review

Before applying schema changes to a shared environment, identify:

- lock modes and expected duration;
- table/index rewrites or scans;
- transaction boundaries;
- concurrent reader/writer behavior;
- statement and lock timeouts;
- backfill size and batching;
- deploy ordering between old and new application versions;
- observability and abort conditions;
- recovery or compensating-forward steps.

Replacing a function is generally different from rewriting a populated table, but it still requires object/catalog locks and dependency review. Describe the actual operation rather than labeling every migration as either “safe” or “locking.”

## Minimum verification

For a mutable migration with a supported `down`, use a disposable production-shaped database and verify:

1. Apply all preceding migrations.
2. Capture affected definitions, owners, ACLs, constraints, triggers, and representative behavior.
3. Apply the migration and test forward behavior.
4. Apply any immediately dependent migrations when relevant.
5. Roll dependent migrations back in normal order.
6. Roll the migration back.
7. Compare the captured schema and behavior exactly.
8. Reapply the migration and rerun forward behavior.
9. Run fresh-install migration tests and affected integration suites.

For data migrations, also prove row counts, invariants, idempotency/restart behavior, and hold/retention requirements. Never use production data or credentials for this verification.

## Review disposition

Migration findings are not resolved by saying “production usually rolls forward.” Reviewers must distinguish:

- a defect in the current forward state;
- a defect only in a claimed rollback path;
- an undeclared non-reversible migration;
- an operational rollout risk;
- harmless differences from the exact previous catalog state.

Record the migration state from the mutability table, chosen recovery posture, evidence, and the authority approving any exception. Escalate when that state or authority is unclear.
