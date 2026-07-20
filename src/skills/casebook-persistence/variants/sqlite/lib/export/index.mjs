import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { failure, RETRY_DISPOSITIONS, success, unsupported } from "../../../../shared/protocol.mjs";
import { invokeCaseOperation } from "../case/index.mjs";
import { invokeFrameOperation } from "../frame/index.mjs";
import { invokeSubstrateOperation } from "../substrate/index.mjs";
import { canonicalJson, mechanicalDigest } from "../substrate/mechanical.mjs";

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const OWNER_ID = new RegExp(`^(case|frame):${UUID}$`);
const REVISION_ID = new RegExp(`^(case|frame)-revision:${UUID}$`);
const DIGEST = /^[0-9a-f]{64}$/;
const MODES = new Set(["current", "historical"]);
const REQUIREMENTS = new Set(["required", "optional"]);
const DESTINATIONS = new Map([
  ["private_inspection", new Set(["private"])],
  ["portable_bundle", new Set(["portable", "public"])],
  ["publication_staging", new Set(["public"])],
]);
const AUDIENCES = new Set(["private", "internal", "restricted", "portable", "public"]);
const REQUEST_FIELDS = new Set([
  "protocol", "operation", "request_version", "operation_id", "store_id", "context",
  "authority_claim", "mode", "audience", "destination", "owners", "configuration",
]);
const CONTEXT_FIELDS = new Set(["view_id", "view_policy_revision_id", "purpose", "requested_audience_ceiling"]);
const AUTHORITY_FIELDS = new Set(["human_authorized", "acting_role", "authority_basis", "human_confirmation_reference", "causation", "correlation", "session"]);
const OWNER_FIELDS = new Set(["kind", "id", "requirement", "revision_id", "evidence_selection"]);
const DESTINATION_FIELDS = new Set(["classification", "temporary_path", "final_path"]);
const FRAGMENT_SCHEMAS = Object.freeze({ case: "case-owner-export-fragment@3", frame: "frame-owner-export-fragment@1" });
const SEMANTIC_PREDICATES = new Set(["depends-on", "depends_on", "requires", "governed-by", "governed_by", "implements", "realizes"]);
const MAX_OWNERS = 64;

class ExportError extends Error {
  constructor(code, message, evidence = {}) {
    super(message);
    this.code = code;
    this.evidence = evidence;
  }
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function exact(value, fields, pathName) {
  if (!object(value) || Object.keys(value).some((key) => !fields.has(key))) {
    throw new ExportError("export.request_invalid", `${pathName} contains unsupported or invalid fields.`);
  }
}

function nonEmpty(value, maximum = 512) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
}

function codepointCompare(left, right) {
  const a = Array.from(String(left ?? ""), (item) => item.codePointAt(0));
  const b = Array.from(String(right ?? ""), (item) => item.codePointAt(0));
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return a.length - b.length;
}

function typedRevision(kind, revisionId) {
  return `${kind}-revision:${revisionId.slice(revisionId.indexOf(":") + 1)}`;
}

