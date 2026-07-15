#!/usr/bin/env node

import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const src = path.join(root, "src");
const config = JSON.parse(await readFile(path.join(root, "config/targets.json"), "utf8"));
const models = JSON.parse(await readFile(path.join(root, "config/models.json"), "utf8"));
const header = config.generatedHeader;
const layouts = {
  pi: { agents: "agents", commands: "commands", skills: "skills" },
  codex: { agents: "agents", commands: "commands", skills: "skills" },
  opencode: { agents: "agent", commands: "command", skills: "skills" },
};

function splitFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { fields: [], body: text };
  const fields = match[1].split("\n").map((line) => {
    const i = line.indexOf(":");
    return i < 0 ? [line, ""] : [line.slice(0, i), line.slice(i + 1).trim()];
  });
  return { fields, body: match[2] };
}

function unquote(value) {
  if (/^(["']).*\1$/.test(value)) return value.slice(1, -1);
  return value;
}

function quote(value) {
  return JSON.stringify(unquote(value));
}

function resolveTier(value, target) {
  let tier = unquote(value || models.adapters[target].default);
  tier = models.aliases[tier] || tier;
  return models.adapters[target][tier] || tier;
}

function runtimeContext(target) {
  return `## Adapter Runtime Context\n\nThis agent was generated for ${target} from the ${config.scope} Agent OS source root. Before following legacy harness-specific path references, read this adapter's generated memory bundle at ./memory/MEMORY_BUNDLE.md when available. Treat references to old harness config directories as provenance from the original system unless this generated adapter explicitly installs files there.`;
}

function renderAgent(text, target) {
  const { fields, body } = splitFrontmatter(text);
  const data = Object.fromEntries(fields);
  const readOnly = /Write|Edit|NotebookEdit/i.test(data.disallowedTools || "");
  let lines;
  if (target === "opencode") {
    lines = [
      ["description", quote(data.description || "")],
      ["mode", "subagent"],
      ["model", quote(resolveTier(data.model, target))],
      ["temperature", "0.3"],
    ];
    const canWrite = !readOnly;
    lines.push(["tools", ""]);
    lines.push(["  read", "true"], ["  write", String(canWrite)], ["  edit", String(canWrite)], ["  bash", "true"]);
  } else if (target === "pi") {
    lines = fields
      .filter(([key]) => !["disallowedTools", "maxTurns", "color", "tools"].includes(key))
      .map(([key, value]) => [key, key === "model" ? quote(resolveTier(value, target)) : quote(value)]);
    const tools = readOnly ? "read, grep, find, ls" : unquote(data.tools || "read, write, edit, grep, find, ls, bash").toLowerCase();
    lines.push(["tools", quote(tools)]);
  } else {
    lines = fields.map(([key, value]) => [key, quote(key === "model" ? resolveTier(value, target) : value)]);
  }
  const yaml = lines.map(([key, value]) => value === "" ? `${key}:` : `${key}: ${value}`).join("\n");
  return `---\n${yaml}\n---\n\n${header}\n\n${runtimeContext(target)}\n\n${body.trimStart()}`;
}

function addHeader(text) {
  const { fields, body } = splitFrontmatter(text);
  if (!fields.length) return `${header}\n\n${text}`;
  const yaml = fields.map(([key, value]) => value === "" ? key : `${key}: ${value}`).join("\n");
  return `---\n${yaml}\n---\n\n${header}\n\n${body.trimStart()}`;
}

async function exists(file) {
  try { await stat(file); return true; } catch { return false; }
}

async function filesUnder(dir) {
  if (!(await exists(dir))) return [];
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await filesUnder(file));
    else out.push(file);
  }
  return out;
}

async function renderTarget(target, destination, clean = true) {
  const layout = layouts[target];
  if (!layout) throw new Error(`Unsupported target: ${target}`);
  await mkdir(destination, { recursive: true });
  for (const kind of ["agents", "commands", "skills"]) {
    const out = path.join(destination, layout[kind]);
    if (clean) await rm(out, { recursive: true, force: true });
    await mkdir(out, { recursive: true });
  }

  for (const file of await filesUnder(path.join(src, "agents"))) {
    const rel = path.relative(path.join(src, "agents"), file);
    const text = await readFile(file, "utf8");
    await writeFile(path.join(destination, layout.agents, rel), renderAgent(text, target));
  }
  for (const file of await filesUnder(path.join(src, "commands"))) {
    const rel = path.relative(path.join(src, "commands"), file);
    const out = path.join(destination, layout.commands, rel);
    await mkdir(path.dirname(out), { recursive: true });
    await writeFile(out, `${header}\n\n${await readFile(file, "utf8")}`);
  }
  for (const file of await filesUnder(path.join(src, "skills"))) {
    const rel = path.relative(path.join(src, "skills"), file);
    const out = path.join(destination, layout.skills, rel);
    await mkdir(path.dirname(out), { recursive: true });
    if (path.basename(file) === "SKILL.md") await writeFile(out, addHeader(await readFile(file, "utf8")));
    else await writeFile(out, await readFile(file));
  }
}

async function sync() {
  for (const target of config.targets) {
    await renderTarget(target, path.join(root, "adapters", target, "generated"));
    console.log(`synced ${target}`);
  }
}

function parseFixtureArgs(args) {
  const options = { root: process.env.AGENT_OS_DOCUMENT_SYSTEM_WORK_ROOT || "", artifact: "draft", proofCase: "C1-rfc" };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--root") options.root = args[++i] || "";
    else if (arg === "--artifact") options.artifact = args[++i] || "";
    else if (arg === "--proof-case") options.proofCase = args[++i] || "";
    else positional.push(arg);
  }
  return { positional, options };
}

