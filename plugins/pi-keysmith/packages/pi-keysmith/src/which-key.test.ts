import { visibleWidth, type Component, type OverlayOptions } from "@mariozechner/pi-tui";
import { describe, expect, it, vi } from "vitest";
import { MinimalLeaderState, type MinimalLeaderStateOptions, type WhichKeyPanel } from "./leader.js";
import { buildBindingTrie } from "./trie.js";
import { createTuiWhichKeyOverlay, WhichKeyPanelComponent, type WhichKeyPanelComponentOptions } from "./which-key.js";

type TestableWhichKeyPanelOptions = WhichKeyPanelComponentOptions & {
  stylizeBorder?: (text: string) => string;
};

function borderSegments(rendered: string, tag = "border"): string[] {
  return [...rendered.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "g"))].map((match) => match[1]);
}

function expectNoUnstyledBorderGlyphs(rendered: string, tag = "border"): void {
  const withoutStyledBorders = rendered.replace(new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, "g"), "");
  expect(withoutStyledBorders).not.toMatch(/[╭╮╰╯─│]/);
}

class FakeWhichKeyOverlay {
  readonly shown: WhichKeyPanel[] = [];
  hideCount = 0;
  disposeCount = 0;
  cancelPendingShowCount = 0;

  show(panel: WhichKeyPanel) {
    this.shown.push(panel);
    return {
      hide: () => {
        this.hideCount += 1;
      },
      dispose: () => {
        this.disposeCount += 1;
      },
    };
  }

  cancelPendingShow() {
    this.cancelPendingShowCount += 1;
  }
}

function createLeader(
  options: Partial<MinimalLeaderStateOptions> & {
    whichKeyDelayMs?: number;
    whichKeyOverlay?: FakeWhichKeyOverlay;
    diagnostics?: string[];
  } = {},
) {
  const dispatches: string[] = [];
  const overlay = options.whichKeyOverlay ?? new FakeWhichKeyOverlay();
  const diagnostics = options.diagnostics ?? [];
  const trie =
    options.trie ??
    buildBindingTrie({
      f: { action: "file.find", desc: "Find file" },
      b: {
        name: "buffers",
        n: { action: "buffer.next", desc: "Next buffer" },
      },
      g: {
        s: { action: "git.status", desc: "Git status" },
      },
    });

  const leader = new MinimalLeaderState({
    leader: " ",
    sequenceTimeoutMs: 100,
    whichKeyDelayMs: 25,
    whichKeyOverlay: {
      show: (panel: WhichKeyPanel) => overlay.show(panel),
      cancelPendingShow: () => overlay.cancelPendingShow(),
    },
    diagnostics: { warn: (message: string) => diagnostics.push(message) },
    ...options,
    trie,
    dispatch: (actionId: string) => dispatches.push(actionId),
  } as unknown as MinimalLeaderStateOptions);

  return { diagnostics, dispatches, leader, overlay };
}

