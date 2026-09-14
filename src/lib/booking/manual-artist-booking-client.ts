/** Lost-response protection for POST /api/artist-bookings. */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const STORAGE_PREFIX = "epetrecere:manual-artist-booking:v1";

type JsonObject = Readonly<Record<string, unknown>>;
type BookingStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

type PendingManualArtistBooking = Readonly<{
  version: 1;
  scope: string;
  requestId: string;
  payload: JsonObject;
}>;

export class ManualArtistBookingPersistenceError extends Error {
  constructor() {
    super("Manual booking could not be saved safely before sending");
    this.name = "ManualArtistBookingPersistenceError";
  }
}

export class ManualArtistBookingInvalidSuccessError extends Error {
  readonly code = "MANUAL_ARTIST_BOOKING_INVALID_SUCCESS";

  constructor() {
    super("Răspuns incomplet de la server. Încearcă din nou în siguranță.");
    this.name = "ManualArtistBookingInvalidSuccessError";
  }
}

function scopeFor(actorId: string, artistId: number): string {
  if (!actorId.trim()) {
    throw new TypeError("Manual booking scope needs an actor");
  }
  if (!Number.isSafeInteger(artistId) || artistId <= 0) {
    throw new TypeError("Invalid artist booking scope");
  }
  return JSON.stringify(["v1", actorId.trim(), "artist", artistId]);
}

function storageKey(scope: string): string {
  return `${STORAGE_PREFIX}:${encodeURIComponent(scope)}`;
}

function clonePayload(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    const clone = JSON.parse(JSON.stringify(value)) as unknown;
    return clone && typeof clone === "object" && !Array.isArray(clone)
      ? (clone as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function readPending(
  storage: BookingStorage,
  scope: string,
): PendingManualArtistBooking | null {
  try {
    const raw = storage.getItem(storageKey(scope));
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as Partial<PendingManualArtistBooking>;
    const payload = clonePayload(parsed.payload);
    if (
      parsed.version !== 1 ||
      parsed.scope !== scope ||
      typeof parsed.requestId !== "string" ||
      !UUID_RE.test(parsed.requestId) ||
      !payload
    ) {
      return null;
    }
    return {
      version: 1,
      scope,
      requestId: parsed.requestId.toLowerCase(),
      payload,
    };
  } catch {
    return null;
  }
}

function hasPendingSlot(storage: BookingStorage, scope: string): boolean {
  try {
    return storage.getItem(storageKey(scope)) != null;
  } catch {
    // An unreadable store is unresolved state, never permission to overwrite
    // or acknowledge a request whose server result may already exist.
    return true;
  }
}

function preparePending(
  storage: BookingStorage,
  scope: string,
  payload: JsonObject,
  createRequestId: () => string,
): PendingManualArtistBooking {
  const key = storageKey(scope);
  const existingRaw = storage.getItem(key);
  if (existingRaw != null) {
    const existing = readPending(storage, scope);
    if (!existing) throw new ManualArtistBookingPersistenceError();
    return existing;
  }

  const requestId = createRequestId().toLowerCase();
  const frozenPayload = clonePayload(payload);
  if (!UUID_RE.test(requestId) || !frozenPayload) {
    throw new ManualArtistBookingPersistenceError();
  }
  const pending: PendingManualArtistBooking = {
    version: 1,
    scope,
    requestId,
    payload: frozenPayload,
  };
  const serialized = JSON.stringify(pending);
  try {
    storage.setItem(key, serialized);
    if (storage.getItem(key) !== serialized) {
      throw new ManualArtistBookingPersistenceError();
    }
  } catch (error) {
    if (error instanceof ManualArtistBookingPersistenceError) throw error;
    throw new ManualArtistBookingPersistenceError();
  }
  return pending;
}

function clearPending(
  storage: BookingStorage,
  scope: string,
  requestId: string,
): boolean {
  try {
    const current = readPending(storage, scope);
    if (current?.requestId !== requestId) return false;
    const key = storageKey(scope);
    storage.removeItem(key);
    return storage.getItem(key) == null;
  } catch {
    return false;
  }
}

/** A shared response may observe a slot already cleared by its first waiter. */
function pendingRequestAcknowledged(
  storage: BookingStorage,
  scope: string,
  requestId: string,
): boolean {
  return clearPending(storage, scope, requestId)
    || !hasPendingSlot(storage, scope);
}

function isAmbiguousStatus(status: number): boolean {
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

async function hasValidBookingSuccess(response: Response): Promise<boolean> {
  try {
    const value = await response.clone().json() as { id?: unknown } | null;
    return Number.isSafeInteger(value?.id) && Number(value?.id) > 0;
  } catch {
    return false;
  }
}

const inFlight = new Map<string, Promise<Response>>();

export async function submitManualArtistBooking(options: Readonly<{
  actorId: string;
  artistId: number;
  payload: JsonObject;
  storage?: BookingStorage;
  fetcher?: typeof fetch;
  createRequestId?: () => string;
}>): Promise<Response> {
  const storage = options.storage ?? window.sessionStorage;
  const scope = scopeFor(options.actorId, options.artistId);
  const pending = preparePending(
    storage,
    scope,
    options.payload,
    options.createRequestId ?? (() => crypto.randomUUID()),
  );
  const flightKey = `${scope}:${pending.requestId}`;
  let flight = inFlight.get(flightKey);
  if (!flight) {
    flight = (async () => {
      const response = await (options.fetcher ?? fetch)(
        "/api/artist-bookings",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": pending.requestId,
          },
          body: JSON.stringify(pending.payload),
        },
      );
      if (!response.ok) {
        if (!isAmbiguousStatus(response.status)) {
          if (!pendingRequestAcknowledged(storage, scope, pending.requestId)) {
            throw new ManualArtistBookingPersistenceError();
          }
        }
        return response;
      }
      if (!await hasValidBookingSuccess(response)) {
        throw new ManualArtistBookingInvalidSuccessError();
      }
      // Only a typed booking id acknowledges the commit. A truncated 2xx is
      // ambiguous and must replay the same UUID/frozen body.
      if (!pendingRequestAcknowledged(storage, scope, pending.requestId)) {
        throw new ManualArtistBookingPersistenceError();
      }
      return response;
    })();
    inFlight.set(flightKey, flight);
    void flight
      .finally(() => {
        if (inFlight.get(flightKey) === flight) inFlight.delete(flightKey);
      })
      .catch(() => undefined);
  }
  return (await flight).clone();
}
