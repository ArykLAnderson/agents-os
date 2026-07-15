#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const fixtureDir = path.join(root, "src/skills/case-intake/resources/fixtures/source-bundles/mixed-intake");
const manifest = JSON.parse(await readFile(path.join(fixtureDir, "manifest.json"), "utf8"));
const expected = await readFile(path.join(fixtureDir, "expected-sources.md"), "utf8");
const generatedTargets = ["pi", "codex", "opencode"];

const errors = [];

function fail(message) {
  errors.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

assert(Array.isArray(manifest.artifacts), "manifest.artifacts must be an array");
assert(manifest.artifacts.length === 8, "mixed-intake fixture should cover eight distinct artifacts");

function parseSourceBlocks(markdown) {
  const headings = [...markdown.matchAll(/^### (SRC-\d{3}): (.+)$/gm)];
  return headings.map((heading, index) => {
    const bodyStart = heading.index + heading[0].length;
    const bodyEnd = index + 1 < headings.length ? headings[index + 1].index : markdown.length;
    const fields = new Map();
    for (const field of markdown.slice(bodyStart, bodyEnd).matchAll(/^- \*\*(.+?):\*\* (.+)$/gm)) {
      fields.set(field[1], field[2]);
    }
    return { id: heading[1], label: heading[2], fields };
  });
}

async function filesUnder(dir) {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(file));
    else files.push(file);
  }
  return files;
}

const sourceBlocks = parseSourceBlocks(expected);
assert(sourceBlocks.length === manifest.artifacts.length, "each manifest artifact must be registered as one SRC entry");
assert(!/^### (OBS|INT|DEC|REQ|CON|ALT|RISK|ASM|GAP|ACT|VIS)-\d{3}:/m.test(expected), "source registration must not create semantic entries");
assert(!/^# Entries$/m.test(expected), "source registration fixture must not include an Entries section");

const fieldNames = {
  kind: "Kind",
  title: "Title",
  location: "Location",
  captured: "Captured",
  source_updated: "Source updated",
  source_status: "Source status",
  reliability: "Reliability",
};
const requiredFields = Object.entries(fieldNames).filter(([field]) => field !== "reliability");

for (const [index, artifact] of manifest.artifacts.entries()) {
  const expectedId = `SRC-${String(index + 1).padStart(3, "0")}`;
  const source = sourceBlocks[index];
  assert(source?.id === expectedId, `artifact ${artifact.id} should use stable ID ${expectedId}`);
  assert(source?.label === artifact.title, `artifact ${artifact.id} heading should use the artifact title`);

  for (const [field, sourceField] of requiredFields) {
    assert(artifact[field], `artifact ${artifact.id} must include ${field}`);
    assert(source?.fields.has(sourceField), `${expectedId} must include canonical ${sourceField} field`);
    assert(source?.fields.get(sourceField) === artifact[field], `${expectedId} ${sourceField} must belong to ${artifact.id}`);
  }

  if (artifact.reliability) {
    assert(source?.fields.has(fieldNames.reliability), `${expectedId} must include a material Reliability field`);
    assert(source?.fields.get(fieldNames.reliability) === artifact.reliability, `${expectedId} Reliability must belong to ${artifact.id}`);
  }
}

const kinds = new Set(manifest.artifacts.map((artifact) => artifact.kind));
for (const kind of ["current-conversation", "meeting-transcript", "existing-document", "tracker-item", "code-reference", "metric-set", "research-output", "unavailable-source"]) {
  assert(kinds.has(kind), `fixture should include ${kind}`);
}

const unavailable = manifest.artifacts.find((artifact) => artifact.kind === "unavailable-source");
assert(unavailable, "fixture should include an inaccessible source");
assert(unavailable?.location.startsWith("local/unavailable:"), "inaccessible source should use local/unavailable location");
assert(/limited reliability|inaccessible|no content is inferred/i.test(unavailable?.reliability || ""), "inaccessible source should declare limited reliability and no inferred content");

const bundleTitleRegistered = sourceBlocks.some((source) => source.label === manifest.title);
assert(!bundleTitleRegistered, "bundle-level title must not replace component source registration");

const sourceResourcesRoot = path.join(root, "src/skills/case-intake/resources");
const sourceResourceFiles = await filesUnder(sourceResourcesRoot);
for (const target of generatedTargets) {
  const generatedRoot = path.join(root, "adapters", target, "generated/skills/case-intake");
  const generatedSkill = await readFile(path.join(generatedRoot, "SKILL.md"), "utf8");
  assert(generatedSkill.includes("<!-- Generated from Agent OS src by scripts/agents-os.mjs. Do not edit directly. -->"), `${target} generated skill must include its generated header`);
  assert(generatedSkill.includes("## Source Registration"), `${target} generated skill must include source registration instructions`);

  for (const sourceFile of sourceResourceFiles) {
    const relative = path.relative(sourceResourcesRoot, sourceFile);
    const generatedFile = path.join(generatedRoot, "resources", relative);
    try {
      const [sourceContent, generatedContent] = await Promise.all([readFile(sourceFile, "utf8"), readFile(generatedFile, "utf8")]);
      assert(generatedContent === sourceContent, `${target} generated ${relative} must match canonical source`);
    } catch (error) {
      fail(`${target} generated ${relative} must exist and match canonical source: ${error.message}`);
    }
  }
}

if (errors.length !== 0) {
  console.error(errors.map((error) => `ERROR ${error}`).join("\n"));
  process.exit(1);
}

console.log("case-intake source registration fixture: ok");
