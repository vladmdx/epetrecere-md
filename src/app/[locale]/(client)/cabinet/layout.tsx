import { ClientSidebar } from "@/components/client/client-sidebar";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { users, artists, venues } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { listAccessibleVenueIds } from "@/lib/venue-access";
import { signInPath } from "@/lib/i18n/server-redirect";
import { DEFAULT_LOCALE, isLocale, localizePath } from "@/lib/i18n/routing";

export default async function ClientLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const { userId } = await auth();
  if (!userId) {
    redirect(await signInPath());
  }

  // Partners (artists / venue owners) get bounced to /dashboard. Visiting
  // /cabinet/* as a partner used to load the client UI, which let them
  // (theoretically) create event plans or favorite themselves. Centralising
  // the gate here means every client page inherits the protection.
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
            .where(inArray(venues.id, await listAccessibleVenueIds(appUser.id)))
            .limit(1);
      if (artistOwn || venueOwn || appUser.role === "artist") {
        redirect(localizePath("/dashboard", locale));
      }
    }
  }

  return (
    <div className="cabinet-shell flex h-screen overflow-hidden">
      <ClientSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminTopbar />
        <main className="flex-1 overflow-y-auto p-3 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
