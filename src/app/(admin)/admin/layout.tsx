// M-SEC — Server-side auth gate for the entire `/admin/*` surface.
//
// Previously this layout performed zero role check — any visitor (even
// anonymous) could render the admin shell. The underlying CRUD endpoints
// were individually gated (`/api/artists/crud`, `/api/auth/register-*`),
// so the blast radius was limited to *read-only* admin pages leaking
// data via the admin-side queries that run in `page.tsx` files. The
// fix: run `requireAdmin()` at the layout boundary and redirect non-
// admins away before any child page renders.
//
// Anonymous → redirect to `/sign-in?redirect_url=/admin`
// Signed-in but not admin → redirect to `/` (no leak, no 403 surface)
// Admin or super_admin → render the shell as before.

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminTopbar } from "@/components/admin/admin-topbar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const result = await requireAdmin();
  if (!result.ok) {
    if (result.status === 401) {
      redirect("/sign-in?redirect_url=/admin");
    }
    // 403 — signed in, but not an admin. Send home; don't flash the shell.
    redirect("/");
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminTopbar />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
