# Notion Safe Publish

Use this checklist only after the formatted Notion-native source exists. Formatting does not grant publication authority.

## Preconditions

- Explicit action authorization names create or update mode, destination identity, actor, and the exact artifact revision.
- Destination identity and edit permission are verified through an authorized external read.
- For updates, existing content, child content, and destructive-write impact are fetched before the write.
- The artifact trace has no unresolved semantic, stale-support, authority, or material visual blocker.
- Attachments and linked assets have a verified lifecycle, accessible alternative text, and a planned final locator.

## No-Write Outcome

If a destination or action authorization is absent, produce a plan that lists the missing preconditions and stop. Do not invoke an external destination tool, infer a workspace, create a draft, or record a final locator.
