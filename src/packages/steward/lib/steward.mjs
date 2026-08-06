import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const schema = "steward-store@1";
const resultSchema = "steward-result@1";
const clone = (value) => structuredClone(value);
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const now = () => new Date().toISOString();
const transactionWaiter = new Int32Array(new SharedArrayBuffer(4));
const noWrite = Symbol("steward-no-write");
const withoutWrite = (result) => ({ [noWrite]: true, result });
const success = (operation, result) => ({ schema: resultSchema, status: "success", operation, result: clone(result) });
const failure = (operation, code, message) => ({ schema: resultSchema, status: "refused", operation, failure: { code, message } });

export class StewardFailure extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function requiredText(value, name) {
  if (typeof value !== "string" || !value.trim() || value.length > 4096) throw new StewardFailure("request_invalid", `${name} must be a bounded non-empty string.`);
  return value;
}
function requiredObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new StewardFailure("request_invalid", `${name} must be an object.`);
  return value;
}
function exactRevision(value, expected, code) {
  if (!Number.isInteger(value) || value !== expected) throw new StewardFailure(code, "The supplied revision is no longer current.");
}
function requiredArray(value, name) {
  if (!Array.isArray(value)) throw new StewardFailure("request_invalid", `${name} must be an array.`);
  return value;
}
function exactKeys(value, allowed, name, code = "request_invalid") {
  const extras = Object.keys(value).filter((key) => !allowed.includes(key));
  if (extras.length) throw new StewardFailure(code, `${name} contains unsupported fields.`);
  return value;
}
function textArray(value, name) { return requiredArray(value, name).map((item) => requiredText(item, `${name} item`)); }
function canonicalNamespace(value, name = "namespace_id") {
  const namespaceId = requiredText(value, name);
  if (namespaceId === "namespace:root") throw new StewardFailure("root_namespace_forbidden", "namespace:root is structural and cannot be associated with a Space.");
  if (!/^namespace:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(namespaceId)) throw new StewardFailure("namespace_id_invalid", `${name} must be a canonical semantic Namespace ID.`);
  return namespaceId;
}
function ownerLocator(value, name = "owner_reference") {
  const locator = exactKeys(requiredObject(value, name), ["kind", "id"], name, "owner_reference_invalid");
  try { return { kind: requiredText(locator.kind, `${name}.kind`), id: requiredText(locator.id, `${name}.id`) }; }
  catch { throw new StewardFailure("owner_reference_invalid", `${name} must be an exact owner kind and ID locator without copied owner state.`); }
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
const portfolioDigest = (value) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
function defaultState() {
  return { schema, revision: 0, singleton: null, directory: { revision: 0, spaces: {} }, intakes: {}, replay: {}, matters: {}, baselines: {}, observations: {}, admissions: {} };
}

/** Durable database-scoped persistence boundary. Its file path is the selected
 * local database representation; callers receive only revisioned domain state. */
export class StewardStore {
  constructor(databasePath) {
    this.databasePath = path.resolve(requiredText(databasePath, "database_path"));
  }
  read() {
    if (!existsSync(this.databasePath)) return defaultState();
    try {
      const parsed = JSON.parse(readFileSync(this.databasePath, "utf8"));
      if (parsed?.schema !== schema || !parsed.directory || !parsed.intakes || !parsed.matters) throw Error("invalid");
      for (const matter of Object.values(parsed.matters)) if (matter?.question && Object.hasOwn(matter.question, "answer")) delete matter.question.answer;
      return parsed;
    } catch { throw new StewardFailure("store_corrupt", "The Steward store cannot be read safely."); }
  }
  transact(work) {
    mkdirSync(path.dirname(this.databasePath), { recursive: true });
    const release = this.#acquireTransactionLock();
    try {
      const before = this.read();
      const draft = clone(before);
      const result = work(draft);
      if (result?.[noWrite]) return clone(result.result);
      draft.revision += 1;
      const temporary = `${this.databasePath}.${process.pid}.${randomUUID()}.tmp`;
      try {
        writeFileSync(temporary, `${JSON.stringify(draft)}\n`, { mode: 0o600 });
        renameSync(temporary, this.databasePath);
      } finally {
        if (existsSync(temporary)) try { unlinkSync(temporary); } catch { /* owned temp cleanup is best effort */ }
      }
      return clone(result);
    } finally {
      release();
    }
  }
  #acquireTransactionLock() {
    const lockPath = `${this.databasePath}.lock`;
    try { mkdirSync(lockPath, { recursive: true, mode: 0o700 }); }
    catch { throw new StewardFailure("store_unavailable", "The Steward transaction lock cannot be prepared safely."); }
    const token = randomUUID();
    const createdNs = process.hrtime.bigint().toString().padStart(24, "0");
    const claimName = `${createdNs}-${process.pid}-${token}.claim`;
    const claimPath = path.join(lockPath, claimName);
    try {
      writeFileSync(claimPath, `${JSON.stringify({ pid: process.pid, token, created_ns: createdNs })}\n`, { flag: "wx", mode: 0o600 });
    } catch {
      throw new StewardFailure("store_unavailable", "The Steward transaction claim cannot be published safely.");
    }
    const deadline = Date.now() + 60_000;
    while (true) {
      let claims;
      try { claims = readdirSync(lockPath).filter((name) => name.endsWith(".claim")).sort(); }
      catch { try { unlinkSync(claimPath); } catch { /* best effort */ } throw new StewardFailure("store_unavailable", "The Steward transaction lock cannot be inspected safely."); }
      for (const name of claims) {
        const candidatePath = path.join(lockPath, name);
        const match = /^\d{24}-(\d+)-[0-9a-f-]+\.claim$/i.exec(name);
        const candidatePid = match ? Number(match[1]) : null;
        if (!Number.isInteger(candidatePid) || candidatePid <= 0) continue;
        let alive = true;
        try { process.kill(candidatePid, 0); }
        catch (error) { alive = error?.code === "EPERM"; }
        if (!alive) try { unlinkSync(candidatePath); } catch { /* another waiter may have removed this exact unique claim */ }
      }
      try {
        const current = readdirSync(lockPath).filter((name) => name.endsWith(".claim")).sort();
        if (current[0] === claimName) {
          return () => { try { unlinkSync(claimPath); } catch { /* this process's unique claim only */ } };
        }
      } catch { /* retry until the bounded deadline */ }
      if (Date.now() >= deadline) {
        try { unlinkSync(claimPath); } catch { /* best effort */ }
        throw new StewardFailure("store_transaction_conflict", "The Steward store is busy; retry the operation.");
      }
      Atomics.wait(transactionWaiter, 0, 0, 10);
    }
  }
  resolve() {
    return this.transact((state) => {
      if (!state.singleton) state.singleton = { id: "steward:global", revision: 1, created_at: now() };
      return { steward: state.singleton, directory: state.directory };
    });
  }
  createSingleton(id, expectedRevision) {
    return this.transact((state) => {
      if (state.singleton) {
        if (state.singleton.id === id && expectedRevision === state.singleton.revision) return { steward: state.singleton, replayed: true };
        throw new StewardFailure("singleton_conflict", "This database already has its one Global Steward.");
      }
      if (id !== "steward:global") throw new StewardFailure("singleton_id_invalid", "The Global Steward identity is fixed.");
      if (expectedRevision !== 0) throw new StewardFailure("singleton_conflict", "The singleton creation revision is stale.");
      state.singleton = { id, revision: 1, created_at: now() };
      return { steward: state.singleton, replayed: false };
    });
  }
  createSpace(expectedDirectoryRevision, space) {
    return this.transact((state) => {
      exactRevision(expectedDirectoryRevision, state.directory.revision, "directory_revision_conflict");
      const input = requiredObject(space, "space");
      const id = requiredText(input.id, "space.id");
      if (!id.startsWith("space:")) throw new StewardFailure("space_id_invalid", "Space IDs must begin with space:.");
      if (state.directory.spaces[id]) throw new StewardFailure("space_already_exists", "That Space already exists.");
      const record = { id, name: requiredText(input.name, "space.name"), lifecycle: "active", revision: 1, associations: {}, retired_associations: {}, created_at: now(), retired_at: null };
      state.directory.spaces[id] = record;
      state.directory.revision += 1;
      return { space: record, directory: state.directory };
    });
  }
  retireSpace(spaceId, expectedRevision) {
    return this.transact((state) => {
      const space = this.#space(state, spaceId);
      exactRevision(expectedRevision, space.revision, "space_revision_conflict");
      if (space.lifecycle === "retired") return { space, directory: state.directory };
      space.lifecycle = "retired"; space.retired_at = now(); space.revision += 1; state.directory.revision += 1;
      return { space, directory: state.directory };
    });
  }
  setAssociation(spaceId, expectedRevision, association) {
    return this.transact((state) => {
      const space = this.#space(state, spaceId);
      exactRevision(expectedRevision, space.revision, "space_revision_conflict");
      const input = exactKeys(requiredObject(association, "association"), ["namespace_id", "include_descendants", "expected_association_revision"], "association");
      const namespaceId = canonicalNamespace(input.namespace_id, "association.namespace_id");
      if (typeof input.include_descendants !== "boolean") throw new StewardFailure("association_invalid", "include_descendants must be explicit.");
      const prior = space.associations[namespaceId];
      if (input.expected_association_revision != null) exactRevision(input.expected_association_revision, prior?.revision ?? 0, "association_revision_conflict");
      const record = { namespace_id: namespaceId, include_descendants: input.include_descendants, revision: (prior?.revision ?? 0) + 1, updated_at: now() };
      space.associations[namespaceId] = record; space.revision += 1;
      return { space, association: record };
    });
  }
  removeAssociation(spaceId, expectedRevision, namespaceId) {
    return this.transact((state) => {
      const space = this.#space(state, spaceId); exactRevision(expectedRevision, space.revision, "space_revision_conflict");
      const key = requiredText(namespaceId, "namespace_id"); const association = space.associations[key];
      if (!association) throw new StewardFailure("association_not_found", "The Namespace association is not active.");
      delete space.associations[key]; space.retired_associations[key] = { ...association, retired_at: now(), reason: "removed_or_namespace_retired" }; space.revision += 1;
      return { space, retired_association: space.retired_associations[key] };
    });
  }
  capture(input) {
    return this.transact((state) => {
      const replayKey = requiredText(input.replay_key, "replay_key");
      const payload = { content: input.content, provenance: requiredObject(input.provenance, "provenance") };
      const contentDigest = digest(payload);
      const existingId = state.replay[replayKey];
      if (existingId) {
        const intake = state.intakes[existingId];
        if (intake.digest !== contentDigest) throw new StewardFailure("intake_replay_conflict", "The replay identity has different immutable Intake content.");
        const matter = Object.values(state.matters).find((candidate) => candidate.intake_id === intake.id) ?? null;
        return { intake, matter, space: matter ? this.#space(state, matter.home_space_id) : null, replayed: true };
      }
      const intake = { id: `intake:${randomUUID()}`, replay_key: replayKey, content: input.content, provenance: clone(input.provenance), digest: contentDigest, captured_at: now() };
      let matter = null;
      let space = null;
      if (input.space_id != null) {
        space = this.#space(state, input.space_id);
        exactRevision(input.expected_space_revision, space.revision, "space_revision_conflict");
        matter = this.#newMatter(state, intake.id, space.id, input.relevance_reason, input.owner_references, input.return_condition);
      }
      state.intakes[intake.id] = intake; state.replay[replayKey] = intake.id;
      return { intake, matter, space, replayed: false };
    });
  }
  place(input) {
    return this.transact((state) => {
      const intake = state.intakes[requiredText(input.intake_id, "intake_id")];
      if (!intake) throw new StewardFailure("intake_not_found", "The Intake is not available.");
      const existing = Object.values(state.matters).find((matter) => matter.intake_id === intake.id);
      if (existing) return { intake, matter: existing, space: this.#space(state, existing.home_space_id), replayed: true };
      const space = this.#space(state, input.space_id);
      exactRevision(input.expected_space_revision, space.revision, "space_revision_conflict");
      const matter = this.#newMatter(state, intake.id, space.id, input.relevance_reason, input.owner_references, input.return_condition);
      return { intake, matter, space, replayed: false };
    });
  }
  readMatter(id) { const state = this.read(); const matter = state.matters[requiredText(id, "matter_id")]; if (!matter) throw new StewardFailure("matter_not_found", "The Matter is not available."); return { matter }; }
  manifest(spaceId) {
    const state = this.read(); const space = this.#space(state, spaceId);
    return { space, matters: Object.values(state.matters).filter((matter) => matter.home_space_id === space.id && matter.relevant) };
  }
  transition(input) {
    return this.transact((state) => {
      const matter = this.#matter(state, input.matter_id);
      exactRevision(input.expected_revision, matter.revision, "matter_revision_conflict");
      const transition = requiredText(input.transition, "transition");
      if (!new Set(["active", "deferred", "quiet", "released", "release", "restored", "return"]).has(transition)) throw new StewardFailure("transition_invalid", "The requested lifecycle transition is unsupported.");
      if (transition === "deferred") {
        const condition = input.return_condition;
        if (typeof input.deferral_reason !== "string" || !input.deferral_reason.trim()) throw new StewardFailure("deferral_reason_required", "Deferral requires a durable reason.");
        if (!condition || typeof condition !== "object" || Array.isArray(condition) || !new Set(["time", "owner_event", "next_review"]).has(condition.kind) || typeof condition.value !== "string" || !condition.value) throw new StewardFailure("deferral_return_condition_required", "Deferral requires one explicit time, owner-event, or next-review return condition.");
        matter.deferral_reason = input.deferral_reason; matter.return_condition = clone(condition);
      }
      if (transition === "restored" || transition === "return") { matter.lifecycle = "active"; matter.relevant = true; }
      else { matter.lifecycle = transition === "release" ? "released" : transition; matter.relevant = matter.lifecycle !== "released"; }
      matter.relevance_reason = requiredText(input.relevance_reason, "relevance_reason"); matter.revision += 1; matter.updated_at = now();
      return { matter, space: this.#touchMatterSpace(state, matter) };
    });
  }
  linkQuestion(input) {
    return this.transact((state) => {
      const matter = this.#matter(state, input.matter_id); exactRevision(input.expected_revision, matter.revision, "matter_revision_conflict");
      const question = exactKeys(requiredObject(input.question, "question"), ["owner", "locator", "revision"], "question");
      const owner = ownerLocator(question.owner, "question.owner");
      if (matter.question) throw new StewardFailure("question_already_linked", "A Matter may retain one active Question link.");
      matter.question = { owner, locator: requiredText(question.locator, "question.locator"), revision: requiredText(question.revision, "question.revision"), state: "open", submission: null, result_locator: null };
      matter.revision += 1; return { matter, space: this.#touchMatterSpace(state, matter) };
    });
  }
  prepareAnswerSubmission(input) {
    const matter = this.#matter(this.read(), input.matter_id);
    exactRevision(input.expected_revision, matter.revision, "matter_revision_conflict");
    if (!matter.question) throw new StewardFailure("question_not_linked", "The Matter has no Question link.");
    const answer = requiredObject(input.answer, "answer");
    return {
      question: { owner: clone(matter.question.owner), locator: matter.question.locator, revision: matter.question.revision },
      answer: { id: requiredText(answer.id, "answer.id"), body: requiredText(answer.body, "answer.body") },
    };
  }
  recordAnswerSubmission(input, ownerSubmission) {
    return this.transact((state) => {
      const matter = this.#matter(state, input.matter_id);
      exactRevision(input.expected_revision, matter.revision, "matter_revision_conflict");
      if (!matter.question) throw new StewardFailure("question_not_linked", "The Matter has no Question link.");
      const submission = { answer_id: ownerSubmission.answer_id, owner_result: clone(ownerSubmission.owner_result) };
      if (JSON.stringify(canonical(matter.question.submission)) === JSON.stringify(canonical(submission))) {
        return withoutWrite({ matter, space: this.#space(state, matter.home_space_id), submission, replayed: ownerSubmission.replayed });
      }
      matter.question.state = "answer-submitted";
      matter.question.submission = submission;
      matter.revision += 1;
      return { matter, space: this.#touchMatterSpace(state, matter), submission, replayed: ownerSubmission.replayed };
    });
  }
  closeQuestion(input, closure) {
    return this.transact((state) => {
      const matter = this.#matter(state, input.matter_id); exactRevision(input.expected_revision, matter.revision, "matter_revision_conflict");
      if (!matter.question) throw new StewardFailure("question_not_linked", "The Matter has no Question link.");
      if (closure.owner.kind !== matter.question.owner.kind || closure.owner.id !== matter.question.owner.id || closure.locator !== matter.question.locator || closure.represented_revision !== matter.question.revision) throw new StewardFailure("question_owner_result_mismatch", "The owner result does not identify the exact linked Question revision.");
      matter.question.state = closure.condition;
      matter.question.result_locator = closure.result_locator;
      matter.question.owner_result = clone(closure);
      matter.revision += 1;
      return { matter, space: this.#touchMatterSpace(state, matter) };
    });
  }
  #space(state, id) { const space = state.directory.spaces[requiredText(id, "space_id")]; if (!space) throw new StewardFailure("space_not_found", "The Space is not available."); return space; }
  #matter(state, id) { const matter = state.matters[requiredText(id, "matter_id")]; if (!matter) throw new StewardFailure("matter_not_found", "The Matter is not available."); return matter; }
  #touchMatterSpace(state, matter) { const space = this.#space(state, matter.home_space_id); space.revision += 1; return space; }
  #newMatter(state, intakeId, spaceId, relevanceReason, ownerReferences, returnCondition = undefined) {
    const space = this.#space(state, spaceId); if (space.lifecycle !== "active") throw new StewardFailure("space_retired", "A retired Space cannot receive new Matter placement.");
    if (!Array.isArray(ownerReferences)) throw new StewardFailure("owner_references_invalid", "owner_references must be an array of exact locators.");
    const exactOwnerReferences = ownerReferences.map((reference, index) => ownerLocator(reference, `owner_references[${index}]`));
    const matter = { id: `matter:${randomUUID()}`, intake_id: intakeId, home_space_id: space.id, lifecycle: "active", relevant: true, relevance_reason: requiredText(relevanceReason, "relevance_reason"), owner_references: exactOwnerReferences, return_condition: returnCondition == null ? { kind: "none" } : clone(returnCondition), deferral_reason: null, question: null, revision: 1, created_at: now(), updated_at: now() };
    state.matters[matter.id] = matter; this.#touchMatterSpace(state, matter); return matter;
  }
}

export class PortfolioService {
  constructor(store, owners = {}) { this.store = store; this.owners = owners; }
  compose(request) {
    const state = this.store.read();
    const view = this.#compose(state, request);
    return { view, comparison: this.#compare(this.#baseline(state, view.scope), view.manifest) };
  }
  baselines() {
    const baselines = this.store.read().baselines ?? {};
    return { global: baselines.global ?? null, spaces: baselines.spaces ?? {} };
  }
  acknowledge(request) {
    const viewId = requiredText(request.view_id, "view_id");
    const suppliedRequest = requiredObject(request.view_request, "view_request");
    const represented = this.#compose(this.store.read(), suppliedRequest);
    const observations = represented.manifest.observations.map((expected) => {
      const endpoint = this.owners[expected.owner.kind];
      if (!endpoint || typeof endpoint.observe !== "function") throw new StewardFailure("view_reobservation_unavailable", `The ${expected.owner.kind} currentness endpoint is unavailable for acknowledgement.`);
      let result;
      try { result = endpoint.observe({ observation: clone(expected) }); }
      catch { throw new StewardFailure("view_reobservation_unavailable", "A represented owner could not be re-observed for acknowledgement."); }
      let normalized;
      try { normalized = this.#normalizeObservation(result); }
      catch { throw new StewardFailure("view_reobservation_invalid", "A represented owner returned an invalid currentness observation."); }
      if (JSON.stringify(canonical(normalized)) !== JSON.stringify(canonical(expected))) throw new StewardFailure("view_not_reproducible", "A represented owner no longer reproduces the acknowledged observation.");
      return normalized;
    });
    const viewRequest = { ...clone(suppliedRequest), observations };
    return this.store.transact((state) => {
      const view = this.#compose(state, viewRequest);
      if (view.id !== viewId) throw new StewardFailure("view_not_reproducible", "The represented sources no longer reproduce the acknowledged view.");
      const baselines = state.baselines ??= {};
      const scope = view.scope.kind === "global" ? baselines : (baselines.spaces ??= {});
      const key = view.scope.kind === "global" ? "global" : view.scope.space_id;
      const prior = scope[key] ?? null;
      if (prior?.view_id === view.id) return withoutWrite({ baseline: prior, replayed: true, view, comparison: this.#compare(prior, view.manifest) });
      exactRevision(request.expected_baseline_revision, prior?.revision ?? 0, "baseline_revision_conflict");
      const baseline = { scope: clone(view.scope), revision: (prior?.revision ?? 0) + 1, view_id: view.id, manifest_id: view.manifest.id, manifest: clone(view.manifest), acknowledged_at: now() };
      scope[key] = baseline;
      return { baseline, replayed: false, view, comparison: this.#compare(prior, view.manifest) };
    });
  }
  #compose(state, request) {
    const scope = this.#scope(state, requiredObject(request.scope, "scope"));
    const spaces = scope.kind === "global" ? Object.values(state.directory.spaces) : [this.#space(state, scope.space_id)];
    const manifests = spaces.sort((left, right) => left.id.localeCompare(right.id)).map((space) => ({
      id: space.id,
      lifecycle: space.lifecycle,
      revision: space.revision,
      matters: Object.values(state.matters).filter((matter) => matter.home_space_id === space.id && matter.relevant).sort((left, right) => left.id.localeCompare(right.id)).map((matter) => ({ ...clone(matter), intake: state.intakes[matter.intake_id] ? { id: state.intakes[matter.intake_id].id, provenance: clone(state.intakes[matter.intake_id].provenance), captured_at: state.intakes[matter.intake_id].captured_at } : null })),
    }));
    const matters = manifests.flatMap((space) => space.matters);
    const observations = this.#observations(request.observations ?? [], matters);
    const coverage = this.#coverage(matters, observations);
    const returns = this.#returns(matters, observations, request.as_of);
    const namespace = this.#namespace(state, scope, request.namespace_context);
    const search = this.#search(request.search);
    const manifest = {
      id: "manifest:" + portfolioDigest({ scope, directory_revision: scope.kind === "global" ? state.directory.revision : null, spaces: manifests, observations, coverage }),
      directory: scope.kind === "global" ? { revision: state.directory.revision } : null,
      spaces: manifests,
      observations,
      coverage,
      mixed_age: new Set(observations.map((item) => item.observed_at)).size > 1,
    };
    const orientation = this.#orientation(request.attention ?? [], matters, observations, returns);
    const identity = { scope, manifest, orientation, returns, namespace, search };
    return { id: "view:" + portfolioDigest(identity), scope, manifest, coverage, orientation, returns, namespace, search };
  }
  #baseline(state, scope) {
    const baselines = state.baselines ?? {};
    return scope.kind === "global" ? baselines.global ?? null : baselines.spaces?.[scope.space_id] ?? null;
  }
  #compare(baseline, manifest) {
    if (!baseline) return { status: "no_baseline", baseline_revision: null, changed_sources: [], limitations: [] };
    if (!baseline.manifest) return { status: "incomparable", baseline_revision: baseline.revision, changed_sources: [], limitations: ["The durable baseline predates represented-manifest persistence."] };
    if (manifest.coverage.gaps.length || baseline.manifest.coverage?.gaps?.length) return { status: "incomparable", baseline_revision: baseline.revision, changed_sources: [], limitations: ["A represented source is missing, limited, unavailable, or conflicting in one compared manifest."] };
    if (manifest.id === baseline.manifest.id) return { status: "unchanged", baseline_revision: baseline.revision, changed_sources: [], limitations: [] };
    const previous = new Map((baseline.manifest.observations ?? []).map((item) => [item.id, item]));
    const current = new Map((manifest.observations ?? []).map((item) => [item.id, item]));
    const changedSources = [...new Set([...previous.keys(), ...current.keys()])].filter((id) => JSON.stringify(canonical(previous.get(id))) !== JSON.stringify(canonical(current.get(id))));
    if (baseline.manifest.directory?.revision !== manifest.directory?.revision) changedSources.push("directory:steward-spaces");
    const previousSpaces = new Map((baseline.manifest.spaces ?? []).map((space) => [space.id, space]));
    const currentSpaces = new Map((manifest.spaces ?? []).map((space) => [space.id, space]));
    for (const id of new Set([...previousSpaces.keys(), ...currentSpaces.keys()])) if (JSON.stringify(canonical(previousSpaces.get(id))) !== JSON.stringify(canonical(currentSpaces.get(id)))) changedSources.push(id);
    return { status: "changed", baseline_revision: baseline.revision, changed_sources: [...new Set(changedSources)].sort(), limitations: [] };
  }
  #scope(state, input) {
    const kind = requiredText(input.kind, "scope.kind");
    if (kind === "global") return { kind };
    if (kind === "space") return { kind, space_id: this.#space(state, input.space_id).id };
    throw new StewardFailure("scope_invalid", "scope.kind must be global or space.");
  }
  #space(state, id) {
    const space = state.directory.spaces[requiredText(id, "space_id")];
    if (!space) throw new StewardFailure("space_not_found", "The Space is not available.");
    return space;
  }
  #normalizeObservation(item) {
    const observation = exactKeys(requiredObject(item, "observation"), ["id", "matter_id", "owner", "artifact", "represented_revision", "currentness", "observed_at", "condition", "limitations", "event_id", "blocker", "attention_support"], "observation");
    const owner = exactKeys(requiredObject(observation.owner, "observation.owner"), ["kind", "id"], "observation.owner");
    const artifact = exactKeys(requiredObject(observation.artifact, "observation.artifact"), ["id", "revision"], "observation.artifact");
    const normalized = {
      id: requiredText(observation.id, "observation.id"),
      matter_id: requiredText(observation.matter_id, "observation.matter_id"),
      owner: { kind: requiredText(owner.kind, "observation.owner.kind"), id: requiredText(owner.id, "observation.owner.id") },
      artifact: { id: requiredText(artifact.id, "observation.artifact.id"), revision: requiredText(artifact.revision, "observation.artifact.revision") },
      represented_revision: requiredText(observation.represented_revision, "observation.represented_revision"),
      currentness: requiredText(observation.currentness, "observation.currentness"),
      observed_at: requiredText(observation.observed_at, "observation.observed_at"),
      condition: requiredText(observation.condition, "observation.condition"),
      limitations: textArray(observation.limitations ?? [], "observation.limitations"),
    };
    if (observation.event_id != null) normalized.event_id = requiredText(observation.event_id, "observation.event_id");
    if (observation.blocker != null) normalized.blocker = clone(requiredObject(observation.blocker, "observation.blocker"));
    if (observation.attention_support != null) {
      const support = exactKeys(requiredObject(observation.attention_support, "observation.attention_support"), ["bands", "axes", "actions"], "observation.attention_support");
      const axes = exactKeys(requiredObject(support.axes, "observation.attention_support.axes"), ["human_needed", "independently_progressing", "observation_limited"], "observation.attention_support.axes");
      for (const axis of ["human_needed", "independently_progressing", "observation_limited"]) if (typeof axes[axis] !== "boolean") throw new StewardFailure("request_invalid", "Every supported attention axis must be explicit.");
      const bands = textArray(support.bands, "observation.attention_support.bands");
      if (bands.some((band) => !new Set(["urgent", "next-conversation", "briefing", "quiet"]).has(band))) throw new StewardFailure("request_invalid", "Observation attention support contains an unsupported band.");
      normalized.attention_support = { bands, axes: clone(axes), actions: textArray(support.actions, "observation.attention_support.actions") };
    }
    return normalized;
  }
  #observations(input, matters) {
    const visible = new Set(matters.map((matter) => matter.id));
    const seen = new Set();
    return requiredArray(input, "observations").map((item) => {
      const normalized = this.#normalizeObservation(item);
      if (seen.has(normalized.id)) throw new StewardFailure("observation_id_conflict", "Observation identities must be unique.");
      seen.add(normalized.id);
      return visible.has(normalized.matter_id) ? normalized : null;
    }).filter(Boolean).sort((left, right) => left.id.localeCompare(right.id));
  }
  #coverage(matters, observations) {
    const gaps = [];
    for (const matter of matters) if (!observations.some((item) => item.matter_id === matter.id)) gaps.push({ code: "owner_observation_missing", matter_id: matter.id });
    const groups = new Map();
    for (const item of observations) {
      const key = [item.matter_id, item.owner.kind, item.owner.id, item.artifact.id].join("|");
      const group = groups.get(key) ?? []; group.push(item); groups.set(key, group);
    }
    for (const group of groups.values()) if (new Set(group.map((item) => item.condition)).size > 1) gaps.push({ code: "observation_conflicting", matter_id: group[0].matter_id, observation_ids: group.map((item) => item.id) });
    for (const item of observations) if (["unavailable", "partial", "stale", "unknown", "conflicting"].includes(item.condition) || item.limitations.length) gaps.push({ code: "observation_limited", matter_id: item.matter_id, observation_id: item.id, condition: item.condition, limitations: item.limitations });
    return { gaps };
  }
  #returns(matters, observations, asOf = now()) {
    const at = new Date(typeof asOf === "string" ? asOf : now()).getTime();
    return matters.map((matter) => {
      const condition = matter.return_condition ?? { kind: "none" };
      if (matter.lifecycle !== "deferred") return { matter_id: matter.id, status: "not_deferred", eligible: true, condition };
      if (["time", "next_review"].includes(condition.kind)) return { matter_id: matter.id, status: new Date(condition.value).getTime() <= at ? "satisfied" : "pending", eligible: new Date(condition.value).getTime() <= at, condition };
      if (condition.kind === "owner_event") {
        const related = observations.filter((item) => item.matter_id === matter.id);
        if (related.some((item) => item.event_id === condition.value && item.condition === "satisfied")) return { matter_id: matter.id, status: "satisfied", eligible: true, condition, evidence_ids: related.filter((item) => item.event_id === condition.value && item.condition === "satisfied").map((item) => item.id) };
        if (related.some((item) => ["unavailable", "unknown", "partial", "stale"].includes(item.condition))) return { matter_id: matter.id, status: "uncheckable", eligible: true, condition, limitations: related.flatMap((item) => item.limitations) };
      }
      return { matter_id: matter.id, status: "pending", eligible: false, condition };
    });
  }
  #orientation(input, matters, observations, returns) {
    const byId = new Map(observations.map((item) => [item.id, item]));
    const matterIds = new Set(matters.map((matter) => matter.id));
    const matterById = new Map(matters.map((matter) => [matter.id, matter]));
    const recommended = requiredArray(input, "attention").map((item) => {
      const recommendation = requiredObject(item, "attention item");
      const matterId = requiredText(recommendation.matter_id, "attention.matter_id");
      if (!matterIds.has(matterId)) throw new StewardFailure("attention_matter_unavailable", "Attention must cite a Matter in the represented manifest.");
      const band = requiredText(recommendation.band, "attention.band");
      if (!new Set(["urgent", "next-conversation", "briefing", "quiet"]).has(band)) throw new StewardFailure("attention_band_invalid", "Attention bands are limited to the accepted advisory vocabulary.");
      const evidenceIds = requiredArray(recommendation.evidence_ids, "attention.evidence_ids").map((id) => requiredText(id, "attention.evidence_id"));
      if (!evidenceIds.length || evidenceIds.some((id) => !byId.has(id))) throw new StewardFailure("attention_evidence_required", "Every attention recommendation requires represented attributable evidence.");
      if (evidenceIds.some((id) => byId.get(id).matter_id !== matterId)) throw new StewardFailure("attention_evidence_matter_mismatch", "Attention evidence must belong to its recommended Matter.");
      const axes = requiredObject(recommendation.axes, "attention.axes");
      for (const axis of ["human_needed", "independently_progressing", "observation_limited"]) if (typeof axes[axis] !== "boolean") throw new StewardFailure("attention_axes_invalid", "Each independent attention axis must be explicit.");
      const smallest = requiredObject(recommendation.smallest_action, "attention.smallest_action");
      const evidenceId = requiredText(smallest.evidence_id, "attention.smallest_action.evidence_id");
      if (!evidenceIds.includes(evidenceId)) throw new StewardFailure("attention_action_uncited", "The smallest action must cite its recommendation evidence.");
      const actionText = requiredText(smallest.text, "attention.smallest_action.text");
      const evidence = evidenceIds.map((id) => byId.get(id));
      const supportsBand = evidence.some((item) => item.attention_support?.bands.includes(band));
      const supportedAxes = Object.fromEntries(["human_needed", "independently_progressing", "observation_limited"].map((axis) => [axis, evidence.some((item) => item.attention_support?.axes[axis] === true)]));
      const supportsAction = byId.get(evidenceId).attention_support?.actions.includes(actionText) === true;
      if (!supportsBand || !supportsAction || Object.keys(supportedAxes).some((axis) => supportedAxes[axis] !== axes[axis])) throw new StewardFailure("attention_evidence_unsupported", "The cited owner evidence does not support this exact attention band, axes, and action.");
      const returnState = returns.find((item) => item.matter_id === matterId);
      return { matter_id: matterId, band, evidence_ids: evidenceIds, axes: clone(axes), explanation: { matter_id: matterId, provenance: clone(matterById.get(matterId).intake?.provenance ?? null), return: returnState, observations: evidenceIds.map((id) => ({ id, owner: clone(byId.get(id).owner), artifact: clone(byId.get(id).artifact), condition: byId.get(id).condition, limitations: clone(byId.get(id).limitations) })) }, smallest_action: { text: actionText, evidence_id: evidenceId }, return: returnState };
    });
    const recommendedIds = new Set(recommended.map((item) => item.matter_id));
    return { recommendations: recommended, indeterminate: matters.filter((matter) => !recommendedIds.has(matter.id)).map((matter) => ({ matter_id: matter.id, return: returns.find((item) => item.matter_id === matter.id), limitation: "No represented evidence distinguishes an advisory attention characterization." })) };
  }
  #namespace(state, scope, input) {
    if (input == null) return null;
    const context = requiredObject(input, "namespace_context");
    const namespaceId = canonicalNamespace(context.namespace_id, "namespace_context.namespace_id");
    const mode = requiredText(context.mode, "namespace_context.mode");
    if (!new Set(["filter", "rank"]).has(mode)) throw new StewardFailure("namespace_context_mode_invalid", "Namespace context is limited to requested filtering or ranking.");
    const candidates = scope.kind === "global" ? Object.values(state.directory.spaces) : [this.#space(state, scope.space_id)];
    const associations = candidates.map((space) => {
      const association = space.associations[namespaceId] ?? space.retired_associations[namespaceId] ?? null;
      return association ? { ...clone(association), status: space.associations[namespaceId] ? "active" : "retired", space_id: space.id } : null;
    }).filter(Boolean).sort((left, right) => left.space_id.localeCompare(right.space_id));
    const activeDescendantChoices = new Set(associations.filter((item) => item.status === "active").map((item) => item.include_descendants));
    const conflicting = activeDescendantChoices.size > 1;
    return { namespace_id: namespaceId, mode, association: associations[0] ?? null, associations, conflicting, limitations: ["Namespace is organizational context only; it does not control identity, visibility, authority, or Portfolio coverage.", ...(conflicting ? ["Contradictory Namespace associations are shown as context and do not select an authority, coverage, or identity result."] : [])] };
  }
  #search(input) {
    if (input == null) return null;
    const search = requiredObject(input, "search");
    const results = requiredArray(search.results, "search.results").map((item) => {
      const result = requiredObject(item, "search.result");
      return { id: requiredText(result.id, "search.result.id"), provenance: clone(requiredObject(result.provenance, "search.result.provenance")), represented_revision: requiredText(result.represented_revision, "search.result.represented_revision"), condition: requiredText(result.condition, "search.result.condition") };
    });
    const continuation = requiredObject(search.continuation, "search.continuation");
    return { results, continuation: { cursor: requiredText(continuation.cursor, "search.continuation.cursor"), limitations: clone(requiredArray(continuation.limitations ?? [], "search.continuation.limitations")) }, completeness: "not_established" };
  }
}

export class OwnerBoundaryService {
  constructor(store, owners = {}) { this.store = store; this.owners = owners; }
  orient(kind, request) {
    const artifact = this.#artifact(request.artifact);
    const result = this.#call(kind, "orient", { artifact }, `${kind}_orientation_unavailable`);
    return { orientation: this.#orientationResult(kind, result, artifact) };
  }
  createBinding(request) {
    const purpose = requiredText(request.purpose, "purpose");
    const focus = requiredObject(request.focus, "focus");
    const focusKind = requiredText(focus.kind, "focus.kind");
    if (focusKind === "space") requiredText(focus.space_id, "focus.space_id");
    else if (focusKind !== "cross-space") throw new StewardFailure("focus_invalid", "Binding focus must be Space or cross-Space.");
    const result = this.#call("interactionBinding", "create", { purpose, focus: clone(focus), artifact: this.#artifact(request.artifact) }, "interaction_binding_unavailable");
    return clone(requiredObject(result, "binding result"));
  }
  focusBinding(request) {
    const result = this.#call("interactionBinding", "focus", { binding_id: requiredText(request.binding_id, "binding_id") }, "interaction_binding_unavailable");
    if (result?.disposition === "refused") throw new StewardFailure(requiredText(result.code, "binding refusal code"), "The binding owner refused this focus request.");
    return clone(requiredObject(result, "binding result"));
  }
  resolveBinding(request) {
    const result = this.#call("interactionBinding", "resolve", { binding_id: requiredText(request.binding_id, "binding_id") }, "interaction_binding_unavailable");
    if (result?.disposition === "refused") throw new StewardFailure(requiredText(result.code, "binding refusal code"), "The binding owner refused this resolve request.");
    return clone(requiredObject(result, "binding result"));
  }
  projectQuestion(request) {
    const locator = requiredText(request.question_locator, "question_locator");
    const result = this.#call("question", "project", { question_locator: locator }, "question_owner_unavailable");
    return { question: this.#questionResult(result, { locator }) };
  }
  closeQuestion(request) {
    const current = this.store.readMatter(request.matter_id).matter;
    if (!current.question) throw new StewardFailure("question_not_linked", "The Matter has no Question link.");
    const result = this.#call("question", "project", { question_locator: current.question.locator }, "question_owner_unavailable");
    const closure = this.#questionResult(result, current.question);
    if (!new Set(["resolved", "superseded", "withdrawn"]).has(closure.condition)) throw new StewardFailure("question_owner_closure_required", "The requesting owner has not returned a terminal Question result.");
    return this.store.closeQuestion(request, closure);
  }
  submitAnswer(request) {
    const prepared = this.store.prepareAnswerSubmission(request);
    const result = this.#call("question", "submitAnswer", { question: prepared.question, answer: prepared.answer }, "question_owner_unavailable");
    if (result?.disposition === "refused") throw new StewardFailure(requiredText(result.code, "answer refusal code"), "The requesting owner refused the Answer submission.");
    const submission = this.#answerSubmissionResult(result, prepared.question, prepared.answer.id);
    return this.store.recordAnswerSubmission(request, submission);
  }
  authorize(request) {
    const endpoint = this.#endpoint("directive", "standing_directive_unavailable");
    if (typeof endpoint.authorize !== "function") throw new StewardFailure("standing_directive_unavailable", "The required owner endpoint is unavailable.");
    const candidate = this.#envelope(request.envelope);
    const result = endpoint.authorize({ authorization: clone(candidate.authority), envelope: clone(candidate) });
    if (result?.disposition === "guidance") throw new StewardFailure("guidance_not_authorization", "Guidance does not authorize an effect.");
    if (result?.disposition !== "authorized") throw new StewardFailure(requiredText(result?.code ?? "authority_unavailable", "authority refusal code"), "The authorization owner did not authorize this envelope.");
    if (JSON.stringify(canonical(result.authorization?.envelope)) !== JSON.stringify(canonical(candidate))) throw new StewardFailure("authority_envelope_mismatch", "The authorization does not match the complete cumulative envelope.");
    return { authorization: clone(result.authorization) };
  }
  prepareAdmission(request) {
    const candidate = this.#envelope(request.envelope);
    const atlas = requiredObject(request.atlas, "atlas");
    const requestedOutcome = requiredObject(request.requested_outcome, "requested_outcome");
    const permittedLimitations = requiredArray(requestedOutcome.permitted_limitations, "requested_outcome.permitted_limitations").map((item) => requiredText(item, "requested_outcome.permitted_limitation"));
    const claims = requiredArray(requestedOutcome.claims ?? [], "requested_outcome.claims").map((item) => requiredText(item, "requested_outcome.claim"));
    const atlasBinding = { map_id: requiredText(atlas.map_id, "atlas.map_id"), decision_id: requiredText(atlas.decision_id, "atlas.decision_id") };
    if (JSON.stringify(atlasBinding) !== JSON.stringify(candidate.atlas)) throw new StewardFailure("atlas_binding_mismatch", "The Atlas handoff does not match the cumulative envelope.");
    const handoff = this.#atlasHandoff(this.#call("atlas", "readHandoff", { atlas: atlasBinding }, "atlas_handoff_unavailable"), atlasBinding, candidate.target);
    if (handoff.disposition === "HandoffRefusal") throw new StewardFailure("atlas_handoff_refused", "Atlas refused this delivery handoff.");
    if (handoff.current !== true) throw new StewardFailure("atlas_handoff_not_current", "Atlas handoff currentness is not established.");
    if (!new Set(["HandoffReady", "HandoffWithLimitations"]).has(handoff.disposition)) throw new StewardFailure("atlas_handoff_invalid", "Atlas did not return an admissible handoff.");
    const limitations = handoff.limitations;
    const forbiddenClaims = handoff.forbidden_claims;
    const requiredEffects = handoff.required_effects;
    if (requiredEffects.length !== candidate.effect_bindings.length || requiredEffects.some((effect) => !candidate.effect_bindings.some((binding) => binding.effect === effect))) throw new StewardFailure("authority_effect_bindings_mismatch", "The cumulative envelope does not bind exactly the Atlas-required effects.");
    if (limitations.some((item) => !permittedLimitations.includes(item))) throw new StewardFailure("atlas_limitation_incompatible", "The requested outcome is incompatible with an Atlas limitation.");
    if (claims.some((item) => forbiddenClaims.includes(item))) throw new StewardFailure("atlas_forbidden_claim", "The requested outcome would make a forbidden Atlas claim.");
    const authorization = this.authorize({ envelope: candidate });
    return { envelope: candidate, envelope_digest: portfolioDigest(candidate), atlas_handoff: clone(handoff), authorization };
  }
  submitAdmission(request) {
    const endpoint = this.#endpoint("softwareImplementation", "software_implementation_unavailable");
    if (typeof endpoint.correlate !== "function" || typeof endpoint.admit !== "function") throw new StewardFailure("software_implementation_unavailable", "The Software Implementation correlation/admission boundary is unavailable.");
    const candidate = this.#envelope(request.envelope);
    const envelopeDigest = requiredText(request.envelope_digest, "envelope_digest");
    if (envelopeDigest !== portfolioDigest(candidate)) throw new StewardFailure("authority_envelope_digest_mismatch", "The admission envelope was changed after authorization.");
    const existing = this.store.read().admissions?.[envelopeDigest];
    if (existing?.disposition === "unknown") throw new StewardFailure("admission_recovery_required", "The prior admission outcome is unknown; recover its exact owner correlation before submitting again.");
    if (existing) return { admission: clone(existing.admission), replayed: true };
    const correlation = requiredObject(endpoint.correlate({ envelope: clone(candidate), envelope_digest: envelopeDigest }), "software implementation correlation");
    const correlationId = requiredText(correlation.correlation_id, "correlation.correlation_id");
    const reserved = this.store.transact((state) => {
      const admissions = state.admissions ??= {};
      const prior = admissions[envelopeDigest];
      if (prior?.disposition === "unknown") throw new StewardFailure("admission_recovery_required", "The prior admission outcome is unknown; recover its exact owner correlation before submitting again.");
      if (prior) return withoutWrite({ admission: prior.admission, replayed: true, reserved: false });
      if (Object.values(admissions).some((entry) => entry.correlation_id === correlationId)) throw new StewardFailure("admission_correlation_conflict", "Software Implementation reused an owner correlation for a different envelope.");
      const admission = { disposition: "unknown", correlation_id: correlationId, currentness: "owner-unconfirmed", observed_at: now(), limitations: ["Software Implementation admission delivery has not settled."] };
      admissions[envelopeDigest] = { envelope_digest: envelopeDigest, correlation_id: correlationId, disposition: "unknown", admission };
      return { admission, replayed: false, reserved: true };
    });
    if (!reserved.reserved) return reserved;
    let admission;
    try {
      admission = this.#admissionResult(endpoint.admit({ envelope: clone(candidate), envelope_digest: envelopeDigest, correlation_id: correlationId }), correlationId);
      if (admission.disposition === "admitted" && JSON.stringify(admission.authorized_routine_mechanics) !== JSON.stringify(candidate.routine_mechanics)) throw new StewardFailure("software_implementation_envelope_mismatch", "The admitted routine mechanics do not match the authorized envelope.");
    } catch {
      return { admission: clone(reserved.admission), delivery_unknown: true };
    }
    return this.store.transact((state) => {
      const entry = state.admissions?.[envelopeDigest];
      if (!entry || entry.correlation_id !== correlationId || entry.disposition !== "unknown") throw new StewardFailure("admission_recovery_mismatch", "The owner admission no longer matches its durable unknown correlation.");
      entry.disposition = admission.disposition;
      entry.admission = clone(admission);
      return { admission: clone(admission), replayed: false };
    });
  }
  recoverAdmission(request) {
    const endpoint = this.#endpoint("softwareImplementation", "software_implementation_unavailable");
    const correlationId = requiredText(request.correlation_id, "correlation_id");
    const entry = Object.values(this.store.read().admissions ?? {}).find((candidate) => candidate.correlation_id === correlationId);
    if (!entry || entry.disposition !== "unknown") throw new StewardFailure("admission_recovery_unavailable", "No unknown admission is awaiting recovery for that owner correlation.");
    const recovery = this.#admissionResult(this.#call("softwareImplementation", "recover", { correlation_id: correlationId }, "software_implementation_unavailable"), correlationId);
    return this.store.transact((state) => {
      const current = Object.values(state.admissions ?? {}).find((candidate) => candidate.correlation_id === correlationId);
      if (!current || current.disposition !== "unknown") throw new StewardFailure("admission_recovery_mismatch", "The owner recovery no longer matches the durable unknown correlation.");
      current.disposition = recovery.disposition;
      current.admission = clone(recovery);
      return { recovery: clone(recovery) };
    });
  }
  projectAdmission(request) {
    const matterId = requiredText(request.matter_id, "matter_id");
    const admission = this.#admissionResult(request.admission);
    const condition = admission.disposition === "refused" ? "blocked" : admission.disposition === "unknown" ? "unknown" : admission.disposition === "admitted" ? "current" : "observation-limited";
    const observation = {
      id: `observation:software-implementation:${portfolioDigest({ matter_id: matterId, correlation_id: admission.correlation_id, currentness: admission.currentness, condition })}`,
      matter_id: matterId,
      owner: { kind: "software-implementation", id: "software-implementation:current" },
      artifact: { id: admission.correlation_id, revision: admission.currentness },
      represented_revision: admission.currentness,
      currentness: admission.currentness,
      observed_at: admission.observed_at,
      condition,
      limitations: clone(admission.limitations),
    };
    if (admission.blocker != null) observation.blocker = clone(admission.blocker);
    if (admission.event_id != null) observation.event_id = admission.event_id;
    if (admission.attention_support != null) observation.attention_support = clone(admission.attention_support);
    return { observation };
  }
  #ownerResult(work, message) {
    try { return work(); }
    catch { throw new StewardFailure("owner_result_invalid", message); }
  }
  #orientationResult(kind, value, expectedArtifact) {
    return this.#ownerResult(() => {
      const result = requiredObject(value, `${kind} orientation`);
      const common = ["artifact", "represented_revision", "currentness", "condition", "observed_at", "evidence", "limitations"];
      const specific = {
        case: ["status", "knowledge", "sources"],
        frame: ["status", "outcome", "open_questions", "next_movement"],
        blueprint: ["status", "readiness", "open_questions", "decisions", "blockers", "next_movement", "missing_evidence", "conflicting_evidence"],
        rfc: ["status", "readiness", "source"],
        atlas: ["status", "handoff", "dependencies", "proof"],
        prototype: ["question", "observations", "verdict", "locator"],
      }[kind];
      if (!specific) throw Error("unsupported owner kind");
      exactKeys(result, [...common, ...specific], `${kind} orientation`, "owner_result_invalid");
      const artifact = this.#artifact(result.artifact);
      if (artifact.id !== expectedArtifact.id || artifact.revision !== expectedArtifact.revision) throw Error("artifact mismatch");
      if (requiredText(result.represented_revision, "represented_revision") !== expectedArtifact.revision) throw Error("revision mismatch");
      requiredText(result.currentness, "currentness"); requiredText(result.condition, "condition"); requiredText(result.observed_at, "observed_at");
      textArray(result.evidence, "evidence"); textArray(result.limitations, "limitations");
      if (kind === "prototype") {
        requiredText(result.question, "question"); textArray(result.observations, "observations"); requiredText(result.verdict, "verdict"); requiredText(result.locator, "locator");
      } else {
        requiredText(result.status, "status");
        if (kind === "case") { textArray(result.knowledge, "knowledge"); textArray(result.sources, "sources"); }
        if (kind === "frame") { requiredText(result.outcome, "outcome"); textArray(result.open_questions, "open_questions"); requiredText(result.next_movement, "next_movement"); }
        if (kind === "blueprint") { requiredText(result.readiness, "readiness"); textArray(result.open_questions, "open_questions"); textArray(result.decisions, "decisions"); textArray(result.blockers, "blockers"); requiredText(result.next_movement, "next_movement"); textArray(result.missing_evidence, "missing_evidence"); textArray(result.conflicting_evidence, "conflicting_evidence"); }
        if (kind === "rfc") { requiredText(result.readiness, "readiness"); this.#artifact(result.source); }
        if (kind === "atlas") { requiredObject(result.handoff, "handoff"); textArray(result.dependencies, "dependencies"); textArray(result.proof, "proof"); }
      }
      return clone(result);
    }, `The ${kind} owner did not return its exact identity, revision/currentness, condition, evidence, limits, and owner-defined fields.`);
  }
  #answerSubmissionResult(value, expectedQuestion, expectedAnswerId) {
    return this.#ownerResult(() => {
      const root = exactKeys(requiredObject(value, "answer submission result"), ["disposition", "replayed", "question"], "answer submission result", "owner_result_invalid");
      if (requiredText(root.disposition, "answer submission disposition") !== "accepted" || typeof root.replayed !== "boolean") throw Error("submission acknowledgement invalid");
      const ownerResult = this.#questionResult({ question: root.question }, expectedQuestion);
      if (ownerResult.condition !== "answer-submitted" || ownerResult.answer_id !== expectedAnswerId) throw Error("submission identity mismatch");
      return { answer_id: ownerResult.answer_id, owner_result: ownerResult, replayed: root.replayed };
    }, "The Question owner did not return an exact attributable non-content Answer submission result.");
  }
  #questionResult(value, expected = {}) {
    return this.#ownerResult(() => {
      const root = requiredObject(value, "question result");
      exactKeys(root, ["question"], "question result", "owner_result_invalid");
      const question = requiredObject(root.question, "question");
      exactKeys(question, ["locator", "owner", "represented_revision", "currentness", "condition", "observed_at", "result_locator", "answer_id", "successor_question_id", "resolution_basis", "supersession_basis", "withdrawal_basis", "evidence", "limitations"], "question", "owner_result_invalid");
      const owner = requiredObject(question.owner, "question.owner");
      const normalized = {
        locator: requiredText(question.locator, "question.locator"),
        owner: { kind: requiredText(owner.kind, "question.owner.kind"), id: requiredText(owner.id, "question.owner.id") },
        represented_revision: requiredText(question.represented_revision, "question.represented_revision"),
        currentness: requiredText(question.currentness, "question.currentness"),
        condition: requiredText(question.condition, "question.condition"),
        observed_at: requiredText(question.observed_at, "question.observed_at"),
        evidence: textArray(question.evidence, "question.evidence"),
        limitations: textArray(question.limitations, "question.limitations"),
      };
      if (!new Set(["open", "answer-submitted", "resolved", "superseded", "withdrawn"]).has(normalized.condition)) throw Error("condition invalid");
      if (expected.locator && normalized.locator !== expected.locator) throw Error("locator mismatch");
      if (expected.owner && (normalized.owner.kind !== expected.owner.kind || normalized.owner.id !== expected.owner.id)) throw Error("owner mismatch");
      if (expected.revision && normalized.represented_revision !== expected.revision) throw Error("revision mismatch");
      if (["resolved", "superseded", "withdrawn"].includes(normalized.condition)) normalized.result_locator = requiredText(question.result_locator, "question.result_locator");
      if (normalized.condition === "answer-submitted") normalized.answer_id = requiredText(question.answer_id, "question.answer_id");
      if (normalized.condition === "resolved") { normalized.resolution_basis = requiredText(question.resolution_basis, "question.resolution_basis"); if (question.answer_id != null) normalized.answer_id = requiredText(question.answer_id, "question.answer_id"); }
      if (normalized.condition === "superseded") { normalized.successor_question_id = requiredText(question.successor_question_id, "question.successor_question_id"); normalized.supersession_basis = requiredText(question.supersession_basis, "question.supersession_basis"); }
      if (normalized.condition === "withdrawn") normalized.withdrawal_basis = requiredText(question.withdrawal_basis, "question.withdrawal_basis");
      return normalized;
    }, "The requesting owner did not return an exact attributable Question result.");
  }
  #atlasHandoff(value, atlasBinding, target) {
    try {
      const handoff = requiredObject(value, "handoff");
      const disposition = requiredText(handoff.disposition, "handoff.disposition");
      if (disposition === "HandoffRefusal") return { disposition, current: handoff.current === true, limitations: textArray(handoff.limitations ?? [], "handoff.limitations"), forbidden_claims: textArray(handoff.forbidden_claims ?? [], "handoff.forbidden_claims"), required_effects: textArray(handoff.required_effects ?? [], "handoff.required_effects") };
      const scope = requiredObject(handoff.scope, "handoff.scope");
      const features = requiredArray(scope.features, "handoff.scope.features").map((feature) => { const item = requiredObject(feature, "handoff feature"); return { id: requiredText(item.id, "handoff.feature.id"), owner: requiredText(item.owner, "handoff.feature.owner"), outcome: requiredText(item.outcome, "handoff.feature.outcome") }; });
      const workItems = requiredArray(scope.work_items, "handoff.scope.work_items").map((workItem) => { const item = requiredObject(workItem, "handoff work item"); return { id: requiredText(item.id, "handoff.work_item.id"), feature_id: requiredText(item.feature_id, "handoff.work_item.feature_id"), owner: requiredText(item.owner, "handoff.work_item.owner"), outcome: requiredText(item.outcome, "handoff.work_item.outcome") }; });
      if (!features.length || !workItems.length || workItems.some((item) => !features.some((feature) => feature.id === item.feature_id))) throw Error("ownership incomplete");
      const order = requiredObject(handoff.order, "handoff.order");
      requiredArray(order.dependencies, "handoff.order.dependencies").forEach((edge) => { const item = requiredObject(edge, "handoff dependency"); requiredText(item.consumer, "handoff.dependency.consumer"); requiredText(item.prerequisite, "handoff.dependency.prerequisite"); });
      textArray(order.convergence, "handoff.order.convergence");
      textArray(handoff.obligations, "handoff.obligations");
      const authorityBoundary = requiredObject(handoff.authority_boundary, "handoff.authority_boundary");
      if (requiredText(authorityBoundary.implementation, "handoff.authority_boundary.implementation") !== "present") throw Error("implementation authority absent");
      requiredText(authorityBoundary.external_effects, "handoff.authority_boundary.external_effects");
      const reread = requiredObject(handoff.fresh_reread, "handoff.fresh_reread");
      if (requiredText(reread.status, "handoff.fresh_reread.status") !== "complete_consistent") throw Error("reread incomplete");
      requiredText(reread.observed_at, "handoff.fresh_reread.observed_at");
      if (requiredText(handoff.map_id, "handoff.map_id") !== atlasBinding.map_id || requiredText(handoff.decision_id, "handoff.decision_id") !== atlasBinding.decision_id) throw Error("binding mismatch");
      if (![...features, ...workItems].some((item) => item.id === target.id)) throw Error("target absent");
      return { ...clone(handoff), scope: { features, work_items: workItems }, disposition, limitations: textArray(handoff.limitations ?? [], "handoff.limitations"), forbidden_claims: textArray(handoff.forbidden_claims ?? [], "handoff.forbidden_claims"), required_effects: textArray(handoff.required_effects ?? [], "handoff.required_effects") };
    } catch (error) {
      if (error instanceof StewardFailure && error.code === "atlas_handoff_refused") throw error;
      throw new StewardFailure("atlas_handoff_invalid", "Atlas did not return complete current ownership, dependency, obligation, authority, and reread evidence.");
    }
  }
  #admissionResult(value, expectedCorrelationId = null) {
    try {
      const admission = requiredObject(value, "software implementation admission");
      const disposition = requiredText(admission.disposition, "admission.disposition");
      if (!new Set(["admitted", "refused", "unknown"]).has(disposition)) throw Error("disposition invalid");
      const correlationId = requiredText(admission.correlation_id, "admission.correlation_id");
      if (expectedCorrelationId && correlationId !== expectedCorrelationId) throw Error("correlation mismatch");
      const normalized = { ...clone(admission), disposition, correlation_id: correlationId, currentness: requiredText(admission.currentness, "admission.currentness"), observed_at: requiredText(admission.observed_at, "admission.observed_at"), limitations: textArray(admission.limitations ?? [], "admission.limitations") };
      if (disposition === "admitted") normalized.authorized_routine_mechanics = textArray(admission.authorized_routine_mechanics, "admission.authorized_routine_mechanics");
      if (admission.blocker != null) normalized.blocker = clone(requiredObject(admission.blocker, "admission.blocker"));
      if (admission.event_id != null) normalized.event_id = requiredText(admission.event_id, "admission.event_id");
      if (admission.attention_support != null) normalized.attention_support = clone(requiredObject(admission.attention_support, "admission.attention_support"));
      return normalized;
    } catch { throw new StewardFailure("software_implementation_result_invalid", "Software Implementation returned an invalid owner-specific admission result."); }
  }
  #artifact(value) {
    const artifact = requiredObject(value, "artifact");
    exactKeys(artifact, ["id", "revision"], "artifact");
    return { id: requiredText(artifact.id, "artifact.id"), revision: requiredText(artifact.revision, "artifact.revision") };
  }
  #endpoint(owner, unavailableCode) {
    const endpoint = this.owners[owner];
    if (!endpoint || typeof endpoint !== "object") throw new StewardFailure(unavailableCode, "The required owner endpoint is unavailable.");
    return endpoint;
  }
  #call(owner, method, input, unavailableCode) {
    const endpoint = this.#endpoint(owner, unavailableCode);
    if (typeof endpoint[method] !== "function") throw new StewardFailure(unavailableCode, "The required owner endpoint is unavailable.");
    return endpoint[method](clone(input));
  }
  #envelope(value) {
    const envelope = exactKeys(requiredObject(value, "envelope"), ["outcome", "action", "target", "space_scope", "matter_id", "consequences", "monitoring_scope", "lifetime", "repository", "path", "base", "delivery_shape", "delivery", "routine_mechanics", "absent_operations", "invalidators", "atlas", "authority", "effect_bindings"], "envelope", "authority_envelope_invalid");
    const effects = requiredArray(envelope.effect_bindings, "envelope.effect_bindings").map((effect) => { const binding = exactKeys(requiredObject(effect, "envelope.effect_binding"), ["effect", "binding"], "envelope.effect_binding", "authority_envelope_invalid"); return { effect: requiredText(binding.effect, "envelope.effect_binding.effect"), binding: requiredText(binding.binding, "envelope.effect_binding.binding") }; });
    if (new Set(effects.map((effect) => effect.effect)).size !== effects.length) throw new StewardFailure("authority_envelope_invalid", "Each external/live effect may appear only once in the cumulative envelope.");
    if (!envelope.target || typeof envelope.target !== "object" || Array.isArray(envelope.target)) throw new StewardFailure("authority_envelope_invalid", "The cumulative envelope must name its exact target.");
    const target = exactKeys(envelope.target, ["kind", "id"], "envelope.target", "authority_envelope_invalid");
    const spaceScope = exactKeys(requiredObject(envelope.space_scope, "envelope.space_scope"), ["kind", "space_id"], "envelope.space_scope", "authority_envelope_invalid");
    const scopeKind = requiredText(spaceScope.kind, "envelope.space_scope.kind");
    if (scopeKind === "space") requiredText(spaceScope.space_id, "envelope.space_scope.space_id");
    else if (scopeKind !== "cross-space") throw new StewardFailure("authority_envelope_invalid", "The envelope Space scope must be Space or cross-Space.");
    const monitoringScope = exactKeys(requiredObject(envelope.monitoring_scope, "envelope.monitoring_scope"), ["kind", "id"], "envelope.monitoring_scope", "authority_envelope_invalid");
    const lifetime = exactKeys(requiredObject(envelope.lifetime, "envelope.lifetime"), ["kind", "expires_at"], "envelope.lifetime", "authority_envelope_invalid");
    const delivery = exactKeys(requiredObject(envelope.delivery, "envelope.delivery"), ["branch", "worktree", "pull_request_base"], "envelope.delivery", "authority_envelope_invalid");
    return {
      outcome: requiredText(envelope.outcome, "envelope.outcome"),
      action: requiredText(envelope.action, "envelope.action"),
      target: { kind: requiredText(target.kind, "envelope.target.kind"), id: requiredText(target.id, "envelope.target.id") },
      space_scope: clone(spaceScope),
      matter_id: requiredText(envelope.matter_id, "envelope.matter_id"),
      consequences: requiredArray(envelope.consequences, "envelope.consequences").map((item) => requiredText(item, "envelope.consequence")),
      monitoring_scope: { kind: requiredText(monitoringScope.kind, "envelope.monitoring_scope.kind"), id: requiredText(monitoringScope.id, "envelope.monitoring_scope.id") },
      lifetime: { kind: requiredText(lifetime.kind, "envelope.lifetime.kind"), expires_at: lifetime.expires_at == null ? null : requiredText(lifetime.expires_at, "envelope.lifetime.expires_at") },
      repository: requiredText(envelope.repository, "envelope.repository"),
      path: requiredText(envelope.path, "envelope.path"),
      base: requiredText(envelope.base, "envelope.base"),
      delivery_shape: requiredText(envelope.delivery_shape, "envelope.delivery_shape"),
      delivery: { branch: requiredText(delivery.branch, "envelope.delivery.branch"), worktree: requiredText(delivery.worktree, "envelope.delivery.worktree"), pull_request_base: requiredText(delivery.pull_request_base, "envelope.delivery.pull_request_base") },
      routine_mechanics: requiredArray(envelope.routine_mechanics, "envelope.routine_mechanics").map((item) => requiredText(item, "envelope.routine_mechanic")),
      absent_operations: requiredArray(envelope.absent_operations, "envelope.absent_operations").map((item) => requiredText(item, "envelope.absent_operation")),
      invalidators: requiredArray(envelope.invalidators, "envelope.invalidators").map((item) => requiredText(item, "envelope.invalidator")),
      atlas: (() => { const atlas = exactKeys(requiredObject(envelope.atlas, "envelope.atlas"), ["map_id", "decision_id"], "envelope.atlas", "authority_envelope_invalid"); return { map_id: requiredText(atlas.map_id, "envelope.atlas.map_id"), decision_id: requiredText(atlas.decision_id, "envelope.atlas.decision_id") }; })(),
      authority: (() => { const authority = exactKeys(requiredObject(envelope.authority, "envelope.authority"), ["kind", "id"], "envelope.authority", "authority_envelope_invalid"); return { kind: requiredText(authority.kind, "envelope.authority.kind"), id: requiredText(authority.id, "envelope.authority.id") }; })(),
      effect_bindings: effects,
    };
  }
}

