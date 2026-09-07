/** One checklist write at a time keeps optimistic rollback from overwriting
 * another successful edit. The lock is synchronous, including rapid clicks. */
export function createChecklistWriteLock() {
  let busy = false;
  return {
    acquire() { if (busy) return false; busy = true; return true; },
    release() { busy = false; },
  };
}

export async function saveChecklistChange(path: string, method: "PATCH" | "DELETE", payload?: unknown, request = fetch) {
  const response = await request(path, {
    method,
    ...(payload == null ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
  });
  if (!response.ok) throw new Error("Checklist save failed");
}

export async function optimisticChecklistChange<T>(previous: T, next: T, commit: () => Promise<void>, change: (value: T) => void, failed: () => void) {
  change(next);
  try {
    await commit();
    return true;
  } catch {
    change(previous);
    failed();
    return false;
  }
}
