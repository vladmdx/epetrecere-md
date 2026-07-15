import { HeroSection } from "@/components/public/sections/hero";
import { FeatureHighlightsSection } from "@/components/public/sections/feature-highlights";
import { CategoriesSection } from "@/components/public/sections/categories";
import { FeaturedArtistsSection } from "@/components/public/sections/featured-artists";
import { FeaturedVenuesSection } from "@/components/public/sections/featured-venues";
import { RecommendationsSection } from "@/components/public/sections/recommendations";
import { ProcessSection } from "@/components/public/sections/process";
import { CommunitySection } from "@/components/public/sections/community";
import { CTASection } from "@/components/public/sections/cta";
import { FloatingCTA } from "@/components/shared/floating-cta";
import { websiteJsonLd, organizationJsonLd, safeJsonLd } from "@/lib/seo/jsonld";
import { getFeaturedArtists } from "@/lib/db/queries/artists";
import { getFeaturedVenues } from "@/lib/db/queries/venues";
import { metaForPath } from "@/lib/seo/page-meta";
import { db } from "@/lib/db";
import { homepageSections } from "@/lib/db/schema";
import { asc } from "drizzle-orm";

export async function generateMetadata() {
  return metaForPath("/", {
    title: "Marketplace pentru Evenimente din Moldova",
    description:
      "Găsește artiști, săli de evenimente și servicii pentru nuntă, botez, cumetrie și corporate. Cea mai mare platformă de evenimente din Republica Moldova.",
  });
}

// Section type → wrapper style mapping. Light sections (features, venues,
// recommendations) own their background inside the component, so they get no
// dark wrapper here.
const sectionStyles: Record<string, string> = {
  categories: "section-dark relative",
  featured_artists: "section-navy relative",
  process: "section-dark border-t border-b border-gold/10",
  community: "section-navy relative",
};

// Default section config used when DB is empty or unreachable. Matches the
// redesigned homepage order. NOTE: the search now lives inside the hero, so
// the standalone "search_bar" section is dropped; "clients"/"blog"/"packages"
// are no longer part of the homepage layout.
const defaultSectionOrder = [
  "hero", "features", "categories", "featured_venues", "featured_artists",
  "recommendations", "process", "community", "cta",
];

export default async function HomePage() {
  let featuredArtists: Awaited<ReturnType<typeof getFeaturedArtists>> = [];
  let featuredVenues: Awaited<ReturnType<typeof getFeaturedVenues>> = [];
  let visibleSections: string[] = defaultSectionOrder;

  try {
    const [artists, venues, dbSections] = await Promise.all([
      getFeaturedArtists(8),
      getFeaturedVenues(6),
      db
        .select({ type: homepageSections.type, isVisible: homepageSections.isVisible })
        .from(homepageSections)
        .orderBy(asc(homepageSections.sortOrder)),
    ]);
    featuredArtists = artists;
    featuredVenues = venues;

    if (dbSections.length > 0) {
      visibleSections = dbSections
        .filter((s) => s.isVisible)
        .map((s) => s.type);
    }
  } catch {
    // DB not connected — show default sections
  }

  // Map section type to React element
  function renderSection(type: string) {
    switch (type) {
      case "hero":
        return <HeroSection key={type} />;
      case "features":
        return <FeatureHighlightsSection key={type} />;
      case "categories":
        return <CategoriesSection key={type} />;
      case "featured_venues":
        return <FeaturedVenuesSection key={type} venues={featuredVenues} />;
      case "featured_artists":
        return <FeaturedArtistsSection key={type} artists={featuredArtists} />;
      case "recommendations":
        return <RecommendationsSection key={type} />;
      case "process":
        return <ProcessSection key={type} />;
      case "community":
        return <CommunitySection key={type} />;
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
