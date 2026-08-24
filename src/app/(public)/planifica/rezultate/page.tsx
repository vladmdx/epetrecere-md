import type { Metadata } from "next";
import { generateMetaAsync } from "@/lib/seo/generate-meta";
import { getServerLocale } from "@/lib/i18n/server-locale";
import { ResultsClient } from "./client";

export async function generateMetadata(): Promise<Metadata> {
  // noindex, so this copy never reaches a search result — but it is still the
  // browser tab title, and an English visitor should not read Romanian there.
  const locale = await getServerLocale();
  const meta = {
    ro: {
      title: "Rezultatele planificării tale",
      description:
        "Artiștii și sălile disponibile pentru evenimentul tău, filtrate după data, locația, categoria și bugetul ales.",
    },
    ru: {
      title: "Результаты вашего планирования",
      description:
        "Артисты и залы, доступные для вашего события — по выбранной дате, городу, категории и бюджету.",
    },
    en: {
      title: "Your Planning Results",
      description:
        "The artists and venues available for your event, filtered by the date, location, category and budget you chose.",
    },
  }[locale];
  return generateMetaAsync({
    title: meta.title,
    description: meta.description,
    path: "/planifica/rezultate",
    noindex: true,
    locale,
  });
}

export default function WizardResultsPage() {
  return <ResultsClient />;
}
