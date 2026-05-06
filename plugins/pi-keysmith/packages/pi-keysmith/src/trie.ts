import { ESCAPE_INPUT } from "./leader.js";
import { parseKeySequence } from "./parser.js";

export interface BindingSpecEntry {
  action?: string;
  desc?: string;
  name?: string;
  source?: string;
  [key: string]: BindingSpecEntry | string | undefined;
}

export type BindingSpec = Record<string, BindingSpecEntry | null>;

export interface BindingTrieNode {
  key?: string;
  action?: string;
  desc?: string;
  group?: string;
  source?: string;
  children: Map<string, BindingTrieNode>;
}

export interface BindingTrie extends BindingTrieNode {
  children: Map<string, BindingTrieNode>;
}

export function buildBindingTrie(spec: BindingSpec = {}): BindingTrie {
  const root: BindingTrie = { children: new Map() };
  const actions = new Map<string, { sequence: string; source: string }>();
  addEntries(root, spec, actions);
  return root;
}

function addEntries(parent: BindingTrieNode, spec: BindingSpec, actions: Map<string, { sequence: string; source: string }>): void {
  for (const [key, entry] of Object.entries(spec)) {
    if (!entry || typeof entry !== "object") continue;
    const tokens = parseKeySequence(key, { allowLeaderPrefix: true });
    if (tokens.some((token) => token.input === ESCAPE_INPUT)) {
      throw new Error("<esc> is reserved for pending sequence cancellation and cannot be used as a binding key");
    }
    const sequence = tokens.map((token) => token.input).join("");
    const node = ensurePath(parent, tokens.map((token) => token.input));
    const source = typeof entry.source === "string" ? entry.source : "unknown";
    if (node.action) throw new Error(`binding conflict at ${sequence}: ${node.source ?? "unknown"} and ${source}`);
    if (typeof entry.action === "string" && node.children.size > 0) throw new Error(`prefix/action ambiguity at ${sequence}`);
    if (typeof entry.action === "string" && (typeof entry.name === "string" || node.group)) throw new Error(`group/action conflict at ${sequence}`);
    if (typeof entry.name === "string" && node.action) throw new Error(`group/action conflict at ${sequence}`);
    node.key = key;
    if (typeof entry.action === "string") {
      const previous = actions.get(entry.action);
      if (previous && previous.sequence !== sequence) {
        throw new Error(`duplicate action ${entry.action}: ${previous.source} and ${source}`);
      }
      actions.set(entry.action, { sequence, source });
      node.action = entry.action;
      node.source = source;
    }
    if (typeof entry.desc === "string") node.desc = entry.desc;
    if (typeof entry.name === "string") node.group = entry.name;

    const childSpec: BindingSpec = {};
    for (const [childKey, childEntry] of Object.entries(entry)) {
      if (childKey === "action" || childKey === "desc" || childKey === "name" || childKey === "source") continue;
      if (childEntry && typeof childEntry === "object") childSpec[childKey] = childEntry;
    }
    addEntries(node, childSpec, actions);
  }
}

function ensurePath(parent: BindingTrieNode, inputs: string[]): BindingTrieNode {
  let node = parent;
  for (const [index, input] of inputs.entries()) {
    if (node.action && index < inputs.length) throw new Error(`prefix/action ambiguity at ${node.key ?? input}`);
    let child = node.children.get(input);
    if (!child) {
      child = { key: input, children: new Map() };
      node.children.set(input, child);
    }
    node = child;
  }
  return node;
}
