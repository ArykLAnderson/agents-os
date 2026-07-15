import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const fixture = path.join(process.cwd(), "src/skills/format-document/resources/fixtures/exercises/c4-retry-policy-formatting");

test("format-document fixture preserves critical meaning and HTML accessibility structure", async () => {
  for (const name of ["artifact.md", "artifact.notion.md"]) {
    const content = await readFile(path.join(fixture, name), "utf8");
    assert.match(content, /Do not state a (current )?retry count/);
    assert.match(content, /Validate a configuration against both required targets/);
    assert.match(content, /workload mix, traffic volume/);
  }

  const html = await readFile(path.join(fixture, "artifact.html"), "utf8");
  for (const fragment of [
    "<!doctype html>",
    '<html lang="en">',
    "<main>",
    "<h1>",
    '<nav aria-label="Document sections">',
    'id="recommendation"',
    'id="authority"',
    'id="evidence"',
    'id="limitations"',
    'id="boundary"',
    "<caption>",
    "Text equivalent:",
    "@media (max-width: 40rem)",
  ]) assert.ok(html.includes(fragment), `HTML is missing ${fragment}`);
  assert.match(html, /Do not state a current retry count/);
  assert.match(html, /Validate a configuration against both required targets/);
  assert.match(html, /lacks workload mix/);
});
