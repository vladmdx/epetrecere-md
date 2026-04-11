import type { Metadata } from "next";
import { generateMeta } from "@/lib/seo/generate-meta";
import { BudgetTrackerClient } from "./client";

export const metadata: Metadata = generateMeta({
  title: "Buget nuntă — tracker cheltuieli",
  description:
    "Urmărește bugetul nunții pe categorii: estimat vs. plătit. Adaugă facturi și rămâi în control.",
  path: "/cabinet/buget",
});

export default function BudgetTrackerPage() {
  return <BudgetTrackerClient />;
}
