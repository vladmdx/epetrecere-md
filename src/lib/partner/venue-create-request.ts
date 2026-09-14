import { normalizeVenueCreateRequestId } from "./onboarding-create-request";

export const VENUE_CREATE_STORAGE_KEY = "epetrecere:venue-create:v1";

type CreateRequestStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The exact JSON body sent to one organization's venue collection route. */
export type VenueCreateRequestPayload = Readonly<
  Record<string, unknown> & {
    organizationId: number;
    createIntent: true;
    createRequestId: string;
  }
>;

export type PendingVenueCreateRequest = Readonly<{
  version: 1;
  actorId: string;
  organizationId: number;
  requestId: string;
  payload: VenueCreateRequestPayload;
}>;

function storageKey(actorId: string, organizationId: number): string {
  return `${VENUE_CREATE_STORAGE_KEY}:${encodeURIComponent(actorId)}:${organizationId}`;
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

/** Freeze one actor- and organization-scoped venue POST body. */
export function newPendingVenueCreateRequest(
  actorId: string,
  organizationId: number,
  requestId: string,
  payload: Readonly<Record<string, unknown>>,
): PendingVenueCreateRequest | null {
  const normalizedActorId = actorId.trim();
  const normalizedRequestId = normalizeVenueCreateRequestId(requestId);
  const clonedPayload = cloneJsonObject(payload);
  if (
    !normalizedActorId
    || !Number.isSafeInteger(organizationId)
    || organizationId <= 0
    || !normalizedRequestId
    || !clonedPayload
    || Object.hasOwn(clonedPayload, "venueId")
  ) {
    return null;
  }
  const exactPayload = cloneJsonObject({
    ...clonedPayload,
    organizationId,
    createIntent: true,
    createRequestId: normalizedRequestId,
  });
  if (!exactPayload) return null;
  return {
    version: 1,
    actorId: normalizedActorId,
    organizationId,
    requestId: normalizedRequestId,
    payload: deepFreezeJson(exactPayload) as VenueCreateRequestPayload,
  };
}

export function venueCreateRequestPayload(
  request: PendingVenueCreateRequest,
): VenueCreateRequestPayload {
  const payload = cloneJsonObject(request.payload);
  if (!payload) throw new TypeError("Invalid pending Venue create payload");
  return deepFreezeJson(payload) as VenueCreateRequestPayload;
}

export function readPendingVenueCreateRequest(
  storage: CreateRequestStorage,
  actorId: string,
  organizationId: number,
): PendingVenueCreateRequest | null {
  try {
    const raw = storage.getItem(storageKey(actorId, organizationId));
    if (raw == null) return null;
    const value = JSON.parse(raw) as {
      version?: unknown;
      actorId?: unknown;
      organizationId?: unknown;
      requestId?: unknown;
      payload?: unknown;
    };
    if (
      value.version !== 1
      || value.actorId !== actorId
      || value.organizationId !== organizationId
      || typeof value.requestId !== "string"
    ) {
      return null;
    }
    const normalizedRequestId = normalizeVenueCreateRequestId(value.requestId);
    const payload = cloneJsonObject(value.payload);
    if (
      !normalizedRequestId
      || !payload
      || payload.organizationId !== organizationId
      || payload.createIntent !== true
      || normalizeVenueCreateRequestId(
        typeof payload.createRequestId === "string" ? payload.createRequestId : null,
      ) !== normalizedRequestId
      || Object.hasOwn(payload, "venueId")
    ) {
      return null;
    }
    return {
      version: 1,
      actorId,
      organizationId,
      requestId: normalizedRequestId,
      payload: deepFreezeJson(payload) as VenueCreateRequestPayload,
    };
  } catch {
    return null;
  }
}

/** Corrupt or unreadable storage is conservatively treated as occupied. */
export function hasPendingVenueCreateRequestSlot(
  storage: CreateRequestStorage,
  actorId: string,
  organizationId: number,
): boolean {
  try {
    return storage.getItem(storageKey(actorId, organizationId)) != null;
  } catch {
    return true;
  }
}

/** Persist before URL mutation and POST. An unresolved body is immutable. */
export function persistPendingVenueCreateRequest(
  storage: CreateRequestStorage,
  request: PendingVenueCreateRequest,
): boolean {
  try {
    const key = storageKey(request.actorId, request.organizationId);
    const existingRaw = storage.getItem(key);
    if (existingRaw != null) {
      const existing = readPendingVenueCreateRequest(
        storage,
        request.actorId,
        request.organizationId,
      );
      return Boolean(existing && JSON.stringify(existing) === JSON.stringify(request));
    }
    const serialized = JSON.stringify(request);
    storage.setItem(key, serialized);
    return storage.getItem(key) === serialized;
  } catch {
    return false;
  }
}

/** Compare-and-clear so an old response cannot erase a newer operation. */
export function clearPendingVenueCreateRequest(
  storage: CreateRequestStorage,
  actorId: string,
  organizationId: number,
  expectedRequestId: string,
): boolean {
  try {
    const current = readPendingVenueCreateRequest(storage, actorId, organizationId);
    if (current?.requestId !== normalizeVenueCreateRequestId(expectedRequestId)) {
      return false;
    }
    const key = storageKey(actorId, organizationId);
    storage.removeItem(key);
    return storage.getItem(key) == null;
  } catch {
    return false;
  }
}

/** Explicit user-authorized removal, including an unreadable/corrupt slot. */
export function discardPendingVenueCreateRequest(
  storage: CreateRequestStorage,
  actorId: string,
  organizationId: number,
): boolean {
  try {
    const key = storageKey(actorId, organizationId);
    storage.removeItem(key);
    return storage.getItem(key) == null;
  } catch {
    return false;
  }
}
