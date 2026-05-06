import type { AutocompleteProvider, EditorComponent } from "@mariozechner/pi-tui";
import { describe, expect, it } from "vitest";
import { KeysmithEditorWrapper } from "./editor-wrapper.js";
import { TOOLS_TOGGLE_ACTION_ID } from "./leader.js";

class FakeEditor implements EditorComponent {
  readonly handledInputs: string[] = [];
  mode: "normal" | "insert" | undefined;
  readonly history: string[] = [];
  readonly inserted: string[] = [];
  autocompleteProvider: AutocompleteProvider | undefined;
  autocompleteVisible = false;
  autocompleteMaxVisible: number | undefined;
  focused = false;
  invalidated = false;
  paddingX: number | undefined;
  text = "";
  wantsKeyRelease = false;
  borderColor: ((str: string) => string) | undefined;
  onSubmit?: (text: string) => void;
  onChange?: (text: string) => void;

  render(width: number): string[] {
    return [`${width}:${this.text}`];
  }

  invalidate(): void {
    this.invalidated = true;
  }

  getText(): string {
    return this.text;
  }

  setText(text: string): void {
    this.text = text;
    this.onChange?.(text);
  }

  handleInput(data: string): void {
    this.handledInputs.push(data);
  }

  addToHistory(text: string): void {
    this.history.push(text);
  }

  insertTextAtCursor(text: string): void {
    this.inserted.push(text);
  }

  getExpandedText(): string {
    return `${this.text}:expanded`;
  }

  setAutocompleteProvider(provider: AutocompleteProvider): void {
    this.autocompleteProvider = provider;
  }

  setPaddingX(padding: number): void {
    this.paddingX = padding;
  }

  setAutocompleteMaxVisible(maxVisible: number): void {
    this.autocompleteMaxVisible = maxVisible;
  }

  isShowingAutocomplete(): boolean {
    return this.autocompleteVisible;
  }

  getMode(): "normal" | "insert" | undefined {
    return this.mode;
  }
}

class CustomEditorLikeFake extends FakeEditor {
  actionHandlers = new Map<string, () => void>();
  onEscape?: () => void;
  onCtrlD?: () => void;
  onPasteImage?: () => void;
  onExtensionShortcut?: (data: string) => boolean | undefined;
}

