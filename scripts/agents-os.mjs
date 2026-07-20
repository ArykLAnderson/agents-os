#!/usr/bin/env node

import { createHash } from "node:crypto";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const src = path.join(root, "src");
const config = JSON.parse(await readFile(path.join(root, "config/targets.json"), "utf8"));
const models = JSON.parse(await readFile(path.join(root, "config/models.json"), "utf8"));
const header = config.generatedHeader;
const home = process.env.HOME;
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

function excludedSkills(target) {
  return new Set(config.skillExcludes?.[target] || []);
}

function skillName(rel) {
  return rel.split(path.sep)[0];
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function aggregateContentDigest(assets) {
  const canonical = [...assets]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map(({ path: assetPath, sha256: digest }) => `${assetPath}\0${digest}\n`)
    .join("");
  return sha256(Buffer.from(canonical));
}

async function refreshGeneratedPackageManifests(skillsRoot) {
  for (const entry of await readdir(skillsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageRoot = path.join(skillsRoot, entry.name);
    const manifestPath = path.join(packageRoot, "manifest.json");
    if (!(await exists(manifestPath))) continue;
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    if (!Array.isArray(manifest.assets) || typeof manifest.content_digest?.sha256 !== "string") continue;
    const transformedAssets = manifest.assets.filter((asset) => path.basename(asset.path) === "SKILL.md");
    if (!transformedAssets.length) continue;
    for (const asset of transformedAssets) {
      const assetPath = path.resolve(packageRoot, asset.path);
      const relative = path.relative(packageRoot, assetPath);
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`Invalid generated package asset path: ${asset.path}`);
      asset.sha256 = sha256(await readFile(assetPath));
    }
    manifest.content_digest.sha256 = aggregateContentDigest(manifest.assets);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
}

function expandHome(file) {
  if (!file.startsWith("~/")) return file;
  if (!home) throw new Error("HOME is required to install global instructions");
  return path.join(home, file.slice(2));
}
async function renderTarget(target, destination, clean = true) {
  const layout = layouts[target];
  const excluded = excludedSkills(target);
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
    if (excluded.has(skillName(rel))) continue;
    const out = path.join(destination, layout.skills, rel);
    await mkdir(path.dirname(out), { recursive: true });
    if (path.basename(file) === "SKILL.md") await writeFile(out, addHeader(await readFile(file, "utf8")));
    else await writeFile(out, await readFile(file));
  }
  await refreshGeneratedPackageManifests(path.join(destination, layout.skills));

  const instructionsSource = path.join(src, "AGENTS.md");
  if (await exists(instructionsSource)) {
    const rendered = `${header}\n\n${await readFile(instructionsSource, "utf8")}`;
    await writeFile(path.join(destination, "AGENTS.md"), rendered);
    const installPath = config.globalInstructions?.[target];
    if (installPath) {
      const expanded = expandHome(installPath);
      await mkdir(path.dirname(expanded), { recursive: true });
      await writeFile(expanded, rendered);
    }
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
    const excluded = excludedSkills(target);
    const instructionsSource = path.join(src, "AGENTS.md");
    if (await exists(instructionsSource)) {
      const generated = path.join(base, "AGENTS.md");
      if (!(await exists(generated))) problems.push(`${target}: missing AGENTS.md`);
      else if (!(await readFile(generated, "utf8")).includes(header)) problems.push(`${target}: missing generated header in AGENTS.md`);
      const installPath = config.globalInstructions?.[target];
      if (installPath) {
        const installed = expandHome(installPath);
        if (!(await exists(installed))) problems.push(`${target}: missing installed global instructions at ${installPath}`);
        else if ((await readFile(installed, "utf8")) !== (await readFile(generated, "utf8"))) problems.push(`${target}: installed global instructions differ from generated AGENTS.md`);
      }
    }
    for (const kind of ["agents", "commands", "skills"]) {
      const dir = path.join(base, layout[kind]);
      if (!(await exists(dir))) problems.push(`${target}: missing ${layout[kind]}/`);
    }
    for (const file of await filesUnder(path.join(src, "skills"))) {
      const rel = path.relative(path.join(src, "skills"), file);
      if (excluded.has(skillName(rel))) continue;
      const generated = path.join(base, layout.skills, rel);
      if (!(await exists(generated))) problems.push(`${target}: missing skill file ${rel}`);
      else if (path.basename(file) === "SKILL.md" && !(await readFile(generated, "utf8")).includes(header)) problems.push(`${target}: missing generated header in ${rel}`);
    }
    const allSourceNames = new Set((await readdir(path.join(src, "skills"), { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name));
    for (const name of excluded) {
      if (!allSourceNames.has(name)) problems.push(`${target}: unknown excluded skill ${name}`);
    }
    const sourceNames = new Set([...allSourceNames].filter((name) => !excluded.has(name)));
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
