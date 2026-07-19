import assert from "node:assert/strict";
import test from "node:test";
import {
  parseLegacyDiscoveryMarkdown,
  parseLegacyFrameMarkdown,
  renderL01DiscoveryMarkdown,
  renderL01FrameMarkdown,
} from "../variants/sqlite/lib/frame/index.mjs";

const frame = {
  id: "frame:11111111-1111-4111-8111-111111111111",
  home_namespace_id: "namespace:22222222-2222-4222-8222-222222222222",
  authority_scope_namespace_ids: ["namespace:22222222-2222-4222-8222-222222222222"],
  status: "active",
  title: "Bounded reconciliation",
  outcome: "Prepared only",
  included_scope: ["legacy parsing"],
  excluded_scope: ["writeback"],
  limitations: "No effects",
  completion_condition: "Evidence returned",
  discovery: [{
    id: "discovery:33333333-3333-4333-8333-333333333333",
    display_order: 0,
    lifecycle: "active",
    category: "frontier",
    title: "What changed?",
    body: "Compare immutable snapshots.",
    human_authority: "required",
    dependencies: [],
  }],
};

test("L03-W03 supported Frame and selected Discovery renderer parse completely", () => {
  const parsedFrame = parseLegacyFrameMarkdown(renderL01FrameMarkdown(frame));
  assert.deepEqual(parsedFrame.violations, []);
  assert.equal(parsedFrame.value.id, frame.id);
  assert.deepEqual(parsedFrame.value.authority_scope_namespace_ids, frame.authority_scope_namespace_ids);
  assert.equal(parsedFrame.value.completion_condition, frame.completion_condition);

  const parsedDiscovery = parseLegacyDiscoveryMarkdown(renderL01DiscoveryMarkdown(frame));
  assert.deepEqual(parsedDiscovery.violations, []);
  assert.deepEqual(parsedDiscovery.items, [{
    source_index: 0,
    display_label: "AT-001",
    title: "What changed?",
    body: "Compare immutable snapshots.",
    human_authority: "required",
    category: "frontier",
  }]);
});

test("L03-W03 renderer assigns strict sequential labels in grouped category order", () => {
  const categories = ["frontier", "out_of_scope", "fog", "contested", "blocked", "deferred"];
  const discovery = categories.map((category, index) => ({
    ...frame.discovery[0],
    id: `discovery:33333333-3333-4333-8${String(330 + index).padStart(3, "0")}-333333333333`,
    display_order: index,
    category,
    title: `${category} title`,
  }));
  const parsed = parseLegacyDiscoveryMarkdown(renderL01DiscoveryMarkdown({ ...frame, discovery }));
  assert.deepEqual(parsed.violations, []);
  assert.deepEqual(parsed.items.map((item) => [item.display_label, item.category, item.title]), [
    ["AT-001", "fog", "fog title"],
    ["AT-002", "frontier", "frontier title"],
    ["AT-003", "blocked", "blocked title"],
    ["AT-004", "contested", "contested title"],
    ["AT-005", "deferred", "deferred title"],
    ["AT-006", "out_of_scope", "out_of_scope title"],
  ]);
});

test("L03-W03 strict parsers return schema and renderer violations instead of accepting arbitrary Markdown", () => {
  assert.deepEqual(parseLegacyFrameMarkdown('{"id":"not-a-frame"}').violations, [
    { path: "documents.frame.md", rule: "frontmatter_required" },
  ]);
  const extra = renderL01FrameMarkdown(frame).replace('title: "Bounded reconciliation"', 'title: "Bounded reconciliation"\nextra: true');
  assert.equal(parseLegacyFrameMarkdown(extra).violations.some((item) => item.rule === "field_unsupported"), true);
  const wrongType = renderL01FrameMarkdown(frame).replace('## Outcome\n```json\n"Prepared only"', '## Outcome\n```json\n["Prepared only"]');
  assert.equal(parseLegacyFrameMarkdown(wrongType).violations.some((item) => item.path === "documents.frame.md.outcome" && item.rule === "optional_string_required"), true);

  const nullable = { ...frame, title: null, outcome: null, included_scope: null, excluded_scope: null, limitations: null, completion_condition: null };
  assert.deepEqual(parseLegacyFrameMarkdown(renderL01FrameMarkdown(nullable)).violations, []);

  const malformed = parseLegacyDiscoveryMarkdown("## Unknown\n\n### AT-001: \"x\"\n");
  assert.equal(malformed.violations.some((item) => item.rule === "category_heading_unsupported"), true);
  assert.equal(malformed.violations.some((item) => item.rule === "discovery_items_required"), true);
  const extraProse = renderL01DiscoveryMarkdown(frame).replace("### AT-001", "unexpected\n### AT-001");
  assert.equal(parseLegacyDiscoveryMarkdown(extraProse).violations.some((item) => item.rule === "renderer_structure_invalid"), true);
  const nonStringTitle = renderL01DiscoveryMarkdown(frame).replace(': "What changed?"', ": 42");
  assert.equal(parseLegacyDiscoveryMarkdown(nonStringTitle).violations.some((item) => item.rule === "title_json_string_required"), true);

  const renderedDiscovery = renderL01DiscoveryMarkdown(frame);
  for (const malformedBytes of [
    `\n${renderedDiscovery}`,
    `${renderedDiscovery}\n`,
    renderedDiscovery.replace("\n\n```json", "\n\n\n```json"),
  ]) assert.equal(parseLegacyDiscoveryMarkdown(malformedBytes).violations.some((item) => item.rule === "renderer_structure_invalid"), true);

  const renderedFrame = renderL01FrameMarkdown(frame);
  for (const malformedBytes of [
    `\n${renderedFrame}`,
    `${renderedFrame}\n`,
    renderedFrame.replace("```\n\n## Included Scope", "```\n\n\n## Included Scope"),
  ]) assert.equal(parseLegacyFrameMarkdown(malformedBytes).violations.some((item) => item.rule === "renderer_structure_invalid" || item.rule === "frontmatter_required"), true);
});
