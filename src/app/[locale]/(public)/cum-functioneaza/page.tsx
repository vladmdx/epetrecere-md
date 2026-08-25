import { metaForPath } from "@/lib/seo/page-meta";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { t } from "@/i18n";

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
    "/cum-functioneaza",
    {
      ro: {
        title: "Cum funcționează",
        description:
          "Află cum te ajută ePetrecere.md să planifici și să organizezi evenimentul tău.",
      },
      ru: {
        title: "Как это работает",
        description:
          "Узнайте, как ePetrecere.md помогает спланировать и организовать ваше мероприятие.",
      },
      en: {
        title: "How It Works",
        description:
          "See how ePetrecere.md helps you plan and organise your event from start to finish.",
      },
    },
    locale,
  );
}

export default async function HowItWorksPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  return (
    <main
      aria-label={t("nav.how_it_works", locale)}
      className="-mt-16 min-h-[calc(100vh-4rem)] bg-[#05080d] pt-16"
    />
  );
}
