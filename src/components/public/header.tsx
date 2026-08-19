"use client";

import Link from "@/components/shared/locale-link";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  CalendarPlus,
  Gift,
  Heart,
  ChevronDown,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Shield,
  User,
  UserCircle,
  UsersRound,
  UtensilsCrossed,
  WalletCards,
  Wine,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { SearchAutocomplete } from "@/components/public/search-autocomplete";
import { NotificationBell } from "@/components/public/notification-bell";
import { ChatBell } from "@/components/public/chat-bell";
import { useLocale } from "@/hooks/use-locale";
import { useUserRole, isClientOrGuest } from "@/hooks/use-user-role";
import { useUser, useClerk } from "@clerk/nextjs";
import { BrandMark } from "@/components/public/brand-mark";

const UTILITATI_TOOLS = [
  { slug: "checklist", key: "tools.checklist", emoji: "✅" },
  { slug: "budget", key: "tools.budget", emoji: "💰" },
  { slug: "invitatii-electronice", key: "tools.electronicInvites", emoji: "✉️" },
  { slug: "lista-invitati", key: "tools.guestList", emoji: "👥" },
  { slug: "momente-eveniment", key: "tools.moments", emoji: "📸" },
];

const CALCULATOR_TOOLS = [
  { slug: "dar-nunta", key: "tools.giftCalculator", icon: Gift },
  { slug: "nunta", key: "tools.weddingCalculator", icon: Heart },
  { slug: "buget", key: "tools.budgetCalculator", icon: WalletCards },
  { slug: "invitati", key: "tools.guestCalculator", icon: UsersRound },
  { slug: "alcool", key: "tools.drinksCalculator", icon: Wine },
  { slug: "meniu", key: "tools.menuCalculator", icon: UtensilsCrossed },
];

