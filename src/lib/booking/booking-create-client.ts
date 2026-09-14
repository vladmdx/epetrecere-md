/**
 * Browser-side lost-response protection for POST /api/booking-requests.
 *
 * One unresolved request is kept per actor + target + optional event plan in
 * sessionStorage. A retry always sends both the same UUID and the exact JSON
 * body frozen before the first network call. This module deliberately does
 * not infer success from a timeout/5xx response; the server-side idempotency
 * barrier resolves that ambiguity on the next attempt.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const BOOKING_CREATE_STORAGE_PREFIX = "epetrecere:booking-create:v1";

type BookingCreateStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type JsonObject = Readonly<Record<string, unknown>>;

export type BookingCreateScopeInput = Readonly<{
  actorId?: string | null;
  artistId?: number | null;
  venueId?: number | null;
  eventPlanId?: number | null;
}>;

export type PendingBookingCreateRequest = Readonly<{
  version: 1;
  scope: string;
  requestId: string;
  payload: JsonObject;
}>;

export class BookingCreatePersistenceError extends Error {
  constructor() {
    super("Booking request could not be saved safely before sending");
    this.name = "BookingCreatePersistenceError";
  }
}

function positiveInteger(value: number | null | undefined): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

/** Stable browser slot. sessionStorage already separates browser tabs. */
export function bookingCreateScope(input: BookingCreateScopeInput): string {
  const hasArtist = positiveInteger(input.artistId);
  const hasVenue = positiveInteger(input.venueId);
  if (hasArtist === hasVenue) {
    throw new TypeError("A booking create scope needs exactly one target");
  }
  if (input.eventPlanId != null && !positiveInteger(input.eventPlanId)) {
    throw new TypeError("Invalid booking event-plan scope");
  }
  return JSON.stringify([
    "v1",
    input.actorId?.trim() || "anonymous",
    hasArtist ? "artist" : "venue",
    hasArtist ? input.artistId : input.venueId,
    input.eventPlanId ?? null,
  ]);
}

function storageKey(scope: string): string {
  return `${BOOKING_CREATE_STORAGE_PREFIX}:${encodeURIComponent(scope)}`;
}

function normalizeRequestId(value: string | null): string | null {
  return value && UUID_RE.test(value) ? value.toLowerCase() : null;
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

export function newPendingBookingCreateRequest(
  scope: string,
  requestId: string,
  payload: JsonObject,
): PendingBookingCreateRequest | null {
  const normalizedRequestId = normalizeRequestId(requestId);
  const clonedPayload = cloneJsonObject(payload);
  if (!scope || !normalizedRequestId || !clonedPayload) return null;
  return {
    version: 1,
    scope,
    requestId: normalizedRequestId,
    payload: deepFreezeJson(clonedPayload),
  };
}

export function readPendingBookingCreateRequest(
  storage: BookingCreateStorage,
  scope: string,
): PendingBookingCreateRequest | null {
  try {
    const raw = storage.getItem(storageKey(scope));
    if (raw == null) return null;
    const value = JSON.parse(raw) as Partial<PendingBookingCreateRequest>;
    const normalizedRequestId = normalizeRequestId(
      typeof value.requestId === "string" ? value.requestId : null,
    );
    const payload = cloneJsonObject(value.payload);
    if (
      value.version !== 1
      || value.scope !== scope
      || !normalizedRequestId
      || !payload
    ) {
      return null;
    }
    return {
      version: 1,
      scope,
      requestId: normalizedRequestId,
      payload: deepFreezeJson(payload),
    };
  } catch {
    return null;
  }
}

function hasPendingSlot(storage: BookingCreateStorage, scope: string): boolean {
  try {
    return storage.getItem(storageKey(scope)) != null;
  } catch {
    return true;
  }
}

/** Persist before POST. Existing unresolved bodies are immutable. */
export function persistPendingBookingCreateRequest(
  storage: BookingCreateStorage,
  request: PendingBookingCreateRequest,
): boolean {
  try {
    const key = storageKey(request.scope);
    const existingRaw = storage.getItem(key);
    if (existingRaw != null) {
      const existing = readPendingBookingCreateRequest(storage, request.scope);
      return Boolean(existing && JSON.stringify(existing) === JSON.stringify(request));
    }
    const serialized = JSON.stringify(request);
    storage.setItem(key, serialized);
    return storage.getItem(key) === serialized;
  } catch {
    return false;
  }
}

/** Compare-and-clear so a stale response cannot erase a newer operation. */
export function clearPendingBookingCreateRequest(
  storage: BookingCreateStorage,
  scope: string,
  expectedRequestId: string,
): boolean {
  try {
    const current = readPendingBookingCreateRequest(storage, scope);
    if (current?.requestId !== normalizeRequestId(expectedRequestId)) return false;
    const key = storageKey(scope);
    storage.removeItem(key);
    return storage.getItem(key) == null;
  } catch {
    return false;
  }
}

/** A shared in-flight response may be acknowledged by more than one caller. */
function pendingBookingCreateRequestAcknowledged(
  storage: BookingCreateStorage,
  scope: string,
  expectedRequestId: string,
): boolean {
  return clearPendingBookingCreateRequest(storage, scope, expectedRequestId)
    || !hasPendingSlot(storage, scope);
}

/** 408/425/429 and 5xx can all leave the client unsure about server commit. */
export function isAmbiguousBookingCreateStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 425 || status === 429 || status >= 500;
}

