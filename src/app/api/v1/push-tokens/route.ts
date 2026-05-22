// POST /api/v1/push-tokens — register or refresh a mobile push token.
//
// Mobile flow: on app start (after Clerk auth), Expo Notifications
// returns a push token. The app POSTs it here. The endpoint upserts:
//   - if the token row exists, bump `lastSeenAt` and re-bind to current user
//   - if it doesn't, insert
//
// We rely on the (unique) expoToken constraint to dedupe. The same
// device can switch accounts; the older row becomes the new user's.
//
// DELETE /api/v1/push-tokens?token=... — used on sign-out so we stop
// sending notifications to a device the user is no longer logged into.

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { pushTokens, users } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

const PostSchema = z.object({
  expoToken: z.string().min(10),
  platform: z.enum(["ios", "android"]),
  deviceLabel: z.string().max(120).optional(),
});

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof PostSchema>;
  try {
    body = PostSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "validation_error", details: err },
      { status: 400 },
    );
  }

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  // Upsert: try update by token first; if zero rows touched, insert.
  // (Drizzle has onConflict.doUpdate but it requires a manual conflict
  // target list — splitting the path keeps the SQL clearer here.)
  const now = new Date();
  const existing = await db
    .select({ id: pushTokens.id })
    .from(pushTokens)
    .where(eq(pushTokens.expoToken, body.expoToken))
    .limit(1);

  if (existing[0]) {
    await db
      .update(pushTokens)
      .set({
        userId: appUser.id,
        platform: body.platform,
        deviceLabel: body.deviceLabel ?? null,
        lastSeenAt: now,
      })
      .where(eq(pushTokens.id, existing[0].id));
  } else {
    await db.insert(pushTokens).values({
      userId: appUser.id,
      expoToken: body.expoToken,
      platform: body.platform,
      deviceLabel: body.deviceLabel ?? null,
      lastSeenAt: now,
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "token_required" }, { status: 400 });
  }

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  // Only delete tokens that belong to this user — otherwise a malicious
  // client could brute-force-delete other users' tokens via DELETE.
  await db
    .delete(pushTokens)
    .where(and(eq(pushTokens.expoToken, token), eq(pushTokens.userId, appUser.id)));

  return NextResponse.json({ ok: true });
}
