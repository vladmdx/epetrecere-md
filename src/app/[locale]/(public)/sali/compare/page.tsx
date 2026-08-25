import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import Link from "@/components/shared/locale-link";
import { asc, desc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { venues, venueImages } from "@/lib/db/schema";
import { Star, MapPin, Users, ArrowLeft, X, Check } from "lucide-react";
import { generateMetaAsync } from "@/lib/seo/generate-meta";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { ClearCompareButton } from "./clear-button";
import { NotSpecified } from "@/components/public/not-specified";
import { formatPrice } from "@/lib/format/price";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: rawLocale } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const meta = {
    ro: {
      title: "Compară săli de evenimente",
      description:
        "Compară până la 3 săli side-by-side — capacitate, preț, facilități — pentru a o alege pe cea potrivită evenimentului tău.",
    },
    ru: {
      title: "Сравнение залов для мероприятий",
      description:
        "Сравните до трёх залов рядом — вместимость, цена, оснащение — и выберите тот, который подходит вашему событию.",
    },
    en: {
      title: "Compare Event Venues",
      description:
        "Compare up to three venues side by side — capacity, price, facilities — and choose the right one for your event.",
    },
  }[locale];
  return generateMetaAsync({
    title: meta.title,
    description: meta.description,
    path: "/sali/compare",
    locale,
  });
}

interface Props {
  searchParams: Promise<{ ids?: string }>;
}

const FACILITY_LIST = [
  "Parcare",
  "Aer condiționat",
  "Sunet profesional",
  "Proiector",
  "Ring de dans",
  "Terasa",
  "Grădină",
  "Cameră miri",
  "Wi-Fi gratuit",
];

