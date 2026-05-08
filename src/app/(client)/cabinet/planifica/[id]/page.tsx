"use client";

// M4 — Client planner dashboard — matches reference design:
// Left vertical nav | Main content (Overview/Checklist/Budget/etc) | Right stats sidebar.

import { useEffect, useState, useCallback, useMemo, use } from "react";
import { citiesWithinRadius } from "@/lib/geo/city-proximity";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { EventTimeline } from "@/components/client/event-timeline";
import {
  LayoutDashboard,
  ClipboardList,
  Wallet,
  Users,
  UtensilsCrossed,
  Clock,
  BookOpen,
  Settings,
  Calendar,
  MapPin,
  Loader2,
  Camera,
  Trash2,
  Plus,
  ChevronRight,
  ExternalLink,
  Save,
  Image,
  Star,
  Send,
  Check,
  CheckCircle2,
  X,
  MessageCircle,
  LayoutGrid,
  List,
  Pencil,
} from "lucide-react";
import { createPortal } from "react-dom";
import { TimePicker } from "@/components/ui/time-picker";
import {
  resolvePriceForDuration,
  tierDurationMinutes,
  formatDuration,
  type PricingTier,
} from "@/lib/pricing/resolve";
import { ChecklistView, type ChecklistItem } from "@/components/planner/checklist-view";
import { GuestsView, type Guest } from "@/components/planner/guests-view";
import {
  SeatingView,
  type SeatingTable,
  type SeatAssignment,
} from "@/components/planner/seating-view";
import { PhotosView } from "@/components/planner/photos-view";
import { CustomCalendar } from "@/components/public/custom-calendar";
import {
  PriceNegotiationPanel,
  type BookingPriceOffer,
} from "@/components/planner/price-negotiation-panel";
import { AIArtistPickerChat } from "@/components/planner/ai-artist-picker-chat";
import { cn } from "@/lib/utils";

interface Plan {
  id: number;
  title: string;
  eventType: string | null;
  eventDate: string | null;
  /** Wizard step 2 — start hour "HH:MM", used to pre-fill booking modal. */
  startTime?: string | null;
  /** Wizard step 2 — total event duration in hours. */
  durationHours?: number | null;
  location: string | null;
  guestCountTarget: number | null;
  budgetTarget: number | null;
  seatsPerTable: number | null;
  notes: string | null;
  /** Wizard-supplied: whether the plan also needs a venue — drives the
   *  conditional "Săli" tab. */
  venueNeeded?: boolean;
  /** Wizard-supplied: which optional planning tabs the user opted into. */
  checklistEnabled?: boolean;
  budgetEnabled?: boolean;
  guestsEnabled?: boolean;
  seatingEnabled?: boolean;
  /** Max radius (km) from the event city for the Săli tab filter. */
  venueRadiusKm?: number | null;
  /** Wizard-supplied category IDs for pre-filtering the artist discovery. */
  selectedCategories?: number[];
  status?: "active" | "completed" | "cancelled";
  /** AI-generated event timeline (editable). */
  timeline?: Array<{ time: string; label: string; durationMin: number }>;
}

interface BookingRequest {
  id: number;
  artistId: number;
  artistName: string | null;
  artistSlug: string | null;
  /** Venue bookings live in the same table — these are null for
   *  artist requests and vice versa. */
  venueId?: number | null;
  venueName?: string | null;
  venueSlug?: string | null;
  eventType: string | null;
  eventDate: string;
  startTime?: string | null;
  endTime?: string | null;
  status: string;
  /** Server timestamp when the booking was created. Drives the 24h
   *  countdown shown on the pending artist's card. */
  createdAt?: string | null;
  agreedPrice?: number | null;
  paidStatus?: "unpaid" | "partial" | "paid";
  priceOffers?: BookingPriceOffer[] | null;
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  wedding: "Nuntă",
  baptism: "Botez",
  cumatrie: "Cumătrie",
  birthday: "Zi de naștere",
  corporate: "Corporate",
  other: "Alt tip",
};

const EVENT_TYPES = [
  { value: "wedding", label: "Nuntă" },
  { value: "baptism", label: "Botez" },
  { value: "cumatrie", label: "Cumătrie" },
  { value: "birthday", label: "Zi de naștere" },
  { value: "corporate", label: "Corporate" },
  { value: "other", label: "Alt tip" },
];

type TabKey =
  | "overview"
  | "bookings"
  | "my-bookings"
  | "venues"
  | "checklist"
  | "budget"
  | "guests"
  | "seating"
  | "timeline"
  | "photos"
  | "settings";

type NavItem = {
  key: TabKey;
  icon: typeof LayoutDashboard;
  label: string;
  /** When true, only rendered if plan.venueNeeded is set. */
  venueOnly?: boolean;
};

/**
 * Nav order matches the reference design: Rezervări Artiști is now the
 * second tab (right after Prezentare) so clients hit the artist-booking
 * surface immediately. "Săli" only appears if the wizard flagged the
 * plan as venue-needed.
 */
const NAV_ITEMS: NavItem[] = [
  { key: "overview", icon: LayoutDashboard, label: "Prezentare" },
  // Săli before Rezervări Artiști — picking the venue first matches how
  // people actually plan: book the place, then assemble the show. The
  // tab still hides automatically when venueNeeded=false.
  { key: "venues", icon: MapPin, label: "Săli", venueOnly: true },
  { key: "bookings", icon: BookOpen, label: "Rezervări Artiști" },
  // Personal cererile trimise live in their own tab so the user
  // doesn't have to scan through every category to find them.
  { key: "my-bookings", icon: BookOpen, label: "Cererile mele" },
  { key: "checklist", icon: ClipboardList, label: "Checklist" },
  // Budget tab removed — see BudgetTab definition below; per-category
  // price filtering on the Rezervări Artiști tab replaces it.
  { key: "guests", icon: Users, label: "Invitați" },
  { key: "seating", icon: UtensilsCrossed, label: "Așezare Mese" },
  { key: "settings", icon: Settings, label: "Setări" },
];

export default function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const planId = Number(id);
  const router = useRouter();
  const { user } = useUser();

  const [plan, setPlan] = useState<Plan | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [tables, setTables] = useState<SeatingTable[]>([]);
  const [seats, setSeats] = useState<SeatAssignment[]>([]);
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [photoCount, setPhotoCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  // Allow ?tab=bookings (or any other TabKey) to deep-link into a specific
  // tab — used after the wizard completes so the user lands directly on
  // the artist discovery list for their event date.
  const searchParams = useSearchParams();
  const initialTab = (searchParams?.get("tab") as TabKey) || "overview";
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  // Load plan data
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/event-plans/${planId}`, { cache: "no-store" });
        if (res.status === 404 || res.status === 401) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error();
        const data = await res.json();
        setPlan(data.plan);
        setChecklist(data.checklist ?? []);
        setGuests(data.guests ?? []);
        setTables(data.tables ?? []);
        setSeats(data.seats ?? []);
        setPhotoCount((data.photos ?? []).length);
      } catch {
        toast.error("Nu am putut încărca planul.");
      } finally {
        setLoading(false);
      }
    }
    if (Number.isFinite(planId)) load();
  }, [planId]);

  // Load user's bookings. We fetch ALL their bookings by email, then filter
  // client-side to this plan. A booking belongs to the plan when:
  //  • eventPlanId matches (the canonical link, Faza 1+), or
  //  • eventPlanId is null but eventDate matches (legacy bookings made
  //    before we had event_plan_id on booking_requests).
  useEffect(() => {
    if (!user?.primaryEmailAddress?.emailAddress || !plan) return;
    const email = user.primaryEmailAddress.emailAddress;
    fetch(`/api/booking-requests?client_email=${encodeURIComponent(email)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: BookingRequest[] & { eventPlanId?: number | null }[]) => {
        if (!Array.isArray(data)) return;
        const scoped = data.filter((b) => {
          const bp = b as BookingRequest & { eventPlanId?: number | null };
          if (bp.eventPlanId === plan.id) return true;
          if (
            bp.eventPlanId == null &&
            plan.eventDate &&
            b.eventDate === plan.eventDate
          ) {
            return true;
          }
          return false;
        });
        setBookings(scoped);
      })
      .catch(() => {});
  }, [user, plan]);

  async function deletePlan() {
    if (!confirm("Sigur vrei să ștergi acest plan? Operațiunea este ireversibilă.")) return;
    const res = await fetch(`/api/event-plans/${planId}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Nu am putut șterge planul.");
      return;
    }
    toast.success("Plan șters.");
    router.push("/cabinet/planifica");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (notFound || !plan) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <ClipboardList className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">Plan negăsit sau nu ai acces.</p>
        <Link href="/cabinet/planifica" className="mt-4 inline-block text-sm text-gold hover:underline">
          Înapoi la planuri
        </Link>
      </div>
    );
  }

  // Computed stats
  const checklistDone = checklist.filter((c) => c.done).length;
  const checklistTotal = checklist.length;
  const guestTotal = guests.reduce((sum, g) => sum + 1 + (g.plusOnes || 0), 0);
  const guestAccepted = guests.filter((g) => g.rsvp === "accepted").reduce((sum, g) => sum + 1 + (g.plusOnes || 0), 0);
  const seatedGuests = new Set(seats.map((s) => s.guestId)).size;
  const activeBookings = bookings.filter((b) => ["pending", "accepted", "confirmed_by_client"].includes(b.status));

  // Each optional tab is gated on a wizard-time opt-in flag stored on
  // the plan. Owners can flip these from the Setări tab afterwards.
  // Seating is double-gated: requires both seating + guests enabled.
  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (item.venueOnly && !plan.venueNeeded) return false;
    if (item.key === "checklist" && !plan.checklistEnabled) return false;
    if (item.key === "guests" && !plan.guestsEnabled) return false;
    if (item.key === "seating" && (!plan.seatingEnabled || !plan.guestsEnabled))
      return false;
    return true;
  });

  return (
    <div className="flex gap-0 -m-6 min-h-[calc(100vh-4rem)]">
      {/* Left Navigation */}
      <nav className="hidden md:flex w-48 shrink-0 flex-col border-r border-border/30 bg-card/50 py-4">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveTab(item.key)}
              className={cn(
                "flex items-center gap-2.5 px-5 py-2.5 text-sm transition-colors text-left",
                isActive
                  ? "border-l-2 border-gold text-gold font-medium bg-gold/5"
                  : "border-l-2 border-transparent text-muted-foreground hover:text-foreground hover:bg-accent/30",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Mobile tab bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex overflow-x-auto border-t border-border/40 bg-background px-2 py-1.5 gap-1">
        {visibleNavItems.slice(0, 6).map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveTab(item.key)}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] min-w-[56px] transition-colors",
                activeTab === item.key ? "text-gold" : "text-muted-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Main Content + Right Sidebar */}
      <div className="flex-1 flex overflow-y-auto">
        <div className="flex-1 p-6 pb-20 md:pb-6">
          {activeTab === "overview" && (
            <div className="space-y-6">
              <OverviewTab
                plan={plan}
                checklist={checklist}
                guests={guests}
                tables={tables}
                seats={seats}
                bookings={activeBookings}
                photoCount={photoCount}
                guestTotal={guestTotal}
                guestAccepted={guestAccepted}
                checklistDone={checklistDone}
                checklistTotal={checklistTotal}
                seatedGuests={seatedGuests}
                onCheckItem={async (itemId, done) => {
                  const res = await fetch(`/api/event-plans/${planId}/checklist/${itemId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ done }),
                });
                if (res.ok) {
                  setChecklist((prev) =>
                    prev.map((c) => (c.id === itemId ? { ...c, done, doneAt: done ? new Date().toISOString() : null } : c)),
                  );
                }
              }}
              onSwitchTab={setActiveTab}
            />
              <EventTimeline
                planId={plan.id}
                initial={plan.timeline ?? []}
              />
            </div>
          )}

          {activeTab === "checklist" && plan.checklistEnabled && (
            <ChecklistView
              planId={plan.id}
              eventDate={plan.eventDate}
              eventType={plan.eventType}
              items={checklist}
              onChange={setChecklist}
            />
          )}

          {/* Budget tab removed — per-category price filter on
              Rezervări Artiști supersedes the standalone budget tracker. */}

          {activeTab === "my-bookings" && (
            <MyBookingsTab bookings={bookings} />
          )}

          {activeTab === "guests" && plan.guestsEnabled && (
            <GuestsView
              planId={plan.id}
              plan={plan}
              guestCountTarget={plan.guestCountTarget}
              guests={guests}
              onChange={setGuests}
            />
          )}

          {activeTab === "seating" && plan.seatingEnabled && plan.guestsEnabled && (
            <SeatingView
              planId={plan.id}
              guests={guests}
              tables={tables}
              seats={seats}
              onTablesChange={setTables}
              onSeatsChange={setSeats}
            />
          )}

          {activeTab === "timeline" && (
            <TimelineTab checklist={checklist} eventDate={plan.eventDate} />
          )}

          {activeTab === "bookings" && (
            <BookingsTab
              plan={plan}
              bookings={bookings}
              onRefresh={async () => {
                if (!user?.primaryEmailAddress?.emailAddress) return;
                const email = user.primaryEmailAddress.emailAddress;
                const r = await fetch(
                  `/api/booking-requests?client_email=${encodeURIComponent(email)}`,
                );
                if (r.ok) {
                  const data: BookingRequest[] = await r.json();
                  if (Array.isArray(data) && plan) {
                    setBookings(
                      data.filter((b) => {
                        const bp = b as BookingRequest & {
                          eventPlanId?: number | null;
                        };
                        return (
                          bp.eventPlanId === plan.id ||
                          (bp.eventPlanId == null &&
                            plan.eventDate &&
                            b.eventDate === plan.eventDate)
                        );
                      }),
                    );
                  }
                }
              }}
            />
          )}

          {activeTab === "venues" && plan.venueNeeded && (
            <VenuesTab plan={plan} />
          )}

          {activeTab === "photos" && (
            <PhotosView planId={plan.id} />
          )}

          {activeTab === "settings" && (
            <SettingsTab plan={plan} onUpdate={setPlan} onDelete={deletePlan} />
          )}
        </div>

        {/* Right Stats Sidebar — visible on overview */}
        {activeTab === "overview" && (
          <aside className="hidden lg:flex w-64 shrink-0 flex-col gap-4 border-l border-border/30 bg-card/30 p-4">
            {/* Files Widget */}
            <Card>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-2xl font-heading font-bold">{photoCount}</p>
                    <p className="text-xs text-muted-foreground">Fotografii</p>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <div className="h-8 w-8 rounded bg-accent/50 flex items-center justify-center">
                      <Image className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="h-8 w-8 rounded bg-accent/50 flex items-center justify-center">
                      <Camera className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab("photos")}
                  className="mt-2 text-xs text-gold hover:underline"
                >
                  Vezi mai mult
                </button>
              </CardContent>
            </Card>

            {/* General Info Widget */}
            <Card>
              <CardContent className="py-4">
                <h4 className="font-heading font-semibold text-sm mb-3">Info General</h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Users className="h-4 w-4 text-gold" />
                    <div>
                      <p className="text-lg font-bold">{guestTotal}</p>
                      <p className="text-[10px] text-muted-foreground">Invitați total</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <UtensilsCrossed className="h-4 w-4 text-gold" />
                    <div>
                      <p className="text-lg font-bold">{tables.length}</p>
                      <p className="text-[10px] text-muted-foreground">Număr de mese</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Users className="h-4 w-4 text-gold" />
                    <div>
                      <p className="text-lg font-bold">{seatedGuests}</p>
                      <p className="text-[10px] text-muted-foreground">Invitați așezați</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </aside>
        )}
      </div>
    </div>
  );
}

// ─── Editable Plan Title ────────────────────────────────────────────
// Inline-editable plan title. Click the pencil to edit, Enter/blur to save.

