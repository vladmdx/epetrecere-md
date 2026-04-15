import { VendorSidebar } from "@/components/vendor/vendor-sidebar";
import { AdminTopbar } from "@/components/admin/admin-topbar";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, artists, venues } from "@/lib/db/schema";

export default async function VendorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    redirect("/sign-in");
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

  if (!artistRecord && !venueRecord && appUser.role !== "admin" && appUser.role !== "super_admin") {
    redirect("/");
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <VendorSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminTopbar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
