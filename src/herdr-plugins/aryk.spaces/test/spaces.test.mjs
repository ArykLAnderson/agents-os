import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildRows, canonicalAllowedPath, planSelection, sanitize, validateRegistry } from "../lib/core.mjs";
import { createHerdrClient, parseWorkspaceListResponse } from "../lib/herdr.mjs";
import { atomicPendingEnrollment, readJson, savePlainBinding } from "../lib/io.mjs";
import { parseFzfSelection, chooseRow, previewPath } from "../lib/picker.mjs";
import { attestPlainBindings, discoverFolders, runPicker, zoxideFolders } from "../lib/runtime.mjs";

const route = { sessionName: "casebook-trial", configPath: "/cfg/casebook.toml", socketPath: "/run/herdr.sock", protocol: 17 };
const env = { HOME: "/home/a", XDG_CONFIG_HOME: "/cfg", XDG_STATE_HOME: "/state", HERDR_BIN_PATH: "/opt/herdr", HERDR_CONFIG_PATH: route.configPath, HERDR_SOCKET_PATH: route.socketPath };
const workspace = (id="ws-a", overrides={}) => ({ workspace_id:id, number:1, label:id, focused:false, pane_count:1, tab_count:1, active_tab_id:`${id}:t1`, agent_status:"idle", ...overrides });
const session = (overrides={}) => ({ canonicalId:"session:a", projectCanonicalId:"project:a", generation:1, reconciliationState:"current", role:"steward", officialPiSession:{source:"pi",agent:"pi",kind:"session_id",value:"official-a"}, binding:{workspaceId:"ws-a",tabId:"ws-a:t1",paneId:"pane-a",terminalId:"term-a"}, ...overrides });
const project = (overrides={}) => ({ canonicalId:"project:a", generation:1, reconciliationState:"current", stewardSessionCanonicalId:"session:a", displayName:"Alpha", declaredRoot:"/work/a", ...overrides });
const registry = (overrides={}) => ({ schemaVersion:1, route, projects:[project()], sessions:[session()], ...overrides });
const agent = (overrides={}) => ({ terminal_id:"term-a", agent_status:"idle", workspace_id:"ws-a", tab_id:"ws-a:t1", pane_id:"pane-a", focused:false, agent_session:{source:"pi",agent:"pi",kind:"session_id",value:"official-a"}, ...overrides });
const pane = (overrides={}) => ({ pane_id:"pane-a",terminal_id:"term-a",workspace_id:"ws-a",tab_id:"ws-a:t1",focused:true,cwd:"/work/a",agent_status:"idle",revision:0, ...overrides });
const receipt = (root="/work/a") => ({ workspace:workspace("new",{label:"plain:a",focused:true,active_tab_id:"new:t1"}), tab:{tab_id:"new:t1",workspace_id:"new",number:1,label:"1",focused:true,pane_count:1,agent_status:"idle"}, rootPane:pane({pane_id:"new:p1",terminal_id:"new-term",workspace_id:"new",tab_id:"new:t1",cwd:root}) });

test("semantic merge requires one exact official fresh agent attestation and dedupes its live row", () => {
  const live=[workspace("ws-a",{agent_status:"working",worktree:{repo_key:"r",repo_name:"r",repo_root:"/work",checkout_path:"/work/a",is_linked_worktree:false}})];
  let rows=buildRows({registry:registry(),liveWorkspaces:live,agents:[agent()],folders:[],plainBindings:{}});
  assert.equal(rows.filter(r=>r.workspaceId==="ws-a").length,1); assert.equal(rows[0].source,"Semantic"); assert.equal(rows[0].state,"working");
  rows=buildRows({registry:registry(),liveWorkspaces:live,agents:[agent({terminal_id:"wrong"})],folders:[],plainBindings:{}});
  assert.equal(rows.find(r=>r.canonicalId==="project:a").state,"stale"); assert.equal(rows.some(r=>r.source==="Live"),true);
  rows=buildRows({registry:registry(),liveWorkspaces:live,agents:[agent(),agent()],folders:[],plainBindings:{}});
  assert.equal(rows.find(r=>r.canonicalId==="project:a").state,"ambiguous");
});

