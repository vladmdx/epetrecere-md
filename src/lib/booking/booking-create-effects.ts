import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  artists,
  bookingEffectDeliveries,
  bookingEffectOutbox,
  bookingRequests,
  users,
  venues,
  type BookingEffectChannel,
} from "@/lib/db/schema";
import { bookingRequestNewEmail } from "@/lib/email/templates/booking-request-new";
import { notificationEmail } from "@/lib/email/templates/notification-email";
import {
  dispatchNotificationChannel,
  resolveNotificationChannels,
  type DispatchInput,
  type NotificationChannelDrivers,
} from "@/lib/notifications/dispatch";
import {
  getVenueOwnerRecipients,
  type VenueNotificationRecipient,
} from "@/lib/venue-access";
import {
  bookingCreationEffectDedupeBase,
  bookingCreationSyntheticRecipientId,
  type BookingCreationEffectAudience,
} from "./booking-create-effect-identity";
import {
  bookingAdminNotificationMessage,
  bookingAutoReplyEmailHtml,
} from "./booking-create-effect-content";
import {
  BookingEffectCancelledError,
  BookingEffectDeadLetterError,
  BookingEffectRetryAtError,
  BOOKING_CREATION_NOTIFICATION_EFFECT,
  bookingEffectDeliveriesFor,
  bookingEffectFor,
  dueBookingEffectDeliveries,
  dueBookingEffects,
  enqueueBookingEffectDeliveries,
  processBookingEffect,
  processBookingEffectDelivery,
  reportUnalertedBookingEffectDeadLetters,
  withBookingCreationEffectDeliveryDispatchPermit,
  type BookingEffect,
  type BookingEffectClockOptions,
  type BookingEffectDelivery,
  type BookingEffectProcessResult,
} from "./effect-outbox";
import {
  BOOKING_EFFECT_PROVIDER_TIMEOUT_MS,
  bookingEffectRetryDelayMs,
} from "./effect-outbox-policy";
import type { BookingCreationWriteResult } from "./booking-request-write";

type Booking = typeof bookingRequests.$inferSelect;
type CreationDeliveryRow = {
  recipientUserId: string;
  /** Real application users are locked before the outbox coordinator. */
  userBacked: boolean;
  channel: BookingEffectChannel;
  dedupeKey: string;
  payload: NonNullable<BookingEffectDelivery["payload"]>;
};

type BookingCreationProcessorOptions = BookingEffectClockOptions & {
  drivers?: NotificationChannelDrivers;
  providerTimeoutMs?: number;
  /** Vercel fallback only: cap sequential provider calls inside one effect. */
  maxDeliveriesPerEffect?: number;
};

type LogicalCreationNotification = {
  recipientUserId: string;
  userBacked: boolean;
  audience: BookingCreationEffectAudience;
  ordinal: number;
  input: DispatchInput;
  channels: BookingEffectChannel[];
};

async function createdBooking(bookingId: number): Promise<Booking | null> {
  const [booking] = await db
    .select()
    .from(bookingRequests)
    .where(eq(bookingRequests.id, bookingId))
    .limit(1);
  return booking ?? null;
}

async function creationTarget(
  booking: Booking,
  executor: typeof db = db,
): Promise<{
  partner: {
    userId: string | null;
    nameRo: string;
    email: string | null;
    autoReplyEnabled: boolean;
    autoReplyMessage: string | null;
  } | null;
  venueRecipients: VenueNotificationRecipient[];
  dashboardUrl: string;
}> {
  if (booking.artistId) {
    const [artist] = await executor
      .select({
        userId: artists.userId,
        nameRo: artists.nameRo,
        email: artists.email,
        autoReplyEnabled: artists.autoReplyEnabled,
        autoReplyMessage: artists.autoReplyMessage,
      })
      .from(artists)
      .where(eq(artists.id, booking.artistId))
      .limit(1);
    return {
      partner: artist ?? null,
      venueRecipients: [],
      dashboardUrl: "/dashboard/rezervari",
    };
  }
  if (booking.venueId) {
    const [venue] = await executor
      .select({
        userId: venues.userId,
        nameRo: venues.nameRo,
        email: venues.email,
        autoReplyEnabled: venues.autoReplyEnabled,
        autoReplyMessage: venues.autoReplyMessage,
      })
      .from(venues)
      .where(eq(venues.id, booking.venueId))
      .limit(1);
    return {
      partner: venue ?? null,
      venueRecipients: venue
        ? await getVenueOwnerRecipients(booking.venueId, executor)
        : [],
      dashboardUrl: "/dashboard/sala/rezervari",
    };
  }
  return {
    partner: null,
    venueRecipients: [],
    dashboardUrl: "/dashboard/rezervari",
  };
}

