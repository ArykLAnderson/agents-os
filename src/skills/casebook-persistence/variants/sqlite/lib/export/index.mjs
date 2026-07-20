import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateAuthorityConfiguration } from "../../../../shared/config.mjs";
import { locatorSafeForAudience, portablePublicLocatorAssessment } from "../../../../shared/locator.mjs";
import { failure, RETRY_DISPOSITIONS, success, unsupported } from "../../../../shared/protocol.mjs";
import { invokeCaseOperation } from "../case/index.mjs";
import { invokeFrameOperation } from "../frame/index.mjs";
import {
  inspectStore,
  invokeSubstrateOperation,
  readStoreOperationReceipt,
  settleStoreOperationReceipt,
} from "../substrate/index.mjs";
import { selectSqliteBinary } from "../substrate/diagnostics.mjs";
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
  "authority_claim", "mode", "audience", "destination", "owners", "document_trace", "configuration",
]);
const FINALIZE_REQUEST_FIELDS = new Set([
  "protocol", "operation", "request_version", "operation_id", "store_id", "context",
  "authority_claim", "destination", "expected", "configuration",
]);
const FINALIZE_EXPECTED_FIELDS = new Set([
  "observation_fence", "manifest_digest", "bundle_digest", "destination_digest",
]);
const FINALIZATION_MARKER = ".casebook-finalization.json";
const CONTEXT_FIELDS = new Set(["view_id", "view_policy_revision_id", "purpose", "requested_audience_ceiling"]);
const AUTHORITY_FIELDS = new Set(["human_authorized", "acting_role", "authority_basis", "human_confirmation_reference", "causation", "correlation", "session"]);
const OWNER_FIELDS = new Set(["kind", "id", "requirement", "revision_id", "evidence_selection"]);
const DESTINATION_FIELDS = new Set(["classification", "temporary_path", "final_path"]);
const DOCUMENT_TRACE_FIELDS = new Set(["trace_schema", "document", "claims", "digest"]);
const DOCUMENT_FIELDS = new Set(["id", "revision_id"]);
const DOCUMENT_CLAIM_FIELDS = new Set(["claim_id", "text", "text_digest", "consequence_classification", "evidence"]);
const DOCUMENT_EVIDENCE_FIELDS = new Set([
  "owner_id", "source_id", "evidence_id", "evidence_version_id", "evidence_digest", "reader_locator", "locator_digest",
]);
const READER_LOCATOR_FIELDS = new Set(["kind", "uri", "audience", "version_ref", "digest"]);
const CONSEQUENCE_CLASSIFICATIONS = new Set(["consequential", "nonconsequential"]);
const MAX_DOCUMENT_CLAIMS = 256;
const MAX_CLAIM_EVIDENCE = 256;
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

function typedId(value, prefix) {
  return new RegExp(`^${prefix}:${UUID}$`).test(value ?? "");
}

