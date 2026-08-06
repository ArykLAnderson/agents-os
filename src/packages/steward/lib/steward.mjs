import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const schema = "steward-store@1";
const resultSchema = "steward-result@1";
const clone = (value) => structuredClone(value);
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const now = () => new Date().toISOString();
const transactionWaiter = new Int32Array(new SharedArrayBuffer(4));
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
function defaultState() {
  return { schema, revision: 0, singleton: null, directory: { revision: 0, spaces: {} }, intakes: {}, replay: {}, matters: {}, baselines: {}, observations: {} };
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
      draft.revision += 1;
      const temporary = `${this.databasePath}.${process.pid}.${randomUUID()}.tmp`;
      try {
        writeFileSync(temporary, `${JSON.stringify(draft)}\n`, { mode: 0o600 });
        renameSync(temporary, this.databasePath);
      } finally {
        if (existsSync(temporary)) try { writeFileSync(temporary, ""); } catch { /* owned temp is best effort */ }
      }
      return clone(result);
    } finally {
      release();
    }
  }
  #acquireTransactionLock() {
    const lockPath = `${this.databasePath}.lock`;
    const deadline = Date.now() + 60_000;
    while (true) {
      try {
        const descriptor = openSync(lockPath, "wx", 0o600);
        return () => {
          closeSync(descriptor);
          try { unlinkSync(lockPath); } catch { /* lock cleanup is best effort */ }
        };
      } catch (error) {
        if (error?.code !== "EEXIST") throw new StewardFailure("store_unavailable", "The Steward store cannot be written safely.");
        if (Date.now() >= deadline) throw new StewardFailure("store_transaction_conflict", "The Steward store is busy; retry the operation.");
        Atomics.wait(transactionWaiter, 0, 0, 10);
      }
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
      const input = requiredObject(association, "association");
      const namespaceId = requiredText(input.namespace_id, "association.namespace_id");
      if (namespaceId === "namespace:root") throw new StewardFailure("root_namespace_forbidden", "namespace:root cannot be associated with a Space.");
      if (!namespaceId.startsWith("namespace:")) throw new StewardFailure("namespace_id_invalid", "Namespace associations require a semantic namespace ID.");
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
        return { intake, matter: Object.values(state.matters).find((matter) => matter.intake_id === intake.id) ?? null, replayed: true };
      }
      const intake = { id: `intake:${randomUUID()}`, replay_key: replayKey, content: input.content, provenance: clone(input.provenance), digest: contentDigest, captured_at: now() };
      state.intakes[intake.id] = intake; state.replay[replayKey] = intake.id;
      let matter = null;
      if (input.space_id != null) matter = this.#newMatter(state, intake.id, input.space_id, input.relevance_reason, input.owner_references, input.return_condition);
      return { intake, matter, replayed: false };
    });
  }
  place(input) {
    return this.transact((state) => {
      const intake = state.intakes[requiredText(input.intake_id, "intake_id")];
      if (!intake) throw new StewardFailure("intake_not_found", "The Intake is not available.");
      const existing = Object.values(state.matters).find((matter) => matter.intake_id === intake.id);
      if (existing) return { intake, matter: existing, replayed: true };
      const space = this.#space(state, input.space_id);
      exactRevision(input.expected_space_revision, space.revision, "space_revision_conflict");
      const matter = this.#newMatter(state, intake.id, space.id, input.relevance_reason, input.owner_references, input.return_condition);
      return { intake, matter, replayed: false };
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
      return { matter };
    });
  }
  linkQuestion(input) {
    return this.transact((state) => {
      const matter = this.#matter(state, input.matter_id); exactRevision(input.expected_revision, matter.revision, "matter_revision_conflict");
      const question = requiredObject(input.question, "question"); const owner = requiredObject(question.owner, "question.owner");
      requiredText(owner.kind, "question.owner.kind"); requiredText(owner.id, "question.owner.id");
      if (matter.question) throw new StewardFailure("question_already_linked", "A Matter may retain one active Question link.");
      matter.question = { owner: clone(owner), locator: requiredText(question.locator, "question.locator"), revision: requiredText(question.revision, "question.revision"), state: "open", answer: null, result_locator: null };
      matter.revision += 1; return { matter };
    });
  }
  submitAnswer(input) {
    return this.transact((state) => {
      const matter = this.#matter(state, input.matter_id); exactRevision(input.expected_revision, matter.revision, "matter_revision_conflict");
      if (!matter.question) throw new StewardFailure("question_not_linked", "The Matter has no Question link.");
      const answer = requiredObject(input.answer, "answer"); const normalized = { id: requiredText(answer.id, "answer.id"), body: requiredText(answer.body, "answer.body"), submitted_at: now() };
      if (matter.question.answer) {
        if (matter.question.answer.id === normalized.id && matter.question.answer.body === normalized.body) return { matter, replayed: true };
        throw new StewardFailure("answer_immutable_conflict", "An Answer submission is immutable.");
      }
      matter.question.answer = normalized; matter.revision += 1; return { matter, replayed: false };
    });
  }
  closeQuestion(input) {
    return this.transact((state) => {
      const matter = this.#matter(state, input.matter_id); exactRevision(input.expected_revision, matter.revision, "matter_revision_conflict");
      if (!matter.question) throw new StewardFailure("question_not_linked", "The Matter has no Question link.");
      const owner = requiredObject(input.owner, "owner");
      if (owner.kind !== matter.question.owner.kind || owner.id !== matter.question.owner.id) throw new StewardFailure("question_owner_required", "Only the requesting owner can resolve, supersede, or withdraw its Question.");
      matter.question.state = "resolved"; matter.question.result_locator = requiredText(input.result_locator, "result_locator"); matter.revision += 1;
      return { matter };
    });
  }
  #space(state, id) { const space = state.directory.spaces[requiredText(id, "space_id")]; if (!space) throw new StewardFailure("space_not_found", "The Space is not available."); return space; }
  #matter(state, id) { const matter = state.matters[requiredText(id, "matter_id")]; if (!matter) throw new StewardFailure("matter_not_found", "The Matter is not available."); return matter; }
  #newMatter(state, intakeId, spaceId, relevanceReason, ownerReferences, returnCondition = undefined) {
    const space = this.#space(state, spaceId); if (space.lifecycle !== "active") throw new StewardFailure("space_retired", "A retired Space cannot receive new Matter placement.");
    if (!Array.isArray(ownerReferences)) throw new StewardFailure("owner_references_invalid", "owner_references must be an array of exact locators.");
    const matter = { id: `matter:${randomUUID()}`, intake_id: intakeId, home_space_id: space.id, lifecycle: "active", relevant: true, relevance_reason: requiredText(relevanceReason, "relevance_reason"), owner_references: clone(ownerReferences), return_condition: returnCondition == null ? { kind: "none" } : clone(returnCondition), deferral_reason: null, question: null, revision: 1, created_at: now(), updated_at: now() };
    state.matters[matter.id] = matter; return matter;
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
      "matters.answers.submit": () => this.store.submitAnswer(request),
      "matters.questions.close": () => this.store.closeQuestion(request),
    };
    if (operation === "capabilities") return { protocol: resultSchema, version: 1, groups: ["identity", "spaces", "intakes", "matters"] };
    if (!actions[operation]) throw new StewardFailure("operation_unavailable", "This capability is unavailable in the F-007 Steward facade.");
    return actions[operation]();
  }
}

export function invokeFacade(databasePath, request) {
  const operation = request?.operation;
  try {
    const result = new CustodyService(new StewardStore(databasePath)).invoke(requiredText(operation, "operation"), request);
    return { exitCode: 0, envelope: success(operation, result) };
  } catch (error) {
    const code = error instanceof StewardFailure ? error.code : "internal_failure";
    const message = error instanceof StewardFailure ? error.message : "The Steward operation did not settle safely.";
    return { exitCode: 2, envelope: failure(typeof operation === "string" ? operation : "unknown", code, message) };
  }
}
