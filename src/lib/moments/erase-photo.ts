import { del, list } from "@vercel/blob";
import { isRegisteredAccountBlobAsset } from "@/lib/privacy/account-asset-erasure";
import { canonicalBlobResultUrl, managedPhotoPath, type PhotoPlanScope } from "./managed-photo";

export type PhotoErasure = "deleted" | "already_missing" | "registered" | "retry" | "unverified";
export const PHOTO_ERASURE_BATCH_SIZE = 20;
const OPERATION_TIMEOUT_MS = 2_000;

/** Match the SDK's read/write token store ID before trusting an empty listing.
 * A foreign URL, a legacy generic path or a failed list is never proof of erasure.
 * If Vercel changes its credential format this deliberately requires review. */
export async function eraseManagedPhoto(raw: string, plan: PhotoPlanScope): Promise<PhotoErasure> {
  const pathname = managedPhotoPath(raw, plan);
  if (!pathname) return "unverified";
  const url = new URL(raw);
  const access = url.hostname.includes(".private.") ? "private" : "public";
  const token = access === "private" ? process.env.MOMENTS_BLOB_READ_WRITE_TOKEN : process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return "retry";
  // @vercel/blob resolveBlobAuth uses token.split("_")[3] as the store ID.
  const tokenStore = /^vercel_blob_rw_([a-zA-Z0-9]+)_[a-zA-Z0-9_-]+$/.exec(token)?.[1];
  if (!tokenStore || url.hostname !== `${tokenStore.toLowerCase()}.${access}.blob.vercel-storage.com`) return "unverified";
  try {
    // New uploads have a server-side ownership receipt and live claims. Their
    // row-delete trigger creates durable outbox work after the final claim is
    // removed. Do not race that worker with a synchronous provider deletion.
    if (await isRegisteredAccountBlobAsset(raw)) return "registered";
    const result = await list({ token, prefix: pathname, limit: 1, abortSignal: AbortSignal.timeout(OPERATION_TIMEOUT_MS) });
    if (result.blobs.length === 0 && !result.hasMore) return "already_missing";
    const exact = result.blobs.find(blob => blob.pathname === pathname && canonicalBlobResultUrl(blob.url) === raw);
    if (!exact) return "unverified";
    await del(raw, { token, abortSignal: AbortSignal.timeout(OPERATION_TIMEOUT_MS) });
    return "deleted";
  } catch { return "retry"; }
}

export function photoErasureSucceeded(result: PhotoErasure): boolean {
  return result === "deleted" || result === "already_missing" || result === "registered";
}

export type ErasablePhoto = { id: number; url: string; plan: PhotoPlanScope };

/** Persist progress after each successful object. Failed/unvisited records keep
 * their URL and scope, so another request can resume without a new queue/schema. */
export async function erasePhotoBatch(
  photos: ErasablePhoto[],
  removeRecord: (photo: ErasablePhoto) => Promise<void>,
  options: { erase?: typeof eraseManagedPhoto; now?: () => number } = {},
): Promise<{ complete: boolean; reason: "retry" | "unverified" | "remaining" | null; removed: number }> {
  const now = options.now ?? Date.now;
  const deadline = now() + 12_000;
  let removed = 0;
  for (const photo of photos) {
    if (removed >= PHOTO_ERASURE_BATCH_SIZE || now() >= deadline) return { complete: false, reason: "remaining", removed };
    const result = await (options.erase ?? eraseManagedPhoto)(photo.url, photo.plan);
    if (!photoErasureSucceeded(result)) return { complete: false, reason: result as "retry" | "unverified", removed };
    try { await removeRecord(photo); }
    catch { return { complete: false, reason: "retry", removed }; }
    removed++;
  }
  return { complete: true, reason: null, removed };
}

export function photoErasureError(reason: "retry" | "unverified" | "remaining") {
  return {
    error: reason === "unverified"
      ? "Photo storage ownership needs administrator review. No unverified file was deleted."
      : "Photo cleanup is not finished. Please retry to continue safely.",
    code: reason === "unverified" ? "PHOTO_ERASURE_REVIEW_REQUIRED" : "PHOTO_ERASURE_RETRY",
    retryable: reason !== "unverified",
  };
}
