import { inngest } from "./client";
import { sendEmail } from "@/lib/email/send";
import { leadConfirmationEmail } from "@/lib/email/templates/lead-confirmation";
import { adminNotificationEmail } from "@/lib/email/templates/admin-notification";
import { reviewRequestEmail } from "@/lib/email/templates/review-request";
import { db } from "@/lib/db";
import { bookingRequests, artists, invitations, invitationGuests } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";

// Trigger 1: New lead → emails
export const onLeadCreated = inngest.createFunction(
  {
    id: "on-lead-created",
    triggers: [{ event: "lead/created" }],
  },
  async ({ event, step }) => {
    const lead = event.data.lead as Record<string, string | number | undefined>;

    if (lead.email) {
      await step.run("send-confirmation", async () => {
        await sendEmail({
          to: lead.email as string,
          subject: "Solicitarea ta a fost primită — ePetrecere.md",
          html: leadConfirmationEmail({
            name: String(lead.name || ""),
            eventType: String(lead.eventType || "Eveniment"),
            eventDate: String(lead.eventDate || "TBD"),
          }),
        });
      });
    }

    await step.run("notify-admin", async () => {
      await sendEmail({
        to: process.env.EMAIL_FROM || "admin@epetrecere.md",
        subject: `Solicitare nouă: ${lead.name}`,
        html: adminNotificationEmail({
          leadName: String(lead.name || ""),
          phone: String(lead.phone || ""),
          email: lead.email as string | undefined,
          eventType: String(lead.eventType || "Eveniment"),
          eventDate: String(lead.eventDate || "TBD"),
          location: lead.location as string | undefined,
          guestCount: lead.guestCount as number | undefined,
          budget: lead.budget as number | undefined,
          source: String(lead.source || "form"),
          score: (lead.score as number) || 0,
        }),
      });
    });
  },
);

// Trigger 2: 24h follow-up
export const leadFollowUp = inngest.createFunction(
  {
    id: "lead-follow-up-24h",
    triggers: [{ event: "lead/created" }],
  },
  async ({ event, step }) => {
    await step.sleep("wait-24h", "24h");
    await step.run("alert-admin", async () => {
      const name = (event.data.lead as Record<string, string>).name;
      await sendEmail({
        to: process.env.EMAIL_FROM || "admin@epetrecere.md",
        subject: `Lead necontactat 24h: ${name}`,
        html: `<p>Lead-ul <strong>${name}</strong> nu a fost contactat în 24h.</p>`,
      });
    });
  },
);

// Trigger 3: Daily reminders for events in 7 days + post-event review requests
export const eventReminder = inngest.createFunction(
  {
    id: "event-reminder-7d",
    triggers: [{ cron: "0 9 * * *" }],
  },
  async ({ step }) => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md";

    // 3a — remind clients 7 days before their confirmed event
    await step.run("remind-7d", async () => {
      const rows = await db
        .select({
          booking: bookingRequests,
          artistName: artists.nameRo,
        })
        .from(bookingRequests)
        .innerJoin(artists, eq(bookingRequests.artistId, artists.id))
        .where(
          and(
            eq(bookingRequests.status, "confirmed_by_client"),
            sql`${bookingRequests.eventDate}::date = CURRENT_DATE + 7`,
          ),
        );

      for (const { booking, artistName } of rows) {
        if (!booking.clientEmail) continue;
        try {
          await sendEmail({
            to: booking.clientEmail,
            subject: `Reminder: evenimentul tău cu ${artistName ?? "artist"} este în 7 zile!`,
            html: `
              <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px">
                <h2 style="color:#C9A84C;">Evenimentul tău se apropie!</h2>
                <p>Salut <strong>${booking.clientName}</strong>,</p>
                <p>Îți reamintim că evenimentul tău cu <strong>${artistName}</strong> este programat pe <strong>${booking.eventDate}</strong>.</p>
                <p>Verifică detaliile în cabinetul tău:</p>
                <p style="text-align:center;margin:24px 0">
                  <a href="${appUrl}/cabinet" style="display:inline-block;background:#C9A84C;color:#0D0D0D;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Deschide Cabinetul</a>
                </p>
              </div>
            `,
          });
        } catch (err) {
          console.error("[event-reminder-7d] failed for booking", booking.id, err);
        }
      }
      return { reminded: rows.length };
    });

    // 3b — send review request emails 1 day after the event
    await step.run("review-request-post-event", async () => {
      const rows = await db
        .select({
          booking: bookingRequests,
          artistName: artists.nameRo,
          artistSlug: artists.slug,
        })
        .from(bookingRequests)
        .innerJoin(artists, eq(bookingRequests.artistId, artists.id))
        .where(
          and(
            eq(bookingRequests.status, "confirmed_by_client"),
            sql`${bookingRequests.eventDate}::date = CURRENT_DATE - 1`,
          ),
        );

      for (const { booking, artistName, artistSlug } of rows) {
        if (!booking.clientEmail) continue;
        try {
          await sendEmail({
            to: booking.clientEmail,
            subject: `Cum a fost evenimentul cu ${artistName ?? "artist"}?`,
            html: reviewRequestEmail({
              clientName: booking.clientName,
              artistName: artistName ?? "Artist",
              eventDate: booking.eventDate,
              reviewUrl: `${appUrl}/artisti/${artistSlug}#recenzii`,
            }),
          });
        } catch (err) {
          console.error("[review-request] failed for booking", booking.id, err);
        }
      }
      return { reviewRequests: rows.length };
    });
  },
);

