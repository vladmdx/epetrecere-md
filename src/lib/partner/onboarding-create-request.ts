import { localizePath, type AppLocale } from "@/lib/i18n/routing";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ORGANIZATION_CREATE_STORAGE_KEY = "epetrecere:organization-create:v3";
export const HALL_CREATE_STORAGE_KEY = "epetrecere:hall-create:v1";

export type OrganizationCreateProfile = Readonly<{
  displayName: string;
  type: "individual" | "sole_trader" | "company";
  legalName: string | null;
  idNumber: string | null;
  legalAddress: string | null;
  billingEmail: string | null;
  billingPhone: string | null;
}>;

export type PendingOrganizationCreateRequest = OrganizationCreateProfile & Readonly<{
  actorId: string;
  requestId: string;
}>;

type CreateRequestStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The exact JSON body sent to the Hall collection route. */
export type HallCreateRequestPayload = Readonly<
  Record<string, unknown> & { hallCreateRequestId: string }
>;

export type PendingHallCreateRequest = Readonly<{
  version: 1;
  actorId: string;
  venueId: number;
  requestId: string;
  payload: HallCreateRequestPayload;
}>;

export type RecoverableVenueCreate = {
  id: number;
  onboardingSubmissionId?: string | null;
  nameRo?: string | null;
  phone?: string | null;
  city?: string | null;
  address?: string | null;
  descriptionRo?: string | null;
  nameRu?: string | null;
  nameEn?: string | null;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
};

export function normalizeVenueCreateRequestId(raw: string | null): string | null {
  return raw && UUID_RE.test(raw) ? raw.toLowerCase() : null;
}

export function normalizeOrganizationCreateRequestId(raw: string | null): string | null {
  return raw && UUID_RE.test(raw) ? raw.toLowerCase() : null;
}

export function normalizeHallCreateRequestId(raw: string | null): string | null {
  return raw && UUID_RE.test(raw) ? raw.toLowerCase() : null;
}

