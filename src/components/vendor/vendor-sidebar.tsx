"use client";

import Link from "next/link";
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
  Package,
  Flame,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const artistNav = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Panoul Meu" },
  { href: "/dashboard/calendar", icon: CalendarDays, label: "Calendar" },
  { href: "/dashboard/rezervari", icon: BookOpen, label: "Rezervări" },
  { href: "/dashboard/lead-uri", icon: Flame, label: "Lead-uri noi" },
  { href: "/dashboard/profil", icon: User, label: "Profil" },
  { href: "/dashboard/pachete", icon: Package, label: "Pachete" },
  { href: "/dashboard/mesaje", icon: MessageSquare, label: "Mesaje" },
  { href: "/dashboard/financiar", icon: DollarSign, label: "Financiar" },
  { href: "/dashboard/recenzii", icon: Star, label: "Recenzii" },
  { href: "/dashboard/ai-assistant", icon: Bot, label: "AI Assistant" },
];

// M12 — Venue owner sidebar. Shown when /api/me/venue returns a venue.
// Reuses the same calendar / rezervari / mesaje / recenzii routes (they're
// entity-agnostic on the backend).
const venueNav = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Panoul Meu" },
  { href: "/dashboard/calendar", icon: CalendarDays, label: "Calendar" },
  { href: "/dashboard/rezervari", icon: BookOpen, label: "Rezervări" },
  { href: "/dashboard/venue-profil", icon: Building2, label: "Profil Sală" },
  { href: "/dashboard/mesaje", icon: MessageSquare, label: "Mesaje" },
  { href: "/dashboard/recenzii", icon: Star, label: "Recenzii" },
];

export function VendorSidebar() {
  const pathname = usePathname();
  const [isVenue, setIsVenue] = useState(false);

  // Lightweight client check — ask /api/me/venue once on mount. If the user
  // owns a venue we render the venue nav; otherwise we default to the artist
  // nav. This also handles users who own both (they can still reach venue
  // pages via direct link).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/venue")
      .then((r) => (r.ok ? r.json() : { venue: null }))
      .then((data) => {
        if (!cancelled) setIsVenue(!!data.venue);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const navItems = isVenue ? venueNav : artistNav;

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border/40 bg-sidebar">
      <div className="flex h-16 items-center border-b border-border/40 px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-gold" />
          <span className="font-heading text-lg font-bold">
            e<span className="text-gold">P</span>{" "}
            {isVenue ? "Sală" : "Artist"}
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-gold/10 text-gold"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )}
            >
              <item.icon className="h-5 w-5 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border/40 p-2">
        <Link
          href="/"
          target="_blank"
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-gold"
        >
          <Globe className="h-4 w-4 shrink-0" />
          <span>Vezi profilul meu</span>
        </Link>
      </div>
    </aside>
  );
}
