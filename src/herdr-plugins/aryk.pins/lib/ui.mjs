import { reduceManagerState, renderManager } from "./model.mjs";
import { loadPins, loadRegistry, readStateJson, statePaths, transactionalPins } from "./storage.mjs";

function actionFor(data) {
  if (data === "j" || data === "\u001b[B") return "down";
  if (data === "k" || data === "\u001b[A") return "up";
  if (data === "K") return "move-up";
  if (data === "J") return "move-down";
  if (data === "c") return "clear";
  if (data === "q" || data === "\u001b") return "exit";
  return null;
}
function keypress() { return new Promise((resolve) => process.stdin.once("data", data => resolve(String(data)))); }
export async function managerPane(scope, env = process.env) {
  const paths = statePaths(env); const file = scope === "project" ? paths.projects : paths.locals;
  let registry = null; try { registry = await loadRegistry(paths.registry); } catch {}
  let state = { selected: 1, pins: await loadPins(file), exit: false };
  if (process.stdin.isTTY) process.stdin.setRawMode(true); process.stdin.resume();
  try {
    while (!state.exit) {
      process.stdout.write(`\u001b[2J\u001b[H${renderManager(scope, state.pins, registry)}\nSelected: ${state.selected}\n`);
      const action = actionFor(await keypress()); if (!action) continue;
      if (["clear", "move-up", "move-down"].includes(action)) {
        state = await transactionalPins(file, async currentPins => {
          const next = reduceManagerState({ ...state, pins: currentPins }, action);
          return { pins: next.pins, result: next };
        });
      } else state = reduceManagerState(state, action);
    }
  } finally { if (process.stdin.isTTY) process.stdin.setRawMode(false); process.stdin.pause(); }
}
export async function resultPane(env = process.env) {
  const { result } = statePaths(env); let value;
  try { value = await readStateJson(result); } catch (error) { value = { status: "refused", message: `Result unavailable: ${error.message}` }; }
  process.stdout.write(`Herdr pins: ${value.status}\n\n${value.message}\n\nPress any key to close.\n`);
  if (process.stdin.isTTY) { process.stdin.setRawMode(true); process.stdin.resume(); try { await keypress(); } finally { process.stdin.setRawMode(false); process.stdin.pause(); } }
}