export class BookingCreateHallConflictError extends Error {
  readonly code = "HALL_IDEMPOTENCY_CONFLICT";

  constructor() {
    super("HALL_IDEMPOTENCY_CONFLICT");
    this.name = "BookingCreateHallConflictError";
  }
}

function payloadHallId(payload: JsonObject): number | null {
  const value = payload.hallId;
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}

/** Hall frozen on an unresolved retry, if the pending body named one. */
export function pendingBookingCreateHallId(
  storage: BookingCreateStorage,
  scope: string,
): number | null {
  const pending = readPendingBookingCreateRequest(storage, scope);
  return pending ? payloadHallId(pending.payload) : null;
}

function preparePendingBookingCreateRequest(
  storage: BookingCreateStorage,
  scope: string,
  payload: JsonObject,
  createRequestId: () => string,
): PendingBookingCreateRequest {
  const existing = readPendingBookingCreateRequest(storage, scope);
  if (existing) {
    const existingHallId = payloadHallId(existing.payload);
    const nextHallId = payloadHallId(payload);
    if (existingHallId != null && nextHallId != null && existingHallId !== nextHallId) {
      throw new BookingCreateHallConflictError();
    }
    return existing;
  }
  // A corrupt/unreadable slot is an unresolved request, not permission to
  // overwrite its identity and possibly create a duplicate booking.
  if (hasPendingSlot(storage, scope)) throw new BookingCreatePersistenceError();
  const request = newPendingBookingCreateRequest(scope, createRequestId(), payload);
  if (!request || !persistPendingBookingCreateRequest(storage, request)) {
    throw new BookingCreatePersistenceError();
  }
  return request;
}

const inFlight = new Map<string, Promise<Response>>();

export type BookingCreateSuccess = Readonly<{
  id: number;
}>;

export type BookingCreateSubmission =
  | Readonly<{
      ok: true;
      response: Response;
      booking: BookingCreateSuccess;
      requestId: string;
    }>
  | Readonly<{
      ok: false;
      response: Response;
      requestId: string;
    }>;

/**
 * A 2xx header alone is not proof that the browser received the committed
 * result. For example, the response body can be truncated after the server
 * commits. Treat only the public, typed booking identity as acknowledgement.
 */
function bookingCreateSuccess(value: unknown): BookingCreateSuccess | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = (value as { id?: unknown }).id;
  return Number.isSafeInteger(id) && Number(id) > 0 ? { id: Number(id) } : null;
}

export class BookingCreateInvalidSuccessError extends Error {
  readonly code = "BOOKING_CREATE_INVALID_SUCCESS";

  constructor() {
    super("Booking request response could not be verified; retry safely");
    this.name = "BookingCreateInvalidSuccessError";
  }
}

export type SubmitBookingCreateOptions = Readonly<{
  scope: string;
  payload: JsonObject;
  storage?: BookingCreateStorage;
  fetcher?: typeof fetch;
  createRequestId?: () => string;
}>;

/**
 * POST the pending body. Parallel/StrictMode callers share one HTTP request;
 * every consumer receives its own Response clone. Deterministic 4xx responses
 * clear the slot. A 2xx response clears it only after a cloned body parses as
 * the public success shape; malformed/truncated success bodies remain safe to
 * retry with the same request UUID and frozen payload.
 */
export async function submitBookingCreateRequest({
  scope,
  payload,
  storage = window.sessionStorage,
  fetcher = fetch,
  createRequestId = () => crypto.randomUUID(),
}: SubmitBookingCreateOptions): Promise<BookingCreateSubmission> {
  const pending = preparePendingBookingCreateRequest(
    storage,
    scope,
    payload,
    createRequestId,
  );
  const flightKey = `${scope}:${pending.requestId}`;
  let flight = inFlight.get(flightKey);
  if (!flight) {
    flight = (async () => {
      const response = await fetcher("/api/booking-requests", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": pending.requestId,
        },
        body: JSON.stringify(pending.payload),
      });
      if (!response.ok && !isAmbiguousBookingCreateStatus(response.status)) {
        if (!pendingBookingCreateRequestAcknowledged(storage, scope, pending.requestId)) {
          throw new BookingCreatePersistenceError();
        }
      }
      return response;
    })();
    inFlight.set(flightKey, flight);
    void flight.finally(() => {
      if (inFlight.get(flightKey) === flight) inFlight.delete(flightKey);
    }).catch(() => undefined);
  }
  const response = (await flight).clone();
  if (!response.ok) {
    return { ok: false, response, requestId: pending.requestId };
  }

  let responsePayload: unknown;
  try {
    responsePayload = await response.clone().json();
  } catch {
    throw new BookingCreateInvalidSuccessError();
  }
  const booking = bookingCreateSuccess(responsePayload);
  if (!booking) throw new BookingCreateInvalidSuccessError();

  // The UUID was validated before persistence. Compare-and-clear ensures a
  // late response can never erase a newer operation in the same browser slot.
  if (!pendingBookingCreateRequestAcknowledged(storage, scope, pending.requestId)) {
    // The server may already have committed, but acknowledging success while
    // the exact frozen envelope survives would make a later form submission
    // replay the old booking. Retry remains safe under the same UUID until the
    // compare-and-clear succeeds.
    throw new BookingCreatePersistenceError();
  }
  return { ok: true, response, booking, requestId: pending.requestId };
}