function assertPortableSlug(value, label) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value || "")) throw new Error(`${label} must use only letters, numbers, dots, underscores, or dashes and must not start empty`);
}

function documentSystemFixturePaths(workRoot, caseSlug, artifactSlug, proofCase) {
  const base = path.join(workRoot, "document-system");
  const caseDir = path.join(base, "cases", caseSlug);
  const artifactDir = path.join(caseDir, "artifacts", artifactSlug);
  const proofDir = path.join(base, "proof-cases", proofCase);
  return {
    workRoot,
    base,
    caseDir,
    artifactDir,
    proofDir,
    dirs: [
      path.join(caseDir, "sources"),
      path.join(caseDir, "sources", "bundles"),
      path.join(caseDir, "queue"),
      path.join(caseDir, "snapshots"),
      artifactDir,
      path.join(artifactDir, "assets"),
      path.join(artifactDir, "reviews"),
      path.join(artifactDir, "publish"),
      path.join(proofDir, "sources"),
      path.join(proofDir, "case"),
      path.join(proofDir, "baseline"),
      path.join(proofDir, "candidate"),
      path.join(proofDir, "candidate", "visual-specs"),
      path.join(proofDir, "candidate", "assets"),
      path.join(proofDir, "reviews"),
      path.join(proofDir, "checks"),
    ],
    files: [
      path.join(caseDir, "CASE.md"),
      path.join(caseDir, "queue", "author-review.md"),
      path.join(artifactDir, "artifact.md"),
      path.join(artifactDir, "artifact.trace.md"),
      path.join(artifactDir, "artifact.notion.md"),
      path.join(artifactDir, "artifact.html"),
      path.join(proofDir, "case", "CASE.md"),
      path.join(proofDir, "candidate", "selection-manifest.md"),
      path.join(proofDir, "candidate", "artifact.md"),
      path.join(proofDir, "candidate", "artifact.trace.md"),
      path.join(proofDir, "candidate", "artifact.notion.md"),
      path.join(proofDir, "candidate", "artifact.html"),
      path.join(proofDir, "checks", "trace-coverage.md"),
      path.join(proofDir, "checks", "trace-maintenance.md"),
      path.join(proofDir, "checks", "concision-review.md"),
      path.join(proofDir, "checks", "reader-test.md"),
      path.join(proofDir, "checks", "presentation-check.md"),
      path.join(proofDir, "checks", "author-burden.md"),
      path.join(proofDir, "checks", "safe-publish.md"),
      path.join(proofDir, "checks", "post-publish-verification.md"),
      path.join(proofDir, "decision.md"),
    ],
  };
}

function resolveDocumentSystemWorkRoot(configuredRoot) {
  return path.resolve(configuredRoot || path.join(root, ".agent-os", "document-system-work"));
}

function placeholderFor(file, caseSlug, artifactSlug, proofCase) {
  const name = path.basename(file);
  if (name === "CASE.md") {
    return `---\nmodel_contract: case-model/v1\ninitiative_id: ${caseSlug}\nworking_state: fixture\ncurrent_snapshot: none\n---\n\n# Sources\n\n# Type Extensions\n\nNo extensions.\n\n# Entries\n\n# Snapshots\n`;
  }
  if (name === "author-review.md") return `# Author Review Queue\n\nFixture queue for ${caseSlug}.\n`;
  if (name === "selection-manifest.md") return `# Selection Manifest\n\n- **Proof case:** ${proofCase}\n- **Case:** ${caseSlug}\n- **Artifact:** ${artifactSlug}\n`;
  if (name === "artifact.trace.md") return `# Artifact Trace\n\n- **Case:** ${caseSlug}\n- **Artifact:** ${artifactSlug}\n- **Snapshot set:** fixture only\n`;
  if (name === "artifact.html") return "<!doctype html>\n<html lang=\"en\">\n<head><meta charset=\"utf-8\"><title>Fixture Artifact</title></head>\n<body><main><h1>Fixture Artifact</h1></main></body>\n</html>\n";
  return `# ${name.replace(/[-.]/g, " ")}\n\nFixture placeholder for ${caseSlug}.\n`;
}

