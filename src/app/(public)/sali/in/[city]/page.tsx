import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { getVenues } from "@/lib/db/queries/venues";
import { generateMeta } from "@/lib/seo/generate-meta";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { getCityBySlug, CITIES } from "@/lib/seo/cities";
import { VenueCard } from "@/components/public/venue-card";

// M2 — SEO landing page for venues in a specific Moldovan city.
// URL: /sali/in/[city]   e.g. /sali/in/chisinau

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md";

interface Props {
  params: Promise<{ city: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { city: citySlug } = await params;
  const city = getCityBySlug(citySlug);
  if (!city) return {};

  const { total } = await getVenues({ cityKeywords: city.keywords, limit: 1 });

  return generateMeta({
    title: `Săli și restaurante pentru nuntă în ${city.nameRo} — ${total} locații | ePetrecere.md`,
    description: `Descoperă ${total} săli și restaurante pentru nuntă, botez, cumătrie și evenimente corporate în ${city.nameRo}. Capacitate, preț pe persoană, galerie foto, rezervare online.`,
    path: `/sali/in/${citySlug}`,
  });
}

export async function generateStaticParams() {
  return CITIES.map((c) => ({ city: c.slug }));
}

export default async function VenuesByCityPage({ params, searchParams }: Props) {
  const { city: citySlug } = await params;
  const city = getCityBySlug(citySlug);
  if (!city) notFound();

  const sp = await searchParams;
  const page = sp.page ? Number(sp.page) : 1;

  const { items, total, totalPages } = await getVenues({
    cityKeywords: city.keywords,
    sort: (sp.sort as "popular" | "price_asc" | "price_desc" | "rating" | "capacity") || "popular",
    page,
    limit: 24,
  });

  // M0a #8 — redact pricePerPerson for anonymous visitors.
  const { userId } = await auth();
  const safeVenues = userId
    ? items
    : items.map((v) => ({ ...v, pricePerPerson: null }));

  const breadcrumbs = [
    { name: "Acasă", url: "/" },
    { name: "Săli", url: "/sali" },
    { name: city.nameRo, url: `/sali/in/${citySlug}` },
  ];

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `Săli pentru evenimente în ${city.nameRo}`,
    numberOfItems: total,
    itemListElement: safeVenues.slice(0, 10).map((v, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: `${BASE_URL}/sali/${v.slug}`,
      name: v.nameRo,
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
          <Link href="/" className="hover:text-gold">Acasă</Link>
          <span className="mx-2">/</span>
          <Link href="/sali" className="hover:text-gold">Săli</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{city.nameRo}</span>
        </nav>

        <header className="mb-8">
          <h1 className="font-heading text-3xl font-bold md:text-4xl">
            Săli și restaurante pentru evenimente în {city.nameRo}
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground md:text-base">
            {total > 0
              ? `${total} săli și restaurante disponibile în ${city.nameRo} pentru nuntă, botez, cumătrie sau eveniment corporate. Verifică disponibilitatea, capacitatea și prețul pe persoană direct pe pagina fiecărei locații.`
              : `Nu avem săli listate în ${city.nameRo} momentan. Contactează-ne pentru recomandări.`}
          </p>
        </header>

        {safeVenues.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/40 bg-card py-16 text-center">
            <p className="text-muted-foreground">
              Nicio sală disponibilă în {city.nameRo} momentan.
            </p>
            <Link href="/sali" className="mt-4 inline-block text-sm text-gold hover:underline">
              Vezi toate sălile →
            </Link>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {safeVenues.map((v) => (
              <VenueCard key={v.id} venue={v} />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-10 flex items-center justify-center gap-2">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <a
                key={p}
                href={`/sali/in/${citySlug}?page=${p}`}
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
