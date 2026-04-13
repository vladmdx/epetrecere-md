import { HeroSection } from "@/components/public/sections/hero";
import { SearchBarSection } from "@/components/public/sections/search-bar";
import { CategoriesSection } from "@/components/public/sections/categories";
import { FeaturedArtistsSection } from "@/components/public/sections/featured-artists";
import { FeaturedVenuesSection } from "@/components/public/sections/featured-venues";
import { ProcessSection } from "@/components/public/sections/process";
import { TestimonialsSection } from "@/components/public/sections/testimonials";
import { StatsCounterSection } from "@/components/public/sections/stats-counter";
import { ClientLogosSection } from "@/components/public/sections/client-logos";
import { BlogPreviewSection } from "@/components/public/sections/blog-preview";
import { PackagesSection } from "@/components/public/sections/packages";
import { CTASection } from "@/components/public/sections/cta";
import { FloatingCTA } from "@/components/shared/floating-cta";
import { websiteJsonLd, organizationJsonLd } from "@/lib/seo/jsonld";
import { getFeaturedArtists } from "@/lib/db/queries/artists";
import { getFeaturedVenues } from "@/lib/db/queries/venues";
import { generateMeta } from "@/lib/seo/generate-meta";
import { db } from "@/lib/db";
import { homepageSections } from "@/lib/db/schema";
import { asc } from "drizzle-orm";

export async function generateMetadata() {
  return generateMeta({
    title: "Marketplace pentru Evenimente din Moldova",
    description:
      "Găsește artiști, săli de evenimente și servicii pentru nuntă, botez, cumetrie și corporate. Cea mai mare platformă de evenimente din Republica Moldova.",
    path: "/",
  });
}

// Section type → wrapper style mapping
const sectionStyles: Record<string, string> = {
  categories: "section-dark relative",
  featured_artists: "section-navy relative",
  featured_venues: "section-mid",
  process: "section-dark border-t border-b border-gold/10",
  testimonials: "section-navy relative",
  stats: "section-mid relative",
  clients: "section-dark",
  blog: "section-navy relative",
  packages: "section-dark border-t border-gold/10",
};

// Default section config used when DB is empty or unreachable
const defaultSectionOrder = [
  "hero", "search_bar", "categories", "featured_artists", "featured_venues",
  "process", "testimonials", "stats", "clients", "blog", "packages", "cta",
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
      case "search_bar":
        return <SearchBarSection key={type} />;
      case "categories":
        return <CategoriesSection key={type} />;
      case "featured_artists":
        return <FeaturedArtistsSection key={type} artists={featuredArtists} />;
      case "featured_venues":
        return <FeaturedVenuesSection key={type} venues={featuredVenues} />;
      case "process":
        return <ProcessSection key={type} />;
      case "testimonials":
        return <TestimonialsSection key={type} />;
      case "stats":
        return <StatsCounterSection key={type} />;
      case "clients":
        return <ClientLogosSection key={type} />;
      case "blog":
        return <BlogPreviewSection key={type} />;
      case "packages":
        return <PackagesSection key={type} />;
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd()) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }}
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
