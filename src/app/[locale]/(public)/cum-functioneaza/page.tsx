import { metaForPath } from "@/lib/seo/page-meta";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";

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

export default function HowItWorksPage() {
  return (
    <main
      aria-label="Cum funcționează"
      className="-mt-16 min-h-[calc(100vh-4rem)] bg-[#05080d] pt-16"
    />
  );
}
