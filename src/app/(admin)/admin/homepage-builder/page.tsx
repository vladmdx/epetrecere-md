"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { GripVertical, Edit, Eye, Save } from "lucide-react";
import { cn } from "@/lib/utils";

const initialSections = [
  { id: 1, type: "hero", label: "Hero Section", icon: "🎬", visible: true },
  { id: 2, type: "search_bar", label: "Quick Search Bar", icon: "🔍", visible: true },
  { id: 3, type: "categories", label: "Categorii", icon: "📂", visible: true },
  { id: 4, type: "featured_artists", label: "Artiști Recomandați", icon: "⭐", visible: true },
  { id: 5, type: "featured_venues", label: "Săli Recomandate", icon: "🏛️", visible: true },
  { id: 6, type: "event_planner", label: "Event Planner Teaser", icon: "📋", visible: false },
  { id: 7, type: "services", label: "Servicii Extra", icon: "🛠️", visible: false },
  { id: 8, type: "process", label: "Cum Funcționează", icon: "📌", visible: true },
  { id: 9, type: "testimonials", label: "Testimoniale", icon: "💬", visible: false },
  { id: 10, type: "stats", label: "Statistici Counter", icon: "📊", visible: false },
  { id: 11, type: "clients", label: "Logo-uri Clienți", icon: "🏢", visible: false },
  { id: 12, type: "blog", label: "Articole Blog", icon: "📝", visible: false },
  { id: 13, type: "cta", label: "CTA Final", icon: "🎯", visible: true },
];

export default function HomepageBuilderPage() {
  const [sections, setSections] = useState(initialSections);

  function toggleVisibility(id: number) {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, visible: !s.visible } : s)),
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Homepage Builder</h1>
          <p className="text-sm text-muted-foreground">Gestionează secțiunile homepage-ului</p>
        </div>
        <div className="flex gap-2">
          <a href="/" target="_blank"><Button variant="outline" className="gap-2"><Eye className="h-4 w-4" /> Preview</Button></a>
          <Button className="bg-gold text-background hover:bg-gold-dark gap-2"><Save className="h-4 w-4" /> Salvează</Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Trage secțiunile pentru a le reordona. Activează/dezactivează vizibilitatea.
      </p>

      <div className="space-y-2">
        {sections.map((section) => (
          <Card key={section.id} className={cn("transition-all", !section.visible && "opacity-50")}>
            <CardContent className="flex items-center gap-4 py-3">
              <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0" />
              <span className="text-xl shrink-0">{section.icon}</span>
              <div className="flex-1">
                <span className="font-medium text-sm">{section.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">{section.type}</span>
              </div>
              <Switch checked={section.visible} onCheckedChange={() => toggleVisibility(section.id)} />
              <Button variant="ghost" size="icon"><Edit className="h-4 w-4" /></Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
