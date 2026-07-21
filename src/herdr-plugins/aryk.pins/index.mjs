#!/usr/bin/env node
import { handlePaneFocusedEvent, invokeAction } from "./lib/runtime.mjs";
import { managerPane, resultPane } from "./lib/ui.mjs";

const [mode, value] = process.argv.slice(2);
try {
  if (mode === "action") await invokeAction(value);
  else if (mode === "event" && value === "pane.focused") await handlePaneFocusedEvent();
  else if (mode === "manager" && ["project", "local"].includes(value)) await managerPane(value);
  else if (mode === "result") await resultPane();
  else throw new Error("invalid aryk.pins entrypoint");
} catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