describe("KeysmithEditorWrapper", () => {
  it("delegates the editor surface and forwards callbacks/properties", () => {
    const inner = new FakeEditor();
    const wrapper = new KeysmithEditorWrapper(inner, { dispatch: () => undefined });
    const changes: string[] = [];
    const submits: string[] = [];
    const color = (str: string) => `color:${str}`;
    const provider: AutocompleteProvider = {
      async getSuggestions() {
        return { items: [], prefix: "" };
      },
      applyCompletion(lines, cursorLine, cursorCol) {
        return { lines, cursorLine, cursorCol };
      },
    };

    wrapper.onChange = (text) => changes.push(text);
    wrapper.onSubmit = (text) => submits.push(text);
    wrapper.focused = true;
    wrapper.borderColor = color;
    wrapper.wantsKeyRelease = true;
    wrapper.setText("hello");
    wrapper.addToHistory("hello");
    wrapper.insertTextAtCursor("!");
    wrapper.setAutocompleteProvider(provider);
    wrapper.setPaddingX(2);
    wrapper.setAutocompleteMaxVisible(7);
    wrapper.invalidate();
    wrapper.onSubmit?.(wrapper.getText());

    expect(wrapper.render(12)).toEqual(["12:hello"]);
    expect(wrapper.getText()).toBe("hello");
    expect(wrapper.getExpandedText()).toBe("hello:expanded");
    expect(wrapper.focused).toBe(true);
    expect(inner.focused).toBe(true);
    expect(inner.borderColor).toBe(color);
    expect(inner.wantsKeyRelease).toBe(true);
    expect(inner.history).toEqual(["hello"]);
    expect(inner.inserted).toEqual(["!"]);
    expect(inner.autocompleteProvider).toBe(provider);
    expect(inner.paddingX).toBe(2);
    expect(inner.autocompleteMaxVisible).toBe(7);
    expect(inner.invalidated).toBe(true);
    expect(changes).toEqual(["hello"]);
    expect(submits).toEqual(["hello"]);
  });

  it("exposes a safe submitText seam that submits without mutating the current draft", () => {
    const inner = new FakeEditor();
    inner.text = "existing draft";
    const wrapper = new KeysmithEditorWrapper(inner, { dispatch: () => undefined });
    const submits: string[] = [];
    wrapper.onSubmit = (text) => submits.push(text);

    const submitText = (wrapper as unknown as { submitText?: (text: string) => void }).submitText;

    expect(submitText, "wrapper should expose a submit bridge for runtime slash fallbacks").toEqual(expect.any(Function));
    submitText?.("/obs");

    expect(submits).toEqual(["/obs"]);
    expect(wrapper.getText()).toBe("existing draft");
    expect(inner.history).toEqual([]);
  });

  it("delegates idle non-leader input", () => {
    const inner = new FakeEditor();
    const wrapper = new KeysmithEditorWrapper(inner, { dispatch: () => undefined });

    wrapper.handleInput("a");

    expect(inner.handledInputs).toEqual(["a"]);
  });

  it("consumes ctrl+x then hardcoded t sequence and dispatches tools toggle", () => {
    const dispatches: string[] = [];
    const inner = new FakeEditor();
    const wrapper = new KeysmithEditorWrapper(inner, { dispatch: (actionId) => dispatches.push(actionId) });

    wrapper.handleInput("\u0018");
    wrapper.handleInput("t");

    expect(dispatches).toEqual([TOOLS_TOGGLE_ACTION_ID]);
    expect(inner.handledInputs).toEqual([]);
    expect(wrapper.isPending).toBe(false);
  });

  it("clears pending state on invalid sequence and leaves later input delegated", () => {
    const inner = new FakeEditor();
    const wrapper = new KeysmithEditorWrapper(inner, { dispatch: () => undefined });

    wrapper.handleInput("\u0018");
    wrapper.handleInput("z");
    wrapper.handleInput("a");

    expect(wrapper.isPending).toBe(false);
    expect(inner.handledInputs).toEqual(["a"]);
  });

  it("suppresses leader capture and clears pending while autocomplete is visible", () => {
    const inner = new FakeEditor();
    const wrapper = new KeysmithEditorWrapper(inner, { dispatch: () => undefined });

    wrapper.handleInput("\u0018");
    inner.autocompleteVisible = true;
    wrapper.handleInput("t");
    wrapper.handleInput("\u0018");

    expect(wrapper.isPending).toBe(false);
    expect(inner.handledInputs).toEqual(["t", "\u0018"]);
  });

  it("syncs app handlers to CustomEditor-like inners before delegation", () => {
    const inner = new CustomEditorLikeFake();
    const wrapper = new KeysmithEditorWrapper(inner, { dispatch: () => undefined });
    const clearHandler = () => undefined;
    const escapeHandler = () => undefined;

    wrapper.actionHandlers.set("app.clear", clearHandler);
    wrapper.onEscape = escapeHandler;
    wrapper.handleInput("a");

    expect(inner.actionHandlers.get("app.clear")).toBe(clearHandler);
    expect(inner.onEscape).toBe(escapeHandler);
  });

  describe("vim.normal context", () => {
    it("consumes <space> leader when wrapped inner editor reports normal mode", () => {
      const dispatches: string[] = [];
      const inner = new FakeEditor();
      inner.mode = "normal";
      const wrapper = new KeysmithEditorWrapper(inner, {
        leader: " ",
        enabledWhen: ["editor", "vim.normal"],
        dispatch: (actionId: string) => dispatches.push(actionId),
      } as never);

      wrapper.handleInput(" ");
      wrapper.handleInput("t");

      expect(dispatches).toEqual([TOOLS_TOGGLE_ACTION_ID]);
      expect(inner.handledInputs).toEqual([]);
    });

    it("delegates <space> leader in insert mode when vim.normal is required", () => {
      const inner = new FakeEditor();
      inner.mode = "insert";
      const wrapper = new KeysmithEditorWrapper(inner, {
        leader: " ",
        enabledWhen: ["editor", "vim.normal"],
        dispatch: () => undefined,
      } as never);

      wrapper.handleInput(" ");

      expect(wrapper.isPending).toBe(false);
      expect(inner.handledInputs).toEqual([" "]);
    });

    it("delegates <space> and emits one diagnostic when vim.normal is required but getMode is unavailable", () => {
      const warnings: string[] = [];
      const inner = new FakeEditor();
      inner.getMode = undefined as never;
      const wrapper = new KeysmithEditorWrapper(inner, {
        leader: " ",
        enabledWhen: ["editor", "vim.normal"],
        diagnostics: { warn: (message: string) => warnings.push(message) },
        dispatch: () => undefined,
      } as never);

      wrapper.handleInput(" ");
      wrapper.handleInput(" ");

      expect(wrapper.isPending).toBe(false);
      expect(inner.handledInputs).toEqual([" ", " "]);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("vim.normal");
    });

    it("delegates <space> and emits one diagnostic when vim.normal getMode throws", () => {
      const warnings: string[] = [];
      const inner = new FakeEditor();
      inner.getMode = () => {
        throw new Error("mode unavailable");
      };
      const wrapper = new KeysmithEditorWrapper(inner, {
        leader: " ",
        enabledWhen: ["editor", "vim.normal"],
        diagnostics: { warn: (message: string) => warnings.push(message) },
        dispatch: () => undefined,
      } as never);

      wrapper.handleInput(" ");
      wrapper.handleInput(" ");

      expect(wrapper.isPending).toBe(false);
      expect(inner.handledInputs).toEqual([" ", " "]);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("vim.normal");
    });
  });
});
