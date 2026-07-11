import type { AgentMessage } from "@earendil-works/pi-agent-core";
import { complete, type Message } from "@earendil-works/pi-ai";
import type { ExtensionCommandContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { BorderedLoader, convertToLlm, serializeConversation } from "@earendil-works/pi-coding-agent";

export const CONTINUE_NEXT_TASK_GOAL = "Continue with the next obvious task from the current conversation.";
export const CUSTOM_GOAL_LABEL = "Custom goal...";
export const CONTINUE_LABEL = "Continue next obvious task";

export const HANDOFF_SYSTEM_PROMPT = `You write concise handoff prompts for starting a fresh Pi coding-agent thread.

Generate a self-contained prompt for the next thread using only task-relevant context from the conversation and the user's goal.

Required sections:
## Context
## Task

Optional sections, include only when useful:
## Decisions
## Files
## Evidence / verification
## Unknowns / risks
## Constraints

Rules:
- Be neutral, evidence-disciplined, and specific.
- Do not include generic agent-operation instructions such as "read the files", "run tests", "be careful", or "follow best practices" unless they are explicit user intent or a concrete project constraint.
- Include only core relevant files, APIs, commands, decisions, and constraints. Do not list incidental touched files or lint/noise unless they matter for the next task.
- Mention completed work only when it affects the next task.
- Preserve uncertainty. Do not invent facts, results, file changes, tests, or decisions.
- The output is the prompt itself. Do not add preamble or commentary.`;

function entryToMessage(entry: SessionEntry): AgentMessage | undefined {
  if (entry.type === "message") return entry.message;
  if (entry.type === "compaction") {
    return {
      role: "compactionSummary",
      summary: entry.summary,
      tokensBefore: entry.tokensBefore,
      timestamp: new Date(entry.timestamp).getTime(),
    };
  }
  return undefined;
}

export function getHandoffMessages(branch: SessionEntry[]): AgentMessage[] {
  let compactionIndex = -1;
  for (let i = branch.length - 1; i >= 0; i--) {
    if (branch[i].type === "compaction") {
      compactionIndex = i;
      break;
    }
  }

  if (compactionIndex < 0) {
    return branch.map(entryToMessage).filter((message) => message !== undefined);
  }

  const compaction = branch[compactionIndex];
  const firstKeptIndex =
    compaction.type === "compaction" ? branch.findIndex((entry) => entry.id === compaction.firstKeptEntryId) : -1;
  const compactedBranch = [
    compaction,
    ...(firstKeptIndex >= 0 ? branch.slice(firstKeptIndex, compactionIndex) : []),
    ...branch.slice(compactionIndex + 1),
  ];
  return compactedBranch.map(entryToMessage).filter((message) => message !== undefined);
}

export function buildHandoffUserPrompt(conversationText: string, goal: string): string {
  return `## Conversation History\n\n${conversationText}\n\n## User Goal / Next Thread Intent\n\n${goal}`;
}

export async function resolveHandoffGoal(ctx: ExtensionCommandContext, inlineGoal: string): Promise<string | undefined> {
  const trimmed = inlineGoal.trim();
  if (trimmed) return trimmed;

  const choice = await ctx.ui.select("Fresh handoff goal", [CONTINUE_LABEL, CUSTOM_GOAL_LABEL]);
  if (choice === undefined) return undefined;
  if (choice === CONTINUE_LABEL) return CONTINUE_NEXT_TASK_GOAL;

  const custom = await ctx.ui.input("Fresh handoff goal", "Describe the next thread's task");
  const customTrimmed = custom?.trim();
  return customTrimmed || undefined;
}

export async function generateHandoffDraft(ctx: ExtensionCommandContext, goal: string): Promise<string | undefined> {
  if (!ctx.model) {
    ctx.ui.notify("No model selected", "error");
    return undefined;
  }

  const messages = getHandoffMessages(ctx.sessionManager.getBranch());
  if (messages.length === 0) {
    ctx.ui.notify("No conversation to hand off", "error");
    return undefined;
  }

  const llmMessages = convertToLlm(messages);
  const conversationText = serializeConversation(llmMessages);

  const generated = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
    const loader = new BorderedLoader(tui, theme, "Generating Hop handoff draft...");
    loader.onAbort = () => done(null);

    const doGenerate = async () => {
      const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model!);
      if (!auth.ok || !auth.apiKey) {
        throw new Error(auth.ok ? `No API key for ${ctx.model!.provider}` : auth.error);
      }

      const userMessage: Message = {
        role: "user",
        content: [{ type: "text", text: buildHandoffUserPrompt(conversationText, goal) }],
        timestamp: Date.now(),
      };

      const response = await complete(
        ctx.model!,
        { systemPrompt: HANDOFF_SYSTEM_PROMPT, messages: [userMessage] },
        { apiKey: auth.apiKey, headers: auth.headers, signal: loader.signal },
      );

      if (response.stopReason === "aborted") return null;
      return response.content
        .filter((content): content is { type: "text"; text: string } => content.type === "text")
        .map((content) => content.text)
        .join("\n")
        .trim();
    };

    doGenerate().then(done).catch((error) => {
      console.error("Hop handoff generation failed:", error);
      done(null);
    });

    return loader;
  });

  if (!generated) return undefined;
  const edited = await ctx.ui.editor("Edit Hop handoff draft", generated);
  return edited?.trim() || undefined;
}
