"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useClerk, useUser } from "@clerk/nextjs";
import { Globe, Settings, UserCircle } from "lucide-react";
import Link from "@/components/shared/locale-link";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { DashboardSignOut } from "@/components/shared/dashboard-sign-out";
import { useLocale } from "@/hooks/use-locale";
import { dashboardAccountLinks } from "@/lib/dashboard-account-links";

export function DashboardAccountMenu() {
  const { user, isLoaded, isSignedIn } = useUser();
  const { openUserProfile } = useClerk();
  const { t } = useLocale();
  const pathname = usePathname() || "/dashboard";
  const links = dashboardAccountLinks(pathname);
  const [open, setOpen] = useState(false);
  const itemClass = "flex min-h-11 w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        disabled={!isLoaded || !isSignedIn}
        aria-label={t("header.myAccount")}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {user?.imageUrl ? (
          <img src={user.imageUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
        ) : <UserCircle className="h-6 w-6 text-gold" aria-hidden="true" />}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-72 max-w-[calc(100vw-1rem)] gap-1 p-2">
        <div className="min-w-0 border-b border-border px-3 py-2">
          <PopoverTitle>{t("header.myAccount")}</PopoverTitle>
          <p className="truncate text-sm">{user?.fullName}</p>
          <p className="break-all text-xs text-muted-foreground">{user?.primaryEmailAddress?.emailAddress}</p>
        </div>
        {links.profile ? (
          <Link href={links.profile} className={itemClass} onClick={() => setOpen(false)}>
            <UserCircle className="h-4 w-4" aria-hidden="true" />{t("header.myAccount")}
          </Link>
        ) : (
          <button type="button" className={itemClass} onClick={() => { setOpen(false); openUserProfile(); }}>
            <UserCircle className="h-4 w-4" aria-hidden="true" />{t("header.myAccount")}
          </button>
        )}
        <Link href={links.settings} className={itemClass} onClick={() => setOpen(false)}>
          <Settings className="h-4 w-4" aria-hidden="true" />{t("dashboard.settings")}
        </Link>
        <Link href="/" className={itemClass} onClick={() => setOpen(false)}>
          <Globe className="h-4 w-4" aria-hidden="true" />{t("dashboard.viewSite")}
        </Link>
        <div className="border-t border-border pt-1"><DashboardSignOut /></div>
      </PopoverContent>
    </Popover>
  );
}
