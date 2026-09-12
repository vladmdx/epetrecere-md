// Venue-only dashboard layout.
//
// Owns the /dashboard/sala/* namespace with a dedicated sidebar and
// auth gate. A user needs either a venue or an admin role to see it.
// Artists without a venue are redirected back to /dashboard.

import { VenueSidebar } from "@/components/vendor/venue-sidebar";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, venues } from "@/lib/db/schema";
import { listAccessibleVenueIds } from "@/lib/venue-access";
import { DEFAULT_LOCALE, isLocale, localizePath } from "@/lib/i18n/routing";

export default async function VenueDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    redirect(`${localizePath("/sign-in", locale)}?redirect_url=${encodeURIComponent(localizePath("/dashboard/sala", locale))}`);
  }

  const [appUser] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (!appUser) {
    redirect(localizePath("/", locale));
  }

  // ADR 0028 / CP3 #2 — resolve via the membership chain, never an implicit
  // "first venue". With several accessible venues and no selection, send the
  // user to pick one instead of guessing. This layout wraps every /sala/* page,
  // so sub-pages then operate on a single, unambiguous venue.
  const isAdmin = appUser.role === "admin" || appUser.role === "super_admin";
  const venueIds = await listAccessibleVenueIds(appUser.id);
  if (venueIds.length > 1 && !isAdmin) {
    redirect(localizePath("/dashboard/locatii", locale));
  }
  const primaryVenueId = venueIds[0] ?? null;
  const [venueRecord] = primaryVenueId
    ? await db
        .select({ id: venues.id, nameRo: venues.nameRo, slug: venues.slug, isActive: venues.isActive })
        .from(venues)
        .where(eq(venues.id, primaryVenueId))
        .limit(1)
    : [];

  if (!venueRecord && !isAdmin) {
    // No venue — send them back to the main dashboard (which will resolve
    // to the artist view if they have an artist profile).
    redirect(localizePath("/dashboard", locale));
  }

  return (
    <div className="flex h-dvh overflow-hidden">
      <VenueSidebar
        venueName={venueRecord?.nameRo ?? null}
        venueSlug={venueRecord?.slug ?? null}
        isActive={venueRecord?.isActive === true}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <AdminTopbar />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto p-3 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