export default async function VenueComparePage({ searchParams }: Props) {
  const sp = await searchParams;
  const ids = (sp.ids || "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, 3);

  if (ids.length < 2) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center lg:px-8">
        <h1 className="font-heading text-2xl font-bold">Compară săli</h1>
        <p className="mt-2 text-muted-foreground">
          Alege 2 sau 3 săli de pe pagina{" "}
          <Link href="/sali" className="text-gold hover:underline">
            Săli
          </Link>{" "}
          cu butonul „Compară” pentru a le vedea side-by-side aici.
        </p>
      </div>
    );
  }

  const [rows, images] = await Promise.all([
    db
      .select({
        id: venues.id,
        slug: venues.slug,
        nameRo: venues.nameRo,
        descriptionRo: venues.descriptionRo,
        city: venues.city,
        address: venues.address,
        capacityMin: venues.capacityMin,
        capacityMax: venues.capacityMax,
        pricePerPerson: venues.pricePerPerson,
        ratingAvg: venues.ratingAvg,
        ratingCount: venues.ratingCount,
        facilities: venues.facilities,
        phone: venues.phone,
        email: venues.email,
        virtualTourUrl: venues.virtualTourUrl,
        menuUrl: venues.menuUrl,
        menuPdfUrl: venues.menuPdfUrl,
      })
      .from(venues)
      .where(inArray(venues.id, ids)),
    // Photos are the fastest way to tell three halls apart, and this page used
    // to draw the same grey pin for all of them. Same ordering as the listing
    // query, so a venue shows the same cover here as on its card.
    db
      .select({ venueId: venueImages.venueId, url: venueImages.url })
      .from(venueImages)
      .where(inArray(venueImages.venueId, ids))
      .orderBy(desc(venueImages.isCover), asc(venueImages.sortOrder)),
  ]);

  if (rows.length === 0) notFound();

  const coverByVenue = new Map<number, string>();
  for (const image of images) {
    if (!coverByVenue.has(image.venueId)) coverByVenue.set(image.venueId, image.url);
  }
  const coverFor = (id: number) =>
    coverByVenue.get(id) ?? `/images/venues/hall-${(id % 6) + 1}.jpg`;

  const ordered = ids
    .map((id) => rows.find((r) => r.id === id))
    .filter((r): r is (typeof rows)[number] => !!r);

  const rowDefs: Array<{
    label: string;
    render: (v: (typeof rows)[number]) => React.ReactNode;
  }> = [
    {
      label: "Oraș",
      render: (v) =>
        v.city ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
            {v.city}
          </span>
        ) : (
          <NotSpecified />
        ),
    },
    {
      label: "Capacitate",
      render: (v) =>
        v.capacityMax ? (
          <span className="inline-flex items-center gap-1">
            <Users className="h-3.5 w-3.5 text-muted-foreground" />
            {v.capacityMin ? `${v.capacityMin}–` : ""}
            {v.capacityMax} persoane
          </span>
        ) : (
          <NotSpecified />
        ),
    },
    {
      label: "Preț / persoană",
      render: (v) => (v.pricePerPerson ? `${formatPrice(v.pricePerPerson, null, "ro")}` : <NotSpecified />),
    },
    {
      label: "Rating",
      render: (v) =>
        v.ratingAvg ? (
          <span className="inline-flex items-center gap-1">
            <Star className="h-3.5 w-3.5 fill-gold text-gold" />
            {Number(v.ratingAvg).toFixed(1)}{" "}
            <span className="text-muted-foreground">
              ({v.ratingCount ?? 0})
            </span>
          </span>
        ) : (
          <NotSpecified />
        ),
    },
    {
      label: "Tur virtual 360°",
      render: (v) =>
        v.virtualTourUrl ? (
          <Check className="h-4 w-4 text-emerald-500" />
        ) : (
          <X className="h-4 w-4 text-muted-foreground/50" />
        ),
    },
    {
      label: "Meniu disponibil",
      render: (v) =>
        v.menuUrl || v.menuPdfUrl ? (
          <Check className="h-4 w-4 text-emerald-500" />
        ) : (
          <X className="h-4 w-4 text-muted-foreground/50" />
        ),
    },
    ...FACILITY_LIST.map((fac) => ({
      label: fac,
      render: (v: (typeof rows)[number]) => {
        const list = Array.isArray(v.facilities) ? v.facilities : [];
        return list.includes(fac) ? (
          <Check className="h-4 w-4 text-emerald-500" />
        ) : (
          <X className="h-4 w-4 text-muted-foreground/40" />
        );
      },
    })),
    {
      label: "Descriere",
      render: (v) =>
        v.descriptionRo ? (
          <p className="line-clamp-6 text-xs text-muted-foreground">
            {v.descriptionRo.replace(/<[^>]+>/g, "").slice(0, 400)}
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
            href="/sali"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gold"
          >
            <ArrowLeft className="h-3 w-3" /> Înapoi la săli
          </Link>
          <h1 className="mt-2 font-heading text-2xl font-bold">
            Comparație — {ordered.length} săli
          </h1>
        </div>
        <ClearCompareButton />
      </div>

      {/* Automatic table layout sized every column from its own content, so a
          venue with a long description or a long address stole the width from
          the others and their cards — whose height came from the column width —
          ended up shorter and, on baseline-aligned header cells, pushed
          hundreds of pixels down the page. Fixed layout + a colgroup gives
          every venue exactly the same column, and the minimum grows with the
          number of venues instead of being a constant 640px. */}
      <div className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
        <table
          className="w-full table-fixed border-separate border-spacing-0"
          style={{ minWidth: `calc(10rem + ${ordered.length} * 15rem)` }}
        >
          <colgroup>
            <col className="w-40" />
            {ordered.map((v) => (
              <col key={v.id} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {/* Opaque background is load-bearing: a transparent sticky cell
                  lets the scrolled columns show through it. */}
              <th className="sticky left-0 z-20 border-b border-border/40 bg-background p-3 text-left align-top text-xs font-semibold uppercase tracking-wider text-muted-foreground shadow-[1px_0_0_0_var(--border)]">
                &nbsp;
              </th>
              {ordered.map((v) => {
                const image = coverFor(v.id);
                return (
                  <th
                    key={v.id}
                    className="border-b border-border/40 p-3 text-left align-top"
                  >
                    <Link href={`/sali/${v.slug}`} className="block group">
                      {/* Fixed height, not an aspect ratio: the card must not
                          get its height from the column width again. Below lg
                          the column is the 15rem the colgroup gives it, above
                          it stretches to about a third of max-w-7xl. */}
                      <div className="relative h-40 w-full overflow-hidden rounded-xl bg-muted">
                        <Image
                          src={image}
                          alt={v.nameRo}
                          fill
                          sizes="(max-width: 1024px) 240px, 33vw"
                          className="object-cover transition-transform group-hover:scale-105"
                          unoptimized={image.includes("r2.cloudflarestorage.com")}
                        />
                      </div>
                      <p className="mt-3 font-heading text-lg font-bold group-hover:text-gold">
                        {v.nameRo}
                      </p>
                      {v.address && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {v.address}
                        </p>
                      )}
                    </Link>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {/* border-separate is what makes the sticky column work in Safari,
                and it stops rendering borders declared on <tr>, so the row rule
                lives on the cells. */}
            {rowDefs.map((r) => (
              <tr key={r.label}>
                <td className="sticky left-0 z-10 border-b border-border/20 bg-background p-3 align-top text-xs font-semibold uppercase tracking-wider text-muted-foreground shadow-[1px_0_0_0_var(--border)]">
                  {r.label}
                </td>
                {ordered.map((v) => (
                  <td key={v.id} className="border-b border-border/20 p-3 align-top text-sm">
                    {r.render(v)}
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
