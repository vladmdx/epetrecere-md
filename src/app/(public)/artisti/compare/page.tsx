import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists } from "@/lib/db/schema";
import { Star, MapPin, ArrowLeft, X, Check } from "lucide-react";
import { generateMeta } from "@/lib/seo/generate-meta";
import { ClearCompareButton } from "./clear-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = generateMeta({
  title: "Compară artiști",
  description:
    "Compară până la 3 artiști side-by-side — preț, rating, locație, facilități — pentru a alege cel mai bun pentru evenimentul tău.",
  path: "/artisti/compare",
});

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
  const ordered = ids
    .map((id) => rows.find((r) => r.id === id))
    .filter((r): r is (typeof rows)[number] => !!r);

  // Rows of the comparison table
  const rowDefs: Array<{
    label: string;
    render: (a: (typeof rows)[number]) => React.ReactNode;
  }> = [
    {
      label: "Preț de la",
      render: (a) =>
        a.priceFrom
          ? `${a.priceFrom} ${a.priceCurrency ?? "EUR"}`
          : "—",
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
          "—"
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
          "—"
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
          "—"
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

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th className="w-32 border-b border-border/40 p-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                &nbsp;
              </th>
              {ordered.map((a) => (
                <th
                  key={a.id}
                  className="border-b border-border/40 p-3 text-left"
                >
                  <Link href={`/artisti/${a.slug}`} className="block group">
                    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-muted">
                      {a.photoUrl ? (
                        <Image
                          src={a.photoUrl}
                          alt={a.nameRo}
                          fill
                          sizes="(max-width: 640px) 100vw, 33vw"
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
              <tr key={r.label} className="border-b border-border/20">
                <td className="p-3 align-top text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {r.label}
                </td>
                {ordered.map((a) => (
                  <td key={a.id} className="p-3 align-top text-sm">
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