/** Freeze the exact normalized payload that will be hashed by the server. */
export function newPendingOrganizationCreateRequest(
  displayName: string,
  requestId: string,
  actorId: string,
): PendingOrganizationCreateRequest | null {
  return newPendingOrganizationProfileCreateRequest(
    { displayName, type: "company" },
    requestId,
    actorId,
  );
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Freeze every field that contributes to the server-side create hash. This is
 * used by the full onboarding form; a retry must not combine the old key with
 * values edited after an ambiguous response.
 */
export function newPendingOrganizationProfileCreateRequest(
  profile: Partial<OrganizationCreateProfile> & Pick<OrganizationCreateProfile, "displayName" | "type">,
  requestId: string,
  actorId: string,
): PendingOrganizationCreateRequest | null {
  const normalizedRequestId = normalizeOrganizationCreateRequestId(requestId);
  const normalizedDisplayName = profile.displayName.trim() || "Organizație nouă";
  if (
    !normalizedRequestId
    || !actorId.trim()
    || !["individual", "sole_trader", "company"].includes(profile.type)
    || normalizedDisplayName.length < 2
    || normalizedDisplayName.length > 200
  ) {
    return null;
  }
  return {
    actorId: actorId.trim(),
    requestId: normalizedRequestId,
    displayName: normalizedDisplayName,
    type: profile.type,
    legalName: nullableText(profile.legalName),
    idNumber: nullableText(profile.idNumber),
    legalAddress: nullableText(profile.legalAddress),
    billingEmail: nullableText(profile.billingEmail),
    billingPhone: nullableText(profile.billingPhone),
  };
}

/** Strip browser-only actor metadata before sending the exact frozen body. */
export function organizationCreateRequestPayload(
  request: PendingOrganizationCreateRequest,
) {
  return {
    organizationCreateRequestId: request.requestId,
    displayName: request.displayName,
    type: request.type,
    legalName: request.legalName,
    idNumber: request.idNumber,
    legalAddress: request.legalAddress,
    billingEmail: request.billingEmail,
    billingPhone: request.billingPhone,
  };
}

function organizationCreateStorageKey(actorId: string): string {
  return `${ORGANIZATION_CREATE_STORAGE_KEY}:${encodeURIComponent(actorId)}`;
}

export function readPendingOrganizationCreateRequest(
  storage: CreateRequestStorage,
  actorId: string,
): PendingOrganizationCreateRequest | null {
  try {
    const value = JSON.parse(storage.getItem(organizationCreateStorageKey(actorId)) || "null") as {
      actorId?: unknown;
      requestId?: unknown;
      displayName?: unknown;
      type?: unknown;
      legalName?: unknown;
      idNumber?: unknown;
      legalAddress?: unknown;
      billingEmail?: unknown;
      billingPhone?: unknown;
    } | null;
    if (
      !value
      || value.actorId !== actorId
      || typeof value.requestId !== "string"
      || typeof value.displayName !== "string"
      || !["individual", "sole_trader", "company"].includes(String(value.type))
    ) {
      return null;
    }
    return newPendingOrganizationProfileCreateRequest({
      displayName: value.displayName,
      type: value.type as OrganizationCreateProfile["type"],
      legalName: nullableText(value.legalName),
      idNumber: nullableText(value.idNumber),
      legalAddress: nullableText(value.legalAddress),
      billingEmail: nullableText(value.billingEmail),
      billingPhone: nullableText(value.billingPhone),
    }, value.requestId, actorId);
  } catch {
    return null;
  }
}

/** Corrupt or unreadable organization storage is conservatively occupied. */
export function hasPendingOrganizationCreateRequestSlot(
  storage: CreateRequestStorage,
  actorId: string,
): boolean {
  try {
    return storage.getItem(organizationCreateStorageKey(actorId)) != null;
  } catch {
    return true;
  }
}

/** Persist before POST. False means the create must not be sent. */
export function persistPendingOrganizationCreateRequest(
  storage: CreateRequestStorage,
  request: PendingOrganizationCreateRequest,
): boolean {
  try {
    const key = organizationCreateStorageKey(request.actorId);
    const existingRaw = storage.getItem(key);
    if (existingRaw != null) {
      const existing = readPendingOrganizationCreateRequest(storage, request.actorId);
      // The first durable body is immutable. Reusing even the same UUID with
      // changed fields would make the server reject the retry as a key reuse.
      return Boolean(existing && JSON.stringify(existing) === JSON.stringify(request));
    }
    storage.setItem(key, JSON.stringify(request));
    const persisted = readPendingOrganizationCreateRequest(storage, request.actorId);
    return JSON.stringify(persisted) === JSON.stringify(request);
  } catch {
    return false;
  }
}

/** A stale response must never erase a newer request stored by the page. */
export function clearPendingOrganizationCreateRequest(
  storage: CreateRequestStorage,
  actorId: string,
  expectedRequestId: string,
): boolean {
  try {
    const current = readPendingOrganizationCreateRequest(storage, actorId);
    if (current?.requestId !== normalizeOrganizationCreateRequestId(expectedRequestId)) {
      return false;
    }
    const key = organizationCreateStorageKey(actorId);
    storage.removeItem(key);
    return storage.getItem(key) == null;
  } catch {
    return false;
  }
}

/** Explicit user-authorized removal, including an unreadable/corrupt slot. */
export function discardPendingOrganizationCreateRequest(
  storage: CreateRequestStorage,
  actorId: string,
): boolean {
  try {
    const key = organizationCreateStorageKey(actorId);
    storage.removeItem(key);
    return storage.getItem(key) == null;
  } catch {
    return false;
  }
}

function hallCreateStorageKey(actorId: string, venueId: number): string {
  return `${HALL_CREATE_STORAGE_KEY}:${encodeURIComponent(actorId)}:${venueId}`;
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

/**
 * Freeze one exact Hall POST body. Browser-only actor/scope metadata stays
 * outside `payload`; the request UUID inside the body is canonicalized here.
 */
export function newPendingHallCreateRequest(
  actorId: string,
  venueId: number,
  requestId: string,
  payload: Readonly<Record<string, unknown>>,
): PendingHallCreateRequest | null {
  const normalizedActorId = actorId.trim();
  const normalizedRequestId = normalizeHallCreateRequestId(requestId);
  const clonedPayload = cloneJsonObject(payload);
  if (
    !normalizedActorId
    || !Number.isSafeInteger(venueId)
    || venueId <= 0
    || !normalizedRequestId
    || !clonedPayload
  ) {
    return null;
  }
  const exactPayload = cloneJsonObject({
    ...clonedPayload,
    hallCreateRequestId: normalizedRequestId,
  });
  if (!exactPayload) return null;
  return {
    version: 1,
    actorId: normalizedActorId,
    venueId,
    requestId: normalizedRequestId,
    payload: deepFreezeJson(exactPayload) as HallCreateRequestPayload,
  };
}

/** Strip browser-only metadata and return an independently frozen Hall POST body. */
export function hallCreateRequestPayload(
  request: PendingHallCreateRequest,
): HallCreateRequestPayload {
  const payload = cloneJsonObject(request.payload);
  if (!payload) throw new TypeError("Invalid pending Hall create payload");
  return deepFreezeJson(payload) as HallCreateRequestPayload;
}

export function readPendingHallCreateRequest(
  storage: CreateRequestStorage,
  actorId: string,
  venueId: number,
): PendingHallCreateRequest | null {
  try {
    const raw = storage.getItem(hallCreateStorageKey(actorId, venueId));
    if (raw == null) return null;
    const value = JSON.parse(raw) as {
      version?: unknown;
      actorId?: unknown;
      venueId?: unknown;
      requestId?: unknown;
      payload?: unknown;
    };
    if (
      value.version !== 1
      || value.actorId !== actorId
      || value.venueId !== venueId
      || typeof value.requestId !== "string"
    ) {
      return null;
    }
    const normalizedRequestId = normalizeHallCreateRequestId(value.requestId);
    const payload = cloneJsonObject(value.payload);
    if (
      !normalizedRequestId
      || !payload
      || normalizeHallCreateRequestId(
        typeof payload.hallCreateRequestId === "string"
          ? payload.hallCreateRequestId
          : null,
      ) !== normalizedRequestId
    ) {
      return null;
    }
    return {
      version: 1,
      actorId,
      venueId,
      requestId: normalizedRequestId,
      payload: deepFreezeJson(payload) as HallCreateRequestPayload,
    };
  } catch {
    return null;
  }
}

/**
 * Conservatively report an occupied slot, including corrupt data or an
 * unavailable storage backend. Creation must stay blocked until explicit
 * discard succeeds; otherwise an unknown in-flight request could be replaced.
 */
export function hasPendingHallCreateRequestSlot(
  storage: CreateRequestStorage,
  actorId: string,
  venueId: number,
): boolean {
  try {
    return storage.getItem(hallCreateStorageKey(actorId, venueId)) != null;
  } catch {
    return true;
  }
}

/** Persist before URL mutation and POST. An existing slot is immutable. */
export function persistPendingHallCreateRequest(
  storage: CreateRequestStorage,
  request: PendingHallCreateRequest,
): boolean {
  try {
    const key = hallCreateStorageKey(request.actorId, request.venueId);
    const existingRaw = storage.getItem(key);
    if (existingRaw != null) {
      const existing = readPendingHallCreateRequest(
        storage,
        request.actorId,
        request.venueId,
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

/** Compare-and-clear: a stale response cannot erase another Hall operation. */
export function clearPendingHallCreateRequest(
  storage: CreateRequestStorage,
  actorId: string,
  venueId: number,
  expectedRequestId: string,
): boolean {
  try {
    const current = readPendingHallCreateRequest(storage, actorId, venueId);
    if (current?.requestId !== normalizeHallCreateRequestId(expectedRequestId)) {
      return false;
    }
    const key = hallCreateStorageKey(actorId, venueId);
    storage.removeItem(key);
    return storage.getItem(key) == null;
  } catch {
    return false;
  }
}

/** Explicit user-authorized removal, including an unreadable/corrupt slot. */
export function discardPendingHallCreateRequest(
  storage: CreateRequestStorage,
  actorId: string,
  venueId: number,
): boolean {
  try {
    const key = hallCreateStorageKey(actorId, venueId);
    storage.removeItem(key);
    return storage.getItem(key) == null;
  } catch {
    return false;
  }
}

export function findVenueCreateRetry<T extends RecoverableVenueCreate>(
  venues: readonly T[],
  createRequestId: string | null,
): T | null {
  if (!createRequestId) return null;
  return venues.find((venue) =>
    venue.onboardingSubmissionId?.toLowerCase() === createRequestId) ?? null;
}

export function venueOnboardingUrl(
  locale: AppLocale,
  params: URLSearchParams,
): string {
  const query = params.toString();
  const path = localizePath("/dashboard/venue-onboarding", locale);
  return query ? `${path}?${query}` : path;
}