function EditablePlanTitle({ plan }: { plan: Plan }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(plan.title);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(plan.title);
  }, [plan.title]);

  async function save() {
    const next = value.trim();
    if (!next || next === plan.title) {
      setValue(plan.title);
      setEditing(false);
      return;
    }
    if (next.length < 2) {
      toast.error("Numele trebuie să aibă cel puțin 2 caractere");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/event-plans/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next }),
      });
      if (!res.ok) throw new Error();
      toast.success("Nume eveniment actualizat");
      setEditing(false);
      router.refresh();
    } catch {
      toast.error("Nu s-a putut salva numele");
      setValue(plan.title);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          } else if (e.key === "Escape") {
            setValue(plan.title);
            setEditing(false);
          }
        }}
        disabled={saving}
        maxLength={120}
        className="font-heading text-xl font-bold bg-transparent border-b-2 border-gold/50 focus:border-gold focus:outline-none px-1 min-w-0 max-w-full"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group inline-flex items-center gap-1.5 font-heading text-xl font-bold text-left hover:text-gold transition-colors"
      title="Click pentru a redenumi evenimentul"
    >
      <span>{plan.title}</span>
      <Pencil className="h-3.5 w-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
    </button>
  );
}

// ─── Overview Tab ───────────────────────────────────────────────────

