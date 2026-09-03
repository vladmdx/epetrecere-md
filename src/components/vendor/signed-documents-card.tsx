"use client";

// The partner's own copy of what they signed.
//
// GET /api/legal/accept has always returned this and nothing ever rendered
// it. Under Law 195/2024 / GDPR the forensic record we keep about a signer —
// their IP, the device string, the signature image, the hash of the text they
// were shown — is their personal data, so they get to see all of it, not just
// a "you accepted the terms" line.
//
// Used by both vendor settings surfaces: /dashboard/setari (artist) and
// /dashboard/sala/setari (venue).

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileSignature, Loader2 } from "lucide-react";
import { useLocale } from "@/hooks/use-locale";

interface Acceptance {
  /** Frozen copy of what was signed, when the acceptance carries one. */
  documentBlocks?: { type: string; text: string }[] | null;
  documentTitleStored?: string | null;
  id: number;
  subjectType: string;
  documentSlug: string;
  documentTitle: string;
  documentVersion: string;
  packVersion: string;
  locale: string;
  signatureName: string;
  signatureImage: string | null;
  representativeRole: string | null;
  acceptedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  email: string | null;
  phone: string | null;
  contentHash: string | null;
}

export function SignedDocumentsCard() {
  const { t, locale } = useLocale();
  const [openDoc, setOpenDoc] = useState<number | null>(null);
  const [items, setItems] = useState<Acceptance[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/legal/accept", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setItems(Array.isArray(data?.items) ? data.items : []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A pack is accepted in one action, so group by the minute it was signed —
  // the same grouping the admin panel uses.
  const groups = new Map<string, Acceptance[]>();
  for (const it of items ?? []) {
    const key = `${it.subjectType}|${it.packVersion}|${it.signatureName}|${it.acceptedAt}`;
    const arr = groups.get(key);
    if (arr) arr.push(it);
    else groups.set(key, [it]);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSignature className="h-4 w-4 text-gold" />
          {t("vendor.signedDocs.title")}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          {t("vendor.signedDocs.subtitle")}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("common.loading")}
          </div>
        ) : groups.size === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("vendor.signedDocs.empty")}
          </p>
        ) : (
          [...groups.values()].map((group) => {
            const g = group[0]!;
            return (
              <div
                key={g.id}
                className="rounded-lg border border-border/50 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <strong>{g.signatureName}</strong>
                      {g.representativeRole ? ` (${g.representativeRole})` : ""}
                      {" · "}
                      {new Date(g.acceptedAt).toLocaleString("ro-RO")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("vendor.signedDocs.pack", { v: g.packVersion })} ·{" "}
                      {g.locale.toUpperCase()}
                    </p>

                    <ul className="mt-3 space-y-2">
                      {group.map((d) => (
                        <li key={d.id} className="text-xs">
                          {/*
                            Opens the copy stored with the signature, not
                            /legal/<slug>. That link pointed at whatever the
                            pack says today: the moment a document is
                            superseded — as the partner agreement just was —
                            it stops being what this person signed.
                          */}
                          {d.documentBlocks?.length ? (
                            <button
                              type="button"
                              onClick={() =>
                                setOpenDoc(openDoc === d.id ? null : d.id)
                              }
                              className="text-gold hover:underline"
                            >
                              {d.documentTitleStored ?? d.documentTitle}
                            </button>
                          ) : (
                            <a
                              href={`/legal/${d.documentSlug}`}
                              target="_blank"
                              rel="noreferrer"
                              className="text-gold hover:underline"
                              title="Semnat înainte ca textul să fie păstrat pe acceptare — se deschide versiunea publicată."
                            >
                              {d.documentTitle}
                            </a>
                          )}{" "}
                          <span className="text-muted-foreground">
                            v{d.documentVersion}
                          </span>
                          {d.documentBlocks?.length ? <a href={`/api/legal/accept/${d.id}/copy`} className="ml-3 text-gold underline">
                            {locale === "ru" ? "Скачать договор" : locale === "en" ? "Download contract" : "Descarcă contractul"}
                          </a> : null}
                          <span className="block break-all font-mono text-[11px] text-muted-foreground/70">
                            {t("vendor.signedDocs.hash")}: {d.contentHash ?? "—"}
                          </span>
                          {openDoc === d.id && d.documentBlocks?.length ? (
                            <div className="mt-2 max-h-96 space-y-1.5 overflow-y-auto rounded-lg border border-border bg-background/60 p-3">
                              {d.documentBlocks.map((b, bi) =>
                                b.type === "h2" ? (
                                  <p
                                    key={bi}
                                    className="pt-2 font-heading text-[12px] font-bold"
                                  >
                                    {b.text}
                                  </p>
                                ) : (
                                  <p
                                    key={bi}
                                    className="text-[11.5px] leading-relaxed text-muted-foreground"
                                  >
                                    {b.text}
                                  </p>
                                ),
                              )}
                              <div className="mt-3 border-t border-border pt-2">
                                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                  Semnat de
                                </p>
                                <p className="text-[12px] font-semibold">
                                  {g.signatureName}
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  {new Date(g.acceptedAt).toLocaleDateString(
                                    "ro-RO",
                                    { day: "numeric", month: "long", year: "numeric" },
                                  )}
                                </p>
                                {g.signatureImage && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={g.signatureImage}
                                    alt="Semnătura"
                                    className="mt-1 h-14 rounded bg-white p-1"
                                  />
                                )}
                              </div>
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {g.signatureImage && (
                    <div className="shrink-0">
                      <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
                        {t("vendor.signedDocs.signature")}
                      </p>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={g.signatureImage}
                        alt={t("vendor.signedDocs.signature")}
                        className="h-20 w-48 rounded-lg border border-border bg-white object-contain"
                      />
                      <a
                        href={g.signatureImage}
                        download="semnatura.png"
                        className="mt-1 block text-center text-xs text-gold hover:underline"
                      >
                        {t("vendor.signedDocs.download")}
                      </a>
                    </div>
                  )}
                </div>

                {/* The record kept about the signer — shown to the signer. */}
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    {t("vendor.signedDocs.technical")}
                  </summary>
                  <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <div className="flex gap-2">
                      <dt className="shrink-0">{t("vendor.signedDocs.ip")}</dt>
                      <dd className="font-mono text-foreground/80">
                        {g.ipAddress ?? "—"}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="shrink-0">{t("vendor.signedDocs.device")}</dt>
                      <dd className="break-all font-mono text-foreground/80">
                        {g.userAgent ?? "—"}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="shrink-0">{t("vendor.signedDocs.contact")}</dt>
                      <dd className="break-all text-foreground/80">
                        {g.email ?? "—"}
                        {g.phone ? ` · ${g.phone}` : ""}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    {t("vendor.signedDocs.retention")}
                  </p>
                </details>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
