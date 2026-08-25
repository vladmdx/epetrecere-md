// Venue Digital Menu editor — spec section 5.
//
// Lets the venue owner create categories (Aperitive, Preparate etc.),
// items within each category, and packages (per-person offers).

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  users,
  venues,
  venueMenuCategories,
  venueMenuItems,
  venueMenuPackages,
} from "@/lib/db/schema";
import { VenueMenuClient } from "./client";

export const dynamic = "force-dynamic";

export default async function VenueMenuPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in?redirect_url=/dashboard/sala/meniu");

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) redirect("/");

  const [venue] = await db
    .select({
      id: venues.id,
      nameRo: venues.nameRo,
      menuUrl: venues.menuUrl,
      menuPdfUrl: venues.menuPdfUrl,
    })
    .from(venues)
    .where(eq(venues.userId, appUser.id))
    .limit(1);
  if (!venue) redirect("/dashboard");

  const [categories, packages] = await Promise.all([
    db
      .select()
      .from(venueMenuCategories)
      .where(eq(venueMenuCategories.venueId, venue.id))
      .orderBy(asc(venueMenuCategories.sortOrder), asc(venueMenuCategories.id)),
    db
      .select()
      .from(venueMenuPackages)
      .where(eq(venueMenuPackages.venueId, venue.id))
      .orderBy(asc(venueMenuPackages.sortOrder), asc(venueMenuPackages.id)),
  ]);

  const catIds = categories.map((c) => c.id);
  const items =
    catIds.length > 0
      ? await db
          .select()
          .from(venueMenuItems)
          .where(inArray(venueMenuItems.categoryId, catIds))
          .orderBy(asc(venueMenuItems.sortOrder), asc(venueMenuItems.id))
      : [];

  return (
    <VenueMenuClient
      venueId={venue.id}
      venueName={venue.nameRo}
      existingMenuUrl={venue.menuUrl}
      existingMenuPdfUrl={venue.menuPdfUrl}
      initialCategories={categories}
      initialItems={items}
      initialPackages={packages}
    />
  );
}
