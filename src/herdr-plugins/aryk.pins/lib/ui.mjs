import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { reduceManagerState, renderManager } from "./model.mjs";
import { loadPins, loadRegistry, readStateJson, statePaths, transactionalPins } from "./storage.mjs";
import { createHerdrClient } from "./herdr-client.mjs";
import { PINNED_PROTOCOL } from "./model.mjs";

function actionFor(data) {
  if (data === "j" || data === "\u001b[B") return "down";
  if (data === "k" || data === "\u001b[A") return "up";
  if (data === "K") return "move-up";
  if (data === "J") return "move-down";
  if (data === "c") return "clear";
  if (data === "q" || data === "\u001b") return "exit";
  return null;
}
function keypress() { return new Promise((resolve) => process.stdin.once("data", data => resolve(String(data)))); }
function run(executable,args,options){return new Promise((resolve,reject)=>{const child=spawn(executable,args,{...options,shell:false,stdio:"inherit"});child.once("error",reject);child.once("close",resolve);});}
function displayFor(id,scope,registry,workspaces){if(!id)return"-\t[empty]";if(scope==="project"&&id.startsWith("herdr-workspace:")){const workspaceId=id.slice("herdr-workspace:".length),matches=workspaces.filter(workspace=>workspace.workspace_id===workspaceId);return matches.length===1?`${matches[0].label||workspaceId}\t[current]`:`${workspaceId}\t[unavailable]`;}const collection=scope==="project"?registry?.projects:registry?.sessions,claims=(collection??[]).filter(item=>item.canonicalId===id),state=claims.length===1?claims[0].reconciliationState:"unavailable";return`${id}\t[${state}]`;}
export function parseNvimPins(value,original){const lines=String(value).trimEnd().split(/\r?\n/);if(lines.length!==4)throw new Error("nvim pin manager returned an invalid slot count");const allowed=new Set(original.slots.filter(Boolean)),seen=new Set(),slots=lines.map(line=>{if(line==="empty")return null;if(!allowed.has(line)||seen.has(line))throw new Error("nvim pin manager returned an unknown or duplicate pin");seen.add(line);return line;});return{schemaVersion:1,slots};}
async function nvimManager(scope,file,registry,workspaces,env){const nvim=path.join("/opt/homebrew/bin","nvim"),config=path.join(env.XDG_CONFIG_HOME??path.join(env.HOME??os.homedir(),".config"),"nvim","herdr-pins.lua");try{await Promise.all([fs.access(nvim,fs.constants.X_OK),fs.access(config)]);}catch{return false;}const original=await loadPins(file),temp=await fs.mkdtemp(path.join(os.tmpdir(),"herdr-pins-"));try{const input=path.join(temp,"pins.tsv"),output=path.join(temp,"result");await fs.writeFile(input,`${original.slots.map(id=>`${id??"empty"}\t${displayFor(id,scope,registry,workspaces)}`).join("\n")}\n`,{mode:0o600});const status=await run(nvim,["--clean","-u",config],{env:{...env,HERDR_PINS_INPUT:input,HERDR_PINS_OUTPUT:output}});if(status!==0)throw new Error(`nvim pin manager failed (exit ${status})`);let result;try{result=await fs.readFile(output,"utf8");}catch(error){if(error.code==="ENOENT")return true;throw error;}const next=parseNvimPins(result,original);await transactionalPins(file,async current=>{if(JSON.stringify(current)!==JSON.stringify(original))throw new Error("pins changed while the manager was open");return{pins:next,result:next};});return true;}finally{await fs.rm(temp,{recursive:true,force:true});}}
export async function managerPane(scope, env = process.env) {
  const paths = statePaths(env); const file = scope === "project" ? paths.projects : paths.locals;
  let registry = null; try { registry = await loadRegistry(paths.registry); } catch {}
  let workspaces = [];
  if (scope === "project") {
    const route = registry?.route ?? { sessionName: "casebook-trial", configPath: env.HERDR_CONFIG_PATH, socketPath: env.HERDR_SOCKET_PATH, protocol: PINNED_PROTOCOL };
    try { workspaces = await createHerdrClient({ env, route }).listWorkspaces(); } catch {}
  }
  if(await nvimManager(scope,file,registry,workspaces,env))return;
  let state = { selected: 1, pins: await loadPins(file), exit: false };
  if (process.stdin.isTTY) process.stdin.setRawMode(true); process.stdin.resume();
  try {
    while (!state.exit) {
      process.stdout.write(`\u001b[2J\u001b[H${renderManager(scope, state.pins, registry, workspaces)}\nSelected: ${state.selected}\n`);
      const action = actionFor(await keypress()); if (!action) continue;
      if (["clear", "move-up", "move-down"].includes(action)) {
        state = await transactionalPins(file, async currentPins => {
          const next = reduceManagerState({ ...state, pins: currentPins }, action);
          return { pins: next.pins, result: next };
        });
      } else state = reduceManagerState(state, action);
    }
  } finally { if (process.stdin.isTTY) process.stdin.setRawMode(false); process.stdin.pause(); }
}
export async function resultPane(env = process.env) {
  const { result } = statePaths(env); let value;
  try { value = await readStateJson(result); } catch (error) { value = { status: "refused", message: `Result unavailable: ${error.message}` }; }
  process.stdout.write(`Herdr pins: ${value.status}\n\n${value.message}\n\nPress any key to close.\n`);
  if (process.stdin.isTTY) { process.stdin.setRawMode(true); process.stdin.resume(); try { await keypress(); } finally { process.stdin.setRawMode(false); process.stdin.pause(); } }
}
