const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md";

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "ePetrecere.md",
    url: BASE_URL,
    description:
      "Platformă de servicii pentru evenimente din Republica Moldova",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${BASE_URL}/artisti?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "ePetrecere.md",
    url: BASE_URL,
    logo: `${BASE_URL}/images/logo.png`,
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      areaServed: "MD",
      availableLanguage: ["Romanian", "Russian", "English"],
    },
    sameAs: [],
  };
}

export function breadcrumbJsonLd(
  items: { name: string; url: string }[],
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url.startsWith("http") ? item.url : `${BASE_URL}${item.url}`,
    })),
  };
}

export function artistJsonLd(artist: {
  name: string;
  description: string;
  image?: string;
  slug: string;
  ratingAvg?: number;
  ratingCount?: number;
}) {
  return {
    "@context": "https://schema.org",
    "@type": ["Person", "PerformingGroup"],
    name: artist.name,
    description: artist.description,
    url: `${BASE_URL}/artisti/${artist.slug}`,
    ...(artist.image && { image: artist.image }),
    ...(artist.ratingAvg &&
      artist.ratingCount && {
        aggregateRating: {
          "@type": "AggregateRating",
          ratingValue: artist.ratingAvg,
          reviewCount: artist.ratingCount,
          bestRating: 5,
        },
      }),
  };
}

export function articleJsonLd(article: {
  title: string;
  description: string;
  url: string;
  image?: string;
  datePublished: string;
  dateModified?: string;
  category?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.title,
    description: article.description,
    url: article.url.startsWith("http") ? article.url : `${BASE_URL}${article.url}`,
    ...(article.image && { image: article.image }),
    datePublished: article.datePublished,
    ...(article.dateModified && { dateModified: article.dateModified }),
    ...(article.category && { articleSection: article.category }),
    author: {
      "@type": "Organization",
      name: "ePetrecere.md",
      url: BASE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "ePetrecere.md",
      url: BASE_URL,
    },
  };
}

export function venueJsonLd(venue: {
  name: string;
  description: string;
  address?: string;
  city?: string;
  image?: string;
  slug: string;
  pricePerPerson?: number;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: venue.name,
    description: venue.description,
    url: `${BASE_URL}/sali/${venue.slug}`,
    ...(venue.image && { image: venue.image }),
    ...(venue.address && {
      address: {
        "@type": "PostalAddress",
        streetAddress: venue.address,
        addressLocality: venue.city || "Chișinău",
        addressCountry: "MD",
      },
    }),
  };
}

export function itemListJsonLd(items: Array<{ name: string; url: string }>, listName: string) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: listName,
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      url: item.url,
    })),
  };
}
