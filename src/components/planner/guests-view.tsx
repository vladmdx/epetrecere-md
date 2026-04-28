"use client";

// M4 — Guest list sub-view: add guests, track RSVP, count totals.

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Users, UserCheck, UserX, UserMinus, FileUp, Send, Mail, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { INVITATION_DESIGN_LIST, type InvitationDesignId } from "@/lib/invitations/templates";
import { Textarea } from "@/components/ui/textarea";
import { TimePicker } from "@/components/ui/time-picker";
import { Calendar as CalendarIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export type GuestType = "single" | "couple" | "family";
export type ContactChannel =
  | "email"
  | "sms"
  | "whatsapp"
  | "viber"
  | "telegram";

export interface Guest {
  id: number;
  fullName: string;
  phone: string | null;
  email: string | null;
  group: string | null;
  guestType?: GuestType | null;
  partySize?: number | null;
  kidsCount?: number | null;
  contactChannel?: ContactChannel | null;
  contactValue?: string | null;
  plusOnes: number;
  dietary: string | null;
  rsvp: "pending" | "accepted" | "declined" | "maybe";
  notes: string | null;
}

const GUEST_TYPE_LABELS: Record<GuestType, string> = {
  single: "Singură persoană",
  couple: "Cuplu",
  family: "Familie",
};

const CHANNEL_LABELS: Record<ContactChannel, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  viber: "Viber",
  telegram: "Telegram",
};

const CHANNEL_PLACEHOLDERS: Record<ContactChannel, string> = {
  email: "email@exemplu.com",
  sms: "+373 60 000 000",
  whatsapp: "+373 60 000 000",
  viber: "+373 60 000 000",
  telegram: "@username sau +373 60 000 000",
};

/** Curated set of decorative icons the host can use as the invitation's
 *  centerpiece. Mix of bridal/festive emoji + the original glyphs. */
const DECOR_ICONS = [
  "✦", "❀", "—", "❦", "💍", "🌹", "🎉", "✨", "💕", "🕊️", "⭐", "🌟", "🥂", "🎂",
];

/** Google Fonts list — pre-loaded via the existing googleFontsUrl helper
 *  when the design is rendered. Keeping it small so the preview stays
 *  snappy and font requests don't stack up. */
const FONT_OPTIONS = [
  { value: "__default__", label: "Implicit (din șablon)" },
  { value: "Playfair Display", label: "Playfair Display (clasic)" },
  { value: "Cormorant Garamond", label: "Cormorant Garamond (elegant)" },
  { value: "Dancing Script", label: "Dancing Script (cursiv)" },
  { value: "Great Vibes", label: "Great Vibes (caligrafic)" },
  { value: "Inter", label: "Inter (modern)" },
  { value: "Montserrat", label: "Montserrat (modern bold)" },
  { value: "Pacifico", label: "Pacifico (relaxat)" },
];

interface PlanContext {
  id: number;
  title: string;
  eventType: string | null;
  eventDate: string | null;
  startTime?: string | null;
  location: string | null;
}

interface Props {
  planId: number;
  plan?: PlanContext;
  guestCountTarget: number | null;
  guests: Guest[];
  onChange: (guests: Guest[]) => void;
}

const RSVP_CONFIG: Record<
  Guest["rsvp"],
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  pending: { label: "În așteptare", color: "text-muted-foreground", icon: UserMinus },
  accepted: { label: "Confirmat", color: "text-emerald-500", icon: UserCheck },
  declined: { label: "Refuzat", color: "text-red-500", icon: UserX },
  maybe: { label: "Posibil", color: "text-amber-500", icon: UserMinus },
};

function ThemedDateInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="group flex h-11 w-full items-center gap-2.5 rounded-lg border border-border/60 bg-background/80 px-3 text-left text-sm transition-all hover:border-gold/50 focus-within:border-gold/70 focus-within:ring-2 focus-within:ring-gold/20">
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
          value
            ? "bg-gold/15 text-gold"
            : "bg-accent/40 text-foreground/70 group-hover:bg-gold/10 group-hover:text-gold",
        )}
      >
        <CalendarIcon className="h-3.5 w-3.5" />
      </div>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-transparent font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
      />
    </div>
  );
}

