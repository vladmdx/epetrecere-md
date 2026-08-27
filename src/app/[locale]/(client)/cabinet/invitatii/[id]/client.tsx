"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Clock,
  X,
  HelpCircle,
  Users,
  Plus,
  Copy,
  ExternalLink,
  Loader2,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useLocale } from "@/hooks/use-locale";

interface Invitation {
  id: number;
  slug: string;
  status: "draft" | "published" | "closed";
  eventType: string | null;
  coupleNames: string | null;
  hostName: string | null;
  eventDate: string | null;
  ceremonyLocation: string | null;
  receptionLocation: string | null;
  rsvpDeadline: string | null;
  message: string | null;
  allowPlusOne: boolean;
}

interface Guest {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  group: string | null;
  rsvpStatus: "pending" | "yes" | "no" | "maybe";
  plusOne: boolean;
  plusOneName: string | null;
  dietaryNotes: string | null;
  message: string | null;
  rsvpToken: string | null;
  respondedAt: string | null;
  /** NULL = this guest has never been mailed. The bulk send targets only
   *  these; everyone else is re-reached one at a time, on purpose. */
  invitationSentAt: string | null;
}

export function InvitationDetailClient({ id }: { id: number }) {
  const { t } = useLocale();
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [newGuestName, setNewGuestName] = useState("");
  const [newGuestEmail, setNewGuestEmail] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [sending, setSending] = useState(false);
  /** Which single guest is being deliberately re-mailed right now. */
  const [resendingId, setResendingId] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/invitations/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => {
        if (res) {
          setInvitation(res.invitation);
          setGuests(res.guests);
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  /** Re-read after any send so the per-guest "sent" stamps are the
   *  server's truth rather than an optimistic guess. */
  async function refreshGuests() {
    const res = await fetch(`/api/invitations/${id}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data?.guests) setGuests(data.guests);
  }

  const stats = useMemo(() => {
    const total = guests.length;
    const yes = guests.filter((g) => g.rsvpStatus === "yes").length;
    const no = guests.filter((g) => g.rsvpStatus === "no").length;
    const maybe = guests.filter((g) => g.rsvpStatus === "maybe").length;
    const pending = guests.filter((g) => g.rsvpStatus === "pending").length;
    const plusOnes = guests.filter((g) => g.plusOne).length;
    const responseRate = total > 0 ? ((total - pending) / total) * 100 : 0;
    /** What the bulk Send button will actually do. */
    const unsent = guests.filter((g) => g.email && !g.invitationSentAt).length;
    return { total, yes, no, maybe, pending, plusOnes, responseRate, unsent };
  }, [guests]);

  async function addGuest() {
    if (!newGuestName.trim()) return;
    const res = await fetch(`/api/invitations/${id}/guests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newGuestName, email: newGuestEmail }),
    });
    if (res.ok) {
      const created = await res.json();
      setGuests((prev) => [...prev, created]);
      setNewGuestName("");
      setNewGuestEmail("");
      toast.success(t("cabinet.invitation.guestAdded"));
      return;
    }
    // Was silent on failure, which hid both the missing-contact rule and
    // the duplicate-email guard — the host just saw nothing happen.
    const err = await res.json().catch(() => ({}));
    // TODO i18n: cabinet.invitation.guestAddFailed
    toast.error(err.error || "Invitatul nu a putut fi adăugat.");
  }

  async function publish() {
    setPublishing(true);
    const res = await fetch(`/api/invitations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "published" }),
    });
    if (res.ok) {
      const updated = await res.json();
      setInvitation(updated);
      toast.success(t("cabinet.invitation.published"));
    }
    setPublishing(false);
  }

  /** Bulk send — only reaches guests who don't have the invitation yet.
   *  It used to mail everyone with an address on every press, so adding
   *  one guest re-spammed the whole list. */
  async function sendInvitations() {
    const guestsWithEmail = guests.filter((g) => g.email);
    if (guestsWithEmail.length === 0) {
      toast.error(t("cabinet.invitation.noGuestEmail"));
      return;
    }
    const unsent = guestsWithEmail.filter((g) => !g.invitationSentAt);
    if (unsent.length === 0) {
      // TODO i18n: cabinet.invitation.allAlreadySent
      toast.info(
        "Toți invitații cu email au primit deja invitația. Folosește butonul „Retrimite” din dreptul unei persoane pentru a i-o trimite din nou.",
      );
      return;
    }
    if (!confirm(t("cabinet.invitation.sendConfirm", { count: unsent.length }))) return;
    setSending(true);
    try {
      const res = await fetch(`/api/invitations/${id}/send`, {
        method: "POST",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("cabinet.invitation.sendError"));
      }
      const data = await res.json();
      // Say what actually happened. Claiming the whole list was mailed is
      // what hid this bug from the host in the first place.
      // TODO i18n: cabinet.invitation.sendReport / sendReportSkipped / sendReportFailed
      const parts = [`Trimise: ${data.sent}`];
      if (data.skipped > 0) parts.push(`${data.skipped} au primit-o deja`);
      if (data.failed > 0) parts.push(`${data.failed} eșuate`);
      toast.success(parts.join(" · "));
      await refreshGuests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("cabinet.invitation.sendError"));
    } finally {
      setSending(false);
    }
  }

  /** Deliberate one-person re-send. Without this the only way to re-reach
   *  someone was the all-guests button, which is how everybody ended up
   *  with duplicates. */
  async function resendTo(guest: Guest) {
    if (!guest.email) return;
    // TODO i18n: cabinet.invitation.resendConfirm
    if (!confirm(`Trimiți din nou invitația către ${guest.name} (${guest.email})?`)) {
      return;
    }
    setResendingId(guest.id);
    try {
      const res = await fetch(`/api/invitations/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guestIds: [guest.id], resend: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || t("cabinet.invitation.sendError"));
      }
      const data = await res.json();
      if (data.sent > 0) {
        // TODO i18n: cabinet.invitation.resendSuccess
        toast.success(`Invitația a fost trimisă din nou către ${guest.name}.`);
      } else {
        toast.error(t("cabinet.invitation.sendError"));
      }
      await refreshGuests();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("cabinet.invitation.sendError"));
    } finally {
      setResendingId(null);
    }
  }

  function copyRsvpLink(token: string | null) {
    if (!token || !invitation) return;
    const url = `${window.location.origin}/i/${invitation.slug}?rsvp=${token}`;
    navigator.clipboard.writeText(url);
    toast.success(t("cabinet.invitation.linkCopied"));
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 text-center lg:px-8">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (!invitation) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center lg:px-8">
        <h1 className="font-heading text-2xl font-bold">
          {t("cabinet.invitation.notFound")}
        </h1>
        <Link
          href="/cabinet/invitatii"
          className="mt-4 inline-flex items-center rounded-lg bg-gold px-4 py-2 text-sm font-medium text-[#0D0D0D] hover:bg-gold-dark"
        >
          {t("cabinet.invitation.backToList")}
        </Link>
      </div>
    );
  }

  const title =
    invitation.coupleNames || invitation.hostName || t("cabinet.invitation.fallbackTitle");

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 lg:px-8">
      <Link
        href="/cabinet/invitatii"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-gold"
      >
        <ArrowLeft className="h-3 w-3" /> {t("cabinet.invitation.back")}
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold md:text-3xl">
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {invitation.eventDate} · {invitation.ceremonyLocation}
          </p>
        </div>
        <div className="flex gap-2">
          {invitation.status === "published" && (
            <>
              <Link
                href={`/i/${invitation.slug}`}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-4 py-2 text-sm font-medium hover:bg-muted"
              >
                <ExternalLink className="h-3 w-3" /> {t("cabinet.invitation.preview")}
              </Link>
              <Link
                href={`/cabinet/invitatii/${invitation.id}/checkin`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/15"
              >
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                {t("cabinet.invitation.checkinLive")}
              </Link>
              <Button
                onClick={sendInvitations}
                disabled={sending}
                className="gap-1.5 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                {t("cabinet.invitation.sendInvitations")}
              </Button>
            </>
          )}
          {invitation.status === "draft" && (
            <Button
              onClick={publish}
              disabled={publishing}
              className="gap-1 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
            >
              {publishing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : null}
              {t("cabinet.invitation.publish")}
            </Button>
          )}
        </div>
      </div>

      {/* RSVP stats */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={t("cabinet.invitation.statConfirmed")}
          value={stats.yes}
          icon={Check}
          color="text-success"
        />
        <StatCard
          label={t("cabinet.invitation.statRejected")}
          value={stats.no}
          icon={X}
          color="text-destructive"
        />
        <StatCard
          label={t("cabinet.invitation.statMaybe")}
          value={stats.maybe}
          icon={HelpCircle}
          color="text-warning"
        />
        <StatCard
          label={t("cabinet.invitation.statPending")}
          value={stats.pending}
          icon={Clock}
          color="text-muted-foreground"
        />
      </div>

      <Card className="mt-6">
        <CardContent className="p-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t("cabinet.invitation.responseRate")}</span>
            <span className="font-medium">
              {stats.responseRate.toFixed(0)}% ({stats.total - stats.pending} / {stats.total})
            </span>
          </div>
          <Progress value={stats.responseRate} className="h-2" />
          <p className="mt-3 text-xs text-muted-foreground">
            {t("cabinet.invitation.totalExpected")} <strong>{stats.yes + stats.plusOnes}</strong>{" "}
            {t("cabinet.invitation.totalExpectedSuffix")}
          </p>
        </CardContent>
      </Card>

      {/* Guests management */}
      <Card className="mt-6" id="guests">
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <Users className="h-4 w-4" /> {t("cabinet.invitation.guestsHeading", { count: guests.length })}
            {invitation.status === "published" && stats.unsent > 0 && (
              <Badge variant="outline" className="text-xs font-normal">
                {/* TODO i18n: cabinet.invitation.unsentCount */}
                {stats.unsent} încă nu au primit invitația
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input
              placeholder={t("cabinet.invitation.guestNamePlaceholder")}
              value={newGuestName}
              onChange={(e) => setNewGuestName(e.target.value)}
            />
            <Input
              placeholder={t("cabinet.invitation.guestEmailPlaceholder")}
              value={newGuestEmail}
              onChange={(e) => setNewGuestEmail(e.target.value)}
            />
            <Button
              onClick={addGuest}
              disabled={!newGuestName.trim()}
              className="gap-1 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
            >
              <Plus className="h-4 w-4" /> {t("cabinet.invitation.add")}
            </Button>
          </div>

          {guests.length > 0 && (
            <div className="mt-5 divide-y divide-border/40 rounded-lg border border-border/40">
              {guests.map((g) => (
                <div
                  key={g.id}
                  className="flex flex-wrap items-center gap-3 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{g.name}</div>
                    {g.email && (
                      <div className="text-xs text-muted-foreground">
                        {g.email}
                      </div>
                    )}
                    {g.message && (
                      <div className="mt-1 text-xs italic text-muted-foreground">
                        &ldquo;{g.message}&rdquo;
                      </div>
                    )}
                  </div>
                  {g.email &&
                    (g.invitationSentAt ? (
                      <Badge
                        variant="secondary"
                        className="gap-1 text-xs font-normal"
                      >
                        <Check className="h-3 w-3" />
                        {/* TODO i18n: cabinet.invitation.deliverySent */}
                        Trimisă{" "}
                        {new Date(g.invitationSentAt).toLocaleDateString(
                          "ro-RO",
                          { day: "numeric", month: "short" },
                        )}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="gap-1 text-xs font-normal text-muted-foreground"
                      >
                        <Clock className="h-3 w-3" />
                        {/* TODO i18n: cabinet.invitation.deliveryPending */}
                        Netrimisă
                      </Badge>
                    ))}
                  <RsvpBadge status={g.rsvpStatus} />
                  {g.plusOne && (
                    <Badge variant="secondary" className="text-xs">
                      +1
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyRsvpLink(g.rsvpToken)}
                    className="gap-1"
                  >
                    <Copy className="h-3 w-3" /> {t("cabinet.invitation.rsvpLink")}
                  </Button>
                  {invitation.status === "published" && g.email && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => resendTo(g)}
                      disabled={resendingId !== null}
                      className="gap-1"
                    >
                      {resendingId === g.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Send className="h-3 w-3" />
                      )}
                      {/* TODO i18n: cabinet.invitation.resend / cabinet.invitation.sendToGuest */}
                      {g.invitationSentAt ? "Retrimite" : "Trimite"}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: number;
  icon: typeof Check;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <Icon className={`h-4 w-4 ${color}`} />
        </div>
        <div className="mt-2 font-accent text-3xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function RsvpBadge({ status }: { status: Guest["rsvpStatus"] }) {
  const { t } = useLocale();
  const map = {
    yes: { labelKey: "cabinet.invitation.rsvp.yes", cls: "bg-success/15 text-success" },
    no: { labelKey: "cabinet.invitation.rsvp.no", cls: "bg-destructive/15 text-destructive" },
    maybe: { labelKey: "cabinet.invitation.rsvp.maybe", cls: "bg-warning/15 text-warning" },
    pending: { labelKey: "cabinet.invitation.rsvp.pending", cls: "bg-muted text-muted-foreground" },
  };
  const s = map[status];
  return <Badge className={s.cls}>{t(s.labelKey)}</Badge>;
}
