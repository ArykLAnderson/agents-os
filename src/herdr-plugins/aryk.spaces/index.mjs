#!/usr/bin/env node
import { openSpacesAction, runPicker } from "./lib/runtime.mjs";
const mode=process.argv[2];
try{if(mode==="action")await openSpacesAction();else if(mode==="picker")await runPicker();else throw new Error("invalid aryk.spaces entrypoint");}catch(error){process.stderr.write(`Spaces: ${error.message}\n`);process.exitCode=1;}
