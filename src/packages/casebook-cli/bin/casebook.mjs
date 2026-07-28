#!/usr/bin/env node
import { run } from "../lib/wi033.mjs";
const outcome = await run(process.argv.slice(2));
process.stdout.write(`${JSON.stringify(outcome.result)}\n`);
process.exitCode = outcome.exitCode;
