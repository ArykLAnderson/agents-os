import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { mechanicalDigest } from "../variants/sqlite/lib/substrate/mechanical.mjs";
import { selectCompatibleSqliteBinary } from "./sandbox-harness.mjs";

const entrypoint = new URL("../variants/sqlite/bin/casebook-persistence.mjs", import.meta.url).pathname;
const protocol = { id: "casebook-persistence-json", version: 1 };
const ids = Object.freeze({
  case: "case:33214fec-4fc6-45dd-8a33-aec086790231",
  source: "source:f9ad0a40-0bd8-42e0-9d8a-0bea6f74df3b",
  evidence: "evidence:bd78b6f5-2ab0-446e-b725-ae9663cd9344",
  document: "document:30eb99a4-7d71-4bb5-a61d-875de1d6f3d6",
  documentRevision: "document-revision:66ac4ac7-e73f-48e5-a14e-f195e989aab0",
  consequentialClaim: "claim:4413f027-c64a-46ce-94f1-b528c9c6f084",
  contextualClaim: "claim:92791845-fca2-48ec-aeb1-1a613589ad7d",
});

function invoke(cwd, request) {
  return new Promise((resolve) => {
    const child = execFile(process.execPath, [entrypoint], {
      cwd,
      env: { PATH: process.env.PATH ?? "", HOME: cwd },
      maxBuffer: 4 * 1024 * 1024,
    }, (error, stdout, stderr) => resolve({ code: error ? 2 : 0, json: JSON.parse(stdout), stderr }));
    child.stdin.end(JSON.stringify(request));
  });
}

