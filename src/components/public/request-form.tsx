"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useLocale } from "@/hooks/use-locale";
import {
  Loader2, Send, Phone, User, Mail, MapPin, Users, MessageSquare,
  CalendarDays, ChevronDown, ChevronLeft, ChevronRight, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Shared props ────────────────────────────────────────
interface FormBaseProps {
  artistId?: number;
  venueId?: number;
  preselectedDate?: string;
  className?: string;
  label?: string;
  variant?: "primary" | "outline";
  icon?: React.ReactNode;
}

// ─── Price Request (simple: name + phone) ────────────────
export function RequestPriceForm({ artistId, venueId, className, label = "Solicită Preț", variant = "primary" }: FormBaseProps) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name") as string,
          phone: form.get("phone") as string,
          phonePrefix: "+373",
          source: "form",
          message: "Solicitare preț",
          artistId,
          venueId,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Cererea a fost trimisă! Vă vom contacta în curând.");
      setOpen(false);
    } catch {
      toast.error("A apărut o eroare. Încercați din nou.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        className={cn(
          "w-full cursor-pointer rounded-xl py-3.5 text-center text-base font-semibold transition-colors",
          variant === "primary"
            ? "bg-gold text-background hover:bg-gold-dark"
            : "border border-gold/30 text-gold hover:bg-gold/10",
          className,
        )}
      >
        {label}
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-heading flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-gold" />
              Solicită Preț
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              Lăsați datele de contact și vă vom reveni cu o ofertă personalizată.
            </p>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <FormField icon={User} label="Nume" required>
              <input id="price-name" name="name" required
                className="form-input" placeholder="Numele dvs." />
            </FormField>

            <FormField icon={Phone} label="Telefon" required>
              <div className="flex gap-2">
                <span className="flex h-11 w-20 items-center justify-center rounded-xl border border-border/40 bg-accent/30 text-sm text-muted-foreground">
                  +373
                </span>
                <input id="price-phone" name="phone" type="tel" required
                  className="form-input flex-1" placeholder="6X XXX XXX" />
              </div>
            </FormField>

            <div className="flex items-start gap-2 pt-1">
              <Checkbox id="gdpr-price" name="gdpr" required />
              <Label htmlFor="gdpr-price" className="text-xs text-muted-foreground leading-tight">
                {t("form.gdpr_consent")}
              </Label>
            </div>

            <Button type="submit" disabled={loading}
              className="w-full h-12 bg-gold text-background hover:bg-gold-dark text-sm font-semibold rounded-xl">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <><Send className="mr-2 h-4 w-4" /> Trimite cererea</>
              )}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

// ─── Booking Request (full form) ─────────────────────────
export function RequestBookingForm({ artistId, venueId, preselectedDate, className, label = "Solicită Rezervare", variant = "outline", icon }: FormBaseProps) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [eventDate, setEventDate] = useState<Date | null>(
    preselectedDate ? new Date(preselectedDate) : null
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name") as string,
          phone: form.get("phone") as string,
          phonePrefix: "+373",
          email: (form.get("email") as string) || undefined,
          eventType: (form.get("eventType") as string) || undefined,
          eventDate: eventDate ? eventDate.toISOString().split("T")[0] : undefined,
          location: (form.get("location") as string) || undefined,
          guestCount: form.get("guestCount") ? Number(form.get("guestCount")) : undefined,
          message: (form.get("message") as string) || undefined,
          source: "form",
          artistId,
          venueId,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success("Cererea de rezervare a fost trimisă! Vă vom contacta în curând.");
      setOpen(false);
    } catch {
      toast.error("A apărut o eroare. Încercați din nou.");
    } finally {
      setLoading(false);
    }
  }

  const eventTypes = [
    { value: "wedding", label: "🎊 Nuntă" },
    { value: "baptism", label: "👶 Botez" },
    { value: "cumpatrie", label: "🤝 Cumpătrie" },
    { value: "corporate", label: "💼 Corporate" },
    { value: "birthday", label: "🎂 Aniversare" },
    { value: "other", label: "📋 Altele" },
  ];

  return (
    <>
      <div
        onClick={() => setOpen(true)}
        className={cn(
          "flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl py-3.5 text-center text-base font-semibold transition-colors",
          variant === "primary"
            ? "bg-gold text-background hover:bg-gold-dark"
            : "border border-gold/30 text-gold hover:bg-gold/10",
          className,
        )}
      >
        {icon}
        {label}
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-heading flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-gold" />
              Solicită Rezervare
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              Completați detaliile evenimentului și vă vom confirma disponibilitatea.
            </p>
          </SheetHeader>

          <form onSubmit={handleSubmit} className="mt-6 space-y-5">
            <FormField icon={User} label="Nume" required>
              <input id="book-name" name="name" required
                className="form-input" placeholder="Numele dvs." />
            </FormField>

            <FormField icon={Phone} label="Telefon" required>
              <div className="flex gap-2">
                <span className="flex h-11 w-20 items-center justify-center rounded-xl border border-border/40 bg-accent/30 text-sm text-muted-foreground">
                  +373
                </span>
                <input id="book-phone" name="phone" type="tel" required
                  className="form-input flex-1" placeholder="6X XXX XXX" />
              </div>
            </FormField>

            <FormField icon={Mail} label="Email">
              <input id="book-email" name="email" type="email"
                className="form-input" placeholder="email@exemplu.md" />
            </FormField>

            <FormField icon={Sparkles} label="Tip Eveniment">
              <select name="eventType"
                className="form-input appearance-none cursor-pointer">
                <option value="">Selectează tipul</option>
                {eventTypes.map(et => (
                  <option key={et.value} value={et.value}>{et.label}</option>
                ))}
              </select>
            </FormField>

            <FormField icon={CalendarDays} label="Data Evenimentului">
              <MiniCalendar value={eventDate} onChange={setEventDate} />
            </FormField>

            <FormField icon={MapPin} label="Locație">
              <input id="book-location" name="location"
                className="form-input" placeholder="Orașul, locația" />
            </FormField>

            <FormField icon={Users} label="Număr invitați">
              <input id="book-guests" name="guestCount" type="number" min={1}
                className="form-input" placeholder="ex: 150" />
            </FormField>

            <FormField icon={MessageSquare} label="Mesaj">
              <textarea id="book-message" name="message" rows={3}
                className="form-input min-h-[80px] resize-none py-2.5"
                placeholder="Detalii suplimentare despre eveniment..." />
            </FormField>

            <div className="flex items-start gap-2 pt-1">
              <Checkbox id="gdpr-booking" name="gdpr" required />
              <Label htmlFor="gdpr-booking" className="text-xs text-muted-foreground leading-tight">
                {t("form.gdpr_consent")}
              </Label>
            </div>

            <Button type="submit" disabled={loading}
              className="w-full h-12 bg-gold text-background hover:bg-gold-dark text-sm font-semibold rounded-xl">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <><Send className="mr-2 h-4 w-4" /> Trimite cererea de rezervare</>
              )}
            </Button>
          </form>
        </SheetContent>
      </Sheet>
    </>
  );
}

