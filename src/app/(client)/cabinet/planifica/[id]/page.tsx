"use client";

// M4 — Client planner dashboard — matches reference design:
// Left vertical nav | Main content (Overview/Checklist/Budget/etc) | Right stats sidebar.

import { useEffect, useState, useCallback, use } from "react";
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
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
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
  location: string | null;
  guestCountTarget: number | null;
  budgetTarget: number | null;
  seatsPerTable: number | null;
  notes: string | null;
  /** Wizard-supplied: whether the plan also needs a venue — drives the
   *  conditional "Săli" tab. */
  venueNeeded?: boolean;
  /** Wizard-supplied category IDs for pre-filtering the artist discovery. */
  selectedCategories?: number[];
  status?: "active" | "completed" | "cancelled";
}

interface BookingRequest {
  id: number;
  artistId: number;
  artistName: string | null;
  artistSlug: string | null;
  eventType: string | null;
  eventDate: string;
  status: string;
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
  { key: "bookings", icon: BookOpen, label: "Rezervări Artiști" },
  { key: "venues", icon: MapPin, label: "Săli", venueOnly: true },
  { key: "checklist", icon: ClipboardList, label: "Checklist" },
  { key: "budget", icon: Wallet, label: "Budget" },
  { key: "guests", icon: Users, label: "Invitați" },
  { key: "seating", icon: UtensilsCrossed, label: "Așezare Mese" },
  { key: "timeline", icon: Clock, label: "Cronologie" },
  { key: "photos", icon: Camera, label: "Fotografii" },
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

