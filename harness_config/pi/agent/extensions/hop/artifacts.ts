import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export type HopPrefillMode = "clone" | "handoff";
export type HopPrefillOrigin = "user" | "agent";
export type HopPrefillStatus = "pending" | "consumed";

export interface HopPrefillMetadata {
  id: string;
  mode: HopPrefillMode;
  origin: HopPrefillOrigin;
  sourceCwd: string;
  sourceSessionFile?: string;
  destinationSessionFile?: string;
  createdAt: string;
  consumedAt?: string;
  status: HopPrefillStatus;
}

export interface CreatePrefillArtifactOptions {
  rootDir: string;
  prompt: string;
  metadata: Omit<HopPrefillMetadata, "id" | "createdAt" | "status" | "consumedAt"> & {
    id?: string;
    createdAt?: string;
  };
}

export interface PrefillArtifact {
  id: string;
  markdownPath: string;
  metadataPath: string;
  metadata: HopPrefillMetadata;
}

function safeId(): string {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID().slice(0, 8)}`;
}

export function getHopArtifactRoot(cwd: string): string {
  return join(cwd, ".pi", "artifacts", "hop");
}

export function getPrefillDir(rootDir: string, status: HopPrefillStatus): string {
  return join(rootDir, "prefills", status);
}

export function ensurePrefillDirs(rootDir: string): void {
  mkdirSync(getPrefillDir(rootDir, "pending"), { recursive: true });
  mkdirSync(getPrefillDir(rootDir, "consumed"), { recursive: true });
}

export function createPrefillArtifact(options: CreatePrefillArtifactOptions): PrefillArtifact {
  ensurePrefillDirs(options.rootDir);
  const id = options.metadata.id ?? safeId();
  const metadata: HopPrefillMetadata = {
    ...options.metadata,
    id,
    createdAt: options.metadata.createdAt ?? new Date().toISOString(),
    status: "pending",
  };
  const markdownPath = join(getPrefillDir(options.rootDir, "pending"), `${id}.md`);
  const metadataPath = join(getPrefillDir(options.rootDir, "pending"), `${id}.json`);
  writeFileSync(markdownPath, options.prompt, "utf8");
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  return { id, markdownPath, metadataPath, metadata };
}

export function getMetadataPathForMarkdown(markdownPath: string): string {
  return join(dirname(markdownPath), `${basename(markdownPath, ".md")}.json`);
}

export function readPrefillMarkdown(markdownPath: string): string {
  return readFileSync(markdownPath, "utf8");
}

export function readPrefillMetadata(markdownPath: string): HopPrefillMetadata {
  return JSON.parse(readFileSync(getMetadataPathForMarkdown(markdownPath), "utf8")) as HopPrefillMetadata;
}

export function consumePrefillArtifact(markdownPath: string): PrefillArtifact {
  const metadataPath = getMetadataPathForMarkdown(markdownPath);
  if (!existsSync(markdownPath)) {
    throw new Error(`Prefill markdown not found: ${markdownPath}`);
  }
  if (!existsSync(metadataPath)) {
    throw new Error(`Prefill metadata not found: ${metadataPath}`);
  }

  const metadata = readPrefillMetadata(markdownPath);
  const rootDir = dirname(dirname(dirname(markdownPath)));
  ensurePrefillDirs(rootDir);
  const consumedMarkdownPath = join(getPrefillDir(rootDir, "consumed"), basename(markdownPath));
  const consumedMetadataPath = join(getPrefillDir(rootDir, "consumed"), basename(metadataPath));
  const consumedMetadata: HopPrefillMetadata = {
    ...metadata,
    status: "consumed",
    consumedAt: new Date().toISOString(),
  };

  writeFileSync(metadataPath, `${JSON.stringify(consumedMetadata, null, 2)}\n`, "utf8");
  renameSync(markdownPath, consumedMarkdownPath);
  renameSync(metadataPath, consumedMetadataPath);

  return {
    id: consumedMetadata.id,
    markdownPath: consumedMarkdownPath,
    metadataPath: consumedMetadataPath,
    metadata: consumedMetadata,
  };
}