function validateRequest(request) {
  exact(request, REQUEST_FIELDS, "request");
  if (request.request_version !== 1) throw new ExportError("export.request_invalid", "request_version must be 1.");
  if (!nonEmpty(request.operation_id, 256)) throw new ExportError("export.request_invalid", "operation_id is required.");
  if (!nonEmpty(request.store_id, 128) || !new RegExp(`^store:${UUID}$`).test(request.store_id)) throw new ExportError("export.request_invalid", "store_id must be a typed UUID identity.");
  exact(request.context, CONTEXT_FIELDS, "context");
  if (!new RegExp(`^view:${UUID}$`).test(request.context.view_id ?? "")
    || !new RegExp(`^view-policy:${UUID}$`).test(request.context.view_policy_revision_id ?? "")
    || !nonEmpty(request.context.purpose)) throw new ExportError("export.request_invalid", "An exact view context and purpose are required.");
  if (request.context.requested_audience_ceiling != null && request.context.requested_audience_ceiling !== "private") {
    throw new ExportError("export.view_invalid_or_unavailable", "The export request cannot widen the exact active view.");
  }
  exact(request.authority_claim, AUTHORITY_FIELDS, "authority_claim");
  if (request.authority_claim.human_authorized !== true || !nonEmpty(request.authority_claim.acting_role) || !nonEmpty(request.authority_claim.authority_basis)) {
    throw new ExportError("export.human_authority_required", "Export preflight requires an explicit human authorization claim.");
  }
  if (!MODES.has(request.mode)) throw new ExportError("export.request_invalid", "mode must be current or historical.");
  if (!AUDIENCES.has(request.audience)) throw new ExportError("export.request_invalid", "audience is invalid.");
  exact(request.destination, DESTINATION_FIELDS, "destination");
  const destinationAudiences = DESTINATIONS.get(request.destination.classification);
  if (!destinationAudiences?.has(request.audience)) throw new ExportError("export.destination_invalid", "Destination classification is incompatible with the requested audience.");
  for (const key of ["temporary_path", "final_path"]) {
    if (!nonEmpty(request.destination[key], 4_096) || !path.isAbsolute(request.destination[key])) throw new ExportError("export.destination_invalid", `${key} must be an explicit absolute path.`);
  }
  const temporary = path.resolve(request.destination.temporary_path);
  const final = path.resolve(request.destination.final_path);
  if (temporary === final || temporary.startsWith(`${final}${path.sep}`) || final.startsWith(`${temporary}${path.sep}`)) {
    throw new ExportError("export.destination_invalid", "Temporary and final destinations must be distinct, non-overlapping paths.");
  }
  if (!Array.isArray(request.owners) || request.owners.length < 1 || request.owners.length > MAX_OWNERS) {
    throw new ExportError("export.request_invalid", `owners must contain 1 to ${MAX_OWNERS} selections.`);
  }
  const seen = new Set();
  const owners = request.owners.map((owner, index) => {
    exact(owner, OWNER_FIELDS, `owners[${index}]`);
    const match = OWNER_ID.exec(owner.id ?? "");
    if (!match || owner.kind !== match[1] || !REQUIREMENTS.has(owner.requirement)) throw new ExportError("export.request_invalid", `owners[${index}] has an invalid owner identity or requirement.`);
    const key = `${owner.kind}\0${owner.id}`;
    if (seen.has(key)) throw new ExportError("export.request_invalid", "Each selected owner must be unique.");
    seen.add(key);
    if (request.mode === "current" && owner.revision_id != null) throw new ExportError("export.request_invalid", "Current mode resolves stable owner identities and does not admit revision pins.");
    if (request.mode === "historical" && (!REVISION_ID.test(owner.revision_id ?? "") || !owner.revision_id.startsWith(`${owner.kind}-revision:`))) {
      throw new ExportError("export.request_invalid", "Historical mode requires one exact typed revision_id for every owner.");
    }
    if (owner.kind === "frame" && owner.evidence_selection != null) throw new ExportError("export.request_invalid", "Frame selections do not accept Case evidence options.");
    if (owner.evidence_selection != null && (!Array.isArray(owner.evidence_selection)
      || owner.evidence_selection.some((item) => !new RegExp(`^evidence:${UUID}$`).test(item)))) throw new ExportError("export.request_invalid", "evidence_selection must contain typed evidence identities.");
    return { ...owner, evidence_selection: owner.evidence_selection == null ? undefined : [...new Set(owner.evidence_selection)].sort(codepointCompare) };
  }).sort((left, right) => codepointCompare(left.kind, right.kind) || codepointCompare(left.id, right.id));
  return { owners, temporary, final };
}

async function currentCorpus(request, kind) {
  return invokeSubstrateOperation({
    operation: "read_owner_current_corpus",
    configuration: request.configuration,
    store_id: request.store_id,
    context: request.context,
    owner_kind: kind,
  });
}