async function initDocumentSystemFixture(args) {
  const { positional, options } = parseFixtureArgs(args);
  const caseSlug = positional[0];
  assertPortableSlug(caseSlug, "case slug");
  assertPortableSlug(options.artifact, "artifact slug");
  assertPortableSlug(options.proofCase, "proof case");
  const paths = documentSystemFixturePaths(resolveDocumentSystemWorkRoot(options.root), caseSlug, options.artifact, options.proofCase);
  for (const dir of paths.dirs) await mkdir(dir, { recursive: true });
  for (const file of paths.files) {
    if (!(await exists(file))) await writeFile(file, placeholderFor(file, caseSlug, options.artifact, options.proofCase));
  }
  console.log(JSON.stringify({ status: "initialized", workRoot: paths.workRoot, caseDir: paths.caseDir, artifactDir: paths.artifactDir, proofDir: paths.proofDir }, null, 2));
}

async function inspectDocumentSystemFixture(args) {
  const { positional, options } = parseFixtureArgs(args);
  const caseSlug = positional[0];
  assertPortableSlug(caseSlug, "case slug");
  assertPortableSlug(options.artifact, "artifact slug");
  assertPortableSlug(options.proofCase, "proof case");
  const paths = documentSystemFixturePaths(resolveDocumentSystemWorkRoot(options.root), caseSlug, options.artifact, options.proofCase);
  const missing = [];
  for (const dir of paths.dirs) if (!(await exists(dir))) missing.push(path.relative(paths.workRoot, dir) + "/");
  for (const file of paths.files) if (!(await exists(file))) missing.push(path.relative(paths.workRoot, file));
  if (missing.length) {
    console.error(JSON.stringify({ status: "missing", workRoot: paths.workRoot, missing }, null, 2));
    process.exitCode = 1;
  } else console.log(JSON.stringify({ status: "ok", workRoot: paths.workRoot, caseDir: paths.caseDir, artifactDir: paths.artifactDir, proofDir: paths.proofDir }, null, 2));
}

async function documentSystemFixture(args) {
  const action = args[0];
  const rest = args.slice(1);
  if (action === "init") await initDocumentSystemFixture(rest);
  else if (action === "inspect") await inspectDocumentSystemFixture(rest);
  else {
    console.error("Usage: node scripts/agents-os.mjs document-system-fixture <init|inspect> <case-slug> [--root <path>] [--artifact <artifact-slug>] [--proof-case <case-id>]");
    process.exitCode = 2;
  }
}

async function doctor() {
  const problems = [];
  for (const target of config.targets) {
    const layout = layouts[target];
    const base = path.join(root, "adapters", target, "generated");
    for (const kind of ["agents", "commands", "skills"]) {
      const dir = path.join(base, layout[kind]);
      if (!(await exists(dir))) problems.push(`${target}: missing ${layout[kind]}/`);
    }
    for (const file of await filesUnder(path.join(src, "skills"))) {
      const rel = path.relative(path.join(src, "skills"), file);
      const generated = path.join(base, layout.skills, rel);
      if (!(await exists(generated))) problems.push(`${target}: missing skill file ${rel}`);
      else if (path.basename(file) === "SKILL.md" && !(await readFile(generated, "utf8")).includes(header)) problems.push(`${target}: missing generated header in ${rel}`);
    }
    const sourceNames = new Set((await readdir(path.join(src, "skills"), { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name));
    for (const entry of await readdir(path.join(base, layout.skills), { withFileTypes: true })) {
      if (entry.isDirectory() && !sourceNames.has(entry.name)) problems.push(`${target}: stale generated skill ${entry.name}`);
    }
  }
  if (problems.length) {
    console.error(problems.map((p) => `ERROR ${p}`).join("\n"));
    process.exitCode = 1;
  } else console.log(`doctor: ok (${config.targets.join(", ")})`);
}

const command = process.argv[2];
if (command === "sync") await sync();
else if (command === "doctor") await doctor();
else if (command === "document-system-fixture") await documentSystemFixture(process.argv.slice(3));
else {
  console.error("Usage: node scripts/agents-os.mjs <sync|doctor|document-system-fixture>");
  process.exitCode = 2;
}
