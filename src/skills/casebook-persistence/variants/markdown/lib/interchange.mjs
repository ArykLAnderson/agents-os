import {
  canonicalJson,
  interchangeFrontmatter,
  interchangeJsonSection,
  interchangeKeyFromId,
  L01_IDENTITY_RULE,
  L01_INTERCHANGE_FORMAT,
  sha256,
} from "../../../shared/l01-interchange.mjs";

const CATEGORY_HEADING = Object.freeze({
  fog: "Fog",
  frontier: "Frontier",
  blocked: "Blocked",
  contested: "Contested",
  deferred: "Deferred",
  out_of_scope: "Out of Scope",
  settled: "Settled",
});

const CASE_EXTENSION_FIELDS = ["provenance", "aliases", "facets", "entries", "sources", "relationships", "references"];
const DISCOVERY_SIMPLE_FIELDS = new Set([
  "id", "display_label", "display_order", "lifecycle", "category", "title", "body", "human_authority", "dependencies",
]);

function isCompleteCase(record) {
  return CASE_EXTENSION_FIELDS.some((key) => record[key] != null);
}

function isSimpleDiscovery(item) {
  return item.lifecycle === "active" && item.dependencies?.length === 0
    && Object.keys(item).every((key) => DISCOVERY_SIMPLE_FIELDS.has(key));
}

function localLabel(index) {
  // Labels are revision-local display aids. Stable identity comes only from
  // the digest-verified machine-readable manifest.
  return `AT-${String(index + 1).padStart(3, "0")}`;
}

function renderCaseMarkdown(record) {
  const frontmatter = interchangeFrontmatter([
    ["type", "case"],
    ["schema_version", 1],
    ["id", record.id],
    ["home_namespace_id", record.home_namespace_id],
    ["state", record.state],
    ["title", record.title],
    ["summary", record.summary],
  ]);
  if (!isCompleteCase(record)) return `${frontmatter}${interchangeJsonSection("Scope", record.scope)}## Knowledge\n\n## Sources\n`;
  const knowledge = {
    ...(record.provenance == null ? {} : { provenance: record.provenance }),
    aliases: record.aliases,
    facets: record.facets,
    entries: record.entries,
    relationships: record.relationships,
    references: record.references,
  };
  return `${frontmatter}${interchangeJsonSection("Scope", record.scope)}${interchangeJsonSection("Knowledge", knowledge)}${interchangeJsonSection("Sources", record.sources)}`;
}

function renderFrameMarkdown(record) {
  let markdown = interchangeFrontmatter([
    ["type", "frame"],
    ["schema_version", 1],
    ["id", record.id],
    ["home_namespace_id", record.home_namespace_id],
    ["authority_scope_namespace_ids", record.authority_scope_namespace_ids],
    ["status", record.status],
    ["title", record.title],
  ]);
  markdown += interchangeJsonSection("Outcome", record.outcome);
  markdown += interchangeJsonSection("Included Scope", record.included_scope);
  markdown += interchangeJsonSection("Excluded Scope", record.excluded_scope);
  markdown += interchangeJsonSection("Limitations", record.limitations);
  markdown += interchangeJsonSection("Completion Condition", record.completion_condition);
  if (["case_links", "frame_links", "downstream_links", "artifact_links"].some((key) => record[key] != null)) {
    markdown += interchangeJsonSection("Links", {
      case_links: record.case_links ?? [],
      frame_links: record.frame_links ?? [],
      downstream_links: record.downstream_links ?? [],
      artifact_links: record.artifact_links ?? [],
    });
  }
  if (record.authorization_provenance != null) markdown += interchangeJsonSection("Authorization", record.authorization_provenance);
  markdown += "## Discovery\nSee the manifest-selected Discovery file.\n";
  if (record.disposition_boundaries != null && record.case_dispositions != null) {
    const content = {
      disposition_boundaries: record.disposition_boundaries.map((item, index) => ({
        source_label: `DB-${String(index + 1).padStart(3, "0")}`,
        record: item,
      })),
      case_dispositions: record.case_dispositions.map((item, index) => ({
        source_label: `CD-${String(index + 1).padStart(3, "0")}`,
        record: item,
      })),
    };
    markdown += `\n## Case Dispositions\n\`\`\`json\n${JSON.stringify(content)}\n\`\`\`\n`;
  }
  return markdown;
}

