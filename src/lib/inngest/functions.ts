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
} from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import {
  createGoogleCalendarSyncWindow,
  refreshAccessToken,
  fetchUpcomingEvents,
} from "@/lib/google/calendar";
import { revealInvitationGuestRecord } from "@/lib/privacy/guest-encryption";
import { isGuestTokenActive } from "@/lib/invitations/access";
import { drainConfirmationNotificationOutbox } from "@/lib/booking/confirmation-effects";
import { drainBookingCreationNotificationOutbox } from "@/lib/booking/booking-create-effects";
import { retryPendingLegalContractDeliveries } from "@/lib/legal/contract-delivery";
import { drainRegistrationEmails } from "@/lib/notifications/registration-email";
import {
  buildGoogleCalendarEntityPlans,
  clearGoogleCalendarOrphanProjection,
  fetchGoogleCalendarContributorFeeds,
  replaceGoogleCalendarEntityProjection,
  resolveGoogleCalendarOrphanProjections,
  resolveGoogleCalendarJobSnapshot,
  type GoogleCalendarContributorCredential,
} from "@/lib/google/calendar-sync";
import { drainAccountAssetErasureOutbox } from "@/lib/privacy/account-asset-erasure";
import { drainAccountErasureIdentityOutbox } from "@/lib/privacy/account-erasure-identity";
import { reconcileOnboardedReferrals } from "@/lib/referrals/trigger";
import {
  createServerLogCorrelationId,
  safeServerErrorLog,
} from "@/lib/safe-server-log";

const SAFE_GOOGLE_SYNC_ERROR_CODES = new Set([
  "23502",
  "23503",
  "23505",
  "23514",
  "40001",
  "40P01",
  "55P03",
  "57014",
]);

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

// Durable booking creation + confirmation effects. `after()` gives the fast
// path; this poller recovers a process crash before/after that callback. A
// daily Vercel cron is the Hobby-compatible fallback when Inngest is down.
export const bookingConfirmationOutbox = inngest.createFunction(
  {
    id: "booking-confirmation-outbox",
    triggers: [{ cron: "*/5 * * * *" }],
    concurrency: { limit: 1 },
  },
  async ({ step }) => {
    return step.run("deliver-booking-confirmations", async () => {
      const referrals = await reconcileOnboardedReferrals({ limit: 25 });
      const confirmation = await drainConfirmationNotificationOutbox({ limit: 50 });
      const creation = await drainBookingCreationNotificationOutbox({ limit: 50 });
      // Preserve the legacy top-level confirmation summary consumed by
      // monitoring/tests while exposing creation health alongside it.
      const result = { ...confirmation, creation, referrals };
      // Throw inside the step so Inngest re-executes the drain on retry instead
      // of memoizing an unhealthy successful step result.
      if (
        confirmation.failed > 0
        || confirmation.failedBacklog > 0
        || confirmation.newlyReportedTerminal > 0
        || creation.failed > 0
        || creation.failedBacklog > 0
        || creation.newlyReportedTerminal > 0
        || referrals.failed > 0
      ) {
        throw new Error(`booking_confirmation_outbox_unhealthy:${JSON.stringify(result)}`);
      }
      return result;
    });
  },
);

// Account erasure commits only durable deletion intent. This worker performs
// the fallible Blob call after commit and retries it with a fenced lease.
export const accountAssetErasureOutbox = inngest.createFunction(
  {
    id: "account-asset-erasure-outbox",
    triggers: [{ cron: "*/5 * * * *" }],
    concurrency: { limit: 1 },
  },
  async ({ step }) =>
    step.run("delete-account-blob-assets", async () => {
      const result = await drainAccountAssetErasureOutbox({ limit: 10 });
      if (
        result.failed > 0
        || result.deadLettered > 0
        || result.leaseLost > 0
      ) {
        throw new Error(
          `account_asset_erasure_outbox_unhealthy:${JSON.stringify(result)}`,
        );
      }
      return result;
    }),
);

