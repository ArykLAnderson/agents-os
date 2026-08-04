import path from "node:path";
import { spawn } from "node:child_process";
import readline from "node:readline/promises";
import { displayUrl, extractUrls, parseSelection } from "./core.mjs";

const SESSION = "casebook-trial";

function execute(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { ...options, shell: false, stdio: options.stdio ?? ["ignore", "pipe", "pipe"] });
    let stdout = ""; let stderr = "";
    child.stdout?.setEncoding("utf8").on("data", chunk => stdout += chunk);
    child.stderr?.setEncoding("utf8").on("data", chunk => stderr += chunk);
    child.once("error", reject); child.once("close", status => resolve({ status, stdout, stderr }));
    if (options.input != null) child.stdin.end(options.input);
  });
}

function contextFrom(env) {
  let context; try { context = JSON.parse(env.HERDR_PLUGIN_CONTEXT_JSON ?? ""); } catch { throw new Error("plugin invocation context is invalid"); }
  if (!context?.focused_pane_id || context.focused_pane_id !== env.HERDR_PANE_ID) throw new Error("focused pane identity is unavailable");
  return context;
}

function herdrArgs(args) { return ["--session", SESSION, ...args]; }

async function waitForDismiss(input = process.stdin) {
  if (!input.isTTY) return;
  const wasRaw = input.isRaw;
  if (typeof input.setRawMode === "function") input.setRawMode(true);
  input.resume();
  try { await new Promise(resolve => input.once("data", resolve)); }
  finally {
    if (typeof input.setRawMode === "function") input.setRawMode(Boolean(wasRaw));
    input.pause();
  }
}

export async function openUrlsAction({ env = process.env, executor = execute } = {}) {
  const context = contextFrom(env);
  if (!path.isAbsolute(env.HERDR_BIN_PATH ?? "")) throw new Error("HERDR_BIN_PATH must be absolute");
  const result = await executor(env.HERDR_BIN_PATH, herdrArgs(["plugin", "pane", "open", "--plugin", "aryk.urls", "--entrypoint", "urls", "--placement", "popup", "--width", "96", "--height", "18", "--env", `ARYK_URL_SOURCE_PANE=${context.focused_pane_id}`, "--focus"]), { env: { ...env } });
  if (result.status !== 0) throw new Error(`unable to open URL picker (exit ${result.status})`);
  return { status: "opened", paneId: context.focused_pane_id };
}

export async function chooseUrl(urls, { env = process.env, executor = execute, input = process.stdin, output = process.stdout } = {}) {
  const fzf = path.join("/opt/homebrew/bin", "fzf");
  const rows = urls.map((url, index) => `${index + 1}\t${displayUrl(url)}\t${url}`).join("\n");
  const selected = await executor(fzf, ["--delimiter=\t", "--with-nth=2..", "--no-multi", "--no-sort", "--layout=reverse", "--prompt=URL> ", "--header=Newest visible URL first"], { env: { ...env }, input: `${rows}\n`, stdio: ["pipe", "pipe", "inherit"] });
  if (selected.status === 130 || selected.status === 1) return null;
  if (selected.status === 0) return parseSelection(selected.stdout, urls);
  if (!input.isTTY || !output.isTTY) throw new Error(`fzf failed (exit ${selected.status})`);
  const rl = readline.createInterface({ input, output });
  try {
    urls.forEach((url, index) => output.write(`${index + 1}. ${displayUrl(url)}\n`));
    const answer = await rl.question("Open URL number (blank cancels): ");
    if (!answer.trim()) return null;
    return parseSelection(`${answer}\t`, urls);
  } finally { rl.close(); }
}

export async function runUrlPicker({ env = process.env, executor = execute, chooser = chooseUrl, input = process.stdin, output = process.stdout } = {}) {
  if (!path.isAbsolute(env.HERDR_BIN_PATH ?? "") || !env.ARYK_URL_SOURCE_PANE) throw new Error("source pane proof is unavailable");
  const snapshot = await executor(env.HERDR_BIN_PATH, herdrArgs(["pane", "read", env.ARYK_URL_SOURCE_PANE, "--source", "visible", "--format", "text"]), { env: { ...env } });
  if (snapshot.status !== 0) throw new Error(`unable to read source pane (exit ${snapshot.status})`);
  const urls = extractUrls(snapshot.stdout);
  if (urls.length === 0) {
    output.write("No HTTP(S) URLs found on the current screen.\n\nPress Esc or any key to close.\n");
    await waitForDismiss(input);
    return { status: "empty" };
  }
  const selected = await chooser(urls, { env, executor, input, output });
  if (!selected) return { status: "cancelled" };
  const opened = await executor("/usr/bin/open", [selected], { env: { ...env } });
  if (opened.status !== 0) throw new Error(`browser open failed (exit ${opened.status})`);
  return { status: "opened", url: selected };
}