function UtilitiesMenu({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const { t } = useLocale();

  function closeMenu() {
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center gap-1 text-sm font-medium text-white/85 transition-colors hover:text-gold"
      >
        {label}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="absolute left-1/2 top-full z-50 w-[680px] -translate-x-1/2 pt-4"
          >
            <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-[#0b0e14]/98 p-4 shadow-[0_24px_70px_rgba(0,0,0,.55)] backdrop-blur-xl">
              <div className="rounded-xl bg-white/[.025] p-2">
                <div className="mb-2 flex items-center justify-between px-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-gold">
                    {t("tools.organization")}
                  </p>
                  <Link
                    href="/utilitati"
                    onClick={closeMenu}
                    className="text-[10px] text-white/45 hover:text-gold"
                  >
                    {t("tools.all")}
                  </Link>
                </div>
                {UTILITATI_TOOLS.map((tool) => (
                  <Link
                    key={tool.slug}
                    href={`/utilitati/${tool.slug}`}
                    onClick={closeMenu}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 text-xs text-white/72 transition hover:bg-white/[.055] hover:text-gold"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/9 text-base">
                      {tool.emoji}
                    </span>
                    {t(tool.key)}
                  </Link>
                ))}
              </div>

              <div className="rounded-xl bg-white/[.025] p-2">
                <div className="mb-2 flex items-center justify-between px-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[.2em] text-gold">
                    {t("tools.calculators")}
                  </p>
                  <Link
                    href="/calculatoare"
                    onClick={closeMenu}
                    className="text-[10px] text-white/45 hover:text-gold"
                  >
                    {t("tools.all")}
                  </Link>
                </div>
                {CALCULATOR_TOOLS.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <Link
                      key={tool.slug}
                      href={`/calculatoare/${tool.slug}`}
                      onClick={closeMenu}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 text-xs text-white/72 transition hover:bg-white/[.055] hover:text-gold"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/9 text-gold">
                        <Icon className="h-4 w-4" aria-hidden />
                      </span>
                      {t(tool.key)}
                    </Link>
                  );
                })}
                <Link
                  href="/utilitati"
                  onClick={closeMenu}
                  className="mt-2 flex items-center justify-between rounded-lg border border-gold/20 bg-gold/[.06] px-3 py-2.5 text-xs font-semibold text-gold hover:bg-gold/10"
                >
                  {t("tools.viewAll")}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserMenu() {
  const { isSignedIn, user } = useUser();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const { userRole } = useUserRole();

  if (!isSignedIn) {
    return (
      <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
        <Link href="/sign-in">
          <Button variant="ghost" size="icon" aria-label="Autentificare">
            <User className="h-5 w-5" />
          </Button>
        </Link>
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
              className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-border/40 bg-popover p-2 shadow-lg"
            >
              <Link href="/sign-in" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-gold" onClick={() => setOpen(false)}>
                <LogIn className="h-4 w-4" /> Autentificare
              </Link>
              <Link href="/sign-up" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-gold" onClick={() => setOpen(false)}>
                <UserCircle className="h-4 w-4" /> Înregistrare
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <Button variant="ghost" size="icon" aria-label="Contul meu" className="relative">
        {user?.imageUrl ? (
          <img src={user.imageUrl} alt="" className="h-7 w-7 rounded-full" />
        ) : (
          <User className="h-5 w-5 text-gold" />
        )}
      </Button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
            className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-border/40 bg-popover p-2 shadow-lg"
          >
            <div className="border-b border-border/40 px-3 py-2 mb-1">
              <p className="text-sm font-medium truncate">{user?.fullName || user?.primaryEmailAddress?.emailAddress}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.primaryEmailAddress?.emailAddress}</p>
            </div>
            {userRole && (userRole.role === "artist" || userRole.hasVenue) ? (
              <Link href="/dashboard" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-gold" onClick={() => setOpen(false)}>
                <LayoutDashboard className="h-4 w-4" /> {userRole.hasVenue ? "Dashboard Sală" : "Dashboard Partener"}
              </Link>
            ) : (
              <Link href="/cabinet" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-gold" onClick={() => setOpen(false)}>
                <UserCircle className="h-4 w-4" /> Cabinetul Meu
              </Link>
            )}
            {userRole && (userRole.role === "admin" || userRole.role === "super_admin") && (
              <Link href="/admin" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-gold" onClick={() => setOpen(false)}>
                <Shield className="h-4 w-4" /> Admin Panel
              </Link>
            )}
            <div className="border-t border-border/40 mt-1 pt-1">
              <button onClick={() => { signOut(); setOpen(false); }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-accent">
                <LogOut className="h-4 w-4" /> Deconectare
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Header() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => { const h = () => setScrolled(window.scrollY > 50); window.addEventListener("scroll", h); return () => window.removeEventListener("scroll", h); }, []);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { t } = useLocale();
  const { userRole } = useUserRole();
  // Hide the "Plan event" CTA for vendors and admins — it's a client-
  // facing action. Guests + clients still see it.
  const showPlannerCta = isClientOrGuest(userRole);
  return (
    <header className={`fixed top-0 z-50 w-full transition-all duration-300 backdrop-blur-md ${scrolled ? "bg-[#0D0D0D]/90 border-b border-gold/10 shadow-lg" : "bg-[#0D0D0D]/40 border-b border-transparent"}`}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex shrink-0 items-center gap-2 text-white">
          <BrandMark className="text-[#e8bd59]" />
          <span className="font-heading text-xl font-bold tracking-tight">
            e<span className="text-gold">Petrecere</span>.md
          </span>
        </Link>

        {/* Desktop navigation */}
        <nav className="hidden items-center gap-5 xl:flex">
          <Link href="/sali" className="text-sm font-medium text-white/85 transition-colors hover:text-gold whitespace-nowrap">
            {t("nav.locations")}
          </Link>
          <Link href="/artisti" className="text-sm font-medium text-white/85 transition-colors hover:text-gold whitespace-nowrap">
            {t("nav.artists")}
          </Link>
          <Link href="/servicii" className="text-sm font-medium text-white/85 transition-colors hover:text-gold whitespace-nowrap">
            {t("nav.services")}
          </Link>
          <UtilitiesMenu label={t("nav.utilities")} />
          <Link href="/blog" className="text-sm font-medium text-white/85 transition-colors hover:text-gold whitespace-nowrap">
            {t("nav.blog")}
          </Link>
          <Link href="/cum-functioneaza" className="text-sm font-medium text-white/85 transition-colors hover:text-gold whitespace-nowrap">
            {t("nav.how_it_works")}
          </Link>
        </nav>

        {/* Right Actions — always on dark header bg, so force light icon/text in both themes */}
        <div className="flex items-center gap-2 text-white/90">
          {showPlannerCta && (
            <Link href="/planifica" aria-label={t("nav.planner")} title={t("nav.planner")}>
              <Button className="h-9 min-w-9 rounded-full bg-gold px-2 text-[#0D0D0D] shadow-[0_4px_18px_rgba(201,168,76,.22)] hover:bg-gold-dark sm:rounded-lg sm:px-4">
                <CalendarPlus className="h-4 w-4 sm:mr-2" aria-hidden />
                <span className="hidden whitespace-nowrap text-sm font-semibold sm:inline">
                  {t("nav.planner")}
                </span>
              </Button>
            </Link>
          )}
          {/* Bells self-gate to signed-in users, so the signed-out marketing
              header stays clean (matches the design). */}
          <ChatBell />
          <NotificationBell />
          <LanguageSwitcher />
          <UserMenu />
          <Button
            variant="ghost"
            size="icon"
            aria-label={mobileOpen ? "Închide meniul" : "Deschide meniul"}
            aria-expanded={mobileOpen}
            className="text-white/90 hover:bg-white/10 hover:text-white xl:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Nav */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="max-h-[calc(100vh-4rem)] overflow-y-auto border-t border-white/10 bg-[#090c12]/98 xl:hidden"
          >
            <nav className="flex flex-col gap-1 px-4 py-4">
              <div className="mb-3 lg:hidden"><SearchAutocomplete /></div>
              <Link href="/sali" onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-2 text-sm text-white/76 hover:bg-white/[.05] hover:text-gold">{t("nav.locations")}</Link>
              <Link href="/artisti" onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-2 text-sm text-white/76 hover:bg-white/[.05] hover:text-gold">{t("nav.artists")}</Link>
              <Link href="/servicii" onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-2 text-sm text-white/76 hover:bg-white/[.05] hover:text-gold">{t("nav.services")}</Link>
              <Link href="/blog" onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-2 text-sm text-white/76 hover:bg-white/[.05] hover:text-gold">{t("nav.blog")}</Link>
              <Link href="/cum-functioneaza" onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-2 text-sm text-white/76 hover:bg-white/[.05] hover:text-gold">{t("nav.how_it_works")}</Link>

              <div className="my-2 border-t border-white/10" />
              <p className="px-3 py-1 text-xs font-medium uppercase tracking-wider text-gold">{t("nav.utilities")}</p>
              {UTILITATI_TOOLS.map((tool) => (
                <Link key={tool.slug} href={`/utilitati/${tool.slug}`} onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm text-white/66 hover:bg-white/[.05] hover:text-gold">
                  {tool.emoji} {t(tool.key)}
                </Link>
              ))}
              {CALCULATOR_TOOLS.map((tool) => {
                const Icon = tool.icon;
                return (
                  <Link key={tool.slug} href={`/calculatoare/${tool.slug}`} onClick={() => setMobileOpen(false)}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/66 hover:bg-white/[.05] hover:text-gold">
                    <Icon className="h-4 w-4 text-gold" aria-hidden />
                    {t(tool.key)}
                  </Link>
                );
              })}
              <Link href="/utilitati" onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-gold hover:bg-gold/10">
                {t("tools.viewAll")} →
              </Link>
              {showPlannerCta && (
                <Link href="/planifica" onClick={() => setMobileOpen(false)}>
                  <Button className="mt-2 w-full bg-gold text-[#0D0D0D] hover:bg-gold-dark">{t("nav.planner")}</Button>
                </Link>
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