  // Hide the "Săli" tab unless the wizard / settings flagged this plan as
  // needing a venue.
  const visibleNavItems = NAV_ITEMS.filter((item) => !item.venueOnly || plan.venueNeeded);

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
          )}

          {activeTab === "checklist" && (
            <ChecklistView
              planId={plan.id}
              eventDate={plan.eventDate}
              items={checklist}
              onChange={setChecklist}
            />
          )}

          {activeTab === "budget" && (
            <BudgetTab
              plan={plan}
              bookings={bookings}
              onBookingUpdate={(b) =>
                setBookings((prev) =>
                  prev.map((x) => (x.id === b.id ? { ...x, ...b } : x)),
                )
              }
            />
          )}

          {activeTab === "guests" && (
            <GuestsView
              planId={plan.id}
              guestCountTarget={plan.guestCountTarget}
              guests={guests}
              onChange={setGuests}
            />
          )}

          {activeTab === "seating" && (
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
            {/* Budget Widget */}
            <Card>
              <CardContent className="py-4">
                <p className="text-2xl font-heading font-bold">
                  {plan.budgetTarget ? `${plan.budgetTarget}€` : "—"}
                </p>
                <p className="text-xs text-muted-foreground">Budget</p>
                <BudgetProgress plan={plan} bookings={bookings} />
              </CardContent>
            </Card>

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
                <h1 className="font-heading text-xl font-bold">{plan.title}</h1>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 lg:hidden">
          <Card>
            <CardContent className="py-4 text-center">
              <p className="text-2xl font-heading font-bold text-gold">
                {plan.budgetTarget ? `${plan.budgetTarget}€` : "—"}
              </p>
              <p className="text-xs text-muted-foreground">Budget</p>
            </CardContent>
          </Card>
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
          className="gap-1 bg-gold text-background hover:bg-gold-dark"
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
            <Button onClick={addExpense} className="bg-gold text-background hover:bg-gold-dark" disabled={!newDesc.trim() || !newAmount}>
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
  accepted: { label: "Acceptat", color: "text-emerald-400 border-emerald-400/30 bg-emerald-400/5" },
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
        // Fetch category metadata once so we can label sections nicely.
        const catsRes = await fetch("/api/categories", { cache: "no-store" }).then(
          (r) => (r.ok ? r.json() : []),
        );
        const cats: Array<{ id: number; nameRo: string }> = Array.isArray(catsRes)
          ? catsRes
          : catsRes.items ?? [];
        const catNameById = new Map(cats.map((c) => [c.id, c.nameRo]));

        const categories = plan.selectedCategories ?? [];
        if (categories.length === 0) {
          const res = await fetch(
            `/api/artists?date=${plan.eventDate}&limit=12`,
            { cache: "no-store" },
          ).then((r) => (r.ok ? r.json() : { items: [] }));
          setByCategory([
            {
              categoryId: 0,
              categoryName: "Toți artiștii",
              artists: (res.items ?? []) as DiscoveryArtist[],
            },
          ]);
          return;
        }

        const sections = await Promise.all(
          categories.map(async (catId) => {
            const res = await fetch(
              `/api/artists?date=${plan.eventDate}&category=${catId}&limit=12`,
              { cache: "no-store" },
            ).then((r) => (r.ok ? r.json() : { items: [] }));
            return {
              categoryId: catId,
              categoryName: catNameById.get(catId) ?? `Categorie #${catId}`,
              artists: (res.items ?? []) as DiscoveryArtist[],
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

  // Count existing bookings per category so the UI can show X/5 and
  // disable the booking button once the user maxes out a category.
  const bookedArtistIds = new Set(bookings.map((b) => b.artistId));
  const bookingsPerCategory = new Map<number, number>();
  for (const section of byCategory) {
    const booked = section.artists.filter((a) =>
      bookedArtistIds.has(a.id),
    ).length;
    bookingsPerCategory.set(section.categoryId, booked);
  }

  // Scope bookings to this plan only. Older bookings without eventPlanId
  // (pre-Faza 1) still show up because we fall back to email-matching
  // at the API layer.
  const planBookings = bookings;

  return (
    <div className="space-y-10">
      {/* ─── AI assistant (collapsed CTA by default) ─────────────── */}
      <AIArtistPickerChat
        eventPlanId={plan.id}
        onBookingsCreated={onRefresh}
      />

      {/* ─── Section 1: Existing bookings ───────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-heading text-xl font-bold">Rezervările mele</h2>
            <p className="text-sm text-muted-foreground">
              {planBookings.length} {planBookings.length === 1 ? "cerere" : "cereri"} trimise
            </p>
          </div>
          <Link href="/artisti">
            <Button variant="outline" size="sm" className="gap-1 text-xs">
              <Plus className="h-3.5 w-3.5" /> Caută artiști
            </Button>
          </Link>
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
          <div className="grid gap-3 md:grid-cols-2">
            {planBookings.map((b) => {
              const cfg = STATUS_CONFIG[b.status] || STATUS_CONFIG.pending;
              return (
                <Card key={b.id} className="transition-all hover:border-gold/30">
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
                            {b.eventDate && new Date(b.eventDate).toLocaleDateString("ro-MD")}
                            {b.eventType && ` · ${EVENT_TYPE_LABELS[b.eventType] || b.eventType}`}
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" className={cn("text-xs shrink-0", cfg.color)}>
                        {cfg.label}
                      </Badge>
                    </div>
                    {/* Price pill if negotiated */}
                    {b.agreedPrice != null && (
                      <div className="mt-3 flex items-center justify-between rounded-lg bg-gold/5 border border-gold/20 px-3 py-2">
                        <span className="text-xs text-muted-foreground">Preț agreat</span>
                        <span className="text-sm font-semibold text-gold">
                          {b.agreedPrice}€
                        </span>
                      </div>
                    )}

                    {/* Negotiation panel — always rendered for non-terminal
                        states; component itself decides what buttons show. */}
                    {["pending", "accepted"].includes(b.status) && (
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
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* ─── Section 2: Discover available artists, grouped by category ── */}
      {plan.eventDate && (
        <section className="space-y-10">
          <div className="mb-2">
            <h2 className="font-heading text-xl font-bold">
              Artiști disponibili pentru data ta
            </h2>
            <p className="text-sm text-muted-foreground">
              {new Date(plan.eventDate).toLocaleDateString("ro-MD", {
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

          {discoveryLoading ? (
            <div className="py-10 text-center">
              <Loader2 className="mx-auto h-6 w-6 animate-spin text-gold" />
            </div>
          ) : byCategory.length === 0 || byCategory.every((s) => s.artists.length === 0) ? (
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
            byCategory.map((section) => {
              if (section.artists.length === 0) return null;
              const used = bookingsPerCategory.get(section.categoryId) ?? 0;
              const limitReached = used >= MAX_PER_CATEGORY;
              return (
                <div key={section.categoryId}>
                  <div className="mb-3 flex items-end justify-between gap-3">
                    <div>
                      <h3 className="font-heading text-lg font-bold">
                        {section.categoryName}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {section.artists.length} artiști disponibili · {used}/
                        {MAX_PER_CATEGORY} cereri trimise
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {section.artists.map((a) => (
                      <PlanArtistCard
                        key={a.id}
                        artist={a}
                        plan={plan}
                        alreadyBooked={bookedArtistIds.has(a.id)}
                        categoryLimitReached={limitReached}
                        clientName={user?.fullName ?? "Client"}
                        clientPhone={
                          user?.primaryPhoneNumber?.phoneNumber ?? ""
                        }
                        clientEmail={
                          user?.primaryEmailAddress?.emailAddress ?? undefined
                        }
                        onBookingSent={() => onRefresh()}
                      />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </section>
      )}
    </div>
  );
}

// Artist card rendered inside the planner dashboard. Richer than the old
// mini card: cover image + profile link + price + real hourly availability
// slots for the plan's event date + inline "Solicită rezervare" modal.
function PlanArtistCard({
  artist,
  plan,
  alreadyBooked,
  categoryLimitReached,
  clientName,
  clientPhone,
  clientEmail,
  onBookingSent,
}: {
  artist: DiscoveryArtist;
  plan: Plan;
  alreadyBooked: boolean;
  categoryLimitReached: boolean;
  clientName: string;
  clientPhone: string;
  clientEmail?: string;
  onBookingSent: () => void;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const cover = artist.coverImageUrl || artist.coverUrl || null;
  const slots = artist.availabilitySlots ?? [];
  const disabled = alreadyBooked || categoryLimitReached;
  const buttonLabel = alreadyBooked
    ? "Cerere trimisă"
    : categoryLimitReached
      ? "Limită atinsă (5)"
      : "Solicită rezervare";

  async function submit() {
    if (submitting) return;
    const slot = slots.find((s) => s.id === selectedSlotId) ?? null;
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
          startTime: slot?.startTime,
          endTime: slot?.endTime,
          message: message.trim() || undefined,
          eventPlanId: plan.id,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Eroare la trimitere");
      }
      toast.success(`Cerere trimisă către ${artist.nameRo}!`);
      setModalOpen(false);
      setMessage("");
      setSelectedSlotId(null);
      onBookingSent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Eroare la trimitere");
    } finally {
      setSubmitting(false);
    }
  }

  const modal =
    modalOpen && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
            onClick={() => !submitting && setModalOpen(false)}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-border/40 bg-card shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <header className="flex items-center justify-between border-b border-border/40 px-5 py-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Solicită rezervare
                  </p>
                  <p className="font-heading text-lg font-bold">{artist.nameRo}</p>
                </div>
                <button
                  onClick={() => !submitting && setModalOpen(false)}
                  className="rounded-full p-1.5 text-muted-foreground hover:bg-accent"
                  aria-label="Închide"
                  disabled={submitting}
                >
                  <X className="h-5 w-5" />
                </button>
              </header>

              <div className="space-y-4 px-5 py-4">
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
                  {plan.guestCountTarget ? (
                    <p>
                      <span className="text-muted-foreground">Invitați:</span>{" "}
                      {plan.guestCountTarget}
                    </p>
                  ) : null}
                </div>

                {slots.length > 0 && (
                  <div>
                    <Label>Interval orar</Label>
                    <p className="text-xs text-muted-foreground mb-2">
                      Alege un interval (opțional) sau lasă gol pentru "toată ziua"
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {slots.map((s) => {
                        const selected = selectedSlotId === s.id;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() =>
                              setSelectedSlotId(selected ? null : s.id)
                            }
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

              <footer className="flex items-center justify-between gap-2 border-t border-border/40 px-5 py-3">
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
                    disabled={submitting}
                    className="gap-2 bg-gold text-background hover:bg-gold-dark"
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
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div className="group flex flex-col overflow-hidden rounded-xl border border-border/40 bg-card transition-all hover:border-gold/40">
        <Link
          href={`/artisti/${artist.slug}`}
          target="_blank"
          className="relative aspect-[4/3] overflow-hidden bg-muted"
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
            {artist.priceFrom != null && artist.priceFrom > 0 && (
              <span className="shrink-0 text-sm font-semibold text-gold">
                de la {artist.priceFrom}€
              </span>
            )}
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

          <Button
            onClick={() => setModalOpen(true)}
            disabled={disabled}
            size="sm"
            className="mt-4 w-full gap-2 bg-gold text-background hover:bg-gold-dark disabled:opacity-60"
          >
            {alreadyBooked ? (
              <Check className="h-3.5 w-3.5" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            {buttonLabel}
          </Button>
        </div>
      </div>
      {modal}
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

  useEffect(() => {
    const params = new URLSearchParams();
    if (plan.eventDate) params.set("date", plan.eventDate);
    if (plan.location) params.set("city", plan.location);
    if (plan.guestCountTarget) params.set("capacity_min", String(plan.guestCountTarget));
    params.set("limit", "12");
    fetch(`/api/venues?${params.toString()}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { venues: [] }))
      .then((data) => setVenues(data.venues ?? data ?? []))
      .catch(() => setVenues([]))
      .finally(() => setLoading(false));
  }, [plan.eventDate, plan.location, plan.guestCountTarget]);

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
          {plan.guestCountTarget && <> · min. {plan.guestCountTarget} invitați</>}
        </p>
        <p className="mt-2 text-xs text-muted-foreground/80">
          Rezervările de săli nu sunt incluse în buget — bugetul e format doar din artiști.
        </p>
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
            <Link
              key={v.id}
              href={`/sali/${v.slug}?plan=${plan.id}`}
              className="group rounded-xl border border-border/40 bg-card p-4 transition-all hover:border-gold/40"
            >
              <div className="flex items-start gap-3">
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
                  {v.city && (
                    <p className="text-xs text-muted-foreground">{v.city}</p>
                  )}
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {v.capacityMin && v.capacityMax && (
                      <span>{v.capacityMin}–{v.capacityMax} locuri</span>
                    )}
                    {v.pricePerPerson != null && (
                      <span>{v.pricePerPerson}€/pers</span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
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
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const router = useRouter();

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
          budgetTarget: budget ? Number(budget) : null,
          notes: notes || null,
          venueNeeded,
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

        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-gold text-background hover:bg-gold-dark gap-2"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvează setările
        </Button>

        <div className="pt-6 border-t border-border/20 space-y-3">
          <div>
            <h3 className="text-sm font-semibold mb-2">Finalizare</h3>
            <Button
              onClick={handleArchive}
              disabled={archiving}
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
