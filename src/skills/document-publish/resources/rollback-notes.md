# Rollback Notes

Record recovery information before an external write whenever the target supports update, replacement, attachment, or deletion operations.

- Capture the destination identity, operation mode, pre-write revision or fetched content locator, and affected child content or assets.
- Prefer a reversible create or append operation over destructive replacement when both satisfy the reader action.
- For updates, record how to restore the prior content or revision using the target's supported history, revision, or manual recovery path.
- For attachments, record whether the prior asset remains valid, when temporary uploads expire, and how a failed replacement is detached or superseded.
- If the target offers no reliable automatic rollback, state that clearly and provide concise manual recovery steps before writing.
- After a failure, stop further writes, preserve the error and partial-write state, fetch the destination when safe, and report whether recovery is complete, partial, or requires author action.
- Never describe rollback as verified until the recovered target is fetched and inspected.