function snapshotFrom(corpora) {
  const owners = new Map();
  const families = new Map();
  for (const corpus of corpora) {
    if (!corpus?.ok) continue;
    for (const item of corpus.result.items) {
      const currentRevision = { id: typedRevision(item.owner.kind, item.revision.id), number: item.revision.number, committed_at: item.revision.committed_at };
      const current = { owner: item.owner, revision: currentRevision, projection: item.current_projection };
      owners.set(`${item.owner.kind}\0${item.owner.id}`, current);
      families.set(item.owner.id, current);
      for (const selected of item.revision.selected_versions) families.set(selected.family_id, current);
    }
  }
  return { owners, families };
}

function policyFor(request) {
  return { view_id: request.context.view_id, view_policy_revision_id: request.context.view_policy_revision_id, audience: request.audience };
}

function verifyFragment(request, selection, fragment, snapshotOwner) {
  if (!object(fragment)) return "fragment_missing";
  const { digest, ...core } = fragment;
  if (!DIGEST.test(digest ?? "") || mechanicalDigest(core) !== digest) return "fragment_digest_mismatch";
  if (fragment.fragment_schema !== FRAGMENT_SCHEMAS[selection.kind]) return "fragment_schema_incompatible";
  if (fragment.owner?.kind !== selection.kind || fragment.owner?.id !== selection.id) return "fragment_owner_mismatch";
  if (mechanicalDigest(fragment.applied_policy) !== mechanicalDigest(policyFor(request))) return "fragment_policy_mismatch";
  if (!snapshotOwner || fragment.observed_current_revision?.id !== snapshotOwner.revision.id) return "fragment_current_revision_mismatch";
  const expectedSelected = request.mode === "current" ? snapshotOwner.revision.id : selection.revision_id;
  if (fragment.selected_revision?.id !== expectedSelected) return "fragment_selected_revision_mismatch";
  return null;
}

async function renderOwnerFragment(request, selection, snapshotOwner) {
  if (!snapshotOwner) return { status: "unavailable", reason: "owner_not_found_or_not_visible", fragment: null };
  const base = {
    protocol: request.protocol,
    request_version: 1,
    store_id: request.store_id,
    context: request.context,
    configuration: request.configuration,
    operation: `${selection.kind}.export.fragment`,
    [`${selection.kind}_id`]: selection.id,
    audience: request.audience,
    ...(request.mode === "historical" ? { revision_id: selection.revision_id } : { revision_id: snapshotOwner.revision.id }),
    ...(selection.kind === "case" ? { evidence_selection: selection.evidence_selection ?? [] } : {}),
  };
  const response = selection.kind === "case" ? await invokeCaseOperation(base) : await invokeFrameOperation(base);
  if (!response?.ok) return { status: "unavailable", reason: response?.failure?.code ?? "fragment_unavailable", fragment: null };
  const violation = verifyFragment(request, selection, response.result.fragment, snapshotOwner);
  if (violation) return { status: "blocked", reason: violation, fragment: response.result.fragment };
  return { status: response.result.fragment.status, reason: response.result.fragment.status, fragment: response.result.fragment };
}

