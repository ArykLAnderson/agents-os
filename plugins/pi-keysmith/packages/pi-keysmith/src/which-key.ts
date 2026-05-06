import { truncateToWidth, visibleWidth, type Component, type OverlayHandle, type TUI } from "@mariozechner/pi-tui";
import type { WhichKeyOverlay, WhichKeyPanel, WhichKeyPanelEntry } from "./leader.js";

const DEFAULT_KEY_COLOR = "yellow";

export interface WhichKeyKeyStyle {
  color: string;
  bold: boolean;
}

export type WhichKeyKeyStylizer = (text: string, style: WhichKeyKeyStyle) => string;
export type WhichKeyBorderStylizer = (text: string) => string;

export interface WhichKeyPanelComponentOptions {
  keyColor?: string;
  stylizeKey?: WhichKeyKeyStylizer;
  stylizeBorder?: WhichKeyBorderStylizer;
}

export interface WhichKeyThemeStyler {
  fg?: (color: string, text: string) => string;
  bold?: (text: string) => string;
  borderColor?: (text: string) => string;
}

export class WhichKeyPanelComponent implements Component {
  private readonly keyColor: string;
  private readonly stylizeKey: WhichKeyKeyStylizer;
  private readonly stylizeBorder: WhichKeyBorderStylizer;

  constructor(
    private readonly entries: WhichKeyPanelEntry[],
    options: WhichKeyPanelComponentOptions = {},
  ) {
    this.keyColor = options.keyColor ?? DEFAULT_KEY_COLOR;
    this.stylizeKey = options.stylizeKey ?? stylizeKeyWithAnsi;
    this.stylizeBorder = options.stylizeBorder ?? identity;
  }

  invalidate(): void {
    // Static component; no cached state to invalidate.
  }

  render(width: number): string[] {
    const safeWidth = Math.max(0, width);
    if (safeWidth === 0) return [""];

    const contentWidth = Math.max(0, safeWidth - 2);
    const top = safeWidth === 1
      ? this.renderBorder("╭")
      : `${this.renderBorder("╭")}${this.renderBorder("─".repeat(contentWidth))}${this.renderBorder("╮")}`;
    const bottom = safeWidth === 1
      ? this.renderBorder("╰")
      : `${this.renderBorder("╰")}${this.renderBorder("─".repeat(contentWidth))}${this.renderBorder("╯")}`;
    const entryLines = this.renderEntryLines(contentWidth).map((line) => {
      if (safeWidth === 1) return this.renderBorder("│");
      return `${this.renderBorder("│")}${padVisible(line, contentWidth)}${this.renderBorder("│")}`;
    });

    return [top, ...entryLines, bottom];
  }

  private renderBorder(text: string): string {
    try {
      return this.stylizeBorder(text);
    } catch {
      return text;
    }
  }

  private renderEntryLines(width: number): string[] {
    if (width === 0) return [""];
    if (this.entries.length === 0) return [truncateToWidth("(no bindings)", width)];

    const keyWidth = Math.min(
      Math.max(...this.entries.map((entry) => visibleWidth(entry.key))),
      Math.max(1, Math.floor(width / 2)),
    );

    return this.entries.map((entry) => {
      const displayedKey = truncateToWidth(entry.key, keyWidth);
      const styledKey = this.stylizeKey(displayedKey, { color: this.keyColor, bold: true });
      const key = `${styledKey}${" ".repeat(Math.max(0, keyWidth - visibleWidth(displayedKey)))}`;
      return truncateToWidth(`${key} ${entry.label}`, width);
    });
  }
}

export function createTuiWhichKeyOverlay(
  tui: Pick<TUI, "showOverlay">,
  options: WhichKeyPanelComponentOptions = {},
): WhichKeyOverlay {
  return {
    show(panel: WhichKeyPanel) {
      const handle = tui.showOverlay(new WhichKeyPanelComponent(panel.entries, options), {
        anchor: panel.anchor,
        nonCapturing: panel.nonCapturing,
        width: 40,
        maxHeight: "50%",
        margin: 1,
      });
      return overlayHandleAdapter(handle);
    },
  };
}

export function stylizeKeyWithTheme(theme: WhichKeyThemeStyler | undefined): WhichKeyKeyStylizer {
  return (text, style) => {
    const boldText = style.bold ? stylizeBold(theme, text) : text;
    return stylizeColor(theme, style.color, boldText);
  };
}

export function stylizeBorderWithTheme(theme: WhichKeyThemeStyler | undefined): WhichKeyBorderStylizer {
  return (text) => {
    try {
      return theme?.borderColor ? theme.borderColor(text) : text;
    } catch {
      return text;
    }
  };
}

function stylizeBold(theme: WhichKeyThemeStyler | undefined, text: string): string {
  try {
    return theme?.bold ? theme.bold(text) : ansiBold(text);
  } catch {
    return ansiBold(text);
  }
}

function stylizeColor(theme: WhichKeyThemeStyler | undefined, color: string, text: string): string {
  try {
    return theme?.fg ? theme.fg(color, text) : ansiFg(color, text);
  } catch {
    return ansiFg(color, text);
  }
}

function stylizeKeyWithAnsi(text: string, style: WhichKeyKeyStyle): string {
  const boldText = style.bold ? ansiBold(text) : text;
  return ansiFg(style.color, boldText);
}

function identity(text: string): string {
  return text;
}

function ansiBold(text: string): string {
  return `\x1b[1m${text}\x1b[22m`;
}

function ansiFg(color: string, text: string): string {
  const code = ANSI_FG_COLORS[color.toLowerCase()];
  return code ? `\x1b[${code}m${text}\x1b[39m` : text;
}

const ANSI_FG_COLORS: Record<string, number> = {
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
  gray: 90,
  grey: 90,
  brightblack: 90,
  brightred: 91,
  brightgreen: 92,
  brightyellow: 93,
  brightblue: 94,
  brightmagenta: 95,
  brightcyan: 96,
  brightwhite: 97,
};

function overlayHandleAdapter(handle: OverlayHandle) {
  let disposed = false;
  return {
    hide() {
      if (disposed) return;
      disposed = true;
      handle.hide();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      handle.hide();
    },
  };
}

function padVisible(value: string, width: number): string {
  const padding = Math.max(0, width - visibleWidth(value));
  return `${value}${" ".repeat(padding)}`;
}
