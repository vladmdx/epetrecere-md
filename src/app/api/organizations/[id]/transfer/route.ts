import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { requireOrganizationCapability } from "@/lib/venue-access";
import { jsonAccess, jsonError } from "@/lib/http/json";
import { transferOrganizationOwner } from "@/lib/partner/onboarding";
import { jsonIfMultiHallDisabled } from "@/lib/partner/multi-hall-gate";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({ toUserId: z.string().uuid() });

export async function POST(req: Request, ctx: Ctx) {
  const organizationId = Number((await ctx.params).id);
  const access = await requireOrganizationCapability(organizationId, "manage_members");
  if (!access.ok) return jsonAccess(access);
  const blocked = jsonIfMultiHallDisabled();
  if (blocked) return blocked;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Validation failed", 400);
  const result = await transferOrganizationOwner(organizationId, access.user.id, parsed.data.toUserId);
  if (!result.ok) return jsonError(result.error, result.status);
  return NextResponse.json({ ok: true });
}
