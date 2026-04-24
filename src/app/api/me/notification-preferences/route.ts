// GET /api/me/notification-preferences
//   Returns digest frequency + per-category prefs (missing keys = ON).
//
// PUT /api/me/notification-preferences
//   Accepts any of three shapes (discriminated by the fields present):
//     { digestFrequency }                 — legacy single-field update
//     { category, channel, enabled }      — toggle one cell in the grid
//     { prefs: {...} }                    — bulk replace whole map

import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { NOTIFICATION_CATEGORIES } from "@/lib/notifications/dispatch";

const categoryEnum = z.enum(NOTIFICATION_CATEGORIES);
const channelEnum = z.enum(["email", "push"]);

const singleSchema = z.object({
  category: categoryEnum,
  channel: channelEnum,
  enabled: z.boolean(),
});

const bulkSchema = z.object({
  prefs: z.record(
    z.string(),
    z.object({ email: z.boolean().optional(), push: z.boolean().optional() }),
  ),
});

const digestSchema = z.object({
  digestFrequency: z.enum(["instant", "daily", "weekly"]),
});

export async function GET() {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [row] = await db
    .select({
      digestFrequency: users.notificationDigestFrequency,
      prefs: users.notificationPrefs,
      timezone: users.timezone,
    })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!row) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  return NextResponse.json({
    digestFrequency: row.digestFrequency ?? "instant",
    prefs: row.prefs ?? {},
    timezone: row.timezone ?? "Europe/Chisinau",
    categories: NOTIFICATION_CATEGORIES,
  });
}

export async function PUT(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);

  // Case 1: legacy digestFrequency update.
  const digestParsed = digestSchema.safeParse(body);
  if (digestParsed.success) {
    const result = await db
      .update(users)
      .set({
        notificationDigestFrequency: digestParsed.data.digestFrequency,
        updatedAt: new Date(),
      })
      .where(eq(users.clerkId, clerkId))
      .returning({ id: users.id });
    if (result.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  }

  // Case 2: single toggle — merge into prefs JSONB.
  const singleParsed = singleSchema.safeParse(body);
  if (singleParsed.success) {
    const { category, channel, enabled } = singleParsed.data;
    const [current] = await db
      .select({ prefs: users.notificationPrefs })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);
    if (!current) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    const prev = (current.prefs ?? {}) as Record<
      string,
      { email?: boolean; push?: boolean }
    >;
    const next = {
      ...prev,
      [category]: { ...prev[category], [channel]: enabled },
    };
    await db
      .update(users)
      .set({ notificationPrefs: next, updatedAt: new Date() })
      .where(eq(users.clerkId, clerkId));
    return NextResponse.json({ success: true, prefs: next });
  }

  // Case 3: bulk replace.
  const bulkParsed = bulkSchema.safeParse(body);
  if (bulkParsed.success) {
    await db
      .update(users)
      .set({ notificationPrefs: bulkParsed.data.prefs, updatedAt: new Date() })
      .where(eq(users.clerkId, clerkId));
    return NextResponse.json({ success: true, prefs: bulkParsed.data.prefs });
  }

  return NextResponse.json(
    {
      error:
        "Validation failed — expected digestFrequency, {category,channel,enabled}, or {prefs}",
    },
    { status: 400 },
  );
}
