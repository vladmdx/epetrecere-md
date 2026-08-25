import type { Metadata } from "next";
import { generateMetaAsync } from "@/lib/seo/generate-meta";
import { ChecklistClient } from "./client";

export async function generateMetadata(): Promise<Metadata> {
  return generateMetaAsync({
  title: "Checklist 12 luni — planificare nuntă",
  description:
    "Checklist complet de 12 luni pentru planificarea nunții tale. Bifează fiecare pas și nu mai uita nimic.",
  path: "/cabinet/checklist",
});
}

export default function ChecklistPage() {
  return <ChecklistClient />;
}
