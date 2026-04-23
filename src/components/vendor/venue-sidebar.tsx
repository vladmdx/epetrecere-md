"use client";

// Venue-only sidebar for /dashboard/sala/*.
// 11 items per the Venue Dashboard Spec (section 0).

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
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/dashboard/sala", icon: LayoutDashboard, label: "Panoul Meu" },
  { href: "/dashboard/sala/calendar", icon: Calendar, label: "Calendar" },
  { href: "/dashboard/sala/rezervari", icon: Inbox, label: "Rezervări" },
  { href: "/dashboard/sala/profil", icon: ImageIcon, label: "Profil & Galerie" },
  { href: "/dashboard/sala/meniu", icon: UtensilsCrossed, label: "Meniu Digital" },
  { href: "/dashboard/sala/mesaje", icon: MessageSquare, label: "Mesaje" },
  { href: "/dashboard/sala/recenzii", icon: Star, label: "Recenzii" },
  { href: "/dashboard/sala/financiar", icon: Wallet, label: "Financiar" },
  { href: "/dashboard/sala/analitice", icon: BarChart3, label: "Analytics" },
  { href: "/dashboard/sala/ai-assistant", icon: Bot, label: "AI Assistant" },
  { href: "/dashboard/sala/setari", icon: Settings, label: "Setări" },
] as const;

export function VenueSidebar({ venueName }: { venueName?: string | null }) {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-border/30 bg-[#0D0D0D]">
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
            Sala ta
          </p>
          <p className="truncate text-sm font-medium text-foreground">
            {venueName}
          </p>
        </div>
      )}

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
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-gold/10 text-gold font-medium"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border/20 p-3">
        <Link
          href="/"
          target="_blank"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-gold"
        >
          <Globe className="h-4 w-4 shrink-0" />
          <span>Vezi site</span>
        </Link>
      </div>
    </aside>
  );
}
