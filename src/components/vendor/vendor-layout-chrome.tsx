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
    <div className="flex h-screen overflow-hidden">
      <VendorSidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminTopbar />
        <main className="flex-1 overflow-y-auto p-3 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
