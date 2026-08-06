import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
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
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
const portfolioDigest = (value) => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
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
      if (result?.[noWrite]) return clone(result.result);
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

export class PortfolioService {
  constructor(store) { this.store = store; }
  compose(request) { return { view: this.#compose(this.store.read(), request) }; }
  baselines() {
    const baselines = this.store.read().baselines ?? {};
    return { global: baselines.global ?? null, spaces: baselines.spaces ?? {} };
  }
  acknowledge(request) {
    const viewId = requiredText(request.view_id, "view_id");
    const viewRequest = requiredObject(request.view_request, "view_request");
    return this.store.transact((state) => {
      const view = this.#compose(state, viewRequest);
      if (view.id !== viewId) throw new StewardFailure("view_not_reproducible", "The represented sources no longer reproduce the acknowledged view.");
      const baselines = state.baselines ??= {};
      const scope = view.scope.kind === "global" ? baselines : (baselines.spaces ??= {});
      const key = view.scope.kind === "global" ? "global" : view.scope.space_id;
      const prior = scope[key] ?? null;
      if (prior?.view_id === view.id) return withoutWrite({ baseline: prior, replayed: true, view });
      exactRevision(request.expected_baseline_revision, prior?.revision ?? 0, "baseline_revision_conflict");
      const baseline = { scope: clone(view.scope), revision: (prior?.revision ?? 0) + 1, view_id: view.id, manifest_id: view.manifest.id, acknowledged_at: now() };
      scope[key] = baseline;
      return { baseline, replayed: false, view };
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
  #observations(input, matters) {
    const visible = new Set(matters.map((matter) => matter.id));
    const seen = new Set();
    return requiredArray(input, "observations").map((item) => {
      const observation = requiredObject(item, "observation");
      const id = requiredText(observation.id, "observation.id");
      if (seen.has(id)) throw new StewardFailure("observation_id_conflict", "Observation identities must be unique.");
      seen.add(id);
      const matterId = requiredText(observation.matter_id, "observation.matter_id");
      const owner = requiredObject(observation.owner, "observation.owner");
      const artifact = requiredObject(observation.artifact, "observation.artifact");
      const normalized = { id, matter_id: matterId, owner: { kind: requiredText(owner.kind, "observation.owner.kind"), id: requiredText(owner.id, "observation.owner.id") }, artifact: { id: requiredText(artifact.id, "observation.artifact.id"), revision: requiredText(artifact.revision, "observation.artifact.revision") }, represented_revision: requiredText(observation.represented_revision, "observation.represented_revision"), currentness: requiredText(observation.currentness, "observation.currentness"), observed_at: requiredText(observation.observed_at, "observation.observed_at"), condition: requiredText(observation.condition, "observation.condition"), limitations: clone(requiredArray(observation.limitations ?? [], "observation.limitations")) };
      return visible.has(matterId) ? normalized : null;
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
        if (related.some((item) => item.condition === "satisfied")) return { matter_id: matter.id, status: "satisfied", eligible: true, condition };
        if (!related.length || related.some((item) => ["unavailable", "unknown", "partial", "stale"].includes(item.condition))) return { matter_id: matter.id, status: "uncheckable", eligible: true, condition, limitations: related.flatMap((item) => item.limitations) };
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
      const axes = requiredObject(recommendation.axes, "attention.axes");
      for (const axis of ["human_needed", "independently_progressing", "observation_limited"]) if (typeof axes[axis] !== "boolean") throw new StewardFailure("attention_axes_invalid", "Each independent attention axis must be explicit.");
      const smallest = requiredObject(recommendation.smallest_action, "attention.smallest_action");
      const evidenceId = requiredText(smallest.evidence_id, "attention.smallest_action.evidence_id");
      if (!evidenceIds.includes(evidenceId)) throw new StewardFailure("attention_action_uncited", "The smallest action must cite its recommendation evidence.");
      const returnState = returns.find((item) => item.matter_id === matterId);
      return { matter_id: matterId, band, evidence_ids: evidenceIds, axes: clone(axes), explanation: { matter_id: matterId, provenance: clone(matterById.get(matterId).intake?.provenance ?? null), return: returnState, observations: evidenceIds.map((id) => ({ id, owner: clone(byId.get(id).owner), artifact: clone(byId.get(id).artifact), condition: byId.get(id).condition, limitations: clone(byId.get(id).limitations) })) }, smallest_action: { text: requiredText(smallest.text, "attention.smallest_action.text"), evidence_id: evidenceId }, return: returnState };
    });
    const recommendedIds = new Set(recommended.map((item) => item.matter_id));
    return { recommendations: recommended, indeterminate: matters.filter((matter) => !recommendedIds.has(matter.id)).map((matter) => ({ matter_id: matter.id, return: returns.find((item) => item.matter_id === matter.id), limitation: "No represented evidence distinguishes an advisory attention characterization." })) };
  }
  #namespace(state, scope, input) {
    if (input == null) return null;
    const context = requiredObject(input, "namespace_context");
    const namespaceId = requiredText(context.namespace_id, "namespace_context.namespace_id");
    if (namespaceId === "namespace:root") throw new StewardFailure("root_namespace_forbidden", "namespace:root cannot control Portfolio context.");
    if (!namespaceId.startsWith("namespace:")) throw new StewardFailure("namespace_id_invalid", "Namespace context requires a semantic Namespace ID.");
    const candidates = scope.kind === "global" ? Object.values(state.directory.spaces) : [this.#space(state, scope.space_id)];
    const associations = candidates.map((space) => {
      const association = space.associations[namespaceId] ?? space.retired_associations[namespaceId] ?? null;
      return association ? { ...clone(association), status: space.associations[namespaceId] ? "active" : "retired", space_id: space.id } : null;
    }).filter(Boolean).sort((left, right) => left.space_id.localeCompare(right.space_id));
    const activeDescendantChoices = new Set(associations.filter((item) => item.status === "active").map((item) => item.include_descendants));
    const conflicting = activeDescendantChoices.size > 1;
    return { namespace_id: namespaceId, mode: requiredText(context.mode, "namespace_context.mode"), association: associations[0] ?? null, associations, conflicting, limitations: ["Namespace is organizational context only; it does not control identity, visibility, authority, or Portfolio coverage.", ...(conflicting ? ["Contradictory Namespace associations are shown as context and do not select an authority, coverage, or identity result."] : [])] };
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
    if (operation === "capabilities") return { protocol: resultSchema, version: 1, groups: ["identity", "spaces", "intakes", "matters", "portfolio", "orientation", "acknowledgement"] };
    if (!actions[operation]) throw new StewardFailure("operation_unavailable", "This capability is unavailable in the F-007 Steward facade.");
    return actions[operation]();
  }
}

export function invokeFacade(databasePath, request) {
  const operation = request?.operation;
  try {
    const store = new StewardStore(databasePath);
    const portfolio = new PortfolioService(store);
    const actions = {
      "portfolio.compose": () => portfolio.compose(request),
      "portfolio.acknowledge": () => portfolio.acknowledge(request),
      "portfolio.baselines.read": () => portfolio.baselines(),
    };
    const name = requiredText(operation, "operation");
    const result = actions[name] ? actions[name]() : new CustodyService(store).invoke(name, request);
    return { exitCode: 0, envelope: success(operation, result) };
  } catch (error) {
    const code = error instanceof StewardFailure ? error.code : "internal_failure";
    const message = error instanceof StewardFailure ? error.message : "The Steward operation did not settle safely.";
    return { exitCode: 2, envelope: failure(typeof operation === "string" ? operation : "unknown", code, message) };
  }
}
