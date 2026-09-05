// Nightly cron: event_plans whose event_date is more than 7 days in the
// past get flipped from "active" → "completed" and stamped archivedAt.
// This feeds the sidebar's conditional "Arhivă" link so finished events
// move out of the Evenimentele Mele section automatically.
//
// Scheduled via vercel.json at 03:00 UTC daily. Protected by
// CRON_SECRET — Vercel automatically sends `Authorization: Bearer <secret>`
// if the env var is configured.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  aiConversations,
  chatMessages,
  eventPhotos,
  eventPlans,
} from "@/lib/db/schema";
import { and, eq, lt, isNotNull, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
// Opt out of caching so each cron tick hits the DB.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // AuthZ — fail-closed. CRON_SECRET MUST be set in env and the caller
  // MUST send a matching `Authorization: Bearer …` header. Vercel crons
  // attach this automatically when the env var is defined. Without the
  // env var set, any anonymous caller could trigger the archive sweep.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[cron/archive-plans] CRON_SECRET not configured — refusing to run");
    return NextResponse.json(
      { error: "Cron not configured" },
      { status: 503 },
    );
  }
  const header = req.headers.get("authorization");
  if (header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  const toArchive = await db
    .select({ id: eventPlans.id })
    .from(eventPlans)
    .where(
      and(
        eq(eventPlans.status, "active"),
        isNotNull(eventPlans.eventDate),
        lt(eventPlans.eventDate, cutoffIso),
      ),
    );

  if (toArchive.length > 0) {
    const now = new Date();
    await db
      .update(eventPlans)
      .set({ status: "completed", archivedAt: now, updatedAt: now })
      .where(
        and(
          eq(eventPlans.status, "active"),
          isNotNull(eventPlans.eventDate),
          lt(eventPlans.eventDate, cutoffIso),
        ),
      );
  }

  // Personal guest details are useful around the event, not forever. Keep
  // the event plan and its aggregate budget/checklist, but erase both guest
  // stores 90 days after the event. Seat assignments cascade from guest_list.
  const purgedPlannerGuests = await db.execute(sql`
    DELETE FROM guest_list g
    USING event_plans p
    WHERE g.plan_id = p.id
      AND p.event_date IS NOT NULL
      AND p.event_date::date < (CURRENT_DATE - INTERVAL '90 days')
    RETURNING g.id
  `);
  const purgedInvitationGuests = await db.execute(sql`
    DELETE FROM invitation_guests g
    USING invitations i
    WHERE g.invitation_id = i.id
      AND i.event_date IS NOT NULL
      AND i.event_date::date < (CURRENT_DATE - INTERVAL '90 days')
    RETURNING g.id
  `);
  const countRows = (result: unknown) =>
    Array.isArray(result)
      ? result.length
      : ((result as { rows?: unknown[] } | null)?.rows?.length ?? 0);

  // Event photos have a longer, explicit window than nominal guest data.
  // Purge at 180 days after the event; undated standalone galleries expire
  // 180 days after upload. Work in bounded batches so the nightly function
  // cannot time out on an old, large gallery.
  const expiredPhotos = await db
    .select({ id: eventPhotos.id, url: eventPhotos.url })
    .from(eventPhotos)
    .innerJoin(eventPlans, eq(eventPlans.id, eventPhotos.planId))
    .where(sql`(
      (${eventPlans.eventDate} IS NOT NULL AND ${eventPlans.eventDate}::date < (CURRENT_DATE - INTERVAL '180 days'))
      OR
      (${eventPlans.eventDate} IS NULL AND ${eventPhotos.createdAt} < (NOW() - INTERVAL '180 days'))
    )`)
    .limit(500);
  if (expiredPhotos.length > 0) {
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const urls = expiredPhotos.map((p) => p.url).filter((url) => url.startsWith("https://"));
      if (urls.length > 0) {
        try {
          const { del } = await import("@vercel/blob");
          await del(urls);
        } catch (error) {
          console.error("[cron/archive-plans] expired photo blob cleanup failed", error);
        }
      }
    }
    await db.delete(eventPhotos).where(inArray(eventPhotos.id, expiredPhotos.map((p) => p.id)));
  }

  // Operational retention. Every sweep is bounded so one old dataset cannot
  // exhaust a serverless invocation. Legal/financial proof is deliberately
  // excluded and remains governed by its statutory retention period.
  const expiredAi = await db
    .delete(aiConversations)
    .where(lt(aiConversations.createdAt, sql`NOW() - INTERVAL '30 days'`))
    .returning({ id: aiConversations.id });

  const expiredMessages = await db
    .select({ id: chatMessages.id, attachmentUrl: chatMessages.attachmentUrl })
    .from(chatMessages)
    .where(sql`
      ${chatMessages.createdAt} < NOW() - INTERVAL '36 months'
      AND (
        (${chatMessages.conversationId} IS NOT NULL AND EXISTS (
          SELECT 1 FROM conversations c
          WHERE c.id = ${chatMessages.conversationId}
            AND c.last_message_at < NOW() - INTERVAL '36 months'
        ))
        OR
        (${chatMessages.bookingRequestId} IS NOT NULL AND EXISTS (
          SELECT 1 FROM booking_requests b
          WHERE b.id = ${chatMessages.bookingRequestId}
            AND b.status IN ('rejected', 'cancelled', 'completed', 'expired')
            AND b.updated_at < NOW() - INTERVAL '36 months'
        ))
      )
    `)
    .limit(500);
  if (expiredMessages.length > 0) {
    const attachmentUrls = expiredMessages
      .map((message) => message.attachmentUrl)
      .filter((url): url is string => Boolean(url?.startsWith("https://")));
    if (attachmentUrls.length > 0 && process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const { del } = await import("@vercel/blob");
        await del(attachmentUrls);
      } catch (error) {
        console.error("[cron/archive-plans] expired chat attachment cleanup failed", error);
      }
    }
    await db.delete(chatMessages).where(inArray(chatMessages.id, expiredMessages.map((m) => m.id)));
  }

  const anonymizedContactLeads = await db.execute(sql`
    WITH expired AS (
      SELECT l.id
      FROM leads l
      WHERE l.source = 'form'
        AND l.updated_at < NOW() - INTERVAL '24 months'
        AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.lead_id = l.id)
        AND (l.email IS NOT NULL OR l.phone <> 'retained-business-record')
      ORDER BY l.id
      LIMIT 500
    )
    UPDATE leads l
    SET name = 'Date anonimizate', phone = 'retained-business-record',
        email = NULL, message = NULL, wizard_data = NULL
    FROM expired e
    WHERE l.id = e.id
    RETURNING l.id
  `);
  const purgedNotifications = await db.execute(sql`
    WITH expired AS (
      SELECT id FROM notifications
      WHERE (is_read = TRUE AND created_at < NOW() - INTERVAL '12 months')
         OR created_at < NOW() - INTERVAL '24 months'
      ORDER BY id LIMIT 1000
    )
    DELETE FROM notifications n USING expired e WHERE n.id = e.id RETURNING n.id
  `);
  const purgedPushSubscriptions = await db.execute(sql`
    DELETE FROM push_subscriptions
    WHERE COALESCE(last_used_at, created_at) < NOW() - INTERVAL '60 days'
    RETURNING endpoint
  `);
  const purgedPushTokens = await db.execute(sql`
    DELETE FROM push_tokens
    WHERE last_seen_at < NOW() - INTERVAL '60 days'
    RETURNING id
  `);
  const minimizedAuditLogs = await db.execute(sql`
    UPDATE admin_audit_log
    SET ip = NULL, user_agent = NULL
    WHERE created_at < NOW() - INTERVAL '90 days'
      AND (ip IS NOT NULL OR user_agent IS NOT NULL)
    RETURNING id
  `);

  return NextResponse.json({
    archived: toArchive.length,
    cutoff: cutoffIso,
    ids: toArchive.map((r) => r.id),
    purgedPlannerGuests: countRows(purgedPlannerGuests),
    purgedInvitationGuests: countRows(purgedInvitationGuests),
    purgedEventPhotos: expiredPhotos.length,
    purgedAiConversations: expiredAi.length,
    purgedChatMessages: expiredMessages.length,
    anonymizedContactLeads: countRows(anonymizedContactLeads),
    purgedNotifications: countRows(purgedNotifications),
    purgedPushSubscriptions: countRows(purgedPushSubscriptions),
    purgedPushTokens: countRows(purgedPushTokens),
    minimizedAuditLogs: countRows(minimizedAuditLogs),
  });
}
