import fs from "node:fs/promises";
import path from "node:path";

/** Display-only sanitization: remove OSC payloads, every C0 control, and DEL. */
export function sanitize(value) {
  return String(value ?? "")
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, " ")
    .replace(/[\x00-\x1f\x7f]+/g, " ")
    .replace(/ +/g, " ")
    .trim();
}
function text(value, field) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${field} is required`);
  return value;
}
function generation(value, field) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`${field} must be a positive integer`);
  return value;
}
function validateOfficialAgentSession(value,field){
  if(!value||typeof value!=="object"||Array.isArray(value)||Object.keys(value).sort().join(",")!=="agent,kind,source,value")throw new TypeError(`${field} must be an exact official agent session tuple`);
  text(value.value,`${field}.value`);
  const pi=value.source==="herdr:pi"&&value.agent==="pi"&&["id","path"].includes(value.kind);
  const opencode=value.source==="herdr:opencode"&&value.agent==="opencode"&&value.kind==="id";
  if(!pi&&!opencode)throw new TypeError(`${field} is not a supported official agent session tuple`);
}
export function validateRegistry(value) {
  if (!value || value.schemaVersion !== 1) throw new TypeError("unsupported authoritative registry schemaVersion");
  const route=value.route;
  if(route?.sessionName!=="casebook-trial")throw new TypeError("registry route must name casebook-trial");
  if(!path.isAbsolute(route?.configPath??""))throw new TypeError("registry configPath must be absolute");
  if(!path.isAbsolute(route?.socketPath??""))throw new TypeError("registry socketPath must be absolute");
  if(route?.protocol!==17)throw new TypeError("registry protocol must be 17");
  if(!Array.isArray(value.projects)||!Array.isArray(value.sessions))throw new TypeError("registry projects and sessions arrays are required");
  value.projects.forEach((project,index)=>{
    text(project?.canonicalId,`projects[${index}].canonicalId`);generation(project?.generation,`projects[${index}].generation`);
    if(!["current","stale"].includes(project?.reconciliationState))throw new TypeError(`projects[${index}].reconciliationState is invalid`);
    text(project?.stewardSessionCanonicalId,`projects[${index}].stewardSessionCanonicalId`);
    if(project.displayName!=null)text(project.displayName,`projects[${index}].displayName`);
    if(project.declaredRoot!=null&&(typeof project.declaredRoot!=="string"||!path.isAbsolute(project.declaredRoot)))throw new TypeError(`projects[${index}].declaredRoot must be an absolute string`);
  });
  value.sessions.forEach((record,index)=>{
    text(record?.canonicalId,`sessions[${index}].canonicalId`);text(record?.projectCanonicalId,`sessions[${index}].projectCanonicalId`);generation(record?.generation,`sessions[${index}].generation`);
    if(!["current","stale"].includes(record?.reconciliationState))throw new TypeError(`sessions[${index}].reconciliationState is invalid`);
    if(!["steward","interaction"].includes(record?.role))throw new TypeError(`sessions[${index}].role is invalid`);
    if(Object.hasOwn(record,"officialPiSession"))throw new TypeError(`sessions[${index}].officialPiSession is unsupported; publish officialAgentSession`);
    validateOfficialAgentSession(record.officialAgentSession,`sessions[${index}].officialAgentSession`);
    for(const key of ["workspaceId","tabId","paneId","terminalId"])text(record?.binding?.[key],`sessions[${index}].binding.${key}`);
  });
  const officialOwners=new Map(),bindingOwners=new Map(),workspaceProjects=new Map();
  for(const record of value.sessions){
    const officialKey=JSON.stringify([record.officialAgentSession.source,record.officialAgentSession.agent,record.officialAgentSession.kind,record.officialAgentSession.value]);
    const bindingKey=JSON.stringify([record.binding.workspaceId,record.binding.tabId,record.binding.paneId,record.binding.terminalId]);
    const officialOwner=officialOwners.get(officialKey),bindingOwner=bindingOwners.get(bindingKey),workspaceProject=workspaceProjects.get(record.binding.workspaceId);
    if(officialOwner&&officialOwner!==record.canonicalId)throw new TypeError(`cross-canonical collision in official agent session: ${officialOwner} and ${record.canonicalId}`);
    if(bindingOwner&&bindingOwner!==record.canonicalId)throw new TypeError(`cross-canonical collision in live binding: ${bindingOwner} and ${record.canonicalId}`);
    if(workspaceProject&&workspaceProject!==record.projectCanonicalId)throw new TypeError(`cross-project workspace collision: ${workspaceProject} and ${record.projectCanonicalId}`);
    officialOwners.set(officialKey,record.canonicalId);bindingOwners.set(bindingKey,record.canonicalId);workspaceProjects.set(record.binding.workspaceId,record.projectCanonicalId);
  }
  return structuredClone(value);
}
function sameOfficial(a,b){return a?.source===b?.source&&a?.agent===b?.agent&&a?.kind===b?.kind&&a?.value===b?.value;}
function agentMatches(agent,record){return sameOfficial(agent?.agent_session,record.officialAgentSession)&&agent?.workspace_id===record.binding.workspaceId&&agent?.tab_id===record.binding.tabId&&agent?.pane_id===record.binding.paneId&&agent?.terminal_id===record.binding.terminalId;}
function liveState(workspace){return workspace.agent_status==="working"?"working":"live";}
function liveRoot(workspace,plainBindings){return workspace.verifiedRoot??workspace.worktree?.checkout_path??plainBindings?.[workspace.workspace_id]??null;}
function projectResolution(project,projects,sessions,workspaces,agents){
  const duplicates=projects.filter(item=>item.canonicalId===project.canonicalId);if(duplicates.length!==1)return{state:"ambiguous"};
  const projectClaims=sessions.filter(record=>record.projectCanonicalId===project.canonicalId);
  const canonicalCounts=new Map();for(const record of sessions)canonicalCounts.set(record.canonicalId,(canonicalCounts.get(record.canonicalId)??0)+1);
  if(projectClaims.some(record=>canonicalCounts.get(record.canonicalId)>1))return{state:"ambiguous"};
  if(project.reconciliationState!=="current")return{state:"stale"};
  const claims=projectClaims.filter(record=>record.reconciliationState==="current");if(!claims.length)return{state:"unopened"};
  const claimedWorkspaceIds=new Set(claims.map(record=>record.binding.workspaceId));if(claimedWorkspaceIds.size>1)return{state:"ambiguous"};
  for(const workspaceId of claimedWorkspaceIds){const projectOwners=new Set(sessions.filter(record=>record.reconciliationState==="current"&&record.binding.workspaceId===workspaceId).map(record=>record.projectCanonicalId));if(projectOwners.size>1)return{state:"ambiguous"};}
  const workspaceIds=new Set();let duplicateAgent=false;
  for(const record of claims){const exact=agents.filter(item=>agentMatches(item,record));if(exact.length>1)duplicateAgent=true;if(exact.length===1&&workspaces.some(ws=>ws.workspace_id===record.binding.workspaceId))workspaceIds.add(record.binding.workspaceId);}
  if(duplicateAgent||workspaceIds.size>1)return{state:"ambiguous"};
  if(workspaceIds.size===0)return{state:"stale"};
  const workspaceId=[...workspaceIds][0],workspace=workspaces.find(ws=>ws.workspace_id===workspaceId);return{state:liveState(workspace),workspaceId,workspace};
}
export function buildRows({registry,liveWorkspaces=[],agents=[],folders=[],plainBindings={}}){
  const rows=[],claimedLive=new Set(),claimedRoots=new Set();
  if(registry){const projects=registry.projects??[];for(const project of projects){if(projects.find(item=>item.canonicalId===project.canonicalId)!==project)continue;const resolution=projectResolution(project,projects,registry.sessions??[],liveWorkspaces,agents);let root=null;if(resolution.workspaceId){root=liveRoot(resolution.workspace,plainBindings);claimedLive.add(resolution.workspaceId);if(root)claimedRoots.add(root);}rows.push({source:"Semantic",state:resolution.state,display:project.displayName??project.canonicalId,canonicalId:project.canonicalId,path:project.declaredRoot??null,workspaceId:resolution.workspaceId??null,verifiedRoot:root});}}
  const folderPaths=new Set(folders.map(folder=>folder.path));
  for(const workspace of liveWorkspaces){if(claimedLive.has(workspace.workspace_id))continue;const root=liveRoot(workspace,plainBindings);if(root&&folderPaths.has(root))continue;if(root)claimedRoots.add(root);rows.push({source:"Live",state:liveState(workspace),display:workspace.label||workspace.workspace_id,workspaceId:workspace.workspace_id,path:root,verifiedRoot:root});}
  const byPath=new Map();for(const folder of folders)if(!claimedRoots.has(folder.path)&&!byPath.has(folder.path))byPath.set(folder.path,folder);
  for(const folder of byPath.values()){const matching=liveWorkspaces.filter(ws=>liveRoot(ws,plainBindings)===folder.path);rows.push({source:"Folder",state:matching.length===1?liveState(matching[0]):matching.length>1?"ambiguous":"unopened",display:folder.display??(path.basename(folder.path)||folder.path),path:folder.path,workspaceId:matching.length===1?matching[0].workspace_id:null,verifiedRoot:folder.path,folderSource:folder.source});}
  return rows.map((row,index)=>({...row,key:`row-${String(index+1).padStart(4,"0")}`}));
}
export function planSelection(row,liveWorkspaces=[]){
  if(!row)return{kind:"refuse",message:"No space selected."};
  if(row.source==="Semantic"){if(["stale","ambiguous"].includes(row.state))return{kind:"refuse",message:`Semantic project is ${row.state}; reconcile its authoritative binding first.`};if(!row.workspaceId)return{kind:"enroll",canonicalProjectId:row.canonicalId};return{kind:"focus",workspaceId:row.workspaceId};}
  if(row.source==="Live")return liveWorkspaces.some(ws=>ws.workspace_id===row.workspaceId)?{kind:"focus",workspaceId:row.workspaceId}:{kind:"refuse",message:"Live workspace is no longer present."};
  if(row.source==="Folder"){const matches=liveWorkspaces.filter(ws=>ws.verifiedRoot===row.path||ws.worktree?.checkout_path===row.path);if(matches.length>1||row.state==="ambiguous")return{kind:"refuse",message:"Multiple live workspaces attest this exact folder root."};if(matches.length===1)return{kind:"focus",workspaceId:matches[0].workspace_id};return{kind:"create",path:row.path,label:`plain:${path.basename(row.path)||"root"}`};}
  return{kind:"refuse",message:"Unknown space source."};
}
export async function canonicalAllowedPath(candidate,allowedRoots){
  if(typeof candidate!=="string"||!path.isAbsolute(candidate))throw new Error("selected folder path must be absolute");const real=await fs.realpath(candidate),stat=await fs.lstat(real);if(!stat.isDirectory())throw new Error("selected folder is not a directory");
  for(const allowed of allowedRoots){const root=await fs.realpath(allowed),relative=path.relative(root,real);if(relative===""||(!relative.startsWith(`..${path.sep}`)&&relative!==".."&&!path.isAbsolute(relative)))return real;}throw new Error("selected folder is outside configured allowed roots");
}
