"use client";

import Link from "next/link";
import { Send, Globe, Camera, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/hooks/use-locale";
import { BrandMark } from "@/components/public/brand-mark";

const COLUMNS: { title: string; links: { key: string; href: string }[] }[] = [
  {
    title: "footer.colClients",
    links: [
      { key: "footer.searchVenues", href: "/sali" },
      { key: "footer.searchArtists", href: "/artisti" },
      { key: "footer.searchServices", href: "/servicii" },
      { key: "footer.eventTypes", href: "/planifica" },
      { key: "footer.blogTips", href: "/blog" },
    ],
  },
  {
    title: "footer.colVendors",
    links: [
      { key: "footer.register", href: "/sign-up" },
      { key: "footer.howItWorks", href: "/#cum-functioneaza" },
      { key: "footer.subscription", href: "/pachete" },
      { key: "footer.resources", href: "/blog" },
      { key: "footer.promote", href: "/contact" },
    ],
  },
  {
    title: "footer.colCompany",
    links: [
      { key: "footer.about", href: "/despre" },
      { key: "nav.contact", href: "/contact" },
      { key: "footer.terms", href: "/termeni" },
      { key: "footer.privacy", href: "/confidentialitate" },
      { key: "footer.faq", href: "/contact" },
    ],
  },
];

const SOCIALS = [
  { icon: Globe, href: "#", label: "Facebook" },
  { icon: Camera, href: "#", label: "Instagram" },
  { icon: Music2, href: "#", label: "TikTok" },
  { icon: Send, href: "#", label: "Telegram" },
];

export function Footer() {
  const { t } = useLocale();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-gold/10 bg-[#0A0A0A]">
      <div className="mx-auto max-w-7xl px-4 py-14 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          {/* Brand */}
          <div className="space-y-4 lg:col-span-1">
            <Link href="/" className="flex items-center gap-2 text-white">
              <BrandMark className="text-[#e8bd59]" />
              <span className="font-heading text-xl font-bold">
                e<span className="text-gold">Petrecere</span>.md
              </span>
            </Link>
            <p className="text-sm leading-relaxed text-[#9A9AAB]">
              {t("footer.tagline")}
            </p>
            <div className="flex gap-3">
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-[#9A9AAB] transition-colors hover:border-gold/40 hover:text-gold"
                >
                  <s.icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-gold">
                {t(col.title)}
              </h3>
              <ul className="space-y-2.5 text-sm">
                {col.links.map((l) => (
                  <li key={l.key}>
                    <Link href={l.href} className="text-[#9A9AAB] transition-colors hover:text-gold">
                      {t(l.key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Newsletter */}
          <div>
            <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-gold">
              {t("footer.colNewsletter")}
            </h3>
            <p className="mb-3 text-sm leading-relaxed text-[#9A9AAB]">
              {t("footer.newsletterDesc")}
            </p>
            <form className="flex gap-2" onSubmit={(e) => e.preventDefault()}>
              <Input
                type="email"
                placeholder={t("footer.emailPlaceholder")}
                className="flex-1 border-white/10 bg-white/[0.04] text-white placeholder:text-white/40"
                aria-label={t("footer.emailPlaceholder")}
              />
              <Button className="shrink-0 bg-gold text-[#0D0D0D] hover:bg-gold-dark" aria-label={t("footer.colNewsletter")}>
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>

        <div className="mt-12 border-t border-white/10 pt-6 text-center text-xs text-[#7A7A8A]">
          {t("footer.copyright", { year })}
        </div>
      </div>
    </footer>
  );
}
