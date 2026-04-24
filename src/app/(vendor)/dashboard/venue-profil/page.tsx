// M12 — Venue profile editor (F-S2..F-S5). Covers basic info, capacity,
// pricing, facilities checklist, digital menu URL and 360° virtual tour URL.
// The facilities list is a checklist of canonical options; owners can also
// add custom ones.

"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
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
// Lazy-load the heavy TipTap editor; venues often edit descriptions rarely,
// and the editor pulls in a large Prosemirror bundle.
const RichEditor = dynamic(
  () => import("@/components/shared/rich-editor").then((m) => m.RichEditor),
  { ssr: false },
);
import { MapPicker } from "@/components/shared/map-picker";
import { VenueGalleryManager } from "@/components/vendor/venue-gallery-manager";
import {
  WorkingHoursEditor,
  type WorkingHours,
} from "@/components/vendor/working-hours-editor";

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
  lat: number | null;
  lng: number | null;
  capacityMin: number | null;
  capacityMax: number | null;
  pricePerPerson: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  facilities: string[] | null;
  menuUrl: string | null;
  menuPdfUrl: string | null;
  virtualTourUrl: string | null;
  calendarEnabled: boolean;
  workingHours: WorkingHours | null;
  isActive: boolean;
  seoTitleRo: string | null;
  seoTitleRu: string | null;
  seoTitleEn: string | null;
  seoDescRo: string | null;
  seoDescRu: string | null;
  seoDescEn: string | null;
  ogImageUrl: string | null;
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

  async function improveDescription(lang: "ro" | "ru" | "en") {
    if (!venue) return;
    const field =
      lang === "ro"
        ? "descriptionRo"
        : lang === "ru"
          ? "descriptionRu"
          : "descriptionEn";
    const current = (venue[field as keyof Venue] as string | null) ?? "";
    try {
      const res = await fetch("/api/ai/venue-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId: venue.id,
          lang,
          mode: current.trim() ? "improve" : "generate",
          current,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Nu s-a putut genera descrierea");
        return;
      }
      const data = (await res.json()) as { description?: string };
      if (!data.description) {
        toast.error("Răspuns invalid de la AI");
        return;
      }
      update({ [field]: data.description } as Partial<Venue>);
      toast.success("Descriere generată — nu uita să salvezi");
    } catch {
      toast.error("Eroare la generare");
    }
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
          menuPdfUrl: venue.menuPdfUrl ?? "",
          virtualTourUrl: venue.virtualTourUrl ?? "",
          calendarEnabled: venue.calendarEnabled,
          workingHours: venue.workingHours ?? null,
          seoTitleRo: venue.seoTitleRo ?? "",
          seoTitleRu: venue.seoTitleRu ?? "",
          seoTitleEn: venue.seoTitleEn ?? "",
          seoDescRo: venue.seoDescRo ?? "",
          seoDescRu: venue.seoDescRu ?? "",
          seoDescEn: venue.seoDescEn ?? "",
          ogImageUrl: venue.ogImageUrl ?? null,
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
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gold px-5 py-2.5 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark"
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

      {!venue.isActive && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p>
            Sala ta este în așteptare de aprobare. După verificare de către
            administrator, profilul va deveni public pe ePetrecere.md.
          </p>
        </div>
      )}

      <Tabs defaultValue="general">
        <TabsList className="flex-wrap">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="description">Descriere</TabsTrigger>
          <TabsTrigger value="gallery">Galerie</TabsTrigger>
          <TabsTrigger value="capacity">Capacitate & Preț</TabsTrigger>
          <TabsTrigger value="facilities">Facilități</TabsTrigger>
          <TabsTrigger value="location">Locație</TabsTrigger>
          <TabsTrigger value="seo">SEO</TabsTrigger>
          <TabsTrigger value="extras">Meniu & Tur 360°</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Date de bază</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
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
                <div>
                  <Label>Name (EN)</Label>
                  <Input
                    value={venue.nameEn ?? ""}
                    onChange={(e) => update({ nameEn: e.target.value })}
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
              <CardTitle>Program funcționare</CardTitle>
              <p className="text-xs text-muted-foreground">
                Apare pe profilul public sub formă de „Lu-Vi 10:00-22:00 ·
                Sâ-Du 10:00-24:00". Lasă zilele închise dezactivate.
              </p>
            </CardHeader>
            <CardContent>
              <WorkingHoursEditor
                value={venue.workingHours}
                onChange={(next) => update({ workingHours: next })}
              />
            </CardContent>
          </Card>

        </TabsContent>

        <TabsContent value="description" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>Descriere</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Editor rich-text: bold, italic, titluri, liste, link-uri. AI-ul generează
                    ~300 cuvinte pe baza numelui, capacității și facilităților sălii.
                  </p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <DescriptionLangEditor
                label="Descriere (RO)"
                placeholder="Descrie sala ta — atmosferă, ce o face specială, evenimente potrivite..."
                value={venue.descriptionRo ?? ""}
                onChange={(html) => update({ descriptionRo: html })}
                onAi={() => improveDescription("ro")}
              />
              <DescriptionLangEditor
                label="Descriere (RU)"
                placeholder="Опишите ваш зал..."
                value={venue.descriptionRu ?? ""}
                onChange={(html) => update({ descriptionRu: html })}
                onAi={() => improveDescription("ru")}
              />
              <DescriptionLangEditor
                label="Description (EN)"
                placeholder="Describe your venue — atmosphere, highlights, best-fit events..."
                value={venue.descriptionEn ?? ""}
                onChange={(html) => update({ descriptionEn: html })}
                onAi={() => improveDescription("en")}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="gallery" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Galerie foto</CardTitle>
              <p className="text-sm text-muted-foreground">
                Minim 5 imagini recomandate. Prima imagine devine coperta sălii pe listing și pe
                OpenGraph. JPG/PNG/WebP, max 10MB — comprimare automată la upload.
              </p>
            </CardHeader>
            <CardContent>
              <VenueGalleryManager venueId={venue.id} venueName={venue.nameRo} />
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

        <TabsContent value="location" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Locație pe hartă</CardTitle>
              <p className="text-sm text-muted-foreground">
                Click pe hartă sau trage pin-ul pentru a seta locația exactă a
                sălii. Harta apare pe profilul public ca embed interactiv.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="address">Adresă completă</Label>
                <Input
                  id="address"
                  className="mt-1"
                  value={venue.address ?? ""}
                  onChange={(e) => setVenue({ ...venue, address: e.target.value })}
                  placeholder="Str. Florilor 25, Chișinău"
                />
              </div>

              <div>
                <Label className="mb-2 block">Hartă interactivă</Label>
                <MapPicker
                  lat={venue.lat}
                  lng={venue.lng}
                  onChange={(newLat, newLng) =>
                    setVenue({ ...venue, lat: newLat, lng: newLng })
                  }
                />
                {venue.lat !== null && venue.lng !== null ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Coordonate:{" "}
                    <span className="font-mono text-gold">
                      {venue.lat.toFixed(6)}, {venue.lng.toFixed(6)}
                    </span>
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-amber-500">
                    Click pe hartă pentru a seta locația sălii.
                  </p>
                )}
              </div>

              <details className="rounded-lg border border-border/40 bg-muted/20">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground">
                  Editare manuală coordonate
                </summary>
                <div className="grid gap-3 p-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="lat" className="text-xs">Latitudine</Label>
                    <Input
                      id="lat"
                      type="number"
                      step="0.0000001"
                      className="mt-1"
                      value={venue.lat ?? ""}
                      onChange={(e) =>
                        setVenue({
                          ...venue,
                          lat: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      placeholder="47.0105"
                    />
                  </div>
                  <div>
                    <Label htmlFor="lng" className="text-xs">Longitudine</Label>
                    <Input
                      id="lng"
                      type="number"
                      step="0.0000001"
                      className="mt-1"
                      value={venue.lng ?? ""}
                      onChange={(e) =>
                        setVenue({
                          ...venue,
                          lng: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      placeholder="28.8638"
                    />
                  </div>
                </div>
              </details>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seo" className="mt-6 space-y-6">
          <SeoTabContent venue={venue} setVenue={setVenue} />
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

/** Single-language description editor block with inline AI "improve" trigger. */
function DescriptionLangEditor({
  label,
  placeholder,
  value,
  onChange,
  onAi,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (html: string) => void;
  onAi: () => void;
}) {
  const [working, setWorking] = useState(false);
  const plainLength = value.replace(/<[^>]+>/g, "").trim().length;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <Label>{label}</Label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {plainLength} caractere
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              setWorking(true);
              try {
                await onAi();
              } finally {
                setWorking(false);
              }
            }}
            disabled={working}
            className="h-8 gap-1.5 text-xs"
          >
            {working ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <span className="text-sm">✨</span>
            )}
            {plainLength > 0 ? "Îmbunătățește cu AI" : "Generează cu AI"}
          </Button>
        </div>
      </div>
      <RichEditor
        content={value}
        onChange={onChange}
        placeholder={placeholder}
      />
    </div>
  );
}

/** SEO editor: multi-language + SERP preview + AI auto-generate. */
function SeoTabContent({
  venue,
  setVenue,
}: {
  venue: Venue;
  setVenue: (v: Venue) => void;
}) {
  const [lang, setLang] = useState<"ro" | "ru" | "en">("ro");
  const [generating, setGenerating] = useState(false);

  const titleField = (`seoTitle${lang === "ro" ? "Ro" : lang === "ru" ? "Ru" : "En"}`) as
    | "seoTitleRo"
    | "seoTitleRu"
    | "seoTitleEn";
  const descField = (`seoDesc${lang === "ro" ? "Ro" : lang === "ru" ? "Ru" : "En"}`) as
    | "seoDescRo"
    | "seoDescRu"
    | "seoDescEn";
  const nameField = (`name${lang === "ro" ? "Ro" : lang === "ru" ? "Ru" : "En"}`) as
    | "nameRo"
    | "nameRu"
    | "nameEn";
  const descrField = (`description${lang === "ro" ? "Ro" : lang === "ru" ? "Ru" : "En"}`) as
    | "descriptionRo"
    | "descriptionRu"
    | "descriptionEn";

  const title = (venue[titleField] as string | null) ?? "";
  const desc = (venue[descField] as string | null) ?? "";
  const name = (venue[nameField] as string | null) ?? venue.nameRo;
  const description = (venue[descrField] as string | null) ?? venue.descriptionRo ?? "";

  const placeholderTitle =
    lang === "ro"
      ? `${name} — Sală Nunți ${venue.city || "Chișinău"} | ePetrecere.md`
      : lang === "ru"
        ? `${name} — Банкетный зал ${venue.city || "Кишинёв"} | ePetrecere.md`
        : `${name} — Wedding Venue ${venue.city || "Chișinău"} | ePetrecere.md`;
  const placeholderDesc =
    lang === "ro"
      ? `Sală de evenimente în ${venue.city || "Chișinău"}, capacitate ${venue.capacityMin ?? "?"}–${venue.capacityMax ?? "?"} persoane. Rezervă online pe ePetrecere.md.`
      : lang === "ru"
        ? `Банкетный зал в ${venue.city || "Кишинёв"}, вместимость ${venue.capacityMin ?? "?"}–${venue.capacityMax ?? "?"} человек. Бронируйте онлайн на ePetrecere.md.`
        : `Event venue in ${venue.city || "Chișinău"}, capacity ${venue.capacityMin ?? "?"}–${venue.capacityMax ?? "?"} guests. Book online at ePetrecere.md.`;

  async function generateSeo() {
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/venue-seo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId: venue.id,
          lang,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Nu s-a putut genera");
        return;
      }
      const data = (await res.json()) as { title?: string; description?: string };
      if (data.title || data.description) {
        setVenue({
          ...venue,
          [titleField]: data.title ?? title,
          [descField]: data.description ?? desc,
        });
        toast.success("SEO generat — nu uita să salvezi");
      } else {
        toast.error("Răspuns invalid de la AI");
      }
    } catch {
      toast.error("Eroare la generare");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Optimizare SEO</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Titlu + descriere pentru Google și social media. Un titlu bun crește rata de click.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={generateSeo}
            disabled={generating}
            className="gap-2"
          >
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <span className="text-base">✨</span>
            )}
            Generează cu AI
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Language tabs */}
        <div className="flex gap-1 rounded-lg bg-muted/40 p-1 text-xs">
          {(["ro", "ru", "en"] as const).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={
                lang === l
                  ? "flex-1 rounded-md bg-gold px-3 py-1.5 font-medium text-[#0D0D0D]"
                  : "flex-1 rounded-md px-3 py-1.5 text-muted-foreground hover:text-foreground"
              }
            >
              {l === "ro" ? "🇷🇴 Română" : l === "ru" ? "🇷🇺 Русский" : "🇬🇧 English"}
            </button>
          ))}
        </div>

        {/* Slug editor — spec 4.7 */}
        <SlugEditor venue={venue} setVenue={setVenue} />

        <div>
          <Label htmlFor="seo-title">
            Titlu SEO (meta title)
            <span className="ml-2 text-xs text-muted-foreground">
              {title.length} / 60 caractere
            </span>
          </Label>
          <Input
            id="seo-title"
            className="mt-1"
            value={title}
            onChange={(e) => setVenue({ ...venue, [titleField]: e.target.value })}
            placeholder={placeholderTitle}
          />
          {title.length > 60 && (
            <p className="mt-1 text-xs text-amber-500">
              ⚠ Titlul e prea lung — Google va trunchia după ~60 caractere
            </p>
          )}
        </div>

        <div>
          <Label htmlFor="seo-desc">
            Meta description
            <span className="ml-2 text-xs text-muted-foreground">
              {desc.length} / 160 caractere
            </span>
          </Label>
          <Textarea
            id="seo-desc"
            className="mt-1"
            rows={3}
            value={desc}
            onChange={(e) => setVenue({ ...venue, [descField]: e.target.value })}
            placeholder={placeholderDesc}
          />
          {desc.length > 160 && (
            <p className="mt-1 text-xs text-amber-500">
              ⚠ Descrierea e prea lungă — Google va trunchia după ~160 caractere
            </p>
          )}
        </div>

        {/* SERP Preview */}
        <div>
          <Label className="mb-2 block">Previzualizare Google</Label>
          <div className="rounded-lg border border-border/40 bg-background p-4">
            <div className="text-xs text-muted-foreground">
              epetrecere.md › sali › {venue.slug}
            </div>
            <div className="mt-1 cursor-pointer text-lg text-blue-400 hover:underline">
              {title || placeholderTitle}
            </div>
            <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {desc ||
                (description
                  ? description.replace(/<[^>]+>/g, "").slice(0, 160)
                  : placeholderDesc)}
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Textul real pe Google poate diferi — acesta e o aproximare fidelă.
          </p>
        </div>

        {/* Open Graph image selector — spec 4.7 */}
        <OgImageSelector venue={venue} setVenue={setVenue} />
      </CardContent>
    </Card>
  );
}

