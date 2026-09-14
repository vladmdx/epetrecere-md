import { createHmac, randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  accountErasureIdentityOutbox,
  users,
} from "@/lib/db/schema";
import {
  createServerLogCorrelationId,
  safeServerErrorLog,
} from "@/lib/safe-server-log";

type Executor = typeof db;
export type AccountErasureIdentity =
  typeof accountErasureIdentityOutbox.$inferSelect;

export const ACCOUNT_ERASURE_IDENTITY_LEASE_MS = 2 * 60 * 1000;
export const ACCOUNT_ERASURE_IDENTITY_PROVIDER_TIMEOUT_MS = 20 * 1000;
export const ACCOUNT_ERASURE_IDENTITY_BASE_BACKOFF_MS = 30 * 1000;
export const ACCOUNT_ERASURE_IDENTITY_MAX_BACKOFF_MS = 24 * 60 * 60 * 1000;

const HMAC_DOMAIN = "epetrecere:account-erasure-identity:v1\0";
export const ACCOUNT_ERASURE_IDENTITY_SECRET_MIN_BYTES = 32;
export const ACCOUNT_ERASURE_IDENTITY_CONFIGURATION_CODE =
  "ACCOUNT_ERASURE_IDENTITY_SECRET_INVALID";
const SAFE_IDENTITY_ERASURE_ERROR_CODES = new Set([
  "40001",
  "40P01",
  "55P03",
  "57014",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
]);
const SAFE_IDENTITY_ERASURE_ERROR_STATUSES = new Set([
  400, 401, 403, 404, 408, 409, 422, 425, 429, 500, 502, 503, 504,
]);

type IdentitySecrets = {
  ACCOUNT_ERASURE_IDENTITY_SECRET?: string;
};

export type ClerkIdentityDeletionDriver = (clerkId: string) => Promise<unknown>;

export type AccountUserBootstrapInput = {
  clerkId: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
};

export type AccountErasureIdentityProcessResult =
  | { status: "completed"; alreadyDeleted: boolean }
  | { status: "failed" }
  | { status: "not_due" };

export class AccountErasureIdentityConfigurationError extends Error {
  readonly code = ACCOUNT_ERASURE_IDENTITY_CONFIGURATION_CODE;

  constructor() {
    super(
      `ACCOUNT_ERASURE_IDENTITY_SECRET must be a dedicated stable secret containing at least ${ACCOUNT_ERASURE_IDENTITY_SECRET_MIN_BYTES} bytes`,
    );
    this.name = "AccountErasureIdentityConfigurationError";
  }
}

function identitySecret(secrets: IdentitySecrets): string {
  const dedicated = secrets.ACCOUNT_ERASURE_IDENTITY_SECRET?.trim();
  if (
    !dedicated
    || Buffer.byteLength(dedicated, "utf8")
      < ACCOUNT_ERASURE_IDENTITY_SECRET_MIN_BYTES
  ) {
    throw new AccountErasureIdentityConfigurationError();
  }
  return dedicated;
}

/**
 * Runtime gate for routes that can create or erase a Clerk identity. The
 * secret remains optional during static build/test discovery, but every
 * identity-sensitive operation fails closed before opening a transaction.
 */
export function assertAccountErasureIdentityConfigured(
  secrets: IdentitySecrets = {
    ACCOUNT_ERASURE_IDENTITY_SECRET:
      process.env.ACCOUNT_ERASURE_IDENTITY_SECRET,
  },
): void {
  identitySecret(secrets);
}

/** Stable, non-reversible identity used only as the permanent tombstone key. */
export function accountErasureIdentityHash(
  clerkId: string,
  secrets: IdentitySecrets = {
    ACCOUNT_ERASURE_IDENTITY_SECRET:
      process.env.ACCOUNT_ERASURE_IDENTITY_SECRET,
  },
): string {
  const normalized = clerkId.trim();
  if (!normalized) throw new Error("clerk_id_required_for_erasure_identity");
  return createHmac("sha256", identitySecret(secrets))
    .update(HMAC_DOMAIN)
    .update(normalized)
    .digest("hex");
}

/** Two stable signed int32 keys for a transaction-scoped advisory lock. */
export function accountErasureIdentityLockKeys(identityHash: string): [number, number] {
  if (!/^[0-9a-f]{64}$/.test(identityHash)) {
    throw new Error("invalid_account_erasure_identity_hash");
  }
  const bytes = Buffer.from(identityHash, "hex");
  return [bytes.readInt32BE(0), bytes.readInt32BE(4)];
}

