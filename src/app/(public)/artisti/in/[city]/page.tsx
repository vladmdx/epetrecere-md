import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { getArtists } from "@/lib/db/queries/artists";
import { generateMeta } from "@/lib/seo/generate-meta";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { getCityBySlug } from "@/lib/seo/cities";
import { ArtistCard } from "@/components/public/artist-card";

// M2 — SEO landing page for all artists in a given Moldovan city.
// URL: /artisti/in/[city]   e.g. /artisti/in/chisinau

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md";

interface Props {
  params: Promise<{ city: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city: citySlug } = await params;
  const city = getCityBySlug(citySlug);
  if (!city) return {};

  // Run a lightweight count query so the title reflects the real number of
  // active artists — this is the core long-tail SEO signal.
  const { total } = await getArtists({
    cityKeywords: city.keywords,
    limit: 1,
  });

  return generateMeta({
    title: `Artiști pentru evenimente în ${city.nameRo} — ${total} profesioniști | ePetrecere.md`,
    description: `Descoperă ${total} artiști și trupe pentru nuntă, botez, cumătrie și evenimente corporate în ${city.nameRo}. Rezervă online pe ePetrecere.md.`,
    path: `/artisti/in/${citySlug}`,
  });
}

export async function generateStaticParams() {
  // Pre-render city landing pages at build time.
  const { CITIES } = await import("@/lib/seo/cities");
  return CITIES.map((c) => ({ city: c.slug }));
}

export default async function ArtistsByCityPage({ params, searchParams }: Props) {
  const { city: citySlug } = await params;
  const city = getCityBySlug(citySlug);
  if (!city) notFound();

  const sp = await searchParams;
  const page = sp.page ? Number(sp.page) : 1;

  const { items: artistsList, total, totalPages } = await getArtists({
    cityKeywords: city.keywords,
    sort: (sp.sort as "popular" | "price_asc" | "price_desc" | "rating" | "newest") || "popular",
    page,
    limit: 24,
  });

  // M0a #8 — Price redaction at the SSR layer: anonymous visitors don't get
  // `priceFrom` in the initial HTML so screen scrapers can't bypass the
  // client-side Lock pill.
  const { userId } = await auth();
  const safeArtists = userId
    ? artistsList
    : artistsList.map((a) => ({ ...a, priceFrom: null, phone: null, email: null, instagram: null }));

  const breadcrumbs = [
    { name: "Acasă", url: "/" },
    { name: "Artiști", url: "/artisti" },
    { name: city.nameRo, url: `/artisti/in/${citySlug}` },
  ];

  // ItemList JSON-LD helps Google surface rich results for the listing.
  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Artiști în ${city.nameRo}`,
    numberOfItems: total,
    itemListElement: safeArtists.slice(0, 10).map((a, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${BASE_URL}/artisti/${a.slug}`,
      name: a.nameRo,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(breadcrumbs)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemList) }}
      />

      <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <nav className="mb-4 text-xs text-muted-foreground">
          <a href="/" className="hover:text-gold">Acasă</a>
          <span className="mx-2">/</span>
          <a href="/artisti" className="hover:text-gold">Artiști</a>
          <span className="mx-2">/</span>
          <span className="text-foreground">{city.nameRo}</span>
        </nav>

        <header className="mb-8">
          <h1 className="font-heading text-3xl font-bold md:text-4xl">
            Artiști pentru evenimente în {city.nameRo}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
            {total > 0
              ? `${total} artiști și trupe profesioniste disponibile în ${city.nameRo} pentru nuntă, botez, cumătrie, aniversare și evenimente corporate. Compară prețuri, citește recenzii și rezervă direct online.`
              : `Momentan nu avem artiști listați în ${city.nameRo}. Explorează lista completă de artiști sau contactează-ne pentru recomandări personalizate.`}
          </p>
        </header>

        {safeArtists.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/40 bg-card py-16 text-center">
            <p className="text-muted-foreground">
              Niciun artist disponibil în {city.nameRo} momentan.
            </p>
            <a
              href="/artisti"
              className="mt-4 inline-block text-sm text-gold hover:underline"
            >
              Vezi toți artiștii →
            </a>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {safeArtists.map((a) => (
              <ArtistCard key={a.id} artist={a} />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <a
                key={p}
                href={`/artisti/in/${citySlug}?page=${p}`}
                className={`rounded-md border px-3 py-1.5 text-sm ${p === page ? "border-gold bg-gold text-background" : "border-border/40 hover:border-gold/40"}`}
              >
                {p}
              </a>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