test("semantic duplicate claims are ambiguous and project-workspace identity is injective", () => {
  const live=[workspace("ws-a"),workspace("ws-b")];
  assert.equal(buildRows({registry:registry({sessions:[session(),structuredClone(session())]}),liveWorkspaces:live,agents:[agent()]}).find(row=>row.canonicalId==="project:a").state,"ambiguous");
  const duplicate=session({binding:{workspaceId:"ws-b",tabId:"ws-b:t1",paneId:"pane-b",terminalId:"term-b"},officialPiSession:{source:"pi",agent:"pi",kind:"session_id",value:"official-b"}});
  assert.equal(buildRows({registry:registry({sessions:[session(),duplicate]}),liveWorkspaces:live,agents:[agent()]}).find(row=>row.canonicalId==="project:a").state,"ambiguous");
  const second=session({canonicalId:"session:b",binding:{workspaceId:"ws-b",tabId:"ws-b:t1",paneId:"pane-b",terminalId:"term-b"},officialPiSession:{source:"pi",agent:"pi",kind:"session_id",value:"official-b"}});
  assert.equal(buildRows({registry:registry({sessions:[session(),second]}),liveWorkspaces:live,agents:[agent()]}).find(row=>row.canonicalId==="project:a").state,"ambiguous");
  const crossProject={...second,projectCanonicalId:"project:b",binding:{...second.binding,workspaceId:"ws-a"}};
  const conflicting=registry({projects:[project(),project({canonicalId:"project:b",stewardSessionCanonicalId:"session:b"})],sessions:[session(),crossProject]});
  assert.equal(buildRows({registry:conflicting,liveWorkspaces:live,agents:[agent()]}).find(row=>row.canonicalId==="project:a").state,"ambiguous");
});

test("strict registry rejects coercion and cross-project workspace claims", () => {
  for(const bad of [
    registry({projects:[project({canonicalId:7})]}),
    registry({sessions:[session({officialPiSession:{source:"pi",agent:"pi",kind:"session_id",value:{bad:true}}})]}),
    registry({sessions:[session({binding:{workspaceId:7,tabId:"t",paneId:"p",terminalId:"term"}})]}),
  ]) assert.throws(()=>validateRegistry(bad),/required|binding/);
  const other=session({canonicalId:"session:b",projectCanonicalId:"project:b",officialPiSession:{source:"pi",agent:"pi",kind:"session_id",value:"official-b"},binding:{workspaceId:"ws-a",tabId:"ws-a:t2",paneId:"pane-b",terminalId:"term-b"}});
  assert.throws(()=>validateRegistry(registry({projects:[project(),project({canonicalId:"project:b",stewardSessionCanonicalId:"session:b"})],sessions:[session(),other]})),/cross-project workspace/);
});

test("display sanitizer strips every C0 control and DEL, including OSC ESC/BEL", () => {
  const dangerous="A\x00\x01\x07\x1b]52;c;payload\x07\x1fB\x7fC\t\n";
  const safe=sanitize(dangerous); assert.equal(/[\x00-\x1f\x7f]/.test(safe),false); assert.doesNotMatch(safe,/\]52|payload/);
});

test("folder containment uses physical paths and rejects prefix/symlink escapes", async () => {
  const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),"spaces-path-"))); const allowed=path.join(base,"allowed"),outside=path.join(base,"outside");
  await fs.mkdir(allowed);await fs.mkdir(outside);await fs.mkdir(`${allowed}-suffix`);await fs.symlink(outside,path.join(allowed,"escape"));
  assert.equal(await canonicalAllowedPath(allowed,[allowed]),allowed); await assert.rejects(canonicalAllowedPath(path.join(allowed,"escape"),[allowed]),/allowed roots/); await assert.rejects(canonicalAllowedPath(`${allowed}-suffix`,[allowed]),/allowed roots/);
});

test("pinned popup response is ok and exact popup argv is used", async () => {
  const calls=[];const client=createHerdrClient({env,route,executor:async(executable,args,options)=>{calls.push({executable,args,options});return{status:0,stdout:JSON.stringify({result:{type:"ok"}})};}});
  await client.openPicker();assert.deepEqual(calls[0].args,["--session","casebook-trial","plugin","pane","open","--plugin","aryk.spaces","--entrypoint","spaces","--placement","popup"]);assert.equal(calls[0].options.shell,false);
});

