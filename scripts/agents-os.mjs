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
else {
  console.error("Usage: node scripts/agents-os.mjs <sync|doctor>");
  process.exitCode = 2;
}
