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
import { useLocale } from "@/hooks/use-locale";

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

const GUEST_TYPE_KEYS: Record<GuestType, string> = {
  single: "cabinet.guests.typeSingle",
  couple: "cabinet.guests.typeCouple",
  family: "cabinet.guests.typeFamily",
};

const CHANNEL_LABELS: Record<ContactChannel, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  viber: "Viber",
  telegram: "Telegram",
};

const CHANNEL_PLACEHOLDER_KEYS: Record<ContactChannel, string> = {
  email: "cabinet.guests.phEmail",
  sms: "cabinet.guests.phPhone",
  whatsapp: "cabinet.guests.phPhone",
  viber: "cabinet.guests.phPhone",
  telegram: "cabinet.guests.phTelegram",
};

/** Singular / plural greeting line that sits between the guest name
 *  and the event title. Couples + families get the plural form so the
 *  copy doesn't address one person when two or more were invited.
 *
 *  Deliberately NOT translated: this is the invitation's own copy, and
 *  the email the guests receive is rendered in Romanian server-side. A
 *  translated preview would show the host something their guests never
 *  get. */
function defaultGreeting(guestType: GuestType | null | undefined): string {
  if (guestType === "couple" || guestType === "family") {
    return "Sunteți invitați";
  }
  return "Ești invitat";
}

/** Mirrors the contact match POST /api/invitations uses to decide who is
 *  already on the invitation. Nothing links a planner guest row to an
 *  invitation_guests row, so the address is the identity. Keep the two in
 *  step or the dialog's "new guests" count will disagree with what the
 *  server actually adds. */
function contactKey(g: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}): string {
  const email = g.email?.trim().toLowerCase();
  if (email) return `e:${email}`;
  const phone = g.phone?.replace(/\D/g, "");
  if (phone) return `p:${phone}`;
  return `n:${(g.name ?? "").trim().toLowerCase()}`;
}

/** Curated set of decorative icons the host can use as the invitation's
 *  centerpiece. Mix of bridal/festive emoji + the original glyphs. */
const DECOR_ICONS = [
  "✦", "❀", "—", "❦", "💍", "🌹", "🎉", "✨", "💕", "🕊️", "⭐", "🌟", "🥂", "🎂",
];

/** Google Fonts list — pre-loaded via the existing googleFontsUrl helper
 *  when the design is rendered. Keeping it small so the preview stays
 *  snappy and font requests don't stack up. */
