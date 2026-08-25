import Link from "@/components/shared/locale-link";
import { Check, Star, Zap, Crown, ArrowRight } from "lucide-react";
import { t } from "@/i18n";
import type { Locale } from "@/types";

// M7 Intern #4 — Homepage packages teaser.
// Short summary that drives vendors to /pachete for the full comparison.

const tiers = [
  {
    name: "Basic",
    key: "basic",
    price: null,
    icon: Star,
    href: "/sign-up?role=vendor&plan=basic",
    highlight: false,
  },
  {
    name: "Pro",
    key: "pro",
    price: "49€",
    icon: Zap,
    href: "/pachete#pro",
    highlight: true,
  },
  {
    name: "Premium",
    key: "premium",
    price: "129€",
    icon: Crown,
    href: "/pachete#premium",
    highlight: false,
  },
];

export function PackagesSection({ locale }: { locale: Locale }) {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 lg:px-8 lg:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="mb-2 text-sm font-medium uppercase tracking-[3px] text-gold">
          {t("packages.eyebrow", locale)}
        </p>
        <h2 className="font-heading text-2xl font-bold md:text-3xl">
          {t("packages.title", locale)}
        </h2>
        <p className="mt-3 text-sm text-muted-foreground md:text-base">
          {t("packages.subtitle", locale)}
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
        {tiers.map((tier) => {
          const Icon = tier.icon;
          return (
            <div
              key={tier.name}
              className={`relative flex flex-col rounded-2xl border p-6 ${
                tier.highlight
                  ? "border-gold bg-gradient-to-b from-gold/15 to-transparent shadow-lg"
                  : "border-border/40 bg-card"
              }`}
            >
              {tier.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gold px-3 py-1 text-xs font-medium text-[#0D0D0D]">
                  {t("packages.popular", locale)}
                </span>
              )}
              <div className="flex items-center gap-2">
                <Icon
                  className={`h-5 w-5 ${
                    tier.highlight ? "text-gold" : "text-muted-foreground"
                  }`}
                />
                <h3 className="font-heading text-lg font-bold">{tier.name}</h3>
              </div>
              <div className="mt-4">
                <span className="font-accent text-3xl font-semibold">
                  {tier.price ?? t("packages.free", locale)}
                </span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {tier.price
                    ? t("packages.perMonth", locale)
                    : t("packages.forever", locale)}
                </span>
              </div>
              <ul className="mt-5 flex-1 space-y-2 text-sm">
                {[1, 2, 3, 4].map((n) => (
                  <li key={n} className="flex items-start gap-2">
                    <Check
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        tier.highlight ? "text-gold" : "text-success"
                      }`}
                    />
                    <span>{t(`packages.${tier.key}.f${n}`, locale)}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={tier.href}
                className={`mt-6 inline-flex items-center justify-center gap-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  tier.highlight
                    ? "bg-gold text-[#0D0D0D] hover:bg-gold-dark"
                    : "border border-border/40 hover:border-gold/40 hover:text-gold"
                }`}
              >
                {t(`packages.${tier.key}.cta`, locale)}{" "}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          );
        })}
      </div>

      <div className="mt-8 text-center">
        <Link
          href="/pachete"
          className="inline-flex items-center gap-1 text-sm text-gold hover:text-gold-dark"
        >
          {t("packages.compare", locale)} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
