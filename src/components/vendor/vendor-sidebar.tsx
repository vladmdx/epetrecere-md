"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Panoul Meu" },
  { href: "/dashboard/calendar", icon: CalendarDays, label: "Calendar" },
  { href: "/dashboard/rezervari", icon: BookOpen, label: "Rezervări" },
  { href: "/dashboard/profil", icon: User, label: "Profil" },
  { href: "/dashboard/mesaje", icon: MessageSquare, label: "Mesaje" },
  { href: "/dashboard/financiar", icon: DollarSign, label: "Financiar" },
  { href: "/dashboard/recenzii", icon: Star, label: "Recenzii" },
  { href: "/dashboard/ai-assistant", icon: Bot, label: "AI Assistant" },
];

export function VendorSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-border/40 bg-sidebar">
      <div className="flex h-16 items-center border-b border-border/40 px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-gold" />
          <span className="font-heading text-lg font-bold">
            e<span className="text-gold">P</span> Artist
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
