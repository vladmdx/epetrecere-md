import type { Metadata } from "next";
import { generateMeta } from "@/lib/seo/generate-meta";
import { ResultsClient } from "./client";

export const metadata: Metadata = generateMeta({
  title: "Rezultatele planificării tale",
  description:
    "Artiștii și sălile disponibile pentru evenimentul tău, filtrate după data, locația, categoria și bugetul ales.",
  path: "/planifica/rezultate",
  noindex: true,
});

export default function WizardResultsPage() {
  return <ResultsClient />;
}
