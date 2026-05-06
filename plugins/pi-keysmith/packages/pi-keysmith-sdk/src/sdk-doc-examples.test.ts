import { describe, expect, it } from "vitest";
import type { KeysmithActionRegistration } from "./index.js";

const sdkActionExamples: KeysmithActionRegistration[] = [
  {
    id: "example.docs-invocation-context",
    description: "Docs example using the SDK invocation context",
    handler: async ({ cwd, hasUI, ui, model, getThinkingLevel, setThinkingLevel }) => {
      if (hasUI) ui?.notify(`Hello from ${cwd}`, "info");

      const currentThinkingLevel = getThinkingLevel?.();
      if (currentThinkingLevel) await setThinkingLevel?.(currentThinkingLevel);

      void model;
    },
  },
];

describe("SDK documented action types", () => {
  it("keeps documented invocation-context fields compile-time covered", () => {
    expect(sdkActionExamples).toHaveLength(1);
  });
});