// ─── Legacy export (backwards compat) ────────────────────
export function RequestForm(props: FormBaseProps & { trigger?: React.ReactNode }) {
  return <RequestBookingForm {...props} />;
}

// ─── FormField wrapper ───────────────────────────────────
function FormField({
  icon: Icon, label, required, children,
}: {
  icon: typeof User; label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <Icon className="h-3.5 w-3.5 text-gold/70" />
        {label}
        {required && <span className="text-gold">*</span>}
      </label>
      {children}
    </div>
  );
}

// ─── Mini Calendar ───────────────────────────────────────
function MiniCalendar({
  value,
  onChange,
}: {
  value: Date | null;
  onChange: (d: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(value || new Date());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const monthNames = ["Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
    "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"];
  const dayNames = ["Lu", "Ma", "Mi", "Jo", "Vi", "Sâ", "Du"];

  const startDay = firstDay === 0 ? 6 : firstDay - 1;
  const cells: { day: number; current: boolean; date: Date }[] = [];

  for (let i = startDay - 1; i >= 0; i--) {
    const d = daysInPrevMonth - i;
    cells.push({ day: d, current: false, date: new Date(year, month - 1, d) });
  }
  for (let i = 1; i <= daysInMonth; i++) {
    cells.push({ day: i, current: true, date: new Date(year, month, i) });
  }
  const remaining = 42 - cells.length;
  for (let i = 1; i <= remaining; i++) {
    cells.push({ day: i, current: false, date: new Date(year, month + 1, i) });
  }

  function isSelected(d: Date) {
    return value ? d.toDateString() === value.toDateString() : false;
  }
  function isToday(d: Date) {
    return d.toDateString() === today.toDateString();
  }
  function isPast(d: Date) {
    return d < today;
  }

  function formatDate(d: Date) {
    return `${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
  }

  return (
    <div className="relative" ref={ref}>
      <div
        onClick={() => setOpen(!open)}
        className={cn(
          "form-input flex items-center gap-2 cursor-pointer text-left w-full",
          !value && "text-muted-foreground",
        )}
      >
        <CalendarDays className="h-4 w-4 text-gold/60 shrink-0" />
        <span className="flex-1">{value ? formatDate(value) : "Selectează data"}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </div>

      {open && (
        <div className="absolute z-50 mt-2 left-0 right-0 rounded-xl border border-gold/20 bg-[#141428]/98 backdrop-blur-xl p-4 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
          <div className="flex items-center justify-between mb-3">
            <button type="button"
              onClick={() => setViewDate(new Date(year, month - 1, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-gold transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold text-white">
              {monthNames[month]} {year}
            </span>
            <button type="button"
              onClick={() => setViewDate(new Date(year, month + 1, 1))}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-gold transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {dayNames.map(d => (
              <div key={d} className="text-center text-[10px] font-medium uppercase tracking-wider text-gold/50 py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((cell, i) => (
              <button key={i} type="button"
                disabled={isPast(cell.date)}
                onClick={() => { onChange(cell.date); setOpen(false); }}
                className={cn(
                  "h-8 w-full rounded-lg text-xs font-medium transition-all duration-150",
                  !cell.current && "text-white/20",
                  cell.current && !isPast(cell.date) && !isSelected(cell.date) && !isToday(cell.date) && "text-white/70 hover:bg-gold/15 hover:text-gold",
                  cell.current && isPast(cell.date) && "text-white/15 cursor-not-allowed",
                  isToday(cell.date) && !isSelected(cell.date) && "border border-gold/40 text-gold",
                  isSelected(cell.date) && "bg-gold text-[#0D0D0D] font-bold shadow-[0_0_12px_rgba(201,168,76,0.3)]",
                )}
              >
                {cell.day}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
            <button type="button"
              onClick={() => { const d = new Date(); d.setDate(d.getDate() + 1); onChange(d); setViewDate(d); setOpen(false); }}
              className="text-xs text-gold/70 hover:text-gold transition-colors">
              Mâine
            </button>
            <button type="button"
              onClick={() => {
                const next = new Date();
                next.setDate(next.getDate() + ((6 - next.getDay() + 7) % 7 || 7));
                onChange(next); setViewDate(next); setOpen(false);
              }}
              className="text-xs text-gold/70 hover:text-gold transition-colors">
              Sâmbătă viitoare
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