// A local erasure is final even if Clerk is temporarily unavailable. Retry
// the provider deletion until it succeeds (or confirms 404), then discard the
// raw Clerk id while retaining only its HMAC tombstone.
export const accountErasureIdentityOutboxWorker = inngest.createFunction(
  {
    id: "account-erasure-identity-outbox",
    triggers: [{ cron: "*/5 * * * *" }],
    concurrency: { limit: 1 },
  },
  async ({ step }) =>
    step.run("delete-erased-clerk-identities", async () => {
      const result = await drainAccountErasureIdentityOutbox({ limit: 2 });
      if (result.failed > 0) {
        throw new Error(
          `account_erasure_identity_outbox_unhealthy:failed=${result.failed};selected=${result.selected}`,
        );
      }
      return result;
    }),
);

// Durable administrator email recovery after a venue is submitted for review.
export const retryRegistrationEmails = inngest.createFunction(
  { id: "retry-registration-emails", triggers: [{ cron: "*/5 * * * *" }], concurrency: { limit: 1 } },
  async ({ step }) => step.run("deliver-registration-emails", async () => {
    const result = await drainRegistrationEmails({ limit: 10 });
    if (result.failed || result.deadLetterBacklog) throw new Error("registration_email_queue_unhealthy");
    return result;
  }),
);

// Durable legal-delivery recovery. The request path tries immediately via
// after(), while this worker guarantees that a transient PDF/email failure is
// not left permanently pending when the signer never submits again.
export const retryLegalContractDeliveries = inngest.createFunction(
  {
    id: "retry-legal-contract-deliveries",
    triggers: [{ cron: "*/10 * * * *" }],
    concurrency: { limit: 1 },
  },
  async ({ step }) =>
    step.run("deliver-pending-legal-contracts", async () => {
      const result = await retryPendingLegalContractDeliveries(20);
      if (
        result.failed > 0
        || result.newlyDeadLettered > 0
        || result.deadLetterBacklog > 0
      ) {
        throw new Error(
          `legal_contract_delivery_unhealthy:failed=${result.failed};newly_dead_lettered=${result.newlyDeadLettered};dead_letter_backlog=${result.deadLetterBacklog};inspected=${result.inspected}`,
        );
      }
      return result;
    }),
);

/**
 * Google Calendar pull sync — spec section 2.6.
 *
 * Every 15 minutes, snapshot the exact contributors for every artist/venue,
 * fetch each contributor once, union successful feeds per entity, then make
 * at most one atomic replacement per entity.
 *
 * Strategy:
 *  - Only rows with `source = 'google_sync'` are managed here. Manual
 *    blocks and booking-created blocks are never touched.
 *  - If any current contributor fails, that entity's previous projection is
 *    preserved. Other independent entities can still update.
 *  - Zero current contributors produces an empty replacement, clearing stale
 *    rows after token/membership removal or artist ownership transfer.
 *  - Every provider request finishes before the first replacement transaction.
 *    Each transaction rechecks the exact contributor/authority snapshot.
 */
