"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {  Edit, Eye, MapPin, Users, Star, Loader2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { BulkActionsBar } from "@/components/admin/bulk-actions-bar";
import { useLocale } from "@/hooks/use-locale";

interface Venue {
  id: number;
  nameRo: string;
  slug: string;
  city: string | null;
  capacityMax: number | null;
  pricePerPerson: number | null;
  isActive: boolean;
  isFeatured: boolean;
  ratingAvg: number | null;
}

async function loadAllVenues(): Promise<Venue[]> {
  const res = await fetch("/api/venues?limit=200");
  if (!res.ok) throw new Error("fetch failed");
  const data = await res.json();
  return Array.isArray(data.venues)
    ? data.venues
    : Array.isArray(data)
      ? data
      : [];
}

export default function AdminVenuesPage() {
  const { t } = useLocale();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  async function refetchVenues() {
    try {
      setVenues(await loadAllVenues());
    } catch {
      toast.error(t("adminUi.venues.toastReloadError"));
    }
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  useEffect(() => {
    (async () => {
      try {
        setVenues(await loadAllVenues());
      } catch {
        toast.error(t("adminUi.venues.toastLoadError"));
      } finally {
        setLoading(false);
      }
    })();
  }, [t]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">{t("adminUi.venues.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("adminUi.venues.count", { count: venues.length })}</p>
        </div>
      </div>

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
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{venue.nameRo}</span>
                    {venue.isFeatured && <Badge className="bg-gold/10 text-gold border-gold/30 text-xs">{t("adminUi.artists.badgeFeatured")}</Badge>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    {venue.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {venue.city}</span>}
                    {venue.capacityMax && <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {t("adminUi.venues.maxCapacity", { n: venue.capacityMax })}</span>}
                    {venue.pricePerPerson && <span>{venue.pricePerPerson}€/pers</span>}
                    {venue.ratingAvg && <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-gold text-gold" /> {Number(venue.ratingAvg).toFixed(1)}</span>}
                  </div>
                </div>
                <Badge variant={venue.isActive ? "default" : "secondary"}>
                  {venue.isActive
                    ? t("admin.venueEdit.published")
                    : t("adminUi.artists.badgeDraft")}
                </Badge>
                <Link href={`/admin/sali/${venue.id}`}>
                  <Button variant="ghost" size="icon" aria-label={t("adminUi.venues.editVenue")}><Edit className="h-4 w-4" /></Button>
                </Link>
                <Link href={`/sali/${venue.slug}`} target="_blank">
                  <Button variant="ghost" size="icon" aria-label={t("adminUi.venues.viewPublic")}><Eye className="h-4 w-4" /></Button>
                </Link>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      <BulkActionsBar
        entity="venue"
        selectedIds={selectedIds}
        onClear={() => setSelectedIds([])}
        onComplete={refetchVenues}
      />
    </div>
  );
}