test("workspace list enforces pinned WorkspaceInfo schema", () => {
  const response=value=>JSON.stringify({result:{type:"workspace_list",workspaces:[value]}});
  for(const bad of [
    workspace(""),workspace("w1",{number:0}),workspace("w1",{pane_count:0}),workspace("w1",{tab_count:0}),workspace("w1",{active_tab_id:""}),
    workspace("w1",{focused:"yes"}),workspace("w1",{agent_status:"busy"}),workspace("w1",{tokens:{unsafe:7}}),workspace("w1",{tokens:null}),
  ])assert.throws(()=>parseWorkspaceListResponse(response(bad)),/workspace/);
  assert.throws(()=>parseWorkspaceListResponse(JSON.stringify({result:{type:"workspace_list",workspaces:[workspace("w1"),workspace("w1")]}})),/duplicate/);
  assert.equal(parseWorkspaceListResponse(response(workspace("w1",{tokens:{summary:"ready"}})))[0].tokens.summary,"ready");
});

test("focus/create/pane/agent clients use exact argv and validate complete relationships", async () => {
  const calls=[];const expected=receipt("/work/a");const outputs=[
    {result:{type:"agent_list",agents:[agent()]}},
    {result:{type:"pane_info",pane:pane()}},
    {result:{type:"workspace_info",workspace:workspace("ws-a",{focused:true})}},
    {result:{type:"workspace_created",workspace:expected.workspace,tab:expected.tab,root_pane:expected.rootPane}},
  ];
  const client=createHerdrClient({env,route,realpath:async x=>x,executor:async(executable,args,options)=>{calls.push({executable,args,options});return{status:0,stdout:JSON.stringify(outputs.shift())};}});
  assert.equal((await client.listAgents()).length,1);await client.getPane("pane-a");await client.focusWorkspace("ws-a");const created=await client.createWorkspace("/work/a","plain:a");assert.equal(created.rootPane.cwd,"/work/a");
  assert.deepEqual(calls.map(c=>c.args.slice(2)),[["agent","list"],["pane","get","pane-a"],["workspace","focus","ws-a"],["workspace","create","--cwd","/work/a","--label","plain:a","--focus"]]);assert.ok(calls.every(c=>c.executable==="/opt/herdr"&&c.options.shell===false));
  const malformed=[
    {...expected,tab:{...expected.tab,pane_count:0}},
    {...expected,tab:{...expected.tab,agent_status:"busy"}},
    {...expected,rootPane:{...expected.rootPane,revision:-1}},
    {...expected,rootPane:{...expected.rootPane,revision:"0"}},
    {...expected,rootPane:{...expected.rootPane,agent_status:"busy"}},
    {...expected,rootPane:{...expected.rootPane,tokens:{unsafe:7}}},
    {...expected,rootPane:{...expected.rootPane,state_labels:{mode:false}}},
  ];
  for(const value of malformed){const bad=createHerdrClient({env,route,realpath:async x=>x,executor:async()=>({status:0,stdout:JSON.stringify({result:{type:"workspace_created",workspace:value.workspace,tab:value.tab,root_pane:value.rootPane}})})});await assert.rejects(bad.createWorkspace("/work/a","plain:a"),/invalid/);}
  const unrelated=createHerdrClient({env,route,realpath:async x=>x,executor:async()=>({status:0,stdout:JSON.stringify({result:{type:"workspace_created",workspace:expected.workspace,tab:{...expected.tab,workspace_id:"other"},root_pane:expected.rootPane}})})});
  await assert.rejects(unrelated.createWorkspace("/work/a","plain:a"),/relationship/);
});

