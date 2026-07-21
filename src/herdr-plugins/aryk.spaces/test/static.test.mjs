import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const agentOs=path.resolve(root,"../../..");

test("manifest action opens one popup and portable source config exposes described qualified prefix+o",()=>{
  const manifest=fs.readFileSync(path.join(root,"herdr-plugin.toml"),"utf8");assert.match(manifest,/1f2487554b9fd42118f9e99ee06eb558bbb2391f/);assert.match(manifest,/id = "open-spaces"[\s\S]*command = \["node", "index\.mjs", "action"\]/);assert.match(manifest,/id = "spaces"[\s\S]*placement = "popup"[\s\S]*command = \["node", "index\.mjs", "picker"\]/);
  const text=fs.readFileSync(path.join(agentOs,"src/skills/herdr-session-navigation/examples/config.toml"),"utf8");assert.match(text,/key = "prefix\+o"\s+type = "plugin_action"\s+command = "aryk\.spaces\.open-spaces"\s+description = "open unified spaces"/m);assert.match(text,/open_notification_target/);
});

test("plugin relocates and runtime entrypoint executes without imports outside root",async()=>{
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),"aryk-spaces-relocated-")),relocated=path.join(temp,"aryk.spaces");fs.cpSync(root,relocated,{recursive:true});
  const runtime=await import(`${pathToFileURL(path.join(relocated,"lib/runtime.mjs")).href}?r=1`);assert.equal(runtime.defaultConfig({HOME:"/tmp/home"}).schemaVersion,1);
  const result=spawnSync(process.execPath,[path.join(relocated,"index.mjs"),"invalid"],{encoding:"utf8",env:{...process.env,HOME:"/tmp/home"}});assert.equal(result.status,1);assert.match(result.stderr,/invalid aryk\.spaces entrypoint/);
  for(const file of fs.readdirSync(path.join(relocated,"lib"))){const text=fs.readFileSync(path.join(relocated,"lib",file),"utf8");assert.doesNotMatch(text,/aryk\.pins|herdr-session-navigation|\.\.\/\.\.\//);}
});

test("docs check and link both source plugins",()=>{const skill=fs.readFileSync(path.join(agentOs,"src/skills/herdr-session-navigation/README.md"),"utf8");assert.match(skill,/aryk\.pins\/herdr-plugin\.toml/);assert.match(skill,/aryk\.spaces\/herdr-plugin\.toml/);assert.match(skill,/prefix\+o[\s\S]*open_notification_target[\s\S]*prefix\+g/);});

test("no destructive commands or lifecycle exports",()=>{const files=["herdr-plugin.toml","index.mjs",...fs.readdirSync(path.join(root,"lib")).map(x=>`lib/${x}`)];const text=files.map(x=>fs.readFileSync(path.join(root,x),"utf8")).join("\n");assert.doesNotMatch(text,/workspace\s*[",]\s*(close|remove|delete)|plugin\s*[",]\s*(link|unlink)|child_process\.(exec|execSync)|\bshell:\s*true\b/);assert.doesNotMatch(text,/startSteward|mutateCasebook|deleteWorkspace|closeWorkspace/);});
