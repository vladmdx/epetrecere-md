"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CustomCalendar } from "@/components/public/custom-calendar";
import { useLocale } from "@/hooks/use-locale";
import {
  Search, ChevronDown,
  Heart, Baby, Users, Building2, PartyPopper, Sparkles,
  Mic2, Disc3, Music2, Guitar, Camera, Video,
} from "lucide-react";
import { cn } from "@/lib/utils";

function getTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}

function formatDate(d: Date) {
  return d.toISOString().split("T")[0];
}

const eventTypes = [
  { value: "", label: "Toate", icon: Sparkles },
  { value: "wedding", label: "Nuntă", icon: Heart },
  { value: "baptism", label: "Botez", icon: Baby },
  { value: "cumpatrie", label: "Cumpătrie", icon: Users },
  { value: "corporate", label: "Corporate", icon: Building2 },
  { value: "birthday", label: "Aniversare", icon: PartyPopper },
];

const categories = [
  { value: "", label: "Toate", icon: Sparkles },
  { value: "1", label: "Moderatori", icon: Mic2 },
  { value: "2", label: "DJ", icon: Disc3 },
  { value: "3", label: "Cântăreți", icon: Music2 },
  { value: "4", label: "Formații", icon: Guitar },
  { value: "5", label: "Fotografi", icon: Camera },
  { value: "6", label: "Videografi", icon: Video },
];

// Custom Dropdown
function CustomDropdown({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: { value: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = items.find((i) => i.value === value) || items[0];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className="flex-1" ref={ref}>
      <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gold/70">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "relative flex h-12 w-full items-center gap-3 rounded-xl border px-4 text-sm transition-all duration-200",
          "bg-[#1A1A2E]/80 backdrop-blur-sm",
          open
            ? "border-gold/50 shadow-[0_0_15px_rgba(201,168,76,0.15)] ring-1 ring-gold/20"
            : "border-white/10 hover:border-gold/30 hover:shadow-[0_0_10px_rgba(201,168,76,0.08)]"
        )}
      >
        <selected.icon className="h-4 w-4 text-gold shrink-0" />
        <span className="flex-1 text-left text-white/90 truncate">{selected.label}</span>
        <ChevronDown className={cn("h-4 w-4 text-gold/60 transition-transform duration-200", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-[calc(100%-2rem)] sm:w-auto sm:min-w-[220px] rounded-xl border border-gold/20 bg-[#141428]/98 backdrop-blur-xl p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
          {items.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => { onChange(item.value); setOpen(false); }}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all duration-150",
                item.value === value
                  ? "bg-gold/15 text-gold"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              )}
            >
              <item.icon className={cn("h-4 w-4 shrink-0", item.value === value ? "text-gold" : "text-white/40")} />
              <span>{item.label}</span>
              {item.value === value && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-gold" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SearchBarSection() {
  const { t } = useLocale();
  const router = useRouter();
  const [eventType, setEventType] = useState("");
  const [date, setDate] = useState(getTomorrow());
  const [category, setCategory] = useState("");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (eventType) params.set("event_type", eventType);
    if (date) params.set("date", formatDate(date));
    if (category) params.set("category", category);
    router.push(`/artisti?${params.toString()}`);
  }

  return (
    <section className="sticky top-16 z-40 border-b border-gold/10 bg-[#0D0D0D]/90 backdrop-blur-md py-5">
      <form
        onSubmit={handleSearch}
        className="mx-auto flex max-w-5xl flex-col gap-3 px-4 sm:flex-row sm:items-end lg:px-8"
      >
        <CustomDropdown
          label={t("search.event_type")}
          items={eventTypes}
          value={eventType}
          onChange={setEventType}
        />

        <CustomCalendar
          label={t("search.date")}
          value={date}
          onChange={setDate}
        />

        <CustomDropdown
          label={t("search.category")}
          items={categories}
          value={category}
          onChange={setCategory}
        />

        <Button
          type="submit"
          className="h-12 rounded-xl bg-gold text-[#0D0D0D] hover:bg-gold-dark px-8 gap-2 font-semibold text-sm shadow-[0_4px_20px_rgba(201,168,76,0.25)] hover:shadow-[0_4px_25px_rgba(201,168,76,0.4)] transition-all duration-200"
        >
          <Search className="h-4 w-4" />
          {t("search.search_button")}
        </Button>
      </form>
    </section>
  );
}
