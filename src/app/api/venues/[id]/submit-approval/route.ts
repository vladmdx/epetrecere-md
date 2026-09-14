import { NextResponse } from "next/server";
import { requireVenueCapability } from "@/lib/venue-access";
import { jsonAccess, jsonError } from "@/lib/http/json";
import { submitVenueForApproval } from "@/lib/partner/onboarding";
import { jsonIfMultiHallDisabled } from "@/lib/partner/multi-hall-gate";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const venueId = Number((await ctx.params).id);
  const access = await requireVenueCapability(venueId, "manage_profile");
  if (!access.ok) return jsonAccess(access);
  const blocked = jsonIfMultiHallDisabled();
  if (blocked) return blocked;
  const result = await submitVenueForApproval(access.user.id, venueId);
  if (!result.ok) {
    return jsonError(result.error, result.status, {
      code: result.code,
      missing: "missing" in result ? result.missing : undefined,
    });
  }
  return NextResponse.json(result);
}
