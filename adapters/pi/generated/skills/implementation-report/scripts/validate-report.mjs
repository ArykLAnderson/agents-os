#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const input = process.argv[2];
if (!input || input === "--help" || input === "-h") {
  process.stdout.write("Usage: node scripts/validate-report.mjs <report.html>\n");
  process.exit(input ? 0 : 2);
}

const reportPath = path.resolve(input);
const reportDir = path.dirname(reportPath);
const errors = [];
const warnings = [];

if (!fs.existsSync(reportPath)) {
  process.stderr.write(`Report does not exist: ${reportPath}\n`);
  process.exit(2);
}

const html = fs.readFileSync(reportPath, "utf8");

function attributes(source) {
  const result = new Map();
  const matcher = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  for (const match of source.matchAll(matcher)) {
    result.set(match[1].toLowerCase(), match[2] ?? match[3] ?? "");
  }
  return result;
}

const ids = new Map();
for (const match of html.matchAll(/\bid\s*=\s*(?:"([^"]+)"|'([^']+)')/gi)) {
  const id = match[1] ?? match[2];
  ids.set(id, (ids.get(id) ?? 0) + 1);
}
for (const [id, count] of ids) {
  if (count > 1) errors.push(`Duplicate id "${id}" appears ${count} times.`);
}

const images = [...html.matchAll(/<img\b([^>]*)>/gi)];
for (const image of images) {
  const attrs = attributes(image[1]);
  if (!attrs.has("src") || !attrs.get("src")?.trim()) {
    errors.push("An <img> is missing a non-empty src attribute.");
  }
  if (!attrs.has("alt") || !attrs.get("alt")?.trim()) {
    errors.push(`Image ${attrs.get("src") || "[unknown]"} is missing non-empty alt text.`);
  }
}

const headings = [...html.matchAll(/<h([1-6])\b/gi)].map((match) => Number(match[1]));
if (!headings.includes(1)) warnings.push("No <h1> heading found.");
for (let index = 1; index < headings.length; index += 1) {
  if (headings[index] - headings[index - 1] > 1) {
    errors.push(`Heading level skips from h${headings[index - 1]} to h${headings[index]}.`);
  }
}

if (!/<style\b/i.test(html)) warnings.push("No embedded <style> element found.");
if (/<link\b[^>]*rel\s*=\s*["']stylesheet["']/i.test(html)) {
  warnings.push("External or linked stylesheet detected; verify the report remains portable.");
}
if (/<script\b[^>]*src\s*=/i.test(html)) {
  warnings.push("External script source detected; verify the report remains portable and safe offline.");
}

const refs = [];
for (const match of html.matchAll(/<(?:a|img|source|link|script)\b([^>]*)>/gi)) {
  const attrs = attributes(match[1]);
  for (const name of ["href", "src", "srcset"]) {
    const value = attrs.get(name);
    if (!value) continue;
    if (name === "srcset") {
      for (const candidate of value.split(",")) refs.push(candidate.trim().split(/\s+/)[0]);
    } else {
      refs.push(value);
    }
  }
}

const evidenceJson = new Set();
const svgFiles = new Set();
for (const rawRef of refs) {
  if (!rawRef || /^(?:https?:|mailto:|data:|javascript:)/i.test(rawRef)) continue;
  if (rawRef.startsWith("#")) {
    const fragment = decodeURIComponent(rawRef.slice(1));
    if (fragment && !ids.has(fragment)) errors.push(`Missing local fragment target: ${rawRef}`);
    continue;
  }

  let decoded;
  try {
    decoded = decodeURIComponent(rawRef.split("#")[0].split("?")[0]);
  } catch {
    errors.push(`Reference is not valid percent-encoding: ${rawRef}`);
    continue;
  }
  if (!decoded) continue;
  if (path.isAbsolute(decoded)) {
    errors.push(`Non-portable absolute local reference: ${rawRef}`);
    continue;
  }

  const resolved = path.resolve(reportDir, decoded);
  if (!fs.existsSync(resolved)) {
    errors.push(`Missing local reference: ${rawRef}`);
    continue;
  }
  if (resolved.endsWith(".json")) evidenceJson.add(resolved);
  if (resolved.endsWith(".svg")) svgFiles.add(resolved);
}

for (const jsonPath of evidenceJson) {
  try {
    JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  } catch (error) {
    errors.push(`Invalid JSON evidence ${path.relative(reportDir, jsonPath)}: ${error.message}`);
  }
}

for (const svgPath of svgFiles) {
  const svg = fs.readFileSync(svgPath, "utf8");
  if (!/<svg\b/i.test(svg) || !/<\/svg>\s*$/i.test(svg.trim())) {
    errors.push(`SVG does not contain a complete <svg> root: ${path.relative(reportDir, svgPath)}`);
  }
}

const summary = {
  report: reportPath,
  bytes: Buffer.byteLength(html),
  ids: ids.size,
  headings: headings.length,
  images: images.length,
  references: refs.length,
  jsonEvidence: evidenceJson.size,
  svgAssets: svgFiles.size,
  warnings: warnings.length,
  errors: errors.length,
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
for (const warning of warnings) process.stdout.write(`WARN: ${warning}\n`);
for (const error of errors) process.stderr.write(`ERROR: ${error}\n`);

process.exit(errors.length ? 1 : 0);
