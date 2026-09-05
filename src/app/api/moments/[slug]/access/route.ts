import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { eventPlans } from "@/lib/db/schema";
import { rateLimit } from "@/lib/rate-limit";
import {
  isValidMomentsPin,
  momentsAccessToken,
  momentsCookieName,
} from "@/lib/moments/access";

const schema = z.object({ pin: z.string().regex(/^\d{6}$/) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const ip = req.headers.get("x-forwarded-for") || "anon";
  const limited = await rateLimit(`moments-pin:${ip}:${slug}`, 8, 15 * 60_000);
  if (!limited.success) {
    return NextResponse.json({ error: "Too many attempts" }, { status: 429 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid code" }, { status: 400 });
  }
  const [plan] = await db
    .select({ id: eventPlans.id, enabled: eventPlans.momentsEnabled })
    .from(eventPlans)
    .where(eq(eventPlans.momentsSlug, slug))
    .limit(1);
  if (!plan?.enabled || !isValidMomentsPin(parsed.data.pin, plan.id, slug)) {
    return NextResponse.json({ error: "Invalid code" }, { status: 403 });
  }
  const res = NextResponse.json({ granted: true });
  res.cookies.set(momentsCookieName(slug), momentsAccessToken(slug), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: `/`,
    maxAge: 60 * 60 * 24 * 7,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
