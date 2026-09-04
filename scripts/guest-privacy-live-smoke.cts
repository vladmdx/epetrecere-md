/** Production-safe smoke test for the private RSVP path.
 * Creates a uniquely named synthetic record, exercises the public page and
 * guest-controlled deletion, asserts both linked rows disappear, then removes
 * the temporary account in a finally block. Never prints tokens or PII. */
const postgres = require("postgres");
const { createCipheriv, randomBytes, randomUUID } = require("node:crypto");

const url = process.env.DATABASE_URL?.trim();
const rawKey = process.env.GUEST_DATA_ENCRYPTION_KEY?.trim();
const appUrl = (process.env.SMOKE_APP_URL || "https://epetrecere.md").replace(/\/$/, "");
if (!url || !rawKey) throw new Error("DATABASE_URL and GUEST_DATA_ENCRYPTION_KEY are required");
const key = Buffer.from(rawKey, "base64url");
if (key.length !== 32) throw new Error("Encryption key must decode to 32 bytes");

function encrypt(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `enc:v1:${Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64url")}`;
}

const sql = postgres(url, { ssl: "require", prepare: false, max: 1 });
const marker = randomUUID();
const userId = randomUUID();
const token = randomBytes(24).toString("base64url");
const slug = `privacy-smoke-${marker}`;
let plannerGuestId = null;
let invitationGuestId = null;

(async () => {
  try {
    await sql`
      INSERT INTO users (id, clerk_id, email, name, role, onboarding_complete)
      VALUES (${userId}, ${`privacy_smoke_${marker}`}, ${`privacy-smoke-${marker}@invalid.test`},
              'Privacy smoke', 'user', true)
    `;
    const [invitation] = await sql`
      INSERT INTO invitations (user_id, slug, status, event_type, event_date, host_name)
      VALUES (${userId}, ${slug}, 'published', 'wedding', CURRENT_DATE + 30, 'Privacy smoke')
      RETURNING id
    `;
    const [plan] = await sql`
      INSERT INTO event_plans (user_id, title, event_type, event_date, guests_enabled, invitation_id)
      VALUES (${userId}, 'Privacy smoke', 'wedding', CURRENT_DATE + 30, true, ${invitation.id})
      RETURNING id
    `;
    const privateName = encrypt(`Guest ${marker}`);
    const privateEmail = encrypt(`guest-${marker}@invalid.test`);
    const [plannerGuest] = await sql`
      INSERT INTO guest_list (plan_id, full_name, email, contact_channel, contact_value)
      VALUES (${plan.id}, ${privateName}, ${privateEmail}, 'email', ${privateEmail})
      RETURNING id
    `;
    plannerGuestId = plannerGuest.id;
    const [invitationGuest] = await sql`
      INSERT INTO invitation_guests
        (invitation_id, name, email, rsvp_token, rsvp_token_expires_at)
      VALUES
        (${invitation.id}, ${privateName}, ${privateEmail}, ${token}, now() + interval '45 days')
      RETURNING id
    `;
    invitationGuestId = invitationGuest.id;

    const page = await fetch(`${appUrl}/i/${encodeURIComponent(slug)}?rsvp=${encodeURIComponent(token)}`);
    const html = await page.text();
    if (!page.ok || html.includes("enc:v1:") || !html.includes("noindex")) {
      throw new Error("Private invitation rendering check failed");
    }

    const missingConsent = await fetch(`${appUrl}/api/rsvp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        status: "yes",
        dietaryNotes: "Synthetic allergy test",
        dietaryConsent: false,
      }),
    });
    if (missingConsent.status !== 400) {
      throw new Error("Dietary data was accepted without explicit consent");
    }

    const rsvp = await fetch(`${appUrl}/api/rsvp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        token,
        status: "yes",
        dietaryNotes: "Synthetic allergy test",
        dietaryConsent: true,
      }),
    });
    if (!rsvp.ok) throw new Error(`RSVP returned HTTP ${rsvp.status}`);
    const [synced] = await sql`
      SELECT
        (SELECT rsvp FROM guest_list WHERE id = ${plannerGuestId}) AS planner_rsvp,
        (SELECT dietary FROM guest_list WHERE id = ${plannerGuestId}) AS planner_dietary,
        (SELECT dietary_notes FROM invitation_guests WHERE id = ${invitationGuestId}) AS invitation_dietary,
        (SELECT dietary_consent_at IS NOT NULL FROM invitation_guests WHERE id = ${invitationGuestId}) AS consent_recorded
    `;
    if (
      synced.planner_rsvp !== "accepted" ||
      !synced.planner_dietary?.startsWith("enc:v1:") ||
      !synced.invitation_dietary?.startsWith("enc:v1:") ||
      !synced.consent_recorded
    ) {
      throw new Error("RSVP, consent or encrypted planner synchronization failed");
    }

    const removal = await fetch(`${appUrl}/api/rsvp`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!removal.ok) throw new Error(`Guest deletion returned HTTP ${removal.status}`);

    const [remaining] = await sql`
      SELECT
        (SELECT count(*)::int FROM guest_list WHERE id = ${plannerGuestId}) AS planner,
        (SELECT count(*)::int FROM invitation_guests WHERE id = ${invitationGuestId}) AS invitation
    `;
    if (remaining.planner !== 0 || remaining.invitation !== 0) {
      throw new Error("Linked guest deletion did not remove both records");
    }
    plannerGuestId = null;
    invitationGuestId = null;
    console.log("guest privacy live smoke: ok");
  } finally {
    // Explicit id deletes make cleanup resilient even if a future schema
    // change alters one of the current cascade rules.
    if (plannerGuestId) await sql`DELETE FROM guest_list WHERE id = ${plannerGuestId}`;
    if (invitationGuestId) await sql`DELETE FROM invitation_guests WHERE id = ${invitationGuestId}`;
    await sql`DELETE FROM users WHERE id = ${userId}`;
    await sql.end();
  }
})().catch((error) => {
  console.error(error instanceof Error ? error.message : "Smoke test failed");
  process.exitCode = 1;
});
