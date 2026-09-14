/** Cross-platform durable envelope for an idempotent JSON POST. */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AsyncStringStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

export type PendingJsonRequest = Readonly<{
  version: 1;
  scope: string;
  requestId: string;
  payload: Readonly<Record<string, unknown>>;
}>;

export class PendingJsonRequestPersistenceError extends Error {
  constructor() {
    super("The request could not be persisted safely before sending");
    this.name = "PendingJsonRequestPersistenceError";
  }
}

function cloneJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const cloned = JSON.parse(JSON.stringify(value)) as unknown;
    return cloned && typeof cloned === "object" && !Array.isArray(cloned)
      ? cloned as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function deepFreezeJson<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreezeJson(child);
  return Object.freeze(value);
}

function parsePending(raw: string, scope: string): PendingJsonRequest | null {
  try {
    const value = JSON.parse(raw) as Partial<PendingJsonRequest>;
    const requestId = typeof value.requestId === "string" && UUID_RE.test(value.requestId)
      ? value.requestId.toLowerCase()
      : null;
    const payload = cloneJsonObject(value.payload);
    if (value.version !== 1 || value.scope !== scope || !requestId || !payload) return null;
    return { version: 1, scope, requestId, payload: deepFreezeJson(payload) };
  } catch {
    return null;
  }
}

export function pendingJsonRequestStorageKey(prefix: string, scope: string): string {
  if (!prefix.trim() || !scope) throw new TypeError("Pending request storage needs a prefix and scope");
  return `${prefix}:${encodeURIComponent(scope)}`;
}

// AsyncStorage operations are not compare-and-set. Serialize preparation and
// clearing inside one JS runtime; the server unique index remains the final
// guard across runtimes/devices.
const storageLocks = new Map<string, Promise<void>>();

async function withStorageLock<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = storageLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.then(() => gate);
  storageLocks.set(key, queued);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (storageLocks.get(key) === queued) storageLocks.delete(key);
  }
}

export async function preparePendingJsonRequest(options: Readonly<{
  storage: AsyncStringStorage;
  storageKey: string;
  scope: string;
  payload: Readonly<Record<string, unknown>>;
  createRequestId: () => string;
}>): Promise<PendingJsonRequest> {
  return withStorageLock(options.storageKey, async () => {
    let existingRaw: string | null;
    try {
      existingRaw = await options.storage.getItem(options.storageKey);
    } catch {
      throw new PendingJsonRequestPersistenceError();
    }
    if (existingRaw != null) {
      const existing = parsePending(existingRaw, options.scope);
      if (!existing) throw new PendingJsonRequestPersistenceError();
      return existing;
    }

    const requestIdRaw = options.createRequestId();
    const requestId = UUID_RE.test(requestIdRaw) ? requestIdRaw.toLowerCase() : null;
    const payload = cloneJsonObject(options.payload);
    if (!requestId || !payload) throw new PendingJsonRequestPersistenceError();
    const pending: PendingJsonRequest = {
      version: 1,
      scope: options.scope,
      requestId,
      payload: deepFreezeJson(payload),
    };
    const serialized = JSON.stringify(pending);
    try {
      await options.storage.setItem(options.storageKey, serialized);
      if (await options.storage.getItem(options.storageKey) !== serialized) {
        throw new PendingJsonRequestPersistenceError();
      }
    } catch (error) {
      if (error instanceof PendingJsonRequestPersistenceError) throw error;
      throw new PendingJsonRequestPersistenceError();
    }
    return pending;
  });
}

/** Compare-and-clear; an older response cannot erase a newer request. */
export async function clearPendingJsonRequest(options: Readonly<{
  storage: AsyncStringStorage;
  storageKey: string;
  scope: string;
  requestId: string;
}>): Promise<boolean> {
  return withStorageLock(options.storageKey, async () => {
    try {
      const raw = await options.storage.getItem(options.storageKey);
      if (raw == null) return true;
      const current = parsePending(raw, options.scope);
      if (!current || current.requestId !== options.requestId.toLowerCase()) return false;
      await options.storage.removeItem(options.storageKey);
      return await options.storage.getItem(options.storageKey) == null;
    } catch {
      return false;
    }
  });
}

export function isAmbiguousIdempotentRequestStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
}
