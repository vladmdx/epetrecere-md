import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { sql, eq, inArray } from "drizzle-orm";
import { db } from "../src/lib/db";
import { users, notifications } from "../src/lib/db/schema";
import { drainRegistrationEmails, enqueueRegistrationEmails, registrationEmailHtml } from "../src/lib/notifications/registration-email";
import type { sendEmail } from "../src/lib/email/send";

test("registration email queue: two admins, retry, concurrency, demotion, expiry and privacy", async () => {
  const marker = randomUUID();
  const createdUsers: string[] = [];
  const sent: string[] = [];
  const keys: string[] = [];
  const sender: typeof sendEmail = async (input) => {
    sent.push(input.to);
    keys.push(input.idempotencyKey!);
    return { data: { id: randomUUID() }, error: null, headers: {} };
  };
  async function fixture(role: "admin" | "super_admin" | "user", kind = "venue_registered") {
    const [u] = await db.insert(users).values({ clerkId: randomUUID(), email: `${randomUUID()}@example.invalid`, role }).returning();
    createdUsers.push(u.id);
    const [n] = await db.insert(notifications).values({ userId: u.id, type: kind, title: "Local trimis la aprobare", message: `<DEMO ${marker}>` }).returning();
    await enqueueRegistrationEmails(db, [n.id, n.id]);
    return { u, n };
  }
  async function drain(ids: number[], send = sender) {
    return drainRegistrationEmails({ notificationIds: ids, send });
  }
  try {
    const owner = await fixture("super_admin");
    const colleague = await fixture("admin");
    const former = await fixture("user");
    const result = await drain([owner.n.id, colleague.n.id, former.n.id]);
    assert.equal(result.delivered, 2);
    assert.equal(result.cancelled, 1);
    assert.deepEqual(new Set(sent), new Set([owner.u.email, colleague.u.email]));
    assert.equal((await drain([owner.n.id, colleague.n.id])).selected, 0);

    const retry = await fixture("admin");
    assert.equal((await drain([retry.n.id], async () => { throw new Error("offline"); })).failed, 1);
    await db.execute(sql`UPDATE admin_registration_email_outbox SET next_attempt_at=now() WHERE notification_id=${retry.n.id}`);
    assert.equal((await drain([retry.n.id])).delivered, 1);

    const concurrent = await fixture("admin");
    const before = sent.length;
    await Promise.all([drain([concurrent.n.id]), drain([concurrent.n.id])]);
    assert.equal(sent.length, before + 1);

    const demoted = await fixture("admin");
    await db.update(users).set({ role: "user" }).where(eq(users.id, demoted.u.id));
    assert.equal((await drain([demoted.n.id])).cancelled, 1);

    const expired = await fixture("admin");
    await db.execute(sql`UPDATE admin_registration_email_outbox SET first_attempt_at=now()-interval '24 hours' WHERE notification_id=${expired.n.id}`);
    assert.equal((await drain([expired.n.id])).deadLettered, 1);

    const erased = await fixture("admin");
    await db.delete(users).where(eq(users.id, erased.u.id));
    assert.equal((await drain([erased.n.id])).selected, 0);
    assert.equal(new Set(keys).size, keys.length);
    const [privileges] = await db.execute<{ anon: boolean; authenticated: boolean }>(sql`
      SELECT has_table_privilege('anon', 'admin_registration_email_outbox', 'SELECT,INSERT,UPDATE,DELETE') AS anon,
        has_table_privilege('authenticated', 'admin_registration_email_outbox', 'SELECT,INSERT,UPDATE,DELETE') AS authenticated
    `);
    assert.deepEqual(privileges, { anon: false, authenticated: false });
    assert.ok(registrationEmailHtml("<script>", "<img>").includes("&lt;script&gt;"));
    assert.ok(!registrationEmailHtml("<script>", "<img>").includes("<img>"));
  } finally {
    if (createdUsers.length) await db.delete(users).where(inArray(users.id, createdUsers));
  }
});
