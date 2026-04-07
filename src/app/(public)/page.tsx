import { HeroSection } from "@/components/public/sections/hero";
import { SearchBarSection } from "@/components/public/sections/search-bar";
import { CategoriesSection } from "@/components/public/sections/categories";
import { FeaturedArtistsSection } from "@/components/public/sections/featured-artists";
import { FeaturedVenuesSection } from "@/components/public/sections/featured-venues";
import { ProcessSection } from "@/components/public/sections/process";
import { CTASection } from "@/components/public/sections/cta";
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
      <HeroSection />
      <SearchBarSection />
      <CategoriesSection />
      <FeaturedArtistsSection artists={featuredArtists} />
      <FeaturedVenuesSection venues={featuredVenues} />
      <ProcessSection />
      <CTASection />
    </>
  );
}
