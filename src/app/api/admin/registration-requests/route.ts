import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { artists, venues, users, categories, notifications } from "@/lib/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { sendEmail } from "@/lib/email/send";
import { registrationStatusEmail } from "@/lib/email/templates/registration-status";

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
      createdAt: artists.createdAt,
      userId: artists.userId,
    })
    .from(artists)
    .where(and(eq(artists.isActive, false), sql`${artists.userId} IS NOT NULL`))
    .orderBy(artists.createdAt);

  // Get pending venues
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
      createdAt: venues.createdAt,
      userId: venues.userId,
    })
    .from(venues)
    .where(and(eq(venues.isActive, false), sql`${venues.userId} IS NOT NULL`))
    .orderBy(venues.createdAt);

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
          .where(sql`${users.id} IN ${userIds}`)
      : [];
  const userMap = new Map(userRows.map((u) => [u.id, u]));

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
        createdAt: v.createdAt?.toISOString() ?? new Date().toISOString(),
        userId: v.userId,
        userName: u?.name ?? null,
        userEmail: u?.email ?? null,
      };
    }),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json(result);
}

// POST — approve or reject a registration
export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { id, type, action } = body as {
    id: number;
    type: "artist" | "venue";
    action: "approve" | "reject";
  };

  if (!id || !type || !action) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

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
            .set({ role: "user" })
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

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[registration-requests] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
