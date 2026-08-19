import type { Metadata } from "next";
import { generateMetaAsync } from "@/lib/seo/generate-meta";
import { ResultsClient } from "./client";

export async function generateMetadata(): Promise<Metadata> {
  return generateMetaAsync({
  title: "Rezultatele planificării tale",
  description:
    "Artiștii și sălile disponibile pentru evenimentul tău, filtrate după data, locația, categoria și bugetul ales.",
  path: "/planifica/rezultate",
  noindex: true,
});
}

export default function WizardResultsPage() {
  return <ResultsClient />;
}
