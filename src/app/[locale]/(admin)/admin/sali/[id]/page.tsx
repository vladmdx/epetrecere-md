"use client";

// Admin venue edit page — mirrors admin/artisti/[id] but for venues.
// Uses the same `/api/venues/[id]` endpoints (GET + PUT admin-gated).

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Eye,
  Trash2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const RichEditor = dynamic(
  () => import("@/components/shared/rich-editor").then((m) => m.RichEditor),
  { ssr: false },
);

interface VenueData {
  id: number;
  nameRo: string;
  nameRu: string | null;
  nameEn: string | null;
  slug: string;
  descriptionRo: string | null;
  descriptionRu: string | null;
  descriptionEn: string | null;
  address: string | null;
  city: string | null;
  capacityMin: number | null;
  capacityMax: number | null;
  pricePerPerson: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  menuUrl: string | null;
  menuPdfUrl: string | null;
  virtualTourUrl: string | null;
  isActive: boolean;
  isFeatured: boolean;
  ratingAvg: number | null;
  ratingCount: number | null;
  seoTitleRo: string | null;
  seoTitleRu: string | null;
  seoTitleEn: string | null;
  seoDescRo: string | null;
  seoDescRu: string | null;
  seoDescEn: string | null;
}

export default function AdminEditVenuePage() {
  const params = useParams();
  const id = Number(params?.id);
  const [venue, setVenue] = useState<VenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    fetch(`/api/venues/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data) setVenue(data);
        else toast.error("Sala nu a fost găsită");
      })
      .catch(() => toast.error("Eroare la încărcare"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  function update(partial: Partial<VenueData>) {
    setVenue((prev) => (prev ? { ...prev, ...partial } : prev));
  }

  async function save() {
    if (!venue) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/venues/${venue.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameRo: venue.nameRo,
          nameRu: venue.nameRu ?? undefined,
          nameEn: venue.nameEn ?? undefined,
          descriptionRo: venue.descriptionRo ?? undefined,
          descriptionRu: venue.descriptionRu ?? undefined,
          descriptionEn: venue.descriptionEn ?? undefined,
          address: venue.address ?? undefined,
          city: venue.city ?? undefined,
          capacityMin: venue.capacityMin ?? null,
          capacityMax: venue.capacityMax ?? null,
          pricePerPerson: venue.pricePerPerson ?? null,
          phone: venue.phone ?? undefined,
          email: venue.email ?? "",
          website: venue.website ?? "",
          menuUrl: venue.menuUrl ?? "",
          menuPdfUrl: venue.menuPdfUrl ?? "",
          virtualTourUrl: venue.virtualTourUrl ?? "",
          isActive: venue.isActive,
          isFeatured: venue.isFeatured,
          seoTitleRo: venue.seoTitleRo ?? "",
          seoTitleRu: venue.seoTitleRu ?? "",
          seoTitleEn: venue.seoTitleEn ?? "",
          seoDescRo: venue.seoDescRo ?? "",
          seoDescRu: venue.seoDescRu ?? "",
          seoDescEn: venue.seoDescEn ?? "",
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Sala a fost salvată!");
    } catch {
      toast.error("Eroare la salvare");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!venue) return;
    if (
      !confirm(
        `Sigur ștergi sala "${venue.nameRo}"? Acțiunea este ireversibilă și va elimina galeria, meniul și recenziile asociate.`,
      )
    ) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/venues/${venue.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Nu s-a putut șterge");
        return;
      }
      toast.success("Sala a fost ștearsă");
      // Hard navigate so the list re-fetches
      window.location.href = "/admin/sali";
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <p className="text-sm text-muted-foreground">Sala nu a fost găsită.</p>
        <Link
          href="/admin/sali"
          className="text-sm text-gold hover:underline"
        >
          Înapoi la listă
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/sali">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Înapoi la listă săli"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="font-heading text-2xl font-bold truncate">
            {venue.nameRo}
          </h1>
          <p className="text-xs text-muted-foreground">
            ID: {venue.id} · /{venue.slug}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/sali/${venue.slug}`} target="_blank" rel="noopener">
            <Button variant="outline" size="sm" className="gap-2">
              <Eye className="h-4 w-4" />
              Vezi public
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
            className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Șterge
          </Button>
          <Button
            onClick={save}
            disabled={saving}
            className="gap-2 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvează
          </Button>
        </div>
      </div>

      {/* Status flags */}
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2">
          <div className="flex items-center justify-between rounded-lg bg-muted/30 p-3">
            <div>
              <p className="text-sm font-medium">Publicată</p>
              <p className="text-xs text-muted-foreground">
                Vizibilă pe /sali
              </p>
            </div>
            <Switch
              checked={venue.isActive}
              onCheckedChange={(v) => update({ isActive: v })}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-muted/30 p-3">
            <div>
              <p className="text-sm font-medium">Featured</p>
              <p className="text-xs text-muted-foreground">
                Promovată pe homepage
              </p>
            </div>
            <Switch
              checked={venue.isFeatured}
              onCheckedChange={(v) => update({ isFeatured: v })}
            />
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Informații</TabsTrigger>
          <TabsTrigger value="description">Descriere</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
          <TabsTrigger value="extras">Meniu & Tur 360°</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Date generale</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Nume (RO)</Label>
                  <Input
                    value={venue.nameRo}
                    onChange={(e) => update({ nameRo: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Nume (RU)</Label>
                  <Input
                    value={venue.nameRu ?? ""}
                    onChange={(e) => update({ nameRu: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Nume (EN)</Label>
                  <Input
                    value={venue.nameEn ?? ""}
                    onChange={(e) => update({ nameEn: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Oraș</Label>
                  <Input
                    value={venue.city ?? ""}
                    onChange={(e) => update({ city: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Adresă</Label>
                <Input
                  value={venue.address ?? ""}
                  onChange={(e) => update({ address: e.target.value })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label>Capacitate min.</Label>
                  <Input
                    type="number"
                    value={venue.capacityMin ?? ""}
                    onChange={(e) =>
                      update({
                        capacityMin: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Capacitate max.</Label>
                  <Input
                    type="number"
                    value={venue.capacityMax ?? ""}
                    onChange={(e) =>
                      update({
                        capacityMax: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  />
                </div>
                <div>
                  <Label>Preț per persoană (€)</Label>
                  <Input
                    type="number"
                    value={venue.pricePerPerson ?? ""}
                    onChange={(e) =>
                      update({
                        pricePerPerson: e.target.value
                          ? Number(e.target.value)
                          : null,
                      })
                    }
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label>Telefon</Label>
                  <Input
                    value={venue.phone ?? ""}
                    onChange={(e) => update({ phone: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={venue.email ?? ""}
                    onChange={(e) => update({ email: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Website</Label>
                  <Input
                    type="url"
                    value={venue.website ?? ""}
                    onChange={(e) => update({ website: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="description" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Descriere</CardTitle>
              <p className="text-xs text-muted-foreground">
                Editori rich-text pentru fiecare limbă.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Label className="mb-2 block">Descriere (RO)</Label>
                <RichEditor
                  content={venue.descriptionRo ?? ""}
                  onChange={(v) => update({ descriptionRo: v })}
                />
              </div>
              <div>
                <Label className="mb-2 block">Descriere (RU)</Label>
                <RichEditor
                  content={venue.descriptionRu ?? ""}
                  onChange={(v) => update({ descriptionRu: v })}
                />
              </div>
              <div>
                <Label className="mb-2 block">Descriere (EN)</Label>
                <RichEditor
                  content={venue.descriptionEn ?? ""}
                  onChange={(v) => update({ descriptionEn: v })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seo" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>SEO multi-limbă</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {(["Ro", "Ru", "En"] as const).map((lang) => {
                const titleKey = `seoTitle${lang}` as const;
                const descKey = `seoDesc${lang}` as const;
                const title = venue[titleKey] ?? "";
                const desc = venue[descKey] ?? "";
                return (
                  <div key={lang} className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {lang === "Ro"
                        ? "🇷🇴 Română"
                        : lang === "Ru"
                          ? "🇷🇺 Rusă"
                          : "🇬🇧 Engleză"}
                    </p>
                    <div>
                      <Label>
                        Meta title
                        <span className="ml-2 text-xs text-muted-foreground">
                          {title.length}/60
                        </span>
                      </Label>
                      <Input
                        value={title}
                        onChange={(e) =>
                          update({ [titleKey]: e.target.value })
                        }
                      />
                    </div>
                    <div>
                      <Label>
                        Meta description
                        <span className="ml-2 text-xs text-muted-foreground">
                          {desc.length}/160
                        </span>
                      </Label>
                      <Textarea
                        rows={2}
                        value={desc}
                        onChange={(e) =>
                          update({ [descKey]: e.target.value })
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="extras" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Meniu digital</CardTitle>
              <p className="text-xs text-muted-foreground">
                Owner-ul sălii îl editează din dashboard — aici e doar read.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>URL meniu (extern)</Label>
                <Input
                  type="url"
                  value={venue.menuUrl ?? ""}
                  onChange={(e) => update({ menuUrl: e.target.value })}
                />
              </div>
              <div>
                <Label>PDF meniu (încărcat)</Label>
                <Input
                  type="url"
                  value={venue.menuPdfUrl ?? ""}
                  onChange={(e) => update({ menuPdfUrl: e.target.value })}
                  placeholder="—"
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Tur virtual 360°</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>URL embed</Label>
                <Input
                  type="url"
                  value={venue.virtualTourUrl ?? ""}
                  onChange={(e) =>
                    update({ virtualTourUrl: e.target.value })
                  }
                  placeholder="https://my.matterport.com/show/?m=..."
                />
              </div>
              {venue.virtualTourUrl && (
                <div className="aspect-video overflow-hidden rounded-lg border border-border/40">
                  <iframe
                    src={venue.virtualTourUrl}
                    className="h-full w-full"
                    allow="xr-spatial-tracking; fullscreen"
                    title="Virtual tour preview"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
