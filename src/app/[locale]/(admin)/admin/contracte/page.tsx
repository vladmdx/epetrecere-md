// Admin view of every signed contract: who signed, which documents and
// versions, the full technical fixation (Anexa 2) and the handwritten
// signature.
//
// Read-only on purpose — legal_acceptances is append-only in the database
// (trigger from migrations/manual/0017_legal_acceptances_evidence.sql), so
// there is nothing here to edit.

import { redirect } from "next/navigation";
import { desc, eq, inArray } from "drizzle-orm";
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
      userId: legalAcceptances.userId,
      artistId: legalAcceptances.artistId,
      venueId: legalAcceptances.venueId,
      subjectType: legalAcceptances.subjectType,
      documentSlug: legalAcceptances.documentSlug,
      documentVersion: legalAcceptances.documentVersion,
      packVersion: legalAcceptances.packVersion,
      locale: legalAcceptances.locale,
      signatureName: legalAcceptances.signatureName,
      signatureImage: legalAcceptances.signatureImage,
      representativeRole: legalAcceptances.representativeRole,
      partnerType: legalAcceptances.partnerType,
      legalName: legalAcceptances.legalName,
      idNumber: legalAcceptances.idNumber,
      legalAddress: legalAcceptances.legalAddress,
      representativeName: legalAcceptances.representativeName,
      acceptedAt: legalAcceptances.acceptedAt,
      ipAddress: legalAcceptances.ipAddress,
      userAgent: legalAcceptances.userAgent,
      email: legalAcceptances.email,
      phone: legalAcceptances.phone,
      contentHash: legalAcceptances.contentHash,
      documentTitleStored: legalAcceptances.documentTitle,
      documentBlocks: legalAcceptances.documentBlocks,
      deviceSummary: legalAcceptances.deviceSummary,
      userEmail: users.email,
      userName: users.name,
    })
    .from(legalAcceptances)
    .leftJoin(users, eq(users.id, legalAcceptances.userId))
    .orderBy(desc(legalAcceptances.acceptedAt))
    .limit(500);

  // Naming the partner takes two paths, because signing happens BEFORE the
  // vendor profile exists: newer rows carry artist_id / venue_id (backfilled
  // by the registration routes), older ones only have the user. Resolving
  // through user_id as well is what stops this page from printing a raw
  // e-mail where a name belongs.
  const artistIds = [...new Set(rows.map((r) => r.artistId).filter((x): x is number => x != null))];
  const venueIds = [...new Set(rows.map((r) => r.venueId).filter((x): x is number => x != null))];
  const userIds = [...new Set(rows.map((r) => r.userId).filter((x): x is string => x != null))];

  const artistRows = userIds.length
    ? await db
        .select({ id: artists.id, userId: artists.userId, name: artists.nameRo })
        .from(artists)
        .where(inArray(artists.userId, userIds))
    : [];
  const venueRows = userIds.length
    ? await db
        .select({ id: venues.id, userId: venues.userId, name: venues.nameRo })
        .from(venues)
        .where(inArray(venues.userId, userIds))
    : [];
  // Profiles linked by id but owned by a since-deleted account.
  const orphanArtistIds = artistIds.filter((id) => !artistRows.some((a) => a.id === id));
  const orphanVenueIds = venueIds.filter((id) => !venueRows.some((v) => v.id === id));
  const extraArtists = orphanArtistIds.length
    ? await db
        .select({ id: artists.id, userId: artists.userId, name: artists.nameRo })
        .from(artists)
        .where(inArray(artists.id, orphanArtistIds))
    : [];
  const extraVenues = orphanVenueIds.length
    ? await db
        .select({ id: venues.id, userId: venues.userId, name: venues.nameRo })
        .from(venues)
        .where(inArray(venues.id, orphanVenueIds))
    : [];

  const artistById = new Map<number, string>(
    [...artistRows, ...extraArtists].map((a): [number, string] => [a.id, a.name]),
  );
  const venueById = new Map<number, string>(
    [...venueRows, ...extraVenues].map((v): [number, string] => [v.id, v.name]),
  );
  const artistByUser = new Map<string, string>(
    artistRows.flatMap((a): [string, string][] => (a.userId ? [[a.userId, a.name]] : [])),
  );
  const venueByUser = new Map<string, string>(
    venueRows.flatMap((v): [string, string][] => (v.userId ? [[v.userId, v.name]] : [])),
  );

  // One card per signer+session rather than per document, since a vendor
  // accepts the whole pack in one action.
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.userId ?? r.email ?? "?"}|${r.subjectType}|${r.packVersion}|${r.signatureName}|${new Date(r.acceptedAt).toISOString()}`;
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
            const who =
              (g.artistId != null ? artistById.get(g.artistId) : null) ??
              (g.venueId != null ? venueById.get(g.venueId) : null) ??
              (g.userId
                ? g.subjectType === "venue"
                  ? venueByUser.get(g.userId)
                  : artistByUser.get(g.userId)
                : null) ??
              g.userName ??
              g.userEmail ??
              g.email ??
              "—";
            return (
              <Card key={g.id}>
                <CardContent className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <ShieldCheck className="h-4 w-4 text-gold" />
                        <p className="font-semibold">{who}</p>
                        <Badge variant="outline">
                          {g.subjectType === "venue"
                            ? t("adminUi.contracts.subjectVenue", locale)
                            : t("adminUi.contracts.subjectArtist", locale)}
                        </Badge>
                        {!g.userId && (
                          <Badge variant="outline" className="border-amber-500/40 text-amber-500">
                            {t("adminUi.contracts.accountDeleted", locale)}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {t("adminUi.contracts.signedBy", locale)}{" "}
                        <strong>{g.signatureName}</strong>
                        {g.representativeRole ? ` (${g.representativeRole})` : ""} ·{" "}
                        {new Date(g.acceptedAt).toLocaleString("ro-RO")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {g.email ?? "—"}
                        {g.phone ? ` · ${g.phone}` : ""} ·{" "}
                        {t("adminUi.contracts.packVersion", locale, { v: g.packVersion })} ·{" "}
                        {t("adminUi.contracts.language", locale, { lang: g.locale.toUpperCase() })}
                      </p>

                      <p className="mt-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {t("adminUi.contracts.documents", locale)}
                      </p>
                      <ul className="mt-1 space-y-2">
                        {group.map((d) => {
                          const doc = getLegalDocument(d.documentSlug);
                          return (
                            <li key={d.id} className="text-xs">
                              <a
                                href={`/api/legal/accept/${d.id}/copy`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-gold hover:underline"
                              >
                                {doc?.title.ro ?? d.documentSlug}
                              </a>{" "}
                              <span className="text-muted-foreground">v{d.documentVersion}</span>
                              <span className="block break-all font-mono text-[11px] text-muted-foreground/70">
                                {t("adminUi.contracts.contentHash", locale)}:{" "}
                                {d.contentHash ?? "—"}
                              </span>
                              {/*
                                The document as signed, frozen on the row.
                                The link above points at whatever the pack
                                says today — which, once a document is
                                superseded, is not what this person agreed to.
                                Collapsed by default: a contract is long and
                                an administrator is usually scanning a list.
                              */}
                              {d.documentBlocks?.length ? (
                                <details className="mt-1">
                                  <summary className="cursor-pointer text-[11px] text-gold">
                                    Textul semnat ({d.documentBlocks.length} blocuri)
                                  </summary>
                                  <div className="mt-2 max-h-[28rem] space-y-1.5 overflow-y-auto rounded-lg border border-border bg-background/60 p-3">
                                    {d.documentBlocks.map((b, bi) =>
                                      b.type === "h2" ? (
                                        <p key={bi} className="pt-2 font-heading text-[12px] font-bold">
                                          {b.text}
                                        </p>
                                      ) : (
                                        <p key={bi} className="text-[11.5px] leading-relaxed text-muted-foreground">
                                          {b.text}
                                        </p>
                                      ),
                                    )}
                                  </div>
                                </details>
                              ) : (
                                <span className="block text-[11px] text-muted-foreground/70">
                                  Semnat înainte ca textul să fie păstrat pe acceptare.
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>

                      {/* The other party, as it appears in the contract's
                          Annex 5. Frozen with the signature, so this is what
                          was on screen when they signed — not whatever the
                          profile says today. */}
                      {g.legalName && (
                        <div className="mt-3 rounded-lg border border-gold/25 bg-gold/[0.04] p-3">
                          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                            {t("adminUi.contracts.partnerDetails", locale)}
                          </p>
                          <dl className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                            {(
                              [
                                [
                                  t("adminUi.contracts.partnerType", locale),
                                  g.partnerType
                                    ? t(
                                        `adminUi.contracts.partnerType_${g.partnerType}`,
                                        locale,
                                      )
                                    : null,
                                ],
                                [
                                  t("adminUi.contracts.legalName", locale),
                                  g.legalName,
                                ],
                                [
                                  t("adminUi.contracts.idNumber", locale),
                                  g.idNumber,
                                ],
                                [
                                  t("adminUi.contracts.legalAddress", locale),
                                  g.legalAddress,
                                ],
                                [
                                  t("adminUi.contracts.representative", locale),
                                  g.representativeName,
                                ],
                              ] as Array<[string, string | null]>
                            )
                              .filter(([, v]) => !!v)
                              .map(([k, v]) => (
                                <div key={k} className="flex gap-2">
                                  <dt className="shrink-0">{k}</dt>
                                  <dd className="text-foreground/80">{v}</dd>
                                </div>
                              ))}
                          </dl>
                        </div>
                      )}

                      <div className="mt-3 rounded-lg border border-border/50 bg-muted/30 p-3">
                        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          {t("adminUi.contracts.technical", locale)}
                        </p>
                        <dl className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                          <div className="flex gap-2">
                            <dt className="shrink-0">IP</dt>
                            <dd className="font-mono text-foreground/80">{g.ipAddress ?? "—"}</dd>
                          </div>
                          <div className="flex gap-2">
                            <dt className="shrink-0">
                              {t("adminUi.contracts.device", locale)}
                            </dt>
                            <dd className="text-foreground/80">
                              {/* The readable summary is the answer; the raw
                                  string stays underneath because it is the
                                  actual evidence and the summary is derived. */}
                              {g.deviceSummary ?? "—"}
                              {g.userAgent && (
                                <span className="mt-1 block break-all font-mono text-[10.5px] text-muted-foreground/70">
                                  {g.userAgent}
                                </span>
                              )}
                            </dd>
                          </div>
                        </dl>
                      </div>
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
