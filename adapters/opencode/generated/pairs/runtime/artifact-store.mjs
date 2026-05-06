import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const defaultClock = () => new Date();

export function slugify(value) {
  return String(value ?? "pair")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "pair";
}

export function createRunId({ now = defaultClock(), slug = "pair" } = {}) {
  const stamp = now.toISOString().replace(/[:.]/g, "").replace("Z", "Z");
  return `${stamp}-${slugify(slug)}`;
}

export class ArtifactStore {
  constructor({ cwd = process.cwd(), root = ".pi/artifacts/pairs", fs = {} } = {}) {
    this.cwd = cwd;
    this.root = root;
    this.fs = {
      mkdirSync,
      writeFileSync,
      appendFileSync,
      ...fs,
    };
    this.rootDir = path.resolve(cwd, root);
    this.runsDir = path.join(this.rootDir, "runs");
    this.indexPath = path.join(this.rootDir, "index.jsonl");
  }

  createRun({ pair, mode, runId = createRunId({ slug: pair }), startedAt = new Date().toISOString() }) {
    const runDir = path.join(this.runsDir, runId);
    this.fs.mkdirSync(runDir, { recursive: true });
    this.fs.mkdirSync(this.rootDir, { recursive: true });
    const run = {
      pair,
      mode,
      runId,
      startedAt,
      runDir,
      relativeRunDir: path.relative(this.cwd, runDir),
      files: {
        pair: path.join(runDir, "pair.json"),
        compactResult: path.join(runDir, "compact-result.json"),
        report: path.join(runDir, "report.md"),
        events: path.join(runDir, "events.jsonl"),
        messages: path.join(runDir, "messages.jsonl"),
        driverTranscript: path.join(runDir, "driver-transcript.md"),
        advisorTranscript: path.join(runDir, "advisor-transcript.md"),
        transport: path.join(runDir, "transport.json"),
      },
    };
    for (const file of [run.files.events, run.files.messages, run.files.driverTranscript, run.files.advisorTranscript]) {
      this.fs.writeFileSync(file, "", { flag: "a" });
    }
    return run;
  }

  writePairMetadata(run, metadata) {
    return this.#writeJson(run.files.pair, { run_id: run.runId, pair: run.pair, mode: run.mode, ...metadata });
  }

  appendEvent(run, event) {
    return this.#appendJsonl(run.files.events, { ts: new Date().toISOString(), ...event });
  }

  appendMessage(run, message) {
    return this.#appendJsonl(run.files.messages, { ts: new Date().toISOString(), ...message });
  }

  appendDriverTranscript(run, markdown) {
    return this.#appendText(run.files.driverTranscript, markdown.endsWith("\n") ? markdown : `${markdown}\n`);
  }

  appendAdvisorTranscript(run, markdown) {
    return this.#appendText(run.files.advisorTranscript, markdown.endsWith("\n") ? markdown : `${markdown}\n`);
  }

  writeReport(run, markdown) {
    return this.#writeText(run.files.report, markdown.endsWith("\n") ? markdown : `${markdown}\n`);
  }

  writeCompactResult(run, result) {
    return this.#writeJson(run.files.compactResult, { run_id: run.runId, pair: run.pair, ...result });
  }

  writeTransport(run, transport) {
    return this.#writeJson(run.files.transport, { run_id: run.runId, pair: run.pair, mode: run.mode, ...transport });
  }

  appendIndex(run, entry) {
    return this.#appendJsonl(this.indexPath, {
      run_id: run.runId,
      pair: run.pair,
      mode: run.mode,
      run_dir: run.relativeRunDir,
      ...entry,
    });
  }

  #writeText(file, text) {
    try {
      this.fs.mkdirSync(path.dirname(file), { recursive: true });
      this.fs.writeFileSync(file, text);
      return { ok: true, file };
    } catch (error) {
      return { ok: false, file, error: error instanceof Error ? error.message : String(error) };
    }
  }

  #writeJson(file, value) {
    return this.#writeText(file, `${JSON.stringify(value, null, 2)}\n`);
  }

  #appendJsonl(file, value) {
    return this.#appendText(file, `${JSON.stringify(value)}\n`);
  }

  #appendText(file, text) {
    try {
      this.fs.mkdirSync(path.dirname(file), { recursive: true });
      this.fs.appendFileSync(file, text);
      return { ok: true, file };
    } catch (error) {
      return { ok: false, file, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

export function createPairRun({ cwd, root, pair, mode, runId, startedAt } = {}) {
  const store = new ArtifactStore({ cwd, root });
  const run = store.createRun({ pair, mode, runId, startedAt });
  return { store, run };
}
