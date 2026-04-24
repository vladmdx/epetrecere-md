// POST /api/analytics/track-click — fire-and-forget beacon for CTA clicks.
//
// Separate endpoint from /track-view so views and clicks stay in distinct
// tables (different semantics: views are passive, clicks are intentional).
// Dedupe window is short (2 minutes) because a client clicking the phone
// button 3 times in a row is still one real intent signal, but 3 separate
// visits an hour apart should count separately.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { createHash } from "crypto";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { profileClicks } from "@/lib/db/schema";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const trackSchema = z.object({
  kind: z.enum(["artist", "venue"]),
  id: z.number().int().positive(),
  clickType: z.enum(["cta", "phone", "gallery", "menu", "contact"]),
});

const SESSION_SALT =
  process.env.ANALYTICS_SALT ?? process.env.CLERK_SECRET_KEY ?? "";
const DEDUPE_MINUTES = 2;

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const { success } = await rateLimit(`track-click:${ip}`, 120, 60_000);
  if (!success) return NextResponse.json({ ok: false }, { status: 429 });

  const body = await req.json().catch(() => null);
  const parsed = trackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const { kind, id, clickType } = parsed.data;

  const ua = req.headers.get("user-agent") ?? "unknown";
  const sessionHash = createHash("sha256")
    .update(`${ip}|${ua}|${SESSION_SALT}`)
    .digest("hex");

  try {
    // Dedupe: same session + target + clickType within the dedupe window.
    const cutoff = new Date(Date.now() - DEDUPE_MINUTES * 60 * 1000);
    const targetCond =
      kind === "artist"
        ? eq(profileClicks.artistId, id)
        : eq(profileClicks.venueId, id);

    const [existing] = await db
      .select({ id: profileClicks.id })
      .from(profileClicks)
      .where(
        and(
          eq(profileClicks.sessionHash, sessionHash),
          eq(profileClicks.clickType, clickType),
          gte(profileClicks.createdAt, cutoff),
          targetCond,
        ),
      )
      .limit(1);

    if (existing) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    await db.insert(profileClicks).values({
      artistId: kind === "artist" ? id : null,
      venueId: kind === "venue" ? id : null,
      clickType,
      sessionHash,
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Analytics must never break the UX
    return NextResponse.json({ ok: false });
  }
}
