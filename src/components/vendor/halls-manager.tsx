"use client";

import { useEffect, useState } from "react";
import Link from "@/components/shared/locale-link";
import { toast } from "sonner";
import { Loader2, Plus, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Hall = {
  id: number;
  nameRo: string;
  status: string;
  capacityMin: number | null;
  capacityMax: number | null;
};

export function HallsManager({ venueId, venueName }: { venueId: number; venueName: string }) {
  const [halls, setHalls] = useState<Hall[]>([]);
  const [groups, setGroups] = useState<Array<{ id: number; name: string; hallIds: number[] }>>([]);
  const [loading, setLoading] = useState(true);
  const [groupName, setGroupName] = useState("Grand–Garden");
  const [picked, setPicked] = useState<number[]>([]);

  async function load() {
    setLoading(true);
    try {
      const [hallRes, groupRes] = await Promise.all([
        fetch(`/api/venues/${venueId}/halls`),
        fetch(`/api/venues/${venueId}/conflict-groups`),
      ]);
      const hallData = await hallRes.json();
      const groupData = await groupRes.json();
      setHalls(hallData.halls ?? []);
      setGroups(groupData.groups ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [venueId]);

  async function archive(id: number) {
    const res = await fetch(`/api/venues/${venueId}/halls/${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Sala nu a putut fi arhivată");
      return;
    }
    toast.success("Sala a fost arhivată (fără ștergere)");
    void load();
  }

  async function saveGroup() {
    if (picked.length < 2) {
      toast.error("Alege cel puțin două săli din același local");
      return;
    }
    const res = await fetch(`/api/venues/${venueId}/conflict-groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: groupName, hallIds: picked }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || "Grupul de conflict nu a putut fi salvat");
      return;
    }
    toast.success("Grup de conflict salvat");
    setPicked([]);
    void load();
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Săli — {venueName}</h1>
          <p className="text-sm text-muted-foreground">
            O sală nouă rămâne pending până la aprobare. Localul activ rămâne public.
          </p>
        </div>
        <Link href={`/dashboard/locatii/${venueId}/sali/nou`} className="inline-flex h-8 items-center rounded-lg bg-gold px-2.5 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark">
          <Plus className="mr-1.5 h-4 w-4" />
          Adaugă sală
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      ) : halls.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nicio sală. Adaugă cel puțin una înainte de trimiterea la aprobare.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {halls.map((hall) => (
            <Card key={hall.id}>
              <CardContent className="flex items-center gap-3 p-4">
                <Building2 className="h-4 w-4 text-gold" />
                <div className="min-w-0 flex-1">
                  <Link href={`/dashboard/locatii/${venueId}/sali/${hall.id}`} className="font-medium hover:text-gold">
                    {hall.nameRo}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {hall.capacityMin ?? "?"}–{hall.capacityMax ?? "?"} invitați · {hall.status}
                  </p>
                </div>
                {hall.status !== "archived" && (
                  <Button type="button" variant="outline" size="sm" onClick={() => void archive(hall.id)}>
                    Arhivează
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="space-y-3 p-4">
          <h2 className="font-heading text-lg font-semibold">Grupuri de conflict</h2>
          <p className="text-xs text-muted-foreground">
            Sălile din același grup nu pot fi rezervate simultan. Doar săli din acest local.
          </p>
          {groups.map((group) => (
            <p key={group.id} className="text-sm">
              {group.name}: {group.hallIds.join(", ")}
            </p>
          ))}
          <input
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            className="h-9 w-full rounded-md border border-border/50 bg-background px-3 text-sm"
          />
          <div className="flex flex-wrap gap-2">
            {halls.filter((h) => h.status !== "archived").map((hall) => (
              <label key={hall.id} className="flex items-center gap-1 text-xs">
                <input
                  type="checkbox"
                  checked={picked.includes(hall.id)}
                  onChange={(e) =>
                    setPicked((prev) => (e.target.checked ? [...prev, hall.id] : prev.filter((id) => id !== hall.id)))
                  }
                />
                {hall.nameRo}
              </label>
            ))}
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => void saveGroup()}>
            Salvează grupul
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