async function creationConflict(
  booking: Booking,
  executor: typeof db = db,
): Promise<{
  pending: number;
  confirmed: number;
} | null> {
  const target = booking.venueId
    ? eq(bookingRequests.venueId, booking.venueId)
    : booking.artistId
      ? eq(bookingRequests.artistId, booking.artistId)
      : null;
  if (!target) return null;

  const rows = await executor
    .select({ id: bookingRequests.id, status: bookingRequests.status })
    .from(bookingRequests)
    .where(and(
      target,
      eq(bookingRequests.eventDate, booking.eventDate),
      inArray(bookingRequests.status, [
        "pending",
        "accepted",
        "confirmed_by_client",
      ]),
    ));
  const others = rows.filter((row) => row.id !== booking.id);
  const pending = others.filter((row) => row.status === "pending").length;
  // Preserve the legacy rule: a warning is generated only when at least one
  // other tentative request competes for the same target/date.
  if (pending === 0) return null;
  return {
    pending,
    confirmed: others.length - pending,
  };
}

function conflictMessage(conflict: { pending: number; confirmed: number }): string {
  return conflict.confirmed > 0
    ? `Ai deja o rezervare confirmată pe această dată și ${conflict.pending + 1} cereri tentative.`
    : `${conflict.pending + 1} cereri tentative sunt acum pe aceeași dată.`;
}

function mergePayload(
  current: NonNullable<BookingEffectDelivery["payload"]>,
  incoming: NonNullable<BookingEffectDelivery["payload"]>,
): NonNullable<BookingEffectDelivery["payload"]> {
  return {
    ...current,
    title: `${current.title} · ${incoming.title}`,
    message: [current.message, incoming.message].filter(Boolean).join("\n\n"),
    email: current.email ?? incoming.email,
    emailSubject: current.emailSubject ?? incoming.emailSubject,
    emailHtml: current.emailHtml && incoming.emailHtml
      ? `${current.emailHtml}<hr>${incoming.emailHtml}`
      : current.emailHtml ?? incoming.emailHtml,
  };
}

/**
 * Expand current recipients/preferences once, then persist immutable payloads.
 * A single effect can notify several audiences; collisions (for example an
 * admin who also owns the venue) are folded into one recipient/channel row to
 * satisfy the existing 0031 uniqueness contract without losing either notice.
 */
