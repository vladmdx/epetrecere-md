import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, artists } from "@/lib/db/schema";
import { VendorLayoutChrome } from "@/components/vendor/vendor-layout-chrome";
import { listAccessibleVenueIds } from "@/lib/venue-access";
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
  if (venueIds.length > 1 && !isAdmin) {
    redirect("/dashboard/locatii");
  }
  const venueRecord = venueIds.length === 1 ? { id: venueIds[0] } : undefined;
  // Artists who picked the role on the picker but haven't completed
  // onboarding yet have role="artist" without an artist record. Let
  // them through so the dashboard can prompt them to finish setup.
  const isArtistRole = appUser.role === "artist";

  if (!artistRecord && !venueRecord && !isAdmin && !isArtistRole) {
    redirect("/");
  }

  // The chrome component decides whether to render the artist sidebar
  // or pass through to the venue-specific layout at /dashboard/sala/*.
  return <VendorLayoutChrome>{children}</VendorLayoutChrome>;
}
