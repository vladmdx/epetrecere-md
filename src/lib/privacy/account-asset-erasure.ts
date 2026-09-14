import { createHash, randomUUID } from "node:crypto";
import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  lte,
  ne,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import {
  BlobNotFoundError,
  del as deleteBlob,
  get as getBlob,
  put as putBlob,
} from "@vercel/blob";
import { db } from "@/lib/db";
import {
  accountAssetErasureOutbox,
  accountBlobAssetClaims,
  accountBlobAssets,
  artists,
  venues,
  type AccountAssetErasureStatus,
  type AccountBlobAssetErasurePolicy,
} from "@/lib/db/schema";
import {
  createServerLogCorrelationId,
  safeServerErrorLog,
} from "@/lib/safe-server-log";

export const ACCOUNT_ASSET_ERASURE_LEASE_MS = 2 * 60 * 1000;
const ACCOUNT_ASSET_ERASURE_RETRY_BASE_MS = 5 * 60 * 1000;
const ACCOUNT_ASSET_ERASURE_RETRY_CAP_MS = 24 * 60 * 60 * 1000;
const BLOB_DELETE_TIMEOUT_MS = 5_000;
const BLOB_UPLOAD_TIMEOUT_MS = 15_000;
const MAX_DRAIN_BATCH = 25;
const STALE_TRANSIENT_BLOB_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_PENDING_RECONCILIATION_BATCH = 25;
const ACCOUNT_BLOB_MUTATION_LOCK_NAMESPACE = 1_163_022_925;
const ACCOUNT_BLOB_MUTATION_LOCK_KEY = 37;
const SAFE_ASSET_PROVIDER_STATUSES = new Set([
  400, 401, 403, 404, 408, 409, 429, 500, 502, 503, 504,
]);

type AccountErasureTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];
type RegistryExecutor = typeof db | AccountErasureTransaction;
type RegisteredBlobBody = Parameters<typeof putBlob>[1];

type VendorSnapshot = {
  id: number;
  slug: string;
  isActive: boolean;
};

export type CapturedAccountAssets = {
  artists: VendorSnapshot[];
  venues: VendorSnapshot[];
  artistIds: number[];
  venueIds: number[];
  planIds: number[];
  enqueued: number;
  retainedShared: number;
};

export type ManagedBlobAsset = {
  url: string;
  access: "public" | "private";
  storeId: string;
};

/** Strictly recognize canonical SDK-style Vercel Blob URLs. */
export function managedBlobAsset(raw: unknown): ManagedBlobAsset | null {
  if (typeof raw !== "string" || raw.length < 1 || raw.length > 4_096) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.port
    || parsed.search
    || parsed.hash
    || parsed.pathname === "/"
    || parsed.href !== raw
  ) {
    return null;
  }
  const host = /^([a-z0-9]+)\.(public|private)\.blob\.vercel-storage\.com$/
    .exec(parsed.hostname);
  if (!host) return null;
  return {
    url: raw,
    storeId: host[1],
    access: host[2] as "public" | "private",
  };
}

/** Normalize only the SDK-returned store-id host segment. User/DB URLs still
 * pass through `managedBlobAsset` unchanged and must already be canonical. */
function managedBlobSdkResult(raw: string): ManagedBlobAsset | null {
  const canonical = raw.replace(
    /^https:\/\/[a-zA-Z0-9]+(?=\.(?:public|private)\.blob\.vercel-storage\.com\/)/,
    (host) => host.toLowerCase(),
  );
  return managedBlobAsset(canonical);
}

/**
 * Recovery parser used only for the receipt returned directly by Vercel's
 * upload SDK. It accepts harmless host-case/query drift, but still requires a
 * canonical Vercel Blob host, no credentials/port, a non-root path and the
 * exact store encoded in the write token. User or database URLs must never go
 * through this relaxed boundary.
 */