function OverviewTab({
  plan,
  checklist,
  guests,
  tables,
  seats,
  bookings,
  photoCount,
  guestTotal,
  guestAccepted,
  checklistDone,
  checklistTotal,
  seatedGuests,
  onCheckItem,
  onSwitchTab,
}: {
  plan: Plan;
  checklist: ChecklistItem[];
  guests: Guest[];
  tables: SeatingTable[];
  seats: SeatAssignment[];
  bookings: BookingRequest[];
  photoCount: number;
  guestTotal: number;
  guestAccepted: number;
  checklistDone: number;
  checklistTotal: number;
  seatedGuests: number;
  onCheckItem: (id: number, done: boolean) => void;
  onSwitchTab: (tab: TabKey) => void;
}) {
  return (
    <div className="space-y-6">
      {/* Event Hero Card */}
      <Card className="overflow-hidden">
        <CardContent className="py-5">
          <div className="flex items-start gap-5">
            {/* Event Photo / Avatar */}
            <div className="hidden sm:flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-gold/10 border border-gold/20">
              <Calendar className="h-10 w-10 text-gold" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <EditablePlanTitle plan={plan} />
                {plan.eventType && (
                  <Badge className="bg-gold/20 text-gold border-gold/30 text-xs">
                    {EVENT_TYPE_LABELS[plan.eventType] ?? plan.eventType}
                  </Badge>
                )}
              </div>
              {plan.eventDate && (
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 mb-3">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(plan.eventDate).toLocaleDateString("ro-MD", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              )}

              {/* Countdown */}
              {plan.eventDate && <LiveCountdown targetDate={plan.eventDate} />}
            </div>
          </div>

          {/* Vendor Tags */}
          <div className="mt-4 pt-4 border-t border-border/20 flex flex-wrap gap-2">
            {plan.location && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/5 px-3 py-1 text-xs font-medium text-gold">
                <MapPin className="h-3 w-3" />
                {plan.location}
              </span>
            )}
            {bookings.map((b) =>
              b.artistName ? (
                <Link
                  key={b.id}
                  href={b.artistSlug ? `/artisti/${b.artistSlug}` : "#"}
                  className="inline-flex items-center gap-1 rounded-full border border-border/40 bg-accent/30 px-3 py-1 text-xs font-medium text-foreground hover:border-gold/40 transition-colors"
                >
                  {b.artistName}
                </Link>
              ) : null,
            )}
            {bookings.length === 0 && !plan.location && (
              <span className="text-xs text-muted-foreground">
                Adaugă locația și furnizori pentru a apărea aici
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Event progress — single card with three sub-bars (artists,
          invitați, checklist) + the conditional "mark complete"
          gate. Sits directly under the hero so it's the first thing
          the user sees on overview. */}
      <EventProgressCard
        plan={plan}
        bookings={bookings}
        guests={guests}
        guestAccepted={guestAccepted}
        checklistDone={checklistDone}
        checklistTotal={checklistTotal}
        onSwitchTab={onSwitchTab}
        onPlanUpdate={(p) => {
          // Best-effort local update — the parent owns the canonical
          // plan and refetches on archive anyway.
          void p;
        }}
      />

      {/* My Tasks + Stats grid on mobile/tablet */}
      <div className="grid gap-6 lg:grid-cols-1">
        {/* My Tasks */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-heading">Sarcinile mele</CardTitle>
              <span className="text-xs text-muted-foreground">
                {checklistTotal > 0
                  ? `Ai ${checklistTotal - checklistDone} sarcini de completat`
                  : "Nicio sarcină"}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {checklistTotal === 0 ? (
              <p className="py-4 text-sm text-muted-foreground text-center">
                Checklist-ul este gol. Adaugă sarcini din tab-ul Checklist.
              </p>
            ) : (
              <div className="space-y-1">
                {checklist
                  .sort((a, b) => {
                    if (a.done !== b.done) return a.done ? 1 : -1;
                    return (a.sortOrder ?? 999) - (b.sortOrder ?? 999);
                  })
                  .slice(0, 5)
                  .map((item) => (
                    <label
                      key={item.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 cursor-pointer transition-colors hover:bg-accent/30",
                        item.done && "opacity-50",
                      )}
                    >
                      <Checkbox
                        checked={item.done}
                        onCheckedChange={(checked) => onCheckItem(item.id, !!checked)}
                        className="data-[state=checked]:bg-gold data-[state=checked]:border-gold"
                      />
                      <span className={cn("text-sm flex-1", item.done && "line-through")}>
                        {item.title}
                      </span>
                      {item.priority === "high" && !item.done && (
                        <span className="text-[10px] text-warning font-medium">Urgent</span>
                      )}
                    </label>
                  ))}
              </div>
            )}
            {checklistTotal > 5 && (
              <button
                type="button"
                onClick={() => onSwitchTab("checklist")}
                className="mt-2 text-xs text-gold hover:underline flex items-center gap-1"
              >
                Vezi mai mult <ChevronRight className="h-3 w-3" />
              </button>
            )}
          </CardContent>
        </Card>

        {/* Stats cards for mobile (hidden on lg since right sidebar shows them) */}
        <div className="grid grid-cols-2 gap-3 lg:hidden">
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-heading font-bold">{guestTotal}</p>
              <p className="text-xs text-muted-foreground">Invitați</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-heading font-bold">{tables.length}</p>
              <p className="text-xs text-muted-foreground">Mese</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ─── Live Countdown ─────────────────────────────────────────────────

function LiveCountdown({ targetDate }: { targetDate: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const target = new Date(targetDate).getTime();
  const diff = Math.max(0, target - now);

  if (diff === 0) {
    return (
      <p className="text-sm font-medium text-gold">Evenimentul a avut loc!</p>
    );
  }

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((diff / (1000 * 60)) % 60);
  const seconds = Math.floor((diff / 1000) % 60);

  return (
    <div className="flex gap-3">
      {[
        { value: days, label: "Zile" },
        { value: hours, label: "Ore" },
        { value: minutes, label: "Minute" },
        { value: seconds, label: "Secunde" },
      ].map((unit) => (
        <div key={unit.label} className="text-center rounded-lg border border-border/40 bg-accent/30 px-3 py-2 min-w-[56px]">
          <p className="text-xl font-heading font-bold">{unit.value}</p>
          <p className="text-[10px] text-muted-foreground">{unit.label}</p>
        </div>
      ))}
    </div>
  );
}

// ─── Budget Progress Widget ─────────────────────────────────────────

function BudgetProgress({
  plan,
  bookings,
}: {
  plan: Plan;
  /** Bookings for this plan — accepted/confirmed ones with agreedPrice
   *  contribute to the spent total alongside manual localStorage expenses. */
  bookings: BookingRequest[];
}) {
  const [manualSpent, setManualSpent] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`budget-expenses-${plan.id}`);
      if (raw) {
        const expenses = JSON.parse(raw);
        if (Array.isArray(expenses)) {
          setManualSpent(
            expenses.reduce((sum: number, e: { amount: number }) => sum + (e.amount || 0), 0),
          );
        } else {
          setManualSpent(0);
        }
      } else {
        setManualSpent(0);
      }
    } catch {
      setManualSpent(0);
    }
  }, [plan.id]);

  // Only count bookings with an agreed price and in a "sticky" status
  // (accepted / confirmed / completed). Cancelled/rejected don't count.
  const bookingSpent = bookings
    .filter(
      (b) =>
        typeof b.agreedPrice === "number" &&
        ["accepted", "confirmed_by_client", "completed"].includes(b.status),
    )
    .reduce((sum, b) => sum + (b.agreedPrice ?? 0), 0);

  const spent = manualSpent + bookingSpent;
  const total = plan.budgetTarget || 0;
  const pct = total > 0 ? Math.min(100, Math.round((spent / total) * 100)) : 0;

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
        <span>Folosit</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-border/30 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-success",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Budget Tab ─────────────────────────────────────────────────────

interface BudgetExpense {
  id: string;
  category: string;
  description: string;
  amount: number;
  paid: boolean;
}

const BUDGET_CATEGORIES = [
  "Locație / Sală",
  "Artiști / Muzică",
  "Foto & Video",
  "Decorațiuni & Flori",
  "Meniu & Tort",
  "Rochie & Costum",
  "Transport",
  "Invitații",
  "Altele",
];

function BudgetTab({
  plan,
  bookings,
  onBookingUpdate,
}: {
  plan: Plan;
  bookings: BookingRequest[];
  onBookingUpdate: (b: BookingRequest) => void;
}) {
  const storageKey = `budget-expenses-${plan.id}`;
  const [expenses, setExpenses] = useState<BudgetExpense[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [newCat, setNewCat] = useState(BUDGET_CATEGORIES[0]);
  const [newDesc, setNewDesc] = useState("");
  const [newAmount, setNewAmount] = useState("");

  // Accepted/confirmed artist bookings with a price feed the budget as
  // read-only entries in the "Artiști / Muzică" category.
  const bookingExpenses = bookings.filter(
    (b) =>
      typeof b.agreedPrice === "number" &&
      ["accepted", "confirmed_by_client", "completed"].includes(b.status),
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setExpenses(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, [storageKey]);

  async function toggleBookingPaid(b: BookingRequest) {
    const nextStatus = b.paidStatus === "paid" ? "unpaid" : "paid";
    // Optimistic local flip so the UI stays snappy; revert on API failure.
    onBookingUpdate({ ...b, paidStatus: nextStatus });
    try {
      const res = await fetch(`/api/booking-requests/${b.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_paid", paidStatus: nextStatus }),
      });
      if (!res.ok) throw new Error();
    } catch {
      onBookingUpdate(b);
      toast.error("Eroare la actualizare.");
    }
  }

  function save(updated: BudgetExpense[]) {
    setExpenses(updated);
    localStorage.setItem(storageKey, JSON.stringify(updated));
  }

  function addExpense() {
    if (!newDesc.trim() || !newAmount) return;
    const item: BudgetExpense = {
      id: crypto.randomUUID(),
      category: newCat,
      description: newDesc.trim(),
      amount: Number(newAmount),
      paid: false,
    };
    save([...expenses, item]);
    setNewDesc("");
    setNewAmount("");
    setAddOpen(false);
    toast.success("Cheltuială adăugată");
  }

  function togglePaid(id: string) {
    save(expenses.map((e) => (e.id === id ? { ...e, paid: !e.paid } : e)));
  }

  function removeExpense(id: string) {
    save(expenses.filter((e) => e.id !== id));
  }

  const bookingTotal = bookingExpenses.reduce((s, b) => s + (b.agreedPrice ?? 0), 0);
  const bookingPaid = bookingExpenses
    .filter((b) => b.paidStatus === "paid")
    .reduce((s, b) => s + (b.agreedPrice ?? 0), 0);

  const manualSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
  const manualPaid = expenses.filter((e) => e.paid).reduce((sum, e) => sum + e.amount, 0);

  const totalSpent = manualSpent + bookingTotal;
  const totalPaid = manualPaid + bookingPaid;
  const budget = plan.budgetTarget || 0;
  const remaining = budget - totalSpent;

  // Group by category
  const grouped = BUDGET_CATEGORIES.map((cat) => ({
    category: cat,
    items: expenses.filter((e) => e.category === cat),
    total: expenses.filter((e) => e.category === cat).reduce((s, e) => s + e.amount, 0),
  })).filter((g) => g.items.length > 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-heading text-xl font-bold">Budget & Cheltuieli</h2>
          <p className="text-sm text-muted-foreground">
            Buget total: {budget > 0 ? `${budget}€` : "Nesetat"}
          </p>
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          className="gap-1 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
          size="sm"
        >
          <Plus className="h-4 w-4" /> Adaugă cheltuială
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-lg font-bold">{budget}€</p>
            <p className="text-[10px] text-muted-foreground">Budget total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-lg font-bold text-warning">{totalSpent}€</p>
            <p className="text-[10px] text-muted-foreground">Planificat</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className="text-lg font-bold text-success">{totalPaid}€</p>
            <p className="text-[10px] text-muted-foreground">Achitat</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 text-center">
            <p className={cn("text-lg font-bold", remaining < 0 ? "text-destructive" : "text-foreground")}>
              {remaining}€
            </p>
            <p className="text-[10px] text-muted-foreground">Rămas</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress */}
      {budget > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>Utilizat {Math.round((totalSpent / budget) * 100)}%</span>
            <span>{totalSpent}€ / {budget}€</span>
          </div>
          <div className="h-3 w-full rounded-full bg-border/30 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                totalSpent > budget ? "bg-destructive" : totalSpent > budget * 0.7 ? "bg-warning" : "bg-gold",
              )}
              style={{ width: `${Math.min(100, (totalSpent / budget) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Bookings → auto-synced "Artiști / Muzică" entries ────────── */}
      {bookingExpenses.length > 0 && (
        <Card className="mb-4 border-gold/30">
          <CardHeader className="py-3 pb-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-gold" />
                Artiști / Muzică
                <span className="text-[10px] font-normal text-muted-foreground">
                  (din rezervări)
                </span>
              </CardTitle>
              <span className="text-sm font-bold">{bookingTotal}€</span>
            </div>
          </CardHeader>
          <CardContent className="py-2">
            {bookingExpenses.map((b) => (
              <div
                key={b.id}
                className="flex items-center gap-3 py-2 border-b border-border/20 last:border-0"
              >
                <Checkbox
                  checked={b.paidStatus === "paid"}
                  onCheckedChange={() => toggleBookingPaid(b)}
                  className="data-[state=checked]:bg-success data-[state=checked]:border-success"
                />
                <div className="flex-1 min-w-0">
                  <p
                    className={cn(
                      "text-sm truncate",
                      b.paidStatus === "paid" && "line-through text-muted-foreground",
                    )}
                  >
                    {b.artistName ?? "Artist"}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {STATUS_CONFIG[b.status]?.label ?? b.status}
                  </p>
                </div>
                <span className="text-sm font-medium">{b.agreedPrice}€</span>
                {b.artistSlug && (
                  <Link
                    href={`/artisti/${b.artistSlug}`}
                    className="text-muted-foreground hover:text-gold"
                    title="Vezi artistul"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Expenses by category */}
      {grouped.length === 0 && bookingExpenses.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">
          <Wallet className="mx-auto mb-3 h-8 w-8 opacity-40" />
          <p>Nu ai cheltuieli încă.</p>
          <p className="text-xs mt-1">Adaugă prima cheltuială pentru a urmări bugetul.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => (
            <Card key={g.category}>
              <CardHeader className="py-3 pb-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">{g.category}</CardTitle>
                  <span className="text-sm font-bold">{g.total}€</span>
                </div>
              </CardHeader>
              <CardContent className="py-2">
                {g.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 py-2 border-b border-border/20 last:border-0"
                  >
                    <Checkbox
                      checked={item.paid}
                      onCheckedChange={() => togglePaid(item.id)}
                      className="data-[state=checked]:bg-success data-[state=checked]:border-success"
                    />
                    <span className={cn("flex-1 text-sm", item.paid && "line-through text-muted-foreground")}>
                      {item.description}
                    </span>
                    <span className="text-sm font-medium">{item.amount}€</span>
                    <button
                      type="button"
                      onClick={() => removeExpense(item.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add expense dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Cheltuială nouă</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Categorie</Label>
              <Select value={newCat} onValueChange={(v) => { if (v) setNewCat(v); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUDGET_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descriere</Label>
              <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Ex: Sală Nuntă" />
            </div>
            <div className="space-y-2">
              <Label>Sumă (EUR)</Label>
              <Input type="number" min="0" value={newAmount} onChange={(e) => setNewAmount(e.target.value)} placeholder="0" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Anulează</Button>
            <Button onClick={addExpense} className="bg-gold text-[#0D0D0D] hover:bg-gold-dark" disabled={!newDesc.trim() || !newAmount}>
              Adaugă
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Timeline Tab ───────────────────────────────────────────────────

function TimelineTab({ checklist, eventDate }: { checklist: ChecklistItem[]; eventDate: string | null }) {
  if (!eventDate) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <Clock className="mx-auto mb-3 h-8 w-8 opacity-40" />
        <p>Setează data evenimentului pentru a vedea cronologia.</p>
      </div>
    );
  }

  const target = new Date(eventDate);
  const now = new Date();
  const daysUntil = Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  // Group tasks by time period
  const periods = [
    { label: "Depășite", min: -Infinity, max: 0, color: "text-destructive", borderColor: "border-destructive/30" },
    { label: "Această săptămână", min: 0, max: 7, color: "text-warning", borderColor: "border-warning/30" },
    { label: "Această lună", min: 7, max: 30, color: "text-gold", borderColor: "border-gold/30" },
    { label: "1-3 luni", min: 30, max: 90, color: "text-foreground", borderColor: "border-border/40" },
    { label: "3-6 luni", min: 90, max: 180, color: "text-muted-foreground", borderColor: "border-border/30" },
    { label: "6+ luni", min: 180, max: Infinity, color: "text-muted-foreground/60", borderColor: "border-border/20" },
  ];

  const itemsWithDue = checklist
    .filter((c) => c.dueDaysBefore != null)
    .map((c) => {
      const daysBeforeEvent = c.dueDaysBefore!;
      const dueInDays = daysUntil - daysBeforeEvent; // negative means overdue
      return { ...c, dueInDays, daysBeforeEvent };
    })
    .sort((a, b) => a.dueInDays - b.dueInDays);

  return (
    <div>
      <h2 className="font-heading text-xl font-bold mb-1">Cronologie</h2>
      <p className="text-sm text-muted-foreground mb-6">
        {daysUntil > 0 ? `${daysUntil} zile până la eveniment` : "Evenimentul a trecut"}
      </p>

      {itemsWithDue.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground text-sm">
          Nicio sarcină cu termen setat.
        </p>
      ) : (
        <div className="space-y-6">
          {periods.map((period) => {
            const items = itemsWithDue.filter(
              (i) => i.dueInDays >= period.min && i.dueInDays < period.max && !i.done,
            );
            if (items.length === 0) return null;
            return (
              <div key={period.label}>
                <h3 className={cn("text-sm font-semibold mb-2", period.color)}>
                  {period.label} ({items.length})
                </h3>
                <div className="space-y-1">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className={cn("flex items-center gap-3 rounded-lg border px-3 py-2.5", period.borderColor)}
                    >
                      <div className={cn("h-2 w-2 rounded-full shrink-0", period.color === "text-destructive" ? "bg-destructive" : period.color === "text-warning" ? "bg-warning" : "bg-gold")} />
                      <span className="text-sm flex-1">{item.title}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {item.daysBeforeEvent > 0 ? `${item.daysBeforeEvent}z înainte` : "Ziua evenimentului"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Done items */}
          {itemsWithDue.filter((i) => i.done).length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-success mb-2">
                Completate ({itemsWithDue.filter((i) => i.done).length})
              </h3>
              <div className="space-y-1">
                {itemsWithDue
                  .filter((i) => i.done)
                  .map((item) => (
                    <div key={item.id} className="flex items-center gap-3 rounded-lg border border-success/20 bg-success/5 px-3 py-2 opacity-60">
                      <div className="h-2 w-2 rounded-full bg-success shrink-0" />
                      <span className="text-sm flex-1 line-through">{item.title}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Bookings Tab ───────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: "In așteptare", color: "text-warning border-warning/30 bg-warning/5" },
  // Both `accepted` (legacy) and `confirmed_by_client` (new) render as
  // "Confirmat" — the artist's accept is now the final step.
  accepted: { label: "Confirmat", color: "text-success border-success/30 bg-success/5" },
  confirmed_by_client: { label: "Confirmat", color: "text-success border-success/30 bg-success/5" },
  rejected: { label: "Refuzat", color: "text-destructive border-destructive/30 bg-destructive/5" },
  cancelled: { label: "Anulat", color: "text-muted-foreground border-border/40 bg-muted/5" },
  completed: { label: "Finalizat", color: "text-gold border-gold/30 bg-gold/5" },
};

// ─── Rezervări Artiști Tab ──────────────────────────────────────────
// Combines the user's existing artist bookings (top) with a discovery
// feed of artists whose calendar is free on the plan's event date (bottom).
// The discovery feed pre-filters by selectedCategories if the wizard set
// any, otherwise shows the newest active artists.

interface AvailabilitySlot {
  id: number;
  startTime: string;
  endTime: string;
  price: number | null;
}

interface DiscoveryArtist {
  id: number;
  slug: string;
  nameRo: string;
  descriptionRo?: string | null;
  descriptionShortRo?: string | null;
  /** The API returns coverImageUrl; we keep coverUrl as a legacy fallback. */
  coverImageUrl?: string | null;
  coverUrl?: string | null;
  priceFrom: number | null;
  /** Number of visible priced packages (1h=100€, 2h=150€, ...). */
  packageCount?: number;
  /** Lowest package price — same as priceFrom when it's the floor. */
  packageMinPrice?: number | null;
  /** Highest package price. */
  packageMaxPrice?: number | null;
  ratingAvg: number;
  ratingCount: number;
  categoryIds?: number[];
  categoryNames?: string[];
  availabilitySlots?: AvailabilitySlot[];
  /** Category id this artist was fetched under — we annotate this after
   *  fetching so we can group the discovery list by category section. */
  _fetchedForCategoryId?: number;
}

const MAX_PER_CATEGORY = 5;

function BookingsTab({
  plan,
  bookings,
  onRefresh,
}: {
  plan: Plan;
  bookings: BookingRequest[];
  /** Re-fetches the bookings list — called after price negotiation
   *  or status changes so the UI reflects the new state. */
  onRefresh: () => Promise<void> | void;
}) {
  const { user } = useUser();
  /** Discovery artists keyed by category id — each category gets its own
   *  section in the UI so the user sees "Fotografi: 6 disponibili" etc. */
  const [byCategory, setByCategory] = useState<
    Array<{ categoryId: number; categoryName: string; artists: DiscoveryArtist[] }>
  >([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);

  // Fetch artists per selected category so the UI can render a dedicated
  // section per category with its name header. When no categories were
  // selected in the wizard we fall back to a single "Toți artiștii"
  // section populated with recent active artists.
  useEffect(() => {
    if (!plan.eventDate) return;
    setDiscoveryLoading(true);
    (async () => {
      try {
        // Fetch category metadata + wishlist in parallel — wishlisted
        // artists float to the top of every category section so the
        // user sees their saved favourites before random newcomers.
        const [catsRes, wishlistRes] = await Promise.all([
          fetch("/api/categories", { cache: "no-store" }).then((r) =>
            r.ok ? r.json() : [],
          ),
          fetch("/api/wishlist", { cache: "no-store" }).then((r) =>
            r.ok ? r.json() : { items: [] },
          ),
        ]);
        const cats: Array<{ id: number; nameRo: string }> = Array.isArray(catsRes)
          ? catsRes
          : catsRes.items ?? [];
        const catNameById = new Map(cats.map((c) => [c.id, c.nameRo]));
        const wishlistArtistIds = new Set<number>(
          ((wishlistRes?.items ?? []) as Array<{
            entityType: string;
            entityId: number;
          }>)
            .filter((w) => w.entityType === "artist")
            .map((w) => w.entityId),
        );
        // Promote wishlisted artists to the top of each category list,
        // preserving the API's existing newest-first order for the rest.
        const promote = (list: DiscoveryArtist[]): DiscoveryArtist[] => {
          if (wishlistArtistIds.size === 0) return list;
          const wishlisted = list.filter((a) => wishlistArtistIds.has(a.id));
          const others = list.filter((a) => !wishlistArtistIds.has(a.id));
          return [...wishlisted, ...others];
        };

        const categories = plan.selectedCategories ?? [];
        // Discovery feed:
        //   - sort=newest so freshly registered artists surface at the
        //     top instead of being buried after the legacy seed batch;
        //   - limit=200 so categories with 60+ artists (Moderatori has
        //     71+) don't drop the tail off the end of the page. The
        //     initial grid still only shows INITIAL_VISIBLE per
        //     category; "Încarcă mai mulți" reveals the rest from
        //     memory without refetching.
        if (categories.length === 0) {
          const res = await fetch(
            `/api/artists?date=${plan.eventDate}&sort=newest&limit=200`,
            { cache: "no-store" },
          ).then((r) => (r.ok ? r.json() : { items: [] }));
          setByCategory([
            {
              categoryId: 0,
              categoryName: "Toți artiștii",
              artists: promote((res.items ?? []) as DiscoveryArtist[]),
            },
          ]);
          return;
        }

        const sections = await Promise.all(
          categories.map(async (catId) => {
            const res = await fetch(
              `/api/artists?date=${plan.eventDate}&category=${catId}&sort=newest&limit=200`,
              { cache: "no-store" },
            ).then((r) => (r.ok ? r.json() : { items: [] }));
            return {
              categoryId: catId,
              categoryName: catNameById.get(catId) ?? `Categorie #${catId}`,
              artists: promote((res.items ?? []) as DiscoveryArtist[]),
            };
          }),
        );
        setByCategory(sections);
      } catch {
        setByCategory([]);
      } finally {
        setDiscoveryLoading(false);
      }
    })();
  }, [plan.eventDate, plan.selectedCategories]);

  // Active bookings indexed by artistId. Rejected / cancelled / expired
  // entries don't count — those slots free up so the client can shop
  // a different artist in the same category.
  const ACTIVE_STATUSES = new Set([
    "pending",
    "accepted",
    "confirmed_by_client",
    "completed",
  ]);
  const bookingByArtistId = new Map<number, BookingRequest>();
  for (const b of bookings) {
    if (!ACTIVE_STATUSES.has(b.status)) continue;
    // Keep the most recent active booking per artist
    const existing = bookingByArtistId.get(b.artistId);
    if (!existing) bookingByArtistId.set(b.artistId, b);
  }
  const bookedArtistIds = new Set(bookingByArtistId.keys());

  // For each category, find the active blocker booking + the artist's
  // display name. Used to:
  //   - cap the discovery section to a single live request per category
  //   - render the "Așteaptă răspunsul lui …" tooltip on the other
  //     artists in that category
  //   - drive the 24h countdown on the artist actually holding the slot
  const categoryBlocker = new Map<
    number,
    { artistId: number; artistName: string; status: string; createdAt: string }
  >();
  for (const section of byCategory) {
    for (const a of section.artists) {
      const b = bookingByArtistId.get(a.id);
      if (b) {
        // First active booking wins; new requests are POST-blocked anyway.
        if (!categoryBlocker.has(section.categoryId)) {
          categoryBlocker.set(section.categoryId, {
            artistId: a.id,
            artistName: a.nameRo ?? "Artist",
            status: b.status,
            createdAt: b.createdAt ?? new Date().toISOString(),
          });
        }
      }
    }
  }
  const bookingsPerCategory = new Map<number, number>();
  for (const section of byCategory) {
    const booked = section.artists.filter((a) =>
      bookedArtistIds.has(a.id),
    ).length;
    bookingsPerCategory.set(section.categoryId, booked);
  }

  // Track artists who have rejected/cancelled bookings on this plan so
  // the discovery section can hide its "Solicită rezervare" CTA — once
  // a partner declines, the client should pick a different artist
  // rather than spam the same one. The notification is still surfaced
  // via the bell.
  const blockedArtistIds = new Set<number>();
  for (const b of bookings) {
    if (
      b.status === "rejected" ||
      b.status === "cancelled" ||
      b.status === "expired"
    ) {
      blockedArtistIds.add(b.artistId);
    }
  }

  // Scope bookings to this plan only AND hide rejected/cancelled/expired
  // entries — they're noise in the "Rezervările mele" list. The user
  // still gets the bell notification when the artist declines, and the
  // booking row stays in the database for audit/CRM.
  const planBookings = bookings.filter(
    (b) =>
      b.status !== "rejected" &&
      b.status !== "cancelled" &&
      b.status !== "expired",
  );
  // Split into "Cu succes" (the artist accepted, or the client is done
  // with their part) vs "În așteptare" (still waiting on the artist).
  // The pending bucket gets a 24h countdown per row.
  const pendingBookings = planBookings.filter((b) => b.status === "pending");
  const confirmedBookings = planBookings.filter((b) => b.status !== "pending");

  return (
    <div className="space-y-10">
      {/* ─── AI assistant (collapsed CTA by default) ─────────────── */}
      <AIArtistPickerChat
        eventPlanId={plan.id}
        onBookingsCreated={onRefresh}
      />

      {/* ─── Section 1: Existing bookings, split confirmed vs pending ── */}
      <section>
        <div className="mb-4">
          <h2 className="font-heading text-xl font-bold">Rezervările mele</h2>
          <p className="text-sm text-muted-foreground">
            {confirmedBookings.length} cu succes · {pendingBookings.length}{" "}
            în așteptare
          </p>
        </div>

        {planBookings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/40 py-10 text-center text-muted-foreground">
            <BookOpen className="mx-auto mb-3 h-8 w-8 opacity-40" />
            <p className="text-sm">Nu ai rezervări încă.</p>
            <p className="text-xs mt-1">
              Alege un artist din secțiunea de mai jos pentru a trimite prima cerere.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {confirmedBookings.length > 0 && (
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-success">
                  <Check className="h-3.5 w-3.5" /> Rezervări cu succes
                  <span className="rounded-full bg-success/15 px-2 py-0.5 text-[10px] text-success">
                    {confirmedBookings.length}
                  </span>
                </h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {confirmedBookings.map((b) => (
                    <BookingListCard
                      key={b.id}
                      booking={b}
                      onRefresh={onRefresh}
                    />
                  ))}
                </div>
              </div>
            )}

            {pendingBookings.length > 0 && (
              <div>
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-warning">
                  <Clock className="h-3.5 w-3.5" /> Rezervări în așteptare
                  <span className="rounded-full bg-warning/15 px-2 py-0.5 text-[10px] text-warning">
                    {pendingBookings.length}
                  </span>
                </h3>
                <div className="grid gap-3 md:grid-cols-2">
                  {pendingBookings.map((b) => (
                    <BookingListCard
                      key={b.id}
                      booking={b}
                      onRefresh={onRefresh}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ─── Section 2: Discover available artists, grouped by category ── */}
      {plan.eventDate && (
        <DiscoverySection
          plan={plan}
          byCategory={byCategory}
          loading={discoveryLoading}
          bookingByArtistId={bookingByArtistId}
          bookingsPerCategory={bookingsPerCategory}
          blockedArtistIds={blockedArtistIds}
          categoryBlocker={categoryBlocker}
          clientName={user?.fullName ?? "Client"}
          clientPhone={user?.primaryPhoneNumber?.phoneNumber ?? ""}
          clientEmail={user?.primaryEmailAddress?.emailAddress ?? undefined}
          onRefresh={onRefresh}
        />
      )}
    </div>
  );
}

// Default number of cards shown per category before the user hits "Load more".
const INITIAL_VISIBLE = 8;
const LOAD_MORE_STEP = 8;
const COLUMN_OPTIONS = [3, 4, 5] as const;
type ColumnCount = (typeof COLUMN_OPTIONS)[number];
type ViewMode = "grid" | "list";
const COLUMN_STORAGE_KEY = "plan-bookings-columns";
const VIEW_MODE_STORAGE_KEY = "plan-bookings-view-mode";

// Mobile users get their own column picker — desktop options (3/4/5) are
// too cramped on a phone, and "single column" wastes vertical space when
// browsing dozens of artists. Default 2 because that's the readable
// sweet-spot for the artist-card layout at 320–430px widths.
const MOBILE_COLUMN_OPTIONS = [1, 2, 3] as const;
type MobileColumnCount = (typeof MOBILE_COLUMN_OPTIONS)[number];
const MOBILE_COLUMN_STORAGE_KEY = "plan-bookings-mobile-columns";

// Budget brackets on the per-category browse view. Same thresholds across
// every category — small/medium/large is a coarse signal and per-category
// tuning would just confuse clients comparing across artists.
type BudgetBracket = "all" | "small" | "medium" | "large";
const BUDGET_BRACKETS: Array<{
  key: BudgetBracket;
  label: string;
  min?: number;
  max?: number;
}> = [
  { key: "all", label: "Toți" },
  { key: "small", label: "Buget mic", max: 200 },
  { key: "medium", label: "Buget mediu", min: 200, max: 500 },
  { key: "large", label: "Buget mare", min: 500 },
];

function inBudgetBracket(
  price: number | null | undefined,
  bracket: BudgetBracket,
): boolean {
  if (bracket === "all") return true;
  // Artists without a published price land in "all" only — bucketing
  // them anywhere else would be guesswork.
  if (price == null) return false;
  const bb = BUDGET_BRACKETS.find((b) => b.key === bracket);
  if (!bb) return true;
  if (bb.min !== undefined && price < bb.min) return false;
  if (bb.max !== undefined && price >= bb.max) return false;
  return true;
}

function DiscoverySection({
  plan,
  byCategory,
  loading,
  bookingByArtistId,
  bookingsPerCategory,
  blockedArtistIds,
  categoryBlocker,
  clientName,
  clientPhone,
  clientEmail,
  onRefresh,
}: {
  plan: Plan;
  byCategory: Array<{ categoryId: number; categoryName: string; artists: DiscoveryArtist[] }>;
  loading: boolean;
  bookingByArtistId: Map<number, BookingRequest>;
  bookingsPerCategory: Map<number, number>;
  /** Artists who already declined / cancelled / expired a booking on this
   *  plan. The CTA is disabled with a "Refuzat anterior" label so the
   *  client picks a different artist. */
  blockedArtistIds: Set<number>;
  /** For each category that already has an active request on this plan,
   *  the artist holding the slot. Drives the "Așteaptă răspunsul lui …"
   *  tooltip on every other artist in the same category, and the 24h
   *  countdown on the artist who is actually pending. */
  categoryBlocker: Map<
    number,
    { artistId: number; artistName: string; status: string; createdAt: string }
  >;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  onRefresh: () => Promise<void> | void;
}) {
  // Columns preference — persisted per user in localStorage so the layout
  // stays consistent between plan visits.
  const [columns, setColumns] = useState<ColumnCount>(4);
  const [mobileColumns, setMobileColumns] =
    useState<MobileColumnCount>(2);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  useEffect(() => {
    try {
      const stored = localStorage.getItem(COLUMN_STORAGE_KEY);
      const n = Number(stored);
      if (COLUMN_OPTIONS.includes(n as ColumnCount)) {
        setColumns(n as ColumnCount);
      }
      const storedMobile = localStorage.getItem(MOBILE_COLUMN_STORAGE_KEY);
      const m = Number(storedMobile);
      if (MOBILE_COLUMN_OPTIONS.includes(m as MobileColumnCount)) {
        setMobileColumns(m as MobileColumnCount);
      }
      const storedView = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (storedView === "list" || storedView === "grid") {
        setViewMode(storedView);
      }
    } catch { /* ignore */ }
  }, []);
  function changeColumns(n: ColumnCount) {
    setColumns(n);
    try { localStorage.setItem(COLUMN_STORAGE_KEY, String(n)); } catch { /* ignore */ }
  }
  function changeMobileColumns(n: MobileColumnCount) {
    setMobileColumns(n);
    try {
      localStorage.setItem(MOBILE_COLUMN_STORAGE_KEY, String(n));
    } catch { /* ignore */ }
  }
  function changeViewMode(mode: ViewMode) {
    setViewMode(mode);
    try { localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode); } catch { /* ignore */ }
  }

  // Visible-count + Load-more state moved into <SequentialCategories>.

  // Tailwind can't safely interpolate arbitrary lg:grid-cols-N at runtime
  // because it purges unused classes. The mobile prefix (no breakpoint)
  // controls phones; sm/lg/xl prefixes step up at 640/1024/1280px.
  const mobileColsClass =
    mobileColumns === 1
      ? "grid-cols-1"
      : mobileColumns === 2
        ? "grid-cols-2"
        : "grid-cols-3";
  const gridCols =
    viewMode === "list"
      ? "grid-cols-1"
      : columns === 3
        ? `${mobileColsClass} sm:grid-cols-2 lg:grid-cols-3`
        : columns === 4
          ? `${mobileColsClass} sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
          : `${mobileColsClass} sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5`;

  return (
    <section className="space-y-10">
      <div className="mb-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-bold">
            Artiști disponibili pentru data ta
          </h2>
          <p className="text-sm text-muted-foreground">
            {new Date(plan.eventDate + "T00:00:00").toLocaleDateString("ro-MD", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            {plan.selectedCategories && plan.selectedCategories.length > 0 && (
              <span> · {plan.selectedCategories.length} categorii selectate</span>
            )}
            {" · max 5 cereri per categorie"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle — grid / list */}
          <div className="flex items-center gap-1 rounded-lg border border-border/40 bg-card p-1">
            <button
              type="button"
              onClick={() => changeViewMode("grid")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                viewMode === "grid"
                  ? "bg-gold text-[#0D0D0D]"
                  : "text-muted-foreground hover:bg-accent",
              )}
              title="Vizualizare grilă"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Grilă</span>
            </button>
            <button
              type="button"
              onClick={() => changeViewMode("list")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                viewMode === "list"
                  ? "bg-gold text-[#0D0D0D]"
                  : "text-muted-foreground hover:bg-accent",
              )}
              title="Vizualizare listă"
            >
              <List className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Listă</span>
            </button>
          </div>
          {/* Column picker — desktop (3/4/5 cards per row) and mobile
              (1/2/3). Two pickers because the readable card width is
              very different on a phone vs a 27" monitor; sharing one
              control led to either tiny phone cards or wasted desktop
              space. */}
          {viewMode === "grid" && (
            <>
              <div className="hidden lg:flex items-center gap-1 rounded-lg border border-border/40 bg-card p-1">
                <span className="px-2 text-xs text-muted-foreground">
                  Coloane:
                </span>
                {COLUMN_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => changeColumns(n)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      columns === n
                        ? "bg-gold text-[#0D0D0D]"
                        : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex sm:hidden items-center gap-1 rounded-lg border border-border/40 bg-card p-1">
                <span className="px-2 text-[11px] text-muted-foreground">
                  Pe rând:
                </span>
                {MOBILE_COLUMN_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => changeMobileColumns(n)}
                    className={cn(
                      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                      mobileColumns === n
                        ? "bg-gold text-[#0D0D0D]"
                        : "text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-gold" />
        </div>
      ) : byCategory.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/40 py-10 text-center text-muted-foreground">
          <p className="text-sm">
            {plan.selectedCategories && plan.selectedCategories.length > 0
              ? "Niciun artist disponibil în categoriile selectate pentru această dată."
              : "Niciun artist disponibil pentru această dată."}
          </p>
          <Link href="/artisti">
            <Button variant="outline" size="sm" className="mt-4">
              Explorează toți artiștii
            </Button>
          </Link>
        </div>
      ) : (
        // Sequential category browse — show one category at a time so
        // the client decides per category before moving on. Skip/Back
        // navigation lets them re-visit earlier categories without
        // losing the per-category budget bracket they picked.
        <SequentialCategories
          byCategory={byCategory}
          plan={plan}
          gridCols={gridCols}
          viewMode={viewMode}
          bookingByArtistId={bookingByArtistId}
          categoryBlocker={categoryBlocker}
          blockedArtistIds={blockedArtistIds}
          clientName={clientName}
          clientPhone={clientPhone}
          clientEmail={clientEmail}
          onRefresh={onRefresh}
        />
      )}
    </section>
  );
}

/**
 * Sequential per-category artist browser. Renders ONE category at a
 * time; "Sări peste" / "Înapoi" / "Continuă" buttons walk through the
 * list. Each category gets its own budget bracket (Toți / Mic / Mediu
 * / Mare) so the user can drill in without affecting siblings.
 */
function SequentialCategories({
  byCategory,
  plan,
  gridCols,
  viewMode,
  bookingByArtistId,
  categoryBlocker,
  blockedArtistIds,
  clientName,
  clientPhone,
  clientEmail,
  onRefresh,
}: {
  byCategory: Array<{ categoryId: number; categoryName: string; artists: DiscoveryArtist[] }>;
  plan: Plan;
  gridCols: string;
  viewMode: ViewMode;
  bookingByArtistId: Map<number, BookingRequest>;
  categoryBlocker: Map<
    number,
    { artistId: number; artistName: string; status: string; createdAt: string }
  >;
  blockedArtistIds: Set<number>;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  onRefresh: () => Promise<void> | void;
}) {
  const [currentIdx, setCurrentIdx] = useState(0);
  // Per-category visible count (Load more) and budget bracket. The
  // brackets are keyed by categoryId so going back keeps the previous
  // selection.
  const [visibleByCategory, setVisibleByCategory] = useState<
    Record<number, number>
  >({});
  const [bracketByCategory, setBracketByCategory] = useState<
    Record<number, BudgetBracket>
  >({});

  // Reset to the first category when the byCategory list changes (e.g.
  // user toggles selectedCategories in Setări and the parent refetches).
  // Guarded so the effect only triggers a setState when the index is
  // actually out of range, avoiding the cascading-render warning.
  useEffect(() => {
    if (currentIdx >= byCategory.length) {
      setCurrentIdx(0);
    }
  }, [byCategory.length, currentIdx]);

  // Reset scroll on category change so the user starts at the top of
  // the section header. requestAnimationFrame so React commits first.
  useEffect(() => {
    if (typeof window === "undefined") return;
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }, [currentIdx]);

  // Auto-advance to the NEXT UNBOOKED category. Without the
  // unbooked-only filter the effect would chain-advance through every
  // already-booked category at 2.5s intervals — exactly the bug a user
  // hit when they reopened a fully-booked plan and watched the page
  // strobe through 5 categories in 12 seconds.
  const currentCategoryId = byCategory[currentIdx]?.categoryId ?? null;
  const hasActiveBookingHere =
    currentCategoryId != null && categoryBlocker.has(currentCategoryId);
  // Find the next category INDEX that has no booking yet.
  const nextUnbookedIdx = (() => {
    for (let i = currentIdx + 1; i < byCategory.length; i++) {
      const id = byCategory[i]?.categoryId;
      if (id != null && !categoryBlocker.has(id)) return i;
    }
    return -1;
  })();
  const allCategoriesBooked = byCategory.every((s) =>
    categoryBlocker.has(s.categoryId),
  );
  useEffect(() => {
    if (!hasActiveBookingHere) return;
    if (nextUnbookedIdx === -1) return;
    const id = setTimeout(() => {
      setCurrentIdx(nextUnbookedIdx);
    }, 2500);
    return () => clearTimeout(id);
  }, [hasActiveBookingHere, nextUnbookedIdx]);

  function showMore(categoryId: number) {
    setVisibleByCategory((prev) => ({
      ...prev,
      [categoryId]: (prev[categoryId] ?? INITIAL_VISIBLE) + LOAD_MORE_STEP,
    }));
  }

  function setBracket(categoryId: number, bracket: BudgetBracket) {
    setBracketByCategory((prev) => ({ ...prev, [categoryId]: bracket }));
  }

  if (byCategory.length === 0) return null;

  // Once every selected category has an active request, browsing more
  // artists is pointless — show the user a clear "you're done here"
  // panel that nudges them to the next planning step (checklist /
  // invitati / overview) instead of strobing through booked sections.
  if (allCategoriesBooked) {
    return (
      <AllCategoriesBookedPanel
        plan={plan}
        bookings={Array.from(bookingByArtistId.values())}
      />
    );
  }

  const section = byCategory[currentIdx];
  const blocker = categoryBlocker.get(section.categoryId);
  const limitReached = !!blocker;
  const used = limitReached ? 1 : 0;
  const visible = visibleByCategory[section.categoryId] ?? INITIAL_VISIBLE;
  const bracket = bracketByCategory[section.categoryId] ?? "all";

  const orderedArtists = blocker
    ? [
        ...section.artists.filter((a) => a.id === blocker.artistId),
        ...section.artists.filter((a) => a.id !== blocker.artistId),
      ]
    : section.artists;
  const filtered = orderedArtists.filter((a) =>
    inBudgetBracket(a.priceFrom, bracket),
  );
  const shown = filtered.slice(0, visible);
  const hasMore = filtered.length > visible;
  const isEmpty = filtered.length === 0;

  const isFirst = currentIdx === 0;
  const isLast = currentIdx === byCategory.length - 1;

  return (
    <div className="space-y-6">
      {/* Step indicator + category title */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wider text-gold/70">
            Categoria {currentIdx + 1} din {byCategory.length}
          </p>
          <h3 className="font-heading text-xl font-bold">
            {section.categoryName}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {filtered.length} artiști{" "}
            {bracket !== "all" ? "în bugetul ales" : "disponibili"} · {used}/1
            cerere activă
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
            disabled={isFirst}
            className={cn(
              "rounded-lg border px-3 py-1.5 transition-colors",
              isFirst
                ? "border-border/30 text-muted-foreground/40"
                : "border-border/40 hover:border-gold/30 hover:text-foreground",
            )}
          >
            ← Înapoi
          </button>
          {!isLast && (
            <button
              type="button"
              onClick={() => setCurrentIdx((i) => i + 1)}
              className="rounded-lg border border-border/40 px-3 py-1.5 hover:border-gold/30"
            >
              Sări peste →
            </button>
          )}
        </div>
      </div>

      {/* Budget bracket filter */}
      <div className="flex flex-wrap gap-2">
        {BUDGET_BRACKETS.map((b) => {
          const isActive = bracket === b.key;
          return (
            <button
              key={b.key}
              type="button"
              onClick={() => setBracket(section.categoryId, b.key)}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs transition-colors",
                isActive
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-border/40 text-muted-foreground hover:border-gold/30",
              )}
            >
              {b.label}
              {b.min !== undefined && b.max !== undefined ? (
                <span className="ml-1 text-muted-foreground/70">
                  ({b.min}–{b.max}€)
                </span>
              ) : b.min !== undefined ? (
                <span className="ml-1 text-muted-foreground/70">
                  (peste {b.min}€)
                </span>
              ) : b.max !== undefined ? (
                <span className="ml-1 text-muted-foreground/70">
                  (sub {b.max}€)
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {isEmpty ? (
        <div className="rounded-xl border border-dashed border-border/40 py-8 text-center text-xs text-muted-foreground">
          {bracket === "all"
            ? "Niciun artist disponibil în această categorie pentru data aleasă."
            : "Niciun artist în această categorie cu bugetul selectat. Încearcă alt buget sau sări la următoarea categorie."}
        </div>
      ) : (
        <>
          <div className={cn("grid gap-4", gridCols)}>
            {shown.map((a) => {
              const isBlockedByOther =
                !!blocker && blocker.artistId !== a.id;
              return (
                <PlanArtistCard
                  key={a.id}
                  artist={a}
                  plan={plan}
                  existingBooking={bookingByArtistId.get(a.id)}
                  previouslyDeclined={blockedArtistIds.has(a.id)}
                  categoryLimitReached={limitReached}
                  blockedByOtherArtistName={
                    isBlockedByOther ? blocker.artistName : null
                  }
                  clientName={clientName}
                  clientPhone={clientPhone}
                  clientEmail={clientEmail}
                  viewMode={viewMode}
                  onRefresh={() => onRefresh()}
                />
              );
            })}
          </div>
          {hasMore && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => showMore(section.categoryId)}
                className="gap-2"
              >
                Încarcă mai mulți {section.categoryName.toLowerCase()} (
                {filtered.length - visible} rămași)
              </Button>
            </div>
          )}
        </>
      )}

      {/* Big footer step nav so the user has an obvious next-step CTA
          after browsing — especially on mobile where the top nav is
          off-screen by now. */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/30 pt-4">
        <button
          type="button"
          onClick={() => setCurrentIdx((i) => Math.max(0, i - 1))}
          disabled={isFirst}
          className={cn(
            "rounded-lg border px-4 py-2 text-sm",
            isFirst
              ? "border-border/30 text-muted-foreground/40"
              : "border-border/40 hover:border-gold/30",
          )}
        >
          ← Categoria precedentă
        </button>
        {isLast ? (
          <span className="text-xs text-muted-foreground">
            Aceasta a fost ultima categorie aleasă.
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setCurrentIdx((i) => i + 1)}
            className="rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-[#0D0D0D] hover:bg-gold-dark"
          >
            Continuă la {byCategory[currentIdx + 1]?.categoryName} →
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Single row in the BookingsTab "Rezervările mele" list. Encapsulates
 * the layout that used to live inline so the same shape can render
 * inside both the "Rezervări cu succes" and "Rezervări în așteptare"
 * buckets without duplicating ~80 lines of JSX. Pending rows get a
 * countdown to the auto-expiry deadline.
 */
function BookingListCard({
  booking: b,
  onRefresh,
}: {
  booking: BookingRequest;
  onRefresh: () => Promise<void> | void;
}) {
  const cfg = STATUS_CONFIG[b.status] || STATUS_CONFIG.pending;
  const isPending = b.status === "pending";
  return (
    <Card className="transition-all hover:border-gold/30">
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-full bg-gold/10 flex items-center justify-center shrink-0">
              <BookOpen className="h-5 w-5 text-gold" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">
                {b.artistName || "Artist"}
              </p>
              <p className="text-xs text-muted-foreground">
                {b.eventDate &&
                  new Date(b.eventDate).toLocaleDateString("ro-MD")}
                {b.startTime && b.endTime && (
                  <span className="text-gold">
                    {" · "}
                    <Clock className="inline h-3 w-3" /> {b.startTime}–
                    {b.endTime}
                  </span>
                )}
                {b.eventType &&
                  ` · ${EVENT_TYPE_LABELS[b.eventType] || b.eventType}`}
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className={cn("text-xs shrink-0", cfg.color)}
          >
            {cfg.label}
          </Badge>
        </div>

        {/* Pending → live countdown to the 24h auto-expire deadline. */}
        {isPending && (
          <div className="mt-3 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-xs text-warning">
            <PendingCountdown createdAt={b.createdAt ?? null} />
          </div>
        )}

        {/* Price pill — show original or last offer */}
        {(() => {
          const offers = b.priceOffers ?? [];
          const lastOffer = offers.length > 0 ? offers[offers.length - 1] : null;
          const displayPrice = lastOffer?.amount ?? b.agreedPrice;
          if (displayPrice == null) return null;
          return (
            <div className="mt-3 flex items-center justify-between rounded-lg bg-gold/5 border border-gold/20 px-3 py-2">
              <span className="text-xs text-muted-foreground">
                {lastOffer
                  ? lastOffer.from === "artist"
                    ? "Ofertă partener"
                    : "Ofertă ta"
                  : "Preț agreat"}
              </span>
              <span className="text-sm font-semibold text-gold">
                {displayPrice}€
              </span>
            </div>
          );
        })()}

        {/* Price negotiation history — show all offers when there's been negotiation */}
        {(b.priceOffers ?? []).length > 0 && (
          <div className="mt-3 rounded-lg border border-gold/20 bg-gold/5 p-3 space-y-1.5">
            <p className="text-[11px] font-semibold text-gold uppercase tracking-wide">
              Istoric negociere
            </p>
            {(b.priceOffers ?? []).map((offer, idx) => (
              <div
                key={idx}
                className={cn(
                  "rounded-md px-2 py-1.5 text-xs flex items-start justify-between gap-2",
                  offer.from === "client"
                    ? "ml-4 bg-blue-500/10 border border-blue-500/20"
                    : "mr-4 bg-gold/10 border border-gold/20",
                )}
              >
                <div className="min-w-0 flex-1">
                  <span className={cn("font-semibold", offer.from === "client" ? "text-blue-400" : "text-gold")}>
                    {offer.from === "client" ? "Tu" : "Partenerul"}:
                  </span>{" "}
                  <span className="font-bold">{offer.amount}€</span>
                  {offer.message && (
                    <p className="mt-0.5 text-muted-foreground italic">&ldquo;{offer.message}&rdquo;</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Negotiation panel — surfaced when the artist
            sent a counter-offer the client hasn't replied to yet. */}
        {(() => {
          const offers = b.priceOffers ?? [];
          const last = offers.length > 0 ? offers[offers.length - 1] : null;
          const artistHasOpenOffer =
            last !== null &&
            last.from === "artist" &&
            b.status === "pending";
          if (!artistHasOpenOffer) return null;
          return (
            <div className="mt-3 border-t border-border/20 pt-3">
              <PriceNegotiationPanel
                booking={{
                  id: b.id,
                  status: b.status as
                    | "pending"
                    | "accepted"
                    | "confirmed_by_client"
                    | "rejected"
                    | "cancelled"
                    | "completed",
                  agreedPrice: b.agreedPrice ?? null,
                  priceOffers: b.priceOffers ?? null,
                }}
                perspective="client"
                onUpdate={onRefresh}
              />
            </div>
          );
        })()}
      </CardContent>
    </Card>
  );
}

/**
 * Live countdown shown under a pending booking. Re-computes the
 * remaining window every 60s so the host always sees a current
 * estimate of how long the artist still has to respond before the
 * Inngest cron auto-expires the request.
 */
function PendingCountdown({ createdAt }: { createdAt: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!createdAt) {
    return (
      <span>
        Partenerul are 24h să răspundă, altfel cererea se anulează automat.
      </span>
    );
  }
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) {
    return (
      <span>
        Partenerul are 24h să răspundă, altfel cererea se anulează automat.
      </span>
    );
  }
  const deadline = created + 24 * 60 * 60 * 1000;
  const remainingMs = deadline - now;
  if (remainingMs <= 0) {
    return (
      <span>
        Cererea va fi anulată în curând (24h depășite). Revino în câteva
        minute.
      </span>
    );
  }
  const totalMin = Math.floor(remainingMs / 60_000);
  const hours = Math.floor(totalMin / 60);
  const minutes = totalMin % 60;
  return (
    <div className="flex flex-col gap-1">
      <span>
        Partenerul are 24h să răspundă, altfel cererea se anulează automat.
      </span>
      <span className="font-mono text-xs text-warning">
        ⏳ Cererea va fi anulată în {hours}h {String(minutes).padStart(2, "0")}m
      </span>
    </div>
  );
}

// Artist card rendered inside the planner dashboard. Richer than the old
// mini card: cover image + profile link + price + real hourly availability
// slots for the plan's event date + inline "Solicită rezervare" modal.
function PlanArtistCard({
  artist,
  plan,
  existingBooking,
  previouslyDeclined = false,
  categoryLimitReached,
  blockedByOtherArtistName = null,
  clientName,
  clientPhone,
  clientEmail,
  viewMode = "grid",
  onRefresh,
}: {
  artist: DiscoveryArtist;
  plan: Plan;
  existingBooking?: BookingRequest;
  /** True when the artist already declined / cancelled / expired a
   *  request from this client on this plan. Hides the rebooking CTA. */
  previouslyDeclined?: boolean;
  categoryLimitReached: boolean;
  /** Set when another artist in the same category already has an active
   *  request. Used to disable this card's CTA + show the "Așteaptă
   *  răspunsul lui {name}" hint. */
  blockedByOtherArtistName?: string | null;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  viewMode?: ViewMode;
  onRefresh: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  // Separate start/end time input — can be filled manually or by clicking
  // one of the artist's declared slots as a preset.
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);

  // Artist pricing tiers (durata + preț + scope). Loaded on demand when the
  // booking modal opens. The client picks a DURATION (e.g. "1h 30m"); the
  // resolver then picks the applicable price for the event date + start time
  // (base / weekend / evening / specific-day override).
  const [packages, setPackages] = useState<PricingTier[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [selectedDurationMinutes, setSelectedDurationMinutes] = useState<
    number | null
  >(null);
  // Working hours window for the event date (Mon=0..Sun=6).
  // null = explicit day off; undefined = no schedule restriction; object = window.
  const [artistWorkingHours, setArtistWorkingHours] = useState<
    { start: string; end: string } | null | undefined
  >(undefined);
  const [bookedRanges, setBookedRanges] = useState<
    Array<{ startTime: string; endTime: string }>
  >([]);
  const [wholeDayBlocked, setWholeDayBlocked] = useState(false);

  // When the booking modal opens for the first time, pre-fill start
  // from the plan's wizard answers so the client doesn't retype the obvious.
  useEffect(() => {
    if (!modalOpen) return;
    if (startTime) return;
    if (plan.startTime) {
      const [h, m] = plan.startTime.split(":").map(Number);
      if (!Number.isNaN(h)) {
        const hh = String(h).padStart(2, "0");
        const mm = String(m || 0).padStart(2, "0");
        setStartTime(`${hh}:${mm}`);
      }
    }
  }, [modalOpen, plan.startTime, startTime]);

  // Fetch artist availability (booked ranges + working hours) for the
  // event date when the booking modal opens. Lets the TimePicker hide
  // out-of-hours slots and intervals already taken.
  useEffect(() => {
    if (!modalOpen || !plan.eventDate) {
      setArtistWorkingHours(undefined);
      setBookedRanges([]);
      setWholeDayBlocked(false);
      return;
    }
    let cancelled = false;
    fetch(
      `/api/artist-availability?artist_id=${artist.id}&date=${plan.eventDate}`,
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return;
        setArtistWorkingHours(d.workingHours);
        setBookedRanges(d.bookedRanges || []);
        setWholeDayBlocked(!!d.wholeDayBlocked);
      })
      .catch(() => {
        /* silent */
      });
    return () => {
      cancelled = true;
    };
  }, [modalOpen, plan.eventDate, artist.id]);

  // Load artist's pricing tiers when modal opens. Each tier is a (duration,
  // price, scope) row. We keep all scope variants so the resolver can pick
  // the right one when the client is on a weekend/evening/specific day.
  useEffect(() => {
    if (!modalOpen) return;
    if (packages.length > 0) return;
    let cancelled = false;
    setPackagesLoading(true);
    fetch(`/api/artist-packages?artist_id=${artist.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: PricingTier[]) => {
        if (cancelled) return;
        const valid = (Array.isArray(data) ? data : []).filter(
          (p) => p.price != null && tierDurationMinutes(p) != null,
        );
        setPackages(valid);
      })
      .catch(() => {
        if (!cancelled) setPackages([]);
      })
      .finally(() => {
        if (!cancelled) setPackagesLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, artist.id]);

  // When a duration is selected, recompute endTime from startTime + duration.
  useEffect(() => {
    if (selectedDurationMinutes == null) return;
    if (!startTime) return;
    const [h, m] = startTime.split(":").map(Number);
    if (Number.isNaN(h)) return;
    const totalMinutes = h * 60 + (m || 0) + selectedDurationMinutes;
    const endH = Math.floor(totalMinutes / 60) % 24;
    const endM = Math.round(totalMinutes % 60);
    setEndTime(
      `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`,
    );
  }, [selectedDurationMinutes, startTime]);

  // Chat modal state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatSending, setChatSending] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [chatMessages, setChatMessages] = useState<Array<{
    id: number;
    senderType: string;
    senderName: string;
    message: string;
  }>>([]);
  const [chatDraft, setChatDraft] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  const cover = artist.coverImageUrl || artist.coverUrl || null;
  const slots = artist.availabilitySlots ?? [];

  // Determine status-driven UI state. The artist's `accept` is now the
  // final step — no separate client-confirm action — so we treat both
  // `accepted` (legacy) and `confirmed_by_client` as fully booked.
  const status = existingBooking?.status;
  const isPending = status === "pending";
  const isConfirmed =
    status === "accepted" ||
    status === "confirmed_by_client" ||
    status === "completed";
  const alreadyBooked = isPending || isConfirmed;

  const disabled =
    alreadyBooked ||
    categoryLimitReached ||
    previouslyDeclined ||
    !!blockedByOtherArtistName;
  const primaryLabel = isConfirmed
    ? "Rezervat"
    : isPending
      ? "Cerere trimisă"
      : previouslyDeclined
        ? "Refuzat anterior"
        : blockedByOtherArtistName
          ? "Categorie ocupată"
          : "Solicită rezervare";
  // Hover hint for the disabled CTA — surfaces *why* the button is off.
  const disabledHint = blockedByOtherArtistName
    ? `Așteaptă răspunsul lui ${blockedByOtherArtistName} (până la 24h)`
    : previouslyDeclined
      ? "Acest artist a refuzat cererea ta"
      : isPending
        ? "Cerere deja trimisă acestui artist"
        : isConfirmed
          ? "Rezervare confirmată"
          : null;

  function pickSlot(slot: { id: number; startTime: string; endTime: string }) {
    if (selectedSlotId === slot.id) {
      // Toggle off
      setSelectedSlotId(null);
      setStartTime("");
      setEndTime("");
      return;
    }
    setSelectedSlotId(slot.id);
    setStartTime(slot.startTime);
    setEndTime(slot.endTime);
    setSelectedDurationMinutes(null);
  }

  function timesValid() {
    if (!startTime || !endTime) return false;
    // endTime < startTime is allowed when the event crosses midnight
    // (e.g., 22:00 → 02:00). We only reject equal times as invalid.
    return startTime !== endTime;
  }

  // Group available tiers by duration — the client picks a duration, the
  // resolver picks the right (base/weekend/evening/…) price for it.
  const durationOptions = (() => {
    const map = new Map<number, PricingTier[]>();
    for (const p of packages) {
      const d = tierDurationMinutes(p);
      if (d == null) continue;
      const arr = map.get(d) ?? [];
      arr.push(p);
      map.set(d, arr);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([durationMinutes, tiers]) => ({ durationMinutes, tiers }));
  })();

  const resolvedForSelection =
    selectedDurationMinutes != null
      ? resolvePriceForDuration(
          packages,
          selectedDurationMinutes,
          {
            eventDate: plan.eventDate,
            startTime: startTime || null,
          },
        )
      : null;

  const slotForSelection = slots.find((s) => s.id === selectedSlotId);
  const computedPrice =
    resolvedForSelection?.price ?? slotForSelection?.price ?? null;

  const canSubmit =
    (selectedDurationMinutes != null && !!startTime) ||
    (timesValid() && packages.length === 0);

  async function submit() {
    if (submitting) return;
    if (!canSubmit) {
      if (packages.length > 0 && selectedDurationMinutes == null) {
        toast.error("Alege durata de participare a artistului.");
      } else {
        toast.error("Alege ora de început și durata.");
      }
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/booking-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artistId: artist.id,
          clientName: clientName || "Client",
          clientPhone: clientPhone || "000000",
          clientEmail: clientEmail,
          eventDate: plan.eventDate,
          eventType: plan.eventType ?? undefined,
          guestCount: plan.guestCountTarget ?? undefined,
          startTime,
          endTime,
          agreedPrice: computedPrice ?? undefined,
          packageId: resolvedForSelection?.tier.id ?? undefined,
          durationHours:
            selectedDurationMinutes != null
              ? selectedDurationMinutes / 60
              : undefined,
          message: message.trim() || undefined,
          eventPlanId: plan.id,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Eroare la trimitere");
      }
      const summary =
        selectedDurationMinutes != null && computedPrice != null
          ? `${formatDuration(selectedDurationMinutes)} · ${computedPrice}€`
          : `${startTime}–${endTime}`;
      toast.success(`Cerere trimisă către ${artist.nameRo} (${summary})`);
      setModalOpen(false);
      setMessage("");
      setSelectedSlotId(null);
      setSelectedDurationMinutes(null);
      setStartTime("");
      setEndTime("");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eroare la trimitere");
    } finally {
      setSubmitting(false);
    }
  }


  async function openChat() {
    setChatOpen(true);
    if (conversationId) return;
    setChatLoading(true);
    try {
      const conv = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artistId: artist.id }),
      }).then((r) => (r.ok ? r.json() : null));
      if (!conv?.id) throw new Error("failed");
      setConversationId(conv.id);
      const msgs = await fetch(`/api/conversations/${conv.id}/messages`).then(
        (r) => (r.ok ? r.json() : []),
      );
      setChatMessages(Array.isArray(msgs) ? msgs : []);
    } catch {
      toast.error("Nu am putut deschide chatul.");
    } finally {
      setChatLoading(false);
    }
  }

  async function sendChatMessage() {
    const text = chatDraft.trim();
    if (!text || !conversationId || chatSending) return;
    setChatSending(true);
    try {
      const res = await fetch(
        `/api/conversations/${conversationId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        },
      );
      if (!res.ok) throw new Error();
      const inserted = await res.json();
      setChatMessages((prev) => [...prev, inserted]);
      setChatDraft("");
    } catch {
      toast.error("Mesajul nu a fost trimis.");
    } finally {
      setChatSending(false);
    }
  }

  const modal =
    modalOpen && mounted
      ? createPortal(
          <div
            // Overscroll-contain prevents iOS Safari's bounce from leaking to
            // the underlying page; fixed + inset-0 keeps the backdrop locked
            // to the visual viewport regardless of browser chrome changes.
            className="fixed inset-0 z-[9999] overflow-hidden overscroll-contain bg-black/60"
            onClick={() => !submitting && setModalOpen(false)}
          >
            <div className="flex h-full w-full items-start justify-center sm:items-center sm:p-4">
              <div
                // `min-h-0` on a flex COLUMN is the critical piece — without
                // it, children with `overflow-y-auto` get auto min-height and
                // never actually scroll, they just grow the parent. With it,
                // the header + footer keep their size and the middle pane is
                // the only scrollable region.
                className="flex h-full min-h-0 w-full max-w-md flex-col border border-border/40 bg-card shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <header className="flex shrink-0 items-center justify-between border-b border-border/40 px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Solicită rezervare
                    </p>
                    <p className="truncate font-heading text-lg font-bold">
                      {artist.nameRo}
                    </p>
                  </div>
                  <button
                    onClick={() => !submitting && setModalOpen(false)}
                    className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-accent"
                    aria-label="Închide"
                    disabled={submitting}
                  >
                    <X className="h-5 w-5" />
                  </button>
                </header>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
                <div className="space-y-1 rounded-lg border border-border/40 bg-muted/30 p-3 text-sm">
                  <p className="text-xs font-semibold text-muted-foreground">
                    Eveniment
                  </p>
                  {plan.eventDate && (
                    <p>
                      <span className="text-muted-foreground">Data:</span>{" "}
                      {new Date(plan.eventDate + "T00:00:00").toLocaleDateString(
                        "ro-RO",
                        { day: "numeric", month: "long", year: "numeric" },
                      )}
                    </p>
                  )}
                  {plan.startTime && plan.durationHours ? (
                    <p>
                      <span className="text-muted-foreground">Durata eveniment:</span>{" "}
                      {plan.startTime} – {(() => {
                        const [h, m] = plan.startTime.split(":").map(Number);
                        const endH = (h + plan.durationHours) % 24;
                        return `${String(endH).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                      })()} ({plan.durationHours}h)
                    </p>
                  ) : null}
                  {plan.guestCountTarget ? (
                    <p>
                      <span className="text-muted-foreground">Invitați:</span>{" "}
                      {plan.guestCountTarget}
                    </p>
                  ) : null}
                </div>

                {slots.length > 0 && (
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Intervale oferite de artist (apasă pentru a prelua)
                    </Label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {slots.map((s) => {
                        const selected = selectedSlotId === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => pickSlot(s)}
                            className={cn(
                              "rounded-lg border px-3 py-1.5 text-xs transition-all",
                              selected
                                ? "border-gold bg-gold/10 text-gold font-medium"
                                : "border-border/40 hover:border-gold/30",
                            )}
                          >
                            {s.startTime}–{s.endTime}
                            {s.price != null && (
                              <span className="ml-1 text-gold/80">
                                · {s.price}€
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Start time picker */}
                <div>
                  <Label>Ora de început *</Label>
                  <p className="mb-2 text-xs text-muted-foreground">
                    La ce oră dorești să înceapă artistul?
                  </p>
                  <TimePicker
                    value={startTime}
                    disabled={submitting}
                    onChange={(v) => {
                      setStartTime(v);
                      setSelectedSlotId(null);
                    }}
                    workingHours={artistWorkingHours}
                    bookedRanges={bookedRanges}
                    wholeDayBlocked={wholeDayBlocked}
                  />
                  {artistWorkingHours === null && (
                    <p className="mt-1 text-[11px] text-destructive">
                      Această zi nu este zi de lucru pentru artist.
                    </p>
                  )}
                </div>

                {/* Duration picker — the resolver picks the right price */}
                <div>
                  <Label>Durata de participare *</Label>
                  <p className="mb-2 text-xs text-muted-foreground">
                    {durationOptions.length > 0
                      ? "Alege durata. Prețul se calculează în funcție de dată și oră."
                      : "Artistul nu a definit tarife. Alege manual ora de sfârșit."}
                  </p>
                  {packagesLoading ? (
                    <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Se încarcă pachetele…
                    </div>
                  ) : durationOptions.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {durationOptions.map(({ durationMinutes, tiers }) => {
                        const selected =
                          selectedDurationMinutes === durationMinutes;
                        // If this duration would push end time past the
                        // artist's closing hour, disable it so the user
                        // can't pick an out-of-hours slot.
                        let exceedsWorkingHours = false;
                        if (artistWorkingHours && startTime) {
                          const [sh, sm] = startTime.split(":").map(Number);
                          const startMin = sh * 60 + (sm || 0);
                          const endTotal = startMin + durationMinutes;
                          const [weH, weM] = artistWorkingHours.end
                            .split(":")
                            .map(Number);
                          const closeMin =
                            (weH === 0 ? 24 : weH) * 60 + (weM || 0);
                          if (endTotal > closeMin) exceedsWorkingHours = true;
                        }
                        // Preview the price for this duration at the current
                        // date/time so the client sees how overrides kick in.
                        const preview = resolvePriceForDuration(
                          tiers,
                          durationMinutes,
                          {
                            eventDate: plan.eventDate,
                            startTime: startTime || null,
                          },
                        );
                        // Surface whether a weekend/evening/specific-day
                        // override applies so the client understands the
                        // price jump.
                        const overrideLabel =
                          preview && preview.tier.scope !== "base"
                            ? preview.tier.scope === "weekend"
                              ? "weekend"
                              : preview.tier.scope === "weekday"
                                ? "zi lucr."
                                : preview.tier.scope === "evening"
                                  ? "seara"
                                  : preview.tier.scope === "specific_day"
                                    ? "zi specială"
                                    : ""
                            : "";
                        return (
                          <button
                            key={durationMinutes}
                            type="button"
                            disabled={submitting || exceedsWorkingHours}
                            title={
                              exceedsWorkingHours
                                ? `Depășește orele de lucru ale artistului (până la ${artistWorkingHours?.end})`
                                : undefined
                            }
                            onClick={() => {
                              if (exceedsWorkingHours) return;
                              setSelectedDurationMinutes(
                                selected ? null : durationMinutes,
                              );
                              setSelectedSlotId(null);
                            }}
                            className={cn(
                              "flex flex-col gap-0.5 rounded-lg border p-3 text-left transition-all",
                              selected
                                ? "border-gold bg-gold/10 shadow-[0_0_0_1px_rgba(201,168,76,0.4)]"
                                : exceedsWorkingHours
                                  ? "border-border/20 opacity-40 cursor-not-allowed"
                                  : "border-border/40 hover:border-gold/40",
                            )}
                          >
                            <div className="flex items-baseline justify-between gap-2">
                              <span
                                className={cn(
                                  "font-heading text-base font-bold",
                                  selected ? "text-gold" : "text-foreground",
                                )}
                              >
                                {formatDuration(durationMinutes)}
                              </span>
                              {preview ? (
                                <span
                                  className={cn(
                                    "text-sm font-bold",
                                    selected
                                      ? "text-gold"
                                      : "text-muted-foreground",
                                  )}
                                >
                                  {preview.price}€
                                </span>
                              ) : (
                                <span className="text-[10px] uppercase text-muted-foreground">
                                  preț la cerere
                                </span>
                              )}
                            </div>
                            {overrideLabel && (
                              <span className="text-[10px] uppercase tracking-wide text-purple-400">
                                Tarif {overrideLabel}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <TimePicker
                      value={endTime}
                      disabled={submitting}
                      onChange={(v) => {
                        setEndTime(v);
                        setSelectedSlotId(null);
                      }}
                      placeholder="Ora de sfârșit"
                    />
                  )}
                </div>

                {/* Reservation summary */}
                {startTime && endTime && (
                  <div
                    className={cn(
                      "rounded-lg border px-3 py-2.5 text-sm",
                      canSubmit
                        ? "border-gold/30 bg-gold/5 text-foreground"
                        : "border-destructive/30 bg-destructive/5 text-destructive",
                    )}
                  >
                    {canSubmit ? (
                      <div className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-gold" />
                          <span>
                            <strong>{startTime}</strong>
                            {" – "}
                            <strong>{endTime}</strong>
                            {selectedDurationMinutes != null && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                ({formatDuration(selectedDurationMinutes)})
                              </span>
                            )}
                          </span>
                        </span>
                        {computedPrice != null && (
                          <span className="font-heading text-base font-bold text-gold">
                            {computedPrice}€
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs">
                        Ora de început și durata trebuie să fie setate.
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <Label htmlFor={`msg-${artist.id}`}>Mesaj (opțional)</Label>
                  <Textarea
                    id={`msg-${artist.id}`}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    placeholder="Alte detalii despre eveniment..."
                    className="mt-1"
                    disabled={submitting}
                  />
                </div>
              </div>

                <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border/40 bg-card px-5 py-3">
                  <Link
                    href={`/artisti/${artist.slug}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gold"
                  >
                    Vezi profil <ExternalLink className="h-3 w-3" />
                  </Link>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setModalOpen(false)}
                      disabled={submitting}
                    >
                      Anulează
                    </Button>
                    <Button
                      size="sm"
                      onClick={submit}
                      disabled={submitting || !canSubmit}
                      className="gap-2 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
                    >
                      {submitting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      Trimite cerere
                    </Button>
                  </div>
                </footer>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  // Chat modal — available regardless of booking status so clients can
  // start a conversation before requesting a booking, negotiate during
  // review, or follow up afterwards.
  const chatModal =
    chatOpen && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end justify-end bg-black/50 p-0 sm:p-6"
            onClick={() => !chatSending && setChatOpen(false)}
          >
            <div
              className="flex h-[100dvh] w-full flex-col overflow-hidden border border-border/40 bg-card shadow-2xl sm:h-[600px] sm:max-h-[80vh] sm:w-[420px] sm:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="flex items-center justify-between border-b border-border/40 bg-background/60 px-4 py-3">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Chat direct
                  </p>
                  <p className="font-heading text-sm font-bold">
                    {artist.nameRo}
                  </p>
                </div>
                <button
                  onClick={() => setChatOpen(false)}
                  className="rounded-full p-1.5 text-muted-foreground hover:bg-accent"
                  aria-label="Închide chat"
                >
                  <X className="h-4 w-4" />
                </button>
              </header>
              <div className="flex-1 space-y-2 overflow-y-auto bg-background/30 p-4">
                {chatLoading ? (
                  <div className="flex h-full items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-gold" />
                  </div>
                ) : chatMessages.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    Scrie primul mesaj — artistul va primi notificare.
                  </p>
                ) : (
                  chatMessages.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        "flex flex-col gap-0.5 rounded-2xl px-3 py-2 text-sm",
                        m.senderType === "client"
                          ? "ml-8 bg-gold text-[#0D0D0D]"
                          : "mr-8 bg-accent/60 text-foreground",
                      )}
                    >
                      <span className="text-[10px] font-semibold opacity-70">
                        {m.senderName}
                      </span>
                      <span className="whitespace-pre-wrap break-words">
                        {m.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div className="flex items-center gap-2 border-t border-border/40 bg-background/60 p-3">
                <input
                  type="text"
                  value={chatDraft}
                  onChange={(e) => setChatDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendChatMessage();
                    }
                  }}
                  placeholder="Scrie un mesaj..."
                  className="flex-1 rounded-full border border-border/40 bg-background px-4 py-2 text-sm focus:border-gold/50 focus:outline-none"
                  disabled={!conversationId || chatSending}
                />
                <Button
                  type="button"
                  size="icon"
                  aria-label="Trimite mesaj"
                  onClick={sendChatMessage}
                  disabled={!chatDraft.trim() || !conversationId || chatSending}
                  className="shrink-0 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
                >
                  {chatSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div
        className={cn(
          "@container/card group overflow-hidden rounded-xl border border-border/40 bg-card transition-all hover:border-gold/40",
          viewMode === "list"
            ? "flex flex-col sm:flex-row"
            : "flex flex-col",
        )}
      >
        <Link
          href={`/artisti/${artist.slug}`}
          target="_blank"
          className={cn(
            "relative overflow-hidden bg-muted",
            viewMode === "list"
              ? "aspect-[4/3] sm:aspect-auto sm:h-36 sm:w-52 sm:shrink-0 sm:self-start sm:m-3 sm:rounded-lg"
              : "aspect-[4/3]",
          )}
        >
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={cover}
              alt={artist.nameRo}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <BookOpen className="h-10 w-10 text-gold/30" />
            </div>
          )}
        </Link>

        <div className="flex flex-1 flex-col p-4">
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/artisti/${artist.slug}`}
              target="_blank"
              className="font-heading text-base font-bold line-clamp-1 hover:text-gold"
            >
              {artist.nameRo}
            </Link>
            {(() => {
              // Decide between "de la X€" (multiple tiers or a ranged floor)
              // and "X€" (single package price). Fall back to priceFrom.
              const count = artist.packageCount ?? 0;
              const min = artist.packageMinPrice ?? artist.priceFrom ?? null;
              const max = artist.packageMaxPrice ?? null;
              if (min == null || min <= 0) return null;
              const multiple = count > 1 || (max != null && max > min);
              return (
                <span className="shrink-0 text-sm font-semibold text-gold">
                  {multiple ? `de la ${min}€` : `${min}€`}
                </span>
              );
            })()}
          </div>

          {artist.ratingCount > 0 && (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Star className="h-3 w-3 fill-gold text-gold" />
              {artist.ratingAvg.toFixed(1)} ({artist.ratingCount})
            </p>
          )}

          {/* Available time slots for the event date */}
          <div className="mt-3">
            <p className="text-xs font-semibold text-muted-foreground">
              Disponibil pe {plan.eventDate ? new Date(plan.eventDate + "T00:00:00").toLocaleDateString("ro-MD", { day: "numeric", month: "short" }) : "data evenimentului"}:
            </p>
            {slots.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Toată ziua (nu are intervale definite)
              </p>
            ) : (
              <div className="mt-1 flex flex-wrap gap-1">
                {slots.slice(0, 4).map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-background px-1.5 py-0.5 text-[11px]"
                  >
                    <Clock className="h-2.5 w-2.5 text-gold" />
                    {s.startTime}–{s.endTime}
                  </span>
                ))}
                {slots.length > 4 && (
                  <span className="text-[11px] text-muted-foreground">
                    +{slots.length - 4}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Status banner (only when there's an active booking) */}
          {existingBooking && (
            <div
              className={cn(
                "mt-3 rounded-lg border px-3 py-2 text-xs",
                isConfirmed
                  ? "border-success/30 bg-success/5 text-success"
                  : "border-info/30 bg-info/5 text-info",
              )}
            >
              {isConfirmed && (
                <span>
                  ✓ Rezervat {existingBooking.startTime && existingBooking.endTime ? `${existingBooking.startTime}–${existingBooking.endTime}` : ""}
                  {existingBooking.agreedPrice ? ` · ${existingBooking.agreedPrice}€` : ""}
                </span>
              )}
              {isPending && (
                <PendingCountdown
                  createdAt={existingBooking.createdAt ?? null}
                />
              )}
            </div>
          )}

          {/* Primary action — depends on status */}
          <div
            className={cn(
              "mt-3 flex flex-col gap-2 @[280px]/card:flex-row",
              viewMode === "list" && "sm:max-w-md",
            )}
          >
            <Button
              onClick={() => setModalOpen(true)}
              disabled={disabled}
              size="sm"
              title={disabledHint ?? undefined}
              className="w-full min-w-0 flex-1 gap-1.5 bg-gold text-[#0D0D0D] hover:bg-gold-dark disabled:opacity-60"
            >
              {isConfirmed ? (
                <Check className="h-3.5 w-3.5 shrink-0" />
              ) : isPending ? (
                <Clock className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <Send className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="truncate">{primaryLabel}</span>
            </Button>
            {/* (legacy) The standalone "Confirmă rezervarea" CTA was
                removed — accept now finalizes the booking server-side. */}
            {/* Chat button — icon only on narrow cards, icon+text on wider */}
            <Button
              variant="outline"
              size="sm"
              onClick={openChat}
              className="w-full gap-1.5 border-gold/40 text-gold hover:bg-gold/10 @[280px]/card:w-auto @[280px]/card:shrink-0"
              title="Trimite mesaj artistului"
            >
              <MessageCircle className="h-3.5 w-3.5 shrink-0" />
              <span className="@[320px]/card:inline @[280px]/card:hidden">
                Mesaj
              </span>
            </Button>
          </div>
        </div>
      </div>
      {modal}
      {chatModal}
    </>
  );
}

// ─── Săli Tab (conditional on plan.venueNeeded) ─────────────────────
// Mirrors the artist discovery flow but for venues. Venue bookings live
// in a separate table (`venue_booking_requests`) and never feed the
// budget (per spec).

interface DiscoveryVenue {
  id: number;
  slug: string;
  nameRo: string;
  city: string | null;
  capacityMin: number | null;
  capacityMax: number | null;
  pricePerPerson: number | null;
  coverUrl?: string | null;
  ratingAvg: number;
  ratingCount: number;
}

function VenuesTab({ plan }: { plan: Plan }) {
  const [venues, setVenues] = useState<DiscoveryVenue[]>([]);
  const [loading, setLoading] = useState(true);
  const [radius, setRadius] = useState<number>(plan.venueRadiusKm ?? 25);

  // Expand the selected city into all towns within `radius` km using the
  // hardcoded Moldovan city-proximity table. 999 = no filter (all cities).
  const expandedCities = useMemo(() => {
    if (!plan.location) return [] as string[];
    if (radius >= 999) return [] as string[]; // no city filter at all
    return citiesWithinRadius(plan.location, radius);
  }, [plan.location, radius]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (plan.eventDate) params.set("date", plan.eventDate);
    if (expandedCities.length > 0) {
      params.set("cities", expandedCities.join(","));
    } else if (plan.location && radius < 999) {
      params.set("city", plan.location);
    }
    if (plan.guestCountTarget) params.set("capacity_min", String(plan.guestCountTarget));
    params.set("limit", "24");
    fetch(`/api/venues?${params.toString()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { venues: [] }))
      .then((data) => setVenues(data.items ?? data.venues ?? data ?? []))
      .catch(() => setVenues([]))
      .finally(() => setLoading(false));
  }, [plan.eventDate, plan.location, plan.guestCountTarget, expandedCities, radius]);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-heading text-xl font-bold">Săli pentru evenimentul tău</h2>
        <p className="text-sm text-muted-foreground">
          {plan.eventDate && (
            <>
              {new Date(plan.eventDate).toLocaleDateString("ro-MD", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </>
          )}
          {plan.location && <> · {plan.location}</>}
          {radius > 0 && radius < 999 && <> · rază {radius} km</>}
          {radius >= 999 && <> · toată Moldova</>}
          {plan.guestCountTarget && <> · min. {plan.guestCountTarget} invitați</>}
        </p>
        <p className="mt-2 text-xs text-muted-foreground/80">
          Rezervările de săli nu sunt incluse în buget — bugetul e format doar din artiști.
        </p>

        {/* Radius override — so the user can tweak after the wizard. */}
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { value: 0, label: "Doar în oraș" },
            { value: 25, label: "25 km" },
            { value: 50, label: "50 km" },
            { value: 100, label: "100 km" },
            { value: 999, label: "Toată Moldova" },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRadius(opt.value)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs transition-all",
                radius === opt.value
                  ? "border-gold bg-gold/10 text-gold font-medium"
                  : "border-border/40 hover:border-gold/30",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {expandedCities.length > 1 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Orașe incluse: {expandedCities.join(", ")}
          </p>
        )}
      </section>

      {loading ? (
        <div className="py-10 text-center">
          <Loader2 className="mx-auto h-6 w-6 animate-spin text-gold" />
        </div>
      ) : venues.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/40 py-10 text-center text-muted-foreground">
          <MapPin className="mx-auto mb-3 h-8 w-8 opacity-40" />
          <p className="text-sm">Nicio sală disponibilă cu aceste criterii.</p>
          <Link href="/sali">
            <Button variant="outline" size="sm" className="mt-4">
              Explorează toate sălile
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {venues.map((v) => (
            <VenueDiscoveryCard key={v.id} venue={v} plan={plan} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Settings Tab ───────────────────────────────────────────────────

function SettingsTab({
  plan,
  onUpdate,
  onDelete,
}: {
  plan: Plan;
  onUpdate: (p: Plan) => void;
  onDelete: () => void;
}) {
  const [title, setTitle] = useState(plan.title);
  const [eventType, setEventType] = useState(plan.eventType || "wedding");
  const [eventDate, setEventDate] = useState(plan.eventDate || "");
  const [location, setLocation] = useState(plan.location || "");
  const [guestCount, setGuestCount] = useState(plan.guestCountTarget?.toString() || "");
  const [budget, setBudget] = useState(plan.budgetTarget?.toString() || "");
  const [notes, setNotes] = useState(plan.notes || "");
  const [venueNeeded, setVenueNeeded] = useState(plan.venueNeeded ?? false);
  const [checklistEnabled, setChecklistEnabled] = useState(
    plan.checklistEnabled ?? false,
  );
  const [guestsEnabled, setGuestsEnabled] = useState(
    plan.guestsEnabled ?? false,
  );
  const [seatingEnabled, setSeatingEnabled] = useState(
    plan.seatingEnabled ?? false,
  );
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>(
    plan.selectedCategories ?? [],
  );
  const [allCategories, setAllCategories] = useState<
    Array<{ id: number; nameRo: string; type: string }>
  >([]);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const router = useRouter();

  // Load the full category list so the user can toggle on the categories
  // the wizard missed (e.g. Show Program, Echipament Tehnic — the wizard
  // used to send slugs that didn't match the DB, so plans created before
  // the fix ended up with only a subset of what the user actually chose).
  useEffect(() => {
    fetch("/api/categories", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        const list = Array.isArray(data) ? data : data.items ?? [];
        setAllCategories(
          list.filter((c: { type: string }) => c.type === "artist" || c.type === "service"),
        );
      })
      .catch(() => setAllCategories([]));
  }, []);

  function toggleCategory(id: number) {
    setSelectedCategoryIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/event-plans/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          eventType: eventType || null,
          eventDate: eventDate || null,
          location: location || null,
          guestCountTarget: guestCount ? Number(guestCount) : null,
          notes: notes || null,
          venueNeeded,
          checklistEnabled,
          guestsEnabled,
          // Seating requires guests — server enforces too, but we
          // mirror it here so the UI doesn't lie about what's saved.
          seatingEnabled: seatingEnabled && guestsEnabled,
          selectedCategories: selectedCategoryIds,
        }),
      });
      if (!res.ok) {
        toast.error("Eroare la salvare.");
        return;
      }
      const data = await res.json();
      onUpdate(data.plan);
      toast.success("Setări salvate!");
    } catch {
      toast.error("Eroare la salvare.");
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive() {
    if (!confirm("Marchezi evenimentul ca finalizat? Va apărea în secțiunea Arhivă.")) return;
    setArchiving(true);
    try {
      const res = await fetch(`/api/event-plans/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (!res.ok) {
        toast.error("Eroare la arhivare.");
        return;
      }
      toast.success("Eveniment finalizat.");
      router.push("/cabinet/arhiva");
    } finally {
      setArchiving(false);
    }
  }

  return (
    <div className="max-w-lg">
      <h2 className="font-heading text-xl font-bold mb-6">Setări plan</h2>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="s-title">Titlul planului</Label>
          <Input id="s-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Tip eveniment</Label>
            <Select value={eventType} onValueChange={(v) => { if (v) setEventType(v); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {EVENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-date">Data evenimentului</Label>
            <CustomCalendar
              value={eventDate ? new Date(eventDate + "T00:00:00") : null}
              onChange={(d) => {
                const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                setEventDate(iso);
              }}
              placeholder="Alege data"
              className="flex-none"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="s-loc">Locație</Label>
          <Input id="s-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Chișinău" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="s-guests">Invitați estimați</Label>
            <Input id="s-guests" type="number" min="0" value={guestCount} onChange={(e) => setGuestCount(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-budget">Buget (EUR)</Label>
            <Input id="s-budget" type="number" min="0" value={budget} onChange={(e) => setBudget(e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="s-notes">Note</Label>
          <Textarea id="s-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </div>

        {/* Category picker — populated from the live categories list so
            the user can fix a plan that was saved with missing categories
            (happened when the wizard's service→slug map was incomplete). */}
        <div className="space-y-2">
          <Label>Categorii de artiști dorite</Label>
          <p className="text-xs text-muted-foreground">
            Apasă pentru a adăuga sau scoate o categorie. Acestea conduc
            secțiunile din tabul <span className="text-gold">Rezervări Artiști</span>.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {allCategories.length === 0 ? (
              <Loader2 className="h-4 w-4 animate-spin text-gold" />
            ) : (
              allCategories.map((c) => {
                const selected = selectedCategoryIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleCategory(c.id)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-xs transition-all",
                      selected
                        ? "border-gold bg-gold/10 text-gold font-medium"
                        : "border-border/40 text-muted-foreground hover:border-gold/40 hover:text-foreground",
                    )}
                  >
                    {c.nameRo}
                  </button>
                );
              })
            )}
          </div>
          {selectedCategoryIds.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {selectedCategoryIds.length} categorii selectate
            </p>
          )}
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-border/30 bg-card/50 p-3 cursor-pointer hover:border-gold/30 transition-colors">
          <Checkbox
            checked={venueNeeded}
            onCheckedChange={(v) => setVenueNeeded(v === true)}
            className="mt-0.5"
          />
          <div className="flex-1 text-sm">
            <p className="font-medium">Am nevoie de sală / restaurant</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Activează tabul <span className="text-gold">Săli</span> pentru a vedea locații disponibile.
            </p>
          </div>
        </label>

        <div className="space-y-2 pt-2">
          <h3 className="text-sm font-semibold">Funcții opționale</h3>
          <p className="text-xs text-muted-foreground">
            Activează tab-urile pe care vrei să le folosești pentru acest eveniment.
          </p>
        </div>

        <label className="flex items-start gap-3 rounded-lg border border-border/30 bg-card/50 p-3 cursor-pointer hover:border-gold/30 transition-colors">
          <Checkbox
            checked={checklistEnabled}
            onCheckedChange={(v) => setChecklistEnabled(v === true)}
            className="mt-0.5"
          />
          <div className="flex-1 text-sm">
            <p className="font-medium">Checklist</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Lista pașilor de pregătire pentru evenimentul tău.
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 rounded-lg border border-border/30 bg-card/50 p-3 cursor-pointer hover:border-gold/30 transition-colors">
          <Checkbox
            checked={guestsEnabled}
            onCheckedChange={(v) => {
              const on = v === true;
              setGuestsEnabled(on);
              // Seating depends on guests — turning off guests must
              // also turn off seating to keep them in sync.
              if (!on) setSeatingEnabled(false);
            }}
            className="mt-0.5"
          />
          <div className="flex-1 text-sm">
            <p className="font-medium">Listă invitați</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Importă, RSVP, alocare la mese.
            </p>
          </div>
        </label>

        {guestsEnabled && (
          <label className="flex items-start gap-3 rounded-lg border border-border/30 bg-card/50 p-3 cursor-pointer hover:border-gold/30 transition-colors">
            <Checkbox
              checked={seatingEnabled}
              onCheckedChange={(v) => setSeatingEnabled(v === true)}
              className="mt-0.5"
            />
            <div className="flex-1 text-sm">
              <p className="font-medium">Așezare mese</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Disponibil doar când ai listă de invitați activă.
              </p>
            </div>
          </label>
        )}

        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-gold text-[#0D0D0D] hover:bg-gold-dark gap-2"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvează setările
        </Button>

        <div className="pt-6 border-t border-border/20 space-y-3">
          <div>
            <h3 className="text-sm font-semibold mb-2">Finalizare</h3>
            {(() => {
              // Block early finalize — the user used to be able to mark
              // an event "completed" months before it actually happened,
              // which trashed the analytics pipeline (events older than
              // their archive date) and let bookings be confirmed for a
              // "past" event. Compare against eventDate + startTime so
              // the button only unlocks once the event is actually over.
              const eventStart =
                plan.eventDate
                  ? new Date(
                      `${plan.eventDate}T${plan.startTime ?? "23:59"}:00`,
                    )
                  : null;
              const eventOver = eventStart ? eventStart.getTime() < Date.now() : true;
              return (
                <>
                  <Button
                    onClick={handleArchive}
                    disabled={archiving || !eventOver}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    {archiving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    Marchează ca finalizat → Arhivă
                  </Button>
                  {!eventOver && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Disponibil după ce evenimentul are loc.
                    </p>
                  )}
                </>
              );
            })()}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-destructive mb-2">Zona periculoasă</h3>
            <Button
              onClick={onDelete}
              variant="outline"
              size="sm"
              className="gap-1 text-destructive hover:bg-destructive/5 border-destructive/30"
            >
              <Trash2 className="h-4 w-4" /> Șterge planul complet
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Per-event progress card on Overview. Three sub-bars stacked
 * vertically:
 *   1. Parteneri — N segments, one per booking; yellow=pending,
 *      green=confirmed, red=rejected, grey=remaining slot.
 *   2. Invitați — single bar with green=accepted, yellow=pending,
 *      red=declined, grey=unanswered.
 *   3. Checklist — single bar with green=done, grey=remaining.
 * Each bar collapses gracefully when the section is disabled.
 *
 * Below the bars sits the "Mark complete" gate: only available once
 * eventDate has actually passed AND every booking is confirmed +
 * the user has touched checklist/invitați (if enabled).
 */
function EventProgressCard({
  plan,
  bookings,
  guests,
  guestAccepted,
  checklistDone,
  checklistTotal,
  onSwitchTab: _onSwitchTab,
  onPlanUpdate,
}: {
  plan: Plan;
  bookings: BookingRequest[];
  guests: Guest[];
  guestAccepted: number;
  checklistDone: number;
  checklistTotal: number;
  onSwitchTab: (tab: TabKey) => void;
  onPlanUpdate: (p: Plan) => void;
}) {
  void _onSwitchTab;
  const router = useRouter();
  const [archiving, setArchiving] = useState(false);

  // Bookings buckets — fixed colour codes the user can read at a glance.
  const confirmedB = bookings.filter(
    (b) => b.status === "accepted" || b.status === "confirmed_by_client",
  ).length;
  const pendingB = bookings.filter((b) => b.status === "pending").length;
  const rejectedB = bookings.filter(
    (b) => b.status === "rejected" || b.status === "cancelled" || b.status === "expired",
  ).length;
  const totalSlots = Math.max(bookings.length, plan.selectedCategories?.length ?? 0);
  const remainingSlots = Math.max(0, totalSlots - confirmedB - pendingB - rejectedB);

  // Guests
  const guestPending = guests.filter((g) => g.rsvp === "pending").length;
  const guestDeclined = guests.filter((g) => g.rsvp === "declined").length;
  const guestUnanswered = Math.max(
    0,
    guests.length - guestAccepted - guestPending - guestDeclined,
  );
  const guestTarget = plan.guestCountTarget ?? guests.length;

  // Checklist
  const checklistPct =
    checklistTotal > 0 ? Math.round((checklistDone / checklistTotal) * 100) : 0;

  // Event-complete gate.
  const eventStart = plan.eventDate
    ? new Date(`${plan.eventDate}T${plan.startTime ?? "23:59"}:00`)
    : null;
  const eventOver = eventStart ? eventStart.getTime() < Date.now() : false;
  const everythingConfirmed = pendingB === 0 && confirmedB > 0;
  const canMarkComplete = eventOver && everythingConfirmed;

  async function markComplete() {
    if (!canMarkComplete) return;
    setArchiving(true);
    try {
      const res = await fetch(`/api/event-plans/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      if (!res.ok) {
        toast.error("Nu am putut marca evenimentul ca finalizat.");
        return;
      }
      const data = await res.json().catch(() => null);
      if (data?.plan) onPlanUpdate(data.plan);
      toast.success("Eveniment finalizat. Mulțumim!");
      router.refresh();
    } catch {
      toast.error("Eroare la finalizare.");
    } finally {
      setArchiving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-heading">
          Progresul evenimentului
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Verde = confirmat · Galben = în așteptare · Roșu = refuzat ·
          Gri = neînceput
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Parteneri */}
        {totalSlots > 0 ? (
          <ProgressRow
            label="Parteneri"
            sub={`${confirmedB}/${totalSlots} confirmați${pendingB ? ` · ${pendingB} în așteptare` : ""}${rejectedB ? ` · ${rejectedB} refuzate` : ""}`}
            segments={[
              ...Array(confirmedB).fill("confirmed" as const),
              ...Array(pendingB).fill("pending" as const),
              ...Array(rejectedB).fill("rejected" as const),
              ...Array(remainingSlots).fill("idle" as const),
            ]}
          />
        ) : (
          <ProgressRow
            label="Parteneri"
            sub="Nu ai trimis cereri încă"
            segments={["idle", "idle", "idle", "idle"]}
          />
        )}

        {/* Invitați — only if the section is on */}
        {plan.guestsEnabled && (
          <PercentBar
            label="Invitați"
            sub={
              guestTarget > 0
                ? `${guestAccepted} acceptat${guestAccepted === 1 ? "" : "i"} din ${guestTarget}${guestDeclined ? ` · ${guestDeclined} refuzat${guestDeclined === 1 ? "" : "i"}` : ""}`
                : "Adaugă invitați pentru a urmări RSVP"
            }
            buckets={{
              confirmed: guestAccepted,
              pending: guestPending,
              rejected: guestDeclined,
              idle: guestUnanswered,
            }}
            total={Math.max(guestTarget, guests.length, 1)}
          />
        )}

        {/* Checklist — only if the section is on */}
        {plan.checklistEnabled && checklistTotal > 0 && (
          <PercentBar
            label="Checklist"
            sub={`${checklistDone} din ${checklistTotal} bifate (${checklistPct}%)`}
            buckets={{
              confirmed: checklistDone,
              pending: 0,
              rejected: 0,
              idle: checklistTotal - checklistDone,
            }}
            total={checklistTotal}
          />
        )}

        {/* Mark complete — gated on event-over + everything-confirmed */}
        <div className="rounded-lg border border-border/30 bg-card/40 p-3">
          {canMarkComplete ? (
            <button
              type="button"
              onClick={() => void markComplete()}
              disabled={archiving}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
            >
              {archiving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              Marchează evenimentul ca finalizat
            </button>
          ) : (
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Evenimentul poate fi marcat ca finalizat după ce a avut
                loc și toate cererile au răspuns.
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

type SegmentKind = "confirmed" | "pending" | "rejected" | "idle";

function segmentClass(kind: SegmentKind): string {
  if (kind === "confirmed") return "bg-emerald-500";
  if (kind === "pending") return "bg-amber-500";
  if (kind === "rejected") return "bg-red-500";
  return "bg-muted";
}

/** Discrete N-segment bar — used for the parteneri row where each
 *  artist gets its own coloured slot. */
function ProgressRow({
  label,
  sub,
  segments,
}: {
  label: string;
  sub: string;
  segments: SegmentKind[];
}) {
  return (
    <div>
      <div className="mb-1 flex items-end justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-[11px] text-muted-foreground">{sub}</span>
      </div>
      <div className="flex gap-1">
        {segments.length === 0 ? (
          <div className="h-2.5 flex-1 rounded-full bg-muted" />
        ) : (
          segments.map((s, i) => (
            <div
              key={i}
              className={`h-2.5 flex-1 rounded-full ${segmentClass(s)}`}
            />
          ))
        )}
      </div>
    </div>
  );
}

/** Continuous bar split by bucket — used for Invitați + Checklist. */
function PercentBar({
  label,
  sub,
  buckets,
  total,
}: {
  label: string;
  sub: string;
  buckets: Record<SegmentKind, number>;
  total: number;
}) {
  const safeTotal = Math.max(total, 1);
  const widths = {
    confirmed: (buckets.confirmed / safeTotal) * 100,
    pending: (buckets.pending / safeTotal) * 100,
    rejected: (buckets.rejected / safeTotal) * 100,
    idle: (buckets.idle / safeTotal) * 100,
  };
  return (
    <div>
      <div className="mb-1 flex items-end justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-[11px] text-muted-foreground">{sub}</span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
        {(["confirmed", "pending", "rejected", "idle"] as SegmentKind[]).map(
          (k) => (
            <div
              key={k}
              className={segmentClass(k)}
              style={{ width: `${widths[k]}%` }}
            />
          ),
        )}
      </div>
    </div>
  );
}

/**
 * Replaces the discovery grid on Rezervări Artiști once every selected
 * category already has an active request. Without this the user just
 * stared at strobing "ai deja un partener confirmat" cards. Now they
 * see a clear "you're done here" panel + nudges to the next step.
 */
function AllCategoriesBookedPanel({
  plan,
  bookings,
}: {
  plan: Plan;
  bookings: BookingRequest[];
}) {
  const router = useRouter();
  const pendingCount = bookings.filter((b) => b.status === "pending").length;
  const confirmedCount = bookings.filter(
    (b) => b.status === "accepted" || b.status === "confirmed_by_client",
  ).length;

  const noChecklist = !plan.checklistEnabled;
  const noGuests = !plan.guestsEnabled;
  const everythingEnabled = !noChecklist && !noGuests;

  const headline =
    pendingCount > 0
      ? "Toate categoriile sunt în așteptarea răspunsului partenerilor"
      : "Toți partenerii confirmați!";
  const subline =
    pendingCount > 0
      ? `${confirmedCount} confirmate · ${pendingCount} în așteptare. Vei primi notificare când răspund.`
      : "Toți cei pe care i-ai invitat au confirmat — felicitări!";

  async function activate(field: "checklistEnabled" | "guestsEnabled") {
    try {
      const res = await fetch(`/api/event-plans/${plan.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: true }),
      });
      if (!res.ok) {
        toast.error("Nu am putut activa secțiunea.");
        return;
      }
      // Soft refresh — the parent re-reads the plan via fetch on
      // mount, so a hard navigate will pick up the new flag.
      router.refresh();
      toast.success("Activat. Reîncarcă pagina ca să-l vezi în meniu.");
    } catch {
      toast.error("Eroare la activare.");
    }
  }

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-gold/30 bg-gradient-to-br from-gold/10 via-gold/5 to-transparent">
        <CardContent className="py-6">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-heading text-lg font-bold">{headline}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{subline}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ce mai poți face acum</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {plan.checklistEnabled && (
            <Link
              href={`/cabinet/planifica/${plan.id}?tab=checklist`}
              className="flex items-center justify-between rounded-lg border border-border/40 bg-card/60 p-3 hover:border-gold/40"
            >
              <div className="flex items-center gap-3">
                <ClipboardList className="h-4 w-4 text-gold" />
                <span className="text-sm font-medium">
                  Vezi checklist-ul evenimentului
                </span>
              </div>
              <span className="text-xs text-muted-foreground">→</span>
            </Link>
          )}
          {plan.guestsEnabled && (
            <Link
              href={`/cabinet/planifica/${plan.id}?tab=guests`}
              className="flex items-center justify-between rounded-lg border border-border/40 bg-card/60 p-3 hover:border-gold/40"
            >
              <div className="flex items-center gap-3">
                <Users className="h-4 w-4 text-gold" />
                <span className="text-sm font-medium">
                  Lista de invitați + RSVP
                </span>
              </div>
              <span className="text-xs text-muted-foreground">→</span>
            </Link>
          )}
          {plan.venueNeeded && (
            <Link
              href={`/cabinet/planifica/${plan.id}?tab=venues`}
              className="flex items-center justify-between rounded-lg border border-border/40 bg-card/60 p-3 hover:border-gold/40"
            >
              <div className="flex items-center gap-3">
                <MapPin className="h-4 w-4 text-gold" />
                <span className="text-sm font-medium">
                  Verifică sala rezervată
                </span>
              </div>
              <span className="text-xs text-muted-foreground">→</span>
            </Link>
          )}
          <Link
            href={`/cabinet/planifica/${plan.id}?tab=overview`}
            className="flex items-center justify-between rounded-lg border border-border/40 bg-card/60 p-3 hover:border-gold/40"
          >
            <div className="flex items-center gap-3">
              <LayoutDashboard className="h-4 w-4 text-gold" />
              <span className="text-sm font-medium">
                Înapoi la prezentare
              </span>
            </div>
            <span className="text-xs text-muted-foreground">→</span>
          </Link>
        </CardContent>
      </Card>

      {(noChecklist || noGuests) && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Suplimentar, poți activa
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Secțiuni care te ajută să planifici ce a mai rămas.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {noChecklist && (
              <button
                type="button"
                onClick={() => void activate("checklistEnabled")}
                className="flex w-full items-center justify-between rounded-lg border border-dashed border-border/40 p-3 text-left hover:border-gold/40 hover:bg-card/60"
              >
                <div className="flex items-center gap-3">
                  <ClipboardList className="h-4 w-4 text-gold" />
                  <div>
                    <p className="text-sm font-medium">Activează Checklist</p>
                    <p className="text-xs text-muted-foreground">
                      Lista pașilor pre-populată după tipul evenimentului.
                    </p>
                  </div>
                </div>
                <span className="rounded-md border border-gold/30 px-2 py-1 text-xs text-gold">
                  Activează
                </span>
              </button>
            )}
            {noGuests && (
              <button
                type="button"
                onClick={() => void activate("guestsEnabled")}
                className="flex w-full items-center justify-between rounded-lg border border-dashed border-border/40 p-3 text-left hover:border-gold/40 hover:bg-card/60"
              >
                <div className="flex items-center gap-3">
                  <Users className="h-4 w-4 text-gold" />
                  <div>
                    <p className="text-sm font-medium">
                      Activează Lista Invitaților
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Importă, RSVP, alocare la mese.
                    </p>
                  </div>
                </div>
                <span className="rounded-md border border-gold/30 px-2 py-1 text-xs text-gold">
                  Activează
                </span>
              </button>
            )}
          </CardContent>
        </Card>
      )}

      {everythingEnabled && pendingCount === 0 && (
        <Card className="border-emerald-500/40 bg-emerald-500/5">
          <CardContent className="py-4 text-center text-sm text-emerald-300">
            Tot e bifat. Vei primi notificare dacă apare ceva nou.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Cererile mele — flat list of every booking request the client has
 * submitted on this plan, split into "Confirmate" + "În așteptare".
 * Read-only summary; actions (cancel, accept counter-offer, message)
 * still live on /cabinet/rezervari for now.
 */
function MyBookingsTab({ bookings }: { bookings: BookingRequest[] }) {
  const ACTIVE_STATUSES = new Set([
    "accepted",
    "confirmed_by_client",
    "completed",
  ]);
  const PENDING_STATUSES = new Set(["pending"]);
  const confirmed = bookings.filter((b) => ACTIVE_STATUSES.has(b.status));
  const pending = bookings.filter((b) => PENDING_STATUSES.has(b.status));

  function row(b: BookingRequest) {
    const target = b.artistName
      ? { name: b.artistName, slug: b.artistSlug, type: "artist" as const }
      : b.venueName
        ? { name: b.venueName, slug: b.venueSlug, type: "venue" as const }
        : null;
    return (
      <div
        key={b.id}
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/40 bg-card/60 p-3 text-sm"
      >
        <div className="flex-1 min-w-0">
          <p className="font-medium">{target?.name ?? "Partener"}</p>
          <p className="text-xs text-muted-foreground">
            {target?.type === "venue" ? "Sală" : "Artist"}
            {b.eventDate &&
              ` · ${new Date(b.eventDate + "T00:00:00").toLocaleDateString(
                "ro-MD",
                { day: "numeric", month: "long" },
              )}`}
            {b.startTime && ` · ${b.startTime}`}
          </p>
        </div>
        {b.agreedPrice ? (
          <span className="rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-xs font-medium text-gold">
            {b.agreedPrice}€
          </span>
        ) : null}
        {target?.slug && target.type === "artist" && (
          <Link
            href={`/artisti/${target.slug}`}
            className="text-xs text-gold hover:underline"
          >
            Profil →
          </Link>
        )}
        {target?.slug && target.type === "venue" && (
          <Link
            href={`/sali/${target.slug}`}
            className="text-xs text-gold hover:underline"
          >
            Profil →
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="font-heading text-xl font-bold">Cererile mele</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Toate cererile pe care le-ai trimis pentru acest eveniment —
          săli și parteneri într-un singur loc.
        </p>
      </header>

      <section>
        <h3 className="mb-2 font-heading text-sm font-bold text-gold">
          Rezervate ({confirmed.length})
        </h3>
        {confirmed.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/40 px-3 py-6 text-center text-xs text-muted-foreground">
            Nicio rezervare confirmată încă.
          </p>
        ) : (
          <div className="space-y-2">{confirmed.map(row)}</div>
        )}
      </section>

      <section>
        <h3 className="mb-2 font-heading text-sm font-bold text-amber-500">
          În așteptare ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/40 px-3 py-6 text-center text-xs text-muted-foreground">
            Nicio cerere în așteptare.
          </p>
        ) : (
          <div className="space-y-2">{pending.map(row)}</div>
        )}
      </section>
    </div>
  );
}

function VenueDiscoveryCard({ venue: v, plan }: { venue: DiscoveryVenue; plan: Plan }) {
  const { user } = useUser();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function sendRequest() {
    if (!plan.eventDate) {
      toast.error("Adaugă mai întâi data evenimentului în planul tău");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/booking-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId: v.id,
          eventPlanId: plan.id,
          clientName: user?.fullName?.trim() || "Client",
          clientPhone: user?.phoneNumbers?.[0]?.phoneNumber?.trim() || "000000",
          clientEmail: user?.primaryEmailAddress?.emailAddress,
          eventDate: plan.eventDate,
          eventType: plan.eventType ?? undefined,
          guestCount: plan.guestCountTarget ?? undefined,
          message: `Cerere din planul ${plan.title}`,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Eroare la trimitere");
      }
      toast.success(`Cerere trimisă la ${v.nameRo}!`);
      setSent(true);
      // Hand control to the partners tab — booking the venue is the
      // first decision; assembling the show is what comes next. The
      // 2.5s delay lets the success toast register before the tab
      // switches under the user.
      setTimeout(() => {
        router.replace(`/cabinet/planifica/${plan.id}?tab=bookings`);
      }, 2500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eroare");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="group rounded-xl border border-border/40 bg-card p-4 transition-all hover:border-gold/40">
      <Link
        href={`/sali/${v.slug}?plan=${plan.id}`}
        className="flex items-start gap-3"
      >
        {v.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={v.coverUrl}
            alt=""
            className="h-16 w-16 rounded-lg object-cover shrink-0"
          />
        ) : (
          <div className="h-16 w-16 rounded-lg bg-gold/10 flex items-center justify-center shrink-0">
            <MapPin className="h-6 w-6 text-gold" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate group-hover:text-gold">
            {v.nameRo}
          </p>
          {v.city && <p className="text-xs text-muted-foreground">{v.city}</p>}
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
            {v.capacityMin && v.capacityMax && (
              <span>
                {v.capacityMin}–{v.capacityMax} locuri
              </span>
            )}
            {v.pricePerPerson != null && <span>{v.pricePerPerson}€/pers</span>}
          </div>
        </div>
      </Link>
      <div className="mt-3 flex gap-2 border-t border-border/30 pt-3">
        <Button
          onClick={sendRequest}
          disabled={submitting || sent}
          size="sm"
          className="flex-1 gap-1.5 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
        >
          {submitting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : sent ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <BookOpen className="h-3.5 w-3.5" />
          )}
          {sent ? "Cerere trimisă" : "Solicită rezervare"}
        </Button>
        <Link href={`/sali/${v.slug}?plan=${plan.id}`} target="_blank">
          <Button size="sm" variant="outline" className="gap-1.5">
            <ExternalLink className="h-3.5 w-3.5" />
            Detalii
          </Button>
        </Link>
      </div>
    </div>
  );
}
