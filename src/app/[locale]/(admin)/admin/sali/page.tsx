"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Edit, Eye, MapPin, Users, Star, Loader2 } from "lucide-react";
import Link from "@/components/shared/locale-link";
import { toast } from "sonner";
import { BulkActionsBar } from "@/components/admin/bulk-actions-bar";
import { useLocale } from "@/hooks/use-locale";
import type { AdminOrganizationSummary } from "@/lib/admin/organization-summary";
import type { AdminHallAggregate, AdminVenueStatusFilter } from "@/lib/admin/venue-list";
import { ADMIN_VENUE_LIST_DEFAULT_LIMIT, ADMIN_VENUE_STATUS_FILTERS } from "@/lib/admin/venue-list";
import { ADMIN_VENUE_STATUS_I18N, adminKnownPriceText, adminVenueStatusText } from "@/lib/admin/venue-display";

interface AdminVenueListItem {
  id: number;
  nameRo: string;
  slug: string;
  city: string | null;
  capacityMax: number | null;
  pricePerPerson: number | null;
  isActive: boolean;
  isFeatured: boolean;
  ratingAvg: number | null;
  organization: AdminOrganizationSummary | null;
  halls: AdminHallAggregate;
  publicHref: string | null;
}

export default function AdminVenuesPage() {
  const { t } = useLocale();
  const [venues, setVenues] = useState<AdminVenueListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(ADMIN_VENUE_LIST_DEFAULT_LIMIT);
  const [searchInput, setSearchInput] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"" | AdminVenueStatusFilter>("");
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const requestId = useRef(0);

  const loadPage = useCallback(async (nextPage: number, nextQ: string, nextStatus: string, signal?: AbortSignal) => {
    const currentRequest = ++requestId.current;
    const params = new URLSearchParams({
      page: String(nextPage),
      limit: String(limit),
    });
    if (nextQ) params.set("q", nextQ);
    if (nextStatus) params.set("status", nextStatus);
    const res = await fetch(`/api/admin/venues?${params.toString()}`, { signal });
    if (!res.ok) throw new Error("fetch failed");
    const data = await res.json();
    if (signal?.aborted || currentRequest !== requestId.current) return;
    const items = Array.isArray(data.items) ? data.items : [];
    const nextTotal = typeof data.total === "number" ? data.total : items.length;
    const lastPage = Math.max(1, Math.ceil(nextTotal / limit));
    if (nextPage > lastPage) {
      setPage(lastPage);
      return;
    }
    setVenues(items);
    setTotal(nextTotal);
  }, [limit]);

  async function refetchVenues() {
    const currentRequest = requestId.current + 1;
    try {
      setLoading(true);
      await loadPage(page, q, status);
    } catch {
      if (currentRequest === requestId.current) toast.error(t("adminUi.venues.toastReloadError"));
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const currentRequest = requestId.current + 1;
    (async () => {
      try {
        setLoading(true);
        await loadPage(page, q, status, controller.signal);
      } catch {
        if (!cancelled && currentRequest === requestId.current) toast.error(t("adminUi.venues.toastLoadError"));
      } finally {
        if (!cancelled && currentRequest === requestId.current) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [loadPage, page, q, status, t]);

  const pageCount = Math.max(1, Math.ceil(total / limit) || 1);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSelectedIds([]);
    setPage(1);
    setQ(searchInput.trim());
  }

  if (loading && venues.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">{t("adminUi.venues.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("adminUi.venues.count", { count: total })}</p>
        </div>
      </div>

      <form onSubmit={submitSearch} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label htmlFor="admin-venue-search" className="mb-1 block text-xs font-medium text-muted-foreground">
            {t("adminUi.venues.searchLabel")}
          </label>
          <Input
            id="admin-venue-search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t("adminUi.venues.searchPlaceholder")}
          />
        </div>
        <div>
          <label htmlFor="admin-venue-status" className="mb-1 block text-xs font-medium text-muted-foreground">
            {t("adminUi.venues.statusLabel")}
          </label>
          <select
            id="admin-venue-status"
            value={status}
            onChange={(event) => {
              setSelectedIds([]);
              setPage(1);
              setStatus(event.target.value as "" | AdminVenueStatusFilter);
            }}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">{t("adminUi.venues.allStatuses")}</option>
            {ADMIN_VENUE_STATUS_FILTERS.map((value) => (
              <option key={value} value={value}>
                {t(ADMIN_VENUE_STATUS_I18N[value])}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="outline">
          {t("adminUi.venues.search")}
        </Button>
      </form>

      {venues.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {t("adminUi.venues.empty")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {venues.map((venue) => {
            const selected = selectedIds.includes(venue.id);
            const hallMax = venue.halls.maxCapacity ?? venue.capacityMax;
            return (
            <Card
              key={venue.id}
              className={
                selected
                  ? "border-gold/60 bg-gold/5 transition-all"
                  : "transition-all hover:border-gold/30"
              }
            >
              <CardContent className="flex items-center gap-4 py-3">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggleSelect(venue.id)}
                  aria-label={t("adminUi.venues.selectOne", { name: venue.nameRo })}
                  className="h-4 w-4 shrink-0 cursor-pointer accent-gold"
                />
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/10 text-lg">🏛️</div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{venue.nameRo}</span>
                    {venue.isFeatured && <Badge className="bg-gold/10 text-gold border-gold/30 text-xs">{t("adminUi.artists.badgeFeatured")}</Badge>}
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    {venue.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {venue.city}</span>}
                    {hallMax ? <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {t("adminUi.venues.maxCapacity", { n: hallMax })}</span> : null}
                    {venue.halls.minPrice
                      ? <span>{t("adminUi.venues.activeHallMinPrice", { price: adminKnownPriceText(venue.halls.minPrice, t) })}</span>
                      : venue.halls.total === 0 && venue.pricePerPerson != null
                        ? <span>{t("adminUi.venues.legacyPricePerPerson", { price: venue.pricePerPerson })}</span>
                        : null}
                    {venue.ratingAvg ? <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-gold text-gold" /> {Number(venue.ratingAvg).toFixed(1)}</span> : null}
                    <span>{t("adminUi.venues.hallsCount", { count: venue.halls.total })}</span>
                    <span>
                      {venue.organization
                        ? `${venue.organization.legalName || venue.organization.displayName} · ${adminVenueStatusText(venue.organization.status, t)}`
                        : t("adminUi.venues.noOrganization")}
                    </span>
                  </div>
                </div>
                <Badge variant={venue.isActive ? "default" : "secondary"}>
                  {venue.isActive
                    ? t("adminUi.venues.statusPublished")
                    : t("adminUi.venues.statusUnpublished")}
                </Badge>
                <Link href={`/admin/sali/${venue.id}`}>
                  <Button variant="ghost" size="icon" aria-label={t("adminUi.venues.editVenue")}><Edit className="h-4 w-4" /></Button>
                </Link>
                {venue.publicHref ? (
                  <Link href={venue.publicHref} target="_blank">
                    <Button variant="ghost" size="icon" aria-label={t("adminUi.venues.viewPublic")}><Eye className="h-4 w-4" /></Button>
                  </Link>
                ) : null}
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {t("adminUi.venues.pageStatus", { page, pages: pageCount, total })}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            aria-label={t("adminUi.venues.previousPage")}
            onClick={() => {
              setSelectedIds([]);
              setPage((current) => Math.max(1, current - 1));
            }}
          >
            {t("adminUi.venues.previousPage")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= pageCount}
            aria-label={t("adminUi.venues.nextPage")}
            onClick={() => {
              setSelectedIds([]);
              setPage((current) => current + 1);
            }}
          >
            {t("adminUi.venues.nextPage")}
          </Button>
        </div>
      </div>

      <BulkActionsBar
        entity="venue"
        selectedIds={selectedIds}
        onClear={() => setSelectedIds([])}
        onComplete={refetchVenues}
      />
    </div>
  );
}
