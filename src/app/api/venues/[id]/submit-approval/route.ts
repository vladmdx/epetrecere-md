import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, venues } from "@/lib/db/schema";
import { requireVenueCapability } from "@/lib/venue-access";
import { jsonAccess, jsonError } from "@/lib/http/json";
import { submitVenueForApproval } from "@/lib/partner/onboarding";
import { dispatchToAdmins } from "@/lib/notifications/dispatch";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const venueId = Number((await ctx.params).id);
  const access = await requireVenueCapability(venueId, "manage_profile");
  if (!access.ok) return jsonAccess(access);
  const result = await submitVenueForApproval(venueId);
  if (!result.ok) {
    return jsonError("ONBOARDING_INCOMPLETE", result.status, { code: result.code, missing: result.missing });
  }
  const [venue] = await db.select({ nameRo: venues.nameRo }).from(venues).where(eq(venues.id, venueId)).limit(1);
  await dispatchToAdmins({
    type: "venue_registered",
    title: "Local trimis la aprobare",
    message: `${venue?.nameRo ?? "Local"} (#${venueId}) a fost trimis spre aprobare.`,
    actionUrl: "/admin",
  }).catch(() => undefined);
  await db.update(users).set({ onboardingComplete: true, updatedAt: new Date() }).where(eq(users.id, access.user.id));
  return NextResponse.json(result);
}