function semanticDependencies(fragment) {
  if (!fragment) return [];
  const dependencies = [];
  const add = (reference, source, forceSemantic = false) => {
    if (!object(reference) || !["case", "frame"].includes(reference.target_kind)) return;
    if (!forceSemantic && !SEMANTIC_PREDICATES.has(reference.predicate)) return;
    dependencies.push({
      source_owner: fragment.owner,
      source_status: fragment.owner_status,
      source,
      target: { kind: reference.target_kind, id: reference.target_id },
      predicate: reference.predicate ?? "dependency",
      observed_revision_id: reference.observed_revision_id ?? null,
      pinned_revision_id: reference.pinned_revision_id ?? null,
    });
  };
  if (fragment.owner.kind === "frame") {
    for (const [family, references] of [["case_links", fragment.frame.case_links], ["frame_links", fragment.frame.frame_links], ["downstream_links", fragment.frame.downstream_links]]) {
      for (const [index, reference] of (references ?? []).entries()) add(reference, `${family}/${index}`);
    }
    for (const discovery of fragment.frame.discovery ?? []) {
      for (const [index, reference] of (discovery.dependencies ?? []).entries()) add(reference, `discovery/${discovery.id}/dependencies/${index}`, true);
    }
  } else {
    for (const [index, reference] of (fragment.case.references ?? []).entries()) add(reference, `references/${index}`);
    for (const entry of fragment.case.entries ?? []) {
      for (const [index, reference] of (entry.version?.references ?? []).entries()) add(reference, `entries/${entry.id}/references/${index}`);
    }
  }
  return dependencies;
}