// ─────────────────────────────────────────────────────────
// M8 — Invitation RSVP reminders
// Daily cron. Picks guests whose host's event is in ~14, 7, or 3 days and
// who haven't responded yet, then emails them a one-click RSVP link.
// ─────────────────────────────────────────────────────────
export const invitationRsvpReminders = inngest.createFunction(
  {
    id: "invitation-rsvp-reminders",
    triggers: [{ cron: "0 10 * * *" }], // every day at 10:00 UTC
  },
  async ({ step }) => {
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md";

    for (const daysAhead of [14, 7, 3]) {
      await step.run(`remind-${daysAhead}d`, async () => {
        // Find invitations with eventDate exactly N days from now
        const rows = await db
          .select({
            guest: invitationGuests,
            invitation: invitations,
          })
          .from(invitationGuests)
          .innerJoin(
            invitations,
            eq(invitationGuests.invitationId, invitations.id),
          )
          .where(
            and(
              eq(invitations.status, "published"),
              eq(invitationGuests.rsvpStatus, "pending"),
              sql`${invitationGuests.email} IS NOT NULL`,
              sql`${invitations.eventDate}::date = CURRENT_DATE + ${daysAhead}::int`,
            ),
          );

        for (const { guest, invitation } of rows) {
          if (!guest.email || !guest.rsvpToken) continue;
          const title =
            invitation.coupleNames || invitation.hostName || "Eveniment";
          const rsvpUrl = `${appUrl}/i/${invitation.slug}?rsvp=${guest.rsvpToken}`;

          try {
            await sendEmail({
              to: guest.email,
              subject: `Reminder: Confirmă prezența la ${title} (în ${daysAhead} zile)`,
              html: `
                <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px">
                  <h2>Salut ${guest.name}!</h2>
                  <p>Îți reamintim cu drag că <strong>${title}</strong> are loc în doar <strong>${daysAhead} zile</strong>, pe <strong>${invitation.eventDate}</strong>.</p>
                  <p>Te rugăm să îți confirmi prezența accesând link-ul de mai jos:</p>
                  <p style="text-align:center;margin:30px 0">
                    <a href="${rsvpUrl}" style="display:inline-block;background:#d4a574;color:#111;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Confirmă prezența</a>
                  </p>
                  <p style="color:#666;font-size:13px">Sau copiază link-ul: ${rsvpUrl}</p>
                </div>
              `,
            });
            await db
              .update(invitationGuests)
              .set({
                remindersSent: (guest.remindersSent ?? 0) + 1,
                lastReminderAt: new Date(),
              })
              .where(eq(invitationGuests.id, guest.id));
          } catch (err) {
            console.error("[rsvp-reminder] failed for guest", guest.id, err);
          }
        }
        return { daysAhead, processed: rows.length };
      });
    }
  },
);

export const functions = [
  onLeadCreated,
  leadFollowUp,
  eventReminder,
  invitationRsvpReminders,
];
