#!/usr/bin/env node
import { openUrlsAction, runUrlPicker } from "./lib/runtime.mjs";

const [mode] = process.argv.slice(2);
try {
  if (mode === "action") await openUrlsAction();
  else if (mode === "picker") await runUrlPicker();
  else throw new Error("invalid aryk.urls entrypoint");
} catch (error) {
  process.stderr.write(`URLs: ${error.message}\n`);
  process.exitCode = 1;
}
