import type { Metadata } from "next";
import { generateMeta } from "@/lib/seo/generate-meta";
import { DataPrivacyClient } from "./client";

// M11 Intern #1 — GDPR self-service page for the user cabinet.

export const metadata: Metadata = generateMeta({
  title: "Datele mele — GDPR | ePetrecere.md",
  description:
    "Exportă sau șterge datele tale personale conform GDPR și Legii 133/2011.",
  path: "/cabinet/date",
});

export default function DataPrivacyPage() {
  return <DataPrivacyClient />;
}
