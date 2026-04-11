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
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";

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
}

export function InvitationDetailClient({ id }: { id: number }) {
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);
  const [newGuestName, setNewGuestName] = useState("");
  const [newGuestEmail, setNewGuestEmail] = useState("");
  const [publishing, setPublishing] = useState(false);

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

  const stats = useMemo(() => {
    const total = guests.length;
    const yes = guests.filter((g) => g.rsvpStatus === "yes").length;
    const no = guests.filter((g) => g.rsvpStatus === "no").length;
    const maybe = guests.filter((g) => g.rsvpStatus === "maybe").length;
    const pending = guests.filter((g) => g.rsvpStatus === "pending").length;
    const plusOnes = guests.filter((g) => g.plusOne).length;
    const responseRate = total > 0 ? ((total - pending) / total) * 100 : 0;
    return { total, yes, no, maybe, pending, plusOnes, responseRate };
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
      toast.success("Invitat adăugat");
    }
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
      toast.success("Invitație publicată!");
    }
    setPublishing(false);
  }

  function copyRsvpLink(token: string | null) {
    if (!token || !invitation) return;
    const url = `${window.location.origin}/i/${invitation.slug}?rsvp=${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiat");
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
          Invitația nu a fost găsită
        </h1>
        <Link
          href="/cabinet/invitatii"
          className="mt-4 inline-flex items-center rounded-lg bg-gold px-4 py-2 text-sm font-medium text-background hover:bg-gold-dark"
        >
          Înapoi la lista
        </Link>
      </div>
    );
  }

  const title =
    invitation.coupleNames || invitation.hostName || "Invitație";

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 lg:px-8">
      <Link
        href="/cabinet/invitatii"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-gold"
      >
        <ArrowLeft className="h-3 w-3" /> Înapoi
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
            <Link
              href={`/i/${invitation.slug}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 rounded-lg border border-border/60 px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              <ExternalLink className="h-3 w-3" /> Previzualizare
            </Link>
          )}
          {invitation.status === "draft" && (
            <Button
              onClick={publish}
              disabled={publishing}
              className="gap-1 bg-gold text-background hover:bg-gold-dark"
            >
              {publishing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : null}
              Publică
            </Button>
          )}
        </div>
      </div>

      {/* RSVP stats */}
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Confirmat"
          value={stats.yes}
          icon={Check}
          color="text-success"
        />
        <StatCard
          label="Refuzat"
          value={stats.no}
          icon={X}
          color="text-destructive"
        />
        <StatCard
          label="Poate"
          value={stats.maybe}
          icon={HelpCircle}
          color="text-warning"
        />
        <StatCard
          label="În așteptare"
          value={stats.pending}
          icon={Clock}
          color="text-muted-foreground"
        />
      </div>

      <Card className="mt-6">
        <CardContent className="p-5">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Rata de răspuns</span>
            <span className="font-medium">
              {stats.responseRate.toFixed(0)}% ({stats.total - stats.pending} / {stats.total})
            </span>
          </div>
          <Progress value={stats.responseRate} className="h-2" />
          <p className="mt-3 text-xs text-muted-foreground">
            Total așteptat: <strong>{stats.yes + stats.plusOnes}</strong>{" "}
            persoane (confirmați + însoțitori)
          </p>
        </CardContent>
      </Card>

      {/* Guests management */}
      <Card className="mt-6" id="guests">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4" /> Invitați ({guests.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <Input
              placeholder="Nume invitat"
              value={newGuestName}
              onChange={(e) => setNewGuestName(e.target.value)}
            />
            <Input
              placeholder="Email (opțional)"
              value={newGuestEmail}
              onChange={(e) => setNewGuestEmail(e.target.value)}
            />
            <Button
              onClick={addGuest}
              disabled={!newGuestName.trim()}
              className="gap-1 bg-gold text-background hover:bg-gold-dark"
            >
              <Plus className="h-4 w-4" /> Adaugă
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
                    <Copy className="h-3 w-3" /> Link RSVP
                  </Button>
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
  const map = {
    yes: { label: "Da", cls: "bg-success/15 text-success" },
    no: { label: "Nu", cls: "bg-destructive/15 text-destructive" },
    maybe: { label: "Poate", cls: "bg-warning/15 text-warning" },
    pending: { label: "—", cls: "bg-muted text-muted-foreground" },
  };
  const s = map[status];
  return <Badge className={s.cls}>{s.label}</Badge>;
}
