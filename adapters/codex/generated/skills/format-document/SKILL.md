---
name: format-document
description: Render shaped, traced artifacts into selected target formats without changing accepted meaning. Use for Notion-native, portable Markdown, HTML companion, and visual target preparation before publishing.
user-invocable: true
argument-hint: "[shaped artifact] [target format]"
---

<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->

# Format Document

Express a shaped, traced artifact in a selected target format.

Formatting translates structure, disclosure, visuals, navigation, links, and accessibility affordances. It does not change established meaning, priority, authority, or reader action.

## Contract

- Load only the selected target adapter from `resources/adapters/`.
- Use visual resources from `resources/visuals/` only when the artifact requires visual companion work.
- Preserve critical decisions, risks, caveats, review asks, and searchable conclusions outside hidden-only structures.
- Ensure target output preserves reading order and meaning across expected viewport and accessibility constraints.
- Derive evidence backlinks from trace and source metadata rather than creating a second provenance system.
- Route semantic changes or unsupported visual implications to `case-reconcile`.

## Boundary

- Do not publish externally.
- Do not waive trace blockers, stale support, unsupported assertions, or authority conflicts.
- Do not hard-code a specific database placement, workspace, company, or personal path.
- Do not generate visuals that imply unsupported relationships.

## Progressive Resources

Initial target and visual skeletons live under `resources/adapters/` and `resources/visuals/`.
