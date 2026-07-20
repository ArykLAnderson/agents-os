import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  getModels,
  streamSimpleOpenAICodexResponses,
  type Model,
} from "@earendil-works/pi-ai";

const PROVIDER = "openai-codex";
const API = "openai-codex-responses" as const;
const FOCUSED_SUFFIX = "-focused";

// Pi compacts at contextWindow - reserveTokens. With the standard 16,384-token
// reserve, this makes focused models compact at approximately 240,000 tokens.
const FOCUSED_CONTEXT_WINDOW = 240_000 + 16_384;
const FOCUSED_MODEL_IDS = new Set([
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
]);

export default function focusedOpenAICodex(pi: ExtensionAPI): void {
  const builtInModels = getModels(PROVIDER);
  const focusedModels = builtInModels
    .filter((model) => FOCUSED_MODEL_IDS.has(model.id))
    .map((model) => ({
      ...model,
      id: `${model.id}${FOCUSED_SUFFIX}`,
      name: `${model.name} Focused (~240K compaction)`,
      contextWindow: FOCUSED_CONTEXT_WINDOW,
    }));

  pi.registerProvider(PROVIDER, {
    // OAuth is intentionally omitted so Pi preserves the built-in Codex auth.
    api: API,
    models: [...builtInModels, ...focusedModels],
    streamSimple(model, context, options) {
      const upstreamModel = model.id.endsWith(FOCUSED_SUFFIX)
        ? ({
            ...model,
            id: model.id.slice(0, -FOCUSED_SUFFIX.length),
          } as Model<typeof API>)
        : model;

      return streamSimpleOpenAICodexResponses(upstreamModel, context, options);
    },
  });
}