function validateDocumentTrace(trace) {
  exact(trace, DOCUMENT_TRACE_FIELDS, "document_trace");
  if (trace.trace_schema !== "document-claim-trace@1" || !DIGEST.test(trace.digest ?? "")) {
    throw new ExportError("export.request_invalid", "document_trace must use the supported schema and a lowercase sha256 digest.");
  }
  exact(trace.document, DOCUMENT_FIELDS, "document_trace.document");
  if (!typedId(trace.document.id, "document") || !typedId(trace.document.revision_id, "document-revision")) {
    throw new ExportError("export.request_invalid", "document_trace must identify one Document revision.");
  }
  if (!Array.isArray(trace.claims) || trace.claims.length < 1 || trace.claims.length > MAX_DOCUMENT_CLAIMS) {
    throw new ExportError("export.request_invalid", `document_trace.claims must contain 1 to ${MAX_DOCUMENT_CLAIMS} claims.`);
  }
  const claimIds = new Set();
  for (const [claimIndex, claim] of trace.claims.entries()) {
    exact(claim, DOCUMENT_CLAIM_FIELDS, `document_trace.claims[${claimIndex}]`);
    if (!typedId(claim.claim_id, "claim") || claimIds.has(claim.claim_id) || !nonEmpty(claim.text, 16_384)
      || !DIGEST.test(claim.text_digest ?? "") || !CONSEQUENCE_CLASSIFICATIONS.has(claim.consequence_classification)
      || !Array.isArray(claim.evidence) || claim.evidence.length > MAX_CLAIM_EVIDENCE) {
      throw new ExportError("export.request_invalid", `document_trace.claims[${claimIndex}] is structurally invalid.`);
    }
    claimIds.add(claim.claim_id);
    const evidenceKeys = new Set();
    for (const [evidenceIndex, evidence] of claim.evidence.entries()) {
      exact(evidence, DOCUMENT_EVIDENCE_FIELDS, `document_trace.claims[${claimIndex}].evidence[${evidenceIndex}]`);
      exact(evidence.reader_locator, READER_LOCATOR_FIELDS, `document_trace.claims[${claimIndex}].evidence[${evidenceIndex}].reader_locator`);
      const locator = evidence.reader_locator;
      const evidenceKey = `${evidence.owner_id}\0${evidence.source_id}\0${evidence.evidence_id}`;
      if (!typedId(evidence.owner_id, "case") || !typedId(evidence.source_id, "source")
        || !typedId(evidence.evidence_id, "evidence") || !typedId(evidence.evidence_version_id, "case-version")
        || !DIGEST.test(evidence.evidence_digest ?? "") || !DIGEST.test(evidence.locator_digest ?? "")
        || evidenceKeys.has(evidenceKey) || !nonEmpty(locator.kind, 64) || !nonEmpty(locator.uri, 4_096)
        || !AUDIENCES.has(locator.audience) || (locator.version_ref != null && !nonEmpty(locator.version_ref, 512))
        || (locator.digest != null && !DIGEST.test(locator.digest))) {
        throw new ExportError("export.request_invalid", `document_trace.claims[${claimIndex}].evidence[${evidenceIndex}] is structurally invalid.`);
      }
      evidenceKeys.add(evidenceKey);
    }
  }
  return structuredClone(trace);
}

