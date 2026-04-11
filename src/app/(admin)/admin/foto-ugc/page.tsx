"use client";

// M5 — Admin UGC moderation queue. Lists event photos uploaded by clients
// on their event plans; admin approves (optionally makes public) or rejects.
// Approved + public + artist-tagged photos surface in the public gallery
// on the tagged artist's profile page.

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Trash2,
  Eye,
  EyeOff,
  ImageIcon,
} from "lucide-react";
import { toast } from "sonner";

interface AdminPhotoRow {
  photo: {
    id: number;
    url: string;
    caption: string | null;
    isPublic: boolean;
    isApproved: boolean;
    taggedArtistId: number | null;
    taggedVenueId: number | null;
    createdAt: string;
  };
  planTitle: string | null;
  planEventType: string | null;
  planEventDate: string | null;
  uploaderName: string | null;
  uploaderEmail: string | null;
  artistNameRo: string | null;
  artistSlug: string | null;
  venueNameRo: string | null;
  venueSlug: string | null;
}

export default function AdminUgcPhotosPage() {
  const [rows, setRows] = useState<AdminPhotoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "approved" | "all">("pending");

  async function load(status: typeof filter) {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/event-photos?status=${status}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setRows(data.photos ?? []);
    } catch {
      toast.error("Nu am putut încărca fotografiile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function approve(row: AdminPhotoRow, makePublic: boolean) {
    const res = await fetch(`/api/admin/event-photos/${row.photo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isApproved: true, isPublic: makePublic }),
    });
    if (!res.ok) {
      toast.error("Nu am putut aproba.");
      return;
    }
    toast.success(makePublic ? "Aprobat și publicat." : "Aprobat.");
    setRows((prev) => prev.filter((r) => r.photo.id !== row.photo.id));
  }

  async function reject(row: AdminPhotoRow) {
    if (!confirm("Sigur vrei să ștergi această fotografie?")) return;
    const res = await fetch(`/api/admin/event-photos/${row.photo.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Nu am putut șterge.");
      return;
    }
    toast.success("Fotografie ștearsă.");
    setRows((prev) => prev.filter((r) => r.photo.id !== row.photo.id));
  }

  async function togglePublic(row: AdminPhotoRow) {
    const res = await fetch(`/api/admin/event-photos/${row.photo.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isPublic: !row.photo.isPublic }),
    });
    if (!res.ok) {
      toast.error("Nu am putut actualiza.");
      return;
    }
    setRows((prev) =>
      prev.map((r) =>
        r.photo.id === row.photo.id
          ? { ...r, photo: { ...r.photo, isPublic: !r.photo.isPublic } }
          : r,
      ),
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Fotografii UGC</h1>
        <p className="text-sm text-muted-foreground">
          Moderare fotografii încărcate de clienți pe planurile de eveniment.
        </p>
      </div>

      <div className="flex gap-2">
        {(["pending", "approved", "all"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            className={
              filter === f ? "bg-gold text-background hover:bg-gold-dark" : ""
            }
            onClick={() => setFilter(f)}
          >
            {f === "pending"
              ? "În așteptare"
              : f === "approved"
                ? "Aprobate"
                : "Toate"}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-gold" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16 text-muted-foreground">
            <ImageIcon className="mb-3 h-10 w-10" />
            <p>Nicio fotografie {filter === "pending" ? "de verificat" : ""}.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => (
            <Card key={row.photo.id} className="overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={row.photo.url}
                alt={row.photo.caption || "Event photo"}
                className="aspect-video w-full object-cover"
                loading="lazy"
              />
              <CardContent className="space-y-3 p-4">
                <div className="flex items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      row.photo.isApproved
                        ? "border-emerald-500/30 text-emerald-500"
                        : "border-amber-500/30 text-amber-500"
                    }
                  >
                    {row.photo.isApproved ? (
                      <ShieldCheck className="mr-1 h-3 w-3" />
                    ) : (
                      <ShieldAlert className="mr-1 h-3 w-3" />
                    )}
                    {row.photo.isApproved ? "Aprobat" : "În verificare"}
                  </Badge>
                  <Badge variant="outline">
                    {row.photo.isPublic ? "Public" : "Privat"}
                  </Badge>
                </div>

                {row.photo.caption && (
                  <p className="text-sm">{row.photo.caption}</p>
                )}

                <div className="space-y-1 text-xs text-muted-foreground">
                  {row.planTitle && (
                    <p>
                      <span className="font-medium text-foreground">Plan:</span>{" "}
                      {row.planTitle}
                      {row.planEventType && ` · ${row.planEventType}`}
                    </p>
                  )}
                  {row.uploaderName && (
                    <p>
                      <span className="font-medium text-foreground">De la:</span>{" "}
                      {row.uploaderName}
                      {row.uploaderEmail && ` · ${row.uploaderEmail}`}
                    </p>
                  )}
                  {row.artistNameRo && (
                    <p>
                      <span className="font-medium text-foreground">Tag artist:</span>{" "}
                      {row.artistNameRo}
                    </p>
                  )}
                  {row.venueNameRo && (
                    <p>
                      <span className="font-medium text-foreground">Tag sală:</span>{" "}
                      {row.venueNameRo}
                    </p>
                  )}
                  <p>{new Date(row.photo.createdAt).toLocaleString("ro-MD")}</p>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  {!row.photo.isApproved ? (
                    <>
                      <Button
                        size="sm"
                        className="bg-success text-white hover:bg-success/90"
                        onClick={() => approve(row, true)}
                      >
                        <ShieldCheck className="mr-1 h-3.5 w-3.5" />
                        Aprobă + public
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => approve(row, false)}
                      >
                        Doar aprobă
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => togglePublic(row)}
                    >
                      {row.photo.isPublic ? (
                        <>
                          <EyeOff className="mr-1 h-3.5 w-3.5" /> Ascunde
                        </>
                      ) : (
                        <>
                          <Eye className="mr-1 h-3.5 w-3.5" /> Fă public
                        </>
                      )}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => reject(row)}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Șterge
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
