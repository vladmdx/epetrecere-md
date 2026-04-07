"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, Edit, GripVertical } from "lucide-react";

const demoCategories = [
  { id: 1, nameRo: "Moderatori / MC", slug: "moderatori", type: "artist", priceFrom: 200, isActive: true, icon: "🎤", artistCount: 15 },
  { id: 2, nameRo: "DJ", slug: "dj", type: "artist", priceFrom: 150, isActive: true, icon: "🎧", artistCount: 22 },
  { id: 3, nameRo: "Cântăreți", slug: "cantareti", type: "artist", priceFrom: 300, isActive: true, icon: "🎵", artistCount: 45 },
  { id: 4, nameRo: "Formații", slug: "formatii", type: "artist", priceFrom: 500, isActive: true, icon: "🎸", artistCount: 12 },
  { id: 5, nameRo: "Fotografi", slug: "fotografi", type: "service", priceFrom: 200, isActive: true, icon: "📷", artistCount: 30 },
  { id: 6, nameRo: "Videografi", slug: "videografi", type: "service", priceFrom: 250, isActive: true, icon: "🎬", artistCount: 18 },
  { id: 7, nameRo: "Decor & Floristică", slug: "decor", type: "service", priceFrom: 100, isActive: true, icon: "🎨", artistCount: 10 },
  { id: 8, nameRo: "Săli & Restaurante", slug: "sali", type: "venue", priceFrom: 25, isActive: true, icon: "🏛️", artistCount: 8 },
];

const typeColors: Record<string, string> = {
  artist: "bg-gold/10 text-gold", service: "bg-info/10 text-info", venue: "bg-success/10 text-success",
};

export default function CategoriesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Categorii</h1>
          <p className="text-sm text-muted-foreground">{demoCategories.length} categorii</p>
        </div>
        <Button className="bg-gold text-background hover:bg-gold-dark gap-2"><Plus className="h-4 w-4" /> Adaugă Categorie</Button>
      </div>

      <div className="space-y-2">
        {demoCategories.map((cat) => (
          <Card key={cat.id} className="transition-all hover:border-gold/30">
            <CardContent className="flex items-center gap-4 py-3">
              <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0" />
              <span className="text-2xl shrink-0">{cat.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{cat.nameRo}</span>
                  <Badge variant="secondary" className={`text-xs ${typeColors[cat.type]}`}>{cat.type}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">/{cat.slug} · de la {cat.priceFrom}€ · {cat.artistCount} artiști</p>
              </div>
              <Switch checked={cat.isActive} />
              <Button variant="ghost" size="icon"><Edit className="h-4 w-4" /></Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
