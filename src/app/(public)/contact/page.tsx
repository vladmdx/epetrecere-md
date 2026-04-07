import type { Metadata } from "next";
import { generateMeta } from "@/lib/seo/generate-meta";
import { ContactPageClient } from "./client";

export const metadata: Metadata = generateMeta({
  title: "Contact",
  description: "Contactează echipa ePetrecere.md pentru servicii evenimente în Republica Moldova.",
  path: "/contact",
});

export default function ContactPage() {
  return <ContactPageClient />;
}
