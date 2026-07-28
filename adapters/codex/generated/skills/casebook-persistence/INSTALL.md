# Installing Casebook CLI

This document is for a human operator. Ordinary Case and Frame workflows use the packaged `casebook` command described in [references/cli.md](references/cli.md); they do not configure a connector or database provider directly.

## Runtime

Install the packaged `@agents-os/casebook-cli` command with Node.js 22 or newer. The package is SQLite-only and operates an existing store. It does not initialize stores or provide a Markdown fallback.

Configure ordinary resolution with an existing workspace and, when needed, the CLI's settings files or explicit `--store` option. Settings allow only `schema` and `store`: `schema` is `casebook-cli-settings@1`; `store` may be omitted or `null` to continue resolution, or be an absolute normalized string. Unsafe, malformed, extra, or otherwise invalid settings refuse rather than falling through. See the CLI reference for the complete workspace and XDG resolution order, input modes, operations, outcomes, and exit-3 recovery procedure.

## Maintenance boundary

`CASEBOOK_DATABASE_URL` and `CASEBOOK_SQLITE_BIN` belong to explicitly authorized direct-provider maintenance, initialization, or migration procedures. They are not ordinary CLI inputs. Legacy Markdown connector work is maintenance or migration only; it is never an ordinary persistence selection or fallback.

Do not run tests or unreviewed requests against a live Casebook store.
