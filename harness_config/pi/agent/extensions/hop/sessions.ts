import { existsSync } from "node:fs";
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { SessionManager } from "@earendil-works/pi-coding-agent";

interface WritableSessionManager {
  _rewriteFile?: () => void;
  getSessionFile(): string | undefined;
}

export interface CreatedSessionFile {
  path: string;
  sourceSessionFile: string;
}

function requireSourceSession(ctx: ExtensionCommandContext): string {
  const sourceSessionFile = ctx.sessionManager.getSessionFile();
  if (!sourceSessionFile) {
    throw new Error("Hop requires a persisted source session; current session is ephemeral.");
  }
  return sourceSessionFile;
}

function forceSessionFile(manager: WritableSessionManager): string {
  const file = manager.getSessionFile();
  if (!file) {
    throw new Error("Pi did not allocate a destination session file.");
  }
  if (!existsSync(file)) {
    if (typeof manager._rewriteFile !== "function") {
      throw new Error(`Destination session file was not flushed and _rewriteFile is unavailable: ${file}`);
    }
    manager._rewriteFile();
  }
  if (!existsSync(file)) {
    throw new Error(`Destination session file was not created: ${file}`);
  }
  return file;
}

export function createFreshDestinationSession(ctx: ExtensionCommandContext): CreatedSessionFile {
  const sourceSessionFile = requireSourceSession(ctx);
  const sessionDir = ctx.sessionManager.getSessionDir();
  const destination = SessionManager.create(ctx.cwd, sessionDir) as SessionManager & WritableSessionManager;
  destination.newSession({ parentSession: sourceSessionFile });
  const path = forceSessionFile(destination);
  if (path === sourceSessionFile) {
    throw new Error("Refusing to open source session file concurrently.");
  }
  return { path, sourceSessionFile };
}

export function cloneActiveBranch(ctx: ExtensionCommandContext): CreatedSessionFile {
  const sourceSessionFile = requireSourceSession(ctx);
  const sessionDir = ctx.sessionManager.getSessionDir();
  const leafId = ctx.sessionManager.getLeafId();
  if (!leafId) {
    throw new Error("No conversation to clone yet. Start a chat first, then run /hop clone.");
  }

  const sourceCopy = SessionManager.open(sourceSessionFile, sessionDir) as SessionManager & WritableSessionManager;
  const cloneFile = sourceCopy.createBranchedSession(leafId);
  if (!cloneFile) {
    throw new Error("Failed to create cloned session file.");
  }

  const path = forceSessionFile(sourceCopy);
  if (path !== cloneFile) {
    throw new Error(`Clone session path mismatch: ${path} !== ${cloneFile}`);
  }
  if (path === sourceSessionFile) {
    throw new Error("Refusing to open source session file concurrently.");
  }

  return { path, sourceSessionFile };
}
