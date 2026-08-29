"use client";

import Link from "next/link";
import { BrandMark } from "@/components/public/brand-mark";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  BookOpen,
  User,
  MessageSquare,
  DollarSign,
  Star,
  Bot,
  Globe,
  Sparkles,
  Building2,
  BarChart3,
  Settings,
  Images,
  Clock,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks/use-locale";
import { LanguageSwitcher } from "@/components/shared/language-switcher";

const artistNav = [
  { href: "/dashboard", icon: LayoutDashboard, labelKey: "dashboard.myPanel" },
  { href: "/dashboard/calendar", icon: CalendarDays, labelKey: "dashboard.calendar" },
  { href: "/dashboard/rezervari", icon: BookOpen, labelKey: "dashboard.bookings" },
  { href: "/dashboard/tarife", icon: Clock, labelKey: "dashboard.rates" },
  { href: "/dashboard/profil", icon: User, labelKey: "dashboard.profile" },
  { href: "/dashboard/media", icon: Images, labelKey: "dashboard.media" },
  { href: "/dashboard/mesaje", icon: MessageSquare, labelKey: "dashboard.messages" },
  { href: "/dashboard/financiar", icon: DollarSign, labelKey: "dashboard.financial" },
  { href: "/dashboard/analytics", icon: BarChart3, labelKey: "dashboard.analytics" },
  { href: "/dashboard/recenzii", icon: Star, labelKey: "dashboard.reviews" },
  { href: "/dashboard/ai-assistant", icon: Bot, labelKey: "vendor.ai_assistant" },
  { href: "/dashboard/setari", icon: Settings, labelKey: "dashboard.settings" },
];

// M12 — Venue owner sidebar. Shown when /api/me/venue returns a venue.
// Reuses the same calendar / rezervari / mesaje / recenzii routes (they're
// entity-agnostic on the backend).
const venueNav = [
  { href: "/dashboard", icon: LayoutDashboard, labelKey: "dashboard.myPanel" },
  { href: "/dashboard/calendar", icon: CalendarDays, labelKey: "dashboard.calendar" },
  { href: "/dashboard/rezervari", icon: BookOpen, labelKey: "dashboard.bookings" },
  { href: "/dashboard/venue-profil", icon: Building2, labelKey: "dashboard.venueProfile" },
  { href: "/dashboard/mesaje", icon: MessageSquare, labelKey: "dashboard.messages" },
  { href: "/dashboard/analytics", icon: BarChart3, labelKey: "dashboard.analytics" },
  { href: "/dashboard/recenzii", icon: Star, labelKey: "dashboard.reviews" },
  { href: "/dashboard/setari", icon: Settings, labelKey: "dashboard.settings" },
];

function NavList({
  items,
  pathname,
  onNavigate,
}: {
  items: typeof artistNav;
  pathname: string;
  onNavigate?: () => void;
}) {
  const { t } = useLocale();
  return (
    <nav className="flex-1 overflow-y-auto p-2">
      {items.map((item) => {
        const isActive =
          item.href === "/dashboard"
            ? pathname === "/dashboard"
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-gold/10 text-gold"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
            )}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            <span>{t(item.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function VendorSidebar() {
  const { locale, t } = useLocale();
  const pathname = usePathname();
  const [isVenue, setIsVenue] = useState(false);
  const [profileSlug, setProfileSlug] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/artist")
      .then((r) => (r.ok ? r.json() : { artist: null }))
      .then((data) => {
        if (cancelled) return;
        if (data.artist) {
          setIsVenue(false);
          setProfileSlug(data.artist.slug ?? null);
          return;
        }
        return fetch("/api/me/venue")
          .then((r) => (r.ok ? r.json() : { venue: null }))
          .then((venueData) => {
            if (cancelled) return;
            setIsVenue(!!venueData.venue);
            setProfileSlug(venueData.venue?.slug ?? null);
          });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const navItems = isVenue ? venueNav : artistNav;
  const roleLabel = isVenue
    ? locale === "ru" ? "Зал" : locale === "en" ? "Venue" : "Sală"
    : locale === "ru" ? "Партнёр" : locale === "en" ? "Partner" : "Partener";
  // "Vezi profil" link target — falls back to homepage when slug isn't
  // resolved yet (mid-onboarding) so the link is never broken.
  const profileHref = profileSlug
    ? isVenue
      ? `/sali/${profileSlug}`
      : `/artisti/${profileSlug}`
    : "/";

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex h-screen w-64 flex-col border-r border-border/40 bg-sidebar">
        <div className="flex h-16 items-center border-b border-border/40 px-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <BrandMark className="h-6 w-6" />
            <span className="font-heading text-lg font-bold">
              e<span className="text-gold">P</span> {roleLabel}
            </span>
          </Link>
        </div>

        <NavList items={navItems} pathname={pathname} />

        <div className="border-t border-border/40 p-2">
          <LanguageSwitcher />
          <Link
            href={profileHref}
            target="_blank"
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-gold"
          >
            <Globe className="h-4 w-4 shrink-0" />
            <span>{t("dashboard.viewProfile")}</span>
          </Link>
        </div>
      </aside>

      {/* Mobile hamburger */}
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
          <aside className="relative flex h-full w-72 max-w-[85vw] flex-col border-r border-border/40 bg-sidebar shadow-2xl animate-in slide-in-from-left">
            <div className="flex h-16 items-center justify-between border-b border-border/40 px-4">
              <Link
                href="/dashboard"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2"
              >
                <BrandMark className="h-6 w-6" />
                <span className="font-heading text-lg font-bold">
                  e<span className="text-gold">P</span> {roleLabel}
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
            <NavList
              items={navItems}
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
            <div className="border-t border-border/40 p-2">
              <LanguageSwitcher />
              <Link
                href={profileHref}
                target="_blank"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-gold"
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
