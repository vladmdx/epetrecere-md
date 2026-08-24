"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, MapPin, Users } from "lucide-react";
import { useLocale } from "@/hooks/use-locale";
import { CustomCalendar } from "@/components/public/custom-calendar";
import { localizePath } from "@/lib/i18n/routing";
import { cn } from "@/lib/utils";

type Tab = "venues" | "artists" | "services";

function getTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d;
}

/** Local calendar date → YYYY-MM-DD (no UTC shift). */
function toYMD(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const TAB_ROUTES: Record<Tab, string> = {
  venues: "/sali",
  artists: "/artisti",
  services: "/servicii",
};

/**
 * Tabbed hero search — Locații / Artiști / Servicii. Each tab searches its
 * own listing page. The free-text query + city + date + guest count are
 * passed as query params so the destination page can prefilter. Sits at the
 * bottom of the hero, overlapping the video background.
 */
export function HeroSearch() {
  const { t, locale } = useLocale();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("venues");
  const [q, setQ] = useState("");
  const [city, setCity] = useState("");
  const [date, setDate] = useState<Date | null>(getTomorrow());
  const [guests, setGuests] = useState("");

  const tabs: { key: Tab; label: string }[] = [
    { key: "venues", label: t("search.tab_venues") ?? "Locații" },
    { key: "artists", label: t("search.tab_artists") ?? "Artiști" },
    { key: "services", label: t("search.tab_services") ?? "Servicii" },
  ];

  /**
   * Each tab lands on a different page, and those pages read different query
   * params — a name the destination never looks at drops what the visitor
   * typed without a trace. That is how `?guests=` was lost: /sali filters on
   * `capacity_min` and has never read `guests`. So spell the params out per
   * destination instead of sending one set to all three.
   */
  function buildParams() {
    const params = new URLSearchParams();
    const cityValue = city.trim();
    const dateValue = date ? toYMD(date) : "";

    if (tab === "venues") {
      if (cityValue) params.set("city", cityValue);
      if (dateValue) params.set("date", dateValue);
      // Guest count is the venue capacity filter. /sali has no free-text
      // search (getVenues takes no `search`), so `q` is deliberately dropped.
      if (guests.trim()) params.set("capacity_min", guests.trim());
    } else if (tab === "artists") {
      if (q.trim()) params.set("q", q.trim());
      if (cityValue) params.set("city", cityValue);
      if (dateValue) params.set("date", dateValue);
      // No guest-count filter exists for artists.
    }
    // The services tab lands on the static /servicii landing, which reads no
    // search params at all — anything appended there is pure decoration.

    return params;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qs = buildParams().toString();
    // Locale lives in the path (/ru/sali), so an unprefixed push would flip a
    // Russian or English visitor to the Romanian listing.
    const base = localizePath(TAB_ROUTES[tab], locale);
    router.push(`${base}${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="mx-auto w-full max-w-5xl rounded-2xl border border-white/10 bg-[#0D0D0D]/70 p-4 backdrop-blur-md shadow-[0_20px_60px_rgba(0,0,0,0.45)] sm:p-5">
      {/* Tabs */}
      <div className="mb-4 flex items-center gap-6 border-b border-white/10 px-1">
        {tabs.map((it) => (
          <button
            key={it.key}
            type="button"
            onClick={() => setTab(it.key)}
            className={cn(
              "relative -mb-px pb-3 text-sm font-medium transition-colors",
              tab === it.key
                ? "text-gold"
                : "text-white/60 hover:text-white/90",
            )}
          >
            {it.label}
            {tab === it.key && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-gold" />
            )}
          </button>
        ))}
      </div>

      {/* Fields */}
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 lg:flex-row lg:items-end"
      >
        <Field label={t("search.what") ?? "Ce cauți?"}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("search.what_ph") ?? "Ex: sală, DJ, formație..."}
            className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 text-sm text-white placeholder:text-white/40 outline-none transition-colors focus:border-gold/50 focus:bg-white/[0.06]"
          />
        </Field>

        <Field label={t("search.location") ?? "Locația"} icon={MapPin}>
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={t("search.location_ph") ?? "Oraș sau regiune"}
            className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-9 pr-3 text-sm text-white placeholder:text-white/40 outline-none transition-colors focus:border-gold/50 focus:bg-white/[0.06]"
          />
        </Field>

        <div className="flex-1">
          <label className="mb-1.5 block text-left text-[11px] font-medium uppercase tracking-wider text-white/50">
            {t("search.date_label") ?? "Data evenimentului"}
          </label>
          <CustomCalendar
            value={date}
            onChange={setDate}
            variant="onDark"
            placeholder={t("calendar.selectDate")}
          />
        </div>

        <Field label={t("search.guests") ?? "Invitați"} icon={Users}>
          <input
            inputMode="numeric"
            value={guests}
            onChange={(e) => setGuests(e.target.value.replace(/\D/g, "").slice(0, 5))}
            placeholder={t("search.guests_ph") ?? "Nr. invitați"}
            className="h-11 w-full rounded-xl border border-white/10 bg-white/[0.04] pl-9 pr-3 text-sm text-white placeholder:text-white/40 outline-none transition-colors focus:border-gold/50 focus:bg-white/[0.06]"
          />
        </Field>

        <button
          type="submit"
          className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-gold px-6 text-sm font-semibold text-[#0D0D0D] transition-colors hover:bg-gold-dark lg:w-auto"
        >
          <Search className="h-4 w-4" />
          {t("search.search_button") ?? "Caută"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1">
      <label className="mb-1.5 block text-left text-[11px] font-medium uppercase tracking-wider text-white/50">
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gold/70" />
        )}
        {children}
      </div>
    </div>
  );
}