const FONT_OPTIONS = [
  { value: "__default__", labelKey: "cabinet.guests.fontDefault" },
  { value: "Playfair Display", labelKey: "cabinet.guests.fontPlayfair" },
  { value: "Cormorant Garamond", labelKey: "cabinet.guests.fontCormorant" },
  { value: "Dancing Script", labelKey: "cabinet.guests.fontDancing" },
  { value: "Great Vibes", labelKey: "cabinet.guests.fontGreatVibes" },
  { value: "Inter", labelKey: "cabinet.guests.fontInter" },
  { value: "Montserrat", labelKey: "cabinet.guests.fontMontserrat" },
  { value: "Pacifico", labelKey: "cabinet.guests.fontPacifico" },
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
  { labelKey: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  pending: { labelKey: "cabinet.guests.rsvpPending", color: "text-muted-foreground", icon: UserMinus },
  accepted: { labelKey: "cabinet.guests.rsvpAccepted", color: "text-emerald-500", icon: UserCheck },
  declined: { labelKey: "cabinet.guests.rsvpDeclined", color: "text-red-500", icon: UserX },
  maybe: { labelKey: "cabinet.guests.rsvpMaybe", color: "text-amber-500", icon: UserMinus },
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
  const { t } = useLocale();
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
  /** The plan's existing invitation, if it already has one. Send adds to
   *  this rather than minting a second — a second invitation means a new
   *  slug and new RSVP tokens, so every earlier guest gets a duplicate
   *  mail with a different link and their first answer is orphaned. */
  const [existingInv, setExistingInv] = useState<{
    id: number;
    status: string;
    guestKeys: string[];
  } | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(false);
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
  type Align = "left" | "center" | "right";
  const initialCustom = {
    headerText: "",
    eventName: "", // overrides the event title shown on the invitation
    decorIcon: "",
    iconImageUrl: "",
    iconSize: 48, // px
    iconAlign: "center" as Align,
    bgColor: "",
    textColor: "",
    accentColor: "",
    fontHeading: "",
    titleSize: 24, // px — couple/event name size
    titleAlign: "center" as Align,
  };
  const [custom, setCustom] = useState(initialCustom);
  const [showCustomize, setShowCustomize] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const iconFileInputRef = useRef<HTMLInputElement>(null);
  /** Which guest's data to render in the live preview. Defaults to a
   *  generic placeholder so the host can see the layout before adding
   *  any guests. Switching between guests/types lets them sanity-check
   *  the singular vs plural greeting. */
  const [previewGuestId, setPreviewGuestId] = useState<number | "demo">("demo");

  /** Reset customizations whenever the host picks a different template
   *  so the preview matches the chosen design out of the box. */
  function setDesign(id: InvitationDesignId) {
    setInvData((s) => ({ ...s, designId: id }));
    setCustom(initialCustom);
  }

  /** Upload a custom icon image (logo, monogram, png) to Vercel Blob and
   *  store the public URL in `custom.iconImageUrl`. When set, the live
   *  preview renders the image instead of the emoji glyph. */
  async function handleIconUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error(t("cabinet.guests.pickImage"));
      return;
    }
    setUploadingIcon(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "invitations");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Upload failed");
      }
      const data = await res.json();
      setCustom((s) => ({ ...s, iconImageUrl: data.url }));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("cabinet.guests.uploadError"),
      );
    } finally {
      setUploadingIcon(false);
    }
  }

  async function openSendDialog() {
    if (!plan) {
      toast.error(t("cabinet.guests.missingEventData"));
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
    setExistingInv(null);
    setSendDialogOpen(true);

    // If the plan already has an invitation, the dialog must show what is
    // actually saved on it. Sending re-writes the invitation from these
    // fields, so opening with the plan defaults would quietly overwrite a
    // design the host spent time on the first time round.
    setLoadingExisting(true);
    try {
      const res = await fetch(`/api/invitations?planId=${plan.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data?.invitation) {
          const inv = data.invitation;
          const cc = (inv.customColors || {}) as Record<string, unknown>;
          const str = (k: string) =>
            typeof cc[k] === "string" ? (cc[k] as string) : "";
          const align = (k: string): Align => {
            const v = str(k);
            return v === "left" || v === "right" ? v : "center";
          };
          const num = (k: string, fallback: number) => {
            const n = Number(cc[k]);
            return Number.isFinite(n) && n > 0 ? n : fallback;
          };
          setInvData({
            designId: (str("designId") ||
              "elegant-gold") as InvitationDesignId,
            coupleNames: inv.coupleNames || plan.title || "",
            eventDate: inv.eventDate || plan.eventDate || "",
            ceremonyTime: inv.ceremonyTime || "",
            receptionTime: inv.receptionTime || "",
            ceremonyLocation: inv.ceremonyLocation || "",
            receptionLocation: inv.receptionLocation || "",
            message: inv.message || "",
            dressCode: inv.dressCode || "",
            rsvpDeadline: inv.rsvpDeadline || "",
          });
          setCustom({
            headerText: str("headerText"),
            eventName: str("eventName"),
            decorIcon: str("decorIcon"),
            iconImageUrl: str("iconImageUrl"),
            iconSize: num("iconSize", initialCustom.iconSize),
            iconAlign: align("iconAlign"),
            bgColor: str("bgColor"),
            textColor: str("textColor"),
            accentColor: str("accentColor"),
            fontHeading: str("fontHeading"),
            titleSize: num("titleSize", initialCustom.titleSize),
            titleAlign: align("titleAlign"),
          });
          setExistingInv({
            id: inv.id,
            status: inv.status,
            guestKeys: (data.guests ?? []).map(contactKey),
          });
        }
      }
    } catch {
      // Offline or the lookup failed — the plan defaults above still let
      // the host send; the server is the one that refuses to duplicate.
    } finally {
      setLoadingExisting(false);
    }
  }

  /** Planner guests who aren't on the invitation yet. `added` is how many
   *  rows Send will create; `mailable` is how many of those actually get
   *  an email, since delivery is email-only — a phone-only guest joins the
   *  list but nothing is sent to them. The button counts the mailable
   *  ones so its number matches the toast that follows. */
  const pendingInvites = useMemo(() => {
    const withContact = guests.filter((g) => g.email || g.phone);
    const known = existingInv ? new Set(existingInv.guestKeys) : new Set<string>();
    const fresh = withContact.filter(
      (g) =>
        !known.has(
          contactKey({ name: g.fullName, email: g.email, phone: g.phone }),
        ),
    );
    return {
      added: fresh.length,
      mailable: fresh.filter((g) => g.email).length,
    };
  }, [guests, existingInv]);

  async function createAndSendInvitation() {
    if (!plan) return;
    const guestsWithContact = guests.filter(
      (g) => g.email || g.phone,
    );
    if (guestsWithContact.length === 0) {
      toast.error(t("cabinet.guests.noContacts"));
      return;
    }
    setSending(true);
    try {
      // 1. Create the invitation with the event data
      const createRes = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Naming the plan is what makes this create-or-reuse instead of
          // "another invitation, every press".
          planId: plan.id,
          eventType: (plan.eventType as "wedding" | "birthday" | "baptism" | "corporate") ?? "wedding",
          coupleNames: invData.coupleNames,
          hostName: invData.coupleNames,
          eventDate: invData.eventDate,
          // Always sent, empty string included. This dialog is pre-filled
          // from the invitation and is the only place these are edited, so
          // an empty box means "the host cleared it" — dropping the key
          // instead let the reuse UPDATE keep the old value, and clearing a
          // dress code or a message silently did nothing.
          ceremonyTime: invData.ceremonyTime ?? "",
          receptionTime: invData.receptionTime ?? "",
          ceremonyLocation: invData.ceremonyLocation ?? "",
          receptionLocation: invData.receptionLocation ?? "",
          message: invData.message ?? "",
          dressCode: invData.dressCode ?? "",
          rsvpDeadline: invData.rsvpDeadline ?? "",
          designId: invData.designId,
          // Persist the host's customizations so the rendered email +
          // public RSVP page can reflect them. Only emit overrides the
          // user actually changed (empty string means "use template");
          // numeric / alignment fields always emit because they have
          // sensible defaults that aren't "no value".
          customColors: {
            designId: invData.designId,
            ...(custom.headerText ? { headerText: custom.headerText } : {}),
            ...(custom.eventName ? { eventName: custom.eventName } : {}),
            ...(custom.decorIcon ? { decorIcon: custom.decorIcon } : {}),
            ...(custom.iconImageUrl
              ? { iconImageUrl: custom.iconImageUrl }
              : {}),
            ...(custom.bgColor ? { bgColor: custom.bgColor } : {}),
            ...(custom.textColor ? { textColor: custom.textColor } : {}),
            ...(custom.accentColor ? { accentColor: custom.accentColor } : {}),
            ...(custom.fontHeading ? { fontHeading: custom.fontHeading } : {}),
            iconSize: String(custom.iconSize),
            iconAlign: custom.iconAlign,
            titleSize: String(custom.titleSize),
            titleAlign: custom.titleAlign,
          },
          guests: guestsWithContact.map((g) => ({
            name: g.fullName,
            email: g.email || undefined,
            phone: g.phone || undefined,
            group: g.group || undefined,
            // Pass the guest type through so the email render picks
            // singular vs plural copy ("Ești invitat" vs "Sunteți invitați").
            guestType: (g.guestType as "single" | "couple" | "family" | null) ?? "single",
          })),
        }),
      });
      if (!createRes.ok) {
        const err = await createRes.json().catch(() => ({}));
        throw new Error(err.error || t("cabinet.guests.createFailed"));
      }
      // The server either created the plan's invitation or added the new
      // guests to the one it already had.
      const invitation = await createRes.json();

      // 2. Publish it — only when it isn't already, so a reused invitation
      //    isn't needlessly rewritten on every send.
      if (invitation.status !== "published") {
        await fetch(`/api/invitations/${invitation.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "published" }),
        });
      }

      // 3. Send emails. No body — the route mails only the guests who
      //    don't have the invitation yet.
      const sendRes = await fetch(`/api/invitations/${invitation.id}/send`, {
        method: "POST",
      });
      if (sendRes.ok) {
        const d = await sendRes.json();
        // Report what happened rather than implying the whole list went
        // out: "sent 1, 12 already had it" is the answer that would have
        // made this bug obvious the first time it happened.
        const parts = [t("cabinet.guests.sendReportSent", { count: d.sent })];
        if (d.skipped > 0)
          parts.push(
            t("cabinet.guests.sendReportSkipped", { count: d.skipped }),
          );
        if (d.failed > 0)
          parts.push(t("cabinet.guests.sendReportFailed", { count: d.failed }));
        toast.success(parts.join(" · "));
      } else {
        const err = await sendRes.json().catch(() => ({}));
        toast.error(err.error || t("cabinet.guests.savedButSendFailed"));
      }
      setExistingInv(null);
      setSendDialogOpen(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("booking.card.sendError"),
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
        toast.error(t("cabinet.guests.emptyFile"));
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

      toast.success(t("cabinet.guests.importedCount", { count: imported }));
    } catch (err) {
      console.error(err);
      toast.error(t("cabinet.guests.importError"));
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
      toast.error(t("cabinet.guests.nameRequired"));
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
        toast.error(t("cabinet.guests.addError"));
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
      toast.error(t("cabinet.guests.updateError"));
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
      toast.error(t("cabinet.guests.deleteError"));
      onChange(prev);
    }
  }

  return (
    <div className="space-y-5">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatCard icon={Users} label={t("cabinet.guests.statTotal")} value={stats.total} target={guestCountTarget} />
        <StatCard icon={UserCheck} label={t("cabinet.guests.statAccepted")} value={stats.accepted} color="text-emerald-500" />
        <StatCard icon={UserMinus} label={t("cabinet.guests.rsvpPending")} value={stats.pending} />
        <StatCard icon={UserMinus} label={t("cabinet.guests.rsvpMaybe")} value={stats.maybe} color="text-amber-500" />
        <StatCard icon={UserX} label={t("cabinet.guests.statDeclined")} value={stats.declined} color="text-red-500" />
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
        // Resolve which guest powers the preview. Falls back to a demo
        // entry that cycles through the three party shapes via
        // `previewGuestId === "demo"` + the demo selector below.
        const previewGuest =
          previewGuestId === "demo"
            ? null
            : guests.find((g) => g.id === previewGuestId) ?? null;
        const previewType: GuestType =
          (previewGuest?.guestType as GuestType | null) ?? "single";
        const previewName =
          previewGuest?.fullName || t("cabinet.guests.previewNamePlaceholder");
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
        // Custom header text wins; otherwise auto-conjugate based on the
        // selected preview guest's type so the host sees the real copy
        // each invitee will receive.
        const effHeader = custom.headerText || defaultGreeting(previewType);
        const effBg = custom.bgColor || tpl.preview.bg;
        const effText = custom.textColor || tpl.preview.text;
        const effAccent = custom.accentColor || tpl.preview.accent;
        const effFont = custom.fontHeading || tpl.fontHeading || "";
        const effEventName =
          custom.eventName || invData.coupleNames || plan.title || "Ana & Ion";
        const isCustomized =
          custom.headerText ||
          custom.eventName ||
          custom.decorIcon ||
          custom.iconImageUrl ||
          custom.bgColor ||
          custom.textColor ||
          custom.accentColor ||
          custom.fontHeading ||
          custom.iconSize !== initialCustom.iconSize ||
          custom.iconAlign !== initialCustom.iconAlign ||
          custom.titleSize !== initialCustom.titleSize ||
          custom.titleAlign !== initialCustom.titleAlign;

        return (
          <div className="rounded-xl border border-border/40 bg-card p-4">
            <div className="mb-3 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-heading font-bold">
                  {t("cabinet.guests.designTitle")}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t("cabinet.guests.designSubtitle")}
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
                  {showCustomize
                    ? t("cabinet.guests.hide")
                    : t("cookies.customize")}
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
                    <Label className="text-xs">
                      {t("cabinet.guests.fieldTopText")}
                    </Label>
                    <Input
                      className="mt-1"
                      value={custom.headerText}
                      onChange={(e) =>
                        setCustom((s) => ({ ...s, headerText: e.target.value }))
                      }
                      placeholder={t("planner.guests.inviteTitlePlaceholder")}
                    />
                  </div>

                  {/* Event name (the big title shown on the invitation) */}
                  <div>
                    <Label className="text-xs">
                      {t("cabinet.guests.fieldEventName")}
                    </Label>
                    <Input
                      className="mt-1"
                      value={custom.eventName}
                      onChange={(e) =>
                        setCustom((s) => ({ ...s, eventName: e.target.value }))
                      }
                      placeholder={plan.title || t("cabinet.guests.eventNameExample")}
                    />
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t("cabinet.guests.fieldEventNameHint", {
                        title: plan.title || "—",
                      })}
                    </p>
                  </div>

                  {/* Title size + alignment */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs">
                        {t("cabinet.guests.fieldTitleSize", {
                          size: custom.titleSize,
                        })}
                      </Label>
                      <input
                        type="range"
                        min={16}
                        max={64}
                        step={1}
                        value={custom.titleSize}
                        onChange={(e) =>
                          setCustom((s) => ({
                            ...s,
                            titleSize: Number(e.target.value),
                          }))
                        }
                        className="mt-2 w-full accent-[#C9A84C]"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">
                        {t("cabinet.guests.fieldTitleAlign")}
                      </Label>
                      <div className="mt-1 grid grid-cols-3 gap-1">
                        {(["left", "center", "right"] as Align[]).map((a) => (
                          <button
                            key={a}
                            type="button"
                            onClick={() =>
                              setCustom((s) => ({ ...s, titleAlign: a }))
                            }
                            className={cn(
                              "rounded-md border px-2 py-1.5 text-xs transition-all",
                              custom.titleAlign === a
                                ? "border-gold bg-gold/10 text-gold"
                                : "border-border/40 hover:border-gold/40",
                            )}
                          >
                            {a === "left"
                              ? t("cabinet.guests.alignLeft")
                              : a === "center"
                                ? t("cabinet.guests.alignCenter")
                                : t("cabinet.guests.alignRight")}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Icon picker — emoji glyphs */}
                  <div>
                    <Label className="text-xs">
                      {t("cabinet.guests.fieldIconList")}
                    </Label>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {DECOR_ICONS.map((ic) => {
                        const active =
                          !custom.iconImageUrl && effIcon === ic;
                        return (
                          <button
                            key={ic}
                            type="button"
                            onClick={() =>
                              setCustom((s) => ({
                                ...s,
                                decorIcon: ic,
                                // Choosing a glyph clears the uploaded
                                // image so the preview shows just one.
                                iconImageUrl: "",
                              }))
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

                  {/* Custom icon upload */}
                  <div>
                    <Label className="text-xs">
                      {t("cabinet.guests.fieldIconUpload")}
                    </Label>
                    <div className="mt-1 flex items-center gap-2">
                      <input
                        ref={iconFileInputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleIconUpload(f);
                          e.currentTarget.value = "";
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={uploadingIcon}
                        onClick={() => iconFileInputRef.current?.click()}
                        className="gap-1.5"
                      >
                        {uploadingIcon ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <FileUp className="h-3.5 w-3.5" />
                        )}
                        {custom.iconImageUrl
                          ? t("cabinet.guests.changeImage")
                          : t("cabinet.guests.uploadImage")}
                      </Button>
                      {custom.iconImageUrl && (
                        <>
                          <img
                            src={custom.iconImageUrl}
                            alt="icon"
                            className="h-9 w-9 rounded border border-border/40 object-contain"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setCustom((s) => ({ ...s, iconImageUrl: "" }))
                            }
                            className="text-xs text-muted-foreground hover:text-destructive"
                          >
                            {t("common.delete")}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Icon size + alignment */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs">
                        {t("cabinet.guests.fieldIconSize", {
                          size: custom.iconSize,
                        })}
                      </Label>
                      <input
                        type="range"
                        min={16}
                        max={160}
                        step={2}
                        value={custom.iconSize}
                        onChange={(e) =>
                          setCustom((s) => ({
                            ...s,
                            iconSize: Number(e.target.value),
                          }))
                        }
                        className="mt-2 w-full accent-[#C9A84C]"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">
                        {t("cabinet.guests.fieldIconAlign")}
                      </Label>
                      <div className="mt-1 grid grid-cols-3 gap-1">
                        {(["left", "center", "right"] as Align[]).map((a) => (
                          <button
                            key={a}
                            type="button"
                            onClick={() =>
                              setCustom((s) => ({ ...s, iconAlign: a }))
                            }
                            className={cn(
                              "rounded-md border px-2 py-1.5 text-xs transition-all",
                              custom.iconAlign === a
                                ? "border-gold bg-gold/10 text-gold"
                                : "border-border/40 hover:border-gold/40",
                            )}
                          >
                            {a === "left"
                              ? t("cabinet.guests.alignLeft")
                              : a === "center"
                                ? t("cabinet.guests.alignCenter")
                                : t("cabinet.guests.alignRight")}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Colors */}
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div>
                      <Label className="text-xs">
                        {t("cabinet.guests.fieldBg")}
                      </Label>
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
                      <Label className="text-xs">
                        {t("cabinet.guests.fieldText")}
                      </Label>
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
                      <Label className="text-xs">
                        {t("cabinet.guests.fieldAccent")}
                      </Label>
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
                    <Label className="text-xs">
                      {t("cabinet.guests.fieldFont")}
                    </Label>
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
                        <SelectValue
                          placeholder={t("cabinet.guests.fontDefault")}
                        >
                          {custom.fontHeading
                            ? (() => {
                                const opt = FONT_OPTIONS.find(
                                  (f) => f.value === custom.fontHeading,
                                );
                                return opt ? t(opt.labelKey) : custom.fontHeading;
                              })()
                            : t("cabinet.guests.fontDefault")}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {FONT_OPTIONS.map((f) => (
                          <SelectItem key={f.value} value={f.value}>
                            {t(f.labelKey)}
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
                        onClick={() => setCustom(initialCustom)}
                        className="text-xs"
                      >
                        {t("cabinet.guests.resetTemplate")}
                      </Button>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        {t("cabinet.guests.usingDefaults")}
                      </span>
                    )}
                  </div>
                </div>

                {/* Live preview */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t("cabinet.guests.preview")}
                    </Label>
                    {/* Preview-as selector — pick a real guest (or the
                        demo placeholder) so the host sees how the
                        rendered invitation looks for that person. */}
                    {guests.length > 0 && (
                      <Select
                        value={String(previewGuestId)}
                        onValueChange={(v) =>
                          setPreviewGuestId(
                            v === "demo" ? "demo" : Number(v),
                          )
                        }
                      >
                        <SelectTrigger className="h-7 w-auto gap-1 text-xs">
                          <SelectValue
                            placeholder={t("cabinet.guests.previewAs")}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="demo">
                            {t("cabinet.guests.previewDemo")}
                          </SelectItem>
                          {guests.map((g) => (
                            <SelectItem key={g.id} value={String(g.id)}>
                              {g.fullName} (
                              {t(
                                g.guestType === "couple"
                                  ? "cabinet.guests.typeCoupleLower"
                                  : g.guestType === "family"
                                    ? "cabinet.guests.typeFamilyLower"
                                    : "cabinet.guests.typeSingleLower",
                              )}
                              )
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  {effFont && (
                    <link
                      rel="stylesheet"
                      href={`https://fonts.googleapis.com/css2?family=${encodeURIComponent(
                        effFont,
                      ).replace(/%20/g, "+")}:wght@400;700&display=swap`}
                    />
                  )}
                  <div
                    className="overflow-hidden rounded-xl border-2 border-gold/30 p-8"
                    style={{ background: effBg, color: effText }}
                  >
                    {/* Icon — uploaded image OR emoji glyph, aligned to the
                        host's chosen position with the picked size. */}
                    <div
                      className="mb-2"
                      style={{ textAlign: custom.iconAlign }}
                    >
                      {custom.iconImageUrl ? (
                        <img
                          src={custom.iconImageUrl}
                          alt=""
                          style={{
                            display: "inline-block",
                            width: `${custom.iconSize}px`,
                            height: `${custom.iconSize}px`,
                            objectFit: "contain",
                          }}
                        />
                      ) : (
                        <span
                          style={{
                            color: effAccent,
                            fontSize: `${custom.iconSize}px`,
                            lineHeight: 1,
                          }}
                        >
                          {effIcon}
                        </span>
                      )}
                    </div>
                    {/* Guest name — placeholder when no preview-as picked,
                        otherwise the actual invitee. Same alignment +
                        font as the title so it reads as one block. */}
                    <div
                      className="mb-1 font-medium"
                      style={{
                        fontFamily: effFont ? `"${effFont}", serif` : undefined,
                        fontSize: `${Math.round(custom.titleSize * 0.55)}px`,
                        textAlign: custom.titleAlign,
                        opacity: previewGuest ? 1 : 0.7,
                        fontStyle: previewGuest ? "normal" : "italic",
                      }}
                    >
                      {previewName}
                    </div>
                    {/* Greeting — auto-conjugates singular vs plural; host
                        can override via the "Text de sus" field. */}
                    <div
                      className="mb-1 text-[10px] uppercase tracking-[0.3em]"
                      style={{ color: effAccent, textAlign: custom.titleAlign }}
                    >
                      {effHeader}
                    </div>
                    {/* Big event name — host-controlled size, font, alignment */}
                    <div
                      className="mt-2 font-bold"
                      style={{
                        fontFamily: effFont ? `"${effFont}", serif` : undefined,
                        fontSize: `${custom.titleSize}px`,
                        lineHeight: 1.15,
                        textAlign: custom.titleAlign,
                      }}
                    >
                      {effEventName}
                    </div>
                    <div
                      className="mt-3 text-xs"
                      style={{
                        color: effAccent,
                        opacity: 0.85,
                        textAlign: custom.titleAlign,
                      }}
                    >
                      {plan.eventDate || t("cabinet.guests.fieldEventDate")}
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
              <p className="font-heading font-bold">
                {t("cabinet.guests.sendTitle")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("cabinet.guests.sendSubtitle")}
              </p>
            </div>
          </div>
          <Button
            onClick={openSendDialog}
            className="gap-1.5 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
          >
            <Send className="h-4 w-4" />
            {t("cabinet.guests.configureAndSend")}
          </Button>
        </div>
      )}

      {/* Add guest */}
      <div className="rounded-xl border border-border/40 bg-card p-4">
        <p className="mb-3 text-xs font-medium uppercase text-muted-foreground">
          {t("cabinet.guests.addGuest")}
        </p>

        {/* Row 1 — name + type + (optional) family size */}
        <div className="grid gap-3 md:grid-cols-12">
          <div className="md:col-span-5">
            <Label htmlFor="gname" className="text-xs">
              {t("cabinet.guests.fieldGuestName")}
            </Label>
            <Input
              id="gname"
              className="mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("cabinet.guests.guestNameExample")}
            />
          </div>
          <div className="md:col-span-4">
            <Label className="text-xs">{t("cabinet.guests.fieldType")}</Label>
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
                <SelectValue>{t(GUEST_TYPE_KEYS[guestType])}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">
                  {t("cabinet.guests.optSingle")}
                </SelectItem>
                <SelectItem value="couple">
                  {t("cabinet.guests.optCouple")}
                </SelectItem>
                <SelectItem value="family">
                  {t("cabinet.guests.optFamily")}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {guestType === "family" && (
            <div className="md:col-span-3">
              <Label className="text-xs" htmlFor="famsize">
                {t("cabinet.guests.fieldFamilySize")}
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
            <Label className="text-xs">
              {t("cabinet.guests.fieldChannel")}
            </Label>
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
              {contactChannel === "email"
                ? "Email"
                : t("cabinet.guests.fieldPhoneOrUsername")}
            </Label>
            <Input
              className="mt-1"
              type={contactChannel === "email" ? "email" : "text"}
              value={contactValue}
              onChange={(e) => setContactValue(e.target.value)}
              placeholder={t(CHANNEL_PLACEHOLDER_KEYS[contactChannel])}
            />
          </div>
          <div className="md:col-span-3">
            <Label className="text-xs" htmlFor="kids">
              {t("cabinet.guests.fieldKids")}
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
            {t("cabinet.guests.importExcel")}
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
            {t("common.add")}
          </Button>
        </div>
      </div>

      {/* Table */}
      {guests.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          {t("cabinet.guests.emptyList")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border/40 bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-left">{t("form.name")}</th>
                <th className="p-3 text-left">{t("cabinet.guests.fieldType")}</th>
                <th className="p-3 text-left">{t("cabinet.guests.colContact")}</th>
                <th className="p-3 text-left">{t("cabinet.guests.fieldKids")}</th>
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
                        const gt = (g.guestType ?? "single") as GuestType;
                        if (gt === "single")
                          return t("cabinet.guests.typeSingleShort");
                        if (gt === "couple") return t("cabinet.guests.optCouple");
                        return t("cabinet.guests.familyOfCount", {
                          count: g.partySize ?? 2,
                        });
                      })()}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {(() => {
                        const ch = g.contactChannel as ContactChannel | null;
                        const v =
                          g.contactValue ?? g.email ?? g.phone ?? null;
                        if (!v) return "—";
                        const label = ch
                          ? CHANNEL_LABELS[ch]
                          : t("cabinet.guests.colContact");
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
                    <td className="p-3">
                      {(g.kidsCount ?? 0) > 0
                        ? t("cabinet.guests.kidsCount", { count: g.kidsCount ?? 0 })
                        : "—"}
                    </td>
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
                          <SelectItem value="pending">
                            {t("cabinet.guests.rsvpPending")}
                          </SelectItem>
                          <SelectItem value="accepted">
                            {t("cabinet.guests.rsvpAccepted")}
                          </SelectItem>
                          <SelectItem value="maybe">
                            {t("cabinet.guests.rsvpMaybe")}
                          </SelectItem>
                          <SelectItem value="declined">
                            {t("cabinet.guests.rsvpDeclined")}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => deleteGuest(g)}
                        className="text-muted-foreground transition-colors hover:text-red-500"
                        aria-label={t("common.delete")}
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
            <DialogTitle>{t("cabinet.guests.dialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("cabinet.guests.dialogDescription")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* What this press will actually do. Before the plan was
                linked to one invitation, every press created a new one and
                mailed the whole list again. */}
            {loadingExisting && (
              <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t("cabinet.guests.checkingExisting")}
              </div>
            )}
            {!loadingExisting && existingInv && (
              <div className="rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-sm">
                {t("cabinet.guests.existingInvitationIntro")}
                <strong>
                  {t("cabinet.guests.existingInvitationOnlyUnsent")}
                </strong>
                {pendingInvites.added > 0
                  ? t("cabinet.guests.existingInvitationNewGuests", {
                      added: pendingInvites.added,
                      mailable: pendingInvites.mailable,
                    })
                  : t("cabinet.guests.existingInvitationNoNewGuests")}
              </div>
            )}

            {/* Design picker */}
            <div>
              <Label className="mb-2 block">
                {t("cabinet.guests.designTitle")}
              </Label>
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
                <Label className="text-xs">
                  {t("cabinet.guests.fieldDisplayName")}
                </Label>
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
                  <Label className="text-xs">
                    {t("cabinet.guests.fieldEventDate")}
                  </Label>
                  <div className="mt-1">
                    <ThemedDateInput
                      value={invData.eventDate}
                      onChange={(v) => setInvData((s) => ({ ...s, eventDate: v }))}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">
                    {t("cabinet.guests.fieldRsvpDeadline")}
                  </Label>
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
                  <Label className="text-xs">
                    {t("cabinet.guests.fieldCeremonyTime")}
                  </Label>
                  <div className="mt-1">
                    <TimePicker
                      value={invData.ceremonyTime}
                      onChange={(v) => setInvData((s) => ({ ...s, ceremonyTime: v }))}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">
                    {t("cabinet.guests.fieldReceptionTime")}
                  </Label>
                  <div className="mt-1">
                    <TimePicker
                      value={invData.receptionTime}
                      onChange={(v) => setInvData((s) => ({ ...s, receptionTime: v }))}
                    />
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs">
                  {t("cabinet.guests.fieldCeremonyLocation")}
                </Label>
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
                <Label className="text-xs">
                  {t("cabinet.guests.fieldReceptionLocation")}
                </Label>
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
                <Label className="text-xs">
                  {t("cabinet.guests.fieldMessage")}
                </Label>
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
                <Label className="text-xs">
                  {t("cabinet.guests.fieldDressCode")}
                </Label>
                <Input
                  className="mt-1"
                  value={invData.dressCode}
                  onChange={(e) =>
                    setInvData((s) => ({ ...s, dressCode: e.target.value }))
                  }
                  placeholder={t("cabinet.guests.dressCodeExample")}
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
              {t("common.cancel")}
            </Button>
            <Button
              onClick={createAndSendInvitation}
              // Blocked while the existing invitation is still loading:
              // submitting now would save the plan defaults over whatever
              // the host designed the first time.
              disabled={
                sending ||
                loadingExisting ||
                !invData.eventDate ||
                !invData.coupleNames
              }
              className="gap-1.5 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {t("cabinet.guests.sendInvitations", {
                count: pendingInvites.mailable,
              })}
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