test("stale workspace ID reuse is ignored unless pane get reattests full receipt", async () => {
  const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),"spaces-attest-"))),root=path.join(base,"root"),other=path.join(base,"other");await fs.mkdir(root);await fs.mkdir(other);
  const stored={schemaVersion:2,bindings:{"ws-a":{workspaceId:"ws-a",tabId:"ws-a:t1",paneId:"pane-a",terminalId:"term-a",rootRealpath:root}}};
  const calls=[];const stale=await attestPlainBindings([workspace("ws-a")],stored,[base],{getPane:async id=>{calls.push(id);return pane({terminal_id:"reused-term",cwd:other});}});
  assert.deepEqual(stale,{});assert.deepEqual(calls,["pane-a"]);
  const valid=await attestPlainBindings([workspace("ws-a")],stored,[base],{getPane:async()=>pane({cwd:root})});assert.equal(valid["ws-a"],root);
});

test("pending enrollment is concurrent and crash-left lock fails closed without deletion", async () => {
  const dir=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),"spaces-pending-"))),file=path.join(dir,"pending.json");
  await Promise.all(["a","b","c"].map(canonicalProjectId=>atomicPendingEnrollment(file,{canonicalProjectId,requestedAt:"2026-01-01T00:00:00.000Z"})));
  assert.deepEqual((await readJson(file)).requests.map(x=>x.canonicalProjectId).sort(),["a","b","c"]);
  await fs.writeFile(`${file}.lock`,"held",{mode:0o600});await assert.rejects(atomicPendingEnrollment(file,{canonicalProjectId:"d",requestedAt:"2026-01-01T00:00:00.000Z"},{attempts:2,delayMs:1}),/lock unavailable/);assert.equal(await fs.readFile(`${file}.lock`,"utf8"),"held");
});

test("state reads/writes refuse symlink parents and full plain receipt is stored", async () => {
  const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),"spaces-state-"))),actual=path.join(base,"actual"),alias=path.join(base,"alias");await fs.mkdir(actual);await fs.symlink(actual,alias);
  await assert.rejects(savePlainBinding(path.join(alias,"plain.json"),{workspaceId:"w",tabId:"t",paneId:"p",terminalId:"term",rootRealpath:actual}),/symlink/);
  const file=path.join(actual,"plain.json");await savePlainBinding(file,{workspaceId:"w",tabId:"t",paneId:"p",terminalId:"term",rootRealpath:actual});const value=await readJson(file);assert.equal(value.schemaVersion,2);assert.equal(value.bindings.w.terminalId,"term");
});

test("discovery honors depth/ignores/symlinks and zoxide is argv-only and contained", async () => {
  const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),"spaces-discovery-"))),root=path.join(base,"root"),outside=path.join(base,"outside");await fs.mkdir(root);await fs.mkdir(outside);await fs.mkdir(path.join(root,"one"));await fs.mkdir(path.join(root,"one","two"));await fs.mkdir(path.join(root,"one","two","three"));await fs.mkdir(path.join(root,"node_modules"));await fs.symlink(outside,path.join(root,"link"));
  const found=await discoverFolders([{path:root,depth:2}],["node_modules"]);assert.deepEqual(found.map(x=>path.relative(root,x.path)),["","one",path.join("one","two")]);
  const calls=[];const rows=await zoxideFolders([{path:root}],{find:async()=>"/bin/zoxide",executor:async(exe,args,options)=>{calls.push({exe,args,options});return{status:0,stdout:`${path.join(root,"one")}\n${outside}\n`};}});assert.deepEqual(rows.map(x=>x.path),[path.join(root,"one")]);assert.deepEqual(calls[0].args,["query","-l"]);assert.equal(calls[0].options.shell,false);
});

test("fzf parsing prevents injection and missing fzf falls back or visibly refuses", async () => {
  const rows=[{key:"row-0001",source:"Folder",state:"unopened",display:"evil\x1b]52;x\x07\trow",path:"/safe"}];const rendered="row-0001\tFolder\tunopened\tevil ]52;x row\t/safe\n";assert.equal(parseFzfSelection(rendered,rows),rows[0]);assert.throws(()=>parseFzfSelection("row-9999\tFolder\tunopened\tx\t/safe\n",rows),/unknown/);
  assert.equal((await chooseRow(rows,{findExecutable:async()=>null,input:{isTTY:false},output:{isTTY:false}})).status,"refused");assert.equal((await chooseRow(rows,{findExecutable:async()=>null,input:{isTTY:true},output:{isTTY:true,write(){}},ask:async()=>"1"})).row,rows[0]);
});

