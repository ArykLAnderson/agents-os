#!/usr/bin/env node
import os from "node:os";
import path from "node:path";
import { invokeFacade } from "../lib/steward.mjs";

const store = process.env.STEWARD_STORE ?? path.join(process.env.XDG_DATA_HOME ?? path.join(os.homedir(), ".local", "share"), "agents-os", "steward.json");
try {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const request = JSON.parse(input);
  const response = invokeFacade(store, request);
  process.stdout.write(`${JSON.stringify(response.envelope)}\n`);
  process.exitCode = response.exitCode;
} catch {
  process.stdout.write(`${JSON.stringify({ schema: "steward-result@1", status: "refused", operation: "unknown", failure: { code: "request_invalid", message: "Steward accepts one JSON request on standard input." } })}\n`);
  process.exitCode = 2;
}
