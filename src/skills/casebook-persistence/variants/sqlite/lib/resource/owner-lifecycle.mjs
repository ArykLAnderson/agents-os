const KIND = /^[a-z][a-z0-9_-]{0,63}$/;
const SQL_IDENTIFIER = /^[a-z][a-z0-9_]*$/i;

export class OwnerLifecycleCapabilityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OwnerLifecycleCapabilityError";
    this.code = code;
  }
}

function validateAdapter(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || Object.keys(value).some((key) => !["owner_kind", "current_predicate"].includes(key))
    || !KIND.test(value.owner_kind ?? "") || typeof value.current_predicate !== "function") {
    throw new OwnerLifecycleCapabilityError("owner_lifecycle_capability_invalid", "An owner lifecycle adapter is invalid.");
  }
  return Object.freeze({ owner_kind: value.owner_kind, current_predicate: value.current_predicate });
}

export function createOwnerLifecycleRegistry(adapters = []) {
  if (!Array.isArray(adapters)) throw new OwnerLifecycleCapabilityError("owner_lifecycle_capability_invalid", "Owner lifecycle adapters must be a closed array.");
  const registered = new Map();
  for (const raw of adapters) {
    const adapter = validateAdapter(raw);
    if (registered.has(adapter.owner_kind)) throw new OwnerLifecycleCapabilityError("owner_lifecycle_capability_invalid", "A duplicate owner lifecycle adapter was registered.");
    registered.set(adapter.owner_kind, adapter);
  }
  const currentPredicate = ({ ownerAlias, revisionExpression }) => {
    if (!SQL_IDENTIFIER.test(ownerAlias ?? "") || typeof revisionExpression !== "string" || !revisionExpression.trim()) {
      throw new OwnerLifecycleCapabilityError("owner_lifecycle_capability_invalid", "Owner lifecycle predicate inputs are invalid.");
    }
    if (!registered.size) return "0";
    const branches = [];
    for (const adapter of registered.values()) {
      const predicate = adapter.current_predicate({ owner_alias: ownerAlias, revision_expression: revisionExpression });
      if (typeof predicate !== "string" || !predicate.trim()) throw new OwnerLifecycleCapabilityError("owner_lifecycle_capability_invalid", "An owner lifecycle adapter returned an invalid predicate.");
      branches.push(`WHEN '${adapter.owner_kind}' THEN (${predicate})`);
    }
    // Valid unregistered owners remain canonical but are omitted from ordinary
    // projections and totals. Registration is explicit and default-deny.
    return `(CASE ${ownerAlias}.owner_kind ${branches.join(" ")} ELSE 0 END)`;
  };
  return Object.freeze({ currentPredicate });
}
