"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, User, LogIn, LayoutDashboard, Shield, UserCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { SearchAutocomplete } from "@/components/public/search-autocomplete";
import { NotificationBell } from "@/components/public/notification-bell";
import { ChatBell } from "@/components/public/chat-bell";
import { useLocale } from "@/hooks/use-locale";
import { useUserRole, isClientOrGuest } from "@/hooks/use-user-role";
import { useUser, useClerk } from "@clerk/nextjs";
import { BrandMark } from "@/components/public/brand-mark";

// Fallback list rendered on first paint before /api/categories resolves —
// covers the most-clicked items so the menu is never empty. The full list is
// fetched on mount and replaces this.
const FALLBACK_ARTIST_CATEGORIES = [
  { slug: "moderatori", label: "Moderatori" },
  { slug: "dj", label: "DJ" },
  { slug: "cantareti", label: "Cântăreți" },
  { slug: "cantareti-de-estrada", label: "Cântăreți de Estradă" },
  { slug: "interpreti-muzica-populara", label: "Interpreți Muzică Populară" },
  { slug: "cover-band", label: "Cover Band" },
  { slug: "formatii", label: "Formații" },
  { slug: "instrumentalisti", label: "Instrumentaliști" },
  { slug: "cvartet", label: "Cvartet" },
  { slug: "dansatori", label: "Dansatori" },
  { slug: "dansuri-populare", label: "Dansuri Populare" },
  { slug: "ansamblu-tiganesc", label: "Ansamblu Țigănesc" },
  { slug: "dans-oriental", label: "Dans Oriental" },
  { slug: "striptiz", label: "Striptiz" },
  { slug: "show-program", label: "Show Program" },
  { slug: "iluzionisti-magicieni", label: "Iluzioniști / Magicieni" },
  { slug: "animatori", label: "Animatori" },
  { slug: "show-ul-focului", label: "Show-ul Focului" },
  { slug: "clovni", label: "Clovni" },
  { slug: "interesant-la-sarbatoare", label: "Interesant la Sărbătoare" },
  { slug: "show-circus", label: "Show Circus" },
  { slug: "stand-up", label: "Stand Up" },
  { slug: "mos-craciun", label: "Moș Crăciun" },
];

const FALLBACK_SERVICE_CATEGORIES = [
  { slug: "fotografi", label: "Fotografi" },
  { slug: "videografi", label: "Videografi" },
  { slug: "decor", label: "Decor & Floristică" },
  { slug: "echipament-tehnic", label: "Echipament Tehnic" },
  { slug: "foto-video", label: "Foto & Video" },
  { slug: "foto-zona-selfie", label: "Foto Zonă / Selfie" },
];

