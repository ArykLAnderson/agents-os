import { describe, expect, it } from "vitest";
import { buildBindingTrie } from "./trie.js";

describe("minimal binding trie", () => {
  it("builds group nodes and action leaves from a minimal spec", () => {
    const trie = buildBindingTrie({
      t: { action: "pi-keysmith.tools.expand.toggle", desc: "Toggle tools" },
      g: {
        name: "go",
        n: { action: "custom.next", desc: "Next" },
      },
    });

    expect(trie.children.get("t")).toMatchObject({
      key: "t",
      action: "pi-keysmith.tools.expand.toggle",
      desc: "Toggle tools",
      children: new Map(),
    });
    expect(trie.children.get("g")).toMatchObject({ key: "g", group: "go" });
    expect(trie.children.get("g")?.children.get("n")).toMatchObject({ action: "custom.next", desc: "Next" });
  });

  it("fails closed for conflicting default bindings to the same sequence", () => {
    expect(() =>
      buildBindingTrie({
        t: { action: "default.one", source: "builtin:one" },
        "<leader>t": { action: "default.two", source: "sdk:two" },
      }),
    ).toThrow(/conflict.*t.*builtin:one.*sdk:two/i);
  });

  it("rejects duplicate action IDs bound to multiple sequences with source-aware diagnostics", () => {
    expect(() =>
      buildBindingTrie({
        a: { action: "duplicate.action", source: "/user/keybindings.json" },
        b: { action: "duplicate.action", source: "/project/.pi/keybindings.json" },
      }),
    ).toThrow(/duplicate action.*duplicate\.action.*\/user\/keybindings\.json.*\/project\/\.pi\/keybindings\.json/i);
  });

  it("rejects illegal prefix/action ambiguity", () => {
    expect(() =>
      buildBindingTrie({
        g: { action: "go.now", desc: "Go now" },
        gg: { action: "go.top", desc: "Go top" },
      }),
    ).toThrow(/prefix.*action.*g/i);
  });

  it("rejects escape as an action binding because it is reserved for pending cancellation", () => {
    expect(() =>
      buildBindingTrie({
        "<esc>": { action: "manual.cancel", desc: "Must not bind escape" },
      }),
    ).toThrow(/esc.*reserved|reserved.*esc|cancel/i);
  });

  it("rejects a group and action on the same node", () => {
    expect(() =>
      buildBindingTrie({
        g: { name: "go", action: "go.now", desc: "Go now" },
      }),
    ).toThrow(/group.*action.*g/i);
  });
});
