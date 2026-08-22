"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { CustomCalendar } from "@/components/public/custom-calendar";
import { useLocale } from "@/hooks/use-locale";
import { Baby, Briefcase, Cake, ChevronDown, Church, Heart, MapPin, Music, PartyPopper, Search, Sparkles, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { MOLDOVA_CITIES, DEFAULT_CITY } from "@/lib/moldova-cities";
import { ALL_EVENT_TYPES, eventTypeLabel, type EventTypeKey } from "@/lib/events/normalize";

function getTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}

function formatDate(d: Date) {
  return d.toISOString().split("T")[0];
}

// Localitati: full Moldova list. Default Chișinău. The first slot used to
// be event-type — replaced now because the homepage search drives the
// "find an artist near me" flow rather than full event planning (that
// lives on /planifica).
const localityItems = MOLDOVA_CITIES.map((city) => ({
  value: city,
  label: city,
  icon: MapPin,
}));

interface CategoryItem {
  value: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * The homepage search is now event-driven, not artist-category-driven.
 * Picking an event type funnels the user into /planifica with that type
 * pre-selected — the wizard does the rest of the work (services, budget,
 * artist matching). Keeping the city + date inputs gives the wizard
 * usable context on step 1.
 */
/** One lucide icon per event type; the label comes from the shared table. */
const EVENT_TYPE_ICONS: Record<EventTypeKey, CategoryItem["icon"]> = {
  wedding: Heart,
  cununie: Church,
  baptism: Baby,
  cumatrie: Users,
  birthday: Cake,
  kids_birthday: PartyPopper,
  corporate: Briefcase,
  concert: Music,
  other: Sparkles,
};

const EVENT_TYPE_ITEMS: CategoryItem[] = [
  { value: "", label: "Alege evenimentul", icon: Sparkles },
  ...ALL_EVENT_TYPES.map((k) => ({
    value: k,
    label: eventTypeLabel(k),
    icon: EVENT_TYPE_ICONS[k],
  })),
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
  const { isSignedIn, isLoaded } = useUser();
  const [city, setCity] = useState(DEFAULT_CITY);
  const [date, setDate] = useState(getTomorrow());
  const [eventType, setEventType] = useState("");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    // Funnel into /planifica with the event picked + city/date prefilled.
    // The planifica wizard owns the rest of the matching logic now —
    // homepage search is just a smart entry point, not a parallel artist
    // filter.
    const params = new URLSearchParams();
    if (eventType) params.set("eventType", eventType);
    if (city) params.set("city", city);
    if (date) params.set("date", formatDate(date));
    const target = `/planifica?${params.toString()}`;

    // /planifica is a public page — no auth gate needed for browsing the
    // wizard. Sign-in is enforced only on submit (last step), where the
    // wizard already redirects through Clerk's forceRedirectUrl flow.
    void isSignedIn;
    void isLoaded;
    router.push(target);
  }

  return (
    <section className="border-b border-gold/10 bg-[#0D0D0D]/90 py-5">
      <form
        onSubmit={handleSearch}
        className="mx-auto flex max-w-5xl flex-col gap-3 px-4 sm:flex-row sm:items-end lg:px-8"
      >
        <CustomDropdown
          label={t("search.location") ?? "Localitate"}
          items={localityItems}
          value={city}
          onChange={setCity}
        />

        <CustomCalendar
          label={t("search.date")}
          value={date}
          onChange={setDate}
        />

        <CustomDropdown
          label="Eveniment"
          items={EVENT_TYPE_ITEMS}
          value={eventType}
          onChange={setEventType}
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
