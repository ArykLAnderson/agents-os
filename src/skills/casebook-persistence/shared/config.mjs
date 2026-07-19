import path from "node:path";
import { fileURLToPath } from "node:url";

export class ConfigurationError extends Error {
  constructor(code, message, evidence = {}) {
    super(message);
    this.name = "ConfigurationError";
    this.code = code;
    this.evidence = evidence;
  }
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function absoluteLocalPath(value, field) {
  if (!nonEmpty(value)) throw new ConfigurationError("configuration_missing", `${field} is required.`);
  if (!path.isAbsolute(value)) {
    throw new ConfigurationError("relative_path_rejected", `${field} must be an absolute path.`, { field });
  }
  return path.normalize(value);
}

export function resolveDatabaseLocation(value) {
  if (!nonEmpty(value)) throw new ConfigurationError("configuration_missing", "sqlite.database_url is required.");
  if (!value.startsWith("file:")) return absoluteLocalPath(value, "sqlite.database_url");

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new ConfigurationError("database_url_invalid", "sqlite.database_url is not a valid local file URL.");
  }
  if (url.protocol !== "file:" || (url.hostname && url.hostname !== "localhost") || url.search || url.hash) {
    throw new ConfigurationError("database_url_unsupported", "Only local file: URLs without query or fragment are supported.");
  }
  const resolved = fileURLToPath(url);
  return absoluteLocalPath(resolved, "sqlite.database_url");
}

export function validateAuthorityConfiguration(configuration) {
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration)) {
    throw new ConfigurationError("configuration_missing", "configuration must be an object.");
  }
  const { source, authority_mode: authorityMode } = configuration;
  if (!source || typeof source !== "object" || !nonEmpty(source.kind) || !nonEmpty(source.locator)) {
    throw new ConfigurationError("configuration_source_missing", "configuration.source.kind and locator are required.");
  }
  if (!new Set(["sqlite", "markdown"]).has(authorityMode)) {
    throw new ConfigurationError("authority_mode_invalid", "authority_mode must be exactly sqlite or markdown.");
  }

  if (authorityMode === "sqlite") {
    if (configuration.markdown != null) {
      throw new ConfigurationError("dual_authority_rejected", "Markdown configuration cannot accompany sqlite authority.");
    }
    if (!configuration.sqlite || typeof configuration.sqlite !== "object") {
      throw new ConfigurationError("configuration_missing", "sqlite authority requires sqlite configuration.");
    }
    return {
      source: { kind: source.kind, locator: source.locator },
      authority_mode: authorityMode,
      sqlite: {
        database_url: configuration.sqlite.database_url,
        store_path: resolveDatabaseLocation(configuration.sqlite.database_url),
        sqlite_bin: configuration.sqlite.sqlite_bin == null
          ? null
          : absoluteLocalPath(configuration.sqlite.sqlite_bin, "sqlite.sqlite_bin"),
      },
    };
  }

  if (configuration.sqlite != null) {
    throw new ConfigurationError("dual_authority_rejected", "SQLite configuration cannot accompany markdown authority.");
  }
  if (!configuration.markdown || typeof configuration.markdown !== "object") {
    throw new ConfigurationError("configuration_missing", "markdown authority requires markdown configuration.");
  }
  return {
    source: { kind: source.kind, locator: source.locator },
    authority_mode: authorityMode,
    markdown: { workspace_root: absoluteLocalPath(configuration.markdown.workspace_root, "markdown.workspace_root") },
  };
}