function useCategories() {
  const [artist, setArtist] = useState(FALLBACK_ARTIST_CATEGORIES);
  const [service, setService] = useState(FALLBACK_SERVICE_CATEGORIES);
  useEffect(() => {
    let alive = true;
    fetch("/api/categories")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: unknown) => {
        if (!alive) return;
        const list = Array.isArray(rows)
          ? (rows as Array<{ slug: string; nameRo: string; type: string; sortOrder?: number | null }>)
          : [];
        const sortFn = (a: { sortOrder?: number | null }, b: { sortOrder?: number | null }) =>
          (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        const artists = list
          .filter((c) => c.type === "artist")
          .sort(sortFn)
          .map((c) => ({ slug: c.slug, label: c.nameRo }));
        const services = list
          .filter((c) => c.type === "service")
          .sort(sortFn)
          .map((c) => ({ slug: c.slug, label: c.nameRo }));
        if (artists.length > 0) setArtist(artists);
        if (services.length > 0) setService(services);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return { artist, service };
}

// "Utilități" tools — still surfaced in the mobile menu (the desktop nav was
// simplified to plain links in the redesign). Each links to a public landing
// page (/utilitati/[slug]) optimized for SEO.
const UTILITATI_TOOLS = [
  { slug: "checklist", label: "Checklist Eveniment", emoji: "✅" },
  { slug: "budget", label: "Budget & Cheltuieli", emoji: "💰" },
  { slug: "invitatii-electronice", label: "Invitații Electronice", emoji: "✉️" },
  { slug: "lista-invitati", label: "Listă Invitați & Așezare Mese", emoji: "👥" },
  { slug: "momente-eveniment", label: "Momente Eveniment", emoji: "📸" },
];

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
  // Live category lists from /api/categories — falls back to a hardcoded
  // list on first paint so the menu is never empty.
  const { artist: artistCategories, service: serviceCategories } = useCategories();

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

        {/* Desktop Nav — plain links matching the redesign */}
        <nav className="hidden items-center gap-7 xl:flex">
          <Link href="/sali" className="text-sm font-medium text-white/85 transition-colors hover:text-gold whitespace-nowrap">
            {t("nav.locations")}
          </Link>
          <Link href="/artisti" className="text-sm font-medium text-white/85 transition-colors hover:text-gold whitespace-nowrap">
            {t("nav.artists")}
          </Link>
          <Link href="/servicii" className="text-sm font-medium text-white/85 transition-colors hover:text-gold whitespace-nowrap">
            {t("nav.services")}
          </Link>
          <Link href="/planifica" className="text-sm font-medium text-white/85 transition-colors hover:text-gold whitespace-nowrap">
            {t("nav.event_types")}
          </Link>
          <Link href="/#cum-functioneaza" className="text-sm font-medium text-white/85 transition-colors hover:text-gold whitespace-nowrap">
            {t("nav.how_it_works")}
          </Link>
        </nav>

        {/* Right Actions — always on dark header bg, so force light icon/text in both themes */}
        <div className="flex items-center gap-2 text-white/90">
          {/* Bells self-gate to signed-in users, so the signed-out marketing
              header stays clean (matches the design). */}
          <ChatBell />
          <NotificationBell />
          <LanguageSwitcher />
          <UserMenu />
          {showPlannerCta && (
            <Link href="/planifica" className="hidden lg:block">
              <Button className="bg-gold text-[#0D0D0D] hover:bg-gold-dark font-medium">
                {t("nav.planner")}
              </Button>
            </Link>
          )}
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
            className="border-t border-border/40 bg-background xl:hidden"
          >
            <nav className="flex flex-col gap-1 px-4 py-4">
              <div className="mb-3 lg:hidden"><SearchAutocomplete /></div>
              <p className="px-3 py-1 text-xs font-medium uppercase tracking-wider text-gold">Artiști</p>
              {artistCategories.map((cat) => (
                <Link key={cat.slug} href={`/categorie/${cat.slug}`} onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-gold">
                  {cat.label}
                </Link>
              ))}
              <Link href="/artisti" onClick={() => setMobileOpen(false)}
                className="rounded-lg px-3 py-2 text-sm font-medium text-gold">
                Vezi toți artiștii →
              </Link>
              <div className="my-2 border-t border-border/40" />
              <p className="px-3 py-1 text-xs font-medium uppercase tracking-wider text-gold">Servicii</p>
              {serviceCategories.map((cat) => (
                <Link key={cat.slug} href={`/categorie/${cat.slug}`} onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-gold">
                  {cat.label}
                </Link>
              ))}
              <div className="my-2 border-t border-border/40" />
              <Link href="/sali" onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-gold">{t("nav.venues")}</Link>
              <p className="px-3 py-1 mt-2 text-xs font-medium uppercase tracking-wider text-gold">Utilități</p>
              {UTILITATI_TOOLS.map((tool) => (
                <Link key={tool.slug} href={`/utilitati/${tool.slug}`} onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-gold">
                  {tool.emoji} {tool.label}
                </Link>
              ))}
              <Link href="/calculatoare" onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-gold hover:bg-gold/10">
                🧮 Calculatoare (toate)
              </Link>
              <Link href="/blog" onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-gold">{t("nav.blog")}</Link>
              <Link href="/contact" onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-gold">{t("nav.contact")}</Link>
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
