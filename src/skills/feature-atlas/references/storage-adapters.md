# Choose the publication guide

Read `<project>/.casebook/atlas-method.md` before Atlas reads or writes. It contains:

```markdown
# Feature Atlas publication

- Method: markdown | github-issues
- Destination: <path or owner/repository>
```

If the file is missing, do not guess. Ask the user:

> It looks like Feature Atlas has not been set up for this project. Should it use local Markdown files or private GitHub Issues, and where should they live?

After the user chooses, record that choice in `.casebook/atlas-method.md`, then follow the selected guide:

- [Markdown/local filesystem](configured-local-filesystem.md)
- [Private GitHub Issues](configured-private-github.md)

The configuration selects an instructional guide, not a writer tool. Use ordinary file or `gh` operations described by that guide.

Return `capability_unproven` only when the selected guide cannot safely perform the requested operation with available tools. Return `conflict` when existing Atlas records contradict the requested current plan, `publication_incomplete` after an incomplete write, and `unverifiable` when accepted/current meaning cannot be recovered. Stop rather than inventing a helper program, alternate representation, or missing planning meaning.
