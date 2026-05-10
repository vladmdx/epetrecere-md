import { metaForPath } from "@/lib/seo/page-meta";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users, artists, venues } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { WizardClient } from "./client";

export async function generateMetadata() {
  return metaForPath("/planifica", {
    title: "Planifică-ți Evenimentul",
    description:
      "Planifică evenimentul perfect în 7 pași simpli. Selectează artiștii, sala și serviciile de care ai nevoie.",
  });
}

export default async function PlannerPage() {
  // Partners landing on /planifica get bounced to their dashboard. The
  // wizard is a client-only flow; if a partner submits it, every
  // downstream API would 403 anyway. Redirecting here avoids that
  // dead-end UX. Anonymous visitors fall through to the wizard as
  // before — they'll be prompted to sign in at the end.
  const { userId } = await auth();
  if (userId) {
    const [appUser] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.clerkId, userId))
      .limit(1);
    if (appUser) {
      const isAdmin =
        appUser.role === "admin" || appUser.role === "super_admin";
      if (!isAdmin) {
        const [artistOwn] = await db
          .select({ id: artists.id })
          .from(artists)
          .where(eq(artists.userId, appUser.id))
          .limit(1);
        const [venueOwn] = artistOwn
          ? [null]
          : await db
              .select({ id: venues.id })
              .from(venues)
              .where(eq(venues.userId, appUser.id))
              .limit(1);
        if (artistOwn || venueOwn || appUser.role === "artist") {
          redirect("/dashboard");
        }
      }
    }
  }
  return <WizardClient />;
}
