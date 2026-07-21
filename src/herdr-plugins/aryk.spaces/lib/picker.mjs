import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline/promises";
import { sanitize } from "./core.mjs";
async function defaultExecutor(executable,args,options={}){return await new Promise((resolve,reject)=>{const child=spawn(executable,args,{...options,stdio:options.stdio??["pipe","pipe","inherit"]});let stdout="";if(child.stdout)child.stdout.setEncoding("utf8").on("data",c=>stdout+=c);child.once("error",reject);child.once("close",status=>resolve({status,stdout}));if(options.input!=null){child.stdin.end(options.input);} });}
export async function findExecutable(name,env=process.env){for(const dir of (env.PATH??"").split(path.delimiter).filter(Boolean)){const candidate=path.join(dir,name);try{await fs.access(candidate,fs.constants.X_OK);return candidate;}catch{}}return null;}
export function renderRow(row){return [row.key,row.source,row.state,sanitize(row.display),sanitize(row.path??row.canonicalId??row.workspaceId??"")].join("\t");}
export function parseFzfSelection(output,rows){const line=String(output).split(/\r?\n/,1)[0],key=line.split("\t",1)[0];const match=rows.find(row=>row.key===key);if(!match)throw new Error("fzf returned an unknown selection");return match;}
export async function chooseRow(rows,{findExecutable:find=findExecutable,executor=defaultExecutor,input=process.stdin,output=process.stdout,ask}={}){
  if(!rows.length)return{status:"refused",message:"No spaces are available."}; const fzf=await find("fzf");
  if(fzf){const result=await executor(fzf,["--delimiter=\\t","--with-nth=2..","--no-multi","--layout=reverse","--prompt=Space> ","--header=Source  State  Name  Path"],{shell:false,input:`${rows.map(renderRow).join("\n")}\n`,stdio:["pipe","pipe","inherit"]});if(result.status===130||result.status===1)return{status:"cancelled"};if(result.status!==0)return{status:"refused",message:`fzf failed (exit ${result.status})`};return{status:"selected",row:parseFzfSelection(result.stdout,rows)};}
  if(!input.isTTY||!output.isTTY)return{status:"refused",message:"fzf is unavailable and no interactive terminal fallback is available."};
  output.write("fzf unavailable; deterministic line picker:\n");rows.forEach((row,i)=>output.write(`${i+1}. ${row.source.padEnd(8)} ${row.state.padEnd(9)} ${sanitize(row.display)}  ${sanitize(row.path??"")}\n`));
  let answer;if(ask)answer=await ask();else{const rl=readline.createInterface({input,output});try{answer=await rl.question("Select number (blank cancels): ");}finally{rl.close();}}
  if(!String(answer).trim())return{status:"cancelled"};const index=Number(answer)-1;if(!Number.isInteger(index)||!rows[index])return{status:"refused",message:"Invalid line selection."};return{status:"selected",row:rows[index]};
}
export async function previewPath(target,{findExecutable:find=findExecutable,executor=defaultExecutor}={}){for(const [tool,args] of [["eza",["--tree","--level=2","--",target]],["fd",["--max-depth","2","--base-directory",target,"."]]]){const executable=await find(tool);if(executable){const result=await executor(executable,args,{shell:false,stdio:["ignore","pipe","ignore"]});if(result.status===0)return sanitize(result.stdout);}}return`Path: ${sanitize(target)}\nShallow preview unavailable (install eza or fd).`;}
