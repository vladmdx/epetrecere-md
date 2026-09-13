import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { partnerOrganizationMembers, users } from "@/lib/db/schema";
import { requireOrganizationCapability } from "@/lib/venue-access";
import { jsonAccess, jsonError } from "@/lib/http/json";
import { jsonIfMultiHallDisabled } from "@/lib/partner/multi-hall-gate";
import {
  updateOrganizationMember,
  upsertOrganizationMember,
} from "@/lib/partner/organization-members";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const organizationId = Number((await ctx.params).id);
  const access = await requireOrganizationCapability(organizationId, "view_organization");
  if (!access.ok) return jsonAccess(access);
  const members = await db
    .select({
      id: partnerOrganizationMembers.id,
      userId: partnerOrganizationMembers.userId,
      role: partnerOrganizationMembers.role,
      isActive: partnerOrganizationMembers.isActive,
      email: users.email,
      name: users.name,
    })
    .from(partnerOrganizationMembers)
    .innerJoin(users, eq(users.id, partnerOrganizationMembers.userId))
    .where(eq(partnerOrganizationMembers.organizationId, organizationId));
  return NextResponse.json({ members });
}

const createSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["owner", "admin", "manager", "staff"]).default("staff"),
});

export async function POST(req: Request, ctx: Ctx) {
  const organizationId = Number((await ctx.params).id);
  const access = await requireOrganizationCapability(organizationId, "manage_members");
  if (!access.ok) return jsonAccess(access);
  const blocked = jsonIfMultiHallDisabled();
  if (blocked) return blocked;
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Validation failed", 400, { details: parsed.error.issues });
  const result = await upsertOrganizationMember(
    access.user.id,
    organizationId,
    parsed.data,
  );
  if (!result.ok) return jsonError(result.error, result.status, { code: result.code });
  return NextResponse.json({ member: result.member });
}

const patchSchema = z.object({
  memberId: z.number().int().positive(),
  role: z.enum(["owner", "admin", "manager", "staff"]).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, ctx: Ctx) {
  const organizationId = Number((await ctx.params).id);
  const access = await requireOrganizationCapability(organizationId, "manage_members");
  if (!access.ok) return jsonAccess(access);
  const blocked = jsonIfMultiHallDisabled();
  if (blocked) return blocked;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("Validation failed", 400);
  const result = await updateOrganizationMember(
    access.user.id,
    organizationId,
    parsed.data.memberId,
    { role: parsed.data.role, isActive: parsed.data.isActive },
  );
  if (!result.ok) return jsonError(result.error, result.status, { code: result.code });
  return NextResponse.json({ member: result.member });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const organizationId = Number((await ctx.params).id);
  const access = await requireOrganizationCapability(organizationId, "manage_members");
  if (!access.ok) return jsonAccess(access);
  const blocked = jsonIfMultiHallDisabled();
  if (blocked) return blocked;
  const { memberId } = z.object({ memberId: z.number().int().positive() }).parse(await req.json().catch(() => ({})));
  const result = await updateOrganizationMember(
    access.user.id,
    organizationId,
    memberId,
    { isActive: false },
  );
  if (!result.ok) return jsonError(result.error, result.status, { code: result.code });
  return NextResponse.json({ ok: true, member: result.member });
}
