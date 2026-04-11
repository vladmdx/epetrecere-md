import type { Metadata } from "next";
import { generateMeta } from "@/lib/seo/generate-meta";
import { MatchingQuizClient } from "./client";

export const metadata: Metadata = generateMeta({
  title: "Chestionar potrivire furnizori",
  description:
    "Răspunde la 6 întrebări rapide și îți recomandăm artiștii și furnizorii potriviți pentru evenimentul tău — în mai puțin de 2 minute.",
  path: "/chestionar",
});

export default function QuizPage() {
  return <MatchingQuizClient />;
}