async function acquireIdentityLock(
  executor: Executor,
  identityHash: string,
): Promise<void> {
  const [first, second] = accountErasureIdentityLockKeys(identityHash);
  await executor.execute(sql`SELECT pg_advisory_xact_lock(${first}, ${second})`);
}

export async function lockAccountErasureIdentity(
  executor: Executor,
  clerkId: string,
): Promise<string> {
  const identityHash = accountErasureIdentityHash(clerkId);
  await acquireIdentityLock(executor, identityHash);
  return identityHash;
}

/**
 * Serialize bootstrap and erasure even when no tombstone row existed at the
 * first statement snapshot. Call this before taking user/membership locks.
 */
export async function accountErasureIdentityIsTombstoned(
  executor: Executor,
  clerkId: string,
): Promise<boolean> {
  const identityHash = await lockAccountErasureIdentity(executor, clerkId);
  const [row] = await executor
    .select({ identityHash: accountErasureIdentityOutbox.identityHash })
    .from(accountErasureIdentityOutbox)
    .where(eq(accountErasureIdentityOutbox.identityHash, identityHash))
    .limit(1);
  return Boolean(row);
}

/**
 * The only supported fallback bootstrap for an authenticated Clerk identity.
 * `null` means the identity was erased and must never be provisioned again.
 */
export async function bootstrapAccountUserUnlessErased(
  input: AccountUserBootstrapInput,
): Promise<typeof users.$inferSelect | null> {
  assertAccountErasureIdentityConfigured();
  return db.transaction(async (tx) => {
    const executor = tx as unknown as Executor;
    if (await accountErasureIdentityIsTombstoned(executor, input.clerkId)) {
      return null;
    }

    const [existing] = await tx
      .select()
      .from(users)
      .where(eq(users.clerkId, input.clerkId))
      .limit(1);
    if (existing) return existing;

    const [created] = await tx
      .insert(users)
      .values({
        clerkId: input.clerkId,
        email: input.email,
        name: input.name ?? null,
        phone: null,
        avatarUrl: input.avatarUrl ?? null,
        role: "user",
      })
      .onConflictDoNothing()
      .returning();
    if (created) return created;

    const [refound] = await tx
      .select()
      .from(users)
      .where(eq(users.clerkId, input.clerkId))
      .limit(1);
    if (!refound) throw new Error("account_user_bootstrap_conflict");
    return refound;
  });
}

/** Enqueue/re-arm deletion inside the same transaction as local erasure. */
export async function enqueueAccountErasureIdentity(
  executor: Executor,
  clerkId: string,
  now = new Date(),
): Promise<AccountErasureIdentity> {
  const identityHash = accountErasureIdentityHash(clerkId);
  await acquireIdentityLock(executor, identityHash);
  const [row] = await executor
    .insert(accountErasureIdentityOutbox)
    .values({
      identityHash,
      clerkId,
      status: "pending",
      attempts: 0,
      nextAttemptAt: now,
      leaseToken: null,
      leaseUntil: null,
      lastError: null,
      completedAt: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: accountErasureIdentityOutbox.identityHash,
      // A verified user.deleted event is authoritative. Never reintroduce the
      // raw Clerk id if a concurrent/late local DELETE sees that completion.
      setWhere: ne(accountErasureIdentityOutbox.status, "completed"),
      set: {
        clerkId,
        status: "pending",
        nextAttemptAt: now,
        leaseToken: null,
        leaseUntil: null,
        lastError: null,
        completedAt: null,
        updatedAt: now,
      },
    })
    .returning();
  if (!row) {
    const [completed] = await executor
      .select()
      .from(accountErasureIdentityOutbox)
      .where(and(
        eq(accountErasureIdentityOutbox.identityHash, identityHash),
        eq(accountErasureIdentityOutbox.status, "completed"),
      ))
      .limit(1);
    if (completed) return completed;
    throw new Error("account_erasure_identity_enqueue_failed");
  }
  return row;
}

