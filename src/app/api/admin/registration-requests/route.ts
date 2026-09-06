import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { artists, venues, users, categories, notifications, venueImages, artistPackages, legalAcceptances } from "@/lib/db/schema";
import { eq, and, sql, inArray, asc, desc } from "drizzle-orm";
import { sendEmail } from "@/lib/email/send";
import { registrationStatusEmail } from "@/lib/email/templates/registration-status";
import { registrationDecisionSchema } from "@/lib/validation/vendor-profile";
import { missingRegistrationDocuments } from "@/lib/legal/registration-gate";
import { revalidateVendorCatalog } from "@/lib/vendors/revalidate";

async function requireAdmin() {
  const { userId: clerkId } = await auth();
  if (!clerkId) return null;
  const [user] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!user || (user.role !== "admin" && user.role !== "super_admin")) return null;
  return user;
}

// GET — list pending registrations (artists + venues with isActive=false)
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get pending artists (isActive=false, have a userId — registered through onboarding)
  const pendingArtists = await db
    .select({
      id: artists.id,
      name: artists.nameRo,
      email: artists.email,
      phone: artists.phone,
      location: artists.location,
      description: artists.descriptionRo,
      categoryIds: artists.categoryIds,
      photoUrl: artists.photoUrl,
      baseCity: artists.baseCity,
      travelDistanceKm: artists.travelDistanceKm,
      travelSurchargeEnabled: artists.travelSurchargeEnabled,
      travelSurchargeAmount: artists.travelSurchargeAmount,
      priceHidden: artists.priceHidden,
      priceFrom: artists.priceFrom,
      createdAt: artists.createdAt,
      userId: artists.userId,
    })
    .from(artists)
    .where(and(eq(artists.isActive, false), sql`${artists.userId} IS NOT NULL`))
    .orderBy(artists.createdAt);

  // Get pending venues — pull a cover image so admins can see what they're approving.
  const pendingVenues = await db
    .select({
      id: venues.id,
      name: venues.nameRo,
      email: venues.email,
      phone: venues.phone,
      city: venues.city,
      address: venues.address,
      description: venues.descriptionRo,
      capacityMin: venues.capacityMin,
      capacityMax: venues.capacityMax,
      website: venues.website,
      menuUrl: venues.menuUrl,
      menuPdfUrl: venues.menuPdfUrl,
      virtualTourUrl: venues.virtualTourUrl,
      workingHours: venues.workingHours,
      lat: venues.lat,
      lng: venues.lng,
      createdAt: venues.createdAt,
      userId: venues.userId,
    })
    .from(venues)
    .where(and(eq(venues.isActive, false), sql`${venues.userId} IS NOT NULL`))
    .orderBy(venues.createdAt);

  // Cover images for the pending venues — venues' first uploaded photo.
  const venueIds = pendingVenues.map((v) => v.id);
  const venueImageRows = venueIds.length > 0
    ? await db
        .select({
          venueId: venueImages.venueId,
          url: venueImages.url,
          isCover: venueImages.isCover,
          sortOrder: venueImages.sortOrder,
        })
        .from(venueImages)
        .where(inArray(venueImages.venueId, venueIds))
        .orderBy(desc(venueImages.isCover), asc(venueImages.sortOrder))
    : [];
  const venueCoverMap = new Map<number, string>();
  for (const row of venueImageRows) {
    if (!venueCoverMap.has(row.venueId)) venueCoverMap.set(row.venueId, row.url);
  }

  // Get all categories for artist category names
  const allCategories = await db
    .select({ id: categories.id, nameRo: categories.nameRo })
    .from(categories);
  const catMap = new Map(allCategories.map((c) => [c.id, c.nameRo]));

  // Get user info for all pending items
  const userIds = [
    ...pendingArtists.map((a) => a.userId).filter(Boolean),
    ...pendingVenues.map((v) => v.userId).filter(Boolean),
  ] as string[];

  const userRows =
    userIds.length > 0
      ? await db
          .select({ id: users.id, name: users.name, email: users.email })
          .from(users)
          .where(inArray(users.id, userIds))
      : [];
  const userMap = new Map(userRows.map((u) => [u.id, u]));
  const signedRows = userIds.length ? await db.select({
    id: legalAcceptances.id,
    userId: legalAcceptances.userId,
    subjectType: legalAcceptances.subjectType,
    documentSlug: legalAcceptances.documentSlug,
    documentTitle: legalAcceptances.documentTitle,
    signatureName: legalAcceptances.signatureName,
    acceptedAt: legalAcceptances.acceptedAt,
  }).from(legalAcceptances).where(inArray(legalAcceptances.userId, userIds))
    .orderBy(desc(legalAcceptances.acceptedAt)) : [];
  const contractsFor = (userId: string | null, subjectType: "artist" | "venue") => signedRows
    .filter(row => row.userId === userId && row.subjectType === subjectType)
    .map(row => ({ ...row, copyUrl: `/api/legal/accept/${row.id}/copy` }));
  const artistIds = pendingArtists.map(a => a.id);
  const packageRows = artistIds.length ? await db.select().from(artistPackages)
    .where(inArray(artistPackages.artistId, artistIds)) : [];

  // Combine into unified list
  const result = [
    ...pendingArtists.map((a) => {
      const u = a.userId ? userMap.get(a.userId) : null;
      const catName =
        a.categoryIds && a.categoryIds.length > 0
          ? a.categoryIds.map((id) => catMap.get(id) || `#${id}`).join(", ")
          : null;
      return {
        id: a.id,
        type: "artist" as const,
        name: a.name,
        email: a.email,
        phone: a.phone,
        location: a.location,
        description: a.description,
        categoryName: catName,
        capacity: null,
        photoUrl: a.photoUrl ?? null,
        baseCity: a.baseCity,
        travelDistanceKm: a.travelDistanceKm,
        travelSurchargeEnabled: a.travelSurchargeEnabled,
        travelSurchargeAmount: a.travelSurchargeAmount,
        priceHidden: a.priceHidden,
        priceFrom: a.priceFrom,
        packages: packageRows.filter(p => p.artistId === a.id),
        contracts: contractsFor(a.userId, "artist"),
        createdAt: a.createdAt?.toISOString() ?? new Date().toISOString(),
        userId: a.userId,
        userName: u?.name ?? null,
        userEmail: u?.email ?? null,
      };
    }),
    ...pendingVenues.map((v) => {
      const u = v.userId ? userMap.get(v.userId) : null;
      const cap =
        v.capacityMin && v.capacityMax
          ? `${v.capacityMin}–${v.capacityMax}`
          : v.capacityMax
            ? `până la ${v.capacityMax}`
            : null;
      return {
        id: v.id,
        type: "venue" as const,
        name: v.name,
        email: v.email,
        phone: v.phone,
        location: v.city ?? null,
        description: v.description,
        categoryName: null,
        capacity: cap,
        photoUrl: venueCoverMap.get(v.id) ?? null,
        address: v.address,
        website: v.website,
        menuUrl: v.menuUrl,
        menuPdfUrl: v.menuPdfUrl,
        virtualTourUrl: v.virtualTourUrl,
        workingHours: v.workingHours,
        lat: v.lat,
        lng: v.lng,
        images: venueImageRows.filter(image => image.venueId === v.id),
        contracts: contractsFor(v.userId, "venue"),
        createdAt: v.createdAt?.toISOString() ?? new Date().toISOString(),
        userId: v.userId,
        userName: u?.name ?? null,
        userEmail: u?.email ?? null,
      };
    }),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}

