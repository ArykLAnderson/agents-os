# Explore

Retrieve and explain established knowledge while preserving scope, support, authority, disagreement, and supersession.

1. Follow the [persistence procedure](persistence.md).
2. Search through `casebook search --namespace <semantic-id> --query <text>`, using the explicit or project-resolved Namespace plus its bounds and cursor. Search results are candidates, not identity.
3. Load likely Cases only with `casebook read case --case-id <stable-id>`, then follow exact entry, source, Artifact, and relationship references as needed.
4. Answer from current Case meaning and identify material limitations, unresolved disagreement, visibility boundaries, and incomplete or truncated results.
5. Report when the available Cases do not answer the question.

There is no ordinary public Case list or resolve command. Do not replace the search/read approximation with filesystem inspection, grep, direct SQL, connector calls, or direct Markdown parsing. Explore is non-mutating. It does not conduct broad external research or invent classifications, tags, relationships, or projection Cases. Use Frame when consequential software-system knowledge or human judgment is required; otherwise preserve the gap for the applicable research, deliberation, or human-decision owner.
