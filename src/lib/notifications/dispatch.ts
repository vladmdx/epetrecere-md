// M5 — In-app notification dispatcher + email.
//
// Enqueues an in-app notification row and optionally sends an email.
// Swallows errors so notification failures never break the triggering action.
//
// Digest frequency: user-level setting in `users.notificationDigestFrequency`
// controls email cadence:
//   - "instant" (default) — email sent immediately
//   - "daily"  — skip email now; a cron batches them into a daily digest
//   - "weekly" — skip email now; cron batches weekly
// The in-app notification row is ALWAYS inserted (it's the real source of
// truth); only email delivery is gated by the frequency.
//
// Critical event types (booking confirmations, rejections, direct messages)
// bypass the digest and always email instantly — they are time-sensitive.

import { db } from "@/lib/db";
import { notifications, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const CRITICAL_TYPES = new Set<string>([
  "booking_request_status_changed",
  "booking_status_changed",
  "registration_approved",
  "registration_rejected",
]);

export type NotificationType =
  // Vendor (Artist / Venue)
  | "lead_new"
  | "lead_unlocked"
  | "booking_request_new"
  | "booking_request_status_changed"
  | "review_new"
  // Client
  | "booking_status_changed"
  | "review_request"
  | "photo_approved"
  // Admin
  | "admin_photo_pending"
  | "admin_review_pending"
  | "admin_lead_new"
  // Registration
  | "artist_registered"
  | "venue_registered"
  | "registration_approved"
  | "registration_rejected";

export interface DispatchInput {
  userId: string;
  type: NotificationType | string;
  title: string;
  message?: string;
  actionUrl?: string;
  /** Optional: also send an email to this address */
  email?: string;
  /** Optional: email subject (defaults to title) */
  emailSubject?: string;
  /** Optional: email HTML body */
  emailHtml?: string;
}

/**
 * Resolve the recipient's per-type channel preferences. Missing keys (or
 * missing user row) default to BOTH channels ON, so existing behavior is
 * preserved for users who haven't opened Setări yet.
 *
 * Maps internal `type` strings to user-facing categories so the toggle UI
 * can stay small (5 rows) while still gating every distinct event type.
 */
export const NOTIFICATION_CATEGORIES = [
  "booking_requests", // cerere nouă + conflict
  "booking_updates", // accept/reject/cancel/complete
  "messages", // chat — currently shares booking_* types in dispatch
  "reviews", // review new + request
  "reminders", // event reminders, rsvp, misc
] as const;

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

const CATEGORY_BY_TYPE: Record<string, NotificationCategory> = {
  // Booking new requests / conflicts
  booking_request_new: "booking_requests",
  booking_conflict: "booking_requests",
  admin_lead_new: "booking_requests",
  admin_lead_conflict: "booking_requests",
  // Updates on existing bookings
  booking_request_status_changed: "booking_updates",
  booking_status_changed: "booking_updates",
  // Reviews
  review_new: "reviews",
  review_request: "reviews",
  admin_review_pending: "reviews",
  // Reminders / generic
  reminder: "reminders",
};

function categoryOf(type: string): NotificationCategory | null {
  return CATEGORY_BY_TYPE[type] ?? null;
}

async function resolvePrefs(
  userId: string,
  type: string,
): Promise<{ email: boolean; push: boolean }> {
  const [row] = await db
    .select({ prefs: users.notificationPrefs })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const prefs = (row?.prefs ?? {}) as Record<
    string,
    { email?: boolean; push?: boolean } | undefined
  >;
  const cat = categoryOf(type);
  // Per-type override wins, then category, then default ON.
  const typeOverride = prefs[type];
  const catOverride = cat ? prefs[cat] : undefined;
  return {
    email: typeOverride?.email ?? catOverride?.email ?? true,
    push: typeOverride?.push ?? catOverride?.push ?? true,
  };
}

export async function dispatchNotification(input: DispatchInput): Promise<void> {
  try {
    // In-app notification — always inserted regardless of channel prefs.
    // Users can still see them in the bell dropdown even if they muted
    // email + push for that category.
    await db.insert(notifications).values({
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      actionUrl: input.actionUrl,
    });

    const prefs = await resolvePrefs(input.userId, String(input.type));

    // Web Push — gated by the recipient's push preference for this type's
    // category. Still fire-and-forget so a slow push API doesn't stall.
    if (prefs.push) {
      void (async () => {
        try {
          const { sendPushToUser } = await import("@/lib/push/send");
          await sendPushToUser(input.userId, {
            title: input.title,
            body: input.message ?? "",
            actionUrl: input.actionUrl ?? "/",
            tag: String(input.type),
          });
        } catch (err) {
          console.error("[notifications] push failed:", err);
        }
      })();
    }

    // WhatsApp — only for critical time-sensitive events. Fire-and-forget.
    // Safe no-op when WhatsApp env vars or user.phone are missing.
    if (CRITICAL_TYPES.has(String(input.type))) {
      void (async () => {
        try {
          const { sendWhatsAppToUser } = await import("@/lib/whatsapp/send");
          await sendWhatsAppToUser(input.userId, {
            title: input.title,
            body: input.message ?? "",
            actionUrl: input.actionUrl,
          });
        } catch (err) {
          console.error("[notifications] whatsapp failed:", err);
        }
      })();
    }

    // Email — gated by (a) per-type preference and (b) the digest
    // frequency, unless the event is critical (time-sensitive updates
    // that always ship instantly).
    if (input.email && input.emailHtml && prefs.email) {
      const isCritical = CRITICAL_TYPES.has(String(input.type));
      let shouldEmailNow = true;
      if (!isCritical) {
        const [userRow] = await db
          .select({ freq: users.notificationDigestFrequency })
          .from(users)
          .where(eq(users.id, input.userId))
          .limit(1);
        const freq = (userRow?.freq ?? "instant").toLowerCase();
        if (freq === "daily" || freq === "weekly") {
          // Queued for digest cron — skip immediate send. The notification row
          // above is the source of truth the cron reads from.
          shouldEmailNow = false;
        }
      }
      if (shouldEmailNow) {
        const { sendEmail } = await import("@/lib/email/send");
        await sendEmail({
          to: input.email,
          subject: input.emailSubject || input.title,
          html: input.emailHtml,
        }).catch((err) =>
          console.error("[notifications] email failed:", err),
        );
      }
    }
  } catch (err) {
    console.error("[notifications] dispatch failed", err);
  }
}

/** Dispatch to every admin / super_admin user (in-app + optional email). */
export async function dispatchToAdmins(
  input: Omit<DispatchInput, "userId" | "email"> & { emailHtml?: string; emailSubject?: string },
): Promise<void> {
  try {
    const { or } = await import("drizzle-orm");
    const admins = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(or(eq(users.role, "admin"), eq(users.role, "super_admin")));
    await Promise.all(
      admins.map((u) =>
        dispatchNotification({
          ...input,
          userId: u.id,
          email: input.emailHtml ? (u.email ?? undefined) : undefined,
        }),
      ),
    );
  } catch (err) {
    console.error("[notifications] admin dispatch failed", err);
  }
}
