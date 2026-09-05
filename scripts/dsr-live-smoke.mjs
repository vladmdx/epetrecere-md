/**
 * Destructive-rights smoke test for production.
 *
 * Creates an isolated Clerk user and matching database records, authenticates
 * with a short-lived Clerk session token, verifies the portability export,
 * invokes account deletion, and confirms that both Clerk and database records
 * disappeared. Cleanup runs even when an assertion fails.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { createClerkClient } from "@clerk/backend";
import { chromium } from "@playwright/test";
import postgres from "postgres";

const appUrl = (process.env.SMOKE_APP_URL || "https://epetrecere.md").replace(/\/$/, "");
const databaseUrl = process.env.DATABASE_URL?.trim();
const clerkSecret = process.env.CLERK_SECRET_KEY?.trim();

if (!databaseUrl || !clerkSecret) {
  throw new Error("DATABASE_URL and CLERK_SECRET_KEY are required");
}

const sql = postgres(databaseUrl, { ssl: "require", prepare: false, max: 1 });
const clerk = createClerkClient({ secretKey: clerkSecret });
const marker = randomUUID();
const email = `gdpr-smoke-${marker}@invalid.epetrecere.md`;
let clerkUserId = null;
let localUserId = randomUUID();
let browser = null;

async function clerkUserExists(id) {
  try {
    await clerk.users.getUser(id);
    return true;
  } catch (error) {
    if (error?.status === 404) return false;
    throw error;
  }
}

try {
  const clerkUser = await clerk.users.createUser({
    emailAddress: [email],
    firstName: "GDPR",
    lastName: "Smoke",
    skipPasswordRequirement: true,
    skipLegalChecks: true,
  });
  clerkUserId = clerkUser.id;

  // Do not depend on webhook delivery time for the smoke test. The upsert is
  // idempotent if Clerk has already delivered user.created.
  const [localUser] = await sql`
    INSERT INTO users (id, clerk_id, email, name, role, onboarding_complete)
    VALUES (${localUserId}, ${clerkUserId}, ${email}, 'GDPR Smoke', 'user', TRUE)
    ON CONFLICT (clerk_id) DO UPDATE SET email = EXCLUDED.email
    RETURNING id
  `;
  localUserId = localUser.id;

  const [plan] = await sql`
    INSERT INTO event_plans (user_id, title, event_type, event_date, guests_enabled)
    VALUES (${localUserId}, 'GDPR portability smoke', 'wedding', CURRENT_DATE + 30, TRUE)
    RETURNING id
  `;
  await sql`
    INSERT INTO notifications (user_id, type, title, message)
    VALUES (${localUserId}, 'reminder', 'GDPR smoke', 'Synthetic portability record')
  `;

  const ticket = await clerk.signInTokens.createSignInToken({
    userId: clerkUserId,
    expiresInSeconds: 60,
  });
  browser = await chromium.launch({
    headless: true,
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`${appUrl}/sign-in?__clerk_ticket=${encodeURIComponent(ticket.token)}`, {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => !window.location.search.includes("__clerk_ticket"), null, {
    timeout: 20_000,
  });

  const exported = await context.request.get(`${appUrl}/api/me/data-export`);
  if (!exported.ok) {
    throw new Error(`Data export returned HTTP ${exported.status}`);
  }
  const payload = await exported.json();
  if (
    payload.profile?.email !== email ||
    !payload.eventPlans?.some((item) => item.id === plan.id) ||
    !payload.notifications?.some((item) => item.title === "GDPR smoke")
  ) {
    throw new Error("Data export omitted synthetic personal records");
  }

  const deleted = await context.request.delete(`${appUrl}/api/me/delete-account`);
  if (!deleted.ok) {
    throw new Error(`Account deletion returned HTTP ${deleted.status}`);
  }

  const [remaining] = await sql`
    SELECT
      (SELECT count(*)::int FROM users WHERE clerk_id = ${clerkUserId}) AS users,
      (SELECT count(*)::int FROM event_plans WHERE user_id = ${localUserId}) AS plans,
      (SELECT count(*)::int FROM notifications WHERE user_id = ${localUserId}) AS notifications
  `;
  if (remaining.users || remaining.plans || remaining.notifications) {
    throw new Error(`Database cleanup incomplete: ${JSON.stringify(remaining)}`);
  }
  if (await clerkUserExists(clerkUserId)) {
    throw new Error("Clerk identity remained after account deletion");
  }

  clerkUserId = null;
  console.log("DSR live smoke: export and deletion ok");
} finally {
  // Explicit, narrow cleanup makes the script safe to rerun after a partial
  // network failure without leaving a demo identity or catalog data behind.
  if (browser) await browser.close().catch(() => undefined);
  await sql`DELETE FROM users WHERE id = ${localUserId}`.catch(() => undefined);
  if (clerkUserId && (await clerkUserExists(clerkUserId).catch(() => false))) {
    await clerk.users.deleteUser(clerkUserId).catch(() => undefined);
  }
  await sql.end();
}
