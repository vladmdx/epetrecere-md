"use client";

// F-A4 (packages) — Packages manager for the vendor profile.
//
// Wraps /api/artist-packages:
//   - GET  list on mount (hidden packages included for owner)
//   - POST new package
//   - DELETE row
//   - PUT toggle isVisible
//
// We intentionally keep the form lean — nameRo + price + durationHours
// + descriptionRo. The multilingual columns and the visibility toggle
// are fine to leave as follow-ups; every package the owner creates
// starts visible so the public profile reflects it immediately.

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type PackageRow = {
  id: number;
  nameRo: string;
  descriptionRo: string | null;
  price: number | null;
  durationHours: number | null;
  isVisible: boolean;
};

export function PackagesManager({ artistId }: { artistId: number | null }) {
  const [rows, setRows] = useState<PackageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState("");
  const [price, setPrice] = useState<string>("");
  const [hours, setHours] = useState<string>("");
  const [desc, setDesc] = useState("");

  const reload = useCallback(async () => {
    if (!artistId) return;
    try {
      const res = await fetch(`/api/artist-packages?artist_id=${artistId}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("fetch failed");
      const list = (await res.json()) as PackageRow[];
      setRows(list);
    } catch {
      toast.error("Nu am putut încărca pachetele");
    } finally {
      setLoading(false);
    }
  }, [artistId]);

  useEffect(() => {
    if (artistId) reload();
    else setLoading(false);
  }, [artistId, reload]);

  async function add() {
    if (!artistId) return;
    if (name.trim().length < 2) {
      toast.error("Numele pachetului e prea scurt");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/artist-packages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artistId,
          nameRo: name.trim(),
          descriptionRo: desc.trim() || null,
          price: price ? Number(price) : null,
          durationHours: hours ? Number(hours) : null,
          isVisible: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Save failed");
      }
      setName("");
      setPrice("");
      setHours("");
      setDesc("");
      await reload();
      toast.success("Pachet adăugat");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Eroare");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleVisibility(id: number, next: boolean) {
    try {
      const res = await fetch(`/api/artist-packages/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isVisible: next }),
      });
      if (!res.ok) throw new Error("put failed");
      await reload();
    } catch {
      toast.error("Nu am putut actualiza");
    }
  }

  async function remove(id: number) {
    try {
      const res = await fetch(`/api/artist-packages/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("delete failed");
      await reload();
    } catch {
      toast.error("Nu am putut șterge");
    }
  }

  if (!artistId) {
    return (
      <p className="text-sm text-muted-foreground">
        Salvează profilul înainte de a adăuga pachete.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border/40 p-4">
        <Label>Pachet nou</Label>
        <div className="mt-2 grid gap-2">
          <Input
            placeholder="Nume pachet (ex: Nuntă completă)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              placeholder="Preț (€)"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
            <Input
              type="number"
              step="0.5"
              placeholder="Durată (ore)"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>
          <textarea
            rows={3}
            placeholder="Descriere scurtă"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="rounded-md border border-border/40 bg-background px-3 py-2 text-sm"
          />
          <Button onClick={add} disabled={submitting} className="gap-1">
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Adaugă pachet
          </Button>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((p) => (
            <div
              key={p.id}
              className="rounded-lg border border-border/40 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{p.nameRo}</p>
                  {p.descriptionRo && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {p.descriptionRo}
                    </p>
                  )}
                  <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
                    {p.price !== null && (
                      <span>
                        <strong className="text-gold">{p.price}€</strong> preț
                      </span>
                    )}
                    {p.durationHours !== null && (
                      <span>{p.durationHours}h durată</span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      Vizibil
                    </span>
                    <Switch
                      checked={p.isVisible}
                      onCheckedChange={(v) => toggleVisibility(p.id, v)}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(p.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
