"use client";

// Chrome wrapper that hides the artist sidebar/topbar when on
// /dashboard/sala/* routes — the venue-specific layout at that path
// renders its own sidebar and topbar.

import { usePathname } from "next/navigation";
import { VendorSidebar } from "@/components/vendor/vendor-sidebar";
import { AdminTopbar } from "@/components/admin/admin-topbar";

export function VendorLayoutChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isSalaRoute = pathname?.startsWith("/dashboard/sala") ?? false;

  if (isSalaRoute) {
    // Pass-through — venue layout owns the chrome.
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-[100dvh] md:h-screen md:overflow-hidden">
      <VendorSidebar />
      <div className="flex min-w-0 flex-1 flex-col md:overflow-hidden">
        <AdminTopbar />
        <main className="flex-1 p-3 sm:p-6 md:overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