export const googleCalendarSync = inngest.createFunction(
  {
    id: "google-calendar-sync",
    triggers: [{ cron: "*/15 * * * *" }],
    // A single job-wide snapshot must not be overtaken by an older overlapping
    // run. Provider calls inside the run are already sequential and bounded.
    concurrency: { limit: 1 },
  },
  async ({ step }) => {
    return await step.run("pull-google-events", async () => {
      const syncWindow = createGoogleCalendarSyncWindow(new Date());
      const windowDates = [...syncWindow.dates];
      // Polymorphic calendar rows do not have a database FK. Clear a bounded
      // batch of rows whose artist/venue was deleted, using the same entity/day
      // locks as every other calendar writer and a post-lock parent recheck.
      const orphanProjections = await resolveGoogleCalendarOrphanProjections();
      let orphanRowsCleared = 0;
      let orphanFailures = 0;
      for (const orphan of orphanProjections) {
        try {
          await clearGoogleCalendarOrphanProjection(orphan);
          orphanRowsCleared += orphan.existingDates.length;
        } catch (error) {
          const correlationId = createServerLogCorrelationId();
          console.error("[google-sync] orphan projection cleanup failed", {
            entityType: orphan.entityType,
            ...safeServerErrorLog(error, {
              correlationId,
              allowedCodes: SAFE_GOOGLE_SYNC_ERROR_CODES,
            }),
          });
          orphanFailures += 1;
        }
      }

      const snapshots = await resolveGoogleCalendarJobSnapshot();
      if (snapshots.length === 0) {
        return {
          synced: 0,
          entities: 0,
          orphanRowsCleared,
          orphanFailures,
        };
      }

      const contributorCredentialsByUser = new Map<
        string,
        GoogleCalendarContributorCredential
      >();
      for (const credential of snapshots.flatMap(
        (snapshot) => snapshot.contributorCredentials,
      )) {
        const existing = contributorCredentialsByUser.get(credential.userId);
        if (
          existing
          && existing.credentialFingerprint !== credential.credentialFingerprint
        ) {
          throw new Error("google_calendar_snapshot_credential_conflict");
        }
        contributorCredentialsByUser.set(credential.userId, credential);
      }
      const contributorCredentials = [...contributorCredentialsByUser.values()];
      // All network work is complete before any replacement transaction opens.
      const feeds = await fetchGoogleCalendarContributorFeeds(
        contributorCredentials,
        async (contributor) => {
          const credential = await refreshAccessToken(contributor.userId, {
            expectedCredentialFingerprint: contributor.credentialFingerprint,
          });
          if (!credential) throw new Error("google_calendar_token_unavailable");
          const events = await fetchUpcomingEvents(credential.accessToken, {
            window: syncWindow,
          });
          return {
            events,
            credentialFingerprint: credential.credentialFingerprint,
          };
        },
      );
      const plans = buildGoogleCalendarEntityPlans({
        snapshots,
        feeds,
        windowDates,
      });

      let replaced = 0;
      let cleared = 0;
      let preserved = 0;
      let failed = 0;
      let totalEvents = 0;
      let totalDays = 0;
      for (const plan of plans) {
        if (plan.action === "preserve") {
          preserved += 1;
          if (plan.reason === "work_limit") failed += 1;
          continue;
        }
        try {
          await replaceGoogleCalendarEntityProjection(plan);
          replaced += 1;
          totalEvents += plan.eventCount;
          totalDays += plan.dayNotes.size;
          if (
            plan.snapshot.contributorUserIds.length === 0
            && plan.snapshot.existingDates.length > 0
          ) {
            cleared += 1;
          }
        } catch (error) {
          // An authority change is expected to abort before DELETE; the next
          // cron run will take a fresh graph. Keep processing other entities.
          const correlationId = createServerLogCorrelationId();
          console.error("[google-sync] entity replacement failed", {
            entityType: plan.snapshot.entityType,
            ...safeServerErrorLog(error, {
              correlationId,
              allowedCodes: SAFE_GOOGLE_SYNC_ERROR_CODES,
            }),
          });
          failed += 1;
        }
      }

      return {
        synced: replaced,
        entities: plans.length,
        contributors: contributorCredentials.length,
        events: totalEvents,
        days: totalDays,
        cleared,
        orphanRowsCleared,
        orphanFailures,
        preserved,
        failures: failed
          + orphanFailures
          + [...feeds.values()].filter((feed) => !feed.ok).length,
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
  bookingConfirmationOutbox,
  accountAssetErasureOutbox,
  accountErasureIdentityOutboxWorker,
  retryLegalContractDeliveries,
  retryRegistrationEmails,
  googleCalendarSync,
];
