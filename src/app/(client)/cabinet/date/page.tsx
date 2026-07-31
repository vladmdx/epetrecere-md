import type { Metadata } from "next";
import { generateMeta } from "@/lib/seo/generate-meta";
import { DataPrivacyClient } from "./client";

// M11 Intern #1 — GDPR self-service page for the user cabinet.

export const metadata: Metadata = generateMeta({
  title: "Datele mele — GDPR",
  description:
    "Exportă sau șterge datele personale conform GDPR și Legii nr. 195/2024 din Republica Moldova.",
  path: "/cabinet/date",
});

export default function DataPrivacyPage() {
  return <DataPrivacyClient />;
}