async function creationDeliveryRows(
  booking: Booking,
  executor: typeof db = db,
): Promise<CreationDeliveryRow[]> {
  const { partner, venueRecipients, dashboardUrl } = await creationTarget(
    booking,
    executor,
  );
  const conflict = await creationConflict(booking, executor);
  const logical: LogicalCreationNotification[] = [];

  const vendorRecipients: VenueNotificationRecipient[] = booking.venueId
    ? venueRecipients
    : partner?.userId
      ? [{ userId: partner.userId, email: partner.email }]
      : [];
  const uniqueVendorRecipients = [...new Map(
    vendorRecipients.map((recipient) => [recipient.userId, recipient]),
  ).values()].sort((left, right) => left.userId.localeCompare(right.userId));

  if (partner) {
    const timePart = booking.startTime
      ? ` · ${booking.startTime}${booking.endTime ? `–${booking.endTime}` : ""}`
      : "";
    const vendorMessage = [
      `${booking.clientName} — ${booking.eventType ?? "Eveniment"} · ${booking.eventDate}${timePart}`,
      conflict ? `⚠️ ${conflictMessage(conflict)}` : null,
    ].filter(Boolean).join("\n");

    const resolvedRecipients = uniqueVendorRecipients.length > 0
      ? uniqueVendorRecipients.map((recipient) => ({
          ...recipient,
          userBacked: true,
        }))
      : partner.email
        ? [{
            userId: bookingCreationSyntheticRecipientId({
              bookingId: booking.id,
              audience: "vendor",
            }),
            email: partner.email,
            userBacked: false,
          }]
        : [];

    for (const [ordinal, recipient] of resolvedRecipients.entries()) {
      const dedupeKey = bookingCreationEffectDedupeBase({
        bookingId: booking.id,
        audience: "vendor",
        ordinal,
      });
      const input: DispatchInput = {
        userId: recipient.userId,
        type: "booking_request_new",
        title: conflict
          ? "Cerere nouă de rezervare · conflict potențial"
          : "Cerere nouă de rezervare",
        message: vendorMessage,
        actionUrl: conflict
          ? `${dashboardUrl}?date=${booking.eventDate}`
          : dashboardUrl,
        ...(recipient.email
          ? {
              email: recipient.email,
              emailSubject: `Cerere nouă de rezervare de la ${booking.clientName}`,
              emailHtml: bookingRequestNewEmail({
                vendorName: partner.nameRo ?? "Partener",
                clientName: booking.clientName,
                eventType: booking.eventType ?? null,
                eventDate: booking.eventDate ?? null,
                startTime: booking.startTime ?? null,
                endTime: booking.endTime ?? null,
                message: booking.message ?? null,
              }),
            }
          : {}),
        dedupeKey,
      };
      const channels = uniqueVendorRecipients.length > 0
        ? await resolveNotificationChannels(input, executor)
        : [];
      // The old direct vendor email intentionally bypassed notification
      // digest preferences. Preserve that behaviour while making it durable.
      if (recipient.email && !channels.includes("email")) channels.push("email");
      logical.push({
        recipientUserId: recipient.userId,
        userBacked: recipient.userBacked,
        audience: "vendor",
        ordinal,
        input,
        channels,
      });
    }
  }

  const admins = await executor
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(or(eq(users.role, "admin"), eq(users.role, "super_admin")))
    .orderBy(users.id);
  for (const [ordinal, admin] of admins.entries()) {
    const dedupeKey = bookingCreationEffectDedupeBase({
      bookingId: booking.id,
      audience: "admin",
      ordinal,
    });
    const partnerName = partner?.nameRo ?? "artist";
    const input: DispatchInput = {
      userId: admin.id,
      type: "admin_lead_new",
      title: conflict ? "Cerere nouă în CRM · conflict potențial" : "Cerere nouă în CRM",
      message: [
        `${booking.clientName} — ${partnerName}`,
        conflict
          ? `${partnerName} — data ${booking.eventDate}: ${conflictMessage(conflict)}`
          : null,
      ].filter(Boolean).join("\n"),
      actionUrl: "/admin/cereri-oferte",
      ...(admin.email
        ? {
            email: admin.email,
            emailSubject: `🔔 Cerere nouă: ${booking.clientName} → ${partnerName}`,
            emailHtml: notificationEmail({
              title: conflict
                ? "Cerere Nouă · Conflict Potențial"
                : "Cerere Nouă de Rezervare",
              message: [
                bookingAdminNotificationMessage({
                  clientName: booking.clientName,
                  partnerName,
                  eventType: booking.eventType,
                  eventDate: booking.eventDate,
                  startTime: booking.startTime,
                  endTime: booking.endTime,
                }),
                conflict ? conflictMessage(conflict) : null,
              ].filter(Boolean).join("<br><br>"),
              ctaUrl: "https://epetrecere.md/admin/cereri-oferte",
              ctaText: "Deschide în CRM →",
              emoji: conflict ? "⚠️" : "🔔",
            }),
          }
        : {}),
      dedupeKey,
    };
    logical.push({
      recipientUserId: admin.id,
      userBacked: true,
      audience: "admin",
      ordinal,
      input,
      channels: await resolveNotificationChannels(input, executor),
    });
  }

  if (
    partner?.autoReplyEnabled
    && partner.autoReplyMessage
    && booking.clientEmail
  ) {
    const recipientUserId = booking.clientUserId
      ?? bookingCreationSyntheticRecipientId({
        bookingId: booking.id,
        audience: "client",
      });
    const dedupeKey = bookingCreationEffectDedupeBase({
      bookingId: booking.id,
      audience: "client",
      ordinal: 0,
    });
    const partnerName = partner.nameRo ?? "artist";
    logical.push({
      recipientUserId,
      userBacked: booking.clientUserId !== null,
      audience: "client",
      ordinal: 0,
      input: {
        userId: recipientUserId,
        type: "booking_status_changed",
        title: `Cererea ta către ${partnerName} a fost primită`,
        email: booking.clientEmail,
        emailSubject: `Cererea ta către ${partnerName} a fost primită`,
        emailHtml: bookingAutoReplyEmailHtml({
          clientName: booking.clientName,
          partnerName,
          autoReplyMessage: partner.autoReplyMessage,
          eventDate: booking.eventDate,
        }),
        dedupeKey,
      },
      // Auto-reply was historically a direct e-mail, not an in-app/push event.
      channels: ["email"],
    });
  }

  const rows = new Map<string, CreationDeliveryRow>();
  for (const item of logical) {
    const baseKey = bookingCreationEffectDedupeBase({
      bookingId: booking.id,
      audience: item.audience,
      ordinal: item.ordinal,
    });
    for (const channel of item.channels) {
      const rowKey = `${item.recipientUserId}:${channel}`;
      const payload = {
        userId: item.input.userId,
        type: String(item.input.type),
        title: item.input.title,
        ...(item.input.message ? { message: item.input.message } : {}),
        ...(item.input.actionUrl ? { actionUrl: item.input.actionUrl } : {}),
        ...(item.input.email ? { email: item.input.email } : {}),
        ...(item.input.emailSubject
          ? { emailSubject: item.input.emailSubject }
          : {}),
        ...(item.input.emailHtml ? { emailHtml: item.input.emailHtml } : {}),
        dedupeKey: baseKey,
      };
      const existing = rows.get(rowKey);
      if (existing) {
        existing.payload = mergePayload(existing.payload, payload);
        continue;
      }
      rows.set(rowKey, {
        recipientUserId: item.recipientUserId,
        userBacked: item.userBacked,
        channel,
        dedupeKey: `${baseKey}:${channel}`,
        payload,
      });
    }
  }
  return [...rows.values()];
}

