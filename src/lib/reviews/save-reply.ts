type SavedReply = { id: number; reply: string | null; replyAt: string | null };
type Result = { status: "saved"; review?: SavedReply } | { status: "rejected" } | { status: "unknown" };

async function boundedFetch(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fetch(url, { ...init, signal: controller.signal }).then(async response => ({
        response, data: await response.json().catch(() => null),
      })),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("request_timeout")); }, timeoutMs);
      }),
    ]);
  } finally { clearTimeout(timer); }
}

/** Never auto-retries a write. Unknown outcomes are reconciled through the owner-only GET. */
export async function saveReviewReply(id: number, reply: string, options: { verifyBeforeWrite?: boolean; timeoutMs?: number } = {}): Promise<Result> {
  const url = `/api/reviews/${id}`;
  const timeout = options.timeoutMs ?? 20_000;
  const readOwn = async (): Promise<SavedReply | null> => {
    try {
      const { response, data: value } = await boundedFetch(url, { cache: "no-store" }, Math.min(timeout, 10_000));
      if (!response.ok) return null;
      return value?.id === id && (typeof value.reply === "string" || value.reply === null)
        && (typeof value.replyAt === "string" || value.replyAt === null)
        ? { id, reply: value.reply, replyAt: value.replyAt } : null;
    } catch { return null; }
  };
  if (options.verifyBeforeWrite) {
    const current = await readOwn();
    if (!current) return { status: "unknown" };
    if (current.reply === reply) return { status: "saved", review: current };
  }
  try {
    const { response, data } = await boundedFetch(url, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reply }),
    }, timeout);
    if (response.ok && data?.success === true) return { status: "saved" };
    if ([400, 401, 403, 404].includes(response.status)) return { status: "rejected" };
  } catch { /* Timeout/network loss does not prove that the write failed. */ }
  const current = await readOwn();
  return current?.reply === reply ? { status: "saved", review: current } : { status: "unknown" };
}
