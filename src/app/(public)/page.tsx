import { HeroSection } from "@/components/public/sections/hero";
import { FeatureHighlightsSection } from "@/components/public/sections/feature-highlights";
import { CategoriesSection } from "@/components/public/sections/categories";
import { FeaturedArtistsSection } from "@/components/public/sections/featured-artists";
import { FeaturedVenuesSection } from "@/components/public/sections/featured-venues";
import { ProcessSection } from "@/components/public/sections/process";
import { CommunitySection } from "@/components/public/sections/community";
import { CTASection } from "@/components/public/sections/cta";
import { FloatingCTA } from "@/components/shared/floating-cta";
import { websiteJsonLd, organizationJsonLd, safeJsonLd } from "@/lib/seo/jsonld";
import { getFeaturedArtists } from "@/lib/db/queries/artists";
import { getFeaturedVenues } from "@/lib/db/queries/venues";
import { getSupplyCounts } from "@/lib/db/queries/supply-counts";
import { metaForPath } from "@/lib/seo/page-meta";

export async function generateMetadata() {
  // All three languages up front: metaForPath picks the one the middleware
  // resolved from the URL prefix, so /ru and /en get their own title,
  // description, og:locale and canonical instead of the Romanian ones.
  return metaForPath("/", {
    ro: {
      title: "Marketplace pentru Evenimente din Moldova",
      description:
        "Găsește artiști, săli de evenimente și servicii pentru nuntă, botez, cumetrie și corporate. Cea mai mare platformă de evenimente din Republica Moldova.",
    },
    ru: {
      title: "Маркетплейс мероприятий в Молдове",
      description:
        "Найдите артистов, залы и услуги для свадьбы, крестин, кумэтрии и корпоратива. Крупнейшая платформа мероприятий в Республике Молдова.",
    },
    en: {
      title: "Moldova's Event Marketplace",
      description:
        "Find artists, venues and services for weddings, christenings, cumetrie and corporate events. The largest event platform in the Republic of Moldova.",
    },
  });
}

// Section type → wrapper style mapping. Light sections own their background,
// so they get no
// dark wrapper here.
const sectionStyles: Record<string, string> = {
  categories: "section-dark relative",
  featured_artists: "section-navy relative",
  community: "section-navy relative",
};

// Default section config used when DB is empty or unreachable. Matches the
// redesigned homepage order. NOTE: the search now lives inside the hero, so
// the standalone "search_bar" section is dropped; "clients"/"blog"/"packages"
// are no longer part of the homepage layout.
const defaultSectionOrder = [
  "hero", "features", "categories", "featured_venues", "featured_artists",
  "process", "community", "cta",
];

export default async function HomePage() {
  let featuredArtists: Awaited<ReturnType<typeof getFeaturedArtists>> = [];
  let featuredVenues: Awaited<ReturnType<typeof getFeaturedVenues>> = [];
  let supply: Awaited<ReturnType<typeof getSupplyCounts>> | null = null;
  // The redesigned homepage renders a FIXED section order. The legacy
  // DB-driven `homepageSections` config predates the new section types
  // (features / recommendations / community), so using it for ordering here
  // would drop those sections on prod. Ordering is intentionally code-owned now.
  const visibleSections: string[] = defaultSectionOrder;

  try {
    const [artists, venues, counts] = await Promise.all([
      getFeaturedArtists(5),
      getFeaturedVenues(3),
      getSupplyCounts(),
    ]);
    featuredArtists = artists;
    featuredVenues = venues;
    supply = counts;
  } catch {
    // DB not connected — sections still render; featured lists stay empty.
  }

  // Map section type to React element
  function renderSection(type: string) {
    switch (type) {
      case "hero":
        return <HeroSection key={type} />;
      case "features":
        return <FeatureHighlightsSection key={type} />;
      case "categories":
        return <CategoriesSection key={type} counts={supply?.categories} />;
      case "featured_venues":
        return <FeaturedVenuesSection key={type} venues={featuredVenues} />;
      case "featured_artists":
        return <FeaturedArtistsSection key={type} artists={featuredArtists} />;
      case "process":
        return <ProcessSection key={type} />;
      case "community":
        return (
          <CommunitySection
            key={type}
            stats={
              supply
                ? {
                    activeArtists: supply.activeArtists,
                    activeVenues: supply.activeVenues,
                    serviceCategories: supply.serviceCategories,
                    completedRequests: supply.completedRequests,
                  }
                : undefined
            }
          />
        );
      case "cta":
        return <CTASection key={type} />;
      default:
        return null;
    }
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(websiteJsonLd()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(organizationJsonLd()) }}
      />
      <div className="noise-overlay">
        {visibleSections.map((type) => {
          const style = sectionStyles[type];
          const el = renderSection(type);
          if (!el) return null;
          return style ? (
            <div key={type} className={style}>
              {el}
            </div>
          ) : (
            el
          );
        })}
        <FloatingCTA />
      </div>
    </>
  );
}