export class CustodyService {
  constructor(store) { this.store = store; }
  invoke(operation, request) {
    const actions = {
      "identity.resolve": () => this.store.resolve(),
      "identity.create": () => this.store.createSingleton(request.id, request.expected_revision),
      "spaces.create": () => this.store.createSpace(request.expected_directory_revision, request.space),
      "spaces.retire": () => this.store.retireSpace(request.space_id, request.expected_revision),
      "spaces.associations.set": () => this.store.setAssociation(request.space_id, request.expected_revision, request.association),
      "spaces.associations.remove": () => this.store.removeAssociation(request.space_id, request.expected_revision, request.namespace_id),
      "intakes.capture": () => this.store.capture(request),
      "matters.place": () => this.store.place(request),
      "matters.read": () => this.store.readMatter(request.matter_id),
      "spaces.manifest": () => this.store.manifest(request.space_id),
      "matters.transition": () => this.store.transition(request),
      "matters.questions.link": () => this.store.linkQuestion(request),
    };
    if (operation === "capabilities") return { protocol: resultSchema, version: 1, groups: ["identity", "spaces", "intakes", "matters", "portfolio", "orientation", "acknowledgement", "owner-boundaries", "implementation-admission"] };
    if (!actions[operation]) throw new StewardFailure("operation_unavailable", "This capability is unavailable in the F-007 Steward facade.");
    return actions[operation]();
  }
}

