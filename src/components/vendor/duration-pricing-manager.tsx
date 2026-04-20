"use client";

// M-Refactor — Duration-based pricing (replaces per-day slot manager).
//
// The old flow forced the artist to publish specific time windows
// (14:00–18:00 · 195€, 19:00–23:00 · 245€, ...). Clients then had to
// pick one of those rigid windows. The new flow is much simpler:
//
//   - Artist declares duration tiers: 1h = 100€, 2h = 150€, 5h = 300€
//   - Tiers apply to ANY start time within the artist's working hours
//   - Clients pick the start time + the duration they want
//
// This panel is powered by the existing `artist_packages` table
// (price + durationHours) via /api/artist-packages.

import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Clock, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Package {
  id: number;
  artistId: number;
  nameRo: string | null;
  descriptionRo: string | null;
  price: number | null;
  durationHours: number | null;
  isVisible: boolean;
}

interface DraftPackage {
  id?: number;
  durationHours: string;
  price: string;
  nameRo: string;
}

function emptyDraft(): DraftPackage {
  return { durationHours: "", price: "", nameRo: "" };
}

export function DurationPricingManager({ artistId }: { artistId: number }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [packages, setPackages] = useState<Package[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<DraftPackage>(emptyDraft());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<DraftPackage>(emptyDraft());

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/artist-packages?artist_id=${artistId}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as Package[];
      // Sort by duration ascending
      data.sort(
        (a, b) => (a.durationHours ?? 99) - (b.durationHours ?? 99),
      );
      setPackages(data);
    } catch {
      toast.error("Nu s-au putut încărca tarifele");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistId]);

  function parseDraft(d: DraftPackage): {
    price: number;
    durationHours: number;
  } | null {
    const duration = Number(d.durationHours.replace(",", "."));
    const price = Number(d.price);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 24) {
      toast.error("Durata trebuie să fie între 0 și 24 ore");
      return null;
    }
    if (!Number.isFinite(price) || price < 0) {
      toast.error("Prețul trebuie să fie un număr pozitiv");
      return null;
    }
    return { price: Math.round(price), durationHours: duration };
  }

  async function createPackage() {
    const parsed = parseDraft(draft);
    if (!parsed) return;
    setSaving(true);
    try {
      const hoursLabel =
        parsed.durationHours === Math.floor(parsed.durationHours)
          ? `${parsed.durationHours}h`
          : `${parsed.durationHours}h`;
      const name = draft.nameRo.trim() || hoursLabel;
      const res = await fetch(`/api/artist-packages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artistId,
          nameRo: name,
          price: parsed.price,
          durationHours: parsed.durationHours,
          isVisible: true,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Tarif adăugat");
      setDraft(emptyDraft());
      setAdding(false);
      await load();
    } catch {
      toast.error("Nu s-a putut salva tariful");
    } finally {
      setSaving(false);
    }
  }

  async function updatePackage(id: number) {
    const parsed = parseDraft(editDraft);
    if (!parsed) return;
    setSaving(true);
    try {
      const name =
        editDraft.nameRo.trim() || `${parsed.durationHours}h`;
      const res = await fetch(`/api/artist-packages/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nameRo: name,
          price: parsed.price,
          durationHours: parsed.durationHours,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Tarif actualizat");
      setEditingId(null);
      await load();
    } catch {
      toast.error("Nu s-a putut salva modificarea");
    } finally {
      setSaving(false);
    }
  }

  async function deletePackage(id: number) {
    if (!confirm("Sigur ștergi acest tarif?")) return;
    try {
      const res = await fetch(`/api/artist-packages/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      toast.success("Tarif șters");
      await load();
    } catch {
      toast.error("Nu s-a putut șterge");
    }
  }

  function startEdit(pkg: Package) {
    setEditingId(pkg.id);
    setEditDraft({
      durationHours: String(pkg.durationHours ?? ""),
      price: String(pkg.price ?? ""),
      nameRo: pkg.nameRo ?? "",
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-border/40 bg-card py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/40 bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg font-bold">Tarife</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Setează prețul pentru fiecare durată (ex. 1h — 100€, 2h — 150€,
              5h — 300€). Clienții aleg o oră de început și durata — tariful se
              aplică automat în orele tale de lucru.
            </p>
          </div>
          {!adding && (
            <Button
              size="sm"
              onClick={() => setAdding(true)}
              className="gap-1.5 bg-gold text-background hover:bg-gold-dark"
            >
              <Plus className="h-4 w-4" />
              Adaugă tarif
            </Button>
          )}
        </div>

        {/* Add form */}
        {adding && (
          <div className="mt-5 rounded-lg border border-gold/30 bg-gold/5 p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_2fr_auto]">
              <div>
                <Label className="text-xs">Durata (ore) *</Label>
                <Input
                  type="number"
                  min="0.5"
                  max="24"
                  step="0.5"
                  value={draft.durationHours}
                  onChange={(e) =>
                    setDraft({ ...draft, durationHours: e.target.value })
                  }
                  placeholder="Ex: 2"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Preț (€) *</Label>
                <Input
                  type="number"
                  min="0"
                  value={draft.price}
                  onChange={(e) =>
                    setDraft({ ...draft, price: e.target.value })
                  }
                  placeholder="Ex: 150"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">
                  Nume (opțional, arătat clientului)
                </Label>
                <Input
                  value={draft.nameRo}
                  onChange={(e) =>
                    setDraft({ ...draft, nameRo: e.target.value })
                  }
                  placeholder="Ex: Pachet standard"
                  className="mt-1"
                  maxLength={120}
                />
              </div>
              <div className="flex items-end gap-2">
                <Button
                  size="sm"
                  onClick={createPackage}
                  disabled={saving}
                  className="gap-1.5 bg-gold text-background hover:bg-gold-dark"
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Salvează
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setAdding(false);
                    setDraft(emptyDraft());
                  }}
                  disabled={saving}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Existing tiers */}
        <div className="mt-5 space-y-2">
          {packages.length === 0 && !adding ? (
            <div className="rounded-lg border border-dashed border-border/40 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Nu ai definit încă tarife.
              </p>
              <p className="mt-1 text-xs text-muted-foreground/70">
                Apasă <strong>Adaugă tarif</strong> pentru prima durată.
              </p>
            </div>
          ) : (
            packages.map((pkg) => {
              const isEditing = editingId === pkg.id;
              return (
                <div
                  key={pkg.id}
                  className={cn(
                    "flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 transition-colors",
                    isEditing
                      ? "border-gold/50 bg-gold/5"
                      : "border-border/40 bg-background/40 hover:border-gold/30",
                  )}
                >
                  {isEditing ? (
                    <>
                      <div className="flex flex-1 flex-wrap gap-2">
                        <div className="w-24">
                          <Label className="text-[10px] uppercase text-muted-foreground">
                            Ore
                          </Label>
                          <Input
                            type="number"
                            min="0.5"
                            max="24"
                            step="0.5"
                            value={editDraft.durationHours}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                durationHours: e.target.value,
                              })
                            }
                            className="mt-0.5 h-9"
                          />
                        </div>
                        <div className="w-28">
                          <Label className="text-[10px] uppercase text-muted-foreground">
                            Preț €
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            value={editDraft.price}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                price: e.target.value,
                              })
                            }
                            className="mt-0.5 h-9"
                          />
                        </div>
                        <div className="min-w-[12rem] flex-1">
                          <Label className="text-[10px] uppercase text-muted-foreground">
                            Nume
                          </Label>
                          <Input
                            value={editDraft.nameRo}
                            onChange={(e) =>
                              setEditDraft({
                                ...editDraft,
                                nameRo: e.target.value,
                              })
                            }
                            className="mt-0.5 h-9"
                            maxLength={120}
                          />
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          onClick={() => updatePackage(pkg.id)}
                          disabled={saving}
                          className="gap-1 bg-gold text-background hover:bg-gold-dark"
                        >
                          {saving ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingId(null)}
                          disabled={saving}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold">
                          <Clock className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-heading text-base font-bold">
                            {pkg.durationHours}h
                            {pkg.price != null && (
                              <span className="ml-2 text-gold">
                                {pkg.price}€
                              </span>
                            )}
                          </p>
                          {pkg.nameRo && (
                            <p className="text-xs text-muted-foreground">
                              {pkg.nameRo}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="ml-auto flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startEdit(pkg)}
                          className="gap-1 text-muted-foreground hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Editează
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deletePackage(pkg.id)}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Helper hint */}
        <p className="mt-4 text-xs text-muted-foreground">
          💡 Orele de lucru (de la / până la) se setează în tab-ul{" "}
          <strong>Grafic de Lucru</strong>. Clienții vor putea alege orice
          oră de început în acel interval, iar tariful se calculează pe baza
          duratei.
        </p>
      </div>
    </div>
  );
}
