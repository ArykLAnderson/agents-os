export const DEFAULT_LEADER = "\u0018";
export const DEFAULT_SEQUENCE_TIMEOUT_MS = 1000;
export const TOOLS_TOGGLE_SEQUENCE = "t";
export const TOOLS_TOGGLE_ACTION_ID = "pi-keysmith.tools.expand.toggle";
export const ESCAPE_INPUT = "\u001b";

export interface MinimalLeaderNode {
  key?: string;
  action?: string;
  desc?: string;
  group?: string;
  children: Map<string, MinimalLeaderNode>;
}

export interface WhichKeyPanelEntry {
  key: string;
  label: string;
  kind: "action" | "group";
}

export interface WhichKeyPanel {
  entries: WhichKeyPanelEntry[];
  anchor: "bottom-right";
  nonCapturing: true;
}

export interface WhichKeyHandle {
  hide?(): void;
  dispose(): void;
}

export interface WhichKeyOverlay {
  show(panel: WhichKeyPanel): WhichKeyHandle;
  cancelPendingShow?(): void;
}

export interface MinimalLeaderStateOptions {
  leader?: string;
  sequenceTimeoutMs?: number;
  whichKeyDelayMs?: number;
  whichKeyOverlay?: WhichKeyOverlay;
  diagnostics?: { warn(message: string): void } | string[];
  trie?: MinimalLeaderNode;
  dispatch(actionId: string): void;
}

export class MinimalLeaderState {
  private readonly leader: string;
  private readonly sequenceTimeoutMs: number;
  private readonly dispatch: (actionId: string) => void;
  private readonly trie: MinimalLeaderNode;
  private readonly whichKeyDelayMs: number | undefined;
  private readonly whichKeyOverlay: WhichKeyOverlay | undefined;
  private readonly diagnostics: { warn(message: string): void } | undefined;
  private pending = false;
  private currentNode: MinimalLeaderNode | undefined;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private whichKeyTimer: ReturnType<typeof setTimeout> | undefined;
  private whichKeyHandle: WhichKeyHandle | undefined;
  private visibleWhichKeyNode: MinimalLeaderNode | undefined;
  private currentPath: MinimalLeaderNode[] = [];

  constructor(options: MinimalLeaderStateOptions) {
    this.leader = options.leader ?? DEFAULT_LEADER;
    this.sequenceTimeoutMs = options.sequenceTimeoutMs ?? DEFAULT_SEQUENCE_TIMEOUT_MS;
    this.whichKeyDelayMs = options.whichKeyDelayMs;
    this.whichKeyOverlay = options.whichKeyOverlay;
    if (Array.isArray(options.diagnostics)) {
      const diagnostics = options.diagnostics;
      this.diagnostics = { warn: (message) => diagnostics.push(message) };
    } else {
      this.diagnostics = options.diagnostics;
    }
    this.dispatch = options.dispatch;
    this.trie = options.trie ?? {
      children: new Map([[TOOLS_TOGGLE_SEQUENCE, { action: TOOLS_TOGGLE_ACTION_ID, children: new Map() }]]),
    };
  }

  get isPending(): boolean {
    return this.pending;
  }

  handleInput(data: string): boolean {
    if (data === ESCAPE_INPUT && this.whichKeyHandle) {
      if (this.backOutFromVisibleSubmenu()) return true;
      this.clear();
      return true;
    }

    if (this.pending) {
      if (data === ESCAPE_INPUT) {
        this.clear();
        return true;
      }

      return this.handleSequenceInput(data);
    }

    if (this.whichKeyHandle && this.currentNode) {
      const nextNode = this.currentNode.children.get(data);
      if (nextNode) return this.handleSequenceInput(data);
      if (data !== this.leader) {
        this.clear();
        return true;
      }
    }

    if (data === this.leader) {
      this.pending = true;
      this.currentNode = this.trie;
      this.currentPath = [this.trie];
      this.resetTimeout();
      this.scheduleWhichKey();
      return true;
    }

    return false;
  }

