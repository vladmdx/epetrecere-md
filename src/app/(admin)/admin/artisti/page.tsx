"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Search, Edit, Star, BadgeCheck, Eye, Sparkles, Loader2, GripVertical, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Artist {
  id: number; nameRo: string; slug: string; priceFrom: number | null;
  isActive: boolean; isFeatured: boolean; isVerified: boolean;
  ratingAvg: number | null; ratingCount: number | null;
  location: string | null;
}

function SortableArtistCard({ artist, reorderMode }: { artist: Artist; reorderMode: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: artist.id, disabled: !reorderMode });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="transition-all hover:border-gold/30">
        <CardContent className="flex items-center gap-4 py-3">
          {reorderMode && (
            <button
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing touch-none"
            >
              <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
            </button>
          )}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/10 text-lg">🎵</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium">{artist.nameRo}</span>
              {artist.isVerified && <BadgeCheck className="h-4 w-4 text-gold" />}
              {artist.isFeatured && <Badge className="bg-gold/10 text-gold border-gold/30 text-xs">Featured</Badge>}
              {!artist.isActive && <Badge variant="secondary" className="text-xs">Draft</Badge>}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
              {artist.location && <span>{artist.location}</span>}
              {artist.priceFrom && <span>de la {artist.priceFrom}€</span>}
              {artist.ratingAvg ? <span className="flex items-center gap-1"><Star className="h-3 w-3 fill-gold text-gold" /> {artist.ratingAvg}</span> : null}
            </div>
          </div>
          {!reorderMode && (
            <>
              <Link href={`/artisti/${artist.slug}`} target="_blank"><Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button></Link>
              <Link href={`/admin/artisti/${artist.id}`}><Button variant="ghost" size="icon"><Edit className="h-4 w-4" /></Button></Link>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminArtistsPage() {
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [reorderMode, setReorderMode] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  useEffect(() => {
    (async () => {
      try {
        let allArtists: Artist[] = [];
        let page = 1;
        let hasMore = true;
        while (hasMore) {
          const res = await fetch(`/api/artists?limit=100&page=${page}`);
          if (!res.ok) break;
          const data = await res.json();
          const items = data.items || [];
          allArtists = [...allArtists, ...items];
          hasMore = items.length === 100;
          page++;
        }
        setArtists(allArtists);
      } catch {
        toast.error("Nu s-au putut încărca artiștii");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = reorderMode
    ? artists
    : artists.filter((a) => a.nameRo.toLowerCase().includes(search.toLowerCase()));

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = artists.findIndex((a) => a.id === active.id);
    const newIndex = artists.findIndex((a) => a.id === over.id);
    const reordered = arrayMove(artists, oldIndex, newIndex);
    setArtists(reordered);

    const items = reordered.map((a, i) => ({ id: a.id, sortOrder: i }));
    try {
      const res = await fetch("/api/artists/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error();
      toast.success("Ordinea artiștilor a fost salvată");
    } catch {
      toast.error("Nu s-a putut salva ordinea");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Artiști</h1>
          <p className="text-sm text-muted-foreground">{artists.length} artiști în baza de date</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={reorderMode ? "default" : "outline"}
            className={reorderMode ? "bg-gold text-background hover:bg-gold-dark gap-2" : "gap-2"}
            onClick={() => setReorderMode(!reorderMode)}
          >
            <ArrowUpDown className="h-4 w-4" /> {reorderMode ? "Gata" : "Reordonează"}
          </Button>
          <Link href="/admin/import"><Button variant="outline" className="gap-2"><Sparkles className="h-4 w-4" /> Import</Button></Link>
          <Link href="/admin/artisti/new"><Button className="bg-gold text-background hover:bg-gold-dark gap-2"><Plus className="h-4 w-4" /> Adaugă Artist</Button></Link>
        </div>
      </div>

      {!reorderMode && (
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Caută artiști..." className="pl-9" />
        </div>
      )}

      {reorderMode && (
        <p className="text-sm text-muted-foreground">Trageți artiștii pentru a schimba ordinea de afișare pe site.</p>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gold" /></div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={filtered.map((a) => a.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {filtered.map((artist) => (
                <SortableArtistCard key={artist.id} artist={artist} reorderMode={reorderMode} />
              ))}
              {filtered.length === 0 && <p className="py-8 text-center text-muted-foreground">Nu s-au găsit artiști</p>}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
