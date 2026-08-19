import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "@/components/shared/locale-link";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { venues } from "@/lib/db/schema";
import { Star, MapPin, Users, ArrowLeft, X, Check } from "lucide-react";
import { generateMetaAsync } from "@/lib/seo/generate-meta";
import { ClearCompareButton } from "./clear-button";
import { NotSpecified } from "@/components/public/not-specified";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return generateMetaAsync({
  title: "Compară săli de evenimente",
  description:
    "Compară până la 3 săli side-by-side — capacitate, preț, facilități — pentru a o alege pe cea potrivită evenimentului tău.",
  path: "/sali/compare",
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

  const rows = await db
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
    .where(inArray(venues.id, ids));

  if (rows.length === 0) notFound();

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
      render: (v) => (v.pricePerPerson ? `${v.pricePerPerson}€` : <NotSpecified />),
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

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th className="w-32 border-b border-border/40 p-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                &nbsp;
              </th>
              {ordered.map((v) => (
                <th
                  key={v.id}
                  className="border-b border-border/40 p-3 text-left"
                >
                  <Link href={`/sali/${v.slug}`} className="block group">
                    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-xl bg-muted flex items-center justify-center text-muted-foreground/40">
                      <MapPin className="h-10 w-10" />
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
              ))}
            </tr>
          </thead>
          <tbody>
            {rowDefs.map((r) => (
              <tr key={r.label} className="border-b border-border/20">
                <td className="p-3 align-top text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {r.label}
                </td>
                {ordered.map((v) => (
                  <td key={v.id} className="p-3 align-top text-sm">
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