export function GuestsView({ planId, plan, guestCountTarget, guests, onChange }: Props) {
  const [name, setName] = useState("");
  const [guestType, setGuestType] = useState<GuestType>("single");
  /** Adults — only meaningful for type="family" (2..8). couple is locked
   *  to 2, single to 1. We keep a string in state so the input plays nice
   *  with empty intermediate values while the user is typing. */
  const [familySize, setFamilySize] = useState("2");
  const [kidsCount, setKidsCount] = useState("0");
  const [contactChannel, setContactChannel] =
    useState<ContactChannel>("whatsapp");
  const [contactValue, setContactValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Invitation sending dialog state
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [invData, setInvData] = useState({
    designId: "elegant-gold" as InvitationDesignId,
    coupleNames: "",
    eventDate: "",
    ceremonyTime: "",
    receptionTime: "",
    ceremonyLocation: "",
    receptionLocation: "",
    message: "Cu drag vă invităm să ne fiți alături...",
    dressCode: "",
    rsvpDeadline: "",
  });

  // Per-template customization overrides. Empty/undefined values mean
  // "use the template defaults". Persisted into the invitation as
  // customColors so the email + RSVP page reflect them.
  const [custom, setCustom] = useState<{
    headerText: string;
    decorIcon: string;
    bgColor: string;
    textColor: string;
    accentColor: string;
    fontHeading: string;
  }>({
    headerText: "",
    decorIcon: "",
    bgColor: "",
    textColor: "",
    accentColor: "",
    fontHeading: "",
  });
  const [showCustomize, setShowCustomize] = useState(false);

  /** Reset customizations whenever the host picks a different template
   *  so the preview matches the chosen design out of the box. */
  function setDesign(id: InvitationDesignId) {
    setInvData((s) => ({ ...s, designId: id }));
    setCustom({
      headerText: "",
      decorIcon: "",
      bgColor: "",
      textColor: "",
      accentColor: "",
      fontHeading: "",
    });
  }

  function openSendDialog() {
    if (!plan) {
      toast.error("Date insuficiente despre eveniment.");
      return;
    }
    // Auto-fill event metadata from the plan, but keep whichever design
    // the host picked from the inline gallery. Falls back to the current
    // value (which defaults to "elegant-gold").
    setInvData((prev) => ({
      ...prev,
      designId: prev.designId,
      coupleNames: plan.title || "",
      eventDate: plan.eventDate || "",
      ceremonyTime: plan.startTime || "",
      receptionTime: "",
      ceremonyLocation: plan.location || "",
      receptionLocation: plan.location || "",
      message: "Cu drag vă invităm să ne fiți alături...",
      dressCode: "",
      rsvpDeadline: "",
    }));
    setSendDialogOpen(true);
  }

  async function createAndSendInvitation() {
    if (!plan) return;
    const guestsWithContact = guests.filter(
      (g) => g.email || g.phone,
    );
    if (guestsWithContact.length === 0) {
      toast.error("Niciun invitat nu are un contact (email/telefon).");
      return;
    }
    setSending(true);
    try {
      // 1. Create the invitation with the event data
      const createRes = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: (plan.eventType as "wedding" | "birthday" | "baptism" | "corporate") ?? "wedding",
          coupleNames: invData.coupleNames,
          hostName: invData.coupleNames,
          eventDate: invData.eventDate,
          ceremonyTime: invData.ceremonyTime || undefined,
          receptionTime: invData.receptionTime || undefined,
          ceremonyLocation: invData.ceremonyLocation || undefined,
          receptionLocation: invData.receptionLocation || undefined,
          message: invData.message || undefined,
          dressCode: invData.dressCode || undefined,
          rsvpDeadline: invData.rsvpDeadline || undefined,
          designId: invData.designId,
          // Persist the host's customizations so the rendered email +
          // public RSVP page can reflect them. Only emit overrides the
          // user actually changed (empty string means "use template").
          customColors: {
            designId: invData.designId,
            ...(custom.headerText ? { headerText: custom.headerText } : {}),
            ...(custom.decorIcon ? { decorIcon: custom.decorIcon } : {}),
            ...(custom.bgColor ? { bgColor: custom.bgColor } : {}),
            ...(custom.textColor ? { textColor: custom.textColor } : {}),
            ...(custom.accentColor ? { accentColor: custom.accentColor } : {}),
            ...(custom.fontHeading ? { fontHeading: custom.fontHeading } : {}),
          },
          guests: guestsWithContact.map((g) => ({
            name: g.fullName,
            email: g.email || undefined,
            phone: g.phone || undefined,
            group: g.group || undefined,
          })),
        }),
      });
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(err.error || "Nu s-a putut crea invitația");
      }
      const invitation = await createRes.json();

      // 2. Publish it
      await fetch(`/api/invitations/${invitation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "published" }),
      });

      // 3. Send emails
      const sendRes = await fetch(`/api/invitations/${invitation.id}/send`, {
        method: "POST",
      });
      if (sendRes.ok) {
        const d = await sendRes.json();
        toast.success(`${d.sent} invitații trimise!`);
      } else {
        toast.success("Invitație creată. Emailurile vor fi trimise.");
      }
      setSendDialogOpen(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Eroare la trimitere",
      );
    } finally {
      setSending(false);
    }
  }

  /** C-20 — Parse an Excel/CSV file and POST each row to the guests API. */
  async function importFromFile(file: File) {
    setImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

      if (rows.length === 0) {
        toast.error("Fișierul nu conține rânduri.");
        return;
      }

      // Normalise header keys — match Romanian or English names, case-insensitive
      function col(row: Record<string, unknown>, ...keys: string[]): string {
        for (const k of keys) {
          for (const rk of Object.keys(row)) {
            if (rk.toLowerCase().trim() === k.toLowerCase()) {
              const v = row[rk];
              return v == null ? "" : String(v).trim();
            }
          }
        }
        return "";
      }

      let imported = 0;
      const newGuests: Guest[] = [];

      for (const row of rows) {
        const fullName = col(row, "Nume", "Name", "FullName", "Full Name", "fullName");
        if (!fullName) continue; // skip empty rows

        const phone = col(row, "Telefon", "Phone", "Tel", "phone");
        const email = col(row, "Email", "E-mail", "email");
        const group = col(row, "Grup", "Group", "group");

        const res = await fetch(`/api/event-plans/${planId}/guests`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fullName,
            phone: phone || undefined,
            email: email || undefined,
            group: group || undefined,
          }),
        });

        if (res.ok) {
          const d = await res.json();
          newGuests.push(d.guest);
          imported++;
        }
      }

      if (newGuests.length > 0) {
        onChange([...guests, ...newGuests]);
      }

      toast.success(`Au fost importați ${imported} invitați.`);
    } catch (err) {
      console.error(err);
      toast.error("Eroare la importul fișierului.");
    } finally {
      setImporting(false);
      // reset file input so the same file can be re-imported if needed
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const stats = useMemo(() => {
    let total = 0;
    const byRsvp = { pending: 0, accepted: 0, declined: 0, maybe: 0 };
    for (const g of guests) {
      // New shape: partySize (adults) + kidsCount. Legacy rows fall back
      // to 1 + plusOnes so historical data still shows reasonable counts.
      const ps = g.partySize ?? 1;
      const kids = g.kidsCount ?? 0;
      const headcount =
        g.partySize != null || g.kidsCount != null
          ? ps + kids
          : 1 + (g.plusOnes || 0);
      total += headcount;
      byRsvp[g.rsvp] += headcount;
    }
    return { total, ...byRsvp };
  }, [guests]);

  /** Total adults for the current type — couple locked at 2, single at 1,
   *  family clamped to 2..8. */
  function resolvePartySize(): number {
    if (guestType === "couple") return 2;
    if (guestType === "family") {
      const n = Number(familySize);
      if (!Number.isFinite(n)) return 2;
      return Math.max(2, Math.min(8, Math.floor(n)));
    }
    return 1;
  }

  async function addGuest() {
    if (name.trim().length < 1) {
      toast.error("Numele este obligatoriu.");
      return;
    }
    setAdding(true);
    try {
      const partySize = resolvePartySize();
      const trimmedContact = contactValue.trim();
      const res = await fetch(`/api/event-plans/${planId}/guests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: name.trim(),
          guestType,
          partySize,
          kidsCount: Number(kidsCount) || 0,
          contactChannel,
          contactValue: trimmedContact || undefined,
          // Mirror into legacy email/phone so existing send pipelines work.
          email:
            contactChannel === "email" && trimmedContact
              ? trimmedContact
              : undefined,
          phone:
            contactChannel !== "email" && trimmedContact
              ? trimmedContact
              : undefined,
        }),
      });
      if (!res.ok) {
        toast.error("Eroare la adăugare.");
        return;
      }
      const data = await res.json();
      onChange([...guests, data.guest]);
      // Reset for next entry — keep the channel & guestType so adding
      // a series of similar guests is fast.
      setName("");
      setKidsCount("0");
      setContactValue("");
    } finally {
      setAdding(false);
    }
  }

  async function updateRsvp(guest: Guest, rsvp: Guest["rsvp"]) {
    const prev = guests;
    onChange(guests.map((g) => (g.id === guest.id ? { ...g, rsvp } : g)));
    const res = await fetch(`/api/event-plans/${planId}/guests/${guest.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rsvp }),
    });
    if (!res.ok) {
      toast.error("Nu am putut actualiza.");
      onChange(prev);
    }
  }

  async function deleteGuest(guest: Guest) {
    const prev = guests;
    onChange(guests.filter((g) => g.id !== guest.id));
    const res = await fetch(`/api/event-plans/${planId}/guests/${guest.id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Nu am putut șterge.");
      onChange(prev);
    }
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard icon={Users} label="Total" value={stats.total} target={guestCountTarget} />
        <StatCard icon={UserCheck} label="Confirmați" value={stats.accepted} color="text-emerald-500" />
        <StatCard icon={UserMinus} label="În așteptare" value={stats.pending} />
        <StatCard icon={UserMinus} label="Posibil" value={stats.maybe} color="text-amber-500" />
        <StatCard icon={UserX} label="Refuzați" value={stats.declined} color="text-red-500" />
      </div>

      {/* Inline design picker + customization editor. The 4 baseline
          templates surface as preview cards. Selecting one (or opening
          "Personalizează") swaps the lower section to an editor panel
          where the host can override icon, colors, font, and the
          header text. Changes mirror live into a preview card on the
          right so the host sees the final look before sending. */}
      {plan && (() => {
        const tpl =
          INVITATION_DESIGN_LIST.find((d) => d.id === invData.designId) ??
          INVITATION_DESIGN_LIST[0];
        // Effective values = customization override OR template default.
        const effIcon =
          custom.decorIcon ||
          (tpl.decorStyle === "sparkles"
            ? "✦"
            : tpl.decorStyle === "flowers"
              ? "❀"
              : tpl.decorStyle === "minimal"
                ? "—"
                : "❦");
        const effHeader = custom.headerText || "Ești invitat";
        const effBg = custom.bgColor || tpl.preview.bg;
        const effText = custom.textColor || tpl.preview.text;
        const effAccent = custom.accentColor || tpl.preview.accent;
        const effFont = custom.fontHeading || tpl.fontHeading || "";
        const isCustomized =
          custom.headerText ||
          custom.decorIcon ||
          custom.bgColor ||
          custom.textColor ||
          custom.accentColor ||
          custom.fontHeading;

        return (
          <div className="rounded-xl border border-border/40 bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-heading font-bold">Design invitație</p>
                <p className="text-xs text-muted-foreground">
                  Alege un șablon și personalizează-l. Modificările sunt vizibile în previzualizare.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-gold/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-gold">
                  {tpl.name}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant={showCustomize ? "default" : "outline"}
                  onClick={() => setShowCustomize((v) => !v)}
                  className={cn(
                    "gap-1 text-xs",
                    showCustomize && "bg-gold text-[#0D0D0D] hover:bg-gold-dark",
                  )}
                >
                  {showCustomize ? "Ascunde" : "Personalizează"}
                </Button>
              </div>
            </div>

            {/* Template gallery */}
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {INVITATION_DESIGN_LIST.map((d) => {
                const active = invData.designId === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDesign(d.id)}
                    className={cn(
                      "overflow-hidden rounded-lg border-2 text-left transition-all",
                      active
                        ? "border-gold shadow-[0_0_0_2px_rgba(201,168,76,0.25)]"
                        : "border-border/40 hover:border-gold/30",
                    )}
                  >
                    <div
                      className="p-4"
                      style={{ background: d.preview.bg, color: d.preview.text }}
                    >
                      <div
                        className="text-center text-lg"
                        style={{ color: d.preview.accent }}
                      >
                        {d.decorStyle === "sparkles"
                          ? "✦"
                          : d.decorStyle === "flowers"
                            ? "❀"
                            : d.decorStyle === "minimal"
                              ? "—"
                              : "❦"}
                      </div>
                      <div
                        className="text-center text-[10px] uppercase tracking-widest"
                        style={{ color: d.preview.accent }}
                      >
                        Ești invitat
                      </div>
                      <div
                        className="mt-1 text-center text-sm font-bold"
                        style={{
                          fontFamily: d.fontHeading
                            ? `"${d.fontHeading}", serif`
                            : undefined,
                        }}
                      >
                        {plan.title || "Ana & Ion"}
                      </div>
                    </div>
                    <div className="flex items-center justify-between bg-card px-3 py-2">
                      <span className="text-xs font-medium">{d.name}</span>
                      {active && <Check className="h-4 w-4 text-gold" />}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Customization editor + live preview */}
            {showCustomize && (
              <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px]">
                <div className="space-y-4 rounded-lg border border-border/40 bg-background/40 p-4">
                  {/* Header text */}
                  <div>
                    <Label className="text-xs">Text titlu</Label>
                    <Input
                      className="mt-1"
                      value={custom.headerText}
                      onChange={(e) =>
                        setCustom((s) => ({ ...s, headerText: e.target.value }))
                      }
                      placeholder="Ești invitat"
                    />
                  </div>

                  {/* Icon picker */}
                  <div>
                    <Label className="text-xs">Iconiță</Label>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {DECOR_ICONS.map((ic) => {
                        const active = effIcon === ic;
                        return (
                          <button
                            key={ic}
                            type="button"
                            onClick={() =>
                              setCustom((s) => ({ ...s, decorIcon: ic }))
                            }
                            className={cn(
                              "flex h-9 w-9 items-center justify-center rounded-md border text-lg transition-all",
                              active
                                ? "border-gold bg-gold/10"
                                : "border-border/40 hover:border-gold/40",
                            )}
                          >
                            {ic}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Colors */}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label className="text-xs">Fundal</Label>
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="color"
                          value={effBg}
                          onChange={(e) =>
                            setCustom((s) => ({ ...s, bgColor: e.target.value }))
                          }
                          className="h-9 w-12 cursor-pointer rounded border border-border/40 bg-transparent"
                        />
                        <Input
                          value={effBg}
                          onChange={(e) =>
                            setCustom((s) => ({ ...s, bgColor: e.target.value }))
                          }
                          className="font-mono text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Text</Label>
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="color"
                          value={effText}
                          onChange={(e) =>
                            setCustom((s) => ({ ...s, textColor: e.target.value }))
                          }
                          className="h-9 w-12 cursor-pointer rounded border border-border/40 bg-transparent"
                        />
                        <Input
                          value={effText}
                          onChange={(e) =>
                            setCustom((s) => ({ ...s, textColor: e.target.value }))
                          }
                          className="font-mono text-xs"
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Accent</Label>
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          type="color"
                          value={effAccent}
                          onChange={(e) =>
                            setCustom((s) => ({ ...s, accentColor: e.target.value }))
                          }
                          className="h-9 w-12 cursor-pointer rounded border border-border/40 bg-transparent"
                        />
                        <Input
                          value={effAccent}
                          onChange={(e) =>
                            setCustom((s) => ({ ...s, accentColor: e.target.value }))
                          }
                          className="font-mono text-xs"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Font */}
                  <div>
                    <Label className="text-xs">Font titlu</Label>
                    <Select
                      value={custom.fontHeading || "__default__"}
                      onValueChange={(v) =>
                        setCustom((s) => ({
                          ...s,
                          fontHeading: v === "__default__" ? "" : v ?? "",
                        }))
                      }
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Implicit (din șablon)">
                          {custom.fontHeading
                            ? (FONT_OPTIONS.find(
                                (f) => f.value === custom.fontHeading,
                              )?.label ?? custom.fontHeading)
                            : "Implicit (din șablon)"}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {FONT_OPTIONS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    {isCustomized ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setCustom({
                            headerText: "",
                            decorIcon: "",
                            bgColor: "",
                            textColor: "",
                            accentColor: "",
                            fontHeading: "",
                          })
                        }
                        className="text-xs"
                      >
                        Resetează la șablon
                      </Button>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        Modificările folosesc valorile din șablon implicit.
                      </span>
                    )}
                  </div>
                </div>

                {/* Live preview */}
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    Previzualizare
                  </Label>
                  {effFont && (
                    <link
                      rel="stylesheet"
                      href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(
                        effFont,
                      ).replace(/%20/g, "+")}:wght@400;700&display=swap`}
                    />
                  )}
                  <div
                    className="overflow-hidden rounded-xl border-2 border-gold/30 p-8 text-center"
                    style={{ background: effBg, color: effText }}
                  >
                    <div
                      className="mb-2 text-5xl"
                      style={{ color: effAccent }}
                    >
                      {effIcon}
                    </div>
                    <div
                      className="mb-1 text-[10px] uppercase tracking-[0.3em]"
                      style={{ color: effAccent }}
                    >
                      {effHeader}
                    </div>
                    <div
                      className="mt-2 text-2xl font-bold"
                      style={{
                        fontFamily: effFont ? `"${effFont}", serif` : undefined,
                      }}
                    >
                      {invData.coupleNames || plan.title || "Ana & Ion"}
                    </div>
                    <div
                      className="mt-3 text-xs"
                      style={{ color: effAccent, opacity: 0.85 }}
                    >
                      {plan.eventDate || "Data evenimentului"}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Send invitations CTA */}
      {plan && guests.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/30 bg-gold/5 p-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-gold/10 p-2 text-gold">
              <Mail className="h-4 w-4" />
            </div>
            <div>
              <p className="font-heading font-bold">Trimite invitații electronice</p>
              <p className="text-xs text-muted-foreground">
                Alege un design și trimite invitația cu RSVP la toți invitații.
              </p>
            </div>
          </div>
          <Button
            onClick={openSendDialog}
            className="gap-1.5 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
          >
            <Send className="h-4 w-4" />
            Configurează și trimite
          </Button>
        </div>
      )}

      {/* Add guest */}
      <div className="rounded-xl border border-border/40 bg-card p-4">
        <p className="mb-3 text-xs font-medium uppercase text-muted-foreground">
          Adaugă invitat
        </p>

        {/* Row 1 — name + type + (optional) family size */}
        <div className="grid gap-3 md:grid-cols-12">
          <div className="md:col-span-5">
            <Label htmlFor="gname" className="text-xs">
              Nume invitat
            </Label>
            <Input
              id="gname"
              className="mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Ion Popescu"
            />
          </div>
          <div className="md:col-span-4">
            <Label className="text-xs">Tip</Label>
            <Select
              value={guestType}
              onValueChange={(v) => {
                if (!v) return;
                setGuestType(v as GuestType);
                if (v === "family" && Number(familySize) < 2) {
                  setFamilySize("2");
                }
              }}
            >
              <SelectTrigger className="mt-1">
                <SelectValue>{GUEST_TYPE_LABELS[guestType]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Singură persoană (1)</SelectItem>
                <SelectItem value="couple">Cuplu (2)</SelectItem>
                <SelectItem value="family">Familie (2-8)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {guestType === "family" && (
            <div className="md:col-span-3">
              <Label className="text-xs" htmlFor="famsize">
                Persoane în familie
              </Label>
              <Input
                id="famsize"
                type="number"
                min="2"
                max="8"
                className="mt-1"
                value={familySize}
                onChange={(e) => setFamilySize(e.target.value)}
              />
            </div>
          )}
        </div>

        {/* Row 2 — channel + contact value + kids */}
        <div className="mt-3 grid gap-3 md:grid-cols-12">
          <div className="md:col-span-3">
            <Label className="text-xs">Canal contact</Label>
            <Select
              value={contactChannel}
              onValueChange={(v) => {
                if (v) setContactChannel(v as ContactChannel);
              }}
            >
              <SelectTrigger className="mt-1">
                <SelectValue>{CHANNEL_LABELS[contactChannel]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="email">📧 Email</SelectItem>
                <SelectItem value="sms">✉️ SMS</SelectItem>
                <SelectItem value="whatsapp">🟢 WhatsApp</SelectItem>
                <SelectItem value="viber">🟣 Viber</SelectItem>
                <SelectItem value="telegram">✈️ Telegram</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-6">
            <Label className="text-xs">
              {contactChannel === "email" ? "Email" : "Telefon / Username"}
            </Label>
            <Input
              className="mt-1"
              type={contactChannel === "email" ? "email" : "text"}
              value={contactValue}
              onChange={(e) => setContactValue(e.target.value)}
              placeholder={CHANNEL_PLACEHOLDERS[contactChannel]}
            />
          </div>
          <div className="md:col-span-3">
            <Label className="text-xs" htmlFor="kids">
              Copii
            </Label>
            <Input
              id="kids"
              type="number"
              min="0"
              max="20"
              className="mt-1"
              value={kidsCount}
              onChange={(e) => setKidsCount(e.target.value)}
            />
          </div>
        </div>

        {/* Row 3 — actions */}
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importFromFile(f);
            }}
          />
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="gap-1"
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="h-4 w-4" />
            )}
            Import Excel
          </Button>
          <Button
            onClick={addGuest}
            disabled={adding}
            className="gap-1 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
          >
            {adding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Adaugă
          </Button>
        </div>
      </div>

      {/* Table */}
      {guests.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">Niciun invitat încă.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/40 bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Nume</th>
                <th className="p-3 text-left">Tip</th>
                <th className="p-3 text-left">Contact</th>
                <th className="p-3 text-left">Copii</th>
                <th className="p-3 text-left">RSVP</th>
                <th className="p-3" />
              </tr>
            </thead>
            <tbody>
              {guests.map((g) => {
                const cfg = RSVP_CONFIG[g.rsvp];
                const Icon = cfg.icon;
                return (
                  <tr
                    key={g.id}
                    className="border-b border-border/20 last:border-0 hover:bg-muted/30"
                  >
                    <td className="p-3 font-medium">{g.fullName}</td>
                    <td className="p-3 text-muted-foreground">
                      {(() => {
                        const t = (g.guestType ?? "single") as GuestType;
                        if (t === "single") return "Singură";
                        if (t === "couple") return "Cuplu (2)";
                        return `Familie (${g.partySize ?? 2})`;
                      })()}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {(() => {
                        const ch = g.contactChannel as ContactChannel | null;
                        const v =
                          g.contactValue ?? g.email ?? g.phone ?? null;
                        if (!v) return "—";
                        const label = ch ? CHANNEL_LABELS[ch] : "Contact";
                        return (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] uppercase">
                              {label}
                            </span>
                            <span>{v}</span>
                          </span>
                        );
                      })()}
                    </td>
                    <td className="p-3">{(g.kidsCount ?? 0) > 0 ? `+${g.kidsCount} copii` : "—"}</td>
                    <td className="p-3">
                      <Select
                        value={g.rsvp}
                        onValueChange={(v) => updateRsvp(g, v as Guest["rsvp"])}
                      >
                        <SelectTrigger
                          className={cn("h-8 w-[140px] gap-1", cfg.color)}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">În așteptare</SelectItem>
                          <SelectItem value="accepted">Confirmat</SelectItem>
                          <SelectItem value="maybe">Posibil</SelectItem>
                          <SelectItem value="declined">Refuzat</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => deleteGuest(g)}
                        className="text-muted-foreground transition-colors hover:text-red-500"
                        aria-label="Șterge"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Send invitations dialog */}
      <Dialog open={sendDialogOpen} onOpenChange={setSendDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurează invitația</DialogTitle>
            <DialogDescription>
              Alege designul și verifică informațiile care vor apărea pe invitație.
              Datele sunt precompletate din evenimentul tău.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Design picker */}
            <div>
              <Label className="mb-2 block">Design invitație</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {INVITATION_DESIGN_LIST.map((d) => {
                  const active = invData.designId === d.id;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() =>
                        setInvData((s) => ({ ...s, designId: d.id }))
                      }
                      className={cn(
                        "overflow-hidden rounded-lg border-2 text-left transition-all",
                        active
                          ? "border-gold shadow"
                          : "border-border/40 hover:border-gold/30",
                      )}
                    >
                      <div
                        className="p-4"
                        style={{ background: d.preview.bg, color: d.preview.text }}
                      >
                        <div
                          className="text-center text-lg"
                          style={{ color: d.preview.accent }}
                        >
                          {d.decorStyle === "sparkles"
                            ? "✦"
                            : d.decorStyle === "flowers"
                              ? "❀"
                              : d.decorStyle === "minimal"
                                ? "—"
                                : "❦"}
                        </div>
                        <div
                          className="text-center text-[10px] uppercase tracking-widest"
                          style={{ color: d.preview.accent }}
                        >
                          Ești invitat
                        </div>
                        <div
                          className="mt-1 text-center text-sm font-bold"
                          style={{
                            fontFamily: d.fontHeading
                              ? `"${d.fontHeading}", serif`
                              : undefined,
                          }}
                        >
                          {invData.coupleNames || "Ana & Ion"}
                        </div>
                      </div>
                      <div className="flex items-center justify-between bg-card px-3 py-2">
                        <div>
                          <div className="text-xs font-medium">{d.name}</div>
                        </div>
                        {active && <Check className="h-4 w-4 text-gold" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Editable fields */}
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Nume afișat pe invitație</Label>
                <Input
                  className="mt-1"
                  value={invData.coupleNames}
                  onChange={(e) =>
                    setInvData((s) => ({ ...s, coupleNames: e.target.value }))
                  }
                  placeholder="Ana & Ion"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Data evenimentului</Label>
                  <div className="mt-1">
                    <ThemedDateInput
                      value={invData.eventDate}
                      onChange={(v) => setInvData((s) => ({ ...s, eventDate: v }))}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Termen limită RSVP</Label>
                  <div className="mt-1">
                    <ThemedDateInput
                      value={invData.rsvpDeadline}
                      onChange={(v) => setInvData((s) => ({ ...s, rsvpDeadline: v }))}
                    />
                  </div>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label className="text-xs">Ora ceremoniei</Label>
                  <div className="mt-1">
                    <TimePicker
                      value={invData.ceremonyTime}
                      onChange={(v) => setInvData((s) => ({ ...s, ceremonyTime: v }))}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Ora petrecerii</Label>
                  <div className="mt-1">
                    <TimePicker
                      value={invData.receptionTime}
                      onChange={(v) => setInvData((s) => ({ ...s, receptionTime: v }))}
                    />
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs">Locația ceremoniei</Label>
                <Input
                  className="mt-1"
                  value={invData.ceremonyLocation}
                  onChange={(e) =>
                    setInvData((s) => ({
                      ...s,
                      ceremonyLocation: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Locația petrecerii</Label>
                <Input
                  className="mt-1"
                  value={invData.receptionLocation}
                  onChange={(e) =>
                    setInvData((s) => ({
                      ...s,
                      receptionLocation: e.target.value,
                    }))
                  }
                />
              </div>
              <div>
                <Label className="text-xs">Mesaj personal</Label>
                <Textarea
                  className="mt-1"
                  value={invData.message}
                  onChange={(e) =>
                    setInvData((s) => ({ ...s, message: e.target.value }))
                  }
                  rows={2}
                />
              </div>
              <div>
                <Label className="text-xs">Cod vestimentar (opțional)</Label>
                <Input
                  className="mt-1"
                  value={invData.dressCode}
                  onChange={(e) =>
                    setInvData((s) => ({ ...s, dressCode: e.target.value }))
                  }
                  placeholder="Ținută elegantă"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSendDialogOpen(false)}
              disabled={sending}
            >
              Anulează
            </Button>
            <Button
              onClick={createAndSendInvitation}
              disabled={sending || !invData.eventDate || !invData.coupleNames}
              className="gap-1.5 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Trimite invitațiile ({guests.filter((g) => g.email || g.phone).length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  target,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  target?: number | null;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card p-3">
      <div className={cn("flex items-center gap-1.5 text-xs text-muted-foreground", color)}>
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 font-heading text-xl font-bold">
        {value}
        {target ? <span className="text-xs font-normal text-muted-foreground"> / {target}</span> : null}
      </p>
    </div>
  );
}
