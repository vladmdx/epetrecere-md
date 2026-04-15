"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { GripVertical, Loader2 } from "lucide-react";
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

interface Category {
  id: number;
  nameRo: string;
  slug: string;
  type: string;
  priceFrom: number | null;
  isActive: boolean;
  icon: string | null;
  sortOrder: number | null;
}

const typeColors: Record<string, string> = {
  artist: "bg-gold/10 text-gold",
  service: "bg-info/10 text-info",
  venue: "bg-success/10 text-success",
};

const typeLabels: Record<string, string> = {
  artist: "Artist",
  service: "Serviciu",
  venue: "Locație",
};

function SortableCategoryCard({ cat }: { cat: Category }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cat.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <Card className="transition-all hover:border-gold/30">
        <CardContent className="flex items-center gap-4 py-3">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing touch-none"
          >
            <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
          <span className="text-2xl shrink-0">{cat.icon || "📁"}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium">{cat.nameRo}</span>
              <Badge variant="secondary" className={`text-xs ${typeColors[cat.type] || ""}`}>
                {typeLabels[cat.type] || cat.type}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              /{cat.slug}
              {cat.priceFrom ? ` · de la ${cat.priceFrom}€` : ""}
            </p>
          </div>
          <Switch checked={cat.isActive} disabled />
        </CardContent>
      </Card>
    </div>
  );
}

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/categories");
        if (res.ok) {
          const data = await res.json();
          setCategories(Array.isArray(data) ? data : []);
        }
      } catch {
        toast.error("Nu s-au putut încărca categoriile");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(categories, oldIndex, newIndex);
    setCategories(reordered);

    // Persist
    const items = reordered.map((c, i) => ({ id: c.id, sortOrder: i }));
    try {
      const res = await fetch("/api/categories/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error();
      toast.success("Ordinea categoriilor a fost salvată");
    } catch {
      toast.error("Nu s-a putut salva ordinea");
    }
  }

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
          <h1 className="font-heading text-2xl font-bold">Categorii</h1>
          <p className="text-sm text-muted-foreground">{categories.length} categorii · Trageți pentru a reordona</p>
        </div>
      </div>

      {categories.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nu există categorii.
          </CardContent>
        </Card>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {categories.map((cat) => (
                <SortableCategoryCard key={cat.id} cat={cat} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
