import path from "node:path";
import { spawn } from "node:child_process";
import { TRIAL_SESSION } from "./model.mjs";

async function defaultExecutor(executable, args, options) {
  return await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { ...options, stdio: ["ignore", "pipe", "pipe"] }); let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; }); child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.once("error", reject); child.once("close", status => resolve({ status, stdout, stderr }));
  });
}
function jsonResponse(output, operation) { try { return JSON.parse(output); } catch { throw new Error(`${operation} returned invalid JSON`); } }
export function parseAgentListResponse(output) {
  const response = jsonResponse(output, "agent list");
  if (response?.result?.type !== "agent_list" || !Array.isArray(response.result.agents)) throw new Error("agent list returned an unexpected response");
  return response.result.agents;
}
function sameOfficial(a, b) { return a?.source === b?.source && a?.agent === b?.agent && a?.kind === b?.kind && a?.value === b?.value; }
export function parseFocusResponse(output, expectedRecord) {
  const response = jsonResponse(output, "agent focus");
  if (response?.result?.type !== "agent_info" || !response.result.agent) throw new Error("agent focus returned an unexpected response");
  const agent = response.result.agent; const binding = expectedRecord?.binding;
  if (!sameOfficial(agent.agent_session, expectedRecord?.officialPiSession)
    || agent.workspace_id !== binding?.workspaceId || agent.tab_id !== binding?.tabId
    || agent.pane_id !== binding?.paneId || agent.terminal_id !== binding?.terminalId
    || agent.focused !== true) throw new Error("agent focus response target mismatch");
  return agent;
}
export function createHerdrClient({ env = process.env, route, executor = defaultExecutor }) {
  if (!path.isAbsolute(env.HERDR_BIN_PATH ?? "")) throw new Error("HERDR_BIN_PATH must be an absolute executable path");
  if (route?.sessionName !== TRIAL_SESSION) throw new Error(`route must be ${TRIAL_SESSION}`);
  if (env.HERDR_CONFIG_PATH !== route.configPath) throw new Error("inherited config proof does not match registry");
  if (env.HERDR_SOCKET_PATH !== route.socketPath) throw new Error("inherited socket proof does not match registry");
  const call = async (operation) => {
    const args = ["--session", TRIAL_SESSION, ...operation];
    let result; try { result = await executor(env.HERDR_BIN_PATH, args, { env: { ...env }, shell: false }); } catch (error) { throw new Error(`Herdr delivery uncertain: ${error.message}`); }
    if (result?.status !== 0) throw new Error(`Herdr command failed or uncertain (exit ${result?.status ?? "unknown"})`);
    return result.stdout ?? "";
  };
  return {
    async listAgents() { return parseAgentListResponse(await call(["agent", "list"])); },
    async focusSession(resolution) {
      const record = resolution?.record; const paneId = record?.binding?.paneId;
      if (typeof paneId !== "string" || !paneId) throw new TypeError("verified pane target is required");
      return parseFocusResponse(await call(["agent", "focus", paneId]), record);
    },
    async openPopup(entrypoint) {
      if (!["project-manager", "local-manager", "result"].includes(entrypoint)) throw new TypeError("unknown popup entrypoint");
      await call(["plugin", "pane", "open", "--plugin", "aryk.pins", "--entrypoint", entrypoint, "--placement", "popup"]);
    },
  };
}
