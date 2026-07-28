---
name: casebook-persistence
description: Operates ordinary Case and Frame persistence through the packaged Casebook CLI.
---

# Casebook Persistence

This skill supplies storage mechanics only; Case and Frame retain semantic judgment. For every ordinary Case or Frame read or mutation, first read [references/cli.md](references/cli.md) and use the packaged `casebook` command it defines.

The CLI is the only ordinary persistence boundary. Do not invoke a connector variant, direct provider, direct SQL, or Markdown file interface; do not initialize, migrate, or fall back to another store. Keep the CLI result's stable owner ID, revision, and mutation operation ID with the semantic receipt. On exit `3`, inspect that exact operation with `casebook operation status` before taking another mutation action.

`CASEBOOK_DATABASE_URL` and `CASEBOOK_SQLITE_BIN` are not CLI configuration. They may be used only by explicitly authorized direct-provider maintenance or migration work, which is outside ordinary Case and Frame workflows. Legacy Markdown connector maintenance or migration is likewise exceptional and never an ordinary selection or fallback path.

Do not point unreviewed work at a live store.
