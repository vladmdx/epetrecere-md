"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  PackageOpen,
} from "lucide-react";
import { toast } from "sonner";

// M1 #3 — Vendor packages CRUD page.
// Lists all packages (including hidden) for the signed-in artist and provides
// a modal-based editor for create/edit + inline delete/toggle-visibility.

type Pkg = {
  id: number;
  artistId: number;
  nameRo: string;
  nameRu: string | null;
  nameEn: string | null;
  descriptionRo: string | null;
  descriptionRu: string | null;
  descriptionEn: string | null;
  price: number | null;
  durationHours: number | null;
  isVisible: boolean;
};

type FormState = {
  id: number | null;
  nameRo: string;
  nameRu: string;
  nameEn: string;
  descriptionRo: string;
  descriptionRu: string;
  descriptionEn: string;
  price: string;
  durationHours: string;
  isVisible: boolean;
};

const emptyForm: FormState = {
  id: null,
  nameRo: "",
  nameRu: "",
  nameEn: "",
  descriptionRo: "",
  descriptionRu: "",
  descriptionEn: "",
  price: "",
  durationHours: "",
  isVisible: true,
};

export default function VendorPackagesPage() {
  const { user, isLoaded } = useUser();
  const [artistId, setArtistId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Resolve the signed-in user's artistId (same pattern the Rezervări page uses).
  useEffect(() => {
    if (!isLoaded) return;
    (async () => {
      try {
        const email = user?.primaryEmailAddress?.emailAddress;
        if (!email) {
          setArtistId(null);
          setLoading(false);
          return;
        }
        const r = await fetch(`/api/auth/check-role?email=${encodeURIComponent(email)}`);
        const data = await r.json();
        setArtistId(data.artistId ?? null);
      } catch {
        setArtistId(null);
      }
    })();
  }, [isLoaded, user]);

  // Load packages whenever the artistId becomes known.
  useEffect(() => {
    if (artistId == null) return;
    (async () => {
      setLoading(true);
      try {
        const r = await fetch(`/api/artist-packages?artist_id=${artistId}`);
        if (!r.ok) throw new Error();
        const data = await r.json();
        setPkgs(Array.isArray(data) ? data : []);
      } catch {
        toast.error("Nu s-au putut încărca pachetele");
      } finally {
        setLoading(false);
      }
    })();
  }, [artistId]);

  function openCreate() {
    setForm(emptyForm);
    setOpen(true);
  }

  function openEdit(p: Pkg) {
    setForm({
      id: p.id,
      nameRo: p.nameRo,
      nameRu: p.nameRu ?? "",
      nameEn: p.nameEn ?? "",
      descriptionRo: p.descriptionRo ?? "",
      descriptionRu: p.descriptionRu ?? "",
      descriptionEn: p.descriptionEn ?? "",
      price: p.price != null ? String(p.price) : "",
      durationHours: p.durationHours != null ? String(p.durationHours) : "",
      isVisible: p.isVisible,
    });
    setOpen(true);
  }

  async function handleSave() {
    if (!form.nameRo.trim()) {
      toast.error("Numele pachetului (RO) este obligatoriu.");
      return;
    }
    if (artistId == null) return;
    setSaving(true);

    const payload = {
      artistId,
      nameRo: form.nameRo.trim(),
      nameRu: form.nameRu.trim() || null,
      nameEn: form.nameEn.trim() || null,
      descriptionRo: form.descriptionRo.trim() || null,
      descriptionRu: form.descriptionRu.trim() || null,
      descriptionEn: form.descriptionEn.trim() || null,
      price: form.price ? Number(form.price) : null,
      durationHours: form.durationHours ? Number(form.durationHours) : null,
      isVisible: form.isVisible,
    };

    try {
      if (form.id) {
        // Update: server ignores artistId on PUT — scope resolved via id.
        const { artistId: _omit, ...updateBody } = payload;
        void _omit;
        const res = await fetch(`/api/artist-packages/${form.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updateBody),
        });
        if (!res.ok) throw new Error();
        const updated = await res.json();
        setPkgs((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        toast.success("Pachet actualizat.");
      } else {
        const res = await fetch(`/api/artist-packages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error();
        const created = await res.json();
        setPkgs((prev) => [...prev, created]);
        toast.success("Pachet creat.");
      }
      setOpen(false);
    } catch {
      toast.error("Nu am putut salva pachetul.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Sigur ștergi acest pachet?")) return;
    const res = await fetch(`/api/artist-packages/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Nu am putut șterge pachetul.");
      return;
    }
    setPkgs((prev) => prev.filter((p) => p.id !== id));
    toast.success("Pachet șters.");
  }

  async function toggleVisibility(p: Pkg) {
    const res = await fetch(`/api/artist-packages/${p.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isVisible: !p.isVisible }),
    });
    if (!res.ok) {
      toast.error("Nu am putut actualiza vizibilitatea.");
      return;
    }
    const updated = await res.json();
    setPkgs((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
  }

  if (!isLoaded || loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (artistId == null) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          Nu ești asociat cu niciun profil de artist. Completează onboarding-ul pentru a putea crea pachete.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">Pachete</h1>
          <p className="text-sm text-muted-foreground">
            {pkgs.length} {pkgs.length === 1 ? "pachet" : "pachete"} — apar pe profilul tău public în tab-ul &ldquo;Pachete&rdquo;.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2 bg-gold text-background hover:bg-gold-dark">
          <Plus className="h-4 w-4" /> Pachet nou
        </Button>
      </div>

      {pkgs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <PackageOpen className="h-10 w-10 text-muted-foreground/60" />
            <p>Nu ai pachete încă.</p>
            <Button size="sm" variant="outline" onClick={openCreate} className="gap-1">
              <Plus className="h-4 w-4" /> Creează primul pachet
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {pkgs.map((p) => (
            <Card key={p.id} className={p.isVisible ? "" : "opacity-60"}>
              <CardContent className="flex flex-col gap-3 py-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h3 className="font-heading text-base font-bold">{p.nameRo}</h3>
                    {p.descriptionRo && (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {p.descriptionRo}
                      </p>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      p.isVisible
                        ? "border-success/40 bg-success/10 text-success"
                        : "border-border/40 text-muted-foreground"
                    }
                  >
                    {p.isVisible ? "Vizibil" : "Ascuns"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 text-sm">
                    {p.price != null && (
                      <span className="font-accent text-lg font-semibold text-gold">{p.price}€</span>
                    )}
                    {p.durationHours != null && (
                      <span className="text-xs text-muted-foreground">{p.durationHours}h</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => toggleVisibility(p)}
                      className="h-8 w-8 p-0"
                      aria-label={p.isVisible ? "Ascunde" : "Publică"}
                    >
                      {p.isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEdit(p)}
                      className="h-8 w-8 p-0"
                      aria-label="Editează"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(p.id)}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      aria-label="Șterge"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editează pachet" : "Pachet nou"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid gap-2">
              <label className="text-xs font-medium uppercase text-muted-foreground">Nume (RO) *</label>
              <Input
                value={form.nameRo}
                onChange={(e) => setForm((f) => ({ ...f, nameRo: e.target.value }))}
                placeholder="ex. Pachet Premium Nuntă"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-xs font-medium uppercase text-muted-foreground">Nume (RU)</label>
                <Input
                  value={form.nameRu}
                  onChange={(e) => setForm((f) => ({ ...f, nameRu: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-medium uppercase text-muted-foreground">Nume (EN)</label>
                <Input
                  value={form.nameEn}
                  onChange={(e) => setForm((f) => ({ ...f, nameEn: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-medium uppercase text-muted-foreground">Descriere (RO)</label>
              <textarea
                value={form.descriptionRo}
                onChange={(e) => setForm((f) => ({ ...f, descriptionRo: e.target.value }))}
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="Ce include pachetul..."
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-xs font-medium uppercase text-muted-foreground">Preț (€)</label>
                <Input
                  type="number"
                  min={0}
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-medium uppercase text-muted-foreground">Durată (ore)</label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={form.durationHours}
                  onChange={(e) => setForm((f) => ({ ...f, durationHours: e.target.value }))}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isVisible}
                onChange={(e) => setForm((f) => ({ ...f, isVisible: e.target.checked }))}
                className="h-4 w-4 rounded border-input"
              />
              Publică pachetul pe profilul public
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Anulează
            </Button>
            <Button onClick={handleSave} disabled={saving} className="bg-gold text-background hover:bg-gold-dark">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvează"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