async function materializeCreationDeliveries(
  booking: Booking,
  effect: BookingEffect,
): Promise<BookingEffectDelivery[]> {
  const existing = await bookingEffectDeliveriesFor(effect.id);
  if (existing.length > 0) return existing;
  // Resolve a preliminary recipient set only to establish the global lock
  // order: real user rows always precede the outbox coordinator. Account
  // erasure takes the same user -> coordinator order, so it either observes
  // and scrubs our committed rows or wins first and makes the user disappear.
  const candidateRows = await creationDeliveryRows(booking);
  const candidateUserIds = [...new Set(
    candidateRows
      .filter((row) => row.userBacked)
      .map((row) => row.recipientUserId),
  )].sort();
  return db.transaction(async (tx) => {
    const executor = tx as unknown as typeof db;
    const lockedUsers = candidateUserIds.length > 0
      ? await tx
          .select({ id: users.id })
          .from(users)
          .where(inArray(users.id, candidateUserIds))
          .orderBy(users.id)
          .for("share")
      : [];
    const lockedUserIds = new Set(lockedUsers.map(({ id }) => id));
    const [coordinator] = await tx
      .select({
        status: bookingEffectOutbox.status,
        leaseToken: bookingEffectOutbox.leaseToken,
      })
      .from(bookingEffectOutbox)
      .where(eq(bookingEffectOutbox.id, effect.id))
      .for("update")
      .limit(1);
    if (
      coordinator?.status !== "processing"
      || coordinator.leaseToken !== effect.leaseToken
    ) {
      throw new Error("booking_effect_lease_lost");
    }
    // The booking may have been minimized while we waited for the coordinator
    // (client erasure uses user -> coordinator too). Build the immutable
    // payload from the fresh row, never from the pre-lock snapshot.
    const [freshBooking] = await tx
      .select()
      .from(bookingRequests)
      .where(eq(bookingRequests.id, effect.bookingId))
      .limit(1);
    if (!freshBooking) throw new BookingEffectCancelledError();
    const refreshedRows = await creationDeliveryRows(freshBooking, executor);
    const rows = refreshedRows.filter(
      (row) => !row.userBacked || lockedUserIds.has(row.recipientUserId),
    );
    const concurrentExisting = await bookingEffectDeliveriesFor(effect.id, executor);
    const deliveries = concurrentExisting.length > 0
      ? concurrentExisting
      : await enqueueBookingEffectDeliveries(executor, effect.id, rows);
    await executor
      .update(bookingEffectOutbox)
      .set({
        // `create_notify` has no referral phase. These existing coordinator
        // fields are marked complete so operational inspection is unambiguous.
        referralStatus: "delivered",
        materializationStatus: "delivered",
        updatedAt: new Date(),
      })
      .where(and(
        eq(bookingEffectOutbox.id, effect.id),
        eq(bookingEffectOutbox.status, "processing"),
        eq(bookingEffectOutbox.leaseToken, effect.leaseToken!),
      ));
    return deliveries;
  });
}

