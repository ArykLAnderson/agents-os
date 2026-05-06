import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createKeysmithLog,
  formatDoctorReport,
  invalidConfigEntriesFromDiagnostics,
  reportStartupDiagnostics,
  type DoctorSnapshot,
  type StartupDiagnostic,
} from "./doctor.js";

describe("Keysmith doctor and diagnostics", () => {
  it("formats config layers, contexts, conflicts, missing actions, disabled defaults, invalid entries, wrapper state, and log path", () => {
    const snapshot: DoctorSnapshot = {
      configLayers: [
        { source: "builtin:pi-keysmith", status: "loaded" },
        { source: "/home/me/.pi/agent/settings.json", status: "loaded" },
        { source: "/repo/.pi/keybindings.json", status: "invalid", message: "spec must be an object" },
      ],
      contexts: [
        { id: "editor", active: true },
        { id: "vim.normal", active: false, message: "no compatible editor" },
      ],
      conflicts: [{ sequence: "t", sources: ["builtin:pi-keysmith", "sdk:other"], resolution: "disabled" }],
      missingActions: [{ actionId: "example.missing", sequence: "m" }],
      disabledDefaults: [{ sequence: "tn", actionId: "pi-keysmith.thinking.next", reason: "explicit null" }],
      invalidEntries: [{ source: "/repo/.pi/keybindings.json", message: "leader must parse to exactly one key" }],
      wrapper: { active: false, message: "overwritten by another extension" },
      logPath: "/home/me/.pi/agent/pi-keysmith.log",
    };

    const report = formatDoctorReport(snapshot);

    expect(report).toContain("/home/me/.pi/agent/settings.json");
    expect(report).toContain("vim.normal: inactive — no compatible editor");
    expect(report).toContain("t: disabled conflict");
    expect(report).toContain("example.missing");
    expect(report).toContain("tn: pi-keysmith.thinking.next disabled — explicit null");
    expect(report).toContain("leader must parse to exactly one key");
    expect(report).toContain("wrapper: inactive — overwritten by another extension");
    expect(report).toContain("/home/me/.pi/agent/pi-keysmith.log");
  });

  it("uses a dedicated log path below injected agentDir", async () => {
    const agentDir = await mkdtemp(join(tmpdir(), "pi-keysmith-agent-"));

    try {
      const log = createKeysmithLog({ agentDir });
      await log.write("nonfatal diagnostic");

      expect(log.path).toBe(join(agentDir, "pi-keysmith.log"));
      await expect(readFile(log.path, "utf8")).resolves.toContain("nonfatal diagnostic");
    } finally {
      await rm(agentDir, { recursive: true, force: true });
    }
  });

  it("notifies once for fatal startup diagnostics and sends nonfatal diagnostics only to doctor/log", async () => {
    const notifications: string[] = [];
    const logLines: string[] = [];
    const reporter = reportStartupDiagnostics({
      notify: (message) => notifications.push(message),
      log: (message) => logLines.push(message),
    });

    await reporter.report([
      { severity: "fatal", message: "invalid leader" },
      { severity: "error", message: "duplicate binding" },
      { severity: "warning", message: "missing optional action" },
    ]);
    await reporter.report([{ severity: "fatal", message: "still disabled" }]);

    expect(notifications).toEqual(["pi-keysmith disabled: invalid leader"]);
    expect(logLines).toEqual(expect.arrayContaining(["duplicate binding", "missing optional action", "still disabled"]));
  });

  it("formats the diagnostics taxonomy matrix with source IDs and surfacing policy", () => {
    const snapshot = {
      configLayers: [],
      contexts: [],
      conflicts: [],
      missingActions: [],
      disabledDefaults: [],
      invalidEntries: [],
      wrapper: { active: true },
      logPath: "/home/me/.pi/agent/pi-keysmith.log",
      diagnostics: [
        {
          code: "shim.unknown",
          category: "config",
          surface: "doctor",
          sourceIds: ["user:/home/me/.pi/agent/settings.json"],
          message: "Unknown shim compat:typo-core",
        },
        {
          code: "shim.disabled",
          category: "state",
          surface: "doctor",
          sourceIds: ["compat:pi-core", "user:/home/me/.pi/agent/settings.json"],
          message: "Shim compat:pi-core disabled by user config",
        },
        {
          code: "shim.replacement",
          category: "log-only",
          surface: "log",
          sourceIds: ["compat:session-search", "plugin:session-search"],
          message: "Plugin shim replaced built-in compat shim",
        },
        {
          code: "action.missing",
          category: "runtime",
          surface: "doctor",
          sourceIds: ["plugin:sample-actions"],
          message: "Missing action plugin.sample.missing at sm",
        },
        {
          code: "slash.unavailable",
          category: "runtime",
          surface: "doctor",
          sourceIds: ["compat:pi-core"],
          message: "Slash command /session-tree unavailable",
        },
      ],
    } as DoctorSnapshot & { diagnostics: readonly Record<string, unknown>[] };

    const report = formatDoctorReport(snapshot);

    expect(report).toContain("shim.unknown");
    expect(report).toMatch(/shim\.disabled[\s\S]*compat:pi-core/);
    expect(report).toMatch(/shim\.replacement[\s\S]*log-only[\s\S]*plugin:session-search/);
    expect(report).toMatch(/action\.missing[\s\S]*plugin\.sample\.missing/);
    expect(report).toMatch(/slash\.unavailable[\s\S]*\/session-tree/);
  });

  it("keeps log-only diagnostics out of doctor invalid entries", () => {
    const diagnostics = [
      {
        source: "compat:alpha-tools, compat:zeta-tools",
        severity: "log",
        category: "log-only",
        surface: "log",
        code: "default.groupName.collision",
        message: "Default group-name collision at n resolved as Alpha Tools | Zeta Tools",
      },
      {
        source: "compat:alpha-navigation, compat:beta-navigation",
        severity: "error",
        category: "config",
        surface: "doctor",
        code: "default.conflict.unresolved",
        message: "Unresolved default conflict at v: alpha.open and beta.open",
      },
      {
        source: "/repo/.pi/keybindings.json",
        severity: "error",
        message: "Invalid piKeysmith config: leader must parse to exactly one key",
      },
    ];

    const invalidEntries = invalidConfigEntriesFromDiagnostics(diagnostics);
    const report = formatDoctorReport({
      configLayers: [],
      contexts: [],
      conflicts: [],
      missingActions: [],
      disabledDefaults: [],
      invalidEntries,
      diagnostics,
      wrapper: { active: true },
      logPath: "/home/me/.pi/agent/pi-keysmith.log",
    });
    const invalidEntriesSection = report.slice(report.indexOf("## Invalid entries"), report.indexOf("## Diagnostics"));

    expect(invalidEntries).toEqual([
      {
        source: "/repo/.pi/keybindings.json",
        message: "Invalid piKeysmith config: leader must parse to exactly one key",
      },
    ]);
    expect(invalidEntriesSection).toContain("Invalid piKeysmith config: leader must parse to exactly one key");
    expect(invalidEntriesSection).not.toContain("Default group-name collision");
    expect(invalidEntriesSection).not.toContain("Unresolved default conflict");
    expect(report).toContain("default.groupName.collision");
  });

  it("keeps log-only diagnostics out of startup warnings", async () => {
    const notifications: string[] = [];
    const logLines: string[] = [];
    const reporter = reportStartupDiagnostics({
      notify: (message) => notifications.push(message),
      log: (message) => logLines.push(message),
    });

    await reporter.report([
      {
        severity: "log",
        category: "log-only",
        message: "default group-name collision resolved as Alpha | Zeta",
      } as unknown as StartupDiagnostic,
    ]);

    expect(notifications).toEqual([]);
    expect(logLines).toEqual(["default group-name collision resolved as Alpha | Zeta"]);
  });

  it("redacts and minimizes shim diagnostics at the startup logging boundary", async () => {
    const logLines: string[] = [];
    const reporter = reportStartupDiagnostics({
      notify: () => undefined,
      log: (message) => logLines.push(message),
    });

    await reporter.report([
      {
        severity: "warning",
        code: "diag.redaction.fixture",
        sourceIds: ["compat:redaction-fixture"],
        message: "Open panel failed while API key sk-live-secret-token was present",
        prompt: "Write a detailed prompt that must never be logged",
        memory: "Long-term memory contents must never be logged",
        config: {
          piKeysmith: {
            spec: { x: { action: "secret.action" } },
            compat: { shims: { "compat:redaction-fixture": { enabled: true } } },
          },
        },
        env: { OPENAI_API_KEY: "sk-live-secret-token" },
      } as unknown as StartupDiagnostic,
    ]);

    expect(logLines).toHaveLength(1);
    const [logged] = logLines;
    expect(logged).toContain("diag.redaction.fixture");
    expect(logged).toContain("compat:redaction-fixture");
    expect(logged).not.toContain("sk-live-secret-token");
    expect(logged).not.toContain("Write a detailed prompt");
    expect(logged).not.toContain("Long-term memory contents");
    expect(logged).not.toContain("secret.action");
    expect(logged).not.toContain("OPENAI_API_KEY");
    expect(logged).not.toMatch(/\"piKeysmith\"|\"spec\"|\"compat\"/);
  });
});
