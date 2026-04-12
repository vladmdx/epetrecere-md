"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Edit, GripVertical, Loader2 } from "lucide-react";

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

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/categories");
        if (res.ok) {
          const data = await res.json();
          setCategories(Array.isArray(data) ? data : []);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
          <p className="text-sm text-muted-foreground">{categories.length} categorii</p>
        </div>
      </div>

      {categories.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            Nu există categorii.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {categories.map((cat) => (
            <Card key={cat.id} className="transition-all hover:border-gold/30">
              <CardContent className="flex items-center gap-4 py-3">
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
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
          ))}
        </div>
      )}
    </div>
  );
}
