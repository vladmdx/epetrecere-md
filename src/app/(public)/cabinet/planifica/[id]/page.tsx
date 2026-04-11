"use client";

// M4 — Client cabinet: single event plan detail view with sub-tabs for
// Checklist, Invitați and Așezare mese. Data is fetched once from the
// plan endpoint and split across child components that each manage their
// own optimistic mutations.

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ArrowLeft,
  ClipboardList,
  Users,
  UtensilsCrossed,
  Loader2,
  Calendar,
  MapPin,
  Wallet,
  Trash2,
  Camera,
} from "lucide-react";
import { ChecklistView, type ChecklistItem } from "@/components/planner/checklist-view";
import { GuestsView, type Guest } from "@/components/planner/guests-view";
import {
  SeatingView,
  type SeatingTable,
  type SeatAssignment,
} from "@/components/planner/seating-view";
import { PhotosView } from "@/components/planner/photos-view";
import { useRouter } from "next/navigation";

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
}

export default function PlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const planId = Number(id);
  const router = useRouter();

  const [plan, setPlan] = useState<Plan | null>(null);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [tables, setTables] = useState<SeatingTable[]>([]);
  const [seats, setSeats] = useState<SeatAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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
      } catch {
        toast.error("Nu am putut încărca planul.");
      } finally {
        setLoading(false);
      }
    }
    if (Number.isFinite(planId)) load();
  }, [planId]);

  async function deletePlan() {
    if (!confirm("Sigur vrei să ștergi acest plan? Operațiunea este ireversibilă.")) {
      return;
    }
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
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Se încarcă…
      </div>
    );
  }

  if (notFound || !plan) {
    return (
      <div className="mx-auto max-w-md py-20 px-4 text-center">
        <ClipboardList className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">Plan negăsit sau nu ai acces la el.</p>
        <Link
          href="/cabinet/planifica"
          className="mt-4 inline-block text-sm text-gold hover:underline"
        >
          Înapoi la lista de planuri
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl py-8 px-4">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/cabinet/planifica"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gold"
        >
          <ArrowLeft className="h-3 w-3" /> Toate planurile
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl font-bold">{plan.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {plan.eventDate && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(plan.eventDate).toLocaleDateString("ro-MD")}
                </span>
              )}
              {plan.location && (
                <span className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5" />
                  {plan.location}
                </span>
              )}
              {plan.guestCountTarget && (
                <span className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  {plan.guestCountTarget} invitați
                </span>
              )}
              {plan.budgetTarget && (
                <span className="flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5" />
                  {plan.budgetTarget}€
                </span>
              )}
            </div>
          </div>
          <Button
            onClick={deletePlan}
            variant="outline"
            size="sm"
            className="gap-1 text-red-500 hover:bg-red-500/5 hover:text-red-500"
          >
            <Trash2 className="h-4 w-4" /> Șterge planul
          </Button>
        </div>
      </div>

      <Tabs defaultValue="checklist">
        <TabsList>
          <TabsTrigger value="checklist" className="gap-1.5">
            <ClipboardList className="h-4 w-4" />
            Checklist ({checklist.filter((i) => i.done).length}/{checklist.length})
          </TabsTrigger>
          <TabsTrigger value="guests" className="gap-1.5">
            <Users className="h-4 w-4" /> Invitați ({guests.length})
          </TabsTrigger>
          <TabsTrigger value="seating" className="gap-1.5">
            <UtensilsCrossed className="h-4 w-4" /> Așezare ({tables.length})
          </TabsTrigger>
          <TabsTrigger value="photos" className="gap-1.5">
            <Camera className="h-4 w-4" /> Fotografii
          </TabsTrigger>
        </TabsList>

        <TabsContent value="checklist" className="mt-6">
          <ChecklistView
            planId={plan.id}
            eventDate={plan.eventDate}
            items={checklist}
            onChange={setChecklist}
          />
        </TabsContent>

        <TabsContent value="guests" className="mt-6">
          <GuestsView
            planId={plan.id}
            guestCountTarget={plan.guestCountTarget}
            guests={guests}
            onChange={setGuests}
          />
        </TabsContent>

        <TabsContent value="seating" className="mt-6">
          <SeatingView
            planId={plan.id}
            guests={guests}
            tables={tables}
            seats={seats}
            onTablesChange={setTables}
            onSeatsChange={setSeats}
          />
        </TabsContent>

        <TabsContent value="photos" className="mt-6">
          <PhotosView planId={plan.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
