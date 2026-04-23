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

export async function dispatchNotification(input: DispatchInput): Promise<void> {
  try {
    // In-app notification — always inserted regardless of email preference.
    await db.insert(notifications).values({
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      actionUrl: input.actionUrl,
    });

    // Web Push — fire-and-forget in parallel with email. No frequency gate:
    // push is instant by nature (if user wanted quiet, they'd turn it off in
    // the browser). Safe no-op when VAPID keys aren't configured or the user
    // has no active subscriptions.
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

    // Email — gated by the recipient's digest frequency preference, EXCEPT
    // for time-sensitive event types which always fire instantly.
    if (input.email && input.emailHtml) {
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
