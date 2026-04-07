"use client";

import Link from "next/link";
import { Sparkles, Send, Globe, Music, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/hooks/use-locale";

export function Footer() {
  const { t } = useLocale();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border/40 bg-card">
      <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="space-y-4">
            <Link href="/" className="flex items-center gap-2">
              <Sparkles className="h-6 w-6 text-gold" />
              <span className="font-heading text-xl font-bold">
                e<span className="text-gold">Petrecere</span>.md
              </span>
            </Link>
            <p className="text-sm text-muted-foreground">
              {t("footer.description")}
            </p>
            <div className="flex gap-3">
              <a href="#" className="text-muted-foreground transition-colors hover:text-gold">
                <Globe className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground transition-colors hover:text-gold">
                <Music className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground transition-colors hover:text-gold">
                <Camera className="h-5 w-5" />
              </a>
              <a href="#" className="text-muted-foreground transition-colors hover:text-gold">
                <Send className="h-5 w-5" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="mb-4 font-heading text-sm font-bold uppercase tracking-wider text-gold">
              {t("footer.quick_links")}
            </h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/artisti" className="text-muted-foreground hover:text-gold">{t("nav.artists")}</Link></li>
              <li><Link href="/sali" className="text-muted-foreground hover:text-gold">{t("nav.venues")}</Link></li>
              <li><Link href="/servicii" className="text-muted-foreground hover:text-gold">{t("nav.services")}</Link></li>
              <li><Link href="/planifica" className="text-muted-foreground hover:text-gold">{t("nav.planner")}</Link></li>
              <li><Link href="/blog" className="text-muted-foreground hover:text-gold">{t("nav.blog")}</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="mb-4 font-heading text-sm font-bold uppercase tracking-wider text-gold">
              {t("footer.legal")}
            </h3>
            <ul className="space-y-2 text-sm">
              <li><Link href="/termeni" className="text-muted-foreground hover:text-gold">{t("footer.terms")}</Link></li>
              <li><Link href="/confidentialitate" className="text-muted-foreground hover:text-gold">{t("footer.privacy")}</Link></li>
              <li><Link href="/cookies" className="text-muted-foreground hover:text-gold">{t("footer.cookies")}</Link></li>
              <li><Link href="/contact" className="text-muted-foreground hover:text-gold">{t("nav.contact")}</Link></li>
              <li><Link href="/despre" className="text-muted-foreground hover:text-gold">{t("nav.about")}</Link></li>
            </ul>
          </div>

          {/* Newsletter */}
          <div>
            <h3 className="mb-4 font-heading text-sm font-bold uppercase tracking-wider text-gold">
              {t("footer.newsletter_title")}
            </h3>
            <form className="flex gap-2" onSubmit={(e) => e.preventDefault()}>
              <Input
                type="email"
                placeholder={t("footer.newsletter_placeholder")}
                className="flex-1"
              />
              <Button className="bg-gold text-background hover:bg-gold-dark">
                {t("footer.newsletter_button")}
              </Button>
            </form>
          </div>
        </div>

        <div className="mt-10 border-t border-border/40 pt-6 text-center text-xs text-muted-foreground">
          {t("footer.copyright", { year })}
        </div>
      </div>
    </footer>
  );
}
