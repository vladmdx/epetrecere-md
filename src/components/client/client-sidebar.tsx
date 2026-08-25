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
  Calculator,
  Mail,
  CheckSquare,
  Camera,
  Plus,
  PartyPopper,
  Archive,
  ChevronDown,
  Menu,
  X,
  Heart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks/use-locale";
import { LanguageSwitcher } from "@/components/shared/language-switcher";

// Static nav items rendered above the dynamic "Evenimente" section.
const topNav = [
  { href: "/cabinet", icon: LayoutDashboard, labelKey: "dashboard.myPanel" },
  { href: "/cabinet/rezervari", icon: BookOpen, labelKey: "dashboard.myBookings" },
  { href: "/cabinet/favorite", icon: Heart, labelKey: "dashboard.favorites" },
  { href: "/cabinet/mesaje", icon: MessageSquare, labelKey: "dashboard.messages" },
  { href: "/cabinet/recenzii", icon: Star, labelKey: "dashboard.myReviews" },
  { href: "/cabinet/profil", icon: User, labelKey: "dashboard.myAccount" },
] as const;

// Tools section — actual instruments only. Confidențialitate + Setări are
// now accessed from /cabinet/profil (Contul Meu) instead of the sidebar.
// Budget instrument removed — see related round-2 changes that
// stripped the budget tab/wizard step. Per-category price filtering
// inside Rezervări Artiști replaces it.
const toolsNav = [
  { href: "/cabinet/checklist", icon: CheckSquare, labelKey: "tools.checklist" },
  { href: "/cabinet/invitatii", icon: Mail, labelKey: "tools.electronicInvites" },
  { href: "/cabinet/moments", icon: Camera, labelKey: "tools.moments" },
] as const;

// Calculatoare section — rendered as collapsible accordion under Instrumente.
// Each entry is a public /calculatoare/* page; the user lands directly there
// and the result is logged in their dashboard if they're signed in.
const calculatorsNav = [
  { href: "/calculatoare/buget", labelKey: "tools.budgetCalculator" },
  { href: "/calculatoare/invitati", labelKey: "tools.guestCalculator" },
  { href: "/calculatoare/dar-nunta", labelKey: "tools.giftCalculator" },
  { href: "/calculatoare/nunta", labelKey: "tools.weddingCalculator" },
  { href: "/calculatoare/alcool", labelKey: "tools.drinksCalculator" },
  { href: "/calculatoare/meniu", labelKey: "tools.menuCalculator" },
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
  const { t } = useLocale();
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

      <SectionHeader label={t("dashboard.myEvents")} />

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
          <span className="truncate">{t("dashboard.createEvent")}</span>
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

          {/* Arhivă (rendered before "Eveniment nou" per user request).
              Only surfaces when the client has at least one completed event. */}
          {archivedCount > 0 && (
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
              <span className="flex-1 truncate">{t("dashboard.eventArchive")}</span>
              <span className="text-[10px] tabular-nums text-muted-foreground/70">
                {archivedCount}
              </span>
            </Link>
          )}

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
            <span className="truncate">{t("dashboard.newEvent")}</span>
          </Link>
        </>
      )}

      {/* Standalone direct booking removed: every reservation must originate
          from a planned event so we can run conflict detection, group
          partners by event, and apply the per-week plan limit. The "Adaugă
          în eveniment" button on artist/venue profiles is the only entry
          point now. */}

      <SectionHeader label={t("dashboard.tools")} />

      {toolsNav.map((item) => (
        <NavLink
          key={item.href}
          item={item}
          pathname={pathname}
          onClick={onNavigate}
        />
      ))}

      {/* Calculatoare — collapsible group. Click chevron to expand and pick
          the right calculator. Each entry is a public /calculatoare/* page. */}
      <CalculatorsAccordion pathname={pathname} onNavigate={onNavigate} />
    </nav>
  );
}

export function ClientSidebar() {
  const { t } = useLocale();
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
        <div className="border-t border-border/30 px-3 py-2">
          <LanguageSwitcher />
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
                aria-label={t("header.closeMenu")}
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
            <div className="border-t border-border/30 px-3 py-2">
              <LanguageSwitcher />
            </div>
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

function CalculatorsAccordion({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  const { t } = useLocale();
  // Default expanded if user is currently inside any /calculatoare/* page.
  const onCalcRoute = pathname.startsWith("/calculatoare");
  const [open, setOpen] = useState(onCalcRoute);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
          onCalcRoute
            ? "bg-gold/10 text-gold font-medium"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
        )}
      >
        <Calculator className="h-4 w-4 shrink-0" />
        <span className="flex-1 text-left truncate">{t("tools.calculators")}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <div className="ml-6 mt-0.5 space-y-0.5 border-l border-border/30 pl-2">
          {calculatorsNav.map((c) => {
            const isActive = pathname === c.href;
            return (
              <Link
                key={c.href}
                href={c.href}
                onClick={onNavigate}
                className={cn(
                  "block rounded-lg px-3 py-1.5 text-xs transition-colors",
                  isActive
                    ? "bg-gold/10 text-gold font-medium"
                    : "text-muted-foreground/80 hover:bg-accent/50 hover:text-foreground",
                )}
              >
                {t(c.labelKey)}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NavLink({
  item,
  pathname,
  onClick,
}: {
  item: { href: string; icon: React.ComponentType<{ className?: string }>; labelKey: string };
  pathname: string;
  onClick?: () => void;
}) {
  const { t } = useLocale();
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
      <span className="truncate">{t(item.labelKey)}</span>
    </Link>
  );
}
