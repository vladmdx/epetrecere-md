import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  ACCOUNT_ERASURE_IDENTITY_MAX_BACKOFF_MS,
  accountErasureIdentitySafeFailure,
  accountErasureIdentityHash,
  accountErasureIdentityLockKeys,
  accountErasureIdentityRetryDelayMs,
  assertAccountErasureIdentityConfigured,
  deleteClerkIdentity,
} from "../src/lib/privacy/account-erasure-identity";

const SECRET = "0123456789abcdef0123456789abcdef";

test("erasure identity is a secret-bound HMAC, never a raw Clerk id", () => {
  const clerkId = "user_private_123";
  const first = accountErasureIdentityHash(clerkId, {
    ACCOUNT_ERASURE_IDENTITY_SECRET: SECRET,
  });
  const replay = accountErasureIdentityHash(clerkId, {
    ACCOUNT_ERASURE_IDENTITY_SECRET: SECRET,
  });
  const otherIdentity = accountErasureIdentityHash("user_private_124", {
    ACCOUNT_ERASURE_IDENTITY_SECRET: SECRET,
  });
  const otherSecret = accountErasureIdentityHash(clerkId, {
    ACCOUNT_ERASURE_IDENTITY_SECRET: "abcdef0123456789abcdef0123456789",
  });

  assert.equal(first, replay);
  assert.notEqual(first, otherIdentity);
  assert.notEqual(first, otherSecret);
  assert.match(first, /^[0-9a-f]{64}$/);
  assert.equal(first.includes(clerkId), false);
  assert.deepEqual(accountErasureIdentityLockKeys(first), accountErasureIdentityLockKeys(replay));
});

test("only the dedicated stable secret is accepted and weak/missing keys fail closed", () => {
  assert.throws(
    () => assertAccountErasureIdentityConfigured({}),
    (error: unknown) =>
      error instanceof Error
      && error.name === "AccountErasureIdentityConfigurationError"
      && (error as Error & { code?: string }).code
        === "ACCOUNT_ERASURE_IDENTITY_SECRET_INVALID",
  );
  assert.doesNotThrow(() => assertAccountErasureIdentityConfigured({
    ACCOUNT_ERASURE_IDENTITY_SECRET: SECRET,
  }));
  assert.throws(() => accountErasureIdentityHash("user_1", {}), /SECRET/);
  assert.throws(
    () => accountErasureIdentityHash("user_1", {
      ACCOUNT_ERASURE_IDENTITY_SECRET: "too-short",
    }),
    /32 bytes/,
  );

  const worker = readFileSync(
    "src/lib/privacy/account-erasure-identity.ts",
    "utf8",
  );
  assert.doesNotMatch(worker, /CLERK_WEBHOOK_SECRET/);
  const env = readFileSync("src/lib/env.ts", "utf8");
  assert.match(env, /ACCOUNT_ERASURE_IDENTITY_SECRET/);
  const deletionRoute = readFileSync("src/app/api/me/delete-account/route.ts", "utf8");
  const webhookRoute = readFileSync("src/app/api/webhooks/clerk/route.ts", "utf8");
  assert.match(deletionRoute, /assertAccountErasureIdentityConfigured\(\)/);
  assert.match(webhookRoute, /assertAccountErasureIdentityConfigured\(\)/);
});

test("Clerk deletion driver is injected and 404 is successful completion", async () => {
  const calls: string[] = [];
  const deleted = await deleteClerkIdentity("user_1", async (clerkId) => {
    calls.push(clerkId);
  });
  assert.deepEqual(deleted, { alreadyDeleted: false });
  assert.deepEqual(calls, ["user_1"]);

  const absent = await deleteClerkIdentity("user_2", async () => {
    throw Object.assign(new Error("not found"), { status: 404 });
  });
  assert.deepEqual(absent, { alreadyDeleted: true });

  await assert.rejects(
    deleteClerkIdentity("user_3", async () => {
      throw Object.assign(new Error("provider unavailable"), { status: 503 });
    }),
    /provider unavailable/,
  );
});

test("identity retry uses capped exponential backoff", () => {
  assert.equal(accountErasureIdentityRetryDelayMs(1), 30_000);
  assert.equal(accountErasureIdentityRetryDelayMs(2), 60_000);
  assert.equal(
    accountErasureIdentityRetryDelayMs(100),
    ACCOUNT_ERASURE_IDENTITY_MAX_BACKOFF_MS,
  );
});

test("durable identity failures retain only allowlisted diagnostics", () => {
  const clerkId = "user_private_123";
  const email = "private-person@example.test";
  const providerBody = "provider body with a private deletion trace";
  const error = Object.assign(
    new Error(`${clerkId} ${email} ${providerBody}`),
    {
      status: 503,
      code: "ETIMEDOUT",
      responseBody: providerBody,
    },
  );
  const persisted = accountErasureIdentitySafeFailure(
    error,
    "safe-correlation-id",
  );

  assert.deepEqual(JSON.parse(persisted), {
    correlationId: "safe-correlation-id",
    errorClass: "Error",
    status: 503,
    code: "ETIMEDOUT",
  });
  assert.doesNotMatch(
    persisted,
    /user_private|example\.test|provider body|responseBody|message|stack/,
  );
});

