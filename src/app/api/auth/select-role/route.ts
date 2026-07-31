// Sets the user's intended role immediately when they pick one on the
// role picker (auth-redirect page). This way they're treated as an
// artist/venue from the moment they pick — even if they don't complete
// onboarding right away — so they see the right dashboard.
//
// - role="artist"  → users.role = "artist" (the existing enum value)
// - role="venue"   → creates a stub venues row tied to the user
//                    (no "venue" enum value exists; ownership is detected
//                    via venues.userId)
// - role="client"  → no DB change, just marks onboardingComplete

import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, users, venues } from "@/lib/db/schema";
import { pickUniqueSlug } from "@/lib/utils/slugify";

const schema = z.object({
  role: z.enum(["client", "artist", "venue"]),
});

export async function POST(req: Request) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Look up or create the user
    let [appUser] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
      })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    if (!appUser) {
      const clerkUser = await currentUser();
      if (!clerkUser) {
        return NextResponse.json({ error: "Profile load failed" }, { status: 500 });
      }
      const email = clerkUser.primaryEmailAddress?.emailAddress;
      if (!email) {
        return NextResponse.json({ error: "No email" }, { status: 400 });
      }
      const [created] = await db
        .insert(users)
        .values({
          clerkId,
          email,
          name:
            [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
            null,
          phone: clerkUser.phoneNumbers?.[0]?.phoneNumber || null,
          avatarUrl: clerkUser.imageUrl || null,
          role: "user",
        })
        .onConflictDoNothing()
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
        });
      if (!created) {
        const [refound] = await db
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
          })
          .from(users)
          .where(eq(users.clerkId, clerkId))
          .limit(1);
        appUser = refound;
      } else {
        appUser = created;
      }
      if (!appUser) {
        return NextResponse.json({ error: "User create failed" }, { status: 500 });
      }
    }

    const role = parsed.data.role;
    const [[artistProfile], [venueProfile]] = await Promise.all([
      db
        .select({ id: artists.id })
        .from(artists)
        .where(eq(artists.userId, appUser.id))
        .limit(1),
      db
        .select({ id: venues.id })
        .from(venues)
        .where(eq(venues.userId, appUser.id))
        .limit(1),
    ]);

    const roleConflict =
      (role === "artist" && Boolean(venueProfile)) ||
      (role === "venue" && (Boolean(artistProfile) || appUser.role === "artist")) ||
      (role === "client" &&
        (Boolean(artistProfile) || Boolean(venueProfile) || appUser.role === "artist"));
    if (roleConflict) {
      return NextResponse.json(
        {
          error:
            "Rolul contului este deja stabilit. Folosește un cont separat pentru alt tip de profil.",
        },
        { status: 409 },
      );
    }

    if (role === "artist") {
      // Set role to artist immediately. Onboarding still required to
      // create the artist row (which will be inactive until admin approves).
      await db
        .update(users)
        .set({
          role: "artist",
          onboardingComplete: true,
          updatedAt: new Date(),
        })
        .where(eq(users.id, appUser.id));
    } else if (role === "venue") {
      // Create a stub venue row so /dashboard/sala detects ownership.
      // The user can fill in details via the venue onboarding flow.
      const [existing] = await db
        .select({ id: venues.id })
        .from(venues)
        .where(eq(venues.userId, appUser.id))
        .limit(1);
      if (!existing) {
        const baseName = appUser.name || "Sală nouă";
        // Clean slug — same helper as register-venue. Conflicts get -2/-3
        // suffixes; no timestamp noise.
        const slug = await pickUniqueSlug(baseName, async (candidate) => {
          const [hit] = await db
            .select({ id: venues.id })
            .from(venues)
            .where(eq(venues.slug, candidate))
            .limit(1);
          return !!hit;
        });
        await db.insert(venues).values({
          userId: appUser.id,
          nameRo: baseName,
          slug,
          phone: "",
          city: "Chișinău",
          isActive: false,
          // Launch phase parity with register-venue.
          isFeatured: true,
          facilities: [],
        });
      }
      await db
        .update(users)
        .set({ onboardingComplete: true, updatedAt: new Date() })
        .where(eq(users.id, appUser.id));
    } else {
      // Client — just mark onboarding complete.
      await db
        .update(users)
        .set({ onboardingComplete: true, updatedAt: new Date() })
        .where(eq(users.id, appUser.id));
    }

    return NextResponse.json({ success: true, role });
  } catch (err) {
    console.error("[select-role] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
