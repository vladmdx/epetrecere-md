import { metaForPath } from "@/lib/seo/page-meta";
import { breadcrumbJsonLd, safeJsonLd } from "@/lib/seo/jsonld";
import { ContactPageClient } from "./client";

export async function generateMetadata() {
  return metaForPath("/contact", {
    title: "Contact",
    description:
      "Contactează echipa ePetrecere.md pentru servicii evenimente în Republica Moldova.",
  });
}

export default function ContactPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd([
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
