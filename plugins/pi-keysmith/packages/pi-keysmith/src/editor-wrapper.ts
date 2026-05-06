import type { AppKeybinding } from "@mariozechner/pi-coding-agent";
import type { AutocompleteProvider, EditorComponent } from "@mariozechner/pi-tui";
import { MinimalLeaderState, type MinimalLeaderStateOptions } from "./leader.js";
import type { BindingTrie } from "./trie.js";

export const KEYSMITH_WRAPPER_MARKER = Symbol.for("pi-keysmith.editorWrapper");

type FocusableEditor = EditorComponent & { focused: boolean };
type MaybeAutocompleteEditor = EditorComponent & { isShowingAutocomplete?: () => boolean };
type CustomEditorLike = EditorComponent & {
  actionHandlers?: Map<AppKeybinding, () => void>;
  onEscape?: () => void;
  onCtrlD?: () => void;
  onPasteImage?: () => void;
  onExtensionShortcut?: (data: string) => boolean | undefined;
};

export interface KeysmithContextDiagnosticState {
  warnedVimNormalUnavailable?: boolean;
}

export interface KeysmithEditorWrapperOptions extends Omit<MinimalLeaderStateOptions, "dispatch" | "trie"> {
  enabledWhen?: string[];
  contextDiagnosticState?: KeysmithContextDiagnosticState;
  trie?: BindingTrie;
  dispatch(actionId: string): void;
}

export class KeysmithEditorWrapper implements EditorComponent {
  readonly [KEYSMITH_WRAPPER_MARKER] = true;
  readonly actionHandlers: Map<AppKeybinding, () => void> = new Map();
  onEscape?: () => void;
  onCtrlD?: () => void;
  onPasteImage?: () => void;
  onExtensionShortcut?: (data: string) => boolean | undefined;

  private readonly leader: MinimalLeaderState;
  private readonly leaderInput: string;
  private readonly enabledWhen: string[];
  private readonly diagnostics: { warn(message: string): void } | undefined;
  private readonly contextDiagnosticState: KeysmithContextDiagnosticState;
  private focusedFallback = false;
  private disposed = false;

  constructor(readonly inner: EditorComponent, options: KeysmithEditorWrapperOptions) {
    this.leaderInput = options.leader ?? "\u0018";
    this.enabledWhen = options.enabledWhen ?? ["editor"];
    this.diagnostics = normalizeDiagnostics(options.diagnostics);
    this.contextDiagnosticState = options.contextDiagnosticState ?? {};
    this.leader = new MinimalLeaderState({
      leader: options.leader,
      sequenceTimeoutMs: options.sequenceTimeoutMs,
      whichKeyDelayMs: options.whichKeyDelayMs,
      whichKeyOverlay: options.whichKeyOverlay,
      diagnostics: this.diagnostics,
      trie: options.trie,
      dispatch: options.dispatch,
    });
  }

  get isPending(): boolean {
    return this.leader.isPending;
  }

  get focused(): boolean {
    return isFocusableEditor(this.inner) ? this.inner.focused : this.focusedFallback;
  }

  set focused(value: boolean) {
    this.focusedFallback = value;
    if (isFocusableEditor(this.inner)) this.inner.focused = value;
  }

  get onSubmit(): ((text: string) => void) | undefined {
    return this.inner.onSubmit;
  }

  set onSubmit(handler: ((text: string) => void) | undefined) {
    this.inner.onSubmit = handler;
  }

  get onChange(): ((text: string) => void) | undefined {
    return this.inner.onChange;
  }

  set onChange(handler: ((text: string) => void) | undefined) {
    this.inner.onChange = handler;
  }

  get borderColor(): ((str: string) => string) | undefined {
    return this.inner.borderColor;
  }

  set borderColor(color: ((str: string) => string) | undefined) {
    this.inner.borderColor = color;
  }

  get wantsKeyRelease(): boolean | undefined {
    return this.inner.wantsKeyRelease;
  }

  set wantsKeyRelease(value: boolean | undefined) {
    this.inner.wantsKeyRelease = value;
  }

  render(width: number): string[] {
    return this.inner.render(width);
  }

  invalidate(): void {
    this.inner.invalidate();
  }

  getText(): string {
    return this.inner.getText();
  }

  setText(text: string): void {
    this.inner.setText(text);
  }

