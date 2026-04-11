import { test, expect, request as pwRequest } from "@playwright/test";
import { CLIENT_STATE } from "../helpers/paths";
import { sql, getTestUsers } from "../helpers/db";

// INV-01 / INV-02 / INV-03 — Invitation creation + RSVP + reminder cron.
//
// Approach for INV-03:
//   We don't invoke the Inngest cron directly — instead we seed data that
//   matches its WHERE clause (status='published', eventDate = today + 14d,
//   rsvpStatus='pending', email IS NOT NULL) and run the exact same query
//   from the test. If the seeded guest comes back in the candidate list,
//   the cron would pick it up on its next daily run at 10 UTC.

const BASE = process.env.E2E_BASE_URL || "https://epetrecere.md";

test.describe.serial("Invitations + RSVP reminder (INV-01..03)", () => {
  let invitationId: number;
  let clientDbId: string;

  test.beforeAll(async () => {
    const { client } = await getTestUsers();
    clientDbId = client.id as string;
    // Clean up any stale test invitations from a previous run.
    await sql`delete from invitation_guests where email = 'e2e-guest@example.com'`;
    await sql`delete from invitations where couple_names = 'E2E Test Couple'`;
  });

  test.afterAll(async () => {
    if (invitationId) {
      await sql`delete from invitation_guests where invitation_id = ${invitationId}`;
      await sql`delete from invitations where id = ${invitationId}`;
    }
  });

  test("INV-01: client creates an invitation (draft)", async () => {
    // Pick any existing template — the API requires a valid templateId.
    const [tpl] = await sql`
      select id from invitation_templates order by id limit 1
    `;
    expect(tpl, "at least one invitation template must exist").toBeDefined();

    const req = await pwRequest.newContext({
      baseURL: BASE,
      storageState: CLIENT_STATE,
    });
    const res = await req.post("/api/invitations", {
      data: {
        templateId: tpl.id,
        eventType: "wedding",
        coupleNames: "E2E Test Couple",
        eventDate: "2028-09-20",
        guests: [
          {
            name: "E2E Guest",
            email: "e2e-guest@example.com",
            group: "Prieteni",
          },
        ],
      },
    });
    expect(res.status(), await res.text()).toBe(201);
    const json = await res.json();
    invitationId = json.id;
    // After the requireAppUser() fix, the API stores + returns the
    // app-user UUID (not the Clerk ID) so the FK to users.id resolves.
    expect(json.userId).toBe(clientDbId);

    // Verify the guest was inserted with a valid rsvp_token.
    const guests = await sql`
      select id, name, email, rsvp_token, rsvp_status
      from invitation_guests where invitation_id = ${invitationId}
    `;
    expect(guests.length).toBe(1);
    expect(guests[0].rsvp_token).toMatch(/.{8,}/);
    expect(guests[0].rsvp_status).toBe("pending");
  });

  test("INV-03: cron candidate query picks up our guest", async () => {
    // Promote the invitation and move its eventDate to exactly 14 days out
    // so the 14d reminder bucket will include it. This mirrors the
    // `invitationRsvpReminders` function's WHERE clause.
    await sql`
      update invitations
      set status = 'published',
          event_date = (CURRENT_DATE + interval '14 days')::date
      where id = ${invitationId}
    `;

    // Run the exact same query the cron runs for the 14d bucket.
    const rows = await sql`
      select g.id, g.email, g.reminders_sent
      from invitation_guests g
      inner join invitations i on g.invitation_id = i.id
      where i.status = 'published'
      and g.rsvp_status = 'pending'
      and g.email is not null
      and i.event_date::date = CURRENT_DATE + 14
      and i.id = ${invitationId}
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].email).toBe("e2e-guest@example.com");
    expect(rows[0].reminders_sent).toBe(0);
  });

  test("INV-03: schema supports reminders_sent / last_reminder_at increments", async () => {
    // Simulate what the cron does after a successful email dispatch.
    await sql`
      update invitation_guests
      set reminders_sent = reminders_sent + 1,
          last_reminder_at = now()
      where invitation_id = ${invitationId}
    `;
    const [row] = await sql`
      select reminders_sent, last_reminder_at
      from invitation_guests where invitation_id = ${invitationId}
    `;
    expect(row.reminders_sent).toBe(1);
    expect(row.last_reminder_at).not.toBeNull();
  });
});
