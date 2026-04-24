"use client";

// Per-category notification preferences grid. Columns: Email + Push.
// Rows: the five spec categories (Solicitări / Actualizări / Mesaje /
// Recenzii / Reminder-uri). Each toggle PUT-s the single cell so there's
// no global "Save" needed — optimistic + rollback on failure.

import { useEffect, useState } from "react";
import { Loader2, Mail, Bell, Inbox, CheckCircle2, MessageSquare, Star, CalendarClock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

type Category =
  | "booking_requests"
  | "booking_updates"
  | "messages"
  | "reviews"
  | "reminders";
type Channel = "email" | "push";
type Prefs = Partial<Record<Category, Partial<Record<Channel, boolean>>>>;

const ROWS: Array<{
  category: Category;
  label: string;
  sub: string;
  Icon: typeof Inbox;
  color: string;
}> = [
  {
    category: "booking_requests",
    label: "Solicitări noi",
    sub: "Cerere nouă de rezervare, conflicte pe aceeași dată",
    Icon: Inbox,
    color: "text-gold",
  },
  {
    category: "booking_updates",
    label: "Actualizări booking",
    sub: "Acceptat, confirmat de client, anulat, finalizat",
    Icon: CheckCircle2,
    color: "text-emerald-400",
  },
  {
    category: "messages",
    label: "Mesaje",
    sub: "Chat cu clienți + alte conversații",
    Icon: MessageSquare,
    color: "text-blue-400",
  },
  {
    category: "reviews",
    label: "Recenzii",
    sub: "Recenzie nouă primită sau cerere de a scrie una",
    Icon: Star,
    color: "text-amber-400",
  },
  {
    category: "reminders",
    label: "Reminder-uri",
    sub: "Evenimente viitoare, RSVP-uri, follow-up-uri",
    Icon: CalendarClock,
    color: "text-purple-400",
  },
];

/** Read the effective value (default true when key missing). */
function get(prefs: Prefs, cat: Category, ch: Channel): boolean {
  const v = prefs[cat]?.[ch];
  return v === undefined ? true : v;
}

export function NotificationPrefsGrid() {
  const [prefs, setPrefs] = useState<Prefs>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me/notification-preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.prefs) setPrefs(data.prefs);
      })
      .finally(() => setLoading(false));
  }, []);

  async function toggle(cat: Category, ch: Channel, next: boolean) {
    const key = `${cat}:${ch}`;
    setSaving(key);
    const prev = prefs;
    // Optimistic
    setPrefs({ ...prev, [cat]: { ...prev[cat], [ch]: next } });
    try {
      const res = await fetch("/api/me/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: cat, channel: ch, enabled: next }),
      });
      if (!res.ok) {
        setPrefs(prev);
        toast.error("Nu s-a putut salva preferința");
        return;
      }
    } finally {
      setSaving(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border/40 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Se încarcă preferințele...
      </div>
    );
  }

  return (
    <div>
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Tip notificări
      </Label>
      <p className="mt-1 text-xs text-muted-foreground">
        Alege pe ce canal vrei să primești fiecare tip. Notificările in-app
        (clopoțelul din header) se afișează mereu — toggle-urile de mai jos
        controlează doar email + push.
      </p>
      <div className="mt-3 overflow-hidden rounded-lg border border-border/40">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_90px_90px] items-center gap-2 border-b border-border/40 bg-muted/30 px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>Categorie</span>
          <span className="inline-flex items-center gap-1 justify-center">
            <Mail className="h-3 w-3" /> Email
          </span>
          <span className="inline-flex items-center gap-1 justify-center">
            <Bell className="h-3 w-3" /> Push
          </span>
        </div>

        {ROWS.map((row, i) => {
          const Icon = row.Icon;
          const emailOn = get(prefs, row.category, "email");
          const pushOn = get(prefs, row.category, "push");
          return (
            <div
              key={row.category}
              className={cn(
                "grid grid-cols-[1fr_90px_90px] items-center gap-2 px-3 py-3",
                i % 2 === 0 ? "bg-muted/10" : "",
              )}
            >
              <div className="flex items-start gap-2 min-w-0">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", row.color)} />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{row.label}</p>
                  <p className="text-[11px] text-muted-foreground">{row.sub}</p>
                </div>
              </div>
              <div className="flex justify-center">
                <Switch
                  checked={emailOn}
                  disabled={saving === `${row.category}:email`}
                  onCheckedChange={(v) => toggle(row.category, "email", v)}
                  aria-label={`Email ${row.label}`}
                />
              </div>
              <div className="flex justify-center">
                <Switch
                  checked={pushOn}
                  disabled={saving === `${row.category}:push`}
                  onCheckedChange={(v) => toggle(row.category, "push", v)}
                  aria-label={`Push ${row.label}`}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        ℹ️ Dezactivarea unui rând nu afectează notificările critice (booking
        confirmat, anulare) — acelea ajung mereu instant prin email.
      </p>
    </div>
  );
}
