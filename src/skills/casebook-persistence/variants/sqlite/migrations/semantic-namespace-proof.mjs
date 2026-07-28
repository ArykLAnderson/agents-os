#!/usr/bin/env node
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { selectSqliteBinary, sqlite } from "../lib/substrate/diagnostics.mjs";

const usage = "usage: semantic-namespace-proof.mjs --source <absolute-store> [--output <absolute-json>]";
const args = process.argv.slice(2);
const value = (name) => { const at = args.indexOf(name); return at < 0 ? null : args[at + 1] ?? null; };
const source = value("--source"), output = value("--output");
if (!path.isAbsolute(source ?? "") || !path.isAbsolute(output ?? source ?? "")) { process.stderr.write(`${usage}\n`); process.exitCode = 1; }
else {
  const binary = await selectSqliteBinary();
  const sql = `PRAGMA query_only=ON;
WITH namespace AS (
  SELECT n.namespace_id,r.display_name,r.normalized_name,n.lifecycle
  FROM context_namespace_current n JOIN context_namespace_revisions r ON r.namespace_revision_id=n.namespace_revision_id
), placement AS (
  SELECT o.owner_id,o.owner_kind,json_extract(c.projection_json,'$._mechanical_placement.namespace_id') namespace_id,c.projection_json
  FROM owners o JOIN owner_current c ON c.owner_id=o.owner_id WHERE o.owner_kind IN ('case','frame')
)
SELECT json_object(
  'schema',(SELECT json_object('schema_id',schema_id,'schema_version',schema_version) FROM store_metadata WHERE singleton=1),
  'namespaces',(SELECT json_group_array(json_object('id',namespace_id,'display_name',display_name,'normalized_name',normalized_name,'lifecycle',lifecycle)) FROM namespace),
  'owners',(SELECT json_group_array(json_object('id',owner_id,'kind',owner_kind,'namespace_id',namespace_id,'aggregate_json',projection_json)) FROM placement),
  'counts',(SELECT json_group_object(owner_kind,count) FROM (SELECT owner_kind,count(*) count FROM placement GROUP BY owner_kind))
) proof;`;
  const { stdout } = await sqlite(binary.path, source, sql, { args: ["-batch", "-bail", "-json"], maxBuffer: 64 * 1024 * 1024 });
  const rawProof = JSON.parse(stdout || "[]")[0]?.proof ?? {};
  const observed = typeof rawProof === "string" ? JSON.parse(rawProof) : rawProof;
  const parseJson = (value, fallback) => typeof value === "string" ? JSON.parse(value) : (value ?? fallback);
  const namespaces = parseJson(observed.namespaces, []), owners = parseJson(observed.owners, []);
  const personal = namespaces.filter((item) => item.normalized_name === "personal" && item.lifecycle === "active");
  const placements = owners.filter((item) => item.namespace_id != null);
  const violations = [];
  if (personal.length !== 1) violations.push({ rule: "exact_active_personal_namespace", observed: personal.length });
  if (personal.length === 1 && placements.some((item) => item.namespace_id !== personal[0].id)) violations.push({ rule: "all_current_content_in_old_personal", observed: [...new Set(placements.map((item) => item.namespace_id))] });
  if (owners.some((item) => item.namespace_id == null)) violations.push({ rule: "current_case_frame_placement_present" });
  const result = {
    schema: "casebook-semantic-namespace-migration-proof@1",
    source: path.resolve(source),
    mutation_performed: false,
    mapping: personal.length === 1 ? [{ from: personal[0].id, to: "namespace:personal" }] : [],
    preserved: {
      stable_owner_ids: owners.map(({ id, kind }) => ({ id, kind })),
      current_aggregate_count: owners.length,
      current_aggregate_placements: placements.map(({ id, kind, namespace_id }) => ({ id, kind, from_namespace: namespace_id, to_namespace: "namespace:personal" })),
    },
    observed,
    status: violations.length ? "refused" : "proven",
    violations,
  };
  const bytes = `${JSON.stringify(result, null, 2)}\n`;
  if (output) await writeFile(output, bytes, { flag: "wx", mode: 0o600 });
  process.stdout.write(bytes);
  process.exitCode = violations.length ? 2 : 0;
}
