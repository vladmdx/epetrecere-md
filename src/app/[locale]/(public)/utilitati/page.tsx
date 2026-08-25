import Link from "@/components/shared/locale-link";
import { metaForPath } from "@/lib/seo/page-meta";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { TOOL_DEFS } from "@/lib/utilitati/tools";
import { localizeTool } from "@/lib/utilitati/tools-i18n";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { t } from "@/i18n";
import {
  ArrowRight,
  Gift,
  Heart,
  UsersRound,
  UtensilsCrossed,
  WalletCards,
  Wine,
} from "lucide-react";

export const revalidate = 3600;

interface Props {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const meta = {
    ro: ["Utilități pentru evenimente în Moldova", "Checklist, buget, invitații, listă de invitați și calculatoare gratuite pentru nunți și evenimente în Moldova."],
    ru: ["Инструменты для событий в Молдове", "Бесплатные чеклисты, бюджет, приглашения, список гостей и калькуляторы для свадьбы и событий в Молдове."],
    en: ["Event Planning Tools for Moldova", "Free checklists, budget tools, invitations, guest lists and calculators for weddings and events in Moldova."],
  }[locale];
  return metaForPath("/utilitati", {
    title: meta[0],
    description: meta[1],
  }, locale);
}

// `key` is the i18n leaf under `utilitati.calc.*` — the slug carries a hyphen
// that a dictionary key cannot.
const CALCULATORS = [
  { slug: "buget", key: "buget", icon: WalletCards },
  { slug: "invitati", key: "invitati", icon: UsersRound },
  { slug: "dar-nunta", key: "darNunta", icon: Gift },
  { slug: "nunta", key: "nunta", icon: Heart },
  { slug: "alcool", key: "alcool", icon: Wine },
  { slug: "meniu", key: "meniu", icon: UtensilsCrossed },
];

export default async function UtilitatiHubPage({ params }: Props) {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const tools = TOOL_DEFS.map((tool) => localizeTool(tool, locale));
  return (
    <main className="relative min-h-screen pt-24 pb-20">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <img
          src="/images/backgrounds/party-dance.jpg"
          alt=""
          className="parallax-bg h-full w-full object-cover opacity-[0.07] blur-[2px]"
          loading="lazy"
        />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 lg:px-8">
        <ScrollReveal>
          <div className="mb-12 text-center">
            <p className="mb-2 text-sm font-medium uppercase tracking-[3px] text-gold">
              {t("utilitati.eyebrow", locale)}
            </p>
            <h1 className="font-heading text-3xl font-bold md:text-5xl text-[#FAF8F2]">
              {t("utilitati.title", locale)}
            </h1>
            <p className="mt-4 max-w-2xl mx-auto text-base text-muted-foreground">
              {t("utilitati.description", locale)}
            </p>
          </div>
        </ScrollReveal>

        {/* Tools grid */}
        <section className="mb-16">
          <ScrollReveal>
            <h2 className="mb-6 font-heading text-2xl font-bold text-[#FAF8F2]">
              {t("utilitati.online", locale)}
            </h2>
          </ScrollReveal>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tools.map((tool, i) => (
              <ScrollReveal key={tool.slug} delay={i * 0.05}>
                <Link
                  href={`/utilitati/${tool.slug}`}
                  className="group block h-full rounded-xl border border-border/40 bg-card p-6 transition-all hover:border-gold/40 hover:bg-card/80"
                >
                  <div className="text-3xl mb-3">{tool.emoji}</div>
                  <h3 className="font-heading text-lg font-bold mb-2 text-foreground group-hover:text-gold transition-colors">
                    {tool.title}
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {tool.shortPitch}
                  </p>
                  <div className="mt-4 flex items-center gap-1 text-xs font-medium text-gold opacity-0 transition-opacity group-hover:opacity-100">
                    {t("utilitati.open", locale)}
                    <ArrowRight className="h-3 w-3" />
                  </div>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        </section>

        {/* Calculators grid */}
        <section>
          <ScrollReveal>
            <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
              <h2 className="font-heading text-2xl font-bold text-[#FAF8F2]">
                {t("utilitati.calculators", locale)}
              </h2>
              <Link
                href="/calculatoare"
                className="text-xs text-gold hover:underline flex items-center gap-1"
              >
                {t("utilitati.all", locale)} <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </ScrollReveal>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CALCULATORS.map((calc, i) => {
              const Icon = calc.icon;
              const title = t(`utilitati.calc.${calc.key}.title`, locale);
              const description = t(`utilitati.calc.${calc.key}.desc`, locale);
              return (
                <ScrollReveal key={calc.slug} delay={i * 0.04}>
                  <Link
                    href={`/calculatoare/${calc.slug}`}
                    className="group block h-full rounded-xl border border-border/40 bg-card p-6 transition-all hover:border-gold/40 hover:bg-card/80"
                  >
                    <div className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gold/10 text-gold">
                      <Icon className="h-5 w-5" aria-hidden />
                    </div>
                    <h3 className="font-heading text-lg font-bold mb-2 text-foreground group-hover:text-gold transition-colors">
                      {title}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {description}
                    </p>
                  </Link>
                </ScrollReveal>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
