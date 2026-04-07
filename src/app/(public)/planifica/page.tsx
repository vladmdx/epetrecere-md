import type { Metadata } from "next";
import { generateMeta } from "@/lib/seo/generate-meta";
import { WizardClient } from "./client";

export const metadata: Metadata = generateMeta({
  title: "Planifică-ți Evenimentul",
  description: "Planifică evenimentul perfect în 8 pași simpli. Selectează artiștii, sala și serviciile de care ai nevoie.",
  path: "/planifica",
});

export default function PlannerPage() {
  return <WizardClient />;
}
