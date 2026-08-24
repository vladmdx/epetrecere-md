import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/shared/locale-link";
import Image from "next/image";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists } from "@/lib/db/schema";
import { fetchArtistCovers } from "@/lib/db/queries/artists";
import { resolveArtistCoverImage } from "@/lib/artists/demo-images";
import { Star, MapPin, ArrowLeft, X, Check } from "lucide-react";
import { generateMetaAsync } from "@/lib/seo/generate-meta";
import { getServerLocale } from "@/lib/i18n/server-locale";
import { ClearCompareButton } from "./clear-button";
import { NotSpecified } from "@/components/public/not-specified";
import { formatPrice } from "@/lib/format/price";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  const meta = {
    ro: {
      title: "Compară artiști",
      description:
        "Compară până la 3 artiști side-by-side — preț, rating, locație, facilități — pentru a alege cel mai bun pentru evenimentul tău.",
    },
    ru: {
      title: "Сравнение артистов",
      description:
        "Сравните до трёх артистов рядом — цена, рейтинг, город, что входит в услугу — и выберите лучшего для вашего события.",
    },
    en: {
      title: "Compare Artists",
      description:
        "Compare up to three artists side by side — price, rating, location, what is included — and pick the best one for your event.",
    },
  }[locale];
  return generateMetaAsync({
    title: meta.title,
    description: meta.description,
    path: "/artisti/compare",
    locale,
  });
}

interface Props {
  searchParams: Promise<{ ids?: string }>;
}

export default async function ArtistCompareePage({ searchParams }: Props) {
  const sp = await searchParams;
  const ids = (sp.ids || "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, 3);

  if (ids.length < 2) {
    // Redirect-like render — show empty state with CTA
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center lg:px-8">
        <h1 className="font-heading text-2xl font-bold">
          Compară artiști
        </h1>
        <p className="mt-2 text-muted-foreground">
          Alege 2 sau 3 artiști de pe pagina{" "}
          <Link href="/artisti" className="text-gold hover:underline">
            Artiști
          </Link>{" "}
          cu butonul „Compară” pentru a-i vedea side-by-side aici.
        </p>
      </div>
    );
  }

  const rows = await db
    .select({
      id: artists.id,
      slug: artists.slug,
      nameRo: artists.nameRo,
      nameRu: artists.nameRu,
      nameEn: artists.nameEn,
      descriptionRo: artists.descriptionRo,
      location: artists.location,
      priceFrom: artists.priceFrom,
      priceCurrency: artists.priceCurrency,
      ratingAvg: artists.ratingAvg,
      ratingCount: artists.ratingCount,
      photoUrl: artists.photoUrl,
      isVerified: artists.isVerified,
      isPremium: artists.isPremium,
    })
    .from(artists)
    .where(inArray(artists.id, ids));

  if (rows.length === 0) notFound();

  // Preserve the user's chosen order
  const covers = await fetchArtistCovers(rows.map((r) => r.id));
  const ordered = ids
    .map((id) => rows.find((r) => r.id === id))
    .filter((r): r is (typeof rows)[number] => !!r)
    // artists.photo_url alone is not the cover — most artists only ever fill in
    // artist_images, and those compared as a bare 🎵 tile next to a real photo.
    .map((r) => ({
      ...r,
      photoUrl: resolveArtistCoverImage(r.slug, r.photoUrl, ...(covers.get(r.id) ?? [])),
    }));

  // Rows of the comparison table
  const rowDefs: Array<{
    label: string;
    render: (a: (typeof rows)[number]) => React.ReactNode;
  }> = [
    {
      label: "Preț de la",
      render: (a) =>
        a.priceFrom
          ? formatPrice(a.priceFrom, a.priceCurrency)
          : <NotSpecified />,
    },
    {
      label: "Rating",
      render: (a) =>
        a.ratingAvg ? (
          <span className="inline-flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-gold text-gold" />
            {Number(a.ratingAvg).toFixed(1)}{" "}
            <span className="text-muted-foreground">
              ({a.ratingCount ?? 0})
            </span>
          </span>
        ) : (
          <NotSpecified />
        ),
    },
    {
      label: "Locație",
      render: (a) =>
        a.location ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            {a.location}
          </span>
        ) : (
          <NotSpecified />
        ),
    },
    {
      label: "Verificat",
      render: (a) =>
        a.isVerified ? (
          <Check className="h-4 w-4 text-emerald-500" />
        ) : (
          <X className="h-4 w-4 text-muted-foreground/50" />
        ),
    },
    {
      label: "Premium",
      render: (a) =>
        a.isPremium ? (
          <Check className="h-4 w-4 text-gold" />
        ) : (
          <X className="h-4 w-4 text-muted-foreground/50" />
        ),
    },
    {
      label: "Descriere",
      render: (a) =>
        a.descriptionRo ? (
          <p className="line-clamp-6 text-xs text-muted-foreground">
            {a.descriptionRo.replace(/<[^>]+>/g, "").slice(0, 400)}
          </p>
        ) : (
          <NotSpecified />
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/artisti"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gold"
          >
            <ArrowLeft className="h-3 w-3" /> Înapoi la artiști
          </Link>
          <h1 className="mt-2 font-heading text-2xl font-bold">
            Comparație — {ordered.length} artiști
          </h1>
        </div>
        <ClearCompareButton />
      </div>

      {/* Automatic table layout sized every column from its own content, so the
          artist with a 400-character description swallowed the table and the
          others collapsed — and since the header cells fall back to baseline
          alignment, their cards were pushed hundreds of pixels down to match.
          table-fixed + a colgroup make the columns equal, which also makes the
          card images equal height. The min width grows with the number of
          artists instead of being a constant 640px. */}
      <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <table
          className="w-full table-fixed border-separate border-spacing-0"
          style={{ minWidth: `calc(10rem + ${ordered.length} * 15rem)` }}
        >
          <colgroup>
            <col className="w-40" />
            {ordered.map((a) => (
              <col key={a.id} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 z-20 w-40 border-b border-border/40 bg-background p-3 text-left align-top text-xs font-semibold uppercase tracking-wider text-muted-foreground shadow-[1px_0_0_0_var(--border)]">
                &nbsp;
              </th>
              {ordered.map((a) => (
                <th
                  key={a.id}
                  className="border-b border-border/40 p-3 text-left align-top"
                >
                  <Link href={`/artisti/${a.slug}`} className="block group">
                    <div className="relative h-56 w-full overflow-hidden rounded-xl bg-muted">
                      {a.photoUrl ? (
                        <Image
                          src={a.photoUrl}
                          alt={a.nameRo}
                          fill
                          sizes="240px"
                          className="object-cover transition-transform group-hover:scale-105"
                          unoptimized={
                            a.photoUrl.includes("r2.cloudflarestorage.com") ??
                            false
                          }
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-4xl text-muted-foreground">
                          🎵
                        </div>
                      )}
                    </div>
                    <p className="mt-3 font-heading text-lg font-bold group-hover:text-gold">
                      {a.nameRo}
                    </p>
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowDefs.map((r) => (
              <tr key={r.label}>
                <td className="sticky left-0 z-10 w-40 border-b border-border/20 bg-background p-3 align-top text-xs font-semibold uppercase tracking-wider text-muted-foreground shadow-[1px_0_0_0_var(--border)]">
                  {r.label}
                </td>
                {ordered.map((a) => (
                  <td key={a.id} className="border-b border-border/20 p-3 align-top text-sm">
                    {r.render(a)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