export function createStewardFacade(databasePath, owners = {}) {
  const store = new StewardStore(databasePath);
  const portfolio = new PortfolioService(store, owners);
  const custody = new CustodyService(store);
  const boundary = new OwnerBoundaryService(store, owners);
  return {
    invoke(request) {
      const operation = request?.operation;
      try {
        const actions = {
          "portfolio.compose": () => portfolio.compose(request),
          "portfolio.acknowledge": () => portfolio.acknowledge(request),
          "portfolio.baselines.read": () => portfolio.baselines(),
          "owner.case.orient": () => boundary.orient("case", request),
          "owner.frame.orient": () => boundary.orient("frame", request),
          "owner.blueprint.orient": () => boundary.orient("blueprint", request),
          "owner.prototype.orient": () => boundary.orient("prototype", request),
          "owner.rfc.orient": () => boundary.orient("rfc", request),
          "owner.atlas.orient": () => boundary.orient("atlas", request),
          "owner.bindings.create": () => boundary.createBinding(request),
          "owner.bindings.focus": () => boundary.focusBinding(request),
          "owner.bindings.resolve": () => boundary.resolveBinding(request),
          "owner.questions.project": () => boundary.projectQuestion(request),
          "owner.answers.submit": () => boundary.submitAnswer(request),
          "matters.answers.submit": () => boundary.submitAnswer(request),
          "matters.questions.close": () => boundary.closeQuestion(request),
          "owner.directives.authorize": () => boundary.authorize(request),
          "implementation.admission.prepare": () => boundary.prepareAdmission(request),
          "implementation.admission.submit": () => boundary.submitAdmission(request),
          "implementation.admission.recover": () => boundary.recoverAdmission(request),
          "implementation.portfolio.project": () => boundary.projectAdmission(request),
        };
        const name = requiredText(operation, "operation");
        if (name === "owner.questions.close" || name === "implementation.admission.resume") throw new StewardFailure("operation_unavailable", "This owner-only operation is unavailable through Steward.");
        const result = actions[name] ? actions[name]() : custody.invoke(name, request);
        return { exitCode: 0, envelope: success(operation, result) };
      } catch (error) {
        const code = error instanceof StewardFailure ? error.code : "internal_failure";
        const message = error instanceof StewardFailure ? error.message : "The Steward operation did not settle safely.";
        return { exitCode: 2, envelope: failure(typeof operation === "string" ? operation : "unknown", code, message) };
      }
    },
  };
}

export function invokeFacade(databasePath, request) {
  return createStewardFacade(databasePath).invoke(request);
}
