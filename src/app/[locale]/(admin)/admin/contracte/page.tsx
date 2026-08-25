// Admin view of every signed contract: who signed, which documents and
// versions, the technical fixation (Anexa 2) and the handwritten signature.
//
// Read-only on purpose — legal_acceptances is append-only in the database, so
// there is nothing here to edit.

import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/admin";
import { db } from "@/lib/db";
import { legalAcceptances, users, artists, venues } from "@/lib/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getLegalDocument } from "@/lib/legal";
import { t } from "@/i18n";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/routing";
import { ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function AdminContractsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  const locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  const admin = await requireAdmin();
  if (!admin.ok) redirect("/");

  const rows = await db
    .select({
      id: legalAcceptances.id,
      subjectType: legalAcceptances.subjectType,
      documentSlug: legalAcceptances.documentSlug,
      documentVersion: legalAcceptances.documentVersion,
      packVersion: legalAcceptances.packVersion,
      locale: legalAcceptances.locale,
      signatureName: legalAcceptances.signatureName,
      signatureImage: legalAcceptances.signatureImage,
      acceptedAt: legalAcceptances.acceptedAt,
      ipAddress: legalAcceptances.ipAddress,
      userAgent: legalAcceptances.userAgent,
      email: legalAcceptances.email,
      phone: legalAcceptances.phone,
      contentHash: legalAcceptances.contentHash,
      userEmail: users.email,
      artistName: artists.nameRo,
      venueName: venues.nameRo,
    })
    .from(legalAcceptances)
    .leftJoin(users, eq(users.id, legalAcceptances.userId))
    .leftJoin(artists, eq(artists.id, legalAcceptances.artistId))
    .leftJoin(venues, eq(venues.id, legalAcceptances.venueId))
    .orderBy(desc(legalAcceptances.acceptedAt))
    .limit(500);

  // One card per signer+session rather than per document, since a vendor
  // accepts the whole pack in one action.
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.signatureName}|${r.userEmail}|${new Date(r.acceptedAt).toISOString().slice(0, 16)}`;
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else groups.set(key, [r]);
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">{t("adminUi.contracts.title", locale)}</h1>
        <p className="text-sm text-muted-foreground">
          {t("adminUi.contracts.subtitle", locale)}
        </p>
      </div>

      {groups.size === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {t("adminUi.contracts.empty", locale)}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {[...groups.values()].map((group) => {
            const g = group[0]!;
            const who = g.artistName ?? g.venueName ?? g.userEmail ?? "—";
            return (
              <Card key={g.id}>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-gold" />
                        <p className="font-semibold">{who}</p>
                        <Badge variant="outline">
                          {g.subjectType === "venue"
                            ? t("adminUi.contracts.subjectVenue", locale)
                            : t("adminUi.contracts.subjectArtist", locale)}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("adminUi.contracts.signedBy", locale)}{" "}
                        <strong>{g.signatureName}</strong> ·{" "}
                        {new Date(g.acceptedAt).toLocaleString("ro-RO")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {g.email ?? "—"}
                        {g.phone ? ` · ${g.phone}` : ""} ·{" "}
                        {t("adminUi.contracts.packVersion", locale, { v: g.packVersion })} ·{" "}
                        {t("adminUi.contracts.language", locale, { lang: g.locale.toUpperCase() })}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        IP {g.ipAddress ?? "—"} ·{" "}
                        <span title={g.userAgent ?? ""}>
                          {(g.userAgent ?? "—").slice(0, 48)}
                          {(g.userAgent?.length ?? 0) > 48 ? "…" : ""}
                        </span>
                      </p>

                      <ul className="mt-3 flex flex-wrap gap-2">
                        {group.map((d) => {
                          const doc = getLegalDocument(d.documentSlug);
                          return (
                            <li key={d.id}>
                              <a
                                href={`/legal/${d.documentSlug}`}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-full border border-border/60 px-2.5 py-1 text-xs hover:border-gold/50 hover:text-gold"
                              >
                                {doc?.title.ro ?? d.documentSlug} v{d.documentVersion}
                              </a>
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    {g.signatureImage ? (
                      <div className="shrink-0">
                        <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                          {t("adminUi.contracts.signature", locale)}
                        </p>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={g.signatureImage}
                          alt={t("adminUi.contracts.signatureAlt", locale, { name: g.signatureName })}
                          className="h-24 w-56 rounded-lg border border-border bg-white object-contain"
                        />
                        <a
                          href={g.signatureImage}
                          download={`semnatura-${g.signatureName.replace(/\s+/g, "-")}.png`}
                          className="mt-1 block text-center text-xs text-gold hover:underline"
                        >
                          {t("adminUi.contracts.download", locale)}
                        </a>
                      </div>
                    ) : (
                      <p className="shrink-0 text-xs italic text-muted-foreground">
                        {t("adminUi.contracts.noSignature", locale)}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
