import type { Metadata } from "next";
import { generateMetaAsync } from "@/lib/seo/generate-meta";
import { MatchingQuizClient } from "./client";

export async function generateMetadata(): Promise<Metadata> {
  return generateMetaAsync({
  title: "Chestionar potrivire furnizori",
  description:
    "Răspunde la 6 întrebări rapide și îți recomandăm artiștii și furnizorii potriviți pentru evenimentul tău — în mai puțin de 2 minute.",
  path: "/chestionar",
});
}

export default function QuizPage() {
  return <MatchingQuizClient />;
}
