import { del, get, list, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";

export interface PhotoPlanScope { id: number; momentsSlug?: string | null }

function photoBlobUrl(raw: string): URL | null {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash
    || !/^[a-z0-9]+\.(?:public|private)\.blob\.vercel-storage\.com$/.test(url.hostname)
    || raw !== url.href) return null;
  return url;
}

function storageToken(url: URL): string | undefined {
  return url.hostname.includes(".private.")
    ? process.env.MOMENTS_BLOB_READ_WRITE_TOKEN : process.env.BLOB_READ_WRITE_TOKEN;
}

/** Fail closed: a missing private store never turns personal photos public. */
export async function storePrivatePhoto(bytes: Buffer, planId: number): Promise<string> {
  const token = process.env.MOMENTS_BLOB_READ_WRITE_TOKEN;
  if (!token || !Number.isSafeInteger(planId) || planId < 1) throw new Error("Private photo storage unavailable");
  const blob = await put(`event-photos/${planId}/${randomUUID()}.webp`, bytes, {
    token, access: "private", contentType: "image/webp", addRandomSuffix: false,
    abortSignal: AbortSignal.timeout(15_000),
  });
  if (!photoBlobUrl(blob.url)?.hostname.includes(".private.")) throw new Error("Private photo storage unavailable");
  return blob.url;
}

/** A database URL alone is not ownership evidence. Only server-created photo
 * namespaces can be checked against the token's Blob store. Legacy generic
 * uploads remain displayable, but never authorize a fetch or blob deletion. */
export function managedPhotoPath(raw: string, plan: PhotoPlanScope): string | null {
  if (!Number.isSafeInteger(plan.id) || plan.id < 1) return null;
  const url = photoBlobUrl(raw);
  if (!url) return null;
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
  const parsedUrl = photoBlobUrl(raw);
  const token = parsedUrl && storageToken(parsedUrl);
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
    await del(photo.url, { token: storageToken(new URL(photo.url)), abortSignal: AbortSignal.timeout(5_000) });
    return true;
  } catch { return false; } // Never log user URLs, credentials or storage errors.
}

/** Authenticated callers may display an existing DB-attached legacy image,
 * but reading it never grants deletion/migration rights. The public store's
 * own listing must independently confirm its exact path and URL. */
async function verifyLegacyPhoto(raw: string) {
  const url = photoBlobUrl(raw);
  if (!url || !url.hostname.includes(".public.")
    || !/^\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:webp|png|jpe?g|gif)$/.test(url.pathname)) return null;
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  try {
    const pathname = url.pathname.slice(1);
    const result = await list({ prefix: pathname, limit: 1, token, abortSignal: AbortSignal.timeout(5_000) });
    return result.blobs.find(item => item.pathname === pathname && item.url === raw) ?? null;
  } catch { return null; }
}

async function privatePhotoBytes(url: string, maxBytes: number, timeoutMs: number): Promise<Uint8Array | null> {
  const token = process.env.MOMENTS_BLOB_READ_WRITE_TOKEN;
  if (!token) return null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const work = async () => {
    // Pathname avoids ever forwarding storage credentials to a supplied host.
    const result = await get(new URL(url).pathname.slice(1), { token, access: "private", useCache: false, abortSignal: controller.signal });
    if (result?.statusCode !== 200 || result.blob.url !== url || result.blob.size > maxBytes
      || !/^image\/(?:webp|png|jpeg|gif)$/.test(result.blob.contentType)) return null;
    reader = result.stream.getReader();
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
  finally { clearTimeout(timer); controller.abort(); void reader?.cancel().catch(() => undefined); }
}

export async function readPhotoContentBytes(raw: string, plan: PhotoPlanScope, maxBytes = 4 * 1024 * 1024, allowLegacy = false, timeoutMs = 8_000): Promise<Uint8Array | null> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) return null;
  const verified = await verifyManagedPhoto(raw, plan) ?? (allowLegacy ? await verifyLegacyPhoto(raw) : null);
  if (!verified || verified.size > maxBytes) return null;
  return new URL(verified.url).hostname.includes(".private.")
    ? privatePhotoBytes(verified.url, maxBytes, timeoutMs)
    : fetchManagedPhotoBytes(verified.url, maxBytes, timeoutMs);
}

export async function readManagedPhotoBytes(raw: string, plan: PhotoPlanScope, maxBytes = 4 * 1024 * 1024, timeoutMs = 8_000) {
  return readPhotoContentBytes(raw, plan, maxBytes, false, timeoutMs);
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
