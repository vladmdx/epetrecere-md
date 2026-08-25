"use client";

// Venue-only sidebar for /dashboard/sala/*.
// 11 items per the Venue Dashboard Spec (section 0).
// Desktop: fixed left column. Mobile: fullscreen Sheet drawer triggered
// by a hamburger in the topbar (via `VenueSidebarMobileTrigger`).

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Calendar,
  Inbox,
  Image as ImageIcon,
  UtensilsCrossed,
  MessageSquare,
  Star,
  Wallet,
  BarChart3,
  Bot,
  Settings,
  Globe,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks/use-locale";

const NAV_ITEMS = [
  { href: "/dashboard/sala", icon: LayoutDashboard, labelKey: "dashboard.myPanel" },
  { href: "/dashboard/sala/calendar", icon: Calendar, labelKey: "dashboard.calendar" },
  { href: "/dashboard/sala/rezervari", icon: Inbox, labelKey: "dashboard.bookings" },
  { href: "/dashboard/sala/profil", icon: ImageIcon, labelKey: "vendor.venueSidebar.profileGallery" },
  { href: "/dashboard/sala/meniu", icon: UtensilsCrossed, labelKey: "vendor.venueSidebar.digitalMenu" },
  { href: "/dashboard/sala/mesaje", icon: MessageSquare, labelKey: "dashboard.messages" },
  { href: "/dashboard/sala/recenzii", icon: Star, labelKey: "dashboard.reviews" },
  { href: "/dashboard/sala/financiar", icon: Wallet, labelKey: "dashboard.financial" },
  { href: "/dashboard/sala/analitice", icon: BarChart3, labelKey: "vendor.venueSidebar.analytics" },
  { href: "/dashboard/sala/ai-assistant", icon: Bot, labelKey: "vendor.ai_assistant" },
  { href: "/dashboard/sala/setari", icon: Settings, labelKey: "dashboard.settings" },
] as const;

function NavList({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  const { t } = useLocale();
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive =
          pathname === item.href ||
          (item.href !== "/dashboard/sala" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
              isActive
                ? "bg-gold/10 text-gold font-medium"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{t(item.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function VenueSidebar({
  venueName,
  venueSlug,
}: {
  venueName?: string | null;
  venueSlug?: string | null;
}) {
  const { t } = useLocale();
  // "Vezi profil" link target — defaults to the homepage when the venue
  // doesn't have a slug yet (mid-onboarding) so we never produce a broken
  // link.
  const profileHref = venueSlug ? `/sali/${venueSlug}` : "/";
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex h-14 items-center gap-2 px-5 border-b border-border/20">
          <Link href="/dashboard/sala" className="flex items-center gap-2">
            <span className="text-lg font-heading font-bold">
              <span className="text-gold">e</span>
              <span className="text-foreground">Sală</span>
            </span>
          </Link>
        </div>

        {venueName && (
          <div className="border-b border-border/20 px-5 py-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {t("vendor.venueSidebar.yourVenue")}
            </p>
            <p className="truncate text-sm font-medium text-foreground">
              {venueName}
            </p>
          </div>
        )}

        <NavList pathname={pathname} />

        <div className="border-t border-border/20 p-3">
          <Link
            href={profileHref}
            target="_blank"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-gold"
          >
            <Globe className="h-4 w-4 shrink-0" />
            <span>{t("dashboard.viewProfile")}</span>
          </Link>
        </div>
      </aside>

      {/* Mobile hamburger — sits in the top-left, only below `lg` */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label={t("header.openMenu")}
        className="fixed left-3 top-3 z-40 flex h-10 w-10 items-center justify-center rounded-lg border border-border/40 bg-background/90 backdrop-blur-sm text-foreground shadow-sm lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl animate-in slide-in-from-left">
            <div className="flex h-14 items-center justify-between px-5 border-b border-border/20">
              <Link
                href="/dashboard/sala"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2"
              >
                <span className="text-lg font-heading font-bold">
                  <span className="text-gold">e</span>
                  <span className="text-foreground">Sală</span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label={t("header.closeMenu")}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent/50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {venueName && (
              <div className="border-b border-border/20 px-5 py-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {t("vendor.venueSidebar.yourVenue")}
                </p>
                <p className="truncate text-sm font-medium text-foreground">
                  {venueName}
                </p>
              </div>
            )}

            <NavList
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />

            <div className="border-t border-border/20 p-3">
              <Link
                href={profileHref}
                target="_blank"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-gold"
              >
                <Globe className="h-4 w-4 shrink-0" />
                <span>{t("dashboard.viewProfile")}</span>
              </Link>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
