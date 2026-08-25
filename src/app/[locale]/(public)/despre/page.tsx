import { metaForPath } from "@/lib/seo/page-meta";
import { breadcrumbJsonLd, organizationJsonLd, safeJsonLd } from "@/lib/seo/jsonld";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { t } from "@/i18n";
import { Sparkles, Users, Calendar, Shield } from "lucide-react";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  // All three languages up front — metaForPath serves the one named by the
  // route parameter, so the page stays prerenderable.
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  return metaForPath(
    "/despre",
    {
      ro: {
        title: "Despre Noi",
        description:
          "Despre ePetrecere.md — platforma de servicii pentru evenimente din Republica Moldova.",
      },
      ru: {
        title: "О нас",
        description:
          "О платформе ePetrecere.md — маркетплейс артистов, залов и услуг для мероприятий в Республике Молдова.",
      },
      en: {
        title: "About Us",
        description:
          "About ePetrecere.md — the marketplace for artists, venues and event services in the Republic of Moldova.",
      },
    },
    locale,
  );
}

const features = [
  { icon: Users, key: "artists", titleKey: "about.features.artists.title" },
  { icon: Calendar, key: "calendar", titleKey: "about.features.calendar.title" },
  { icon: Shield, key: "verified", titleKey: "about.features.verified.title" },
  { icon: Sparkles, key: "ai", titleKey: "ui.aiPowered" },
] as const;

export default async function AboutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd([
            breadcrumbJsonLd([
              { name: t("nav.home", locale), url: "https://epetrecere.md" },
              { name: t("nav.about", locale), url: "https://epetrecere.md/despre" },
            ]),
            organizationJsonLd(),
          ]),
        }}
      />
    <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-2 text-sm font-medium uppercase tracking-[3px] text-gold">
          {t("nav.about", locale)}
        </p>
        <h1 className="font-heading text-3xl font-bold md:text-4xl">
          {t("about.title", locale)}
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          {t("about.subtitle", locale)}
        </p>
      </div>

      <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {features.map((f) => (
          <div key={f.key} className="rounded-xl border border-border/40 bg-card p-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold/10 text-gold">
              <f.icon className="h-7 w-7" />
            </div>
            <h3 className="font-heading text-base font-bold">{t(f.titleKey, locale)}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(`about.features.${f.key}.desc`, locale)}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-16 rounded-xl bg-gradient-to-r from-gold/5 via-gold/10 to-gold/5 p-12 text-center">
        <h2 className="font-heading text-2xl font-bold">{t("about.mission.title", locale)}</h2>
        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
          {t("about.mission.body", locale)}
        </p>
      </div>
    </div>
    </>
  );
}
