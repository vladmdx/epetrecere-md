// M8 Invitations API
//
// GET — list current user's invitations
// POST — create a new invitation (draft) + optional bulk guests

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { invitations, invitationGuests } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { rateLimit } from "@/lib/rate-limit";
import { requireAppUser } from "@/lib/planner/ownership";

export async function GET() {
  // `invitations.userId` is a `uuid` FK to `users.id` — we must resolve the
  // Clerk session to the internal app-user UUID before querying, otherwise
  // Postgres errors on the type mismatch (bug surfaced by E2E INV-01).
  const appUser = await requireAppUser();
  if (!appUser.ok) {
    return NextResponse.json({ error: appUser.error }, { status: appUser.status });
  }

  const rows = await db
    .select()
    .from(invitations)
    .where(eq(invitations.userId, appUser.userId))
    .orderBy(desc(invitations.createdAt));

  return NextResponse.json(rows);
}

const createSchema = z.object({
  templateId: z.number().int().positive(),
  eventType: z.enum(["wedding", "birthday", "baptism", "corporate"]),
  coupleNames: z.string().optional(),
  hostName: z.string().optional(),
  eventDate: z.string().min(4),
  ceremonyTime: z.string().optional(),
  receptionTime: z.string().optional(),
  ceremonyLocation: z.string().optional(),
  receptionLocation: z.string().optional(),
  message: z.string().max(1000).optional(),
  dressCode: z.string().optional(),
  rsvpDeadline: z.string().optional(),
  allowPlusOne: z.boolean().default(true),
  guests: z
    .array(
      z.object({
        name: z.string().min(1),
        email: z.string().optional(),
        phone: z.string().optional(),
        group: z.string().optional(),
      }),
    )
    .max(500)
    .optional(),
});

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function genToken(): string {
  return (
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  );
}

export async function POST(req: NextRequest) {
  const appUser = await requireAppUser();
  if (!appUser.ok) {
    return NextResponse.json({ error: appUser.error }, { status: appUser.status });
  }

  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = await rateLimit(`invitations:${appUser.userId}:${ip}`, 10, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const baseSlug = slugify(
    data.coupleNames || data.hostName || data.eventType,
  );
  const slug = `${baseSlug}-${genToken().slice(0, 6)}`;

  const [invitation] = await db
    .insert(invitations)
    .values({
      userId: appUser.userId,
      templateId: data.templateId,
      slug,
      status: "draft",
      eventType: data.eventType,
      coupleNames: data.coupleNames,
      hostName: data.hostName,
      eventDate: data.eventDate,
      ceremonyTime: data.ceremonyTime,
      receptionTime: data.receptionTime,
      ceremonyLocation: data.ceremonyLocation,
      receptionLocation: data.receptionLocation,
      message: data.message,
      dressCode: data.dressCode,
      rsvpDeadline: data.rsvpDeadline || null,
      allowPlusOne: data.allowPlusOne,
    })
    .returning();

  // Bulk insert guests (if provided at creation time)
  if (data.guests && data.guests.length > 0) {
    await db.insert(invitationGuests).values(
      data.guests.map((g) => ({
        invitationId: invitation.id,
        name: g.name,
        email: g.email,
        phone: g.phone,
        group: g.group,
        rsvpToken: genToken(),
      })),
    );
  }

  return NextResponse.json(invitation, { status: 201 });
}
