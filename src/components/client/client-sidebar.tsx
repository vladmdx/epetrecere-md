"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  MessageSquare,
  Star,
  User,
  ClipboardList,
  Calculator,
  Mail,
  Wallet,
  CheckSquare,
  Shield,
  Camera,
  Plus,
  PartyPopper,
  Archive,
  ChevronRight,
  Settings,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Static nav items rendered above the dynamic "Evenimente" section.
const topNav = [
  { href: "/cabinet", icon: LayoutDashboard, label: "Panoul Meu" },
  { href: "/cabinet/rezervari", icon: BookOpen, label: "Rezervările Mele" },
  { href: "/cabinet/mesaje", icon: MessageSquare, label: "Mesaje" },
  { href: "/cabinet/recenzii", icon: Star, label: "Recenziile Mele" },
  { href: "/cabinet/profil", icon: User, label: "Contul Meu" },
] as const;

// Tools section — rendered under the dynamic events block.
const toolsNav = [
  { href: "/cabinet/checklist", icon: CheckSquare, label: "Checklist" },
  { href: "/cabinet/buget", icon: Wallet, label: "Budget & Cheltuieli" },
  { href: "/cabinet/invitatii", icon: Mail, label: "Invitații Electronice" },
  { href: "/cabinet/calculator-dar", icon: Calculator, label: "Calculator Dar" },
  { href: "/cabinet/moments", icon: Camera, label: "Momente Eveniment" },
  { href: "/cabinet/date", icon: Shield, label: "Confidențialitate" },
  { href: "/cabinet/setari", icon: Settings, label: "Setări" },
] as const;

interface PlanSummary {
  id: number;
  title: string;
  eventDate: string | null;
  status: "active" | "completed" | "cancelled";
}

function NavBody({
  pathname,
  activePlans,
  archivedCount,
  onNavigate,
}: {
  pathname: string;
  activePlans: PlanSummary[];
  archivedCount: number;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
      {topNav.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          pathname={pathname}
          onClick={onNavigate}
        />
      ))}

      <SectionHeader label="Evenimentele Mele" />

      {activePlans.length === 0 ? (
        <Link
          href="/cabinet/planifica"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
            pathname === "/cabinet/planifica"
              ? "bg-gold/10 text-gold font-medium"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          )}
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span className="truncate">Creează eveniment</span>
        </Link>
      ) : (
        <>
          {activePlans.map((plan) => {
            const href = `/cabinet/planifica/${plan.id}`;
            const isActive = pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={plan.id}
                href={href}
                onClick={onNavigate}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
                  isActive
                    ? "bg-gold/10 text-gold font-medium"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <PartyPopper className="h-4 w-4 shrink-0" />
                <span className="truncate">{plan.title}</span>
              </Link>
            );
          })}
          <Link
            href="/cabinet/planifica"
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
              pathname === "/cabinet/planifica"
                ? "bg-gold/10 text-gold font-medium"
                : "text-muted-foreground/70 hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span className="truncate">Plan nou</span>
          </Link>
        </>
      )}

      <SectionHeader label="Instrumente" />

      {toolsNav.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          pathname={pathname}
          onClick={onNavigate}
        />
      ))}

      {archivedCount > 0 && (
        <>
          <div className="pt-4 pb-1 px-2" />
          <Link
            href="/cabinet/arhiva"
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
              pathname.startsWith("/cabinet/arhiva")
                ? "bg-gold/10 text-gold font-medium"
                : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <Archive className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">Arhivă Evenimente</span>
            <span className="text-[10px] tabular-nums text-muted-foreground/70">
              {archivedCount}
            </span>
            <ChevronRight className="h-3 w-3 opacity-40" />
          </Link>
        </>
      )}
    </nav>
  );
}

export function ClientSidebar() {
  const pathname = usePathname();
  const [activePlans, setActivePlans] = useState<PlanSummary[]>([]);
  const [archivedCount, setArchivedCount] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/event-plans?status=active", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { plans: [] }))
        .catch(() => ({ plans: [] })),
      fetch("/api/event-plans?status=completed", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : { plans: [] }))
        .catch(() => ({ plans: [] })),
    ]).then(([active, archived]) => {
      setActivePlans(active.plans ?? []);
      setArchivedCount((archived.plans ?? []).length);
    });
  }, [pathname]);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex h-14 items-center gap-2 px-5 border-b border-border/20">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-lg font-heading font-bold">
              <span className="text-gold">e</span>
              <span className="text-foreground">Cabinet</span>
            </span>
          </Link>
        </div>
        <NavBody
          pathname={pathname}
          activePlans={activePlans}
          archivedCount={archivedCount}
        />
      </aside>

      {/* Mobile hamburger */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Deschide meniul"
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
                href="/"
                onClick={() => setMobileOpen(false)}
                className="flex items-center gap-2"
              >
                <span className="text-lg font-heading font-bold">
                  <span className="text-gold">e</span>
                  <span className="text-foreground">Cabinet</span>
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Închide meniul"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent/50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <NavBody
              pathname={pathname}
              activePlans={activePlans}
              archivedCount={archivedCount}
              onNavigate={() => setMobileOpen(false)}
            />
          </aside>
        </div>
      )}
    </>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="pt-4 pb-1 px-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        {label}
      </p>
    </div>
  );
}

function NavLink({
  item,
  pathname,
  onClick,
}: {
  item: { href: string; icon: React.ComponentType<{ className?: string }>; label: string };
  pathname: string;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  const isActive =
    pathname === item.href ||
    (item.href !== "/cabinet" && pathname.startsWith(item.href));
  return (
    <Link
      href={item.href}
      onClick={onClick}
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
}
