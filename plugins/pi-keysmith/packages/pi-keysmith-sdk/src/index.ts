export interface Disposable {
  dispose(): void;
}

export type KeysmithNotificationType = "info" | "warning" | "error";
export type KeysmithThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

export interface KeysmithModel {
  readonly id: string;
  readonly name?: string;
  readonly api?: string;
  readonly provider?: string;
}

export interface KeysmithUIDialogOptions {
  readonly signal?: AbortSignal;
  readonly timeout?: number;
}

export interface KeysmithInvocationUI {
  notify(message: string, type?: KeysmithNotificationType): void;
  select(title: string, options: string[], opts?: KeysmithUIDialogOptions): Promise<string | undefined>;
  getToolsExpanded?(): boolean;
  setToolsExpanded?(expanded: boolean): void;
}

export interface KeysmithSlashCommandInfo {
  readonly name: string;
  readonly invocationName?: string;
  readonly source?: string;
  readonly sourceInfo?: {
    readonly source?: string;
    readonly path?: string;
    readonly baseDir?: string;
    readonly [key: string]: unknown;
  };
  readonly [key: string]: unknown;
}

export interface KeysmithInvocationContext {
  readonly cwd: string;
  readonly model?: KeysmithModel;
  readonly hasUI?: boolean;
  readonly ui?: KeysmithInvocationUI;
  /** Native Pi command context for actions that need full session/window APIs. Treat as optional and runtime-specific. */
  readonly piContext?: unknown;
  submitEditorText?(text: string): void | Promise<void>;
  getCommands?(): readonly KeysmithSlashCommandInfo[];
  getThinkingLevel?(): KeysmithThinkingLevel;
  setThinkingLevel?(level: KeysmithThinkingLevel): void | Promise<void>;
}

export type KeysmithActionHandler = (context: KeysmithInvocationContext) => void | Promise<void>;

export interface KeysmithActionRegistration {
  readonly id: string;
  readonly description?: string;
  readonly handler: KeysmithActionHandler;
  readonly aliases?: readonly string[];
  readonly name?: string;
  readonly sourceType?: string;
  readonly sourceDisplayName?: string;
  readonly compatShimId?: string;
  readonly available?: boolean;
  readonly availabilityReason?: string;
  readonly sideEffect?: string;
  readonly implementationStability?: string;
}

export interface KeysmithDefaultKeymapRegistration {
  readonly source: string;
  readonly spec: Record<string, unknown>;
}

export type KeysmithShimSourceType = "compat" | "plugin" | "user";
export type KeysmithShimSideEffect = "none" | "local-state" | "destructive" | "external";
export type KeysmithShimImplementationStability = "native" | "appAction" | "slashFallback";

export interface KeysmithShimActionRegistration extends KeysmithActionRegistration {
  readonly aliases?: readonly string[];
  readonly name?: string;
  readonly sourceType?: KeysmithShimSourceType;
  readonly sourceDisplayName?: string;
  readonly sideEffect?: KeysmithShimSideEffect;
  readonly implementationStability?: KeysmithShimImplementationStability;
}

export interface KeysmithShimDescriptor {
  readonly id: string;
  readonly sourceType: KeysmithShimSourceType;
  readonly displayName: string;
  readonly targetPackages: readonly string[];
  readonly replaces?: readonly string[];
  readonly actions: readonly KeysmithShimActionRegistration[];
  readonly defaultSpec?: Record<string, unknown>;
}

export interface KeysmithRegistrySnapshot {
  readonly actions: KeysmithActionRegistration[];
  readonly defaultKeymaps: KeysmithDefaultKeymapRegistration[];
  readonly diagnostics: string[];
  readonly shims: KeysmithShimDescriptor[];
}

export interface KeysmithRegistry {
  readonly version: 1;
  registerAction(registration: KeysmithActionRegistration): Disposable;
  registerDefaultKeymaps(registration: KeysmithDefaultKeymapRegistration): Disposable;
  registerKeysmithShim(descriptor: KeysmithShimDescriptor): Disposable;
  snapshot(): KeysmithRegistrySnapshot;
  subscribe(listener: () => void): Disposable;
}

