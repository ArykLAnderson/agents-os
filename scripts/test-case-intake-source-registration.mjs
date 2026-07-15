#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const fixtureDir = path.join(root, "src/skills/case-intake/resources/fixtures/source-bundles/mixed-intake");
const manifest = JSON.parse(await readFile(path.join(fixtureDir, "manifest.json"), "utf8"));
const expected = await readFile(path.join(fixtureDir, "expected-sources.md"), "utf8");

const errors = [];

function fail(message) {
  errors.push(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

assert(Array.isArray(manifest.artifacts), "manifest.artifacts must be an array");
assert(manifest.artifacts.length === 8, "mixed-intake fixture should cover eight distinct artifacts");

const sourceHeadings = [...expected.matchAll(/^### (SRC-\d{3}): (.+)$/gm)];
assert(sourceHeadings.length === manifest.artifacts.length, "each manifest artifact must be registered as one SRC entry");
assert(!/^### (OBS|INT|DEC|REQ|CON|ALT|RISK|ASM|GAP|ACT|VIS)-\d{3}:/m.test(expected), "source registration must not create semantic entries");
assert(!/^# Entries$/m.test(expected), "source registration fixture must not include an Entries section");

const requiredFields = ["kind", "title", "location", "captured", "source_updated", "source_status"];

for (const [index, artifact] of manifest.artifacts.entries()) {
  const expectedId = `SRC-${String(index + 1).padStart(3, "0")}`;
  const heading = sourceHeadings[index];
  assert(heading?.[1] === expectedId, `artifact ${artifact.id} should use stable ID ${expectedId}`);
  assert(heading?.[2] === artifact.title, `artifact ${artifact.id} heading should use the artifact title`);

  for (const field of requiredFields) {
    assert(artifact[field], `artifact ${artifact.id} must include ${field}`);
  }

  assert(expected.includes(`- **Kind:** ${artifact.kind}`), `expected sources should preserve kind for ${artifact.id}`);
  assert(expected.includes(`- **Title:** ${artifact.title}`), `expected sources should preserve title for ${artifact.id}`);
  assert(expected.includes(`- **Location:** ${artifact.location}`), `expected sources should preserve location for ${artifact.id}`);
  assert(expected.includes(`- **Captured:** ${artifact.captured}`), `expected sources should preserve capture date for ${artifact.id}`);
  assert(expected.includes(`- **Source updated:** ${artifact.source_updated}`), `expected sources should preserve source update value for ${artifact.id}`);
  assert(expected.includes(`- **Source status:** ${artifact.source_status}`), `expected sources should preserve source status for ${artifact.id}`);

  if (artifact.reliability) {
    assert(expected.includes(`- **Reliability:** ${artifact.reliability}`), `expected sources should preserve reliability note for ${artifact.id}`);
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

const bundleTitleRegistered = sourceHeadings.some((heading) => heading[2] === manifest.title);
assert(!bundleTitleRegistered, "bundle-level title must not replace component source registration");

if (errors.length !== 0) {
  console.error(errors.map((error) => `ERROR ${error}`).join("\n"));
  process.exit(1);
}

console.log("case-intake source registration fixture: ok");
