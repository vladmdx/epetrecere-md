// M5 — In-app notification dispatcher.
//
// Small helper used by server routes / background workflows to enqueue a
// notification row for a given user. Swallows errors so notification
// failures never break the triggering action (it's a nice-to-have channel,
// not a source of truth).

import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";

export type NotificationType =
  // Vendor
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
  | "admin_lead_new";

export interface DispatchInput {
  userId: string;
  type: NotificationType;
  title: string;
  message?: string;
  actionUrl?: string;
}

export async function dispatchNotification(input: DispatchInput): Promise<void> {
  try {
    await db.insert(notifications).values({
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      actionUrl: input.actionUrl,
    });
  } catch (err) {
    // Never throw from notification dispatch — log & move on
    console.error("[notifications] dispatch failed", err);
  }
}

/** Dispatch to every admin / super_admin user. */
export async function dispatchToAdmins(
  input: Omit<DispatchInput, "userId">,
): Promise<void> {
  try {
    const { users } = await import("@/lib/db/schema");
    const { or, eq } = await import("drizzle-orm");
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(or(eq(users.role, "admin"), eq(users.role, "super_admin")));
    await Promise.all(
      admins.map((u) => dispatchNotification({ ...input, userId: u.id })),
    );
  } catch (err) {
    console.error("[notifications] admin dispatch failed", err);
  }
}
