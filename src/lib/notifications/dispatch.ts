// M5 — In-app notification dispatcher + email.
//
// Enqueues an in-app notification row and optionally sends external channels.
// Normal calls stay best-effort. Durable outbox calls surface provider errors
// so the worker can record a failed attempt and retry later.
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
  /** Durable idempotency key (unique per user). */
  dedupeKey?: string;
}

type PushResult = { sent: number; pruned: number; failed?: number };
type WhatsAppResult = { sent: boolean; reason?: string };
export type NotificationProviderOptions = {
  /** Stable outbox delivery key. Resend maps this to Idempotency-Key. */
  idempotencyKey?: string;
  /** Abortable adapters should stop provider I/O when this fires. */
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Reuse the booking dispatch transaction instead of checking out another pool socket. */
  executor?: typeof db;
};

export interface DispatchOptions {
  /**
   * Durable callers retry external channels from an outbox. In this mode a
   * duplicate in-app row does not suppress email/push and provider failures
   * are returned to the worker instead of being swallowed.
   */
  delivery?: "best-effort" | "durable";
  /** Test seam; production callers use the lazily imported channel drivers. */
  drivers?: {
    sendPushToUser?: (
      userId: string,
      payload: { title: string; body?: string; actionUrl?: string; tag?: string },
      options?: NotificationProviderOptions,
    ) => Promise<PushResult>;
    sendWhatsAppToUser?: (
      userId: string,
      payload: { title: string; body: string; actionUrl?: string },
      options?: NotificationProviderOptions,
    ) => Promise<WhatsAppResult>;
    sendEmail?: (input: {
      to: string;
      subject: string;
      html: string;
      idempotencyKey?: string;
      signal?: AbortSignal;
    }) => Promise<unknown>;
  };
}

export type NotificationChannel = "in_app" | "push" | "whatsapp" | "email";
export type NotificationChannelDrivers = NonNullable<DispatchOptions["drivers"]>;

