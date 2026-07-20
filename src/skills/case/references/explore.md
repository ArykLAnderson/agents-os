# Explore

Retrieve and explain established knowledge while preserving scope, support, authority, disagreement, and supersession.

1. Resolve exactly one workspace authority through the [persistence procedure](persistence.md). Fail closed before Case access if the selection is absent or ambiguous.
2. Search through the selected typed surface: bounded `case.search` for SQLite, or bounded `common.search` restricted to `owner_kinds: ["case"]` for Markdown. Use typed resolve only for exact IDs or supported aliases; text similarity never establishes identity.
3. Load only likely Cases with `case.read`, then follow precise entry, source, artifact, and relationship references as needed. Do not glob, grep, or parse authority files as a substitute for typed reads.
4. Answer from current Case meaning and identify material limitations, unresolved disagreement, visibility boundaries, and incomplete or truncated results.
5. Report when the available Cases do not answer the question.

Read and search requests use the exact selected private view and `requested_audience_ceiling: "private"`. They are non-mutating. Explore may request regeneration of indexes, backlinks, resolvable references, and mechanically supported map membership only through an available typed operation; it never writes authority files directly. It does not conduct broad external research or invent classifications, tags, relationships, or projection Cases. Use Frame when fresh knowledge or human judgment is required.
