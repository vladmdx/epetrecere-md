import type { Metadata } from "next";
import { generateMetaAsync } from "@/lib/seo/generate-meta";
import { getServerLocale } from "@/lib/i18n/server-locale";
import { MatchingQuizClient } from "./client";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  const meta = {
    ro: {
      title: "Chestionar potrivire furnizori",
      description:
        "Răspunde la 6 întrebări rapide și îți recomandăm artiștii și furnizorii potriviți pentru evenimentul tău — în mai puțin de 2 minute.",
    },
    ru: {
      title: "Подбор поставщиков — короткий опрос",
      description:
        "Ответьте на 6 быстрых вопросов, и мы подберём артистов и поставщиков для вашего события — меньше чем за 2 минуты.",
    },
    en: {
      title: "Vendor Matching Quiz",
      description:
        "Answer 6 quick questions and we will recommend the artists and vendors that fit your event — in under 2 minutes.",
    },
  }[locale];
  return generateMetaAsync({
    title: meta.title,
    description: meta.description,
    path: "/chestionar",
    locale,
  });
}

export default function QuizPage() {
  return <MatchingQuizClient />;
}