async function withProviderDeadline<T>(
  timeoutMs: number,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new Error("notification_provider_timeout"));
  }, timeoutMs);
  timer.unref?.();
  try {
    // Every production external-channel adapter is abortable. Await its
    // cancellation settlement rather than racing away from live provider I/O;
    // booking cancellation/account erasure may release their barrier only
    // after the underlying transport has actually stopped.
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
  }
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
  executor: typeof db = db,
): Promise<{ email: boolean; push: boolean }> {
  const [row] = await executor
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

function providerError(result: unknown): unknown {
  if (!result || typeof result !== "object" || !("error" in result)) return null;
  return (result as { error?: unknown }).error ?? null;
}

/**
 * Freeze the enabled channel set when a durable notification is expanded.
 * Retries then operate only on the individual rows created for these channels.
 */
export async function resolveNotificationChannels(
  input: DispatchInput,
  executor: typeof db = db,
): Promise<NotificationChannel[]> {
  const prefs = await resolvePrefs(input.userId, String(input.type), executor);
  const channels: NotificationChannel[] = ["in_app"];
  if (prefs.push) channels.push("push");
  if (CRITICAL_TYPES.has(String(input.type))) channels.push("whatsapp");
  if (input.email && input.emailHtml && prefs.email) {
    const isCritical = CRITICAL_TYPES.has(String(input.type));
    let shouldEmailNow = true;
    if (!isCritical) {
      const [userRow] = await executor
        .select({ freq: users.notificationDigestFrequency })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      const frequency = (userRow?.freq ?? "instant").toLowerCase();
      shouldEmailNow = frequency !== "daily" && frequency !== "weekly";
    }
    if (shouldEmailNow) channels.push("email");
  }
  return channels;
}

/**
 * Deliver one frozen channel. Database notification insertion is exactly-once
 * through its unique dedupe key. Resend also accepts the stable key at the
 * provider boundary. Web Push and WhatsApp expose no equivalent guarantee,
 * so a crash after provider acceptance but before our DB commit remains the
 * unavoidable at-least-once duplicate window for those two channels.
 */
export async function dispatchNotificationChannel(
  input: DispatchInput,
  channel: NotificationChannel,
  drivers: NotificationChannelDrivers = {},
  options: NotificationProviderOptions = {},
): Promise<void> {
  if (!input.dedupeKey) {
    throw new Error("durable_notification_requires_dedupe_key");
  }
  if (channel === "in_app") {
    await (options.executor ?? db)
      .insert(notifications)
      .values({
        userId: input.userId,
        type: input.type,
        title: input.title,
        message: input.message,
        actionUrl: input.actionUrl,
        dedupeKey: input.dedupeKey,
      })
      .onConflictDoNothing();
    return;
  }
  if (channel === "push") {
    const sender = drivers.sendPushToUser
      ?? (await import("@/lib/push/send")).sendPushToUser;
    const result = await withProviderDeadline(options.timeoutMs ?? 15_000, (signal) =>
      sender(input.userId, {
        title: input.title,
        body: input.message ?? "",
        actionUrl: input.actionUrl ?? "/",
        tag: String(input.type),
      }, {
        signal,
        timeoutMs: options.timeoutMs,
        idempotencyKey: options.idempotencyKey,
        executor: options.executor,
      }));
    if ((result.failed ?? 0) > 0) {
      throw new Error(`push_delivery_failed:${result.failed}`);
    }
    return;
  }
  if (channel === "whatsapp") {
    const sender = drivers.sendWhatsAppToUser
      ?? (await import("@/lib/whatsapp/send")).sendWhatsAppToUser;
    const result = await withProviderDeadline(options.timeoutMs ?? 15_000, (signal) =>
      sender(input.userId, {
        title: input.title,
        body: input.message ?? "",
        actionUrl: input.actionUrl,
      }, {
        signal,
        timeoutMs: options.timeoutMs,
        idempotencyKey: options.idempotencyKey,
        executor: options.executor,
      }));
    if (result.reason === "api-error") {
      throw new Error("whatsapp_delivery_failed");
    }
    return;
  }
  if (!input.email || !input.emailHtml) {
    throw new Error("email_payload_missing");
  }
  const sender = drivers.sendEmail ?? (await import("@/lib/email/send")).sendEmail;
  const result = await withProviderDeadline(options.timeoutMs ?? 15_000, (signal) => sender({
    to: input.email!,
    subject: input.emailSubject || input.title,
    html: input.emailHtml!,
    idempotencyKey: options.idempotencyKey,
    signal,
  }));
  const error = providerError(result);
  if (error) throw new Error("email_delivery_failed", { cause: error });
}

async function performDispatch(
  input: DispatchInput,
  options: DispatchOptions,
): Promise<void> {
  const durable = options.delivery === "durable";
  if (durable && !input.dedupeKey) {
    throw new Error("durable_notification_requires_dedupe_key");
  }

  // In-app notification — exactly once when a durable dedupe key is present.
  const inserted = await db.insert(notifications).values({
    userId: input.userId,
    type: input.type,
    title: input.title,
    message: input.message,
    actionUrl: input.actionUrl,
    dedupeKey: input.dedupeKey ?? null,
  }).onConflictDoNothing().returning({ id: notifications.id });
  // Legacy/best-effort calls preserve the old behavior. Durable retries must
  // continue to the external channels even though their DB row already exists.
  if (!durable && input.dedupeKey && inserted.length === 0) return;

  const prefs = await resolvePrefs(input.userId, String(input.type));
  const durableDeliveries: Array<() => Promise<void>> = [];
  const push = async () => {
    const sender = options.drivers?.sendPushToUser
      ?? (await import("@/lib/push/send")).sendPushToUser;
    const result = await sender(input.userId, {
      title: input.title,
      body: input.message ?? "",
      actionUrl: input.actionUrl ?? "/",
      tag: String(input.type),
    });
    if ((result.failed ?? 0) > 0) {
      throw new Error(`push_delivery_failed:${result.failed}`);
    }
  };
  if (prefs.push) {
    if (durable) durableDeliveries.push(push);
    else void push().catch((error) => console.error("[notifications] push failed:", error));
  }

  const whatsapp = async () => {
    const sender = options.drivers?.sendWhatsAppToUser
      ?? (await import("@/lib/whatsapp/send")).sendWhatsAppToUser;
    const result = await sender(input.userId, {
      title: input.title,
      body: input.message ?? "",
      actionUrl: input.actionUrl,
    });
    if (result.reason === "api-error") throw new Error("whatsapp_delivery_failed");
  };
  if (CRITICAL_TYPES.has(String(input.type))) {
    if (durable) durableDeliveries.push(whatsapp);
    else void whatsapp().catch((error) => console.error("[notifications] whatsapp failed:", error));
  }

  // Email — gated by preferences and digest cadence. Critical confirmation
  // messages bypass the digest as before.
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
      if (freq === "daily" || freq === "weekly") shouldEmailNow = false;
    }
    if (shouldEmailNow) {
      const email = async () => {
        const sender = options.drivers?.sendEmail
          ?? (await import("@/lib/email/send")).sendEmail;
        const result = await sender({
          to: input.email!,
          subject: input.emailSubject || input.title,
          html: input.emailHtml!,
        });
        const error = providerError(result);
        if (error) throw new Error("email_delivery_failed", { cause: error });
      };
      if (durable) durableDeliveries.push(email);
      else await email();
    }
  }

  if (durable) {
    // Try every enabled channel even when one provider is down. The outbox
    // remains failed if any channel failed and retries the whole set, which is
    // deliberately at-least-once for external systems.
    const results = await Promise.allSettled(durableDeliveries.map((deliver) => deliver()));
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => result.reason);
    if (failures.length > 0) {
      throw new AggregateError(failures, "notification_channel_delivery_failed");
    }
  }
}

export async function dispatchNotification(
  input: DispatchInput,
  options: DispatchOptions = {},
): Promise<void> {
  if (options.delivery === "durable") {
    await performDispatch(input, options);
    return;
  }
  try {
    await performDispatch(input, options);
  } catch (error) {
    console.error("[notifications] dispatch failed", error);
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
