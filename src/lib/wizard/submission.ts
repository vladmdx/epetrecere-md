type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Submission = {
  id: string;
  ownerId: string | null;
  payload: object;
  state: "pending" | "complete";
  planId?: number;
};

export function wizardSubmissionKeys(adminMode = false) {
  const prefix = adminMode ? "admin-wizard" : "wizard";
  return { data: `${prefix}-data`, plan: `${prefix}-plan-id`, submission: `${prefix}-submission` };
}

function read(storage: StorageLike, adminMode: boolean): Submission | null {
  try {
    const value = JSON.parse(storage.getItem(wizardSubmissionKeys(adminMode).submission) || "null");
    return value && typeof value.id === "string" && value.payload && typeof value.payload === "object"
      && ["pending", "complete"].includes(value.state) ? value : null;
  } catch { return null; }
}

/** Called only by the explicit final submit action, never by draft autosave. */
export function beginWizardSubmission(payload: object, ownerId: string | null, adminMode = false, storage: StorageLike = sessionStorage): Submission {
  const keys = wizardSubmissionKeys(adminMode);
  const previous = read(storage, adminMode);
  if (previous && (!previous.ownerId || previous.ownerId === ownerId)
    && JSON.stringify(previous.payload) === JSON.stringify(payload)) return previous;
  const submission: Submission = { id: crypto.randomUUID(), ownerId, payload, state: "pending" };
  storage.setItem(keys.data, JSON.stringify(payload));
  storage.setItem(keys.submission, JSON.stringify(submission));
  storage.removeItem(keys.plan);
  return submission;
}

export function hasPendingWizardSubmission(ownerId: string, adminMode = false, storage: StorageLike = sessionStorage): boolean {
  const submission = read(storage, adminMode);
  return !!submission && submission.state === "pending" && (!submission.ownerId || submission.ownerId === ownerId);
}

export function clearWizardSubmission(adminMode = false, storage: StorageLike = sessionStorage): void {
  const keys = wizardSubmissionKeys(adminMode);
  storage.removeItem(keys.submission);
  storage.removeItem(keys.plan);
}

// Shared across StrictMode effect replay, remounts and both auth/results callers.
const inFlight = new Map<string, Promise<number | null>>();

/** A successful response consumes the draft; failures retain the SAME retry key. */
export function submitPendingWizard(ownerId: string, adminMode = false, storage: StorageLike = sessionStorage, fetcher: typeof fetch = fetch): Promise<number | null> {
  const submission = read(storage, adminMode);
  if (!submission || (submission.ownerId && submission.ownerId !== ownerId)) return Promise.resolve(null);
  if (submission.state === "complete") return Promise.resolve(submission.planId ?? null);
  const keys = wizardSubmissionKeys(adminMode);
  submission.ownerId = ownerId;
  storage.setItem(keys.submission, JSON.stringify(submission));
  const flightKey = `${ownerId}:${submission.id}`;
  const existing = inFlight.get(flightKey);
  if (existing) return existing;
  const promise = (async () => {
    const res = await fetcher("/api/event-plans/from-wizard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...submission.payload, submissionId: submission.id }),
    });
    if (!res.ok) throw new Error(`Wizard submission failed (${res.status})`);
    const data = await res.json();
    const planId = data?.plan?.id;
    if (!Number.isInteger(planId) || planId <= 0) throw new Error("Missing plan in wizard response");
    // Never erase a newer draft prepared while this request was in flight.
    if (read(storage, adminMode)?.id === submission.id) {
      storage.setItem(keys.submission, JSON.stringify({ ...submission, state: "complete", planId }));
      storage.setItem(keys.plan, String(planId));
      // Admin results keep displaying the questionnaire. Its completed
      // receipt still prevents repeat creation on refresh or effect replay.
      if (!adminMode) storage.removeItem(keys.data);
    }
    return planId as number;
  })().finally(() => { inFlight.delete(flightKey); });
  inFlight.set(flightKey, promise);
  return promise;
}
