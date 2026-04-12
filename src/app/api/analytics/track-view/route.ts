import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { createHash } from "crypto";
import { and, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { profileViews } from "@/lib/db/schema";
import { rateLimit } from "@/lib/rate-limit";

// M5 — POST /api/analytics/track-view
//
// Lightweight fire-and-forget beacon the public artist / venue detail pages
// call on mount. We hash IP + UA with a process-level salt to get an opaque
// session token (no PII stored) and dedupe the same session viewing the same
// target within 30 minutes, so reloads and tab-switches don't inflate counts.

export const runtime = "nodejs";

const trackSchema = z.object({
  kind: z.enum(["artist", "venue"]),
  id: z.number().int().positive(),
  referrer: z.string().max(500).optional().nullable(),
});

const SESSION_SALT =
  process.env.ANALYTICS_SALT ?? process.env.CLERK_SECRET_KEY ?? "";
const DEDUPE_MINUTES = 30;

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(req: NextRequest) {
  // Rate limit: 60 view beacons per minute per IP (generous for normal browsing)
  const ip = getClientIp(req);
  const { success: rlOk } = await rateLimit(`track-view:${ip}`, 60, 60_000);
  if (!rlOk) return NextResponse.json({ ok: false }, { status: 429 });

  const body = await req.json().catch(() => null);
  const parsed = trackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const { kind, id, referrer } = parsed.data;

  const ua = req.headers.get("user-agent") ?? "unknown";
  const sessionHash = createHash("sha256")
    .update(`${ip}|${ua}|${SESSION_SALT}`)
    .digest("hex");

  try {
    // Dedupe: has this session already viewed this exact target recently?
    const cutoff = new Date(Date.now() - DEDUPE_MINUTES * 60 * 1000);
    const targetCond =
      kind === "artist"
        ? eq(profileViews.artistId, id)
        : eq(profileViews.venueId, id);

    const [existing] = await db
      .select({ id: profileViews.id })
      .from(profileViews)
      .where(
        and(
          eq(profileViews.sessionHash, sessionHash),
          gte(profileViews.createdAt, cutoff),
          targetCond,
        ),
      )
      .limit(1);

    if (existing) {
      return NextResponse.json({ ok: true, deduped: true });
    }

    await db.insert(profileViews).values({
      artistId: kind === "artist" ? id : null,
      venueId: kind === "venue" ? id : null,
      sessionHash,
      referrer: referrer ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Never surface analytics errors to users
    return NextResponse.json({ ok: false });
  }
}