function validateDestination(destination) {
  exact(destination, DESTINATION_FIELDS, "destination");
  if (!DESTINATIONS.has(destination.classification)) throw new ExportError("export.destination_invalid", "Destination classification is invalid.");
  for (const key of ["temporary_path", "final_path"]) {
    if (!nonEmpty(destination[key], 4_096) || !path.isAbsolute(destination[key])) throw new ExportError("export.destination_invalid", `${key} must be an explicit absolute path.`);
  }
  const temporary = path.resolve(destination.temporary_path);
  const final = path.resolve(destination.final_path);
  if (temporary === final || temporary.startsWith(`${final}${path.sep}`) || final.startsWith(`${temporary}${path.sep}`)) {
    throw new ExportError("export.destination_invalid", "Temporary and final destinations must be distinct, non-overlapping paths.");
  }
  return { temporary, final };
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
  const { temporary, final } = validateDestination(request.destination);
  const destinationAudiences = DESTINATIONS.get(request.destination.classification);
  if (!destinationAudiences?.has(request.audience)) throw new ExportError("export.destination_invalid", "Destination classification is incompatible with the requested audience.");
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
  const documentTrace = request.document_trace == null ? null : validateDocumentTrace(request.document_trace);
  return { owners, temporary, final, documentTrace };
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

function readerLocatorSafe(locator, audience) {
  return locatorSafeForAudience(locator, audience,
    (locatorAudience, targetAudience) => audienceRank(locatorAudience) >= audienceRank(targetAudience));
}

function audienceRank(value) {
  return ["private", "internal", "restricted", "portable", "public"].indexOf(value);
}

function verifyDocumentTrace(request, trace, rendered) {
  if (!trace) return { summary: null, blockers: [] };
  const blockers = [];
  const documentOwner = { kind: "document", id: trace.document.id };
  const addBlocker = (code, claimId = null) => blockers.push({
    owner: documentOwner,
    code,
    reason: code,
    ...(claimId == null ? {} : { source: `claims/${claimId}` }),
  });
  const { digest, ...traceCore } = trace;
  if (mechanicalDigest(traceCore) !== digest) addBlocker("document_trace_digest_mismatch");

  const caseFragments = new Map(rendered
    .filter((item) => item.selection.kind === "case" && item.outcome.fragment)
    .map((item) => [item.selection.id, item.outcome.fragment]));
  const claimSummaries = [];
  for (const claim of trace.claims) {
    const claimBlockerCount = blockers.length;
    if (sha256(Buffer.from(claim.text, "utf8")) !== claim.text_digest) {
      addBlocker("document_claim_text_digest_mismatch", claim.claim_id);
    }
    if (claim.evidence.length === 0) {
      if (claim.consequence_classification === "consequential") {
        addBlocker("document_consequential_claim_evidence_missing", claim.claim_id);
      }
      claimSummaries.push({
        claim_id: claim.claim_id,
        text_digest: claim.text_digest,
        consequence_classification: claim.consequence_classification,
        evidence_count: 0,
        status: claim.consequence_classification === "consequential"
          ? "consequential_evidence_missing"
          : "declared_nonconsequential_without_evidence",
      });
      continue;
    }
    for (const evidence of claim.evidence) {
      const fragment = caseFragments.get(evidence.owner_id);
      const source = fragment?.case?.sources?.find((item) => item.id === evidence.source_id);
      const member = source?.fragments?.find((item) => item.id === evidence.evidence_id);
      const exportedMember = fragment?.evidence?.fragments?.find((item) => item.source_id === evidence.source_id
        && item.evidence_id === evidence.evidence_id);
      if (!member || !exportedMember || exportedMember.version_id !== evidence.evidence_version_id) {
        addBlocker("document_evidence_not_in_export_fragment", claim.claim_id);
      } else if (exportedMember.digest !== evidence.evidence_digest) {
        addBlocker("document_evidence_digest_mismatch", claim.claim_id);
      }
      if (!readerLocatorSafe(evidence.reader_locator, request.audience)) {
        addBlocker("document_reader_locator_unsafe", claim.claim_id);
      }
      const locatorMember = source?.version?.locators?.some((locator) => canonicalJson(locator) === canonicalJson(evidence.reader_locator));
      if (!locatorMember) addBlocker("document_reader_locator_not_in_export_fragment", claim.claim_id);
      if (mechanicalDigest(evidence.reader_locator) !== evidence.locator_digest) {
        addBlocker("document_reader_locator_digest_mismatch", claim.claim_id);
      }
    }
    claimSummaries.push({
      claim_id: claim.claim_id,
      text_digest: claim.text_digest,
      consequence_classification: claim.consequence_classification,
      evidence_count: claim.evidence.length,
      status: blockers.length === claimBlockerCount ? "evidence_verified" : "evidence_invalid",
    });
  }
  return {
    summary: {
      trace_schema: trace.trace_schema,
      document: trace.document,
      trace_digest: trace.digest,
      status: blockers.length ? "blocked" : "verified",
      semantic_classification_performed: false,
      claims: claimSummaries,
    },
    blockers,
  };
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

  const documentTraceValidation = verifyDocumentTrace(request, validated.documentTrace, rendered);
  blockers.push(...documentTraceValidation.blockers);
  if (["portable", "public"].includes(request.audience)) {
    for (const { selection, outcome } of rendered) {
      for (const [index, locator] of (outcome.fragment?.locators ?? []).entries()) {
        if (!portablePublicLocatorAssessment(locator.uri).safe) blockers.push({
          owner: { kind: selection.kind, id: selection.id },
          code: "retained_unsafe_locator",
          reason: "A portable/public fragment retained a locator that is not public-network safe.",
          source: `locators/${index}`,
        });
      }
    }
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
  if (validated.documentTrace) {
    const bytes = Buffer.from(`${canonicalJson(validated.documentTrace)}\n`, "utf8");
    const file = { path: "document/claim-trace.json", sha256: sha256(bytes), bytes: bytes.length };
    filePayloads.push({ ...file, bytesValue: bytes });
    documentTraceValidation.summary.file = file;
  }
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
    ...(documentTraceValidation.summary == null ? {} : { document_trace: documentTraceValidation.summary }),
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
    if (validated.documentTrace) await mkdir(path.join(validated.temporary, "document"), { mode: 0o700 });
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

function validateFinalizeRequest(request) {
  exact(request, FINALIZE_REQUEST_FIELDS, "request");
  if (request.request_version !== 1 || request.operation !== "export.finalize") {
    throw new ExportError("export.request_invalid", "export.finalize requires request_version 1.");
  }
  if (!nonEmpty(request.operation_id, 256) || !new RegExp(`^store:${UUID}$`).test(request.store_id ?? "")) {
    throw new ExportError("export.request_invalid", "A bounded operation_id and exact store identity are required.");
  }
  exact(request.context, CONTEXT_FIELDS, "context");
  if (!new RegExp(`^view:${UUID}$`).test(request.context.view_id ?? "")
    || !new RegExp(`^view-policy:${UUID}$`).test(request.context.view_policy_revision_id ?? "")
    || !nonEmpty(request.context.purpose)
    || (request.context.requested_audience_ceiling != null && request.context.requested_audience_ceiling !== "private")) {
    throw new ExportError("export.view_invalid_or_unavailable", "Finalization requires one exact private active view context.");
  }
  exact(request.authority_claim, AUTHORITY_FIELDS, "authority_claim");
  if (request.authority_claim.human_authorized !== true
    || !nonEmpty(request.authority_claim.acting_role)
    || !nonEmpty(request.authority_claim.authority_basis)) {
    throw new ExportError("export.human_authority_required", "Finalization requires a separate explicit human authorization claim.");
  }
  const { temporary, final } = validateDestination(request.destination);
  exact(request.expected, FINALIZE_EXPECTED_FIELDS, "expected");
  if (!Number.isInteger(request.expected.observation_fence) || request.expected.observation_fence < 0
    || !DIGEST.test(request.expected.manifest_digest ?? "")
    || !DIGEST.test(request.expected.bundle_digest ?? "")
    || !DIGEST.test(request.expected.destination_digest ?? "")) {
    throw new ExportError("export.request_invalid", "Finalization expected bindings must contain one fence and lowercase SHA-256 digests.");
  }
  return { temporary, final };
}

function finalizationRequestDigest(request) {
  return mechanicalDigest({
    protocol: request.protocol,
    operation: request.operation,
    request_version: request.request_version,
    operation_id: request.operation_id,
    store_id: request.store_id,
    context: request.context,
    authority_claim: request.authority_claim,
    destination: request.destination,
    expected: request.expected,
  });
}

async function prepareFinalizationStore(request) {
  let configuration;
  try {
    configuration = validateAuthorityConfiguration(request.configuration);
  } catch {
    throw new ExportError("export.store_unavailable", "Finalization requires explicitly selected SQLite authority.");
  }
  if (configuration.authority_mode !== "sqlite") {
    throw new ExportError("export.store_unavailable", "Finalization requires explicitly selected SQLite authority.");
  }
  const selected = await selectSqliteBinary(configuration.sqlite.sqlite_bin);
  const state = await inspectStore(selected.path, configuration.sqlite.store_path);
  if (state.status !== "available" || state.metadata.store_id !== request.store_id) {
    throw new ExportError("export.store_unavailable", "The exact export store is unavailable.");
  }
  return { binary: selected.path, storePath: configuration.sqlite.store_path, state };
}

function replayFinalizationReceipt(receipt, requestDigest) {
  if (!receipt) return null;
  if (receipt.operation_kind !== "export.finalize" || receipt.request_digest !== requestDigest) {
    return failure("export.idempotency_mismatch", "operation_id is already settled for a different canonical request.", {
      failureClass: "idempotency_mismatch",
      retryDisposition: RETRY_DISPOSITIONS.NEVER,
      evidence: { operation_id: receipt.operation_id, settled_kind: receipt.operation_kind },
    });
  }
  return success("export.finalize", { ...receipt.result, idempotent_replay: true, receipt });
}

function expectedBundleFiles(manifest) {
  return [
    ...(manifest.owners ?? []).map((owner) => owner.file).filter(Boolean),
    ...(manifest.document_trace?.file ? [manifest.document_trace.file] : []),
  ];
}

async function listBundleFiles(root, relative = "") {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const item = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
      throw new ExportError("export.bundle_verification_failed", "The bundle contains a non-regular path.");
    }
    if (entry.isDirectory()) files.push(...await listBundleFiles(root, item));
    else files.push(item);
  }
  return files.sort(codepointCompare);
}

function finalizationMarker(request, requestDigest) {
  const core = {
    marker_schema: "casebook-export-finalization@1",
    operation_id: request.operation_id,
    store_id: request.store_id,
    view_id: request.context.view_id,
    view_policy_revision_id: request.context.view_policy_revision_id,
    observation_fence: request.expected.observation_fence,
    manifest_digest: request.expected.manifest_digest,
    bundle_digest: request.expected.bundle_digest,
    destination_digest: request.expected.destination_digest,
    request_digest: requestDigest,
    authority: { finalization: "human_authorized", publication: "not_granted", canonical_mutation: "not_granted" },
  };
  return { ...core, digest: mechanicalDigest(core) };
}

async function verifyFinalizationMarker(root, expectedMarker) {
  let observed;
  try {
    observed = JSON.parse(await readFile(path.join(root, FINALIZATION_MARKER), "utf8"));
  } catch {
    return false;
  }
  const { digest, ...core } = observed;
  return digest === mechanicalDigest(core) && canonicalJson(observed) === canonicalJson(expectedMarker);
}

async function verifyBundle(root, request, { marker = null, requirePrivate = false } = {}) {
  const rootInfo = await lstat(root).catch(() => null);
  if (!rootInfo?.isDirectory() || rootInfo.isSymbolicLink()) return { ok: false, code: "verified_preflight_bundle_unavailable" };
  if (requirePrivate && (rootInfo.mode & 0o077) !== 0) return { ok: false, code: "private_preflight_permissions_invalid" };
  let manifest;
  try {
    manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
  } catch {
    return { ok: false, code: "manifest_unavailable" };
  }
  const { digest: manifestDigest, bundle_digest: recordedBundleDigest, ...bundleManifestCore } = manifest;
  if (manifestDigest !== mechanicalDigest({ ...bundleManifestCore, bundle_digest: recordedBundleDigest })
    || manifestDigest !== request.expected.manifest_digest) return { ok: false, code: "manifest_digest_mismatch" };
  if (recordedBundleDigest !== request.expected.bundle_digest) return { ok: false, code: "bundle_digest_mismatch" };
  if (manifest.observation_fence !== request.expected.observation_fence) return { ok: false, code: "observation_fence_mismatch" };
  if (manifest.applied_policy?.view_id !== request.context.view_id
    || manifest.applied_policy?.view_policy_revision_id !== request.context.view_policy_revision_id) return { ok: false, code: "policy_binding_mismatch" };
  if (manifest.destination_classification !== request.destination.classification) return { ok: false, code: "destination_classification_mismatch" };
  if (manifest.blockers?.length || manifest.currentness === "not_claimed_blocked") return { ok: false, code: "preflight_not_ready" };
  const descriptors = expectedBundleFiles(manifest);
  for (const descriptor of descriptors) {
    const filePath = path.join(root, descriptor.path);
    const info = await lstat(filePath).catch(() => null);
    if (!info?.isFile() || info.isSymbolicLink() || (requirePrivate && (info.mode & 0o077) !== 0)) {
      return { ok: false, code: "bundle_file_invalid" };
    }
    const bytes = await readFile(filePath);
    if (bytes.length !== descriptor.bytes || sha256(bytes) !== descriptor.sha256) return { ok: false, code: "bundle_file_digest_mismatch" };
  }
  const computedBundleDigest = mechanicalDigest({ manifest: bundleManifestCore, files: descriptors });
  if (computedBundleDigest !== request.expected.bundle_digest) return { ok: false, code: "bundle_digest_mismatch" };
  let files;
  try {
    files = await listBundleFiles(root);
  } catch (error) {
    return { ok: false, code: error instanceof ExportError ? "bundle_path_invalid" : "bundle_unavailable" };
  }
  const allowed = ["manifest.json", ...descriptors.map((file) => file.path), ...(marker ? [FINALIZATION_MARKER] : [])].sort(codepointCompare);
  if (canonicalJson(files) !== canonicalJson(allowed)) return { ok: false, code: "bundle_membership_mismatch" };
  if (marker && !await verifyFinalizationMarker(root, marker)) return { ok: false, code: "finalization_marker_mismatch" };
  return { ok: true, manifest, descriptors };
}

function controlledFinalizationBoundary(name) {
  const fault = process.env.CASEBOOK_PERSISTENCE_TEST_FAULT;
  if (fault === name) process.kill(process.pid, "SIGKILL");
}

async function removeTemporary(temporary) {
  await rm(temporary, { recursive: true, force: true });
  return !await pathExists(temporary);
}

function resultCore(request, requestDigest, terminal, finalization) {
  return {
    status: "settled",
    terminal,
    bindings: {
      operation_id: request.operation_id,
      store_id: request.store_id,
      view_id: request.context.view_id,
      view_policy_revision_id: request.context.view_policy_revision_id,
      observation_fence: request.expected.observation_fence,
      manifest_digest: request.expected.manifest_digest,
      bundle_digest: request.expected.bundle_digest,
      destination_digest: request.expected.destination_digest,
      request_digest: requestDigest,
    },
    finalization,
    authority: { finalization: "human_authorized", publication: "not_granted", canonical_mutation: "not_granted" },
    canonical_owner_mutation_performed: false,
    publication_performed: false,
  };
}

async function settleFinalization(prepared, request, requestDigest, core) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await readStoreOperationReceipt(prepared.binary, prepared.storePath, request.operation_id);
    const replay = replayFinalizationReceipt(existing, requestDigest);
    if (replay) return replay;
    const state = await inspectStore(prepared.binary, prepared.storePath);
    if (state.status !== "available" || state.metadata.store_id !== request.store_id) break;
    const settledAt = new Date().toISOString();
    const receiptCoreDigest = mechanicalDigest(core);
    const receiptSummary = {
      operation_id: request.operation_id,
      operation_kind: "export.finalize",
      store_id: request.store_id,
      request_digest: requestDigest,
      outcome: core.terminal.outcome,
      result_digest: receiptCoreDigest,
      settled_at: settledAt,
      failure_class: core.terminal.failure_class,
      retry_disposition: core.terminal.retry_disposition,
      operation_fence: state.operation_fence + 1,
      view_policy_revision_id: request.context.view_policy_revision_id,
    };
    const result = { ...core, idempotent_replay: false, receipt: receiptSummary };
    try {
      const settled = await settleStoreOperationReceipt(prepared.binary, prepared.storePath, {
        receipt: receiptSummary,
        authorityClaim: request.authority_claim,
        result,
        expectedOperationFence: state.operation_fence,
        viewPolicyRevisionId: request.context.view_policy_revision_id,
      });
      if (settled?.operation_kind === "export.finalize" && settled.request_digest === requestDigest) {
        controlledFinalizationBoundary("export_after_receipt_before_response");
        return success("export.finalize", settled.result);
      }
    } catch {
      // A concurrent receipt or fence advance is reconciled at the top of the loop.
    }
  }
  return failure("export.receipt_unavailable", "Finalization reached a terminal state but its durable receipt could not be settled.", {
    failureClass: "receipt_unavailable",
    retryDisposition: RETRY_DISPOSITIONS.AFTER_RECONCILE,
    correctiveGuidance: "Look up this exact operation receipt before any retry.",
    evidence: { operation_id: request.operation_id, final_output_path: request.destination.final_path },
  });
}