async function nextCreationRetryAt(effectId: number, now = new Date()): Promise<Date> {
  const [delivery] = await db
    .select({
      next: sql<Date | null>`min(
        CASE
          WHEN ${bookingEffectDeliveries.status} IN ('pending', 'failed')
            THEN ${bookingEffectDeliveries.nextAttemptAt}
          WHEN ${bookingEffectDeliveries.status} IN ('processing', 'dispatching')
            THEN ${bookingEffectDeliveries.leaseUntil}
          ELSE NULL
        END
      )`,
    })
    .from(bookingEffectDeliveries)
    .where(eq(bookingEffectDeliveries.effectId, effectId));
  return delivery?.next
    ? new Date(delivery.next)
    : new Date(now.getTime() + bookingEffectRetryDelayMs(1));
}

async function runCreationDeliveries(
  booking: Booking,
  effect: BookingEffect,
  options: BookingCreationProcessorOptions,
): Promise<void> {
  await materializeCreationDeliveries(booking, effect);
  const due = await dueBookingEffectDeliveries(
    effect.id,
    options.maxDeliveriesPerEffect ?? 100,
    options.now,
  );
  for (const row of due) {
    await processBookingEffectDelivery(
      row.id,
      async (claimed) => {
        const dispatch = await withBookingCreationEffectDeliveryDispatchPermit(
          effect.bookingId,
          claimed,
          async (_permitted, executor) => {
            await dispatchNotificationChannel(
              claimed.payload as DispatchInput,
              claimed.channel,
              options.drivers,
              {
                idempotencyKey: claimed.dedupeKey,
                timeoutMs:
                  options.providerTimeoutMs ?? BOOKING_EFFECT_PROVIDER_TIMEOUT_MS,
                executor: executor as unknown as typeof db,
              },
            );
          },
          options.now ?? new Date(),
          options.providerTimeoutMs ?? BOOKING_EFFECT_PROVIDER_TIMEOUT_MS,
        );
        if (!dispatch.permitted) throw new BookingEffectCancelledError();
      },
      options,
    );
  }

  const all = await bookingEffectDeliveriesFor(effect.id);
  if (all.some((row) => row.status === "dead_letter")) {
    throw new BookingEffectDeadLetterError(
      all
        .filter((row) => row.status === "dead_letter")
        .map((row) => `${row.channel}:${row.lastError ?? "failed"}`)
        .join("; "),
    );
  }
  const live = all.filter((row) => row.status !== "cancelled");
  if (live.length === 0 && all.length > 0) {
    throw new BookingEffectCancelledError();
  }
  if (live.some((row) => row.status !== "delivered")) {
    throw new BookingEffectRetryAtError(
      new Error(
        `creation_deliveries_retrying:${
          live.filter((row) => row.status !== "delivered").length
        }`,
      ),
      await nextCreationRetryAt(effect.id, options.now),
    );
  }
}