  getExpandedText(): string {
    return this.inner.getExpandedText?.() ?? this.inner.getText();
  }

  submitText = (text: string): void => {
    this.onSubmit?.(text);
  };

  onAction(action: AppKeybinding, handler: () => void): void {
    this.actionHandlers.set(action, handler);
    this.syncCustomEditorHandlers();
  }

  invokeAppAction(action: AppKeybinding): boolean {
    if (this.disposed) return false;
    const handler = this.actionHandlers.get(action);
    if (!handler) return false;
    handler();
    return true;
  }

  addToHistory(text: string): void {
    this.inner.addToHistory?.(text);
  }

  insertTextAtCursor(text: string): void {
    this.inner.insertTextAtCursor?.(text);
  }

  setAutocompleteProvider(provider: AutocompleteProvider): void {
    this.inner.setAutocompleteProvider?.(provider);
  }

  setPaddingX(padding: number): void {
    this.inner.setPaddingX?.(padding);
  }

  setAutocompleteMaxVisible(maxVisible: number): void {
    this.inner.setAutocompleteMaxVisible?.(maxVisible);
  }

  handleInput(data: string): void {
    if (this.disposed) {
      this.delegateInput(data);
      return;
    }

    this.syncCustomEditorHandlers();

    if (this.isAutocompleteVisible()) {
      this.leader.clear();
      this.delegateInput(data);
      return;
    }

    if (!this.contextsActive() && (this.leader.isPending || data === this.leaderInput)) {
      this.leader.clear();
      this.delegateInput(data);
      return;
    }

    if (this.leader.handleInput(data)) return;
    this.delegateInput(data);
  }

  dispose(): void {
    this.disposed = true;
    this.leader.dispose();
    (this.inner as EditorComponent & { dispose?: () => void }).dispose?.();
  }

  clearPending(): void {
    this.leader.clear();
  }

  private isAutocompleteVisible(): boolean {
    const editor = this.inner as MaybeAutocompleteEditor;
    try {
      return editor.isShowingAutocomplete?.() === true;
    } catch {
      return false;
    }
  }

  private delegateInput(data: string): void {
    this.inner.handleInput(data);
  }

  private contextsActive(): boolean {
    for (const context of this.enabledWhen) {
      if (context === "editor") {
        if (this.disposed) return false;
        continue;
      }
      if (context === "vim.normal") {
        if (!this.isVimNormal()) return false;
        continue;
      }
    }
    return true;
  }

  private isVimNormal(): boolean {
    const getMode = (this.inner as EditorComponent & { getMode?: () => unknown }).getMode;
    if (typeof getMode !== "function") {
      this.warnVimNormalUnavailable();
      return false;
    }

    try {
      return getMode.call(this.inner) === "normal";
    } catch {
      this.warnVimNormalUnavailable();
      return false;
    }
  }

  private warnVimNormalUnavailable(): void {
    if (this.contextDiagnosticState.warnedVimNormalUnavailable) return;
    this.contextDiagnosticState.warnedVimNormalUnavailable = true;
    this.diagnostics?.warn("pi-keysmith vim.normal context requested but wrapped editor mode is unavailable; delegating leader input");
  }

  private syncCustomEditorHandlers(): void {
    const inner = this.inner as CustomEditorLike;
    if (!(inner.actionHandlers instanceof Map)) return;

    if (!inner.onEscape && this.onEscape) inner.onEscape = this.onEscape;
    if (!inner.onCtrlD && this.onCtrlD) inner.onCtrlD = this.onCtrlD;
    if (!inner.onPasteImage && this.onPasteImage) inner.onPasteImage = this.onPasteImage;
    if (!inner.onExtensionShortcut && this.onExtensionShortcut) inner.onExtensionShortcut = this.onExtensionShortcut;

    for (const [action, handler] of this.actionHandlers) {
      inner.actionHandlers.set(action, handler);
    }
  }
}

function isFocusableEditor(editor: EditorComponent): editor is FocusableEditor {
  return "focused" in editor && typeof (editor as { focused?: unknown }).focused === "boolean";
}

function normalizeDiagnostics(
  diagnostics: MinimalLeaderStateOptions["diagnostics"],
): { warn(message: string): void } | undefined {
  if (Array.isArray(diagnostics)) return { warn: (message) => diagnostics.push(message) };
  return diagnostics;
}
