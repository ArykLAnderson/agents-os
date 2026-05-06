import { describe, expect, it } from "vitest";
import { parseKeySequence } from "./parser.js";

describe("key notation parser", () => {
  it("parses plain key sequences as ordered key tokens", () => {
    expect(parseKeySequence("tn")).toEqual([
      { notation: "t", input: "t" },
      { notation: "n", input: "n" },
    ]);
  });

  it.each([
    ["<ctrl+x>", "\u0018"],
    ["<c-x>", "\u0018"],
    ["<space>", " "],
    ["<tab>", "\t"],
    ["<cr>", "\r"],
    ["<esc>", "\u001b"],
  ])("parses minimal angle key %s", (source, input) => {
    expect(parseKeySequence(source)).toEqual([{ notation: source.toLowerCase(), input }]);
  });

  it("strips a leading <leader> token from binding sequences", () => {
    expect(parseKeySequence("<leader>tn", { allowLeaderPrefix: true })).toEqual([
      { notation: "t", input: "t" },
      { notation: "n", input: "n" },
    ]);
  });

  it("rejects <leader> in the middle of a sequence", () => {
    expect(() => parseKeySequence("t<leader>n", { allowLeaderPrefix: true })).toThrow(/leader/i);
  });
});
