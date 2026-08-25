"use client";

// Admin duplicates inspector — surfaces groups of artists or venues that
// the heuristics in /api/admin/duplicates flagged as likely dupes.
//
// Each card lists the matching rows with reasons (same name, same phone,
// same city + near name). Admin can click each row to open its edit page
// and decide manually whether to merge / deactivate.
//
// We intentionally don't do auto-merge — names collide for legitimate
// reasons (franchise chains, same musician playing multiple genres).

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  AlertTriangle,
  ExternalLink,
  Users,
  Building2,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks/use-locale";
import { plural } from "@/lib/i18n/plural";

type Entity = "artist" | "venue";

interface DuplicateRow {
  id: number;
  name: string;
  phone: string | null;
  city: string | null;
  slug: string;
}

interface DuplicateGroup {
  key: string;
  reasons: string[];
  rows: DuplicateRow[];
}

interface Response {
  entity: Entity;
  total: number;
  groups: DuplicateGroup[];
}

export default function AdminDuplicatesPage() {
  const { t, locale } = useLocale();
  const [entity, setEntity] = useState<Entity>("artist");
  const [data, setData] = useState<Response | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(forceEntity?: Entity) {
    const target = forceEntity ?? entity;
    const first = data === null;
    if (first) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch(`/api/admin/duplicates?entity=${target}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || t("adminUi.duplicates.toastLoadError"));
        return;
      }
      const payload = (await res.json()) as Response;
      setData(payload);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function switchEntity(next: Entity) {
    if (next === entity) return;
    setEntity(next);
    setData(null);
    void load(next);
  }

  const Icon = entity === "artist" ? Users : Building2;
  const entityLabelLower =
    entity === "artist"
      ? t("adminUi.duplicates.entityArtistsLower")
      : t("adminUi.duplicates.entityVenuesLower");
  const editPrefix = entity === "artist" ? "/admin/artisti" : "/admin/sali";
  const publicPrefix = entity === "artist" ? "/artisti" : "/sali";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">{t("adminUi.duplicates.title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("adminUi.duplicates.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="inline-flex rounded-lg border border-border/50 p-0.5"
            role="tablist"
          >
            {(["artist", "venue"] as const).map((e) => (
              <button
                key={e}
                type="button"
                role="tab"
                aria-selected={entity === e}
                onClick={() => switchEntity(e)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  entity === e
                    ? "bg-gold text-[#0D0D0D]"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {e === "artist" ? (
                  <Users className="h-3.5 w-3.5" />
                ) : (
                  <Building2 className="h-3.5 w-3.5" />
                )}
                {e === "artist"
                  ? t("adminUi.duplicates.entityArtists")
                  : t("adminUi.duplicates.entityVenues")}
              </button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => load()}
            disabled={refreshing}
            className="gap-1.5"
          >
            {refreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {t("adminUi.duplicates.refresh")}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      ) : !data ? null : data.groups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
              <Icon className="h-6 w-6" />
            </div>
            <div className="text-center">
              <h3 className="font-heading text-lg font-bold">
                {t("adminUi.duplicates.noneFound")}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("adminUi.duplicates.cleanFor", {
                  entity: entityLabelLower,
                  total: data.total,
                })}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="flex items-start gap-3 p-4 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div>
                <p className="font-medium">
                  {t("adminUi.duplicates.summary", {
                    groups: plural(data.groups.length, locale, {
                      ro: { one: "grup", few: "grupuri", many: "grupuri" },
                      ru: { one: "группа", few: "группы", many: "групп" },
                      en: { one: "group", other: "groups" },
                    }),
                    total: data.total,
                    entity: entityLabelLower,
                  })}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("adminUi.duplicates.heuristics")}
                </p>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {data.groups.map((group) => (
              <Card key={group.key}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="inline-flex items-center gap-2">
                      <Icon className="h-4 w-4 text-gold" />
                      {t("adminUi.duplicates.groupSize", { count: group.rows.length })}
                    </span>
                  </CardTitle>
                  <div className="flex flex-wrap gap-1.5">
                    {group.reasons.map((r) => (
                      <span
                        key={r}
                        className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {group.rows.map((row) => (
                    <div
                      key={row.id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border border-border/40 bg-background/40 p-3 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{row.name}</p>
                        <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-muted-foreground">
                          <span className="font-mono">#{row.id}</span>
                          {row.city && <span>{row.city}</span>}
                          {row.phone && (
                            <span className="font-mono">{row.phone}</span>
                          )}
                          <span className="font-mono text-muted-foreground/70">
                            {row.slug}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Link href={`${publicPrefix}/${row.slug}`} target="_blank">
                          <Button variant="ghost" size="icon" aria-label={t("adminUi.duplicates.viewPublic")}>
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </Link>
                        <Link href={`${editPrefix}/${row.id}`}>
                          <Button variant="outline" size="sm">
                            {t("common.edit")}
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
