import { inngest } from "./client";
import { sendEmail } from "@/lib/email/send";
import { leadConfirmationEmail } from "@/lib/email/templates/lead-confirmation";
import { adminNotificationEmail } from "@/lib/email/templates/admin-notification";
import { reviewRequestEmail } from "@/lib/email/templates/review-request";
import { db } from "@/lib/db";
import {
  bookingRequests,
  artists,
  invitations,
  invitationGuests,
  users,
  venues,
  calendarEvents,
} from "@/lib/db/schema";
import { and, eq, sql, isNotNull, inArray } from "drizzle-orm";
import {
  refreshAccessToken,
  fetchUpcomingEvents,
  expandDays,
} from "@/lib/google/calendar";
import { revealInvitationGuestRecord } from "@/lib/privacy/guest-encryption";
import { isGuestTokenActive } from "@/lib/invitations/access";

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

        for (const { guest: storedGuest, invitation } of rows) {
          const guest = revealInvitationGuestRecord(storedGuest);
          if (
            !guest.email ||
            !guest.rsvpToken ||
            !isGuestTokenActive(storedGuest)
          ) continue;
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

// ─────────────────────────────────────────────────────────
// Tentative-hold auto-expiry — spec F21.
//
// Bookings that land in status "pending" are effectively blocking the
// vendor's attention. If the vendor doesn't accept or reject within
// 24h, we auto-mark them as "expired" so:
//   - The client gets notified their request timed out and can retry
//   - The vendor's inbox stays clean (clear signal: this one is dead)
//   - The calendar/occupancy reports don't count zombie pending requests
//
// The "expired" status is introduced as a terminal state — no further
// transitions. Clients CAN create a new booking request for the same
// date; this is just moving dust out of the pending pile.
//
// Runs hourly to keep the cron cheap; since the action is idempotent
// (no-op if already expired) an occasional double-tick is fine.
// ─────────────────────────────────────────────────────────
export const expirePendingBookings = inngest.createFunction(
  {
    id: "expire-pending-bookings-24h",
    triggers: [{ cron: "0 * * * *" }], // top of every hour
  },
  async ({ step }) => {
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md";

    return await step.run("expire-stale-pending", async () => {
      // Two windows: 24h for artists, 72h for venues. Combined into a
      // single OR clause so the cron stays a one-shot read+write.
      const expireClause = sql`(
        (${bookingRequests.artistId} IS NOT NULL
          AND ${bookingRequests.createdAt} < NOW() - INTERVAL '24 hours')
        OR
        (${bookingRequests.venueId} IS NOT NULL
          AND ${bookingRequests.createdAt} < NOW() - INTERVAL '72 hours')
      )`;
      const stale = await db
        .select({
          id: bookingRequests.id,
          clientEmail: bookingRequests.clientEmail,
          clientName: bookingRequests.clientName,
          eventDate: bookingRequests.eventDate,
          artistId: bookingRequests.artistId,
          venueId: bookingRequests.venueId,
        })
        .from(bookingRequests)
        .where(and(eq(bookingRequests.status, "pending"), expireClause));

      if (stale.length === 0) return { expired: 0 };

      // Flip to "expired" in one statement.
      await db
        .update(bookingRequests)
        .set({ status: "expired", updatedAt: new Date() })
        .where(and(eq(bookingRequests.status, "pending"), expireClause));

      // Best-effort email to the client — continue on failure.
      for (const b of stale) {
        if (!b.clientEmail) continue;
        try {
          await sendEmail({
            to: b.clientEmail,
            subject: "Rezervarea ta a expirat — nu te descuraja",
            html: `
              <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px">
                <h2 style="color:#C9A84C;">Hi ${b.clientName},</h2>
                <p>Din păcate, rezervarea ta din <strong>${b.eventDate}</strong> nu a primit răspuns din partea furnizorului în 48 de ore, așa că am marcat-o ca expirată.</p>
                <p>Nu te îngrijora — poți trimite o nouă cerere oricând (sau către alt furnizor disponibil):</p>
                <p style="text-align:center;margin:24px 0">
                  <a href="${appUrl}/artisti" style="display:inline-block;background:#C9A84C;color:#0D0D0D;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">Explorează alți artiști</a>
                </p>
                <p style="color:#777;font-size:13px">Dacă ai primit deja un răspuns pe alt canal, poți ignora acest email.</p>
              </div>
            `,
          });
        } catch (err) {
          console.error(
            "[expire-pending] email notify failed for booking",
            b.id,
            err,
          );
        }
      }

      return { expired: stale.length };
    });
  },
);

/**
 * Google Calendar pull sync — spec section 2.6.
 *
 * Every 15 minutes, iterate over users with a refresh token, refresh their
 * access token, fetch upcoming events, and upsert each day as a `blocked`
 * row in `calendar_events` for every artist + venue they own.
 *
 * Strategy:
 *  - Only rows with `source = 'google_sync'` are managed here. Manual
 *    blocks and booking-created blocks are never touched.
 *  - On each run we first delete the user's existing google_sync rows
 *    for the sync window ([today, +90d]), then reinsert from the fresh
 *    feed. This mirrors the upstream state exactly — cancelled/moved
 *    events disappear, new events appear.
 */
export const googleCalendarSync = inngest.createFunction(
  {
    id: "google-calendar-sync",
    triggers: [{ cron: "*/15 * * * *" }],
    concurrency: { limit: 4 }, // throttle so we don't hammer Google's API
  },
  async ({ step }) => {
    return await step.run("pull-google-events", async () => {
      const connected = await db
        .select({ id: users.id })
        .from(users)
        .where(isNotNull(users.googleRefreshToken));

      if (connected.length === 0) return { synced: 0 };

      const today = new Date().toISOString().slice(0, 10);
      const windowEnd = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      let totalEvents = 0;
      let totalDays = 0;
      let totalUsers = 0;
      const failures: string[] = [];

      for (const u of connected) {
        try {
          const token = await refreshAccessToken(u.id);
          if (!token) continue; // refresh token revoked or missing creds
          const events = await fetchUpcomingEvents(token);

          // Resolve entities this user owns
          const [ownedArtists, ownedVenues] = await Promise.all([
            db
              .select({ id: artists.id })
              .from(artists)
              .where(eq(artists.userId, u.id)),
            db
              .select({ id: venues.id })
              .from(venues)
              .where(eq(venues.userId, u.id)),
          ]);

          if (ownedArtists.length === 0 && ownedVenues.length === 0) continue;

          // Clear existing google_sync rows in the window for each entity.
          const artistIds = ownedArtists.map((a) => a.id);
          const venueIds = ownedVenues.map((v) => v.id);
          if (artistIds.length > 0) {
            await db
              .delete(calendarEvents)
              .where(
                and(
                  eq(calendarEvents.entityType, "artist"),
                  inArray(calendarEvents.entityId, artistIds),
                  eq(calendarEvents.source, "google_sync"),
                  sql`${calendarEvents.date} >= ${today}`,
                  sql`${calendarEvents.date} <= ${windowEnd}`,
                ),
              );
          }
          if (venueIds.length > 0) {
            await db
              .delete(calendarEvents)
              .where(
                and(
                  eq(calendarEvents.entityType, "venue"),
                  inArray(calendarEvents.entityId, venueIds),
                  eq(calendarEvents.source, "google_sync"),
                  sql`${calendarEvents.date} >= ${today}`,
                  sql`${calendarEvents.date} <= ${windowEnd}`,
                ),
              );
          }

          // Expand events to days, dedupe, bulk insert per entity.
          const allDays = new Set<string>();
          const noteByDay = new Map<string, string>();
          for (const ev of events) {
            const days = expandDays(ev.start, ev.end);
            for (const d of days) {
              if (d < today || d > windowEnd) continue;
              allDays.add(d);
              // First summary wins on a given day
              if (!noteByDay.has(d)) noteByDay.set(d, ev.summary.slice(0, 200));
            }
          }

          const rowsToInsert: Array<{
            entityType: "artist" | "venue";
            entityId: number;
            date: string;
            status: "blocked";
            source: "google_sync";
            note: string;
          }> = [];
          for (const d of allDays) {
            for (const aid of artistIds) {
              rowsToInsert.push({
                entityType: "artist",
                entityId: aid,
                date: d,
                status: "blocked",
                source: "google_sync",
                note: `Google: ${noteByDay.get(d) ?? "Ocupat"}`,
              });
            }
            for (const vid of venueIds) {
              rowsToInsert.push({
                entityType: "venue",
                entityId: vid,
                date: d,
                status: "blocked",
                source: "google_sync",
                note: `Google: ${noteByDay.get(d) ?? "Ocupat"}`,
              });
            }
          }

          if (rowsToInsert.length > 0) {
            await db.insert(calendarEvents).values(rowsToInsert);
          }

          totalEvents += events.length;
          totalDays += allDays.size;
          totalUsers += 1;
        } catch (err) {
          console.error("[google-sync] user failed", u.id, err);
          failures.push(u.id);
        }
      }

      return {
        synced: totalUsers,
        events: totalEvents,
        days: totalDays,
        failures: failures.length,
      };
    });
  },
);

export const functions = [
  onLeadCreated,
  leadFollowUp,
  eventReminder,
  invitationRsvpReminders,
  expirePendingBookings,
  googleCalendarSync,
];
