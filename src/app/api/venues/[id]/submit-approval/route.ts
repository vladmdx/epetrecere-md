import { NextResponse } from "next/server";
import { requireVenueCapability } from "@/lib/venue-access";
import { jsonAccess, jsonError } from "@/lib/http/json";
import { submitVenueForApproval } from "@/lib/partner/onboarding";
import { jsonIfMultiHallDisabled } from "@/lib/partner/multi-hall-gate";
import { z } from "zod/v4";

type Ctx = { params: Promise<{ id: string }> };

const selectedHallSchema = z.object({
  hallIds: z.array(z.number().int().positive()).min(1).max(20)
    .refine((ids) => new Set(ids).size === ids.length),
}).strict();

export async function POST(req: Request, ctx: Ctx) {
  const venueId = Number((await ctx.params).id);
  const access = await requireVenueCapability(venueId, "manage_profile");
  if (!access.ok) return jsonAccess(access);
  const blocked = jsonIfMultiHallDisabled();
  if (blocked) return blocked;
  const hasJsonBody = req.headers.get("content-type")?.includes("application/json") ?? false;
  const parsed = hasJsonBody
    ? selectedHallSchema.safeParse(await req.json().catch(() => null))
    : null;
  if (parsed && !parsed.success) return jsonError("Invalid hall selection", 400, { code: "HALL_SELECTION_INVALID" });
  const result = await submitVenueForApproval(access.user.id, venueId, parsed?.data.hallIds);
  if (!result.ok) {
    return jsonError(result.error, result.status, {
      code: result.code,
      missing: "missing" in result ? result.missing : undefined,
    });
  }
  return NextResponse.json(result);
}