/** OG image selector — pick from venue gallery or leave null to fall back
 *  to the cover photo. Preview updates live. */
function OgImageSelector({
  venue,
  setVenue,
}: {
  venue: Venue;
  setVenue: (v: Venue) => void;
}) {
  const [gallery, setGallery] = useState<
    Array<{ id: number; url: string; isCover: boolean; altRo: string | null }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/venue-images?venue_id=${venue.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setGallery(Array.isArray(rows) ? rows : []))
      .finally(() => setLoading(false));
  }, [venue.id]);

  const currentUrl = venue.ogImageUrl;
  const coverUrl = gallery.find((g) => g.isCover)?.url ?? gallery[0]?.url ?? null;
  const effectiveUrl = currentUrl ?? coverUrl ?? null;

  return (
    <div className="space-y-2">
      <Label className="block">
        OG Image (social share preview)
        <span className="ml-2 text-xs text-muted-foreground">
          Facebook / WhatsApp / Twitter
        </span>
      </Label>
      {loading ? (
        <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border/40">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      ) : gallery.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/40 p-4 text-center text-xs text-muted-foreground">
          Nu ai imagini încă — urcă câteva în tab-ul Galerie ca să poți alege OG image.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {/* "Use cover" option — clears ogImageUrl */}
            <button
              type="button"
              onClick={() => setVenue({ ...venue, ogImageUrl: null })}
              className={
                currentUrl === null
                  ? "aspect-square overflow-hidden rounded-lg border-2 border-gold bg-gold/10"
                  : "aspect-square overflow-hidden rounded-lg border-2 border-transparent hover:border-gold/40"
              }
              aria-label="Folosește coperta galeriei"
            >
              {coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={coverUrl}
                  alt="Cover (default)"
                  className="h-full w-full object-cover opacity-80"
                />
              ) : null}
              <span className="block px-1 pb-1 text-center text-[10px] font-medium">
                Auto (cover)
              </span>
            </button>
            {gallery.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setVenue({ ...venue, ogImageUrl: g.url })}
                className={
                  currentUrl === g.url
                    ? "aspect-square overflow-hidden rounded-lg border-2 border-gold"
                    : "aspect-square overflow-hidden rounded-lg border-2 border-transparent hover:border-gold/40"
                }
                aria-label={`Selectează imaginea ${g.id}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={g.url}
                  alt={g.altRo ?? ""}
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            ℹ️ {currentUrl
              ? "Imagine explicită selectată. Va fi afișată când linkul e partajat pe rețele sociale."
              : "Se folosește automat coperta galeriei. Alege explicit dacă vrei altă imagine."}
          </p>
          {effectiveUrl && (
            <div className="overflow-hidden rounded-lg border border-border/40 bg-background">
              <div className="relative aspect-[1200/630] w-full bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={effectiveUrl}
                  alt="OG preview"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="border-t border-border/40 p-3 text-xs">
                <p className="font-medium">
                  {venue.seoTitleRo || `${venue.nameRo} — Sală Evenimente`}
                </p>
                <p className="mt-0.5 text-muted-foreground">epetrecere.md</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Slug editor with redirect warning — spec 4.7 */
function SlugEditor({
  venue,
  setVenue,
}: {
  venue: Venue;
  setVenue: (v: Venue) => void;
}) {
  const [draft, setDraft] = useState(venue.slug);
  const [saving, setSaving] = useState(false);
  const changed = draft.trim() !== venue.slug;

  function slugify(raw: string) {
    return raw
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  async function commitSlug() {
    const cleaned = slugify(draft);
    if (!cleaned) {
      toast.error("Slug-ul trebuie să aibă cel puțin un caracter");
      setDraft(venue.slug);
      return;
    }
    if (cleaned === venue.slug) return;
    if (
      !confirm(
        `Schimbarea slug-ului din "${venue.slug}" în "${cleaned}" va crea un redirect automat de la URL-ul vechi. Continui?`,
      )
    ) {
      setDraft(venue.slug);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/venues/${venue.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: cleaned }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Nu s-a putut actualiza slug-ul");
        setDraft(venue.slug);
        return;
      }
      setVenue({ ...venue, slug: cleaned });
      setDraft(cleaned);
      toast.success("Slug actualizat — URL-ul vechi redirectează automat");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Label htmlFor="venue-slug">
        Slug URL
        <span className="ml-2 text-xs text-muted-foreground">
          epetrecere.md/sali/<strong className="text-foreground">{draft || "—"}</strong>
        </span>
      </Label>
      <div className="mt-1 flex gap-2">
        <Input
          id="venue-slug"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => setDraft((d) => slugify(d))}
          placeholder={venue.slug}
          className="font-mono text-sm"
        />
        {changed && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={commitSlug}
            disabled={saving}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              "Schimbă"
            )}
          </Button>
        )}
      </div>
      {changed && (
        <p className="mt-1 text-xs text-amber-500">
          ⚠ Schimbarea slug-ului va crea un redirect automat de la URL-ul vechi.
          Evită schimbări dese — afectează SEO-ul și link-urile existente.
        </p>
      )}
    </div>
  );
}
