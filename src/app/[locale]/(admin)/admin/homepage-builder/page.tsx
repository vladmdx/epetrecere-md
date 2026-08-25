"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { GripVertical, Eye, Save, Loader2, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useLocale } from "@/hooks/use-locale";

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

const labelMap: Record<string, { labelKey: string; icon: string }> = {
  hero: { labelKey: "admin.homepageBuilder.section.hero", icon: "🎬" },
  search_bar: { labelKey: "admin.homepageBuilder.section.searchBar", icon: "🔍" },
  categories: { labelKey: "admin.homepageBuilder.section.categories", icon: "📂" },
  featured_artists: { labelKey: "admin.homepageBuilder.section.featuredArtists", icon: "⭐" },
  featured_venues: { labelKey: "admin.homepageBuilder.section.featuredVenues", icon: "🏛️" },
  event_planner: { labelKey: "admin.homepageBuilder.section.eventPlanner", icon: "📋" },
  services: { labelKey: "admin.homepageBuilder.section.services", icon: "🛠️" },
  process: { labelKey: "admin.homepageBuilder.section.process", icon: "📌" },
  testimonials: { labelKey: "admin.homepageBuilder.section.testimonials", icon: "💬" },
  stats: { labelKey: "admin.homepageBuilder.section.stats", icon: "📊" },
  clients: { labelKey: "admin.homepageBuilder.section.clients", icon: "🏢" },
  blog: { labelKey: "admin.homepageBuilder.section.blog", icon: "📝" },
  cta: { labelKey: "admin.homepageBuilder.section.cta", icon: "🎯" },
};

interface Section {
  id: number;
  type: string;
  sortOrder: number;
  isVisible: boolean;
}

export default function HomepageBuilderPage() {
  const { t } = useLocale();
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

  function toggleVisibility(type: string) {
    setSections((prev) =>
      prev.map((s) => (s.type === type ? { ...s, isVisible: !s.isVisible } : s)),
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
      if (res.ok) {
        setDirty(false);
        toast.success(t("admin.homepageBuilder.saved"));
      } else {
        toast.error(t("admin.homepageBuilder.saveError"));
      }
    } catch {
      toast.error(t("admin.homepageBuilder.saveError"));
    } finally {
      setSaving(false);
    }
  }, [sections, t]);

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
          <h1 className="font-heading text-2xl font-bold">
            {t("admin.homepageBuilder.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("admin.homepageBuilder.subtitle")}
          </p>
        </div>
        <div className="flex gap-2">
          <a href="/" target="_blank">
            <Button variant="outline" className="gap-2">
              <Eye className="h-4 w-4" /> {t("admin.homepageBuilder.preview")}
            </Button>
          </a>
          <Button
            className="bg-gold text-[#0D0D0D] hover:bg-gold-dark gap-2"
            onClick={save}
            disabled={saving || !dirty}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving
              ? t("admin.homepageBuilder.saving")
              : dirty
                ? t("admin.homepageBuilder.saveDirty")
                : t("admin.homepageBuilder.savedState")}
          </Button>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        {t("admin.homepageBuilder.hint")}
      </p>

      <div className="space-y-2">
        {sections.map((section, index) => {
          const meta = labelMap[section.type];
          const label = meta ? t(meta.labelKey) : section.type;
          const icon = meta ? meta.icon : "📦";
          return (
            <Card
              key={section.type}
              className={cn(
                "transition-all",
                !section.isVisible && "opacity-50",
              )}
            >
              <CardContent className="flex items-center gap-4 py-3">
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-xl shrink-0">{icon}</span>
                <div className="flex-1">
                  <span className="font-medium text-sm">{label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {section.type}
                  </span>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("admin.homepageBuilder.moveUp")}
                    className="h-7 w-7"
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("admin.homepageBuilder.moveDown")}
                    className="h-7 w-7"
                    onClick={() => moveDown(index)}
                    disabled={index === sections.length - 1}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Switch
                  checked={section.isVisible}
                  onCheckedChange={() => toggleVisibility(section.type)}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
