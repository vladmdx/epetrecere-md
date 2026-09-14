import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accountAssetErasureRetryDelayMs,
  accountAssetKey,
  accountBlobErasureEligibility,
  drainAccountAssetErasureOutbox,
  managedAccountAssetUrls,
  managedBlobAsset,
  recoverableBlobSdkReceipt,
  type AccountAssetErasureStore,
  type ClaimedAccountAssetErasure,
} from "../src/lib/privacy/account-asset-erasure";

const URL = "https://store123.public.blob.vercel-storage.com/artists/photo-a.webp";
const KEY = accountAssetKey(URL);

test("managed Blob recognition is canonical, strict, deduplicated and deterministic", () => {
  assert.deepEqual(managedBlobAsset(URL), {
    url: URL,
    access: "public",
    storeId: "store123",
  });
  assert.deepEqual(
    managedBlobAsset(
      "https://private1.private.blob.vercel-storage.com/event-photos/7/a.webp",
    ),
    {
      url: "https://private1.private.blob.vercel-storage.com/event-photos/7/a.webp",
      access: "private",
      storeId: "private1",
    },
  );
  for (const unsafe of [
    "http://store123.public.blob.vercel-storage.com/a.webp",
    "https://store123.public.blob.vercel-storage.com/a.webp?download=1",
    "https://store123.public.blob.vercel-storage.com.evil.test/a.webp",
    "https://user@store123.public.blob.vercel-storage.com/a.webp",
    "https://example.com/a.webp",
    "not-a-url",
  ]) {
    assert.equal(managedBlobAsset(unsafe), null, unsafe);
  }

  const later = "https://store123.public.blob.vercel-storage.com/venues/z.pdf";
  assert.deepEqual(
    managedAccountAssetUrls([later, null, URL, URL, "https://example.com/x"]),
    [URL, later],
  );
  assert.match(accountAssetKey(URL), /^[0-9a-f]{64}$/);
  assert.equal(accountAssetKey(URL), accountAssetKey(URL));

  const token = "vercel_blob_rw_store123_secret";
  assert.deepEqual(
    recoverableBlobSdkReceipt(`${URL}?sdk=changed#ignored`, token),
    managedBlobAsset(URL),
  );
  assert.equal(
    recoverableBlobSdkReceipt(URL, "vercel_blob_rw_other_secret"),
    null,
    "recovery never crosses the store encoded in the write token",
  );
});

test("only registered-owner assets without surviving claims are erasable", () => {
  const own = "a".repeat(64);
  const orphan = "b".repeat(64);
  const shared = "c".repeat(64);
  const legal = "d".repeat(64);
  const userId = "11111111-1111-4111-8111-111111111111";
  const otherUserId = "22222222-2222-4222-8222-222222222222";
  const result = accountBlobErasureEligibility(
    [
      { assetKey: own, assetUrl: `${URL}/own` },
      { assetKey: orphan, assetUrl: `${URL}/orphan` },
      { assetKey: shared, assetUrl: `${URL}/shared` },
      { assetKey: legal, assetUrl: `${URL}/legal` },
    ],
    [
      { assetKey: own, erasureUserId: userId },
      { assetKey: shared, erasureUserId: otherUserId },
      { assetKey: legal, erasureUserId: null },
    ],
    userId,
  );
  assert.deepEqual(
    result.eligible.map(({ assetKey }) => assetKey),
    [own, orphan],
  );
  assert.deepEqual([...result.retainedKeys].sort(), [legal, shared].sort());
});

type MemoryRow = {
  id: number;
  assetKey: string;
  assetUrl: string | null;
  status: "pending" | "processing" | "failed" | "delivered";
  attempts: number;
  nextAttemptAt: Date;
  leaseToken: string | null;
  leaseUntil: Date | null;
  lastError: string | null;
};

class MemoryStore implements AccountAssetErasureStore {
  row: MemoryRow;
  private leaseNumber = 0;

  constructor(url = URL) {
    this.row = {
      id: 1,
      assetKey: KEY,
      assetUrl: url,
      status: "pending",
      attempts: 0,
      nextAttemptAt: new Date(0),
      leaseToken: null,
      leaseUntil: null,
      lastError: null,
    };
  }

