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
  const pathname = usePathname()?.replace(/^\/(ro|ru|en)(?=\/|$)/, "");
  const isSalaRoute =
    (pathname?.startsWith("/dashboard/sala") ?? false) ||
    Boolean(pathname?.match(/^\/dashboard\/locatii\/\d+/));

  if (isSalaRoute) {
    // Pass-through — venue layout owns the chrome.
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-dvh md:h-dvh md:overflow-hidden">
      <VendorSidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:overflow-hidden">
        <AdminTopbar />
        <main className="min-h-0 min-w-0 flex-1 p-3 sm:p-6 md:overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
