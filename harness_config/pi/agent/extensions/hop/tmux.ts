import { execFile } from "node:child_process";

export interface PiLaunchCommandOptions {
  sessionFile: string;
  prefillFile?: string;
}

export interface TmuxOpenWindowOptions {
  cwd: string;
  command: string;
}

export interface TmuxOpenWindowResult {
  ok: true;
}

export interface TmuxOpenWindowError {
  ok: false;
  message: string;
  code?: number | null;
  stdout?: string;
  stderr?: string;
  recoveryCommand: string;
}

export type TmuxOpenWindowResponse = TmuxOpenWindowResult | TmuxOpenWindowError;

export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function buildPiSessionCommand(options: PiLaunchCommandOptions): string {
  const envPrefix = options.prefillFile ? `PI_HOP_PREFILL=${shellQuote(options.prefillFile)} ` : "";
  return `${envPrefix}pi --session ${shellQuote(options.sessionFile)}`;
}

export function buildTmuxNewWindowArgs(options: TmuxOpenWindowOptions): string[] {
  return ["new-window", "-c", options.cwd, options.command];
}

export function openWindow(options: TmuxOpenWindowOptions): Promise<TmuxOpenWindowResponse> {
  const args = buildTmuxNewWindowArgs(options);

  return new Promise((resolve) => {
    execFile("tmux", args, (error, stdout, stderr) => {
      if (!error) {
        resolve({ ok: true });
        return;
      }

      const maybeCode = typeof (error as NodeJS.ErrnoException & { code?: unknown }).code === "number"
        ? (error as NodeJS.ErrnoException & { code?: number }).code
        : null;

      resolve({
        ok: false,
        message: error.message,
        code: maybeCode,
        stdout,
        stderr,
        recoveryCommand: options.command,
      });
    });
  });
}