  async claim(input: {
    now: Date;
    limit: number;
    leaseMs: number;
  }): Promise<ClaimedAccountAssetErasure[]> {
    const retryable = (
      ["pending", "failed"].includes(this.row.status)
      && this.row.nextAttemptAt <= input.now
    ) || (
      this.row.status === "processing"
      && this.row.leaseUntil !== null
      && this.row.leaseUntil <= input.now
    );
    if (
      !retryable
      || !this.row.assetUrl
      || input.limit < 1
    ) return [];
    this.row.status = "processing";
    this.row.attempts += 1;
    this.row.leaseToken = `lease-${++this.leaseNumber}`;
    this.row.leaseUntil = new Date(input.now.getTime() + input.leaseMs);
    return [{
      id: this.row.id,
      assetKey: this.row.assetKey,
      assetUrl: this.row.assetUrl,
      attempts: this.row.attempts,
      leaseToken: this.row.leaseToken,
    }];
  }

  async markDelivered(claim: ClaimedAccountAssetErasure): Promise<boolean> {
    if (
      this.row.status !== "processing"
      || this.row.leaseToken !== claim.leaseToken
    ) return false;
    this.row.status = "delivered";
    this.row.assetUrl = null;
    this.row.leaseToken = null;
    this.row.leaseUntil = null;
    return true;
  }

  async markFailed(
    claim: ClaimedAccountAssetErasure,
    failure: Parameters<AccountAssetErasureStore["markFailed"]>[1],
  ): Promise<boolean> {
    if (
      this.row.status !== "processing"
      || this.row.leaseToken !== claim.leaseToken
    ) return false;
    this.row.status = failure.status;
    this.row.nextAttemptAt = failure.nextAttemptAt;
    this.row.leaseToken = null;
    this.row.leaseUntil = null;
    this.row.lastError = failure.error;
    return true;
  }
}

test("provider failure retains the URL, backs off, then a retry removes payload", async () => {
  const store = new MemoryStore();
  let now = new Date("2026-09-14T10:00:00.000Z");
  const calls: string[] = [];
  let available = false;
  const deleteBlob = async (url: string) => {
    calls.push(url);
    if (!available) throw new Error(`provider failed for ${url}`);
  };

  const first = await drainAccountAssetErasureOutbox({
    store,
    deleteBlob,
    now: () => now,
  });
  assert.deepEqual(first, {
    claimed: 1,
    delivered: 0,
    failed: 1,
    deadLettered: 0,
    leaseLost: 0,
    reconciledPending: 0,
    backlogLikely: false,
  });
  assert.equal(store.row.status, "failed");
  assert.equal(store.row.assetUrl, URL, "retry must retain deletion payload");
  assert.deepEqual(JSON.parse(store.row.lastError ?? "null"), {
    errorClass: "Error",
  });
  assert.doesNotMatch(store.row.lastError ?? "", /provider|https|store123/i);
  assert.equal(
    store.row.nextAttemptAt.getTime(),
    now.getTime() + accountAssetErasureRetryDelayMs(1),
  );

  now = new Date(now.getTime() + accountAssetErasureRetryDelayMs(1) - 1);
  assert.equal(
    (await drainAccountAssetErasureOutbox({ store, deleteBlob, now: () => now })).claimed,
    0,
  );

  now = new Date(now.getTime() + 1);
  available = true;
  const retry = await drainAccountAssetErasureOutbox({
    store,
    deleteBlob,
    now: () => now,
  });
  assert.equal(retry.delivered, 1);
  assert.equal(store.row.status, "delivered");
  assert.equal(store.row.assetUrl, null, "success must minimize the URL payload");
  assert.deepEqual(calls, [URL, URL]);
});

test("failures retry indefinitely with a 24h cap and lease fencing rejects stale completion", async () => {
  const retryStore = new MemoryStore();
  let now = new Date("2026-09-14T12:00:00.000Z");
  const fail = async () => { throw new Error("offline"); };
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const result = await drainAccountAssetErasureOutbox({
      store: retryStore,
      deleteBlob: fail,
      now: () => now,
    });
    assert.equal(result.failed, 1);
    assert.equal(result.deadLettered, 0);
    assert.equal(retryStore.row.status, "failed");
    assert.equal(retryStore.row.assetUrl, URL);
    const delay = accountAssetErasureRetryDelayMs(attempt);
    assert.ok(delay <= 24 * 60 * 60 * 1000);
    now = new Date(retryStore.row.nextAttemptAt);
  }
  assert.equal(accountAssetErasureRetryDelayMs(999), 24 * 60 * 60 * 1000);

  const fenced: AccountAssetErasureStore = {
    claim: async () => [{ id: 9, assetKey: KEY, assetUrl: URL, attempts: 1, leaseToken: "old" }],
    markDelivered: async () => false,
    markFailed: async () => false,
  };
  const stale = await drainAccountAssetErasureOutbox({
    store: fenced,
    deleteBlob: async () => undefined,
  });
  assert.equal(stale.delivered, 0);
  assert.equal(stale.leaseLost, 1);
});