function uncertainFinalizationFailure(request, code = "export.final_verification_failed") {
  return failure(code, "A marker-bearing final destination may exist but exact post-effect verification failed.", {
    failureClass: "final_output_uncertain",
    retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
    correctiveGuidance: "Do not publish, delete, or overwrite either path. Look up the exact receipt and perform operator recovery.",
    evidence: {
      operation_id: request.operation_id,
      temporary_output_path: request.destination.temporary_path,
      final_output_path: request.destination.final_path,
      finalization_marker_path: path.join(request.destination.final_path, FINALIZATION_MARKER),
      recovery_required: true,
    },
  });
}

async function blockedFinalization(prepared, request, requestDigest, code, { cleanup = true } = {}) {
  const cleaned = cleanup ? await removeTemporary(request.destination.temporary_path) : !await pathExists(request.destination.temporary_path);
  const core = resultCore(request, requestDigest, {
    outcome: "blocked",
    code,
    failure_class: code,
    retry_disposition: RETRY_DISPOSITIONS.NEVER,
    canonical_state_effect: "none",
    destination_effect: "none",
  }, {
    atomicity: code === "non_atomic_destination_requires_separate_authorization" ? "non_atomic_declared_before_effect" : "not_performed",
    effect_performed: false,
    recovered_after_interruption: false,
    temporary_output: { path: request.destination.temporary_path, cleaned },
    final_output: { path: request.destination.final_path, created: false },
    non_atomic_authorization: code === "non_atomic_destination_requires_separate_authorization"
      ? "separate_explicit_authorization_and_cleanup_plan_required"
      : "not_applicable",
  });
  return settleFinalization(prepared, request, requestDigest, core);
}

