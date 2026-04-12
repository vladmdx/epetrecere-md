"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { GripVertical, Eye, Save, Loader2, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";

// Fallback sections when DB is empty (initial seed)
const defaultSections = [
  { id: 0, type: "hero", sortOrder: 0, isVisible: true },
  { id: 0, type: "search_bar", sortOrder: 1, isVisible: true },
  { id: 0, type: "categories", sortOrder: 2, isVisible: true },
  { id: 0, type: "featured_artists", sortOrder: 3, isVisible: true },
  { id: 0, type: "featured_venues", sortOrder: 4, isVisible: true },
  { id: 0, type: "event_planner", sortOrder: 5, isVisible: false },
  { id: 0, type: "services", sortOrder: 6, isVisible: false },
  { id: 0, type: "process", sortOrder: 7, isVisible: true },
  { id: 0, type: "testimonials", sortOrder: 8, isVisible: false },
  { id: 0, type: "stats", sortOrder: 9, isVisible: false },
  { id: 0, type: "clients", sortOrder: 10, isVisible: false },
  { id: 0, type: "blog", sortOrder: 11, isVisible: false },
  { id: 0, type: "cta", sortOrder: 12, isVisible: true },
];

const labelMap: Record<string, { label: string; icon: string }> = {
  hero: { label: "Hero Section", icon: "🎬" },
  search_bar: { label: "Quick Search Bar", icon: "🔍" },
  categories: { label: "Categorii", icon: "📂" },
  featured_artists: { label: "Artiști Recomandați", icon: "⭐" },
  featured_venues: { label: "Săli Recomandate", icon: "🏛️" },
  event_planner: { label: "Event Planner Teaser", icon: "📋" },
  services: { label: "Servicii Extra", icon: "🛠️" },
  process: { label: "Cum Funcționează", icon: "📌" },
  testimonials: { label: "Testimoniale", icon: "💬" },
  stats: { label: "Statistici Counter", icon: "📊" },
  clients: { label: "Logo-uri Clienți", icon: "🏢" },
  blog: { label: "Articole Blog", icon: "📝" },
  cta: { label: "CTA Final", icon: "🎯" },
};

interface Section {
  id: number;
  type: string;
  sortOrder: number;
  isVisible: boolean;
}

export default function HomepageBuilderPage() {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    fetch("/api/homepage-sections")
      .then((r) => r.json())
      .then((data: Section[]) => {
        setSections(
          Array.isArray(data) && data.length > 0
            ? data.sort((a, b) => a.sortOrder - b.sortOrder)
            : defaultSections,
        );
        setLoading(false);
      })
      .catch(() => {
        setSections(defaultSections);
        setLoading(false);
      });
  }, []);

  function toggleVisibility(id: number) {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isVisible: !s.isVisible } : s)),
    );
    setDirty(true);
  }

  function moveUp(index: number) {
    if (index === 0) return;
    setSections((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next.map((s, i) => ({ ...s, sortOrder: i }));
    });
    setDirty(true);
  }

  function moveDown(index: number) {
    if (index >= sections.length - 1) return;
    setSections((prev) => {
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next.map((s, i) => ({ ...s, sortOrder: i }));
    });
    setDirty(true);
  }

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/homepage-sections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sections: sections.map((s, i) => ({
            id: s.id,
            type: s.type,
            sortOrder: i,
            isVisible: s.isVisible,
          })),
        }),
      });
      if (res.ok) setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [sections]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-bold">Homepage Builder</h1>
          <p className="text-sm text-muted-foreground">
            Gestionează secțiunile homepage-ului
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/" target="_blank">
            <Button variant="outline" className="gap-2">
              <Eye className="h-4 w-4" /> Preview
            </Button>
          </a>
          <Button
            className="bg-gold text-background hover:bg-gold-dark gap-2"
            onClick={save}
            disabled={saving || !dirty}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? "Se salvează..." : dirty ? "Salvează *" : "Salvat"}
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Folosește săgețile pentru a reordona secțiunile. Activează/dezactivează
        vizibilitatea cu switch-ul.
      </p>

      <div className="space-y-2">
        {sections.map((section, index) => {
          const meta = labelMap[section.type] || {
            label: section.type,
            icon: "📦",
          };
          return (
            <Card
              key={section.id || section.type}
              className={cn(
                "transition-all",
                !section.isVisible && "opacity-50",
              )}
            >
              <CardContent className="flex items-center gap-4 py-3">
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-xl shrink-0">{meta.icon}</span>
                <div className="flex-1">
                  <span className="font-medium text-sm">{meta.label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {section.type}
                  </span>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => moveDown(index)}
                    disabled={index === sections.length - 1}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Switch
                  checked={section.isVisible}
                  onCheckedChange={() => toggleVisibility(section.id)}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
