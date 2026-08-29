"use client";

import Link from "@/components/shared/locale-link";
import { Send, Globe, Camera, Music2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/hooks/use-locale";
import { BrandLogo } from "@/components/public/brand-mark";

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
      // The page this points at is titled "Tarife pentru furnizori" and its
      // first line is that there is no subscription fee — only a 5% commission
      // on confirmed orders. Calling the link "Abonament" told partners the
      // opposite of what they would read on arrival.
      { key: "footer.tariffs", href: "/pachete" },
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
      { key: "footer.legalDocs", href: "/legal" },
    ],
  },
];

/**
 * Social profiles, read from public env vars.
 *
 * These used to be four icons all pointing at "#": a visitor who clicked one
 * went nowhere, which is worse than not showing it. An icon now appears only
 * when its URL is actually configured, so the row is honest whatever is set.
 * Fill NEXT_PUBLIC_SOCIAL_* in the deployment environment to light them up.
 */
const SOCIALS = [
  { icon: Globe, href: process.env.NEXT_PUBLIC_SOCIAL_FACEBOOK, label: "Facebook" },
  { icon: Camera, href: process.env.NEXT_PUBLIC_SOCIAL_INSTAGRAM, label: "Instagram" },
  { icon: Music2, href: process.env.NEXT_PUBLIC_SOCIAL_TIKTOK, label: "TikTok" },
  { icon: Send, href: process.env.NEXT_PUBLIC_SOCIAL_TELEGRAM, label: "Telegram" },
].filter((s): s is { icon: typeof Globe; href: string; label: string } =>
  Boolean(s.href),
);

export function Footer() {
  const { t } = useLocale();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-gold/10 bg-[#070707]">
      <div className="mx-auto max-w-7xl px-4 py-14 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          {/* Brand */}
          <div className="space-y-4 lg:col-span-1">
            <Link
              href="/"
              className="flex items-center text-white"
              aria-label="ePetrecere.md"
            >
              <BrandLogo className="h-9 w-auto" />
            </Link>
            <p className="text-sm leading-relaxed text-[#9A9AAB]">
              {t("footer.tagline")}
            </p>
            <div className="flex gap-3">
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer noopener"
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
