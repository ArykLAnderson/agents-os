import { mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";

export interface DoctorSnapshot {
  readonly configLayers: readonly { source: string; status: string; message?: string }[];
  readonly contexts: readonly { id: string; active: boolean; message?: string }[];
  readonly conflicts: readonly { sequence: string; sources: readonly string[]; resolution: string }[];
  readonly missingActions: readonly { actionId: string; sequence?: string }[];
  readonly disabledDefaults: readonly { sequence: string; actionId: string; reason: string }[];
  readonly invalidEntries: readonly { source: string; message: string }[];
  readonly diagnostics?: readonly object[];
  readonly wrapper: { active: boolean; message?: string };
  readonly logPath: string;
}

export interface DoctorDiagnosticEntry {
  readonly source: string;
  readonly message: string;
  readonly severity?: string;
  readonly category?: string;
  readonly surface?: string;
  readonly code?: string;
}

export function invalidConfigEntriesFromDiagnostics(diagnostics: readonly DoctorDiagnosticEntry[]): Array<{ source: string; message: string }> {
  return diagnostics.filter(isInvalidConfigEntryDiagnostic).map((diagnostic) => ({ source: diagnostic.source, message: diagnostic.message }));
}

function isInvalidConfigEntryDiagnostic(diagnostic: DoctorDiagnosticEntry): boolean {
  if (diagnostic.severity === "log" || diagnostic.category === "log-only" || diagnostic.surface === "log") return false;
  return /^(Invalid piKeysmith config|JSON config error|Settings config error):/.test(diagnostic.message);
}

export function formatDoctorReport(snapshot: DoctorSnapshot): string {
  const lines = ["# pi-keysmith doctor", "", "## Config layers"];
  for (const layer of snapshot.configLayers) lines.push(`${layer.source}: ${layer.status}${layer.message ? ` — ${layer.message}` : ""}`);
  lines.push("", "## Contexts");
  for (const context of snapshot.contexts) lines.push(`${context.id}: ${context.active ? "active" : "inactive"}${context.message ? ` — ${context.message}` : ""}`);
  lines.push("", "## Conflicts");
  for (const conflict of snapshot.conflicts) lines.push(`${conflict.sequence}: ${conflict.resolution} conflict (${conflict.sources.join(", ")})`);
  lines.push("", "## Missing actions");
  for (const missing of snapshot.missingActions) lines.push(`${missing.sequence ? `${missing.sequence}: ` : ""}${missing.actionId}`);
  lines.push("", "## Disabled defaults");
  for (const disabled of snapshot.disabledDefaults) lines.push(`${disabled.sequence}: ${disabled.actionId} disabled — ${disabled.reason}`);
  lines.push("", "## Invalid entries");
  for (const invalid of snapshot.invalidEntries) lines.push(`${invalid.source}: ${invalid.message}`);
  lines.push("", "## Diagnostics");
  for (const diagnostic of snapshot.diagnostics ?? []) lines.push(formatDoctorDiagnostic(diagnostic));
  lines.push("", "## Wrapper", `wrapper: ${snapshot.wrapper.active ? "active" : "inactive"}${snapshot.wrapper.message ? ` — ${snapshot.wrapper.message}` : ""}`);
  lines.push("", "## Log", snapshot.logPath);
  return lines.join("\n");
}

function formatDoctorDiagnostic(diagnostic: object): string {
  const record = diagnostic as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code : "diagnostic";
  const category = typeof record.category === "string" ? record.category : undefined;
  const surface = typeof record.surface === "string" ? record.surface : undefined;
  const sourceIds = Array.isArray(record.sourceIds)
    ? record.sourceIds.filter((sourceId): sourceId is string => typeof sourceId === "string")
    : [];
  const message = typeof record.message === "string" ? record.message : "";
  return [code, category, surface, sourceIds.join(", "), message].filter(Boolean).join(" — ");
}

function formatStartupDiagnostic(diagnostic: StartupDiagnostic): string {
  const parts = [
    diagnostic.code,
    diagnostic.sourceIds && diagnostic.sourceIds.length > 0 ? diagnostic.sourceIds.join(", ") : undefined,
    diagnostic.message,
  ].filter((part): part is string => typeof part === "string" && part.length > 0);
  return redactSecrets(parts.join(": "));
}

function redactSecrets(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/(?:api[_-]?key|token|secret|password)\s*[:=]\s*\S+/gi, "$1=[redacted]");
}

export interface KeysmithLog {
  readonly path: string;
  write(message: string): Promise<void>;
}

export function createKeysmithLog(options: { agentDir: string }): KeysmithLog {
  const path = join(options.agentDir, "pi-keysmith.log");
  return {
    path,
    async write(message) {
      await mkdir(options.agentDir, { recursive: true });
      await appendFile(path, `${message}\n`, "utf8");
    },
  };
}

export interface StartupDiagnostic {
  readonly severity: "fatal" | "error" | "warning" | "log";
  readonly message: string;
  readonly code?: string;
  readonly category?: string;
  readonly sourceIds?: readonly string[];
}

export function reportStartupDiagnostics(options: { notify: (message: string) => unknown; log: (message: string) => unknown }) {
  let notifiedFatal = false;
  return {
    async report(diagnostics: readonly StartupDiagnostic[]): Promise<void> {
      for (const diagnostic of diagnostics) {
        if (diagnostic.severity === "fatal" && !notifiedFatal) {
          notifiedFatal = true;
          options.notify(`pi-keysmith disabled: ${redactSecrets(diagnostic.message)}`);
        } else {
          await options.log(formatStartupDiagnostic(diagnostic));
        }
      }
    },
  };
}