describe("MinimalLeaderState which-key discoverability", () => {
  it("shows a non-capturing bottom-right panel for the current trie level after the configured delay", () => {
    vi.useFakeTimers();
    try {
      const { leader, overlay } = createLeader();

      leader.handleInput(" ");
      expect(overlay.shown).toEqual([]);

      vi.advanceTimersByTime(24);
      expect(overlay.shown).toEqual([]);

      vi.advanceTimersByTime(1);
      expect(overlay.shown).toHaveLength(1);
      expect(overlay.shown[0]).toMatchObject({ anchor: "bottom-right", nonCapturing: true });
      expect(overlay.shown[0].entries).toEqual([
        { key: "f", label: "Find file", kind: "action" },
        { key: "b", label: "+buffers", kind: "group" },
        { key: "g", label: "+…", kind: "group" },
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("emits a diagnostic when rendering an unlabeled group as +…", () => {
    vi.useFakeTimers();
    try {
      const { diagnostics, leader } = createLeader();

      leader.handleInput(" ");
      vi.advanceTimersByTime(25);

      expect(diagnostics).toEqual([expect.stringContaining("unlabeled group")]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not show a panel when a complete sequence is typed before whichKeyDelayMs", () => {
    vi.useFakeTimers();
    try {
      const { dispatches, leader, overlay } = createLeader();

      leader.handleInput(" ");
      vi.advanceTimersByTime(10);
      leader.handleInput("f");
      vi.advanceTimersByTime(25);

      expect(dispatches).toEqual(["file.find"]);
      expect(overlay.shown).toEqual([]);
      expect(overlay.cancelPendingShowCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("updates the panel to the pending child group after the delay while a sequence remains pending", () => {
    vi.useFakeTimers();
    try {
      const { leader, overlay } = createLeader();

      leader.handleInput(" ");
      leader.handleInput("b");
      vi.advanceTimersByTime(25);

      expect(overlay.shown).toHaveLength(1);
      expect(overlay.shown[0].entries).toEqual([{ key: "n", label: "Next buffer", kind: "action" }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the visible panel open while delaying the next level after an unfinished prefix key", () => {
    vi.useFakeTimers();
    try {
      const { leader, overlay } = createLeader();

      leader.handleInput(" ");
      vi.advanceTimersByTime(25);
      expect(overlay.shown).toHaveLength(1);

      leader.handleInput("b");

      expect(leader.isPending).toBe(true);
      expect(overlay.hideCount).toBe(0);
      expect(overlay.disposeCount).toBe(0);
      expect(overlay.shown).toHaveLength(1);

      vi.advanceTimersByTime(24);
      expect(overlay.shown).toHaveLength(1);

      vi.advanceTimersByTime(1);
      expect(overlay.shown).toHaveLength(2);
      expect(overlay.shown.at(-1)?.entries).toEqual([{ key: "n", label: "Next buffer", kind: "action" }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats escape as pending cancellation instead of dispatching an escape binding", () => {
    vi.useFakeTimers();
    try {
      const { dispatches, leader, overlay } = createLeader({
        trie: {
          children: new Map([
            ["\u001b", { key: "<esc>", action: "cancel.must.not.dispatch", children: new Map() }],
            ["f", { key: "f", action: "file.find", children: new Map() }],
          ]),
        },
      } as never);

      leader.handleInput(" ");
      vi.advanceTimersByTime(25);
      expect(overlay.shown).toHaveLength(1);

      expect(leader.handleInput("\u001b")).toBe(true);

      expect(leader.isPending).toBe(false);
      expect(dispatches).toEqual([]);
      expect(overlay.disposeCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("backs out from a visible submenu on escape and closes only when escape is pressed at root", () => {
    vi.useFakeTimers();
    try {
      const { dispatches, leader, overlay } = createLeader();
      const rootEntries = [
        { key: "f", label: "Find file", kind: "action" },
        { key: "b", label: "+buffers", kind: "group" },
        { key: "g", label: "+…", kind: "group" },
      ];
      const bufferEntries = [{ key: "n", label: "Next buffer", kind: "action" }];

      leader.handleInput(" ");
      vi.advanceTimersByTime(25);
      expect(overlay.shown.at(-1)?.entries).toEqual(rootEntries);

      leader.handleInput("b");
      vi.advanceTimersByTime(25);
      expect(overlay.shown.at(-1)?.entries).toEqual(bufferEntries);

      expect(leader.handleInput("\u001b")).toBe(true);

      expect(overlay.shown.at(-1)?.entries).toEqual(rootEntries);

      const disposeCountBeforeRootEscape = overlay.disposeCount;
      expect(leader.handleInput("\u001b")).toBe(true);

      expect(dispatches).toEqual([]);
      expect(overlay.disposeCount).toBeGreaterThan(disposeCountBeforeRootEscape);
      expect(leader.handleInput("f")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels instead of backing out when escape is pressed before the submenu panel is visible", () => {
    vi.useFakeTimers();
    try {
      const createEditLeader = () =>
        createLeader({
          trie: buildBindingTrie({
            e: {
              name: "edit",
              x: { action: "edit.execute", desc: "Execute edit" },
            },
            t: { action: "root.tools", desc: "Tools" },
          }),
        });
      const rootEntries = [
        { key: "e", label: "+edit", kind: "group" },
        { key: "t", label: "Tools", kind: "action" },
      ];

      const fast = createEditLeader();
      fast.leader.handleInput(" ");
      fast.leader.handleInput("e");
      expect(fast.leader.handleInput("\u001b")).toBe(true);
      expect(fast.leader.handleInput("t")).toBe(false);
      expect(fast.dispatches).toEqual([]);
      expect(fast.overlay.shown).toEqual([]);

      const delayedSubmenu = createEditLeader();
      delayedSubmenu.leader.handleInput(" ");
      vi.advanceTimersByTime(25);
      expect(delayedSubmenu.overlay.shown.at(-1)?.entries).toEqual(rootEntries);

      delayedSubmenu.leader.handleInput("e");
      vi.advanceTimersByTime(24);
      expect(delayedSubmenu.overlay.shown).toHaveLength(1);
      expect(delayedSubmenu.overlay.shown.at(-1)?.entries).toEqual(rootEntries);

      expect(delayedSubmenu.leader.handleInput("\u001b")).toBe(true);
      expect(delayedSubmenu.leader.handleInput("t")).toBe(false);

      expect(delayedSubmenu.dispatches).toEqual([]);
      expect(delayedSubmenu.overlay.disposeCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses root bindings after escape back navigation and does not dispatch stale submenu choices until re-entry", () => {
    vi.useFakeTimers();
    try {
      const { dispatches, leader, overlay } = createLeader();
      const rootEntries = [
        { key: "f", label: "Find file", kind: "action" },
        { key: "b", label: "+buffers", kind: "group" },
        { key: "g", label: "+…", kind: "group" },
      ];

      leader.handleInput(" ");
      leader.handleInput("b");
      vi.advanceTimersByTime(25);
      expect(overlay.shown.at(-1)?.entries).toEqual([{ key: "n", label: "Next buffer", kind: "action" }]);

      expect(leader.handleInput("\u001b")).toBe(true);
      expect(overlay.shown.at(-1)?.entries).toEqual(rootEntries);

      expect(leader.handleInput("f")).toBe(true);
      expect(dispatches).toEqual(["file.find"]);

      leader.handleInput(" ");
      leader.handleInput("b");
      vi.advanceTimersByTime(25);
      expect(leader.handleInput("\u001b")).toBe(true);
      expect(overlay.shown.at(-1)?.entries).toEqual(rootEntries);

      expect(leader.handleInput("n")).toBe(true);
      expect(dispatches).toEqual(["file.find"]);

      leader.handleInput(" ");
      leader.handleInput("b");
      expect(leader.handleInput("n")).toBe(true);
      expect(dispatches).toEqual(["file.find", "buffer.next"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the visible panel open when sequenceTimeoutMs elapses", () => {
    vi.useFakeTimers();
    try {
      const { leader, overlay } = createLeader();

      leader.handleInput(" ");
      vi.advanceTimersByTime(25);
      expect(overlay.shown).toHaveLength(1);

      vi.advanceTimersByTime(100);

      expect(overlay.hideCount).toBe(0);
      expect(overlay.disposeCount).toBe(0);
      expect(overlay.shown).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps root-level displayed action keys selectable after sequenceTimeoutMs elapses while the panel remains visible", () => {
    vi.useFakeTimers();
    try {
      const { dispatches, leader, overlay } = createLeader();

      leader.handleInput(" ");
      vi.advanceTimersByTime(25);
      expect(overlay.shown).toHaveLength(1);
      expect(overlay.shown[0].entries).toContainEqual({ key: "f", label: "Find file", kind: "action" });

      vi.advanceTimersByTime(100);
      expect(overlay.shown).toHaveLength(1);
      expect(overlay.disposeCount).toBe(0);

      expect(leader.handleInput("f")).toBe(true);

      expect(dispatches).toEqual(["file.find"]);
      expect(overlay.disposeCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps child-level displayed action keys selectable after sequenceTimeoutMs elapses while the next-level panel remains visible", () => {
    vi.useFakeTimers();
    try {
      const { dispatches, leader, overlay } = createLeader();

      leader.handleInput(" ");
      leader.handleInput("b");
      vi.advanceTimersByTime(25);
      expect(overlay.shown).toHaveLength(1);
      expect(overlay.shown[0].entries).toEqual([{ key: "n", label: "Next buffer", kind: "action" }]);

      vi.advanceTimersByTime(100);
      expect(overlay.shown).toHaveLength(1);
      expect(overlay.disposeCount).toBe(0);

      expect(leader.handleInput("n")).toBe(true);

      expect(dispatches).toEqual(["buffer.next"]);
      expect(overlay.disposeCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("closes the still-visible panel on escape after sequenceTimeoutMs elapses without dispatching or delegating", () => {
    vi.useFakeTimers();
    try {
      const { dispatches, leader, overlay } = createLeader({
        trie: {
          children: new Map([
            ["\u001b", { key: "<esc>", action: "cancel.must.not.dispatch", children: new Map() }],
            ["f", { key: "f", action: "file.find", children: new Map() }],
          ]),
        },
      } as never);

      leader.handleInput(" ");
      vi.advanceTimersByTime(25);
      expect(overlay.shown).toHaveLength(1);

      vi.advanceTimersByTime(100);
      expect(leader.isPending).toBe(false);

      expect(leader.handleInput("\u001b")).toBe(true);

      expect(dispatches).toEqual([]);
      expect(overlay.hideCount).toBe(1);
      expect(overlay.disposeCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides and disposes the panel on dispatch, invalid sequence, clear, and dispose", () => {
    vi.useFakeTimers();
    try {
      const first = createLeader();
      first.leader.handleInput(" ");
      vi.advanceTimersByTime(25);
      first.leader.handleInput("f");
      expect(first.overlay.disposeCount).toBe(1);

      const second = createLeader();
      second.leader.handleInput(" ");
      vi.advanceTimersByTime(25);
      second.leader.handleInput("z");
      expect(second.overlay.disposeCount).toBe(1);

      const third = createLeader();
      third.leader.handleInput(" ");
      vi.advanceTimersByTime(25);
      third.leader.clear();
      expect(third.overlay.disposeCount).toBe(1);

      const fourth = createLeader();
      fourth.leader.handleInput(" ");
      vi.advanceTimersByTime(25);
      fourth.leader.dispose();
      expect(fourth.overlay.disposeCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("WhichKeyPanelComponent", () => {

  it("styles rounded border glyphs with the injected chat/editor border styler while leaving keys and labels separately styled", () => {
    const options: TestableWhichKeyPanelOptions = {
      stylizeBorder: (text: string) => `<border>${text}</border>`,
      stylizeKey: (text, style) => `<key color=${style.color} bold=${String(style.bold)}>${text}</key>`,
    };
    const component = new WhichKeyPanelComponent(
      [
        { key: "f", label: "Find file", kind: "action" },
        { key: "b", label: "+buffers", kind: "group" },
      ],
      options,
    );

    const rendered = component.render(80).join("\n");
    const styledBorders = borderSegments(rendered);

    for (const glyph of ["╭", "╮", "╰", "╯", "─", "│"]) {
      expect(styledBorders.join("")).toContain(glyph);
    }
    expectNoUnstyledBorderGlyphs(rendered);
    expect(rendered).toContain("<key color=yellow bold=true>f</key>");
    expect(rendered).toContain("<key color=yellow bold=true>b</key>");
    expect(styledBorders.some((segment) => segment.includes("Find file") || segment.includes("+buffers"))).toBe(false);
    expect(rendered).toContain("Find file");
    expect(rendered).toContain("+buffers");
  });

  it("styles only the displayed key segment with bold default yellow styling", () => {
    const options: WhichKeyPanelComponentOptions = {
      stylizeKey: (text, style) => `<key color=${style.color} bold=${String(style.bold)}>${text}</key>`,
    };
    const component = new WhichKeyPanelComponent(
      [
        { key: "f", label: "Find file", kind: "action" },
        { key: "b", label: "+buffers", kind: "group" },
      ],
      options,
    );

    const rendered = component.render(80).join("\n");
    const styledSegments = [...rendered.matchAll(/<key color=([^ ]+) bold=(true|false)>(.*?)<\/key>/g)];

    expect(styledSegments.map((segment) => ({ color: segment[1], bold: segment[2], text: segment[3] }))).toEqual([
      { color: "yellow", bold: "true", text: "f" },
      { color: "yellow", bold: "true", text: "b" },
    ]);
    expect(rendered).toContain("Find file");
    expect(rendered).toContain("+buffers");
    expect(rendered).not.toContain("<key color=yellow bold=true>Find file</key>");
    expect(rendered).not.toContain("<key color=yellow bold=true>+buffers</key>");
  });

  it("uses a configured keyColor when styling displayed key segments", () => {
    const component = new WhichKeyPanelComponent([{ key: "x", label: "Run action", kind: "action" }], {
      keyColor: "cyan",
      stylizeKey: (text, style) => `<key color=${style.color} bold=${String(style.bold)}>${text}</key>`,
    });

    const rendered = component.render(80).join("\n");

    expect(rendered).toContain("<key color=cyan bold=true>x</key>");
    expect(rendered).toContain("Run action");
    expect(rendered).not.toContain("<key color=cyan bold=true>Run action</key>");
  });

  it("renders entries inside a rounded Unicode border while preserving entry text", () => {
    const component = new WhichKeyPanelComponent([
      { key: "f", label: "Find file", kind: "action" },
      { key: "b", label: "+buffers", kind: "group" },
    ]);

    const lines = component.render(24);
    const rendered = lines.join("\n");

    expect(rendered).toContain("f");
    expect(rendered).toContain("Find file");
    expect(rendered).toContain("b");
    expect(rendered).toContain("+buffers");
    expect(rendered).toContain("╭");
    expect(rendered).toContain("╮");
    expect(rendered).toContain("╰");
    expect(rendered).toContain("╯");
    expect(lines[0]).toEqual(expect.stringContaining("─"));
    expect(lines.at(-1)).toEqual(expect.stringContaining("─"));
    expect(lines.length).toBeGreaterThanOrEqual(4);

    const entryLines = lines.filter((line) => line.includes("Find file") || line.includes("+buffers"));
    expect(entryLines).toHaveLength(2);
    expect(entryLines.every((line) => line.trimStart().startsWith("│") && line.trimEnd().endsWith("│"))).toBe(true);
  });

  it("renders entries without exceeding the supplied width", () => {
    const component = new WhichKeyPanelComponent([
      { key: "very-long-key-name", label: "A very long action description", kind: "action" },
      { key: "b", label: "+buffers", kind: "group" },
    ]);

    const lines = component.render(12);

    expect(lines.every((line) => visibleWidth(line) <= 12)).toBe(true);
  });

  it("creates a bottom-right non-capturing TUI overlay", () => {
    const shown: Array<{ component: Component; options?: OverlayOptions }> = [];
    const overlay = createTuiWhichKeyOverlay({
      showOverlay(component: Component, options?: OverlayOptions) {
        shown.push({ component, options });
        return {
          hide() {},
          setHidden() {},
          isHidden: () => false,
          focus() {},
          unfocus() {},
          isFocused: () => false,
        };
      },
    });

    overlay.show({
      anchor: "bottom-right",
      nonCapturing: true,
      entries: [{ key: "f", label: "Find file", kind: "action" }],
    });

    expect(shown).toHaveLength(1);
    expect(shown[0].component).toBeInstanceOf(WhichKeyPanelComponent);
    expect(shown[0].options).toMatchObject({ anchor: "bottom-right", nonCapturing: true });
  });
});