/** A verified Clerk user.deleted event is authoritative external completion. */
export async function completeAccountErasureIdentityFromWebhook(
  executor: Executor,
  clerkId: string,
  now = new Date(),
): Promise<AccountErasureIdentity> {
  const identityHash = accountErasureIdentityHash(clerkId);
  await acquireIdentityLock(executor, identityHash);
  const [row] = await executor
    .insert(accountErasureIdentityOutbox)
    .values({
      identityHash,
      clerkId: null,
      status: "completed",
      attempts: 0,
      nextAttemptAt: now,
      leaseToken: null,
      leaseUntil: null,
      lastError: null,
      completedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: accountErasureIdentityOutbox.identityHash,
      set: {
        clerkId: null,
        status: "completed",
        leaseToken: null,
        leaseUntil: null,
        lastError: null,
        completedAt: now,
        updatedAt: now,
      },
    })
    .returning();
  if (!row) throw new Error("account_erasure_identity_completion_failed");
  return row;
}

function retryableIdentityAt(now: Date) {
  return or(
    and(
      inArray(accountErasureIdentityOutbox.status, ["pending", "failed"]),
      lte(accountErasureIdentityOutbox.nextAttemptAt, now),
    ),
    and(
      eq(accountErasureIdentityOutbox.status, "processing"),
      or(
        isNull(accountErasureIdentityOutbox.leaseUntil),
        lte(accountErasureIdentityOutbox.leaseUntil, now),
      ),
    ),
  );
}

export function accountErasureIdentityRetryDelayMs(attempts: number): number {
  const exponent = Math.max(0, Math.min(20, attempts - 1));
  return Math.min(
    ACCOUNT_ERASURE_IDENTITY_MAX_BACKOFF_MS,
    ACCOUNT_ERASURE_IDENTITY_BASE_BACKOFF_MS * 2 ** exponent,
  );
}

/**
 * Stable storage-safe failure record. Provider messages, response bodies,
 * stacks and identity values are never read or copied into the durable queue.
 */
export function accountErasureIdentitySafeFailure(
  error: unknown,
  correlationId = createServerLogCorrelationId(),
): string {
  return JSON.stringify(safeServerErrorLog(error, {
    correlationId,
    allowedCodes: SAFE_IDENTITY_ERASURE_ERROR_CODES,
    allowedStatuses: SAFE_IDENTITY_ERASURE_ERROR_STATUSES,
  }));
}

export function isClerkIdentityAlreadyDeleted(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as {
    status?: unknown;
    statusCode?: unknown;
    response?: { status?: unknown };
  };
  return value.status === 404
    || value.statusCode === 404
    || value.response?.status === 404;
}

async function withDeadline<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error("clerk_identity_delete_timeout")),
      Math.max(1, timeoutMs),
    );
    timer.unref?.();
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Pure provider seam used by unit tests; no Clerk call occurs when injected. */
export async function deleteClerkIdentity(
  clerkId: string,
  driver: ClerkIdentityDeletionDriver,
  timeoutMs = ACCOUNT_ERASURE_IDENTITY_PROVIDER_TIMEOUT_MS,
): Promise<{ alreadyDeleted: boolean }> {
  try {
    await withDeadline(Promise.resolve().then(() => driver(clerkId)), timeoutMs);
    return { alreadyDeleted: false };
  } catch (error) {
    if (isClerkIdentityAlreadyDeleted(error)) return { alreadyDeleted: true };
    throw error;
  }
}

export const clerkIdentityDeletionDriver: ClerkIdentityDeletionDriver = async (
  clerkId,
) => {
  const client = await clerkClient();
  await client.users.deleteUser(clerkId);
};

async function claimAccountErasureIdentity(
  identityHash: string,
  options: { now?: Date; leaseMs?: number; leaseToken?: string } = {},
): Promise<AccountErasureIdentity | null> {
  const now = options.now ?? new Date();
  const leaseToken = options.leaseToken ?? randomUUID();
  const leaseUntil = new Date(
    now.getTime() + (options.leaseMs ?? ACCOUNT_ERASURE_IDENTITY_LEASE_MS),
  );
  const [claimed] = await db
    .update(accountErasureIdentityOutbox)
    .set({
      status: "processing",
      attempts: sql`${accountErasureIdentityOutbox.attempts} + 1`,
      leaseToken,
      leaseUntil,
      lastError: null,
      updatedAt: now,
    })
    .where(and(
      eq(accountErasureIdentityOutbox.identityHash, identityHash),
      retryableIdentityAt(now),
    ))
    .returning();
  return claimed ?? null;
}