// POST — approve or reject a registration
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = registrationDecisionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid registration decision" }, { status: 400 });
  const { id, type, action } = parsed.data;

  try {
    if (type === "artist") {
      const [artist] = await db
        .select({
          id: artists.id,
          nameRo: artists.nameRo,
          email: artists.email,
          userId: artists.userId,
        })
        .from(artists)
        .where(eq(artists.id, id))
        .limit(1);

      if (!artist) {
        return NextResponse.json({ error: "Artist not found" }, { status: 404 });
      }

      if (action === "approve") {
        if (artist.userId) {
          const missing = await missingRegistrationDocuments(artist.userId, "artist");
          if (missing.length) return NextResponse.json({ error: "current_signed_contract_required", missing }, { status: 409 });
        }
        await db
          .update(artists)
          .set({ isActive: true, updatedAt: new Date() })
          .where(eq(artists.id, id));

        // Notify artist
        if (artist.userId) {
          await db.insert(notifications).values({
            userId: artist.userId,
            type: "registration_approved",
            title: "Profilul tău a fost aprobat! 🎉",
            message: "Profilul tău este acum vizibil pe ePetrecere.md. Bine ai venit!",
            actionUrl: "/dashboard",
          });
        }

        // Send email
        const email = artist.email;
        if (email) {
          await sendEmail({
            to: email,
            subject: "Profilul tău pe ePetrecere.md a fost aprobat! 🎉",
            html: registrationStatusEmail({
              name: artist.nameRo,
              type: "artist",
              approved: true,
            }),
          }).catch((err) => console.error("[email] Failed to send approval email:", err));
        }
      } else {
        // Reject — delete artist record and reset user role
        if (artist.userId) {
          await db
            .update(users)
            .set({ role: "user", onboardingComplete: false, updatedAt: new Date() })
            .where(eq(users.id, artist.userId));

          await db.insert(notifications).values({
            userId: artist.userId,
            type: "registration_rejected",
            title: "Cererea ta a fost refuzată",
            message:
              "Profilul tău nu a fost aprobat. Contactează-ne dacă ai întrebări.",
            actionUrl: "/contact",
          });
        }

        const email = artist.email;
        if (email) {
          await sendEmail({
            to: email,
            subject: "Actualizare privind înregistrarea pe ePetrecere.md",
            html: registrationStatusEmail({
              name: artist.nameRo,
              type: "artist",
              approved: false,
            }),
          }).catch((err) => console.error("[email] Failed to send rejection email:", err));
        }

        await db.delete(artists).where(eq(artists.id, id));
      }
    } else if (type === "venue") {
      const [venue] = await db
        .select({
          id: venues.id,
          nameRo: venues.nameRo,
          email: venues.email,
          userId: venues.userId,
        })
        .from(venues)
        .where(eq(venues.id, id))
        .limit(1);

      if (!venue) {
        return NextResponse.json({ error: "Venue not found" }, { status: 404 });
      }

      if (action === "approve") {
        if (venue.userId) {
          const missing = await missingRegistrationDocuments(venue.userId, "venue");
          if (missing.length) return NextResponse.json({ error: "current_signed_contract_required", missing }, { status: 409 });
        }
        await db
          .update(venues)
          .set({ isActive: true, updatedAt: new Date() })
          .where(eq(venues.id, id));

        if (venue.userId) {
          await db.insert(notifications).values({
            userId: venue.userId,
            type: "registration_approved",
            title: "Sala ta a fost aprobată! 🎉",
            message:
              "Sala ta este acum vizibilă pe ePetrecere.md. Bine ai venit!",
            actionUrl: "/dashboard",
          });
        }

        const email = venue.email;
        if (email) {
          await sendEmail({
            to: email,
            subject: "Sala ta pe ePetrecere.md a fost aprobată! 🎉",
            html: registrationStatusEmail({
              name: venue.nameRo,
              type: "venue",
              approved: true,
            }),
          }).catch((err) => console.error("[email] Failed to send approval email:", err));
        }
      } else {
        if (venue.userId) {
          await db.update(users).set({ onboardingComplete: false, updatedAt: new Date() }).where(eq(users.id, venue.userId));
          await db.insert(notifications).values({
            userId: venue.userId,
            type: "registration_rejected",
            title: "Cererea ta a fost refuzată",
            message:
              "Sala ta nu a fost aprobată. Contactează-ne dacă ai întrebări.",
            actionUrl: "/contact",
          });
        }

        const email = venue.email;
        if (email) {
          await sendEmail({
            to: email,
            subject: "Actualizare privind înregistrarea pe ePetrecere.md",
            html: registrationStatusEmail({
              name: venue.nameRo,
              type: "venue",
              approved: false,
            }),
          }).catch((err) => console.error("[email] Failed to send rejection email:", err));
        }

        await db.delete(venues).where(eq(venues.id, id));
      }
    }

    revalidateVendorCatalog(type);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[registration-requests] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
