import type { Metadata } from "next";
import { generateMeta } from "@/lib/seo/generate-meta";
import { ChecklistClient } from "./client";

export const metadata: Metadata = generateMeta({
  title: "Checklist 12 luni — planificare nuntă",
  description:
    "Checklist complet de 12 luni pentru planificarea nunții tale. Bifează fiecare pas și nu mai uita nimic.",
  path: "/cabinet/checklist",
});

export default function ChecklistPage() {
  return <ChecklistClient />;
}
