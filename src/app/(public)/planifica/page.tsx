import { metaForPath } from "@/lib/seo/page-meta";
import { WizardClient } from "./client";

export async function generateMetadata() {
  return metaForPath("/planifica", {
    title: "Planifică-ți Evenimentul",
    description:
      "Planifică evenimentul perfect în 8 pași simpli. Selectează artiștii, sala și serviciile de care ai nevoie.",
  });
}

export default function PlannerPage() {
  return <WizardClient />;
}
