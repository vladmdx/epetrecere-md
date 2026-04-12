import type { Metadata } from "next";
import { generateMeta } from "@/lib/seo/generate-meta";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { ContactPageClient } from "./client";

export const metadata: Metadata = generateMeta({
  title: "Contact",
  description: "Contactează echipa ePetrecere.md pentru servicii evenimente în Republica Moldova.",
  path: "/contact",
});

export default function ContactPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            breadcrumbJsonLd([
              { name: "Acasă", url: "https://epetrecere.md" },
              { name: "Contact", url: "https://epetrecere.md/contact" },
            ]),
            {
              "@context": "https://schema.org",
              "@type": "ContactPage",
              name: "Contact ePetrecere.md",
              url: "https://epetrecere.md/contact",
              mainEntity: {
                "@type": "Organization",
                name: "ePetrecere.md",
                telephone: "+373 60 123 456",
                email: "info@epetrecere.md",
                address: {
                  "@type": "PostalAddress",
                  addressLocality: "Chișinău",
                  addressCountry: "MD",
                },
              },
            },
          ]),
        }}
      />
      <ContactPageClient />
    </>
  );
}