export async function processBookingCreationNotificationEffect(
  effectId: number,
  options: BookingCreationProcessorOptions = {},
): Promise<BookingEffectProcessResult> {
  return processBookingEffect(
    effectId,
    async (effect) => {
      const booking = await createdBooking(effect.bookingId);
      if (!booking) throw new BookingEffectCancelledError();
      await runCreationDeliveries(booking, effect, options);
    },
    options,
  );
}

export async function processBookingCreationNotificationForBooking(
  bookingId: number,
  options: BookingCreationProcessorOptions = {},
): Promise<BookingEffectProcessResult> {
  const effect = await bookingEffectFor(
    bookingId,
    BOOKING_CREATION_NOTIFICATION_EFFECT,
  );
  if (!effect) return { status: "not_due" };
  return processBookingCreationNotificationEffect(effect.id, options);
}

export async function drainBookingCreationNotificationOutbox(options: {
  limit?: number;
  now?: Date;
  drivers?: NotificationChannelDrivers;
  providerTimeoutMs?: number;
  maxDeliveriesPerEffect?: number;
} = {}) {
  const effects = await dueBookingEffects(
    BOOKING_CREATION_NOTIFICATION_EFFECT,
    options.limit ?? 25,
    options.now,
  );
  const summary = {
    selected: effects.length,
    delivered: 0,
    failed: 0,
    deadLettered: 0,
    cancelled: 0,
    skipped: 0,
    retrying: 0,
    failedBacklog: 0,
    terminal: 0,
    newlyReportedTerminal: 0,
    errors: [] as Array<{ effectId: number; error: string }>,
  };
  for (const effect of effects) {
    const result = await processBookingCreationNotificationEffect(effect.id, {
      ...(options.now ? { now: options.now } : {}),
      drivers: options.drivers,
      providerTimeoutMs: options.providerTimeoutMs,
      maxDeliveriesPerEffect: options.maxDeliveriesPerEffect,
    });
    if (result.status === "delivered") summary.delivered += 1;
    else if (result.status === "failed") {
      summary.failed += 1;
      summary.errors.push({ effectId: result.effect.id, error: result.error });
    } else if (result.status === "dead_letter") {
      summary.deadLettered += 1;
      summary.errors.push({ effectId: result.effect.id, error: result.error });
    } else if (result.status === "cancelled") summary.cancelled += 1;
    else summary.skipped += 1;
  }
  const states = await db
    .select({
      status: bookingEffectOutbox.status,
      count: sql<number>`count(*)::int`,
    })
    .from(bookingEffectOutbox)
    .where(eq(
      bookingEffectOutbox.effectKey,
      BOOKING_CREATION_NOTIFICATION_EFFECT,
    ))
    .groupBy(bookingEffectOutbox.status);
  for (const state of states) {
    if (
      state.status === "pending"
      || state.status === "failed"
      || state.status === "processing"
    ) {
      summary.retrying += Number(state.count);
    }
    if (state.status === "failed") summary.failedBacklog += Number(state.count);
    if (state.status === "dead_letter") summary.terminal += Number(state.count);
  }
  summary.newlyReportedTerminal = await reportUnalertedBookingEffectDeadLetters(
    BOOKING_CREATION_NOTIFICATION_EFFECT,
    options.now,
  );
  return summary;
}

/**
 * Immediate accelerator used by both HTTP and AI adapters. It intentionally
 * runs for idempotent replays too: the writer has already rescheduled safely,
 * and the outbox lease prevents duplicate dispatch.
 */
export async function dispatchBookingCreationEffects(
  creation: BookingCreationWriteResult,
): Promise<void> {
  const result = await processBookingCreationNotificationForBooking(
    creation.booking.id,
  );
  if (result.status === "failed" || result.status === "dead_letter") {
    console.error(
      `[booking-outbox] creation effect ${result.effect.id} ${result.status}: ${result.error}`,
    );
  }
}
