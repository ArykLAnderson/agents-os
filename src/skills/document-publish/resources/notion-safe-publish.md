# Notion Safe Publish

Use this checklist only after the formatted Notion-native source exists. Formatting does not grant publication authority.

## Preconditions

- Explicit action authorization names `stage` or `release`, destination identity, actor, audience, write scope, and the exact artifact revision.
- Destination identity and edit permission are verified through an authorized external read.
- For updates or release, existing content, child content, collaborator edits, and destructive-write impact are fetched before the write.
- The artifact trace has no unresolved semantic, stale-support, authority, or material visual blocker.
- Attachments and linked assets have a verified lifecycle, accessible alternative text, and a planned final locator.

## No-Write Outcome

If a destination or action authorization is absent, produce a plan that lists the missing preconditions and stop. Do not invoke an external destination tool, infer a workspace, create a draft, or record a final locator.

## Remote Review

When staging is authorized, create a non-final remote draft and fetch it for destination-faithful review. A material collaborator edit is new document context: preserve it and return it to `document` for reconciliation, composition, shaping, or review. Never let stage authorization imply release.