test("schema and migration keep raw identity only in retryable states", () => {
  const schema = readFileSync("src/lib/db/schema.ts", "utf8");
  const migration = readFileSync(
    "src/lib/db/migrations/manual/0035_account_erasure_identity_outbox.sql",
    "utf8",
  );
  assert.match(schema, /accountErasureIdentityOutbox = pgTable/);
  assert.match(migration, /status = 'completed' AND clerk_id IS NULL/);
  assert.match(migration, /NO FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL PRIVILEGES ON TABLE/);
  assert.match(migration, /has_table_privilege/);
  assert.match(migration, /has_column_privilege/);
  assert.match(migration, /DROP POLICY %I ON public\.account_erasure_identity_outbox/);
  assert.match(migration, /unexpected\/unvalidated tombstone constraints/);
  assert.match(migration, /non-canonical tombstone indexes/);
  assert.doesNotMatch(migration, /GRANT\s+/i);
});

test("claim, retry, and completion are lease-fenced and privacy preserving", () => {
  const worker = readFileSync(
    "src/lib/privacy/account-erasure-identity.ts",
    "utf8",
  );
  assert.match(worker, /attempts: sql`\$\{accountErasureIdentityOutbox\.attempts\} \+ 1`/);
  assert.match(worker, /status: "processing"/);
  assert.match(worker, /leaseToken,/);
  assert.match(worker, /lte\(accountErasureIdentityOutbox\.leaseUntil, now\)/);
  assert.match(worker, /eq\(accountErasureIdentityOutbox\.leaseToken, claimed\.leaseToken\)/);
  assert.match(worker, /clerkId: null,[\s\S]*status: "completed"/);
  assert.match(worker, /setWhere: ne\(accountErasureIdentityOutbox\.status, "completed"\)/);
  assert.match(worker, /accountErasureIdentitySafeFailure\(error\)/);
  assert.doesNotMatch(worker, /error instanceof Error \? error\.message : String\(error\)/);
  assert.doesNotMatch(worker, /errors: \[\] as Array<\{ identityHash:/);
});

test("both webhook directions and local deletion use the identity barrier", () => {
  const local = readFileSync("src/app/api/me/delete-account/route.ts", "utf8");
  const webhook = readFileSync("src/app/api/webhooks/clerk/route.ts", "utf8");

  const localLock = local.indexOf("lockAccountErasureIdentity(");
  const memberLock = local.indexOf("acquireUserMembershipMutationLocks(tx, user.id)");
  const enqueue = local.indexOf("enqueueAccountErasureIdentity(", memberLock);
  const userDelete = local.indexOf("tx.delete(users)", enqueue);
  assert.ok(localLock >= 0 && localLock < memberLock);
  assert.ok(enqueue > memberLock && enqueue < userDelete);
  assert.match(local, /processAccountErasureIdentity\(identityHash\)/);
  assert.doesNotMatch(local, /if \(!user\) \{\s*return NextResponse\.json\(\{ error: "Not found"/);
  assert.match(local, /DELETE is idempotent even if the local projection is already absent/);
  const missingBranch = local.indexOf("const missingResolution = await db.transaction");
  const missingLock = local.indexOf("lockAccountErasureIdentity(", missingBranch);
  const missingRecheck = local.indexOf(".where(eq(users.clerkId, clerkId))", missingLock);
  const missingEnqueue = local.indexOf("enqueueAccountErasureIdentity(", missingRecheck);
  assert.ok(
    missingBranch >= 0
      && missingLock > missingBranch
      && missingRecheck > missingLock
      && missingEnqueue > missingRecheck,
  );

  const guard = webhook.indexOf("accountErasureIdentityIsTombstoned(");
  const bootstrapInsert = webhook.indexOf(".insert(users)", guard);
  assert.ok(guard >= 0 && guard < bootstrapInsert);
  const completion = webhook.indexOf("completeAccountErasureIdentityFromWebhook(");
  const webhookDelete = webhook.indexOf("tx.delete(users)", completion);
  assert.ok(completion >= 0 && completion < webhookDelete);
});

test("every request fallback bootstrap is routed through the guarded helper", () => {
  const routes = [
    "src/app/api/legal/accept/route.ts",
    "src/app/api/auth/register-venue/route.ts",
    "src/app/api/auth/register-artist/route.ts",
    "src/app/api/auth/select-role/route.ts",
    "src/app/api/auth/check-role/route.ts",
    "src/app/api/auth/set-phone/route.ts",
  ];
  for (const path of routes) {
    const source = readFileSync(path, "utf8");
    assert.match(
      source,
      /bootstrapAccountUserUnlessErased\(/,
      `${path} must use the guarded bootstrap`,
    );
    assert.doesNotMatch(
      source,
      /\.insert\(users\)/,
      `${path} must not bypass the guarded bootstrap`,
    );
    assert.match(source, /ACCOUNT_ERASED/);
  }
});

test("five-minute Inngest worker and existing cron both drain identity retries", () => {
  const inngest = readFileSync("src/lib/inngest/functions.ts", "utf8");
  const cron = readFileSync(
    "src/app/api/cron/booking-confirmation-outbox/route.ts",
    "utf8",
  );
  assert.match(inngest, /id: "account-erasure-identity-outbox"/);
  assert.match(inngest, /triggers: \[\{ cron: "\*\/5 \* \* \* \*" \}\]/);
  assert.match(inngest, /drainAccountErasureIdentityOutbox\(/);
  assert.match(inngest, /accountErasureIdentityOutboxWorker,/);
  assert.doesNotMatch(
    inngest,
    /account_erasure_identity_outbox_unhealthy:\$\{JSON\.stringify\(result\)\}/,
  );
  assert.match(
    inngest,
    /account_erasure_identity_outbox_unhealthy:failed=\$\{result\.failed\};selected=\$\{result\.selected\}/,
  );
  assert.match(cron, /drainAccountErasureIdentityOutbox\(/);
  assert.match(cron, /identityErasure\.failed > 0/);
});
