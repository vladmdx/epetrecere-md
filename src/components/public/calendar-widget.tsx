"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, User, Phone, Mail, Sparkles, Clock, MessageSquare, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useLocale } from "@/hooks/use-locale";
import { useUser } from "@clerk/nextjs";
import { toast } from "sonner";

interface CalendarWidgetProps {
  entityType: "artist" | "venue";
  entityId: number;
  enabled: boolean;
  onDateSelect?: (date: string) => void;
}

interface CalendarDay {
  date: string;
  status: "available" | "booked" | "tentative" | "blocked";
  startTime?: string | null;
  endTime?: string | null;
}

const DAYS_RO = ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"];
const MONTHS_RO = [
  "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
  "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie",
];

const EVENT_TYPES = [
  { value: "wedding", label: "🎊 Nuntă" },
  { value: "baptism", label: "👶 Botez" },
  { value: "cumetrie", label: "🤝 Cumetrie" },
  { value: "corporate", label: "💼 Corporate" },
  { value: "birthday", label: "🎂 Aniversare" },
  { value: "other", label: "📋 Altele" },
];

export function CalendarWidget({ entityType, entityId, enabled, onDateSelect }: CalendarWidgetProps) {
  const { t } = useLocale();
  const { user, isSignedIn } = useUser();
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [events, setEvents] = useState<CalendarDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const monthStr = `${currentMonth.year}-${String(currentMonth.month + 1).padStart(2, "0")}`;
      const res = await fetch(
        `/api/calendar?entity_type=${entityType}&entity_id=${entityId}&month=${monthStr}`,
      );
      if (res.ok) {
        const data = await res.json();
        setEvents(Array.isArray(data) ? data : []);
      }
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, [entityType, entityId, currentMonth]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const { year, month } = currentMonth;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Build event map from API data — a date can have multiple events (partial bookings)
  const eventMap = new Map<string, { status: string; events: CalendarDay[] }>();
  for (const e of events) {
    const dateStr = e.date.includes("T") ? e.date.split("T")[0] : e.date;
    const existing = eventMap.get(dateStr);
    if (existing) {
      existing.events.push(e);
      // If all events for a day are booked/blocked with no time gaps, mark fully booked
      // If any has startTime/endTime, it's partial — day is still partially available
    } else {
      eventMap.set(dateStr, { status: e.status, events: [{ ...e, date: dateStr }] });
    }
  }

  // Determine effective status per day
  function getDayStatus(dateStr: string): { status: string; hasTimeSlots: boolean; bookedSlots: string[] } {
    const entry = eventMap.get(dateStr);
    if (!entry) return { status: "available", hasTimeSlots: false, bookedSlots: [] };

    const dayEvents = entry.events;
    const bookedSlots = dayEvents
      .filter(e => (e.status === "booked" || e.status === "tentative") && e.startTime)
      .map(e => `${e.startTime}-${e.endTime || "?"}`);

    // If any event has time slots, day is partially booked (still available for other times)
    const hasTimeSlots = dayEvents.some(e => e.startTime);

    // If blocked without time = full day blocked
    if (dayEvents.some(e => e.status === "blocked" && !e.startTime)) {
      return { status: "blocked", hasTimeSlots: false, bookedSlots };
    }
    // If booked without time = full day booked
    if (dayEvents.some(e => e.status === "booked" && !e.startTime)) {
      return { status: "booked", hasTimeSlots: false, bookedSlots };
    }

    return { status: hasTimeSlots ? "partial" : entry.status, hasTimeSlots, bookedSlots };
  }

  const prev = () => {
    setCurrentMonth((c) =>
      c.month === 0 ? { year: c.year - 1, month: 11 } : { year: c.year, month: c.month - 1 },
    );
  };
  const next = () => {
    setCurrentMonth((c) =>
      c.month === 11 ? { year: c.year + 1, month: 0 } : { year: c.year, month: c.month + 1 },
    );
  };

  function handleDayClick(dateStr: string, status: string | undefined) {
    if (status === "booked" || status === "blocked") return;
    setSelectedDate(dateStr);
    setShowForm(false);
    setSubmitted(false);
    if (onDateSelect) onDateSelect(dateStr);
  }

  function formatSelectedDate(dateStr: string) {
    const d = new Date(dateStr + "T00:00:00");
    return `${d.getDate()} ${MONTHS_RO[d.getMonth()]} ${d.getFullYear()}`;
  }

  async function handleBookingSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    const form = new FormData(e.currentTarget);

    const startTime = form.get("startTime") as string;
    const duration = Number(form.get("duration") || 0);
    let endTime: string | undefined;
    if (startTime && duration) {
      const [h, m] = startTime.split(":").map(Number);
      const endH = h + duration;
      endTime = `${String(Math.min(endH, 23)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    }

    try {
      // For artists: create booking request (shows in artist's Rezervări)
      // For venues: skip booking-requests (schema requires artistId) — only create lead
      if (entityType === "artist") {
        const res = await fetch("/api/booking-requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            artistId: entityId,
            clientName: form.get("name") as string,
            clientPhone: `+373${form.get("phone") as string}`,
            clientEmail: (form.get("email") as string) || undefined,
            eventDate: selectedDate || "",
            startTime: startTime || undefined,
            endTime: endTime || undefined,
            eventType: (form.get("eventType") as string) || undefined,
            message: (form.get("message") as string) || undefined,
          }),
        });
        if (!res.ok) throw new Error();
      }

      // Create a lead for the matching system (works for both artists and venues)
      const leadRes = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name") as string,
          phone: form.get("phone") as string,
          phonePrefix: "+373",
          email: (form.get("email") as string) || undefined,
          eventType: (form.get("eventType") as string) || undefined,
          eventDate: selectedDate || undefined,
          message: (form.get("message") as string) || undefined,
          source: "form",
          ...(entityType === "artist" ? { artistId: entityId, skipArtistNotification: true } : { venueId: entityId }),
        }),
      });
      if (entityType === "venue" && !leadRes.ok) throw new Error();

      toast.success("Cererea de rezervare a fost trimisă!");
      setSubmitted(true);
      setShowForm(false);
    } catch {
      toast.error("A apărut o eroare. Încercați din nou.");
    } finally {
      setSubmitting(false);
    }
  }

  // Pre-fill from Clerk user data
  const userName = user ? [user.firstName, user.lastName].filter(Boolean).join(" ") : "";
  const userEmail = user?.primaryEmailAddress?.emailAddress || "";

  return (
    <div className="rounded-xl border border-border/40 bg-card p-4">
      {/* Header */}
      <div className="mb-1 flex items-center gap-2 text-sm font-heading font-bold">
        <CalendarDays className="h-4 w-4 text-gold" />
        <span>Disponibilitate</span>
      </div>

      {/* Month nav */}
      <div className="mb-3 flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={prev} disabled={loading} className="h-7 w-7" aria-label="Luna anterioară">
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        <h3 className="text-xs font-semibold text-muted-foreground" aria-live="polite">
          {MONTHS_RO[month]} {year}
        </h3>
        <Button variant="ghost" size="icon" onClick={next} disabled={loading} className="h-7 w-7" aria-label="Luna următoare">
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Day names */}
      <div className="mb-1 grid grid-cols-7 text-center text-[10px] font-medium uppercase tracking-wider text-gold/50">
        {DAYS_RO.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className={cn("grid grid-cols-7 gap-0.5", loading && "opacity-40 pointer-events-none")} aria-busy={loading}>
        {Array.from({ length: startDay }).map((_, i) => (
          <div key={`empty-${i}`} className="h-7" />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const { status, hasTimeSlots } = getDayStatus(dateStr);
          const dateObj = new Date(year, month, day);
          const isPast = dateObj < today;
          const isToday = dateObj.toDateString() === today.toDateString();
          const isSelected = selectedDate === dateStr;

          const isFullyBlocked = status === "booked" || status === "blocked";

          let dayClass = "";
          if (isPast) {
            dayClass = "text-white/15 cursor-not-allowed";
          } else if (isFullyBlocked) {
            dayClass = "bg-destructive/25 text-destructive/90 cursor-not-allowed";
          } else if (status === "partial") {
            // Partially booked — still clickable
            dayClass = "bg-warning/20 text-warning cursor-pointer hover:bg-warning/30";
          } else if (status === "tentative") {
            dayClass = "bg-warning/20 text-warning cursor-pointer hover:bg-warning/30";
          } else if (isSelected) {
            dayClass = "bg-gold text-[#0D0D0D] font-bold shadow-[0_0_8px_rgba(201,168,76,0.3)]";
          } else {
            dayClass = "bg-success/15 text-success/90 cursor-pointer hover:bg-success/25";
          }

          return (
            <button
              key={day}
              type="button"
              disabled={isPast || isFullyBlocked}
              onClick={() => handleDayClick(dateStr, status)}
              className={cn(
                "flex h-7 w-full items-center justify-center rounded-md text-[11px] font-medium transition-all",
                dayClass,
                isToday && !isSelected && "ring-1 ring-gold/50",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-success" /> Liber
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-warning" /> Parțial
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-destructive" /> Ocupat
        </span>
      </div>

      {/* Selected date — booking prompt / form */}
      {selectedDate && !submitted && (
        <div className="mt-3 rounded-lg bg-gold/10 border border-gold/20 p-3">
          <p className="text-xs text-gold font-medium text-center">
            {formatSelectedDate(selectedDate)}
          </p>
          {getDayStatus(selectedDate).bookedSlots.length > 0 && (
            <p className="text-[10px] text-warning text-center mt-1">
              Ocupat: {getDayStatus(selectedDate).bookedSlots.join(", ")}
            </p>
          )}

          {!showForm ? (
            <Button
              onClick={() => setShowForm(true)}
              className="mt-2 w-full h-9 bg-gold text-[#0D0D0D] hover:bg-gold-dark text-xs font-semibold rounded-lg"
            >
              <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
              Rezervă această dată
            </Button>
          ) : (
            <form onSubmit={handleBookingSubmit} className="mt-3 space-y-3">
              <MiniField icon={User} label="Nume" required>
                <input name="name" required defaultValue={userName}
                  className="form-input !h-9 !text-xs" placeholder="Numele dvs." />
              </MiniField>

              <MiniField icon={Phone} label="Telefon" required>
                <div className="flex gap-1.5">
                  <span className="flex h-9 w-16 items-center justify-center rounded-lg border border-border/40 bg-accent/30 text-[11px] text-muted-foreground shrink-0">
                    +373
                  </span>
                  <input name="phone" type="tel" required
                    className="form-input !h-9 !text-xs flex-1" placeholder="6X XXX XXX" />
                </div>
              </MiniField>

              <MiniField icon={Mail} label="Email">
                <input name="email" type="email" defaultValue={userEmail}
                  className="form-input !h-9 !text-xs" placeholder="email@exemplu.md" />
              </MiniField>

              <MiniField icon={Sparkles} label="Tip Eveniment">
                <select name="eventType"
                  className="form-input !h-9 !text-xs appearance-none cursor-pointer">
                  <option value="">Selectează tipul</option>
                  {EVENT_TYPES.map(et => (
                    <option key={et.value} value={et.value}>{et.label}</option>
                  ))}
                </select>
              </MiniField>

              <div className="grid grid-cols-2 gap-2">
                <MiniField icon={Clock} label="Ora de început" required>
                  <select name="startTime" required
                    className="form-input !h-9 !text-xs appearance-none cursor-pointer">
                    <option value="">Ora</option>
                    {Array.from({ length: 15 }, (_, i) => i + 8).map(h => (
                      <option key={h} value={`${String(h).padStart(2, "0")}:00`}>
                        {String(h).padStart(2, "0")}:00
                      </option>
                    ))}
                  </select>
                </MiniField>
                <MiniField icon={Clock} label="Durată (ore)" required>
                  <select name="duration" required
                    className="form-input !h-9 !text-xs appearance-none cursor-pointer">
                    <option value="">Ore</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(h => (
                      <option key={h} value={h}>{h} {h === 1 ? "oră" : "ore"}</option>
                    ))}
                  </select>
                </MiniField>
              </div>

              <MiniField icon={MessageSquare} label="Mesaj">
                <textarea name="message" rows={2}
                  className="form-input !text-xs min-h-[50px] resize-none py-2"
                  placeholder="Detalii despre eveniment..." />
              </MiniField>

              <div className="flex items-start gap-2 pt-1">
                <Checkbox id={`gdpr-cal-${entityId}`} name="gdpr" required className="mt-0.5 h-3.5 w-3.5" />
                <Label htmlFor={`gdpr-cal-${entityId}`} className="text-[10px] text-muted-foreground leading-relaxed">
                  {t("form.gdpr_consent")}
                </Label>
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowForm(false)}
                  className="flex-1 h-9 text-xs rounded-lg"
                >
                  Anulează
                </Button>
                <Button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 h-9 bg-gold text-[#0D0D0D] hover:bg-gold-dark text-xs font-semibold rounded-lg"
                >
                  {submitting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <><Send className="mr-1.5 h-3.5 w-3.5" /> Trimite</>
                  )}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Success message */}
      {submitted && selectedDate && (
        <div className="mt-3 rounded-lg bg-success/10 border border-success/20 p-3 text-center">
          <p className="text-xs text-success font-medium">
            ✓ Cererea pentru {formatSelectedDate(selectedDate)} a fost trimisă!
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            Veți fi contactat în curând.
          </p>
        </div>
      )}
    </div>
  );
}

/* Compact form field for inline calendar booking */
function MiniField({
  icon: Icon, label, required, children,
}: {
  icon: typeof User; label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1.5 text-[11px] font-medium text-foreground">
        <Icon className="h-3 w-3 text-gold/70" />
        {label}
        {required && <span className="text-gold">*</span>}
      </label>
      {children}
    </div>
  );
}
