---
name: feature-atlas
description: Define and publish the accepted current delivery plan from Blueprint, using the project's configured Markdown or private GitHub Issues representation.
---

# Feature Atlas

Feature Atlas is the durable accepted delivery plan. It records what was accepted, how work is divided, what depends on what, and what evidence each part must produce. It is not a workflow engine, transaction protocol, or second architecture authority.

## Use it

1. Confirm that a trusted human accepted the exact Map candidate and that it names the accepted RFC/Blueprint revision it realizes. A draft or accepted RFC alone is not an accepted Map.
2. Read and follow [Choose the publication guide](references/storage-adapters.md). `CASEBOOK_DATABASE_URL` is unrelated.
3. Read [Representations](references/issue-representations.md), then follow only the selected publication guide:
   - [Markdown/local filesystem](references/configured-local-filesystem.md)
   - [Private GitHub Issues](references/configured-private-github.md)
4. Publish the accepted Map faithfully, then reread the result and report whether it is complete and consistent with what was accepted.
5. Return the typed handoff defined in Representations. It is ready only when a fresh reader can recover the current accepted Map, ownership, dependencies, proof responsibilities, limitations, authority boundary, and source links without inventing missing meaning.

## Boundaries

- A publication guide tells the agent how to use ordinary available tools; publication does not require a separate writer.
- Follow the guide directly. If it cannot safely represent the change, return `capability_unproven` rather than inventing new publication machinery.
- Only exact Map acceptance grants Atlas publication. Atlas publication grants no implementation, commit, PR, merge, deployment, provider, credential, or production authority.
- Atlas owns planning facts. Git, tests, PRs, deployments, and providers remain authoritative for their own facts; Atlas links to them rather than copying or reinterpreting them.
- Never keep a parallel accepted plan. A changed design or materially changed delivery plan requires the appropriate new acceptance before Atlas is updated.