export function recoverableBlobSdkReceipt(
  raw: unknown,
  token: string,
): ManagedBlobAsset | null {
  if (typeof raw !== "string" || raw.length < 1 || raw.length > 4_096) {
    return null;
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (
    parsed.protocol !== "https:"
    || parsed.username
    || parsed.password
    || parsed.port
    || parsed.pathname === "/"
  ) {
    return null;
  }
  const host = /^([a-z0-9]+)\.(public|private)\.blob\.vercel-storage\.com$/i
    .exec(parsed.hostname);
  const expectedStoreId = tokenStoreId(token);
  if (!host || !expectedStoreId || host[1].toLowerCase() !== expectedStoreId) {
    return null;
  }
  return managedBlobAsset(
    `https://${parsed.hostname.toLowerCase()}${parsed.pathname}`,
  );
}

/** Deduplicate and sort before inserts so concurrent erasures lock keys alike. */
export function managedAccountAssetUrls(values: readonly unknown[]): string[] {
  return [...new Set(
    values
      .map((value) => managedBlobAsset(value)?.url ?? null)
      .filter((value): value is string => value !== null),
  )].sort();
}

export function accountAssetKey(url: string): string {
  return createHash("sha256").update(url, "utf8").digest("hex");
}

/**
 * Check the server-side ownership registry before a feature performs its
 * legacy synchronous Blob cleanup. Registered objects are deleted through
 * the durable outbox after their last database claim disappears.
 *
 * The digest is not treated as proof by itself: both the key and canonical
 * URL must match the registry row. Database errors intentionally propagate so
 * callers fail closed instead of racing the durable cleanup path.
 */
export async function isRegisteredAccountBlobAsset(
  raw: string,
): Promise<boolean> {
  const asset = managedBlobAsset(raw);
  if (!asset) return false;
  const [registered] = await db
    .select({ assetKey: accountBlobAssets.assetKey })
    .from(accountBlobAssets)
    .where(and(
      eq(accountBlobAssets.assetKey, accountAssetKey(asset.url)),
      eq(accountBlobAssets.assetUrl, asset.url),
    ))
    .limit(1);
  return Boolean(registered);
}

function validProvenance(value: string): boolean {
  return value.length >= 1
    && value.length <= 80
    && /^[a-z0-9_:.-]+$/.test(value);
}

/**
 * Record an object created by the application. A URL stored in a profile is
 * intentionally not enough: only this server-side upload receipt establishes
 * ownership for future erasure.
 */
export async function registerAccountBlobAsset(
  executor: RegistryExecutor,
  input: {
    url: string;
    ownerUserId: string;
    provenance: string;
    erasurePolicy?: AccountBlobAssetErasurePolicy;
  },
): Promise<{ assetKey: string; url: string }> {
  const asset = managedBlobAsset(input.url);
  if (!asset || !validProvenance(input.provenance) || !input.ownerUserId) {
    throw new Error("account_blob_registry_input_invalid");
  }
  const assetKey = accountAssetKey(asset.url);
  const erasurePolicy = input.erasurePolicy ?? "account_erasure";
  const inserted = await executor
    .insert(accountBlobAssets)
    .values({
      assetKey,
      assetUrl: asset.url,
      ownerUserId: input.ownerUserId,
      provenance: input.provenance,
      erasurePolicy,
    })
    .onConflictDoNothing({ target: accountBlobAssets.assetKey })
    .returning({ assetKey: accountBlobAssets.assetKey });
  if (inserted.length > 0) return { assetKey, url: asset.url };

  const [existing] = await executor
    .select({
      assetUrl: accountBlobAssets.assetUrl,
      ownerUserId: accountBlobAssets.ownerUserId,
      provenance: accountBlobAssets.provenance,
      erasurePolicy: accountBlobAssets.erasurePolicy,
      state: accountBlobAssets.state,
    })
    .from(accountBlobAssets)
    .where(eq(accountBlobAssets.assetKey, assetKey))
    .limit(1);
  if (
    existing?.assetUrl !== asset.url
    || existing.ownerUserId !== input.ownerUserId
    || existing.provenance !== input.provenance
    || existing.erasurePolicy !== erasurePolicy
    || existing.state !== "active"
  ) {
    throw new Error("account_blob_registry_conflict");
  }
  return { assetKey, url: asset.url };
}

function tokenStoreId(token: string | undefined): string | null {
  if (!token) return null;
  return /^vercel_blob_rw_([a-zA-Z0-9]+)_[a-zA-Z0-9_-]+$/
    .exec(token)?.[1]?.toLowerCase() ?? null;
}

function privateBlobTokenForStore(storeId: string): string | null {
  for (const token of [
    process.env.LEGAL_BLOB_READ_WRITE_TOKEN,
    process.env.MOMENTS_BLOB_READ_WRITE_TOKEN,
  ]) {
    if (token && tokenStoreId(token) === storeId) return token;
  }
  return null;
}

async function deleteBlobWithToken(url: string): Promise<void> {
  const asset = managedBlobAsset(url);
  if (!asset) throw new Error("account_asset_url_invalid");
  const token = asset.access === "private"
    ? privateBlobTokenForStore(asset.storeId)
    : process.env.BLOB_READ_WRITE_TOKEN;
  if (!token || tokenStoreId(token) !== asset.storeId) {
    throw new Error("account_asset_blob_store_unavailable");
  }
  try {
    await deleteBlob(url, {
      token,
      abortSignal: AbortSignal.timeout(BLOB_DELETE_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof BlobNotFoundError) return;
    throw error;
  }
}

/** Compensate only the exact object receipt returned by the upload SDK. The
 * token/store/access checks are repeated here so an unexpected SDK result can
 * never turn the compensation path into an arbitrary URL deleter. */
async function deleteJustUploadedBlob(
  asset: ManagedBlobAsset,
  expectedAccess: "public" | "private",
  token: string,
): Promise<void> {
  if (
    asset.access !== expectedAccess
    || tokenStoreId(token) !== asset.storeId
  ) {
    throw new Error("account_blob_upload_result_invalid");
  }
  try {
    await deleteBlob(asset.url, {
      token,
      abortSignal: AbortSignal.timeout(BLOB_DELETE_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof BlobNotFoundError) return;
    throw error;
  }
}

/**
 * Upload and persist its ownership receipt before exposing the URL. Vercel
 * Blob and PostgreSQL cannot share a distributed transaction, so a registry
 * failure is compensated by deleting the just-created object. If that delete
 * also fails, only a one-way key is logged; no URL or token is emitted.
 */
export async function storeRegisteredBlob(input: {
  pathname: string;
  body: RegisteredBlobBody;
  access: "public" | "private";
  ownerUserId: string;
  provenance: string;
  erasurePolicy?: AccountBlobAssetErasurePolicy;
  contentType?: string;
  addRandomSuffix?: boolean;
  token?: string;
}): Promise<string> {
  if (!input.ownerUserId || !validProvenance(input.provenance)) {
    throw new Error("account_blob_registry_input_invalid");
  }
  const token = input.token ?? (
    input.access === "private"
      ? process.env.MOMENTS_BLOB_READ_WRITE_TOKEN
      : process.env.BLOB_READ_WRITE_TOKEN
  );
  if (!token) throw new Error("account_asset_blob_store_unavailable");

  const uploaded = await putBlob(input.pathname, input.body, {
    access: input.access,
    token,
    contentType: input.contentType,
    // Fresh object identities are a prerequisite for unambiguous ownership.
    // Callers with UUID pathnames (Moments) may explicitly disable this.
    addRandomSuffix: input.addRandomSuffix ?? true,
    abortSignal: AbortSignal.timeout(BLOB_UPLOAD_TIMEOUT_MS),
  });
  const asset = managedBlobSdkResult(uploaded.url);
  if (
    !asset
    || asset.access !== input.access
    || tokenStoreId(token) !== asset.storeId
  ) {
    // The application never exposes a mismatched receipt. First compensate
    // the exact SDK-returned object when its write-token/store binding can be
    // recovered. If provider deletion fails, persist a durable quarantined
    // registry/outbox receipt so account erasure and the scheduled worker can
    // retry; a one-way log by itself would make the personal object orphaned.
    const recoverable = recoverableBlobSdkReceipt(uploaded.url, token);
    const quarantineAsset = asset ?? recoverable;
    let cleaned = false;
    if (recoverable) {
      try {
        await deleteJustUploadedBlob(recoverable, recoverable.access, token);
        cleaned = true;
      } catch (cleanupError) {
        console.error("[blob-registry] invalid receipt compensation failed", {
          assetKey: accountAssetKey(recoverable.url),
          ...safeServerErrorLog(cleanupError, {
            correlationId: createServerLogCorrelationId(),
            allowedStatuses: SAFE_ASSET_PROVIDER_STATUSES,
          }),
        });
      }
    }
    if (quarantineAsset && !cleaned) {
      try {
        await db.transaction(async (tx) => {
          await registerAccountBlobAsset(tx, {
            url: quarantineAsset.url,
            ownerUserId: input.ownerUserId,
            provenance: "upload_receipt_quarantine",
          });
        });
        await enqueueRegisteredBlobCleanup(quarantineAsset.url);
      } catch (quarantineError) {
        console.error("[blob-registry] invalid receipt quarantine failed", {
          assetKey: accountAssetKey(quarantineAsset.url),
          ...safeServerErrorLog(quarantineError, {
            correlationId: createServerLogCorrelationId(),
          }),
        });
      }
    }
    throw new Error("account_blob_upload_result_invalid");
  }

  try {
    await db.transaction(async (tx) => {
      await registerAccountBlobAsset(tx, {
        url: asset.url,
        ownerUserId: input.ownerUserId,
        provenance: input.provenance,
        erasurePolicy: input.erasurePolicy,
      });
    });
  } catch (error) {
    try {
      await deleteJustUploadedBlob(asset, input.access, token);
    } catch (cleanupError) {
      console.error("[blob-registry] compensation failed", {
        assetKey: accountAssetKey(asset.url),
        ...safeServerErrorLog(cleanupError, {
          correlationId: createServerLogCorrelationId(),
          allowedStatuses: SAFE_ASSET_PROVIDER_STATUSES,
        }),
      });
    }
    throw error;
  }
  return asset.url;
}

/** Read a retained private object only after checking its durable registry
 * receipt. The caller still owns authorization for the underlying entity. */
export async function readRegisteredPrivateBlob(input: {
  url: string;
  provenance: string;
  contentType: string;
  maxBytes?: number;
}): Promise<Uint8Array | null> {
  const asset = managedBlobAsset(input.url);
  const maxBytes = input.maxBytes ?? 15 * 1024 * 1024;
  if (
    !asset
    || asset.access !== "private"
    || !validProvenance(input.provenance)
    || !input.contentType
    || !Number.isSafeInteger(maxBytes)
    || maxBytes < 1
  ) {
    return null;
  }
  const token = privateBlobTokenForStore(asset.storeId);
  if (!token) return null;

  let registered: { assetKey: string } | undefined;
  try {
    [registered] = await db
      .select({ assetKey: accountBlobAssets.assetKey })
      .from(accountBlobAssets)
      .where(and(
        eq(accountBlobAssets.assetKey, accountAssetKey(asset.url)),
        eq(accountBlobAssets.assetUrl, asset.url),
        eq(accountBlobAssets.provenance, input.provenance),
        eq(accountBlobAssets.erasurePolicy, "retain"),
        eq(accountBlobAssets.state, "active"),
      ))
      .limit(1);
  } catch (error) {
    console.error(
      "[blob-registry] private read registry check failed",
      safeServerErrorLog(error, {
        correlationId: createServerLogCorrelationId(),
      }),
    );
    return null;
  }
  if (!registered) return null;

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const signal = AbortSignal.timeout(8_000);
  try {
    const result = await getBlob(new URL(asset.url).pathname.slice(1), {
      token,
      access: "private",
      useCache: false,
      abortSignal: signal,
    });
    if (
      result?.statusCode !== 200
      || managedBlobSdkResult(result.blob.url)?.url !== asset.url
      || result.blob.contentType !== input.contentType
      || result.blob.size > maxBytes
    ) {
      return null;
    }
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
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } catch (error) {
    console.error(
      "[blob-registry] private read failed",
      safeServerErrorLog(error, {
        correlationId: createServerLogCorrelationId(),
        allowedStatuses: SAFE_ASSET_PROVIDER_STATUSES,
      }),
    );
    return null;
  } finally {
    void reader?.cancel().catch(() => undefined);
  }
}

/** Promote a freshly uploaded legal object after its durable DB link commits. */
export async function retainRegisteredBlobAsset(
  executor: RegistryExecutor,
  url: string,
  ownerUserId: string,
  provenance: string,
): Promise<void> {
  if (!validProvenance(provenance)) {
    throw new Error("account_blob_registry_input_invalid");
  }
  const [updated] = await executor
    .update(accountBlobAssets)
    .set({ erasurePolicy: "retain", provenance, updatedAt: new Date() })
    .where(and(
      eq(accountBlobAssets.assetKey, accountAssetKey(url)),
      eq(accountBlobAssets.assetUrl, url),
      eq(accountBlobAssets.ownerUserId, ownerUserId),
      eq(accountBlobAssets.state, "active"),
    ))
    .returning({ assetKey: accountBlobAssets.assetKey });
  if (!updated) throw new Error("account_blob_registry_promote_failed");
}

/**
 * Queue a just-uploaded object whose application-row insert failed. The
 * registry row is locked before checking claims; trigger-created FK claims
 * serialize with this transition and make reuse fail safe.
 */
export async function enqueueRegisteredBlobCleanup(url: string): Promise<boolean> {
  const asset = managedBlobAsset(url);
  if (!asset) return false;
  const assetKey = accountAssetKey(asset.url);
  return db.transaction(async (tx) => {
    const [registered] = await tx
      .select({ state: accountBlobAssets.state, assetUrl: accountBlobAssets.assetUrl })
      .from(accountBlobAssets)
      .where(eq(accountBlobAssets.assetKey, assetKey))
      .for("update")
      .limit(1);
    if (registered?.state !== "active" || registered.assetUrl !== asset.url) {
      return false;
    }
    const [claim] = await tx
      .select({ claimKey: accountBlobAssetClaims.claimKey })
      .from(accountBlobAssetClaims)
      .where(eq(accountBlobAssetClaims.assetKey, assetKey))
      .limit(1);
    if (claim) return false;
    const inserted = await tx
      .insert(accountAssetErasureOutbox)
      .values({ assetKey, assetUrl: asset.url })
      .onConflictDoNothing({ target: accountAssetErasureOutbox.assetKey })
      .returning({ assetKey: accountAssetErasureOutbox.assetKey });
    if (!inserted[0]) throw new Error("account_blob_outbox_state_conflict");
    const [queued] = await tx
      .update(accountBlobAssets)
      .set({ state: "queued", ownerUserId: null, updatedAt: new Date() })
      .where(and(
        eq(accountBlobAssets.assetKey, assetKey),
        eq(accountBlobAssets.assetUrl, asset.url),
        eq(accountBlobAssets.state, "active"),
      ))
      .returning({ assetKey: accountBlobAssets.assetKey });
    if (!queued) throw new Error("account_blob_registry_queue_mismatch");
    return true;
  });
}

export type PendingAccountBlobReconciliationResult = {
  examined: number;
  enqueued: number;
  backlogLikely: boolean;
};

/**
 * Recover only explicitly transient upload receipts abandoned before their
 * application-row link committed. Generic uploads can legitimately be kept
 * in a form for later use, so they are never TTL-collected. The conservative
 * one-day cutoff plus the same global claim fence makes a late link either
 * win before the check or fail safely after the asset becomes queued.
 */
export async function reconcileStalePendingAccountBlobAssets(options: {
  now?: Date;
  minAgeMs?: number;
  limit?: number;
} = {}): Promise<PendingAccountBlobReconciliationResult> {
  const now = options.now ?? new Date();
  const minAgeMs = Math.max(
    STALE_TRANSIENT_BLOB_AGE_MS,
    options.minAgeMs ?? STALE_TRANSIENT_BLOB_AGE_MS,
  );
  const limit = Math.max(
    1,
    Math.min(options.limit ?? 10, MAX_PENDING_RECONCILIATION_BATCH),
  );
  const cutoff = new Date(now.getTime() - minAgeMs);

  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(
      ${ACCOUNT_BLOB_MUTATION_LOCK_NAMESPACE},
      ${ACCOUNT_BLOB_MUTATION_LOCK_KEY}
    )`);
    const candidates = await tx
      .select({
        assetKey: accountBlobAssets.assetKey,
        assetUrl: accountBlobAssets.assetUrl,
      })
      .from(accountBlobAssets)
      .where(and(
        inArray(accountBlobAssets.provenance, [
          "legal_contract_pending",
          "upload_receipt_quarantine",
        ]),
        eq(accountBlobAssets.erasurePolicy, "account_erasure"),
        eq(accountBlobAssets.state, "active"),
        lte(accountBlobAssets.createdAt, cutoff),
        notExists(
          tx
            .select({ one: sql`1` })
            .from(accountBlobAssetClaims)
            .where(eq(accountBlobAssetClaims.assetKey, accountBlobAssets.assetKey)),
        ),
      ))
      .orderBy(accountBlobAssets.createdAt, accountBlobAssets.assetKey)
      .limit(limit)
      .for("update", { skipLocked: true });

    let enqueued = 0;
    for (const candidate of candidates) {
      if (!candidate.assetUrl) {
        throw new Error("account_blob_pending_receipt_invalid");
      }
      const [claim] = await tx
        .select({ claimKey: accountBlobAssetClaims.claimKey })
        .from(accountBlobAssetClaims)
        .where(eq(accountBlobAssetClaims.assetKey, candidate.assetKey))
        .limit(1);
      if (claim) continue;
      const inserted = await tx
        .insert(accountAssetErasureOutbox)
        .values({ assetKey: candidate.assetKey, assetUrl: candidate.assetUrl })
        .onConflictDoNothing({ target: accountAssetErasureOutbox.assetKey })
        .returning({ assetKey: accountAssetErasureOutbox.assetKey });
      if (!inserted[0]) throw new Error("account_blob_outbox_state_conflict");
      const queued = await tx
        .update(accountBlobAssets)
        .set({ state: "queued", ownerUserId: null, updatedAt: now })
        .where(and(
          eq(accountBlobAssets.assetKey, candidate.assetKey),
          eq(accountBlobAssets.assetUrl, candidate.assetUrl),
          inArray(accountBlobAssets.provenance, [
            "legal_contract_pending",
            "upload_receipt_quarantine",
          ]),
          eq(accountBlobAssets.erasurePolicy, "account_erasure"),
          eq(accountBlobAssets.state, "active"),
          lte(accountBlobAssets.createdAt, cutoff),
          notExists(
            tx
              .select({ one: sql`1` })
              .from(accountBlobAssetClaims)
              .where(eq(accountBlobAssetClaims.assetKey, accountBlobAssets.assetKey)),
          ),
        ))
        .returning({ assetKey: accountBlobAssets.assetKey });
      if (!queued[0]) throw new Error("account_blob_registry_queue_mismatch");
      enqueued += 1;
    }
    return {
      examined: candidates.length,
      enqueued,
      backlogLikely: candidates.length === limit,
    };
  });
}

export function accountBlobErasureEligibility(
  registered: ReadonlyArray<{ assetKey: string; assetUrl: string | null }>,
  claims: ReadonlyArray<{ assetKey: string; erasureUserId: string | null }>,
  erasedUserId: string,
): {
  eligible: Array<{ assetKey: string; assetUrl: string }>;
  retainedKeys: Set<string>;
} {
  const retainedKeys = new Set(
    claims
      .filter((claim) => claim.erasureUserId !== erasedUserId)
      .map((claim) => claim.assetKey),
  );
  return {
    eligible: registered.filter(
      (asset): asset is { assetKey: string; assetUrl: string } =>
        Boolean(asset.assetUrl) && !retainedKeys.has(asset.assetKey),
    ),
    retainedKeys,
  };
}

/**
 * Capture only server-registered objects owned by this account. Trigger
 * claims distinguish rows that disappear with the account from shared/legal
 * references that survive it. Unregistered legacy URLs are deliberately
 * ignored, and a URL merely pasted into a profile can never grant deletion.
 */
export async function captureAccountAssetErasures(
  tx: AccountErasureTransaction,
  userId: string,
  _avatarUrl?: string | null,
): Promise<CapturedAccountAssets> {
  const ownedArtists = await tx
    .select({ id: artists.id, slug: artists.slug, isActive: artists.isActive })
    .from(artists)
    .where(eq(artists.userId, userId))
    .orderBy(artists.id)
    .for("update");
  const ownedVenues = await tx
    .select({ id: venues.id, slug: venues.slug, isActive: venues.isActive })
    .from(venues)
    .where(and(eq(venues.userId, userId), isNull(venues.organizationId)))
    .orderBy(venues.id)
    .for("update");

  // Serialize account capture with claim creation/removal and other account
  // erasures before taking registry-row locks. This prevents reciprocal URL
  // claims from producing A->B / B->A lock cycles.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(
    ${ACCOUNT_BLOB_MUTATION_LOCK_NAMESPACE},
    ${ACCOUNT_BLOB_MUTATION_LOCK_KEY}
  )`);

  // FOR UPDATE is the serialization point shared with the claim trigger.
  // Sorting by the digest also gives concurrent account erasures one lock
  // order even if assets were created in a different order.
  const registered = await tx
    .select({
      assetKey: accountBlobAssets.assetKey,
      assetUrl: accountBlobAssets.assetUrl,
    })
    .from(accountBlobAssets)
    .where(and(
      eq(accountBlobAssets.ownerUserId, userId),
      eq(accountBlobAssets.erasurePolicy, "account_erasure"),
      eq(accountBlobAssets.state, "active"),
    ))
    .orderBy(accountBlobAssets.assetKey)
    .for("update");

  const registeredKeys = registered.map(({ assetKey }) => assetKey);
  const sharedClaims = registeredKeys.length
    ? await tx
        .select({
          assetKey: accountBlobAssetClaims.assetKey,
          erasureUserId: accountBlobAssetClaims.erasureUserId,
        })
        .from(accountBlobAssetClaims)
        .where(and(
          inArray(accountBlobAssetClaims.assetKey, registeredKeys),
          or(
            isNull(accountBlobAssetClaims.erasureUserId),
            ne(accountBlobAssetClaims.erasureUserId, userId),
          ),
        ))
    : [];
  const { eligible } = accountBlobErasureEligibility(
    registered,
    sharedClaims,
    userId,
  );

  for (let offset = 0; offset < eligible.length; offset += 100) {
    const batch = eligible.slice(offset, offset + 100);
    const inserted = await tx
      .insert(accountAssetErasureOutbox)
      .values(batch.map((asset) => ({
        assetKey: asset.assetKey,
        assetUrl: asset.assetUrl,
      })))
      .onConflictDoNothing({ target: accountAssetErasureOutbox.assetKey })
      .returning({ assetKey: accountAssetErasureOutbox.assetKey });
    if (inserted.length !== batch.length) {
      throw new Error("account_blob_outbox_state_conflict");
    }
    const queued = await tx
      .update(accountBlobAssets)
      .set({ state: "queued", ownerUserId: null, updatedAt: new Date() })
      .where(and(
        inArray(accountBlobAssets.assetKey, batch.map(({ assetKey }) => assetKey)),
        eq(accountBlobAssets.state, "active"),
        eq(accountBlobAssets.ownerUserId, userId),
      ))
      .returning({ assetKey: accountBlobAssets.assetKey });
    if (queued.length !== batch.length) {
      throw new Error("account_blob_registry_queue_mismatch");
    }
  }

  return {
    artists: ownedArtists,
    venues: ownedVenues,
    artistIds: ownedArtists.map(({ id }) => id),
    venueIds: ownedVenues.map(({ id }) => id),
    // Kept for the account-erasure caller's existing return contract. Event
    // plan ids no longer need to be enumerated for Blob ownership.
    planIds: [],
    enqueued: eligible.length,
    retainedShared: registered.length - eligible.length,
  };
}

export type ClaimedAccountAssetErasure = {
  id: number;
  assetKey: string;
  assetUrl: string;
  attempts: number;
  leaseToken: string;
};

type FailureStatus = Extract<AccountAssetErasureStatus, "failed">;

export interface AccountAssetErasureStore {
  claim(input: {
    now: Date;
    limit: number;
    leaseMs: number;
  }): Promise<ClaimedAccountAssetErasure[]>;
  markDelivered(claim: ClaimedAccountAssetErasure, at: Date): Promise<boolean>;
  markFailed(
    claim: ClaimedAccountAssetErasure,
    failure: {
      status: FailureStatus;
      at: Date;
      nextAttemptAt: Date;
      error: string;
    },
  ): Promise<boolean>;
}

export function accountAssetErasureRetryDelayMs(attempt: number): number {
  const exponent = Math.max(0, Math.min(attempt - 1, 20));
  return Math.min(
    ACCOUNT_ASSET_ERASURE_RETRY_BASE_MS * 2 ** exponent,
    ACCOUNT_ASSET_ERASURE_RETRY_CAP_MS,
  );
}

function retryableAssetErasure(now: Date) {
  return or(
    and(
      inArray(accountAssetErasureOutbox.status, ["pending", "failed"]),
      lte(accountAssetErasureOutbox.nextAttemptAt, now),
    ),
    and(
      eq(accountAssetErasureOutbox.status, "processing"),
      lte(accountAssetErasureOutbox.leaseUntil, now),
    ),
  );
}

const postgresAccountAssetErasureStore: AccountAssetErasureStore = {
  async claim({ now, limit, leaseMs }) {
    return db.transaction(async (tx) => {
      const candidates = await tx
        .select({ id: accountAssetErasureOutbox.id })
        .from(accountAssetErasureOutbox)
        .where(retryableAssetErasure(now))
        .orderBy(
          asc(accountAssetErasureOutbox.nextAttemptAt),
          asc(accountAssetErasureOutbox.id),
        )
        .limit(limit)
        .for("update", { skipLocked: true });

      const claimed: ClaimedAccountAssetErasure[] = [];
      for (const candidate of candidates) {
        const leaseToken = randomUUID();
        const [row] = await tx
          .update(accountAssetErasureOutbox)
          .set({
            status: "processing",
            attempts: sql`${accountAssetErasureOutbox.attempts} + 1`,
            leaseToken,
            leaseUntil: new Date(now.getTime() + leaseMs),
            lastError: null,
            updatedAt: now,
          })
          .where(and(
            eq(accountAssetErasureOutbox.id, candidate.id),
            retryableAssetErasure(now),
          ))
          .returning({
            id: accountAssetErasureOutbox.id,
            assetKey: accountAssetErasureOutbox.assetKey,
            assetUrl: accountAssetErasureOutbox.assetUrl,
            attempts: accountAssetErasureOutbox.attempts,
            leaseToken: accountAssetErasureOutbox.leaseToken,
          });
        if (row?.assetUrl && row.leaseToken) {
          claimed.push({ ...row, assetUrl: row.assetUrl, leaseToken: row.leaseToken });
        }
      }
      return claimed;
    });
  },

  async markDelivered(claim, at) {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(accountAssetErasureOutbox)
        .set({
          status: "delivered",
          assetUrl: null,
          leaseToken: null,
          leaseUntil: null,
          lastError: null,
          deliveredAt: at,
          updatedAt: at,
        })
        .where(and(
          eq(accountAssetErasureOutbox.id, claim.id),
          eq(accountAssetErasureOutbox.assetKey, claim.assetKey),
          eq(accountAssetErasureOutbox.status, "processing"),
          eq(accountAssetErasureOutbox.leaseToken, claim.leaseToken),
        ))
        .returning({ assetKey: accountAssetErasureOutbox.assetKey });
      if (!row) return false;
      const [registry] = await tx
        .update(accountBlobAssets)
        .set({
          state: "deleted",
          assetUrl: null,
          ownerUserId: null,
          deletedAt: at,
          updatedAt: at,
        })
        .where(and(
          eq(accountBlobAssets.assetKey, row.assetKey),
          eq(accountBlobAssets.state, "queued"),
        ))
        .returning({ assetKey: accountBlobAssets.assetKey });
      if (!registry) throw new Error("account_blob_registry_delivery_mismatch");
      return true;
    });
  },

  async markFailed(claim, failure) {
    const [row] = await db
      .update(accountAssetErasureOutbox)
      .set({
        status: failure.status,
        nextAttemptAt: failure.nextAttemptAt,
        leaseToken: null,
        leaseUntil: null,
        lastError: failure.error,
        updatedAt: failure.at,
      })
      .where(and(
        eq(accountAssetErasureOutbox.id, claim.id),
        eq(accountAssetErasureOutbox.assetKey, claim.assetKey),
        eq(accountAssetErasureOutbox.status, "processing"),
        eq(accountAssetErasureOutbox.leaseToken, claim.leaseToken),
      ))
      .returning({ id: accountAssetErasureOutbox.id });
    return Boolean(row);
  },
};

/** Persist only allowlisted metadata. Provider messages/stacks/bodies can
 * contain URLs, headers or tokens and are never inspected or serialized. */
function safeAssetErasureFailure(error: unknown): string {
  const { errorClass, status } = safeServerErrorLog(error, {
    correlationId: "not-persisted",
    allowedStatuses: SAFE_ASSET_PROVIDER_STATUSES,
  });
  return JSON.stringify({
    errorClass,
    ...(status === undefined ? {} : { status }),
  });
}

export type AccountAssetErasureDrainResult = {
  claimed: number;
  delivered: number;
  failed: number;
  /** Retained for callers during rollout; account assets never dead-letter. */
  deadLettered: 0;
  leaseLost: number;
  /** Abandoned, explicitly transient upload receipts queued this run. */
  reconciledPending: number;
  /** A full batch is an operational signal that more work may be waiting. */
  backlogLikely: boolean;
};

/**
 * Claim first, then call Blob outside every database transaction. Delivery is
 * at-least-once; failures retry forever with exponential backoff capped at one
 * day. Lease-token fencing prevents stale workers completing a newer claim.
 */
export async function drainAccountAssetErasureOutbox(options: {
  limit?: number;
  leaseMs?: number;
  now?: () => Date;
  store?: AccountAssetErasureStore;
  deleteBlob?: (url: string) => Promise<void>;
} = {}): Promise<AccountAssetErasureDrainResult> {
  const store = options.store ?? postgresAccountAssetErasureStore;
  const clock = options.now ?? (() => new Date());
  const limit = Math.max(1, Math.min(options.limit ?? 10, MAX_DRAIN_BATCH));
  const claimed = await store.claim({
    now: clock(),
    limit,
    leaseMs: options.leaseMs ?? ACCOUNT_ASSET_ERASURE_LEASE_MS,
  });
  const result: AccountAssetErasureDrainResult = {
    claimed: claimed.length,
    delivered: 0,
    failed: 0,
    deadLettered: 0,
    leaseLost: 0,
    reconciledPending: 0,
    backlogLikely: claimed.length === limit,
  };

  for (const claim of claimed) {
    try {
      await (options.deleteBlob ?? deleteBlobWithToken)(claim.assetUrl);
      if (await store.markDelivered(claim, clock())) result.delivered += 1;
      else result.leaseLost += 1;
    } catch (error) {
      const at = clock();
      const marked = await store.markFailed(claim, {
        status: "failed",
        at,
        nextAttemptAt: new Date(
          at.getTime() + accountAssetErasureRetryDelayMs(claim.attempts),
        ),
        error: safeAssetErasureFailure(error),
      });
      if (!marked) result.leaseLost += 1;
      else result.failed += 1;
    }
  }

  // Run after delivery so a reconciliation outage cannot strand an already
  // claimed deletion lease. A failure is deliberately propagated to cron /
  // Inngest observability and retried by the scheduler.
  if (!options.store) {
    const reconciliation = await reconcileStalePendingAccountBlobAssets({
      now: clock(),
      limit,
    });
    result.reconciledPending = reconciliation.enqueued;
    result.backlogLikely ||= reconciliation.backlogLikely;
  }

  return result;
}
