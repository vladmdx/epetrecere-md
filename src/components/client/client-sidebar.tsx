"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  MessageSquare,
  Star,
  User,
  CalendarHeart,
  ClipboardList,
  Calculator,
  Mail,
  Armchair,
  Wallet,
  CheckSquare,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const clientNav = [
  { href: "/cabinet", icon: LayoutDashboard, label: "Panoul Meu" },
  { href: "/cabinet/rezervari", icon: BookOpen, label: "Rezervările Mele" },
  { href: "/cabinet/mesaje", icon: MessageSquare, label: "Mesaje" },
  { href: "/cabinet/recenzii", icon: Star, label: "Recenziile Mele" },
  { href: "/cabinet/profil", icon: User, label: "Contul Meu" },
  { type: "divider" as const, label: "Planificare Eveniment" },
  { href: "/cabinet/planifica", icon: ClipboardList, label: "Planificator" },
  { href: "/cabinet/checklist", icon: CheckSquare, label: "Checklist" },
  { href: "/cabinet/buget", icon: Wallet, label: "Budget & Cheltuieli" },
  { href: "/cabinet/invitatii", icon: Mail, label: "Invitații Electronice" },
  { href: "/cabinet/moments/1", icon: CalendarHeart, label: "Momente Eveniment" },
  { href: "/cabinet/date", icon: Calculator, label: "Calculator Dar" },
  { href: "/cabinet/furnizori", icon: Armchair, label: "Furnizori" },
] as const;

export function ClientSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r border-border/30 bg-[#0D0D0D]">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 px-5 border-b border-border/20">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-lg font-heading font-bold">
            <span className="text-gold">e</span>
            <span className="text-foreground">Cabinet</span>
          </span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {clientNav.map((item, i) => {
          if ("type" in item && item.type === "divider") {
            return (
              <div key={i} className="pt-4 pb-1 px-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {item.label}
                </p>
              </div>
            );
          }
          if (!("href" in item)) return null;
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/cabinet" && pathname.startsWith(item.href));
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
    </aside>
  );
}