async function finalizeExport(request) {
  validateFinalizeRequest(request);
  const requestDigest = finalizationRequestDigest(request);
  const prepared = await prepareFinalizationStore(request);

  // Receipt-first: a terminal receipt wins before destination inspection or any
  // attempt to repeat the external filesystem effect.
  const existing = await readStoreOperationReceipt(prepared.binary, prepared.storePath, request.operation_id);
  const replay = replayFinalizationReceipt(existing, requestDigest);
  if (replay) return replay;

  const destinationDigest = mechanicalDigest(request.destination);
  if (destinationDigest !== request.expected.destination_digest) {
    return blockedFinalization(prepared, request, requestDigest, "destination_digest_mismatch");
  }

  const marker = finalizationMarker(request, requestDigest);
  const finalExists = await pathExists(request.destination.final_path);
  const temporaryExists = await pathExists(request.destination.temporary_path);
  let recovered = false;
  if (finalExists) {
    const finalVerification = await verifyBundle(request.destination.final_path, request, { marker });
    if (!finalVerification.ok) {
      return await pathExists(path.join(request.destination.final_path, FINALIZATION_MARKER))
        ? uncertainFinalizationFailure(request)
        : blockedFinalization(prepared, request, requestDigest, "final_destination_conflict");
    }
    recovered = true;
    if (temporaryExists) {
      const temporaryVerification = await verifyBundle(request.destination.temporary_path, request, { requirePrivate: true });
      if (temporaryVerification.ok) await removeTemporary(request.destination.temporary_path);
    }
  } else {
    if (!temporaryExists) return blockedFinalization(prepared, request, requestDigest, "verified_preflight_bundle_unavailable");
    const markerPath = path.join(request.destination.temporary_path, FINALIZATION_MARKER);
    const markerPresent = await pathExists(markerPath);
    const verification = await verifyBundle(request.destination.temporary_path, request, {
      requirePrivate: true,
      marker: markerPresent ? marker : null,
    });
    if (!verification.ok) return blockedFinalization(prepared, request, requestDigest, verification.code);

    const policy = await currentCorpus(request, "case");
    if (!policy?.ok) return blockedFinalization(prepared, request, requestDigest, "policy_binding_unavailable");

    const finalParent = await realpath(path.dirname(request.destination.final_path)).catch(() => null);
    const [temporaryInfo, finalParentInfo] = await Promise.all([
      stat(request.destination.temporary_path).catch(() => null),
      finalParent == null ? null : stat(finalParent).catch(() => null),
    ]);
    const atomicSupported = process.env.CASEBOOK_PERSISTENCE_TEST_FAULT !== "export_force_non_atomic_destination"
      && temporaryInfo?.isDirectory() && finalParentInfo?.isDirectory() && temporaryInfo.dev === finalParentInfo.dev;
    if (!atomicSupported) {
      return blockedFinalization(prepared, request, requestDigest, "non_atomic_destination_requires_separate_authorization");
    }

    if (markerPresent) {
      recovered = true;
      if (!await verifyFinalizationMarker(request.destination.temporary_path, marker)) {
        return blockedFinalization(prepared, request, requestDigest, "finalization_marker_conflict");
      }
    } else {
      await writeFile(markerPath, `${canonicalJson(marker)}\n`, { mode: 0o600, flag: "wx" });
    }
    controlledFinalizationBoundary("export_after_intent_before_rename");
    try {
      await rename(request.destination.temporary_path, request.destination.final_path);
    } catch {
      const raced = await verifyBundle(request.destination.final_path, request, { marker });
      if (!raced.ok) {
        return await pathExists(path.join(request.destination.final_path, FINALIZATION_MARKER))
          ? uncertainFinalizationFailure(request)
          : blockedFinalization(prepared, request, requestDigest, "atomic_finalization_failed", { cleanup: false });
      }
      recovered = true;
    }
    if (process.env.CASEBOOK_PERSISTENCE_TEST_FAULT === "export_corrupt_after_rename") {
      await writeFile(path.join(request.destination.final_path, "manifest.json"), "{}\n");
    }
    controlledFinalizationBoundary("export_after_rename_before_receipt");
  }

  const finalVerification = await verifyBundle(request.destination.final_path, request, { marker });
  if (!finalVerification.ok) return uncertainFinalizationFailure(request);
  const temporaryCleaned = !await pathExists(request.destination.temporary_path);
  const core = resultCore(request, requestDigest, {
    outcome: "finalized",
    code: "atomic_finalization_completed",
    failure_class: null,
    retry_disposition: RETRY_DISPOSITIONS.NEVER,
    canonical_state_effect: "none",
    destination_effect: "atomic_directory_rename",
  }, {
    atomicity: "atomic_rename",
    effect_performed: true,
    recovered_after_interruption: recovered,
    marker: { path: FINALIZATION_MARKER, digest: marker.digest },
    temporary_output: { path: request.destination.temporary_path, cleaned: temporaryCleaned },
    final_output: { path: request.destination.final_path, created: true, verified: true },
    non_atomic_authorization: "not_applicable",
  });
  return settleFinalization(prepared, request, requestDigest, core);
}

export async function invokeExportOperation(request) {
  if (!["export.preflight", "export.finalize"].includes(request.operation)) return unsupported(request.operation);
  try {
    return request.operation === "export.preflight" ? await buildPreflight(request) : await finalizeExport(request);
  } catch (error) {
    if (error instanceof ExportError) {
      return failure(error.code, error.message, {
        failureClass: error.code,
        retryDisposition: error.code === "export.temporary_render_failed" ? RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR : RETRY_DISPOSITIONS.NEVER,
        evidence: error.evidence,
      });
    }
    return failure(request.operation === "export.finalize" ? "export.finalization_unavailable" : "export.preflight_unavailable",
      request.operation === "export.finalize"
        ? "Export finalization failed without claiming a destination effect."
        : "Export preflight failed without exposing owner or destination state.", {
        failureClass: request.operation === "export.finalize" ? "export.finalization_unavailable" : "export.preflight_unavailable",
        retryDisposition: RETRY_DISPOSITIONS.AFTER_OPERATOR_REPAIR,
        evidence: {},
      });
  }
}
