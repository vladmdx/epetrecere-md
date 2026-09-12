import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, artists } from "@/lib/db/schema";
import { VendorLayoutChrome } from "@/components/vendor/vendor-layout-chrome";
import { listAccessibleOrganizations, listAccessibleVenueIds } from "@/lib/venue-access";
import { signInPath } from "@/lib/i18n/server-redirect";

export default async function VendorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    redirect(await signInPath());
  }

  const [appUser] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (!appUser) {
    redirect("/");
  }

  const [artistRecord] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.userId, appUser.id))
    .limit(1);

  const isAdmin = appUser.role === "admin" || appUser.role === "super_admin";

  // ADR 0028 / CP3 #2 — venue partner detection via the membership resolver.
  // No implicit "first venue": a multi-venue owner with no selection is sent to
  // pick one. (Cannot happen while UNIQUE(venues.user_id) still holds, but the
  // guard is in place for when it is lifted.)
  const venueIds = await listAccessibleVenueIds(appUser.id);
  const venueRecord = venueIds.length > 0 ? { id: venueIds[0] } : undefined;
  const organizations = await listAccessibleOrganizations(appUser.id);
  const isArtistRole = appUser.role === "artist";

  if (!artistRecord && !venueRecord && organizations.length === 0 && !isAdmin && !isArtistRole) {
    redirect("/");
  }

  // The chrome component decides whether to render the artist sidebar
  // or pass through to the venue-specific layout at /dashboard/sala/*.
  return <VendorLayoutChrome>{children}</VendorLayoutChrome>;
}