async function currentIdentityStatus(identityHash: string) {
  const [row] = await db
    .select({ status: accountErasureIdentityOutbox.status })
    .from(accountErasureIdentityOutbox)
    .where(eq(accountErasureIdentityOutbox.identityHash, identityHash))
    .limit(1);
  return row?.status ?? null;
}

export async function processAccountErasureIdentity(
  identityHash: string,
  options: {
    driver?: ClerkIdentityDeletionDriver;
    now?: Date;
    leaseMs?: number;
    leaseToken?: string;
    providerTimeoutMs?: number;
  } = {},
): Promise<AccountErasureIdentityProcessResult> {
  const claimed = await claimAccountErasureIdentity(identityHash, options);
  if (!claimed?.clerkId || !claimed.leaseToken) {
    return currentIdentityStatus(identityHash).then((status) =>
      status === "completed"
        ? { status: "completed", alreadyDeleted: true }
        : { status: "not_due" },
    );
  }

  const now = options.now ?? new Date();
  try {
    const result = await deleteClerkIdentity(
      claimed.clerkId,
      options.driver ?? clerkIdentityDeletionDriver,
      options.providerTimeoutMs ?? ACCOUNT_ERASURE_IDENTITY_PROVIDER_TIMEOUT_MS,
    );
    const [completed] = await db
      .update(accountErasureIdentityOutbox)
      .set({
        clerkId: null,
        status: "completed",
        leaseToken: null,
        leaseUntil: null,
        lastError: null,
        completedAt: now,
        updatedAt: now,
      })
      .where(and(
        eq(accountErasureIdentityOutbox.identityHash, identityHash),
        eq(accountErasureIdentityOutbox.status, "processing"),
        eq(accountErasureIdentityOutbox.leaseToken, claimed.leaseToken),
      ))
      .returning({ identityHash: accountErasureIdentityOutbox.identityHash });
    if (completed) return { status: "completed", ...result };
    return (await currentIdentityStatus(identityHash)) === "completed"
      ? { status: "completed", alreadyDeleted: true }
      : { status: "not_due" };
  } catch (error) {
    const safeError = accountErasureIdentitySafeFailure(error);
    const [failed] = await db
      .update(accountErasureIdentityOutbox)
      .set({
        status: "failed",
        nextAttemptAt: new Date(
          now.getTime() + accountErasureIdentityRetryDelayMs(claimed.attempts),
        ),
        leaseToken: null,
        leaseUntil: null,
        lastError: safeError,
        updatedAt: now,
      })
      .where(and(
        eq(accountErasureIdentityOutbox.identityHash, identityHash),
        eq(accountErasureIdentityOutbox.status, "processing"),
        eq(accountErasureIdentityOutbox.leaseToken, claimed.leaseToken),
      ))
      .returning({ identityHash: accountErasureIdentityOutbox.identityHash });
    if (failed) {
      return { status: "failed" };
    }
    return (await currentIdentityStatus(identityHash)) === "completed"
      ? { status: "completed", alreadyDeleted: true }
      : { status: "not_due" };
  }
}

export async function drainAccountErasureIdentityOutbox(options: {
  limit?: number;
  now?: Date;
  driver?: ClerkIdentityDeletionDriver;
  providerTimeoutMs?: number;
} = {}) {
  const now = options.now ?? new Date();
  const rows = await db
    .select({ identityHash: accountErasureIdentityOutbox.identityHash })
    .from(accountErasureIdentityOutbox)
    .where(retryableIdentityAt(now))
    .orderBy(
      asc(accountErasureIdentityOutbox.nextAttemptAt),
      asc(accountErasureIdentityOutbox.identityHash),
    )
    .limit(Math.max(1, Math.min(options.limit ?? 25, 100)));

  const summary = {
    selected: rows.length,
    completed: 0,
    failed: 0,
    skipped: 0,
  };
  for (const row of rows) {
    const result = await processAccountErasureIdentity(row.identityHash, {
      now,
      driver: options.driver,
      providerTimeoutMs: options.providerTimeoutMs,
    });
    if (result.status === "completed") summary.completed += 1;
    else if (result.status === "failed") summary.failed += 1;
    else summary.skipped += 1;
  }
  return summary;
}