  clear(): void {
    this.pending = false;
    this.currentNode = undefined;
    this.currentPath = [];
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = undefined;
    }
    this.clearWhichKey();
  }

  dispose(): void {
    this.clear();
  }

  private resetTimeout(): void {
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = setTimeout(() => this.expireSequence(), this.sequenceTimeoutMs);
  }

  private expireSequence(): void {
    this.pending = false;
    this.timeout = undefined;
    if (!this.whichKeyHandle) {
      this.currentNode = undefined;
      this.cancelPendingWhichKeyShow();
    }
  }

  private handleSequenceInput(data: string): boolean {
    const nextNode = this.currentNode?.children.get(data);
    if (nextNode?.action) {
      this.clear();
      this.dispatch(nextNode.action);
      return true;
    }
    if (nextNode) {
      this.pending = true;
      this.currentPath = [...this.currentPath, nextNode];
      this.currentNode = nextNode;
      this.resetTimeout();
      this.scheduleWhichKey();
      return true;
    }

    this.clear();
    return true;
  }

  private scheduleWhichKey(): void {
    if (!this.whichKeyOverlay || this.whichKeyDelayMs === undefined || !this.currentNode) return;
    this.cancelPendingWhichKeyShow();
    const scheduledNode = this.currentNode;
    this.whichKeyTimer = setTimeout(() => {
      this.whichKeyTimer = undefined;
      if (this.currentNode !== scheduledNode || (!this.pending && !this.whichKeyHandle)) return;
      this.showWhichKey(scheduledNode);
    }, this.whichKeyDelayMs);
  }

  private cancelPendingWhichKeyShow(): void {
    if (!this.whichKeyTimer) return;
    clearTimeout(this.whichKeyTimer);
    this.whichKeyTimer = undefined;
    this.whichKeyOverlay?.cancelPendingShow?.();
  }

  private clearWhichKey(): void {
    this.cancelPendingWhichKeyShow();
    this.whichKeyHandle?.hide?.();
    this.whichKeyHandle?.dispose();
    this.whichKeyHandle = undefined;
    this.visibleWhichKeyNode = undefined;
  }

  private showWhichKey(node: MinimalLeaderNode): void {
    this.whichKeyHandle?.hide?.();
    this.whichKeyHandle?.dispose();
    this.whichKeyHandle = this.whichKeyOverlay?.show({
      anchor: "bottom-right",
      nonCapturing: true,
      entries: this.renderEntries(node),
    });
    this.visibleWhichKeyNode = this.whichKeyHandle ? node : undefined;
  }

  private backOutFromVisibleSubmenu(): boolean {
    if (!this.currentNode || this.visibleWhichKeyNode !== this.currentNode || this.currentPath.length <= 1) return false;

    const previousNode = this.currentPath[this.currentPath.length - 2];
    if (!previousNode) return false;

    this.currentPath = this.currentPath.slice(0, -1);
    this.currentNode = previousNode;
    this.pending = true;
    this.resetTimeout();
    this.cancelPendingWhichKeyShow();
    this.showWhichKey(previousNode);
    return true;
  }

  private renderEntries(node: MinimalLeaderNode): WhichKeyPanelEntry[] {
    return [...node.children.entries()].map(([key, child]) => {
      const displayKey = displayKeyForInput(key);
      if (child.action) return { key: displayKey, label: child.desc ?? child.action, kind: "action" };

      if (!child.group) this.diagnostics?.warn(`pi-keysmith which-key unlabeled group at ${displayKey}; rendering as +…`);
      return { key: displayKey, label: child.group ? `+${child.group}` : "+…", kind: "group" };
    });
  }
}

function displayKeyForInput(input: string): string {
  switch (input) {
    case "\u0018":
      return "<ctrl+x>";
    case " ":
      return "<space>";
    case "\t":
      return "<tab>";
    case "\r":
      return "<cr>";
    case ESCAPE_INPUT:
      return "<esc>";
    default:
      return input;
  }
}