function renderDiscoveryMarkdown(record) {
  const groups = new Map();
  record.discovery.forEach((item, index) => {
    const values = groups.get(item.category) ?? [];
    values.push({ item, index });
    groups.set(item.category, values);
  });
  let markdown = "";
  for (const category of Object.keys(CATEGORY_HEADING)) {
    const values = groups.get(category);
    if (!values?.length) continue;
    markdown += `## ${CATEGORY_HEADING[category]}\n\n`;
    for (const { item, index } of values) {
      markdown += `### ${localLabel(index)}: ${JSON.stringify(item.title)}\n`;
      const payload = isSimpleDiscovery(item)
        ? item.body
        : {
            schema: "casebook-discovery-full@1",
            body: item.body,
            lifecycle: item.lifecycle,
            dependencies: item.dependencies,
            ...(item.scope_namespace_ids == null ? {} : { scope_namespace_ids: item.scope_namespace_ids }),
            ...(item.disposition == null ? {} : { disposition: item.disposition }),
            ...(item.resolution == null ? {} : { resolution: item.resolution }),
            ...(item.reopened_from_version == null ? {} : { reopened_from_version: item.reopened_from_version }),
            ...(item.reopening_basis == null ? {} : { reopening_basis: item.reopening_basis }),
          };
      markdown += `- Human authority: ${item.human_authority}\n\n\`\`\`json\n${JSON.stringify(payload)}\n\`\`\`\n\n`;
    }
  }
  return markdown;
}

export function renderInterchange(records, options = {}) {
  const discoveryFilenameByFrame = options.discoveryFilenameByFrame ?? {};
  const files = [];
  const manifestRecords = [];
  const sorted = [...records].sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id));
  for (const item of sorted) {
    const record = item.record;
    if (item.kind === "case") {
      const relativePath = `cases/${interchangeKeyFromId(record.id)}.md`;
      const content = renderCaseMarkdown(record);
      files.push({ path: relativePath, content, sha256: sha256(content) });
      manifestRecords.push({ kind: "case", id: record.id, path: relativePath, sha256: sha256(content) });
      continue;
    }
    if (item.kind !== "frame") throw new Error(`Unsupported L-01 interchange owner kind: ${item.kind}`);
    const directory = `frames/${interchangeKeyFromId(record.id)}`;
    const discoveryFilename = discoveryFilenameByFrame[record.id] ?? "discovery.md";
    if (discoveryFilename !== "discovery.md" && discoveryFilename !== "discovery-map.md") {
      throw new Error("The L-01 interchange accepts only current or legacy Discovery filenames.");
    }
    const framePath = `${directory}/frame.md`;
    const discoveryPath = `${directory}/${discoveryFilename}`;
    const frameContent = renderFrameMarkdown(record);
    const discoveryContent = renderDiscoveryMarkdown(record);
    files.push(
      { path: framePath, content: frameContent, sha256: sha256(frameContent) },
      { path: discoveryPath, content: discoveryContent, sha256: sha256(discoveryContent) },
    );
    manifestRecords.push({
      kind: "frame",
      id: record.id,
      frame_path: framePath,
      frame_sha256: sha256(frameContent),
      discovery_path: discoveryPath,
      discovery_sha256: sha256(discoveryContent),
      discovery_filename: discoveryFilename,
      discovery_items: record.discovery.map((discovery, index) => ({
        label: localLabel(index),
        id: discovery.id,
        display_order: discovery.display_order,
        ...(discovery.display_label == null ? {} : { display_label: discovery.display_label }),
      })),
    });
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  const manifest = {
    manifest_version: 1,
    format: L01_INTERCHANGE_FORMAT,
    identity_rule: L01_IDENTITY_RULE,
    records: manifestRecords,
  };
  const manifestBytes = canonicalJson(manifest);
  return {
    format: L01_INTERCHANGE_FORMAT,
    manifest,
    manifest_bytes: manifestBytes,
    manifest_sha256: sha256(manifestBytes),
    files,
  };
}
