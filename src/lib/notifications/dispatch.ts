// M5 — In-app notification dispatcher + email.
//
// Enqueues an in-app notification row and optionally sends an email.
// Swallows errors so notification failures never break the triggering action.

import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";

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
    // In-app notification
    await db.insert(notifications).values({
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      actionUrl: input.actionUrl,
    });

    // Email (if provided)
    if (input.email && input.emailHtml) {
      const { sendEmail } = await import("@/lib/email/send");
      await sendEmail({
        to: input.email,
        subject: input.emailSubject || input.title,
        html: input.emailHtml,
      }).catch((err) =>
        console.error("[notifications] email failed:", err),
      );
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
    const { users } = await import("@/lib/db/schema");
    const { or, eq } = await import("drizzle-orm");
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
