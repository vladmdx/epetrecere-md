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

export default async function VenueDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    redirect("/sign-in?redirect_url=/dashboard/sala");
  }

  const [appUser] = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (!appUser) {
    redirect("/");
  }

  const [venueRecord] = await db
    .select({ id: venues.id, nameRo: venues.nameRo })
    .from(venues)
    .where(eq(venues.userId, appUser.id))
    .limit(1);

  const isAdmin = appUser.role === "admin" || appUser.role === "super_admin";

  if (!venueRecord && !isAdmin) {
    // No venue — send them back to the main dashboard (which will resolve
    // to the artist view if they have an artist profile).
    redirect("/dashboard");
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <VenueSidebar venueName={venueRecord?.nameRo ?? null} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminTopbar />
        <main className="flex-1 overflow-y-auto p-3 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
