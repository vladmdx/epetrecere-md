import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { partnerOrganizationMembers, users } from "@/lib/db/schema";
import { isLastActiveOwner, requireOrganizationCapability } from "@/lib/venue-access";
import { jsonAccess, jsonError } from "@/lib/http/json";
import { jsonIfMultiHallDisabled } from "@/lib/partner/multi-hall-gate";

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
  const [existing] = await db
    .select({ id: partnerOrganizationMembers.id })
    .from(partnerOrganizationMembers)
    .where(and(
      eq(partnerOrganizationMembers.organizationId, organizationId),
      eq(partnerOrganizationMembers.userId, parsed.data.userId),
    ))
    .limit(1);
  if (existing) {
    const [updated] = await db
      .update(partnerOrganizationMembers)
      .set({ role: parsed.data.role, isActive: true, updatedAt: new Date() })
      .where(eq(partnerOrganizationMembers.id, existing.id))
      .returning();
    return NextResponse.json({ member: updated });
  }
  const [created] = await db.insert(partnerOrganizationMembers).values({
    organizationId,
    userId: parsed.data.userId,
    role: parsed.data.role,
    isActive: true,
  }).returning();
  return NextResponse.json({ member: created });
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
  const [member] = await db
    .select()
    .from(partnerOrganizationMembers)
    .where(eq(partnerOrganizationMembers.id, parsed.data.memberId))
    .limit(1);
  if (!member || member.organizationId !== organizationId) return jsonError("Not found", 404);
  if ((parsed.data.isActive === false || (parsed.data.role && parsed.data.role !== "owner")) &&
      await isLastActiveOwner(organizationId, member.userId)) {
    return jsonError("LAST_ORG_OWNER_TRANSFER_REQUIRED", 409, { code: "LAST_ORG_OWNER_TRANSFER_REQUIRED" });
  }
  const [updated] = await db.update(partnerOrganizationMembers).set({
    role: parsed.data.role ?? member.role,
    isActive: parsed.data.isActive ?? member.isActive,
    updatedAt: new Date(),
  }).where(eq(partnerOrganizationMembers.id, member.id)).returning();
  return NextResponse.json({ member: updated });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const organizationId = Number((await ctx.params).id);
  const access = await requireOrganizationCapability(organizationId, "manage_members");
  if (!access.ok) return jsonAccess(access);
  const blocked = jsonIfMultiHallDisabled();
  if (blocked) return blocked;
  const { memberId } = z.object({ memberId: z.number().int().positive() }).parse(await req.json().catch(() => ({})));
  const [member] = await db.select().from(partnerOrganizationMembers).where(eq(partnerOrganizationMembers.id, memberId)).limit(1);
  if (!member || member.organizationId !== organizationId) return jsonError("Not found", 404);
  if (await isLastActiveOwner(organizationId, member.userId)) {
    return jsonError("LAST_ORG_OWNER_TRANSFER_REQUIRED", 409, { code: "LAST_ORG_OWNER_TRANSFER_REQUIRED" });
  }
  await db.update(partnerOrganizationMembers).set({ isActive: false, updatedAt: new Date() }).where(eq(partnerOrganizationMembers.id, member.id));
  return NextResponse.json({ ok: true });
}
