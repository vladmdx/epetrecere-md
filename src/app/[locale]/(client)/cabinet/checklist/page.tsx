import type { Metadata } from "next";
import { generateMetaAsync } from "@/lib/seo/generate-meta";
import { ChecklistClient } from "./client";

export async function generateMetadata(): Promise<Metadata> {
  return generateMetaAsync({
    title: {
      ro: "Checklist 12 luni — planificare nuntă",
      ru: "Чеклист на 12 месяцев — планирование свадьбы",
      en: "12-month checklist — wedding planning",
    },
    description: {
      ro: "Checklist complet de 12 luni pentru planificarea nunții tale. Bifează fiecare pas și nu mai uita nimic.",
      ru: "Полный 12-месячный чеклист для планирования вашей свадьбы. Отмечайте каждый шаг и ничего не забывайте.",
      en: "Complete 12-month checklist for planning your wedding. Check off each step and never forget anything.",
    },
    path: "/cabinet/checklist",
  });
}

export default function ChecklistPage() {
  return <ChecklistClient />;
}
