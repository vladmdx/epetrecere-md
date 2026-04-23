"use client";

// Live check-in dashboard client component.
// Two tabs:
//   1. "Live" — poll /api/invitations/checkin?invitation_id=X every 5s,
//       show stats cards + searchable guest list, click a row to toggle
//       manual check-in (in case guest lost their QR or came early).
//   2. "QR codes" — printable page with each guest's QR code (rendered
//       client-side via `qrcode` lib), ready for card/placecard printing.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Loader2,
  Printer,
  Search,
  Users,
  Clock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface GuestRow {
  id: number;
  name: string;
  rsvpStatus: string;
  plusOne: boolean;
  plusOneName: string | null;
  checkedInAt: string | null;
  checkInUrl: string | null;
}

interface Props {
  invitationId: number;
  invitationTitle: string;
  eventDate: string;
  guests: GuestRow[];
}

export function CheckinClient({
  invitationId,
  invitationTitle,
  eventDate,
  guests: initialGuests,
}: Props) {
  const [guests, setGuests] = useState<GuestRow[]>(initialGuests);
  const [search, setSearch] = useState("");
  const [polling, setPolling] = useState(true);

  // Poll every 5s for live updates (stop when tab hidden to save battery)
  useEffect(() => {
    let timer: number | undefined;
    function schedule() {
      timer = window.setTimeout(async () => {
        if (!polling) return schedule();
        try {
          const res = await fetch(
            `/api/invitations/checkin?invitation_id=${invitationId}`,
            { cache: "no-store" },
          );
          if (res.ok) {
            const data = await res.json();
            // Merge only the timestamp changes — keep URLs from initial load
            setGuests((prev) =>
              prev.map((g) => {
                const fresh = (
                  data.guests as Array<{ id: number; checkedInAt: string | null }>
                ).find((x) => x.id === g.id);
                return fresh
                  ? { ...g, checkedInAt: fresh.checkedInAt }
                  : g;
              }),
            );
          }
        } catch {
          /* ignore network errors during polling */
        }
        schedule();
      }, 5000);
    }
    schedule();
    function onVisChange() {
      setPolling(!document.hidden);
    }
    document.addEventListener("visibilitychange", onVisChange);
    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisChange);
    };
  }, [invitationId, polling]);

  const stats = useMemo(() => {
    const total = guests.length;
    const confirmed = guests.filter((g) => g.rsvpStatus === "yes").length;
    const arrived = guests.filter((g) => g.checkedInAt).length;
    const expected = guests.reduce(
      (a, g) => a + (g.rsvpStatus === "yes" ? 1 + (g.plusOne ? 1 : 0) : 0),
      0,
    );
    return { total, confirmed, arrived, expected };
  }, [guests]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return guests;
    return guests.filter((g) => g.name.toLowerCase().includes(q));
  }, [guests, search]);

  async function toggleCheckIn(g: GuestRow) {
    if (!g.checkInUrl) {
      toast.error("Acest invitat nu are un QR valid — adaugă-l manual pe lista imprimată");
      return;
    }
    // Use the public check-in endpoint with the guest's token (extract from URL)
    try {
      const url = new URL(g.checkInUrl);
      const token = url.searchParams.get("token");
      if (!token) return;
      const res = await fetch("/api/invitations/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        toast.error("Nu am putut face check-in");
        return;
      }
      const data = await res.json();
      setGuests((prev) =>
        prev.map((x) =>
          x.id === g.id ? { ...x, checkedInAt: data.checkedInAt } : x,
        ),
      );
      toast.success(
        data.alreadyCheckedIn
          ? `${g.name} era deja prezent`
          : `${g.name} marcat prezent`,
      );
    } catch {
      toast.error("Eroare");
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 lg:px-6">
      <Link
        href={`/cabinet/invitatii/${invitationId}`}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gold"
      >
        <ArrowLeft className="h-3 w-3" /> Înapoi la invitație
      </Link>

      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Check-in live</h1>
          <p className="text-sm text-muted-foreground">
            {invitationTitle} ·{" "}
            {new Date(eventDate).toLocaleDateString("ro-RO", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          Live — update la 5s
        </span>
      </div>

      {/* Stats row */}
      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <StatCard label="Invitați total" value={stats.total} />
        <StatCard
          label="Confirmați (RSVP)"
          value={stats.confirmed}
          subtitle="+1 incluși"
        />
        <StatCard
          label="Așteptați"
          value={stats.expected}
          subtitle="(conf + plusOne)"
        />
        <StatCard
          label="Prezenți"
          value={stats.arrived}
          highlight
          subtitle={
            stats.expected > 0
              ? `${Math.round((stats.arrived / stats.expected) * 100)}%`
              : undefined
          }
        />
      </div>

      <Tabs defaultValue="live" className="mt-6">
        <TabsList>
          <TabsTrigger value="live">Listă invitați</TabsTrigger>
          <TabsTrigger value="qr">QR codes — imprimă</TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="mt-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Caută după nume…"
              className="pl-10"
            />
          </div>

          <div className="space-y-2">
            {filtered.map((g) => (
              <button
                key={g.id}
                onClick={() => toggleCheckIn(g)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all",
                  g.checkedInAt
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : "border-border/40 bg-card hover:border-gold/30",
                )}
              >
                {g.checkedInAt ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                ) : (
                  <Circle className="h-5 w-5 shrink-0 text-muted-foreground/50" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {g.name}
                    {g.plusOne && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        + {g.plusOneName || "acompaniator"}
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {g.rsvpStatus === "yes"
                      ? "Confirmat"
                      : g.rsvpStatus === "no"
                        ? "Declinat"
                        : "Neconfirmat"}
                  </p>
                </div>
                {g.checkedInAt && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                    <Clock className="h-3 w-3" />
                    {new Date(g.checkedInAt).toLocaleTimeString("ro-RO", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </button>
            ))}
            {filtered.length === 0 && (
              <Card>
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  <Users className="mx-auto mb-2 h-6 w-6" />
                  Niciun invitat.
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        <TabsContent value="qr" className="mt-4">
          <QrPrintView guests={guests} eventTitle={invitationTitle} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatCard({
  label,
  value,
  subtitle,
  highlight,
}: {
  label: string;
  value: number;
  subtitle?: string;
  highlight?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p
          className={cn(
            "mt-1 font-heading text-3xl font-bold",
            highlight ? "text-gold" : "text-foreground",
          )}
        >
          {value}
        </p>
        {subtitle && (
          <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

function QrPrintView({
  guests,
  eventTitle,
}: {
  guests: GuestRow[];
  eventTitle: string;
}) {
  const [qrData, setQrData] = useState<Map<number, string>>(new Map());
  const [generating, setGenerating] = useState(true);

  useEffect(() => {
    (async () => {
      const map = new Map<number, string>();
      for (const g of guests) {
        if (!g.checkInUrl) continue;
        try {
          const dataUrl = await QRCode.toDataURL(g.checkInUrl, {
            errorCorrectionLevel: "M",
            margin: 1,
            width: 240,
            color: { dark: "#0D0D0D", light: "#FFFFFF" },
          });
          map.set(g.id, dataUrl);
        } catch {
          /* skip */
        }
      }
      setQrData(map);
      setGenerating(false);
    })();
  }, [guests]);

  function print() {
    window.print();
  }

  if (generating) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  const printable = guests.filter((g) => qrData.has(g.id));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <p className="text-sm text-muted-foreground">
          {printable.length} QR codes generate. Fiecare invitat are unul unic.
        </p>
        <button
          onClick={print}
          className="inline-flex items-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-xs font-semibold text-[#0D0D0D] hover:bg-gold-dark"
        >
          <Printer className="h-3.5 w-3.5" />
          Imprimă
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3 print:gap-2">
        {printable.map((g) => (
          <div
            key={g.id}
            className="flex flex-col items-center rounded-xl border border-border/40 bg-card p-3 text-center print:break-inside-avoid print:border-black"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrData.get(g.id)!}
              alt={`QR ${g.name}`}
              className="h-32 w-32"
            />
            <p className="mt-2 truncate text-sm font-semibold">
              {g.name}
            </p>
            {g.plusOne && (
              <p className="text-[10px] text-muted-foreground">
                + {g.plusOneName || "acompaniator"}
              </p>
            )}
            <p className="mt-1 truncate text-[9px] text-muted-foreground/70">
              {eventTitle}
            </p>
          </div>
        ))}
      </div>
      {guests.length > printable.length && (
        <p className="mt-4 text-xs text-amber-500 print:hidden">
          ⚠ {guests.length - printable.length} invitați fără token RSVP — nu
          pot avea QR auto-generat. Adaugă-i manual pe lista de check-in.
        </p>
      )}
    </div>
  );
}
