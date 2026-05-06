import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  INTERCOM_COMPAT_SHIM_ID,
  MARKDOWN_PREVIEW_COMPAT_SHIM_ID,
  MEMORY_COMPAT_SHIM_ID,
  MODEL_CYCLER_COMPAT_SHIM_ID,
  OBSERVABILITY_COMPAT_SHIM_ID,
  PI_CORE_COMPAT_SHIM_ID,
  SCHEDULE_PROMPT_COMPAT_SHIM_ID,
  SESSION_SEARCH_COMPAT_SHIM_ID,
  SUBAGENTS_COMPAT_SHIM_ID,
  WEB_ACCESS_COMPAT_SHIM_ID,
} from "./config.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

const compatGroups = [
  { id: PI_CORE_COMPAT_SHIM_ID, label: "Pi Core" },
  { id: SESSION_SEARCH_COMPAT_SHIM_ID, label: "Session Search" },
  { id: INTERCOM_COMPAT_SHIM_ID, label: "Intercom" },
  { id: SUBAGENTS_COMPAT_SHIM_ID, label: "Subagents" },
  { id: OBSERVABILITY_COMPAT_SHIM_ID, label: "Observability" },
  { id: MARKDOWN_PREVIEW_COMPAT_SHIM_ID, label: "Markdown Preview" },
  { id: SCHEDULE_PROMPT_COMPAT_SHIM_ID, label: "Schedule Prompt" },
  { id: WEB_ACCESS_COMPAT_SHIM_ID, label: "Web Access" },
  { id: MEMORY_COMPAT_SHIM_ID, label: "Memory" },
  { id: MODEL_CYCLER_COMPAT_SHIM_ID, label: "Model Cycler" },
] as const;

function readRepoFile(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function expectDocToMention(doc: string, pattern: RegExp, label: string): void {
  expect(doc, `Expected documentation to mention ${label}`).toMatch(pattern);
}

function markdownDocCorpus(): string {
  const docs = [
    "README.md",
    "packages/pi-keysmith/README.md",
    "packages/pi-keysmith-sdk/README.md",
    "docs/config-reference.md",
    "docs/sdk-author-guide.md",
    "docs/smoke-checklist.md",
  ];
  return docs.map((path) => `\n--- ${path} ---\n${readRepoFile(path)}`).join("\n");
}

function actionBrowserSearchParagraphs(doc: string): string[] {
  const actionBrowserPattern = /(?:action\s+browser|actions?\s+picker|actions?\s+palette)/i;
  const searchPattern = /(?:search|filter|match(?:es|ing)?)/i;

  return doc
    .split(/\n\s*\n/)
    .filter((paragraph) => actionBrowserPattern.test(paragraph) && searchPattern.test(paragraph));
}

function repoPaths(start = repoRoot): string[] {
  const ignored = new Set([".git", "node_modules", "dist"]);
  return readdirSync(start)
    .filter((entry) => !ignored.has(entry))
    .flatMap((entry) => {
      const path = join(start, entry);
      const rel = relative(repoRoot, path);
      if (statSync(path).isDirectory()) return [rel, ...repoPaths(path)];
      return [rel];
    });
}

describe("VS-21 documentation coverage", () => {
  it("keeps the root and extension package READMEs aligned with the control-plane compat groups", () => {
    for (const path of ["README.md", "packages/pi-keysmith/README.md"]) {
      const doc = readRepoFile(path);
      expectDocToMention(doc, /control[- ]plane/i, `${path} control-plane philosophy`);
      expectDocToMention(doc, /compat(?:ibility)?\s+(?:shim|group|adapter|action)/i, `${path} compatibility shims/groups`);

      for (const group of compatGroups) {
        expectDocToMention(doc, new RegExp(escapeRegExp(group.label).replace(/\s+/g, "\\s+"), "i"), `${path} ${group.label} compat group`);
      }
    }
  });

  it("documents the piKeysmith.compat config shape next to existing spec unbind behavior", () => {
    const doc = readRepoFile("docs/config-reference.md");

    for (const field of ["piKeysmith.compat", "autoDetect", "defaultKeymapsEnabled", "shims", "enabled", "defaultKeymapEnabled"]) {
      expectDocToMention(doc, new RegExp(escapeRegExp(field)), `config field ${field}`);
    }

    expectDocToMention(doc, /spec[\s\S]{0,800}null[\s\S]{0,400}(?:unbind|disable|default)/i, "null unbind behavior in piKeysmith.spec");
  });

  it("documents registerKeysmithShim replacement shims and action aliases for SDK authors", () => {
    const doc = `${readRepoFile("docs/sdk-author-guide.md")}\n${readRepoFile("packages/pi-keysmith-sdk/README.md")}`;

    expectDocToMention(doc, /registerKeysmithShim/, "registerKeysmithShim");
    expectDocToMention(doc, /replaces?|replacement/i, "shim replacement semantics");
    expectDocToMention(doc, /aliases?/i, "replacement action aliases");
  });

  it("keeps the smoke checklist covering every shim and compat opt-out path", () => {
    const doc = readRepoFile("docs/smoke-checklist.md");

    for (const group of compatGroups) {
      expectDocToMention(doc, new RegExp(escapeRegExp(group.id)), `smoke checklist shim ${group.id}`);
    }

    for (const scenario of [
      /autoDetect[\s\S]{0,120}false/i,
      /defaultKeymapsEnabled[\s\S]{0,120}false/i,
      /defaultKeymapEnabled[\s\S]{0,120}false/i,
      /enabled[\s\S]{0,120}false/i,
    ]) {
      expectDocToMention(doc, scenario, `smoke checklist scenario ${scenario}`);
    }
  });

  it("documents action browser ordering somewhere public", () => {
    const doc = markdownDocCorpus();

    expectDocToMention(doc, /bound[\s\S]{0,120}(?:first|before)|(?:first|before)[\s\S]{0,120}bound/i, "bound actions sort before unbound actions");
    expectDocToMention(doc, /lexic(?:al|ographic)|sorted?\s+by\s+key/i, "lexical key ordering");
    expectDocToMention(doc, /unbound[\s\S]{0,120}(?:trailing|after|last)|(?:trailing|after|last)[\s\S]{0,120}unbound/i, "unbound actions trail bound actions");
  });

  it("documents action browser search semantics somewhere public", () => {
    const searchParagraphs = actionBrowserSearchParagraphs(markdownDocCorpus());

    for (const field of ["metadata", "name", "description", "source"] as const) {
      expect(
        searchParagraphs.some((paragraph) => new RegExp(`\\b${field}\\b`, "i").test(paragraph)),
        `Expected public action browser search docs to mention matching ${field}`,
      ).toBe(true);
    }

    expect(
      searchParagraphs.some(
        (paragraph) =>
          /(?:key\s+sequences?|bindings?)/i.test(paragraph) &&
          /(?:ignor(?:e|ed|es|ing)|exclud(?:e|ed|es|ing)|not\s+(?:be\s+)?(?:searched|matched|included)|without)/i.test(paragraph),
      ),
      "Expected public action browser search docs to mention key sequences/bindings are ignored or excluded from search",
    ).toBe(true);
  });

  it("does not publish private planning docs", () => {
    const planningPaths = repoPaths().filter((path) => {
      const normalized = path.replaceAll("\\\\", "/");
      return normalized.split("/").includes("_plans") || /(^|\/)(?:planning|prd|rfc)(?:[-_.].*)?\.md$/i.test(normalized);
    });

    expect(planningPaths).toEqual([]);
    expect(existsSync(join(repoRoot, "_plans"))).toBe(false);
  });
});
