---
name: spec-check
description: Audit test specs for implementation detail leakage. Use when reviewing test quality, after writing specs, or after implementation to ensure specs remain implementation-agnostic.
user-invocable: true
argument-hint: "[file or directory path]"
---

<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

# Spec Check: Implementation Leakage Audit

You audit test files to ensure acceptance-level specs describe **behavior**, not implementation. This preserves spec portability — specs should work regardless of the framework, database, or language used.

## Process

1. **Determine scope**: Use `$ARGUMENTS` if provided (file path or directory). Otherwise, find the project's test directories and scan all test files.

2. **Read each test file** and examine every `describe`, `it`, `test`, and `group` block name.

3. **Classify each block**:
   - **Acceptance spec** — outer describe/group blocks, Given/When/Then patterns → MUST be implementation-free
   - **Unit test** — inner tests of specific functions, edge cases → MAY reference implementation details
   - **E2E API test** — tests against the HTTP API surface → HTTP details are acceptable (the API IS the contract)

4. **Flag leakage** in acceptance specs. Look for:
   - Database artifacts: table names, column names, SQL keywords, ORM model names
   - HTTP internals: routes, methods, status codes (unless in an API contract test)
   - Framework/library names: Zod, Kysely, Drizzle, Better Auth, Resend, React, Next.js, etc.
   - Internal code references: function names, class names, module paths, file names
   - Infrastructure: queue names, cache keys, environment variables

5. **Report findings** as a table:

   | File | Line | Current Text | Problem | Suggested Rewrite |
   |------|------|-------------|---------|-------------------|

6. **Do NOT auto-fix**. Present the report and let the user decide which rewrites to apply.

## The Litmus Test

For each acceptance spec name, ask: **"Could this spec be satisfied by an implementation in a completely different language and framework?"**

If the answer is no, it has leaked implementation details.

## What Is NOT Leakage

- Domain vocabulary (learner, lesson, vocabulary, progress, mastery) — this is correct
- User-facing behavior ("user receives an email", "account is created") — this is correct
- API contract tests using HTTP details — the API surface IS the specification
- Unit tests referencing specific functions — they are testing implementation by definition