function sha256Text(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

async function exists(value) {
  return stat(value).then(() => true).catch(() => false);
}

async function setup() {
  const root = await mkdtemp(path.join(os.tmpdir(), "casebook-l06-w03-"));
  const sqliteBin = await selectCompatibleSqliteBinary();
  const store = path.join(root, "store.db");
  const configuration = {
    source: { kind: "test", locator: "l06-w03" },
    authority_mode: "sqlite",
    sqlite: { database_url: store, sqlite_bin: sqliteBin },
  };
  const initialized = await invoke(root, {
    protocol,
    operation: "initialize_store",
    operation_id: "operation:l06-w03:init",
    authority_claim: { human_authorized: true, acting_role: "test", authority_basis: "disposable Document trace seam" },
    configuration,
  });
  assert.equal(initialized.code, 0, initialized.stderr);
  const initialization = initialized.json.result.initialization;
  const common = {
    protocol,
    request_version: 1,
    store_id: initialization.store_id,
    context: {
      view_id: initialization.view.id,
      view_policy_revision_id: initialization.view.policy_revision_id,
      purpose: "mechanically validate a Document-owned claim trace",
      requested_audience_ceiling: "private",
    },
    configuration,
  };
  const evidenceVersion = {
    excerpt: "Reader-verifiable evidence",
    purpose: "Support composed Document prose",
    captured_at: "2026-07-20T00:00:00Z",
    digest: "c".repeat(64),
    visibility: "public",
  };
  const locator = {
    kind: "reader",
    uri: "https://example.test/evidence#reader-fragment",
    audience: "public",
    digest: "d".repeat(64),
  };
  const caseRecord = {
    id: ids.case,
    home_namespace_id: initialization.namespace.id,
    state: "active",
    title: "Document trace evidence",
    summary: "Source material for composed prose",
    scope: "L06-W03",
    aliases: [],
    facets: [],
    entries: [],
    sources: [{
      id: ids.source,
      state: "active",
      display_label: "S1",
      version: {
        title: "Public evidence source",
        accessed_at: "2026-07-20T00:00:00Z",
        examined_for: "Document trace",
        visibility: "public",
        locators: [locator],
      },
      fragments: [{ id: ids.evidence, state: "active", version: evidenceVersion }],
    }],
    relationships: [],
    references: [],
  };
  const created = await invoke(root, {
    ...common,
    operation: "case.create",
    operation_id: "operation:l06-w03:case-create",
    expected_revision: 0,
    commit_basis: "L06-W03 fixture",
    provenance: { acting_role: "case", authority_basis: "synthetic" },
    case: caseRecord,
  });
  assert.equal(created.code, 0, created.stderr || JSON.stringify(created.json));
  const exported = await invoke(root, {
    ...common,
    operation: "case.export.fragment",
    case_id: ids.case,
    audience: "public",
    evidence_selection: [ids.evidence],
  });
  assert.equal(exported.code, 0, exported.stderr || JSON.stringify(exported.json));
  const exportedEvidence = exported.json.result.fragment.evidence.fragments.find((item) => item.evidence_id === ids.evidence);
  assert.match(exportedEvidence.digest, /^[0-9a-f]{64}$/);
  return {
    root,
    sqliteBin,
    store,
    common,
    locator,
    evidenceDigest: exportedEvidence.digest,
    evidenceVersionId: created.json.result.revision.version_ids[ids.evidence],
  };
}

function claimTrace(state, options = {}) {
  const text = "The composed artifact states a consequence supported by the selected evidence.";
  const contextualText = "This contextual bridge is explicitly nonconsequential.";
  const evidence = {
    owner_id: ids.case,
    source_id: ids.source,
    evidence_id: ids.evidence,
    evidence_version_id: state.evidenceVersionId,
    evidence_digest: state.evidenceDigest,
    reader_locator: state.locator,
    locator_digest: mechanicalDigest(state.locator),
  };
  const consequentialEvidence = options.omitConsequentialEvidence ? [] : [{ ...evidence, ...(options.evidenceOverride ?? {}) }];
  const core = {
    trace_schema: "document-claim-trace@1",
    document: { id: ids.document, revision_id: ids.documentRevision },
    claims: [{
      claim_id: ids.consequentialClaim,
      text,
      text_digest: options.textDigest ?? sha256Text(text),
      consequence_classification: options.consequenceClassification ?? "consequential",
      evidence: consequentialEvidence,
    }, {
      claim_id: ids.contextualClaim,
      text: contextualText,
      text_digest: sha256Text(contextualText),
      consequence_classification: "nonconsequential",
      evidence: [],
    }],
  };
  return { ...core, digest: options.traceDigest ?? mechanicalDigest(core) };
}

function preflight(state, name, trace) {
  return invoke(state.root, {
    ...state.common,
    operation: "export.preflight",
    operation_id: `operation:l06-w03:${name}`,
    authority_claim: { human_authorized: true, acting_role: "architect", authority_basis: "disposable claim-trace preflight" },
    mode: "current",
    audience: "public",
    destination: {
      classification: "publication_staging",
      temporary_path: path.join(state.root, `${name}.preflight`),
      final_path: path.join(state.root, `${name}.final`),
    },
    owners: [{ kind: "case", id: ids.case, requirement: "required", evidence_selection: [ids.evidence] }],
    document_trace: trace,
  });
}

async function canonicalCounts(state) {
  return new Promise((resolve, reject) => execFile(state.sqliteBin, ["-batch", "-noheader", state.store,
    "SELECT (SELECT count(*) FROM owner_revisions)||'|'||(SELECT count(*) FROM owner_events)||'|'||(SELECT count(*) FROM store_operation_receipts);"],
  { encoding: "utf8" }, (error, stdout, stderr) => error ? reject(new Error(stderr)) : resolve(stdout.trim())));
}

test("preflight consumes a digest-bound Document claim trace while preserving Document consequence classifications", async () => {
  const state = await setup();
  try {
    const before = await canonicalCounts(state);
    const trace = claimTrace(state);
    const result = await preflight(state, "valid", trace);
    assert.equal(result.code, 0, result.stderr || JSON.stringify(result.json));
    assert.equal(result.json.result.status, "ready", JSON.stringify(result.json.result));
    const validation = result.json.result.manifest.document_trace;
    assert.equal(validation.status, "verified");
    assert.equal(validation.trace_digest, trace.digest);
    assert.equal(validation.semantic_classification_performed, false);
    assert.deepEqual(validation.claims.map((claim) => ({
      claim_id: claim.claim_id,
      consequence_classification: claim.consequence_classification,
      status: claim.status,
    })), [{
      claim_id: ids.consequentialClaim,
      consequence_classification: "consequential",
      status: "evidence_verified",
    }, {
      claim_id: ids.contextualClaim,
      consequence_classification: "nonconsequential",
      status: "declared_nonconsequential_without_evidence",
    }]);
    assert.equal(result.json.result.bundle.files.some((file) => file.path === "document/claim-trace.json"), true);
    assert.equal(result.json.result.authority.publication, "not_granted");
    assert.equal(result.json.result.authority.finalization, "not_granted");
    assert.equal(result.json.result.publication_performed, false);
    assert.equal(result.json.result.final_output.created, false);
    assert.equal(await exists(path.join(state.root, "valid.final")), false);
    assert.equal(await canonicalCounts(state), before);
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("missing consequential evidence blocks preflight while the same Document-owned nonconsequential declaration is not reclassified", async () => {
  const state = await setup();
  try {
    const missing = await preflight(state, "missing", claimTrace(state, { omitConsequentialEvidence: true }));
    assert.equal(missing.code, 0, missing.stderr || JSON.stringify(missing.json));
    assert.equal(missing.json.result.status, "blocked");
    assert.equal(missing.json.result.manifest.blockers.some((item) => item.code === "document_consequential_claim_evidence_missing"), true);
    assert.equal(missing.json.result.manifest.document_trace.claims[0].consequence_classification, "consequential");
    assert.equal(missing.json.result.manifest.document_trace.claims[0].status, "consequential_evidence_missing");
    assert.equal(await exists(path.join(state.root, "missing.preflight")), false);
    assert.equal(await exists(path.join(state.root, "missing.final")), false);

    const declaredNonconsequential = await preflight(state, "declared-nonconsequential", claimTrace(state, {
      omitConsequentialEvidence: true,
      consequenceClassification: "nonconsequential",
    }));
    assert.equal(declaredNonconsequential.code, 0, declaredNonconsequential.stderr || JSON.stringify(declaredNonconsequential.json));
    assert.equal(declaredNonconsequential.json.result.status, "ready");
    assert.equal(declaredNonconsequential.json.result.manifest.document_trace.claims[0].consequence_classification, "nonconsequential");
    assert.equal(declaredNonconsequential.json.result.manifest.document_trace.semantic_classification_performed, false);
    assert.equal(await exists(path.join(state.root, "declared-nonconsequential.final")), false);
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});

test("claim trace digest, evidence membership/digest, and reader-safe locator violations block without temporary or final output", async () => {
  const state = await setup();
  try {
    const cases = [
      ["trace-digest", claimTrace(state, { traceDigest: "0".repeat(64) }), "document_trace_digest_mismatch"],
      ["text-digest", claimTrace(state, { textDigest: "0".repeat(64) }), "document_claim_text_digest_mismatch"],
      ["evidence-membership", claimTrace(state, { evidenceOverride: { evidence_id: "evidence:2871f468-aaf3-4dcf-aa2a-bb93f390149d" } }), "document_evidence_not_in_export_fragment"],
      ["evidence-digest", claimTrace(state, { evidenceOverride: { evidence_digest: "0".repeat(64) } }), "document_evidence_digest_mismatch"],
      ["locator-membership", claimTrace(state, { evidenceOverride: { reader_locator: { ...state.locator, uri: "https://other.example.test/not-member" } } }), "document_reader_locator_not_in_export_fragment"],
      ["locator-digest", claimTrace(state, { evidenceOverride: { locator_digest: "0".repeat(64) } }), "document_reader_locator_digest_mismatch"],
      ["unsafe-locator", claimTrace(state, { evidenceOverride: {
        reader_locator: { kind: "reader", uri: "file:///private/workspace/source", audience: "public", digest: "d".repeat(64) },
        locator_digest: mechanicalDigest({ kind: "reader", uri: "file:///private/workspace/source", audience: "public", digest: "d".repeat(64) }),
      } }), "document_reader_locator_unsafe"],
    ];
    for (const [name, trace, blockerCode] of cases) {
      const result = await preflight(state, name, trace);
      assert.equal(result.code, 0, `${name}: ${result.stderr || JSON.stringify(result.json)}`);
      assert.equal(result.json.result.status, "blocked", name);
      assert.equal(result.json.result.manifest.blockers.some((item) => item.code === blockerCode), true, `${name}: ${JSON.stringify(result.json.result.manifest.blockers)}`);
      assert.equal(result.json.result.manifest.document_trace.semantic_classification_performed, false);
      assert.equal(await exists(path.join(state.root, `${name}.preflight`)), false);
      assert.equal(await exists(path.join(state.root, `${name}.final`)), false);
    }
  } finally {
    await rm(state.root, { recursive: true, force: true });
  }
});