test("preview sanitizes tool stdout and fallback targets before terminal output", async () => {const calls=[];const dangerous="tree\x1b]52;c;secret\x07\x07\x1b[31mred\x7f";const tool=await previewPath("/safe",{findExecutable:async n=>n==="eza"?"/bin/eza":null,executor:async(exe,args,options)=>{calls.push({exe,args,options});return{status:0,stdout:dangerous};}});assert.equal(/[\x00-\x1f\x7f]/.test(tool),false);assert.doesNotMatch(tool,/secret/);assert.deepEqual(calls[0].args,["--tree","--level=2","--","/safe"]);assert.equal(calls[0].options.shell,false);const fallback=await previewPath("/safe\x1b]52;c;fallback-secret\x07\x07\x1b[31m",{findExecutable:async()=>null});assert.equal(/[\x00-\x1f\x7f]/.test(fallback.replace("\n","")),false);assert.doesNotMatch(fallback,/fallback-secret/);assert.match(fallback,/Path: \/safe/);});

test("selection-time folder recheck happens before preview and blocks swapped symlink", async () => {
  const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),"spaces-toctou-"))),configHome=path.join(base,"config"),stateHome=path.join(base,"state"),root=path.join(base,"root"),folder=path.join(root,"folder"),outside=path.join(base,"outside");await fs.mkdir(folder,{recursive:true});await fs.mkdir(outside);await fs.mkdir(path.join(configHome,"herdr","trials","casebook"),{recursive:true});await fs.writeFile(path.join(configHome,"herdr","trials","casebook","spaces.json"),JSON.stringify({schemaVersion:1,roots:[{path:root,depth:1}],ignores:[],zoxide:false}));
  let previewed=false;const fake={listWorkspaces:async()=>[],listAgents:async()=>[],getPane:async()=>assert.fail(),focusWorkspace:async()=>assert.fail(),createWorkspace:async()=>assert.fail()};
  await assert.rejects(runPicker({env:{...env,HOME:base,XDG_CONFIG_HOME:configHome,XDG_STATE_HOME:stateHome},client:fake,choose:async rows=>{const row=rows.find(r=>r.path===folder);await fs.rm(folder,{recursive:true});await fs.symlink(outside,folder);return{status:"selected",row};},preview:async()=>{previewed=true;return"bad";},output:{write(){}}}),/allowed roots/);assert.equal(previewed,false);
});

test("folder effect refreshes list, stale reused ID safely creates, and binding-write failure is terminal", async () => {
  const base=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),"spaces-create-"))),configHome=path.join(base,"config"),stateHome=path.join(base,"state"),root=path.join(base,"root");await fs.mkdir(root);await fs.mkdir(path.join(configHome,"herdr","trials","casebook"),{recursive:true});await fs.writeFile(path.join(configHome,"herdr","trials","casebook","spaces.json"),JSON.stringify({schemaVersion:1,roots:[{path:root,depth:0}],ignores:[],zoxide:false}));
  let lists=0,creates=0;const fake={listWorkspaces:async()=>{lists++;return[];},listAgents:async()=>[],getPane:async()=>assert.fail(),focusWorkspace:async()=>assert.fail(),createWorkspace:async()=>{creates++;return receipt(root);}};const output=[];
  const result=await runPicker({env:{...env,HOME:base,XDG_CONFIG_HOME:configHome,XDG_STATE_HOME:stateHome},client:fake,choose:async rows=>({status:"selected",row:rows.find(r=>r.path===root)}),preview:async()=>"preview",saveBinding:async()=>{throw new Error("disk full");},output:{write:x=>output.push(x)}});
  assert.equal(lists,2);assert.equal(creates,1);assert.equal(result.status,"created-unrecorded");assert.match(output.join(""),/do not retry/i);
});

test("selection plans stale/ambiguous semantic and ambiguous folder fail closed",()=>{assert.equal(planSelection({source:"Semantic",state:"stale"},[]).kind,"refuse");assert.equal(planSelection({source:"Semantic",state:"unopened",canonicalId:"p"},[]).kind,"enroll");assert.equal(planSelection({source:"Folder",state:"ambiguous",path:"/x"},[]).kind,"refuse");});
