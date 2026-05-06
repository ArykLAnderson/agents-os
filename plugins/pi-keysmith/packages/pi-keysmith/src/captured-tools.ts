import {
  INTERCOM_ACTION_IDS,
  INTERCOM_COMPAT_SHIM_ID,
  INTERCOM_PACKAGE,
  MEMORY_ACTION_IDS,
  MEMORY_COMPAT_SHIM_ID,
  MEMORY_PACKAGE,
  SCHEDULE_PROMPT_ACTION_IDS,
  SCHEDULE_PROMPT_COMPAT_SHIM_ID,
  SCHEDULE_PROMPT_PACKAGE,
  SUBAGENTS_ACTION_IDS,
  SUBAGENTS_COMPAT_SHIM_ID,
  SUBAGENTS_PACKAGE,
} from "./config.js";

export type CapturedToolName = "intercom" | "subagent" | "memory_read" | "memory_search" | "schedule_prompt";

export interface CapturedToolInvocationDescriptor {
  readonly toolName: CapturedToolName;
  readonly params: Record<string, unknown>;
}

export interface CapturedToolConfirmation {
  readonly title: string;
  readonly message: string;
}

export interface CapturedToolInputPrompt {
  readonly title: string;
  readonly placeholder?: string;
  readonly paramName: string;
}

export interface CapturedToolActionDescriptor {
  readonly actionId: string;
  readonly label: string;
  readonly prefix: string;
  readonly packageName: string;
  readonly compatShimId: string;
  readonly toolInvocation: CapturedToolInvocationDescriptor;
  readonly sideEffect?: "none" | "local-state" | "destructive";
  readonly confirm?: CapturedToolConfirmation;
  readonly input?: CapturedToolInputPrompt;
}

export const CAPTURED_TOOL_ACTIONS = [
  captured(INTERCOM_ACTION_IDS.listSessions, "List sessions", "Intercom", INTERCOM_PACKAGE, INTERCOM_COMPAT_SHIM_ID, "intercom", { action: "list" }),
  captured(INTERCOM_ACTION_IDS.pendingAsks, "Pending asks", "Intercom", INTERCOM_PACKAGE, INTERCOM_COMPAT_SHIM_ID, "intercom", { action: "pending" }),
  captured(INTERCOM_ACTION_IDS.status, "Status", "Intercom", INTERCOM_PACKAGE, INTERCOM_COMPAT_SHIM_ID, "intercom", { action: "status" }),
  captured(SUBAGENTS_ACTION_IDS.listAgents, "List agents", "Subagents", SUBAGENTS_PACKAGE, SUBAGENTS_COMPAT_SHIM_ID, "subagent", { action: "list" }),
  captured(SUBAGENTS_ACTION_IDS.listChains, "List chains", "Subagents", SUBAGENTS_PACKAGE, SUBAGENTS_COMPAT_SHIM_ID, "subagent", { action: "chains" }),
  captured(SUBAGENTS_ACTION_IDS.runStatus, "Run status", "Subagents", SUBAGENTS_PACKAGE, SUBAGENTS_COMPAT_SHIM_ID, "subagent", { action: "status" }),
  captured(SUBAGENTS_ACTION_IDS.interrupt, "Interrupt", "Subagents", SUBAGENTS_PACKAGE, SUBAGENTS_COMPAT_SHIM_ID, "subagent", { action: "interrupt" }, {
    sideEffect: "destructive",
    confirm: { title: "Subagents: Interrupt", message: "Interrupt the active subagent run?" },
  }),
  captured(MEMORY_ACTION_IDS.search, "Search memory", "Memory", MEMORY_PACKAGE, MEMORY_COMPAT_SHIM_ID, "memory_search", {}, {
    input: { title: "Memory: Search memory", placeholder: "Search query", paramName: "query" },
  }),
  captured(MEMORY_ACTION_IDS.dailyLog, "Daily log", "Memory", MEMORY_PACKAGE, MEMORY_COMPAT_SHIM_ID, "memory_read", { target: "daily" }),
  captured(MEMORY_ACTION_IDS.longTerm, "Long-term memory", "Memory", MEMORY_PACKAGE, MEMORY_COMPAT_SHIM_ID, "memory_read", { target: "long_term" }),
  captured(MEMORY_ACTION_IDS.scratchpad, "Scratchpad", "Memory", MEMORY_PACKAGE, MEMORY_COMPAT_SHIM_ID, "memory_read", { target: "scratchpad" }),
  captured(SCHEDULE_PROMPT_ACTION_IDS.listJobs, "List jobs", "Schedule Prompt", SCHEDULE_PROMPT_PACKAGE, SCHEDULE_PROMPT_COMPAT_SHIM_ID, "schedule_prompt", { action: "list" }),
  captured(SCHEDULE_PROMPT_ACTION_IDS.cleanupJobs, "Cleanup jobs", "Schedule Prompt", SCHEDULE_PROMPT_PACKAGE, SCHEDULE_PROMPT_COMPAT_SHIM_ID, "schedule_prompt", { action: "cleanup" }, {
    sideEffect: "local-state",
    confirm: { title: "Schedule Prompt: Cleanup jobs", message: "Clean up completed schedule-prompt jobs?" },
  }),
] as const satisfies readonly CapturedToolActionDescriptor[];

const ALLOWED_CAPTURED_TOOL_NAMES = new Set<CapturedToolName>(CAPTURED_TOOL_ACTIONS.map(({ toolInvocation }) => toolInvocation.toolName));

export function isAllowedCapturedToolName(name: unknown): name is CapturedToolName {
  return typeof name === "string" && ALLOWED_CAPTURED_TOOL_NAMES.has(name as CapturedToolName);
}

export function capturedToolActionById(actionId: string): CapturedToolActionDescriptor | undefined {
  return CAPTURED_TOOL_ACTIONS.find((action) => action.actionId === actionId);
}

function captured(
  actionId: string,
  label: string,
  prefix: string,
  packageName: string,
  compatShimId: string,
  toolName: CapturedToolName,
  params: Record<string, unknown>,
  options: Omit<CapturedToolActionDescriptor, "actionId" | "label" | "prefix" | "packageName" | "compatShimId" | "toolInvocation"> = {},
): CapturedToolActionDescriptor {
  return {
    actionId,
    label,
    prefix,
    packageName,
    compatShimId,
    toolInvocation: { toolName, params },
    sideEffect: options.sideEffect ?? "none",
    confirm: options.confirm,
    input: options.input,
  };
}
