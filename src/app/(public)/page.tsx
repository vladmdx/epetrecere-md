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
import { GoldDivider } from "@/components/shared/gold-divider";
import { FloatingCTA } from "@/components/shared/floating-cta";
import { websiteJsonLd, organizationJsonLd } from "@/lib/seo/jsonld";
import { getFeaturedArtists } from "@/lib/db/queries/artists";
import { getFeaturedVenues } from "@/lib/db/queries/venues";

export default async function HomePage() {
  let featuredArtists: Awaited<ReturnType<typeof getFeaturedArtists>> = [];
  let featuredVenues: Awaited<ReturnType<typeof getFeaturedVenues>> = [];

  try {
    [featuredArtists, featuredVenues] = await Promise.all([
      getFeaturedArtists(8),
      getFeaturedVenues(6),
    ]);
  } catch {
    // DB not connected yet — show static sections only
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
        <HeroSection />
        <SearchBarSection />
        <div className="section-dark relative">
          <CategoriesSection />
        </div>
        <div className="section-navy relative">
          <FeaturedArtistsSection artists={featuredArtists} />
        </div>
        <div className="section-mid">
          <FeaturedVenuesSection venues={featuredVenues} />
        </div>
        <div className="section-dark border-t border-b border-gold/10">
          <ProcessSection />
        </div>
        <div className="section-navy relative">
          <TestimonialsSection />
        </div>
        <div className="section-mid relative">
          <StatsCounterSection />
        </div>
        <div className="section-dark">
          <ClientLogosSection />
        </div>
        <div className="section-navy relative">
          <BlogPreviewSection />
        </div>
        <div className="section-dark border-t border-gold/10">
          <PackagesSection />
        </div>
        <CTASection />
        <FloatingCTA />
      </div>
    </>
  );
}
