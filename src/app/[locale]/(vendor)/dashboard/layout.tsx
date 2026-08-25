import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, artists, venues } from "@/lib/db/schema";
import { VendorLayoutChrome } from "@/components/vendor/vendor-layout-chrome";
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

  const [venueRecord] = await db
    .select({ id: venues.id })
    .from(venues)
    .where(eq(venues.userId, appUser.id))
    .limit(1);

  const isAdmin = appUser.role === "admin" || appUser.role === "super_admin";
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
