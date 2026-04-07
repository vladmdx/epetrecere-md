"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale } from "@/hooks/use-locale";
import { Search, CalendarDays } from "lucide-react";

export function SearchBarSection() {
  const { t } = useLocale();
  const router = useRouter();
  const [eventType, setEventType] = useState("");
  const [date, setDate] = useState("");
  const [category, setCategory] = useState("");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (eventType) params.set("event_type", eventType);
    if (date) params.set("date", date);
    if (category) params.set("category", category);
    router.push(`/artisti?${params.toString()}`);
  }

  return (
    <section className="sticky top-16 z-40 border-b border-border/40 bg-card/95 backdrop-blur-sm py-4">
      <form
        onSubmit={handleSearch}
        className="mx-auto flex max-w-5xl flex-col gap-3 px-4 sm:flex-row sm:items-end lg:px-8"
      >
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            {t("search.event_type")}
          </label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— {t("common.all")} —</option>
            <option value="wedding">{t("event_types.wedding")}</option>
            <option value="baptism">{t("event_types.baptism")}</option>
            <option value="cumpatrie">{t("event_types.cumpatrie")}</option>
            <option value="corporate">{t("event_types.corporate")}</option>
            <option value="birthday">{t("event_types.birthday")}</option>
          </select>
        </div>

        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            {t("search.date")}
          </label>
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            {t("search.category")}
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">— {t("common.all")} —</option>
            <option value="1">Moderatori</option>
            <option value="2">DJ</option>
            <option value="3">Cântăreți</option>
            <option value="4">Formații</option>
            <option value="5">Fotografi</option>
            <option value="6">Videografi</option>
          </select>
        </div>

        <Button type="submit" className="bg-gold text-background hover:bg-gold-dark h-10 px-8 gap-2">
          <Search className="h-4 w-4" />
          {t("search.search_button")}
        </Button>
      </form>
    </section>
  );
}
