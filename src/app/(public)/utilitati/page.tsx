import Link from "next/link";
import { metaForPath } from "@/lib/seo/page-meta";
import { ScrollReveal } from "@/components/shared/scroll-reveal";
import { TOOL_DEFS } from "@/lib/utilitati/tools";
import { localizeTool } from "@/lib/utilitati/tools-i18n";
import { getServerLocale } from "@/lib/i18n/server-locale";
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

export async function generateMetadata() {
  const locale = await getServerLocale();
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

const CALCULATORS = [
  { slug: "buget", title: "Calculator Buget", desc: "Estimează bugetul total al evenimentului.", icon: WalletCards },
  { slug: "invitati", title: "Calculator Invitați & Mese", desc: "Câte mese, ospătari și locuri de parcare îți trebuie?", icon: UsersRound },
  { slug: "dar-nunta", title: "Calculator Dar Nuntă", desc: "Cât să dai dar la nuntă în Moldova.", icon: Gift },
  { slug: "nunta", title: "Calculator Cost Nuntă", desc: "Estimare totală pentru nunta ta în 2026.", icon: Heart },
  { slug: "alcool", title: "Calculator Băuturi", desc: "Câte sticle de vin, vodcă și șampanie pe invitat.", icon: Wine },
  { slug: "meniu", title: "Calculator Meniu", desc: "Cantități realiste pentru aperitive, fel principal, desert.", icon: UtensilsCrossed },
];

export default async function UtilitatiHubPage() {
  const locale = await getServerLocale();
  const tools = TOOL_DEFS.map((tool) => localizeTool(tool, locale));
  const labels = {
    ro: { eyebrow: "Utilități", title: "Instrumente pentru evenimentul tău", description: "Organizează o nuntă, cumătrie, botez sau eveniment corporate din Moldova cu instrumente gratuite, într-un singur loc.", online: "Instrumente online", calculators: "Calculatoare", all: "Vezi toate", open: "Deschide" },
    ru: { eyebrow: "Инструменты", title: "Инструменты для вашего события", description: "Организуйте свадьбу, крестины, семейное или корпоративное событие в Молдове с бесплатными онлайн инструментами.", online: "Онлайн инструменты", calculators: "Калькуляторы", all: "Смотреть все", open: "Открыть" },
    en: { eyebrow: "Tools", title: "Tools for your event", description: "Organize a wedding, baptism, family celebration or corporate event in Moldova with free online tools.", online: "Online tools", calculators: "Calculators", all: "View all", open: "Open" },
  }[locale];
  const localizedCalculators = {
    ro: ["Calculator Buget", "Invitați și Mese", "Calculator Dar Nuntă", "Calculator Cost Nuntă", "Calculator Băuturi", "Calculator Meniu"],
    ru: ["Калькулятор бюджета", "Гости и столы", "Свадебный подарок", "Стоимость свадьбы", "Напитки", "Меню"],
    en: ["Budget Calculator", "Guests and Tables", "Wedding Gift Calculator", "Wedding Cost Calculator", "Drinks Calculator", "Menu Calculator"],
  }[locale];
  const localizedCalculatorDescriptions = {
    ro: CALCULATORS.map((calculator) => calculator.desc),
    ru: ["Оцените общий бюджет события.", "Рассчитайте столы, персонал и парковку.", "Оцените сумму подарка на свадьбу в Молдове.", "Получите ориентир полной стоимости свадьбы 2026.", "Рассчитайте вино, крепкие напитки и воду.", "Определите реальные количества блюд и десерта."],
    en: ["Estimate the total event budget.", "Calculate tables, staff and parking.", "Estimate a suitable wedding gift in Moldova.", "Get a full 2026 wedding cost estimate.", "Calculate wine, spirits and water.", "Plan realistic food and dessert quantities."],
  }[locale];
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
              {labels.eyebrow}
            </p>
            <h1 className="font-heading text-3xl font-bold md:text-5xl text-[#FAF8F2]">
              {labels.title}
            </h1>
            <p className="mt-4 max-w-2xl mx-auto text-base text-muted-foreground">
              {labels.description}
            </p>
          </div>
        </ScrollReveal>

        {/* Tools grid */}
        <section className="mb-16">
          <ScrollReveal>
            <h2 className="mb-6 font-heading text-2xl font-bold text-[#FAF8F2]">
              {labels.online}
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
                    {labels.open}
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
                {labels.calculators}
              </h2>
              <Link
                href="/calculatoare"
                className="text-xs text-gold hover:underline flex items-center gap-1"
              >
                {labels.all} <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </ScrollReveal>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CALCULATORS.map((calc, i) => {
              const Icon = calc.icon;
              const title = localizedCalculators[i];
              const description = localizedCalculatorDescriptions[i];
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
