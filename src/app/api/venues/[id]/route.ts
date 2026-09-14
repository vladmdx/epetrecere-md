import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { venues, venueImages, reviews, redirects } from "@/lib/db/schema";
import { eq, and, asc, desc, isNull } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/admin";
import {
  authorizeVenueAccess,
  authorizeVenueCapabilityLocked,
  getCurrentAppUser,
  getLockedAppUserById,
  requireVenueCapability,
} from "@/lib/venue-access";
import { publicCatalogData } from "@/lib/privacy/public-catalog";
import { venueOwnerFields } from "@/lib/validation/vendor-profile";
import { revalidateVendorCatalog } from "@/lib/vendors/revalidate";
import {
  acquireAvailabilityLocks,
  acquireLegalScopeLocks,
} from "@/lib/booking/advisory-locks";
import { publishedVenuePredicateSql } from "@/lib/venues/public-publication";
import { getVenueBySlug } from "@/lib/db/queries/venues";
import { allowlistedVenueDetail } from "@/lib/venues/catalog-dto";
import { isMultiHallEnabled } from "@/lib/feature-flags";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // Accept either a numeric id OR a slug (public catalog + the mobile app,
  // which links venues by slug). Resolve the row first, then use its numeric
  // id for the related sub-queries below.
  const numericId = Number(id);
  const result = await db
    .select()
    .from(venues)
    .where(Number.isNaN(numericId) ? eq(venues.slug, id) : eq(venues.id, numericId))
    .limit(1);
  const venue = result[0];
  if (!venue) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const venueId = venue.id;
  const { userId } = await auth();
  // ADR 0028 / CP3 #2 — privileged view resolved through the membership chain,
  // not venues.user_id.
  const appUser = await getCurrentAppUser();
  const access = appUser ? await authorizeVenueAccess(appUser, venue.id) : null;
  const privileged = Boolean(access?.ok);
  if (!venue.isActive && !privileged) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!privileged) {
    const [published] = await db
      .select({ id: venues.id })
      .from(venues)
      .where(and(eq(venues.id, venue.id), publishedVenuePredicateSql()))
      .limit(1);
    if (!published) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Multi-Hall prices are disclosed only through gated-details for the one
    // active Hall explicitly selected by the client. This generic detail API
    // must not become a bypass that enumerates every Hall's prices.
    const revealLegacyPrice = Boolean(userId) && !isMultiHallEnabled();
    const publicVenue = await getVenueBySlug(venue.slug, {
      revealPrices: revealLegacyPrice,
    });
    if (!publicVenue) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(
      publicCatalogData(allowlistedVenueDetail(publicVenue), revealLegacyPrice),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const [images, venueReviews] = await Promise.all([
    db
      .select({
        id: venueImages.id,
        venueId: venueImages.venueId,
        hallId: venueImages.hallId,
        url: venueImages.url,
        altRo: venueImages.altRo,
        altRu: venueImages.altRu,
        altEn: venueImages.altEn,
        sortOrder: venueImages.sortOrder,
        isCover: venueImages.isCover,
      })
      .from(venueImages)
      .innerJoin(venues, eq(venues.id, venueImages.venueId))
      .where(and(
        eq(venueImages.venueId, venueId),
        isNull(venueImages.hallId),
        privileged ? undefined : eq(venues.isActive, true),
      ))
      .orderBy(asc(venueImages.sortOrder), asc(venueImages.id)),
    db.select().from(reviews).where(and(eq(reviews.venueId, venueId), eq(reviews.isApproved, true))).orderBy(desc(reviews.createdAt)).limit(20),
  ]);

  // M0a #8 — price/contact gated behind login.
  const payload = { ...venue, images, reviews: venueReviews };
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

// M12 / ADR 0028 — profile updates require the centralized manage_profile
// capability (organization owner/admin, legacy owner, or global admin).
const updateSchema = z.object({
  nameRo: z.string().min(2).optional(),
  nameRu: z.string().optional(),
  nameEn: z.string().optional(),
  /** 2-80 chars, lowercase kebab-case; server re-sanitizes. */
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug invalid — doar litere/cifre și -")
    .optional(),
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
  menuPdfUrl: z.string().url().optional().or(z.literal("")),
  virtualTourUrl: z.string().url().optional().or(z.literal("")),
  calendarEnabled: z.boolean().optional(),
  isActive: z.boolean().optional(),
  isFeatured: z.boolean().optional(),
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  seoTitleRo: z.string().optional(),
  seoTitleRu: z.string().optional(),
  seoTitleEn: z.string().optional(),
  seoDescRo: z.string().optional(),
  seoDescRu: z.string().optional(),
  seoDescEn: z.string().optional(),
  ogImageUrl: z.string().url().nullable().optional(),
  autoReplyEnabled: z.boolean().optional(),
  autoReplyMessage: z.string().nullable().optional(),
  bufferHours: z.number().int().min(0).max(24).nullable().optional(),
  bufferMinutes: z.number().int().min(15).max(180).optional(),
  workingHours: z
    .object({
      mon: z
        .object({ open: z.string(), close: z.string() })
        .nullable(),
      tue: z
        .object({ open: z.string(), close: z.string() })
        .nullable(),
      wed: z
        .object({ open: z.string(), close: z.string() })
        .nullable(),
      thu: z
        .object({ open: z.string(), close: z.string() })
        .nullable(),
      fri: z
        .object({ open: z.string(), close: z.string() })
        .nullable(),
      sat: z
        .object({ open: z.string(), close: z.string() })
        .nullable(),
      sun: z
        .object({ open: z.string(), close: z.string() })
        .nullable(),
    })
    .nullable()
    .optional(),
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

  // A forged venue id from another organization is rejected here.
  const access = await requireVenueCapability(venueId, "manage_profile");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const expectedOrganizationId = access.organizationId;
  const result = await db.transaction(async (tx) => {
    const executor = tx as unknown as typeof db;

    // The optimistic capability check above is discovery only. Serialize with
    // membership/account changes, availability-sensitive profile writes and
    // moderation, then re-authorize from the locked current rows.
    await acquireLegalScopeLocks(tx, {
      userIds: [access.user.id],
      organizationIds:
        expectedOrganizationId == null ? [] : [expectedOrganizationId],
    });
    await acquireAvailabilityLocks(tx, {
      venueId,
      hallIds: [],
      localDates: [],
      conflictGroupIds: [],
    });

    const actor = await getLockedAppUserById(access.user.id, executor);
    if (!actor) {
      return { ok: false as const, status: 403, error: "Forbidden" };
    }
    const [venue] = await executor
      .select()
      .from(venues)
      .where(eq(venues.id, venueId))
      .for("update")
      .limit(1);
    if (!venue) {
      return { ok: false as const, status: 404, error: "Not found" };
    }
    if (venue.organizationId !== expectedOrganizationId) {
      return {
        ok: false as const,
        status: 409,
        error: "Venue scope changed. Retry the update.",
        code: "VENUE_SCOPE_CHANGED",
      };
    }

    const lockedAccess = await authorizeVenueCapabilityLocked(
      actor,
      venueId,
      "manage_profile",
      executor,
    );
    if (!lockedAccess.ok) {
      return {
        ok: false as const,
        status: lockedAccess.status,
        error: lockedAccess.error,
      };
    }

    // Build the allow-listed owner/admin projection only after the actor role
    // and membership have been frozen. This prevents a demoted admin from
    // retaining moderation-only fields.
    const data: Partial<typeof venues.$inferInsert> = venueOwnerFields(
      parsed.data,
      lockedAccess.viaAdmin,
    );
    if (
      lockedAccess.viaAdmin
      && venue.isActive === false
      && data.isActive === true
      && (venue.userId != null || venue.organizationId != null)
    ) {
      return {
        ok: false as const,
        status: 409,
        error: "Folosește fluxul de aprobare pentru activarea localului.",
        code: "APPROVAL_FLOW_REQUIRED",
      };
    }

    const capacityMin =
      data.capacityMin === undefined ? venue.capacityMin : data.capacityMin;
    const capacityMax =
      data.capacityMax === undefined ? venue.capacityMax : data.capacityMax;
    if (capacityMin != null && capacityMax != null && capacityMin > capacityMax) {
      return {
        ok: false as const,
        status: 400,
        error: "Maximum capacity must not be lower than minimum capacity",
      };
    }
    for (const key of [
      "email",
      "website",
      "menuUrl",
      "menuPdfUrl",
      "virtualTourUrl",
    ] as const) {
      if (data[key] === "") data[key] = null;
    }

    const oldSlug = venue.slug;
    const requestedSlug = typeof data.slug === "string" ? data.slug : null;
    const slugChanged = requestedSlug != null && requestedSlug !== oldSlug;
    if (requestedSlug != null && !slugChanged) {
      delete (data as { slug?: string }).slug;
    }
    if (slugChanged) {
      const [conflict] = await executor
        .select({ id: venues.id })
        .from(venues)
        .where(eq(venues.slug, requestedSlug))
        .limit(1);
      if (conflict && conflict.id !== venueId) {
        return {
          ok: false as const,
          status: 409,
          error: "Slug-ul este deja folosit de altă sală",
        };
      }
    }

    const [updated] = await executor
      .update(venues)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(venues.id, venueId))
      .returning();
    if (!updated) {
      return { ok: false as const, status: 404, error: "Not found" };
    }
    if (slugChanged && requestedSlug) {
      await executor.insert(redirects).values({
        fromPath: `/sali/${oldSlug}`,
        toPath: `/sali/${requestedSlug}`,
        statusCode: "301",
      });
    }
    return { ok: true as const, before: venue, updated };
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, ...(result.code ? { code: result.code } : {}) },
      { status: result.status },
    );
  }
  const { before: venue, updated } = result;
  if (venue.isActive || updated.isActive) {
    const publicationChanged = venue.isActive !== updated.isActive;
    revalidateVendorCatalog("venue", {
      profileSlugs: [venue.slug, updated.slug],
      directory: true,
      homepage: publicationChanged || venue.isFeatured || updated.isFeatured,
      services: publicationChanged,
    });
  }
  return NextResponse.json(updated);
}

// Admin-only: hard-delete a venue. Cascades to venue_images / venue_menu_* /
// reviews via DB FK constraints (ON DELETE CASCADE); booking_requests keep
// their venueId null per spec (bookings shouldn't disappear when a venue is
// removed — they remain as historical records).
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json(
      { error: admin.error },
      { status: admin.status },
    );
  }

  const { id } = await params;
  const venueId = Number(id);
  if (!Number.isSafeInteger(venueId) || venueId <= 0) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const deletion = await db.transaction(async (tx) => {
    const executor = tx as unknown as typeof db;
    await acquireLegalScopeLocks(tx, { userIds: [admin.userId] });
    const lockedAdmin = await getLockedAppUserById(admin.userId, executor);
    if (!lockedAdmin?.isGlobalAdmin) {
      return { ok: false as const, status: 403, error: "Admin only" };
    }

    // Parent first, then the booking rows touched by the FK SET NULL action.
    // Contract signing follows the same vendor -> booking lock order.
    const [existing] = await tx
      .select({ id: venues.id, slug: venues.slug, isActive: venues.isActive })
      .from(venues)
      .where(eq(venues.id, venueId))
      .for("update")
      .limit(1);
    if (!existing) {
      return { ok: false as const, status: 404, error: "Not found" };
    }

    await tx.delete(venues).where(eq(venues.id, venueId));
    return { ok: true as const, deleted: existing };
  });
  if (!deletion.ok) {
    return NextResponse.json(
      { error: deletion.error },
      { status: deletion.status },
    );
  }
  const { deleted: venue } = deletion;
  if (venue.isActive) {
    revalidateVendorCatalog("venue", {
      profileSlugs: [venue.slug],
      directory: true,
      homepage: true,
      services: true,
    });
  }
  return NextResponse.json({ success: true });
}
