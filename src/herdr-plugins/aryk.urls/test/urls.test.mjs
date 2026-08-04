import test from "node:test";
import assert from "node:assert/strict";
import { extractUrls, parseSelection } from "../lib/core.mjs";
import { chooseUrl, openUrlsAction, runUrlPicker } from "../lib/runtime.mjs";

test("extracts unique HTTP URLs in newest-first order and trims prose punctuation", () => {
  assert.deepEqual(extractUrls("See https://example.com/a_(b). Then https://mercari.example/x?q=1, and https://example.com/a_(b)."), ["https://mercari.example/x?q=1", "https://example.com/a_(b)"]);
});

test("selection resolves only a generated row index", () => {
  const urls = ["https://one.example", "https://two.example"];
  assert.equal(parseSelection("2\ttwo.example\thttps://two.example\n", urls), urls[1]);
  assert.throws(() => parseSelection("3\tunknown", urls), /unknown/);
});

test("picker preserves bottom-most-first screen order", async () => {
  const urls = ["https://bottom.example", "https://top.example"];
  let invocation;
  await chooseUrl(urls, { executor: async (_executable, args, options) => { invocation = { args, input: options.input }; return { status: 1, stdout: "" }; } });
  assert.ok(invocation.args.includes("--no-sort"));
  assert.match(invocation.input, /^1\tbottom\.example\thttps:\/\/bottom\.example\n2\ttop\.example/);
});

test("action passes the exact invoking pane to the picker", async () => {
  const calls = []; const env = { HERDR_BIN_PATH: "/usr/local/bin/herdr", HERDR_PANE_ID: "w1:p2", HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({ focused_pane_id: "w1:p2" }) };
  const result = await openUrlsAction({ env, executor: async (executable, args) => { calls.push({ executable, args }); return { status: 0 }; } });
  assert.equal(result.paneId, "w1:p2");
  assert.deepEqual(calls[0].args.slice(-7), ["--width", "96", "--height", "18", "--env", "ARYK_URL_SOURCE_PANE=w1:p2", "--focus"]);
  assert.equal(calls[0].args.includes("--target-pane"), false);
});

test("picker reads the proven pane and opens the selected URL without a shell", async () => {
  const calls = []; const env = { HERDR_BIN_PATH: "/usr/local/bin/herdr", ARYK_URL_SOURCE_PANE: "w1:p2" };
  const result = await runUrlPicker({ env, chooser: async urls => urls[0], executor: async (executable, args, options) => { calls.push({ executable, args, options }); return executable.endsWith("herdr") ? { status: 0, stdout: "https://example.com/path\n" } : { status: 0 }; } });
  assert.equal(result.url, "https://example.com/path");
  assert.deepEqual(calls[0].args.slice(-4), ["--source", "visible", "--format", "text"]);
  assert.equal(calls[0].args.includes("--lines"), false);
  assert.deepEqual(calls[1].args, ["https://example.com/path"]);
  assert.notEqual(calls[1].options?.shell, true);
});
