// M12 — Venue profile editor (F-S2..F-S5). Covers basic info, capacity,
// pricing, facilities checklist, digital menu URL and 360° virtual tour URL.
// The facilities list is a checklist of canonical options; owners can also
// add custom ones.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Building2,
  Save,
  Loader2,
  ExternalLink,
  Plus,
  X,
  AlertCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const CANONICAL_FACILITIES = [
  "Parcare",
  "Aer condiționat",
  "Sunet profesional",
  "Proiector",
  "Ring de dans",
  "Terasa",
  "Grădină",
  "Capelă / loc ceremonie",
  "Cameră miri",
  "Acces persoane cu dizabilități",
  "Wi-Fi gratuit",
  "Fumat permis",
];

interface Venue {
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
  facilities: string[] | null;
  menuUrl: string | null;
  virtualTourUrl: string | null;
  calendarEnabled: boolean;
  isActive: boolean;
}

export default function VenueProfilePage() {
  const [venue, setVenue] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customFacility, setCustomFacility] = useState("");

  useEffect(() => {
    fetch("/api/me/venue")
      .then((r) => (r.ok ? r.json() : { venue: null }))
      .then((data) => setVenue(data.venue))
      .catch(() => setVenue(null))
      .finally(() => setLoading(false));
  }, []);

  function update(partial: Partial<Venue>) {
    setVenue((prev) => (prev ? { ...prev, ...partial } : prev));
  }

  function toggleFacility(name: string) {
    if (!venue) return;
    const current = venue.facilities ?? [];
    update({
      facilities: current.includes(name)
        ? current.filter((f) => f !== name)
        : [...current, name],
    });
  }

  function addCustomFacility() {
    if (!venue || !customFacility.trim()) return;
    const current = venue.facilities ?? [];
    if (current.includes(customFacility.trim())) return;
    update({ facilities: [...current, customFacility.trim()] });
    setCustomFacility("");
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
          facilities: venue.facilities ?? [],
          menuUrl: venue.menuUrl ?? "",
          virtualTourUrl: venue.virtualTourUrl ?? "",
          calendarEnabled: venue.calendarEnabled,
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

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-border/40 p-12 text-center">
        <Building2 className="mx-auto h-12 w-12 text-gold" />
        <h1 className="mt-4 font-heading text-xl font-bold">
          Nu ai o sală înregistrată
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Completează datele sălii tale pentru a începe să primești cereri de
          ofertă.
        </p>
        <Link
          href="/dashboard/venue-onboarding"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gold px-5 py-2.5 text-sm font-medium text-background hover:bg-gold-dark"
        >
          Înregistrează sala
        </Link>
      </div>
    );
  }

  const facilities = venue.facilities ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">Profilul Sălii</h1>
          <p className="text-sm text-muted-foreground">
            {venue.nameRo}
            {venue.isActive ? (
              <span className="ml-2 rounded bg-success/15 px-2 py-0.5 text-xs text-success">
                Publicată
              </span>
            ) : (
              <span className="ml-2 rounded bg-warning/15 px-2 py-0.5 text-xs text-warning">
                În așteptare
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {venue.isActive && (
            <Link
              href={`/sali/${venue.slug}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-3 py-2 text-sm hover:bg-muted"
            >
              <ExternalLink className="h-4 w-4" /> Vezi public
            </Link>
          )}
          <Button
            onClick={save}
            disabled={saving}
            className="gap-2 bg-gold text-background hover:bg-gold-dark"
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

      {!venue.isActive && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>
            Sala ta este în așteptare de aprobare. După verificare de către
            administrator, profilul va deveni public pe ePetrecere.md.
          </p>
        </div>
      )}

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">Informații</TabsTrigger>
          <TabsTrigger value="capacity">Capacitate & Preț</TabsTrigger>
          <TabsTrigger value="facilities">Facilități</TabsTrigger>
          <TabsTrigger value="extras">Meniu & Tur 360°</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Date de bază</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Nume (RO) *</Label>
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
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
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
              </div>
              <div>
                <Label>Website</Label>
                <Input
                  type="url"
                  placeholder="https://..."
                  value={venue.website ?? ""}
                  onChange={(e) => update({ website: e.target.value })}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Oraș</Label>
                  <Input
                    value={venue.city ?? ""}
                    onChange={(e) => update({ city: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Adresă</Label>
                  <Input
                    value={venue.address ?? ""}
                    onChange={(e) => update({ address: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Descriere</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Descriere (RO)</Label>
                <Textarea
                  rows={5}
                  value={venue.descriptionRo ?? ""}
                  onChange={(e) => update({ descriptionRo: e.target.value })}
                />
              </div>
              <div>
                <Label>Descriere (RU)</Label>
                <Textarea
                  rows={4}
                  value={venue.descriptionRu ?? ""}
                  onChange={(e) => update({ descriptionRu: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="capacity" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Capacitate</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Minim invitați</Label>
                <Input
                  type="number"
                  value={venue.capacityMin ?? ""}
                  onChange={(e) =>
                    update({
                      capacityMin: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </div>
              <div>
                <Label>Maxim invitați</Label>
                <Input
                  type="number"
                  value={venue.capacityMax ?? ""}
                  onChange={(e) =>
                    update({
                      capacityMax: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Preț</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                  placeholder="Ex: 35"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Prețul este vizibil doar utilizatorilor autentificați.
                </p>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Calendar de disponibilitate activ</Label>
                  <p className="text-xs text-muted-foreground">
                    Afișează calendarul pe profil public
                  </p>
                </div>
                <Switch
                  checked={venue.calendarEnabled}
                  onCheckedChange={(v) => update({ calendarEnabled: v })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="facilities" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Facilități</CardTitle>
              <p className="text-sm text-muted-foreground">
                Bifează tot ce oferă sala ta. Clienții filtrează după aceste
                opțiuni când caută o locație.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                {CANONICAL_FACILITIES.map((f) => (
                  <label
                    key={f}
                    className="flex cursor-pointer items-center gap-2 rounded-lg border border-border/40 px-3 py-2 text-sm hover:border-gold/40"
                  >
                    <input
                      type="checkbox"
                      checked={facilities.includes(f)}
                      onChange={() => toggleFacility(f)}
                      className="h-4 w-4 accent-gold"
                    />
                    {f}
                  </label>
                ))}
              </div>

              <div>
                <Label>Facilități personalizate</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {facilities
                    .filter((f) => !CANONICAL_FACILITIES.includes(f))
                    .map((f) => (
                      <span
                        key={f}
                        className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs text-gold"
                      >
                        {f}
                        <button
                          type="button"
                          onClick={() => toggleFacility(f)}
                          className="hover:text-destructive"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <Input
                    value={customFacility}
                    onChange={(e) => setCustomFacility(e.target.value)}
                    placeholder="Ex: Lift, Piscină interioară..."
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addCustomFacility();
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    onClick={addCustomFacility}
                    className="gap-1"
                  >
                    <Plus className="h-4 w-4" /> Adaugă
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="extras" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Meniu digital</CardTitle>
              <p className="text-sm text-muted-foreground">
                Link către meniul tău — PDF, Google Docs, sau pagina proprie.
                Apare ca buton „Vezi meniu” pe profilul public.
              </p>
            </CardHeader>
            <CardContent>
              <Label>URL meniu</Label>
              <Input
                type="url"
                value={venue.menuUrl ?? ""}
                onChange={(e) => update({ menuUrl: e.target.value })}
                placeholder="https://drive.google.com/file/..."
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tur virtual 360°</CardTitle>
              <p className="text-sm text-muted-foreground">
                Link de embed pentru un tur 360° — Matterport, Kuula, YouTube
                360 sau similar. Va fi afișat ca iframe pe profilul public.
              </p>
            </CardHeader>
            <CardContent>
              <Label>URL embed</Label>
              <Input
                type="url"
                value={venue.virtualTourUrl ?? ""}
                onChange={(e) => update({ virtualTourUrl: e.target.value })}
                placeholder="https://my.matterport.com/show/?m=..."
              />
              {venue.virtualTourUrl && (
                <div className="mt-4 aspect-video overflow-hidden rounded-lg border border-border/40">
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