const REGISTRY_SYMBOL = Symbol.for("pi-keysmith.sdk.registry");
const REGISTRY_VERSION = 1;

type ShimRecord = {
  descriptor: KeysmithShimDescriptor;
  refCount: number;
};

type MutableRegistryRecord = {
  version: 1;
  actions: Map<string, KeysmithActionRegistration>;
  defaultKeymaps: KeysmithDefaultKeymapRegistration[];
  shims: Map<string, ShimRecord>;
  listeners: Set<() => void>;
  diagnostics: string[];
};

export function createNoopDisposable(): Disposable {
  return { dispose() {} };
}

export function registerAction(registration: KeysmithActionRegistration): Disposable {
  return getRegistry().registerAction(registration);
}

export function registerDefaultKeymaps(registration: KeysmithDefaultKeymapRegistration): Disposable {
  return getRegistry().registerDefaultKeymaps(registration);
}

export function registerKeysmithShim(descriptor: KeysmithShimDescriptor): Disposable {
  return getRegistry().registerKeysmithShim(descriptor);
}

export function getKeysmithRegistry(): KeysmithRegistry {
  return getRegistry();
}

export function __getKeysmithRegistryForTests(): KeysmithRegistry {
  return getRegistry();
}

function getRegistry(): KeysmithRegistry {
  const globalRecord = globalThis as typeof globalThis & { [REGISTRY_SYMBOL]?: unknown };
  const existing = globalRecord[REGISTRY_SYMBOL];
  if (existing !== undefined && !isCompatibleRegistryRecord(existing)) {
    const version = registryVersionOf(existing);
    throw new Error(`pi-keysmith SDK registry version mismatch: expected ${REGISTRY_VERSION}, found ${version}`);
  }

  const record = ensureRegistryRecord((existing as Partial<MutableRegistryRecord> | undefined) ?? createRegistryRecord());
  globalRecord[REGISTRY_SYMBOL] = record;

  return {
    version: REGISTRY_VERSION,
    registerAction(registration) {
      if (record.actions.has(registration.id)) {
        const message = `pi-keysmith SDK duplicate action id: ${registration.id}`;
        record.diagnostics.push(message);
        throw new Error(message);
      }
      record.actions.set(registration.id, registration);
      notify(record);
      return disposable(() => {
        if (record.actions.get(registration.id) === registration) {
          record.actions.delete(registration.id);
          notify(record);
        }
      });
    },
    registerDefaultKeymaps(registration) {
      record.defaultKeymaps.push(registration);
      notify(record);
      return disposable(() => {
        const index = record.defaultKeymaps.indexOf(registration);
        if (index >= 0) {
          record.defaultKeymaps.splice(index, 1);
          notify(record);
        }
      });
    },
    registerKeysmithShim(descriptor) {
      validateShimReplacementAuthorization(record, descriptor);
      const existingShim = record.shims.get(descriptor.id);
      if (existingShim) {
        existingShim.refCount += 1;
        return disposable(() => {
          existingShim.refCount -= 1;
          if (existingShim.refCount <= 0 && record.shims.get(descriptor.id) === existingShim) {
            record.shims.delete(descriptor.id);
            notify(record);
          }
        });
      }

      const shimRecord: ShimRecord = { descriptor, refCount: 1 };
      record.shims.set(descriptor.id, shimRecord);
      notify(record);
      return disposable(() => {
        shimRecord.refCount -= 1;
        if (shimRecord.refCount <= 0 && record.shims.get(descriptor.id) === shimRecord) {
          record.shims.delete(descriptor.id);
          notify(record);
        }
      });
    },
    snapshot() {
      const shims = activeShimDescriptors(record);
      return {
        actions: snapshotActions(record, shims),
        defaultKeymaps: snapshotDefaultKeymaps(record, shims),
        diagnostics: [...record.diagnostics],
        shims: [...shims].sort((a, b) => a.id.localeCompare(b.id)),
      };
    },
    subscribe(listener) {
      record.listeners.add(listener);
      return disposable(() => record.listeners.delete(listener));
    },
  };
}