function dependencyState(request, dependency, snapshot) {
  const target = snapshot.families.get(dependency.target.id);
  const live = dependency.source_status === "active";
  let state;
  if (request.mode === "historical" || !live) state = dependency.observed_revision_id == null ? "unknown" : "historical";
  else if (!target || dependency.observed_revision_id == null) state = "unknown";
  else if (dependency.observed_revision_id !== target.revision.id
    || (dependency.pinned_revision_id != null && dependency.pinned_revision_id !== target.revision.id)) state = "materially_stale";
  else state = "current";
  const blocking = request.mode === "current" && live && ["unknown", "materially_stale"].includes(state);
  return {
    ...dependency,
    observed_current_revision: target?.revision ?? null,
    state,
    blocking,
    reason: blocking ? `${state}_live_dependency` : state === "historical" ? "historical_provenance_informational" : state === "unknown" ? "historical_unknown_informational" : "dependency_current_at_fence",
  };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeFileName(selection, index) {
  return `fragments/${String(index + 1).padStart(3, "0")}-${selection.kind}-${selection.id.slice(selection.id.indexOf(":") + 1)}.json`;
}

async function pathExists(filePath) {
  return lstat(filePath).then(() => true).catch((error) => error?.code === "ENOENT" ? false : Promise.reject(error));
}

async function verifyPrivateParent(temporary) {
  const parent = path.dirname(temporary);
  const resolved = await realpath(parent).catch(() => null);
  const parentStat = resolved == null ? null : await stat(resolved).catch(() => null);
  if (resolved == null || !parentStat?.isDirectory()) throw new ExportError("export.destination_invalid", "The private temporary destination parent must already exist as a real directory.");
  if (await pathExists(temporary)) throw new ExportError("export.destination_invalid", "The private temporary destination must not already exist.");
}

function blockerSort(left, right) {
  return codepointCompare(left.owner?.kind, right.owner?.kind)
    || codepointCompare(left.owner?.id, right.owner?.id)
    || codepointCompare(left.code, right.code)
    || codepointCompare(left.source, right.source);
}

async function buildPreflight(request) {
  const validated = validateRequest(request);
  await verifyPrivateParent(validated.temporary);
  if (await pathExists(validated.final)) throw new ExportError("export.destination_invalid", "Preflight requires an absent final destination and never replaces final output.");

  // The two read-only CLI connections run serially because SQLite may need WAL
  // shared-memory bookkeeping even under query_only. Equal store fences prove
  // that both cohesive snapshots observed the same committed state.
  const initialCorpora = [await currentCorpus(request, "case"), await currentCorpus(request, "frame")];
  const corpusFailures = initialCorpora.filter((item) => !item?.ok);
  const fences = initialCorpora.filter((item) => item?.ok).map((item) => item.result.operation_fence);
  const consistentInitialFence = corpusFailures.length === 0 && new Set(fences).size === 1;
  const observationFence = consistentInitialFence ? fences[0] : null;
  const snapshot = snapshotFrom(initialCorpora);
  const blockers = [];
  if (!consistentInitialFence) blockers.push({ code: "observation_fence_inconsistent", reason: "One consistent exact-policy observation fence could not be established." });

  const rendered = [];
  for (const selection of validated.owners) {
    const snapshotOwner = snapshot.owners.get(`${selection.kind}\0${selection.id}`);
    const outcome = consistentInitialFence
      ? await renderOwnerFragment(request, selection, snapshotOwner)
      : { status: "unavailable", reason: corpusFailures[0]?.failure?.code ?? "observation_fence_inconsistent", fragment: null };
    const admission = outcome.status === "ready" ? "included"
      : outcome.status === "partial_nonconsequential" && selection.requirement === "optional" ? "optional_nonconsequential"
        : "blocked";
    if (admission === "blocked") {
      const code = outcome.status === "partial_nonconsequential" && selection.requirement === "required"
        ? "required_fragment_partial"
        : outcome.status === "blocked" ? "fragment_blocked" : "fragment_unavailable";
      blockers.push({ owner: { kind: selection.kind, id: selection.id }, code, reason: outcome.reason });
    }
    rendered.push({ selection, outcome, admission, snapshotOwner });
  }

  const dependencies = rendered.flatMap(({ outcome }) => semanticDependencies(outcome.fragment))
    .map((dependency) => dependencyState(request, dependency, snapshot))
    .sort((left, right) => codepointCompare(left.source_owner.kind, right.source_owner.kind)
      || codepointCompare(left.source_owner.id, right.source_owner.id)
      || codepointCompare(left.source, right.source)
      || codepointCompare(left.target.id, right.target.id));
  for (const dependency of dependencies.filter((item) => item.blocking)) {
    blockers.push({ owner: dependency.source_owner, code: dependency.reason, reason: dependency.reason, source: dependency.source, target: dependency.target });
  }

  if (consistentInitialFence) {
    const finalCorpora = [await currentCorpus(request, "case"), await currentCorpus(request, "frame")];
    const finalFences = finalCorpora.filter((item) => item?.ok).map((item) => item.result.operation_fence);
    if (finalCorpora.some((item) => !item?.ok) || new Set(finalFences).size !== 1 || finalFences[0] !== observationFence) {
      blockers.push({ code: "observation_fence_inconsistent", reason: "The exact-policy observation fence changed during preflight." });
    }
  }

  const filePayloads = [];
  const ownerEntries = rendered.map(({ selection, outcome, admission, snapshotOwner }, index) => {
    let file = null;
    if (outcome.fragment) {
      const bytes = Buffer.from(`${canonicalJson(outcome.fragment)}\n`, "utf8");
      file = { path: safeFileName(selection, index), sha256: sha256(bytes), bytes: bytes.length };
      filePayloads.push({ ...file, bytesValue: bytes });
    }
    return {
      owner: { kind: selection.kind, id: selection.id },
      requirement: selection.requirement,
      requested_revision_id: request.mode === "historical" ? selection.revision_id : null,
      selected_revision: outcome.fragment?.selected_revision ?? null,
      observed_current_revision: snapshotOwner?.revision ?? null,
      status: outcome.status,
      reason: outcome.reason,
      admission,
      fragment_schema: outcome.fragment?.fragment_schema ?? null,
      fragment_digest: outcome.fragment?.digest ?? null,
      redactions: outcome.fragment?.redactions ?? [],
      omissions: outcome.fragment?.omissions ?? [],
      applied_policy: outcome.fragment?.applied_policy ?? null,
      file,
    };
  });
  blockers.sort(blockerSort);
  const manifestCore = {
    manifest_schema: "casebook-logical-export-manifest@1",
    mode: request.mode,
    currentness: request.mode === "historical"
      ? "non_current_historical"
      : blockers.length ? "not_claimed_blocked" : "current_at_observation_fence",
    observation_fence: observationFence,
    destination_classification: request.destination.classification,
    audience: request.audience,
    applied_policy: policyFor(request),
    owners: ownerEntries,
    dependencies,
    blockers,
    authority: { export_preflight: "human_authorized", finalization: "not_granted", publication: "not_granted", canonical_mutation: "not_granted" },
    mutation_performed: false,
    publication_performed: false,
  };
  const bundleDigest = mechanicalDigest({
    manifest: manifestCore,
    files: filePayloads.map(({ bytesValue: _bytes, ...file }) => file),
  });
  const manifestWithoutDigest = { ...manifestCore, bundle_digest: bundleDigest };
  const manifest = { ...manifestWithoutDigest, digest: mechanicalDigest(manifestWithoutDigest) };
  const blocked = blockers.length > 0;

  if (blocked) {
    return success("export.preflight", {
      status: "blocked",
      currentness: manifest.currentness,
      observation_fence: observationFence,
      manifest,
      bundle: { digest: bundleDigest, rendered: false, files: [] },
      temporary_rendering: { created: false, cleaned: true, private: true },
      final_output: { created: false, path: request.destination.final_path },
      authority: manifest.authority,
      mutation_performed: false,
      publication_performed: false,
    });
  }

  try {
    await mkdir(validated.temporary, { mode: 0o700 });
    await mkdir(path.join(validated.temporary, "fragments"), { mode: 0o700 });
    for (const file of filePayloads) await writeFile(path.join(validated.temporary, file.path), file.bytesValue, { mode: 0o600, flag: "wx" });
    const manifestBytes = Buffer.from(`${canonicalJson(manifest)}\n`, "utf8");
    await writeFile(path.join(validated.temporary, "manifest.json"), manifestBytes, { mode: 0o600, flag: "wx" });
    for (const file of filePayloads) {
      const observed = await readFile(path.join(validated.temporary, file.path));
      if (sha256(observed) !== file.sha256) throw new ExportError("export.temporary_verification_failed", "Private temporary rendering failed digest verification.");
    }
    const observedManifest = JSON.parse(await readFile(path.join(validated.temporary, "manifest.json"), "utf8"));
    const { digest: observedManifestDigest, ...observedManifestCore } = observedManifest;
    if (observedManifestDigest !== mechanicalDigest(observedManifestCore)
      || observedManifestDigest !== manifest.digest
      || observedManifest.bundle_digest !== bundleDigest) {
      throw new ExportError("export.temporary_verification_failed", "Private temporary manifest failed digest verification.");
    }
  } catch (error) {
    await rm(validated.temporary, { recursive: true, force: true });
    if (error instanceof ExportError) throw error;
    throw new ExportError("export.temporary_render_failed", "Private temporary rendering failed and was cleaned.");
  }
  return success("export.preflight", {
    status: "ready",
    currentness: manifest.currentness,
    observation_fence: observationFence,
    manifest,
    bundle: {
      digest: bundleDigest,
      rendered: true,
      manifest_path: "manifest.json",
      files: filePayloads.map(({ bytesValue: _bytes, ...file }) => file),
    },
    temporary_rendering: { created: true, cleaned: false, private: true, path: request.destination.temporary_path },
    final_output: { created: false, path: request.destination.final_path },
    authority: manifest.authority,
    mutation_performed: false,
    publication_performed: false,
  });
}

export async function invokeExportOperation(request) {
  if (request.operation !== "export.preflight") return unsupported(request.operation);
  try {
    return await buildPreflight(request);
  } catch (error) {
    if (error instanceof ExportError) {
      return failure(error.code, error.message, {
        failureClass: error.code,
        retryDisposition: error.code === "export.temporary_render_failed" ? RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR : RETRY_DISPOSITIONS.NEVER,
        evidence: error.evidence,
      });
    }
    return failure("export.preflight_unavailable", "Export preflight failed without exposing owner or destination state.", {
      failureClass: "export.preflight_unavailable",
      retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
      evidence: {},
    });
  }
}
