import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { venues, venueImages, reviews, users } from "@/lib/db/schema";
import { eq, and, asc, desc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/admin";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const venueId = Number(id);
  if (isNaN(venueId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const result = await db.select().from(venues).where(eq(venues.id, venueId)).limit(1);
  const venue = result[0];
  if (!venue) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [images, venueReviews] = await Promise.all([
    db.select().from(venueImages).where(eq(venueImages.venueId, venueId)).orderBy(asc(venueImages.sortOrder)),
    db.select().from(reviews).where(and(eq(reviews.venueId, venueId), eq(reviews.isApproved, true))).orderBy(desc(reviews.createdAt)).limit(20),
  ]);

  // M0a #8 — price/contact gated behind login.
  const { userId } = await auth();
  const payload = userId
    ? venue
    : {
        ...venue,
        pricePerPerson: null,
        phone: null,
        email: null,
        website: null,
      };

  return NextResponse.json({ ...payload, images, reviews: venueReviews });
}

// M12 — Owner-gated venue profile update. The signed-in user must own the
// venue row (venues.userId === users.id for the current Clerk session).
const updateSchema = z.object({
  nameRo: z.string().min(2).optional(),
  nameRu: z.string().optional(),
  nameEn: z.string().optional(),
  descriptionRo: z.string().optional(),
  descriptionRu: z.string().optional(),
  descriptionEn: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  capacityMin: z.number().int().positive().nullable().optional(),
  capacityMax: z.number().int().positive().nullable().optional(),
  pricePerPerson: z.number().int().nonnegative().nullable().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  website: z.string().url().optional().or(z.literal("")),
  facilities: z.array(z.string()).optional(),
  menuUrl: z.string().url().optional().or(z.literal("")),
  virtualTourUrl: z.string().url().optional().or(z.literal("")),
  calendarEnabled: z.boolean().optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
});

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const venueId = Number(id);
  if (!Number.isFinite(venueId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (!appUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const [venue] = await db
    .select({ id: venues.id, userId: venues.userId })
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);

  if (!venue) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Allow admin OR venue owner
  const admin = await requireAdmin();
  const isAdmin = admin.ok;

  if (!isAdmin && venue.userId !== appUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  // Strip empty strings to null for URL/email columns so we don't persist "".
  const data = { ...parsed.data };
  for (const k of ["email", "website", "menuUrl", "virtualTourUrl"] as const) {
    if (data[k] === "") data[k] = undefined;
  }

  await db
    .update(venues)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(venues.id, venueId));

  const [updated] = await db
    .select()
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  return NextResponse.json(updated);
}
