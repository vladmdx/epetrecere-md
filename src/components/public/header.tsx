"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Sparkles, ChevronDown, User, LogIn, LayoutDashboard, Shield, UserCircle, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { SearchAutocomplete } from "@/components/public/search-autocomplete";
import { useLocale } from "@/hooks/use-locale";
import { cn } from "@/lib/utils";
import { useUser, useClerk } from "@clerk/nextjs";

const artistCategories = [
  { slug: "moderatori", label: "Moderatori" },
  { slug: "dj", label: "DJ" },
  { slug: "cantareti-de-estrada", label: "Cântăreți de Estradă" },
  { slug: "interpreti-muzica-populara", label: "Interpreți Muzică Populară" },
  { slug: "cover-band", label: "Cover Band" },
  { slug: "formatii", label: "Formații" },
  { slug: "instrumentalisti", label: "Instrumentaliști" },
  { slug: "cvartet", label: "Cvartet" },
  { slug: "dansatori", label: "Dansatori" },
  { slug: "dansuri-populare", label: "Dansuri Populare" },
  { slug: "ansamblu-tiganesc", label: "Ansamblu Țigănesc" },
  { slug: "show-program", label: "Show Program" },
  { slug: "animatori", label: "Animatori" },
  { slug: "stand-up", label: "Stand Up" },
];

const serviceCategories = [
  { slug: "echipament-tehnic", label: "Echipament Tehnic" },
  { slug: "foto-video", label: "Foto & Video" },
  { slug: "foto-zona-selfie", label: "Foto Zonă / Selfie" },
];

function DropdownMenu({ label, items, href }: { label: string; items: { slug: string; label: string }[]; href: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <Link
        href={href}
        className="flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-gold"
      >
        {label}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </Link>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full z-50 mt-2 w-56 rounded-xl border border-border/40 bg-popover p-2 shadow-lg"
          >
            {items.map((item) => (
              <Link
                key={item.slug}
                href={`/categorie/${item.slug}`}
                className="block rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-gold"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
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

  if (!isSignedIn) {
    return (
      <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
        <Link href="/sign-in">
          <Button variant="ghost" size="icon">
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
              <Link href="/cabinet" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-gold" onClick={() => setOpen(false)}>
                <LayoutDashboard className="h-4 w-4" /> Cabinet Client
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <Button variant="ghost" size="icon" className="relative">
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
            <Link href="/cabinet" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-gold" onClick={() => setOpen(false)}>
              <UserCircle className="h-4 w-4" /> Cabinetul Meu
            </Link>
            <Link href="/dashboard" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-gold" onClick={() => setOpen(false)}>
              <LayoutDashboard className="h-4 w-4" /> Dashboard Artist
            </Link>
            <Link href="/admin" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-gold" onClick={() => setOpen(false)}>
              <Shield className="h-4 w-4" /> Admin Panel
            </Link>
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

  return (
    <header className={`fixed top-0 z-50 w-full transition-all duration-300 ${scrolled ? "bg-[#0D0D0D]/90 backdrop-blur-md border-b border-gold/10 shadow-lg" : "bg-transparent border-b border-transparent"}`}>
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <Sparkles className="h-6 w-6 text-gold" />
          <span className="font-heading text-xl font-bold tracking-tight">
            e<span className="text-gold">Petrecere</span>.md
          </span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden items-center gap-5 xl:flex">
          <DropdownMenu label={t("nav.artists")} items={artistCategories} href="/artisti" />
          <Link href="/sali" className="text-sm font-medium text-muted-foreground transition-colors hover:text-gold">
            {t("nav.venues")}
          </Link>
          <DropdownMenu label={t("nav.services")} items={serviceCategories} href="/servicii" />
          <Link href="/blog" className="text-sm font-medium text-muted-foreground transition-colors hover:text-gold">
            {t("nav.blog")}
          </Link>
          <Link href="/contact" className="text-sm font-medium text-muted-foreground transition-colors hover:text-gold">
            {t("nav.contact")}
          </Link>
        </nav>

        {/* Right Actions */}
        <div className="flex items-center gap-2">
          <div className="hidden lg:block">
            <SearchAutocomplete />
          </div>
          <UserMenu />
          <LanguageSwitcher />
          <ThemeToggle />
          <Link href="/planifica" className="hidden lg:block">
            <Button className="bg-gold text-background hover:bg-gold-dark font-medium">
              {t("nav.planner")}
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="xl:hidden"
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
              {artistCategories.slice(0, 8).map((cat) => (
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
              <Link href="/blog" onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-gold">{t("nav.blog")}</Link>
              <Link href="/contact" onClick={() => setMobileOpen(false)} className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-gold">{t("nav.contact")}</Link>
              <Link href="/planifica" onClick={() => setMobileOpen(false)}>
                <Button className="mt-2 w-full bg-gold text-background hover:bg-gold-dark">{t("nav.planner")}</Button>
              </Link>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
