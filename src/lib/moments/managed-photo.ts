import { del, list } from "@vercel/blob";

export interface PhotoPlanScope { id: number; momentsSlug?: string | null }

/** A database URL alone is not ownership evidence. Only server-created photo
 * namespaces can be checked against the token's Blob store. Legacy generic
 * uploads remain displayable, but never authorize a fetch or blob deletion. */
export function managedPhotoPath(raw: string, plan: PhotoPlanScope): string | null {
  if (!Number.isSafeInteger(plan.id) || plan.id < 1) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash
    || !/^[a-z0-9]+\.public\.blob\.vercel-storage\.com$/.test(url.hostname)
    || raw !== url.href) return null;
  const prefixes = [`/event-photos/${plan.id}/`];
  if (plan.momentsSlug && /^[a-zA-Z0-9_-]+$/.test(plan.momentsSlug)) prefixes.push(`/moments/${plan.momentsSlug}/`);
  const prefix = prefixes.find(candidate => url.pathname.startsWith(candidate));
  if (!prefix || !/^[a-zA-Z0-9_-]+\.(?:webp|png|jpe?g|gif)$/.test(url.pathname.slice(prefix.length))) return null;
  return url.pathname.slice(1);
}

/** list() is token/store-scoped. A public hostname or matching pathname in a
 * foreign store is insufficient; both returned URL and pathname must match. */
export async function verifyManagedPhoto(raw: string, plan: PhotoPlanScope) {
  const pathname = managedPhotoPath(raw, plan);
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!pathname || !token) return null;
  try {
    const result = await list({ prefix: pathname, limit: 1, token, abortSignal: AbortSignal.timeout(5_000) });
    const blob = result.blobs.find(item => item.pathname === pathname && item.url === raw);
    return blob ? { url: blob.url, size: blob.size } : null;
  } catch { return null; }
}

export async function deleteManagedPhoto(raw: string, plan: PhotoPlanScope): Promise<boolean> {
  const photo = await verifyManagedPhoto(raw, plan);
  if (!photo) return false;
  try {
    await del(photo.url, { token: process.env.BLOB_READ_WRITE_TOKEN, abortSignal: AbortSignal.timeout(5_000) });
    return true;
  } catch { return false; } // Never log user URLs, credentials or storage errors.
}

/** Bound the response stream itself, not just Content-Length or headers. */
export async function fetchManagedPhotoBytes(url: string, maxBytes: number, timeoutMs = 8_000): Promise<Uint8Array | null> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) return null;
  const controller = new AbortController();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = async () => {
    const response = await fetch(url, { redirect: "error", signal: controller.signal });
    if (!response.ok || !response.body) return null;
    const length = Number(response.headers.get("content-length"));
    if (Number.isFinite(length) && length > maxBytes) return null;
    if (!/^image\/(?:webp|png|jpeg|gif)(?:;|$)/i.test(response.headers.get("content-type") ?? "")) return null;
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > maxBytes) return null;
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return bytes;
  };
  try {
    return await Promise.race([work(), new Promise<null>(resolve => {
      timer = setTimeout(() => { controller.abort(); resolve(null); }, timeoutMs);
    })]);
  } catch { return null; }
  finally {
    clearTimeout(timer);
    controller.abort();
    void reader?.cancel().catch(() => undefined);
  }
}