function createRegistryRecord(): MutableRegistryRecord {
  return {
    version: REGISTRY_VERSION,
    actions: new Map(),
    defaultKeymaps: [],
    shims: new Map(),
    listeners: new Set(),
    diagnostics: [],
  };
}

function ensureRegistryRecord(record: Partial<MutableRegistryRecord>): MutableRegistryRecord {
  record.version = REGISTRY_VERSION;
  record.actions ??= new Map();
  record.defaultKeymaps ??= [];
  record.shims ??= new Map();
  record.listeners ??= new Set();
  record.diagnostics ??= [];
  return record as MutableRegistryRecord;
}

function isCompatibleRegistryRecord(value: unknown): value is MutableRegistryRecord {
  return typeof value === "object" && value !== null && (value as { version?: unknown }).version === REGISTRY_VERSION;
}

function registryVersionOf(value: unknown): string {
  if (typeof value === "object" && value && "version" in value) {
    return String((value as { version: unknown }).version);
  }
  return "unknown";
}

function validateShimReplacementAuthorization(record: MutableRegistryRecord, descriptor: KeysmithShimDescriptor): void {
  for (const replaced of descriptor.replaces ?? []) {
    if (descriptor.sourceType !== "plugin") continue;
    if (targetPackageMatchesReplacement(descriptor.targetPackages, replaced)) continue;

    const message = `pi-keysmith SDK rejected shim ${descriptor.id}: plugin-owned replacement of ${replaced} is not authorized; target package must match the replaced same package`;
    record.diagnostics.push(message);
    throw new Error(message);
  }
}

function targetPackageMatchesReplacement(targetPackages: readonly string[], replacedShimId: string): boolean {
  const replaced = packageIdentityFromShimId(replacedShimId);
  if (!replaced) return false;
  return targetPackages.map(normalizePackageIdentity).includes(replaced);
}

function packageIdentityFromShimId(shimId: string): string | undefined {
  const withoutType = shimId.replace(/^(?:compat|plugin|user):/, "");
  const normalized = normalizePackageIdentity(withoutType);
  return normalized || undefined;
}

function normalizePackageIdentity(value: string): string {
  return value.replace(/^npm:/, "");
}

function activeShimDescriptors(record: MutableRegistryRecord): KeysmithShimDescriptor[] {
  return [...record.shims.values()].map((shim) => shim.descriptor);
}

function snapshotActions(record: MutableRegistryRecord, shims: readonly KeysmithShimDescriptor[]): KeysmithActionRegistration[] {
  const actions = new Map(record.actions);
  for (const shim of shims) {
    for (const action of shim.actions) {
      const registration = shimActionRegistration(shim, action, action.id);
      actions.set(registration.id, registration);
      for (const alias of action.aliases ?? []) actions.set(alias, shimActionRegistration(shim, action, alias));
    }
  }
  return [...actions.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function shimActionRegistration(
  shim: KeysmithShimDescriptor,
  action: KeysmithShimActionRegistration,
  id: string,
): KeysmithActionRegistration {
  return {
    ...action,
    id,
    sourceType: action.sourceType ?? shim.sourceType,
    sourceDisplayName: action.sourceDisplayName ?? shim.displayName,
  };
}

function snapshotDefaultKeymaps(record: MutableRegistryRecord, shims: readonly KeysmithShimDescriptor[]): KeysmithDefaultKeymapRegistration[] {
  const defaultKeymaps = [...record.defaultKeymaps];
  for (const shim of shims) {
    if (shim.defaultSpec) defaultKeymaps.push({ source: shim.id, spec: shim.defaultSpec });
  }
  return defaultKeymaps.sort((a, b) => a.source.localeCompare(b.source));
}

function disposable(dispose: () => void): Disposable {
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      dispose();
    },
  };
}

function notify(record: MutableRegistryRecord): void {
  for (const listener of [...record.listeners]) listener();
}
