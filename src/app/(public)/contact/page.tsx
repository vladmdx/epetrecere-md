import { metaForPath } from "@/lib/seo/page-meta";
import { breadcrumbJsonLd, safeJsonLd } from "@/lib/seo/jsonld";
import { ContactPageClient } from "./client";

export async function generateMetadata() {
  // All three languages up front — metaForPath serves the one the
  // middleware resolved from the URL prefix.
  return metaForPath("/contact", {
    ro: {
      title: "Contact",
      description:
        "Contactează echipa ePetrecere.md pentru servicii evenimente în Republica Moldova.",
    },
    ru: {
      title: "Контакты",
      description:
        "Свяжитесь с командой ePetrecere.md по вопросам услуг для мероприятий в Республике Молдова.",
    },
    en: {
      title: "Contact",
      description:
        "Get in touch with the ePetrecere.md team about event services in the Republic of Moldova.",
    },
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
                // Registry details for EPETRECERE S.R.L. (IDNO 1026023123354).
                // No telephone: the number that used to sit here was a
                // placeholder, and publishing a fake one as structured data is
                // worse than publishing none.
                "@type": "Organization",
                name: "EPETRECERE S.R.L.",
                alternateName: "ePetrecere.md",
                email: "info@epetrecere.md",
                address: {
                  "@type": "PostalAddress",
                  streetAddress: "str. Mihai Eminescu 64, of. 6",
                  addressLocality: "Strășeni",
                  postalCode: "MD-3701",
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
