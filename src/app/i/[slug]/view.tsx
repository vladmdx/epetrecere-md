"use client";

import { useState } from "react";
import Link from "next/link";
import { Heart, Calendar, MapPin, Clock, Check, X, HelpCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

interface Invitation {
  id: number;
  slug: string;
  eventType: string | null;
  coupleNames: string | null;
  hostName: string | null;
  eventDate: string | null;
  ceremonyTime: string | null;
  receptionTime: string | null;
  ceremonyLocation: string | null;
  receptionLocation: string | null;
  message: string | null;
  dressCode: string | null;
  rsvpDeadline: string | null;
  allowPlusOne: boolean;
  coverImageUrl: string | null;
}

interface Guest {
  id: number;
  name: string;
  rsvpStatus: "pending" | "yes" | "no" | "maybe";
  plusOne: boolean;
  plusOneName: string | null;
  dietaryNotes: string | null;
  message: string | null;
  rsvpToken: string | null;
}

export function PublicInvitationView({
  invitation,
  guest,
}: {
  invitation: Invitation;
  guest: Guest | null;
}) {
  const [rsvpStatus, setRsvpStatus] = useState<Guest["rsvpStatus"]>(
    guest?.rsvpStatus ?? "pending",
  );
  const [plusOne, setPlusOne] = useState(guest?.plusOne ?? false);
  const [plusOneName, setPlusOneName] = useState(guest?.plusOneName ?? "");
  const [dietaryNotes, setDietaryNotes] = useState(guest?.dietaryNotes ?? "");
  const [message, setMessage] = useState(guest?.message ?? "");
  const [submitted, setSubmitted] = useState(
    guest?.rsvpStatus && guest.rsvpStatus !== "pending",
  );
  const [loading, setLoading] = useState(false);

  const title =
    invitation.coupleNames || invitation.hostName || "Invitație";

  async function submitRsvp(status: "yes" | "no" | "maybe") {
    if (!guest?.rsvpToken) {
      alert(
        "Pentru a răspunde ai nevoie de link-ul personal trimis de gazdă.",
      );
      return;
    }
    setLoading(true);
    const res = await fetch("/api/rsvp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: guest.rsvpToken,
        status,
        plusOne,
        plusOneName,
        dietaryNotes,
        message,
      }),
    });
    setLoading(false);
    if (res.ok) {
      setRsvpStatus(status);
      setSubmitted(true);
    } else {
      alert("Eroare la salvare. Încearcă din nou.");
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-gold/5">
      {/* Hero */}
      <section className="relative overflow-hidden">
        {invitation.coverImageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={invitation.coverImageUrl}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover opacity-30"
          />
        ) : null}
        <div className="relative mx-auto max-w-3xl px-4 py-20 text-center lg:px-8">
          <Sparkles className="mx-auto h-10 w-10 text-gold" />
          <p className="mt-4 text-sm font-medium uppercase tracking-[4px] text-gold">
            Ești invitat
          </p>
          <h1 className="mt-4 font-heading text-4xl font-bold md:text-6xl">
            {title}
          </h1>
          {invitation.eventDate && (
            <p className="mt-4 font-accent text-lg text-muted-foreground">
              {new Date(invitation.eventDate).toLocaleDateString("ro-RO", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          )}
        </div>
      </section>

      {/* Message */}
      {invitation.message && (
        <section className="mx-auto max-w-2xl px-4 py-10 text-center lg:px-8">
          <Heart className="mx-auto h-6 w-6 text-gold" />
          <p className="mt-4 text-lg italic text-muted-foreground">
            {invitation.message}
          </p>
        </section>
      )}

      {/* Details */}
      <section className="mx-auto max-w-3xl px-4 py-10 lg:px-8">
        <div className="grid gap-5 md:grid-cols-2">
          {invitation.ceremonyLocation && (
            <DetailCard
              icon={MapPin}
              title="Ceremonia"
              lines={[
                invitation.ceremonyLocation,
                invitation.ceremonyTime ? `Ora ${invitation.ceremonyTime}` : null,
              ]}
            />
          )}
          {invitation.receptionLocation && (
            <DetailCard
              icon={MapPin}
              title="Petrecerea"
              lines={[
                invitation.receptionLocation,
                invitation.receptionTime
                  ? `Ora ${invitation.receptionTime}`
                  : null,
              ]}
            />
          )}
          {invitation.dressCode && (
            <DetailCard
              icon={Sparkles}
              title="Cod vestimentar"
              lines={[invitation.dressCode]}
            />
          )}
          {invitation.rsvpDeadline && (
            <DetailCard
              icon={Calendar}
              title="Confirmă până pe"
              lines={[
                new Date(invitation.rsvpDeadline).toLocaleDateString("ro-RO", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                }),
              ]}
            />
          )}
        </div>
      </section>

      {/* RSVP */}
      <section className="mx-auto max-w-2xl px-4 py-10 lg:px-8">
        <div className="rounded-2xl border border-gold/30 bg-card p-6 shadow-lg md:p-8">
          <div className="text-center">
            <h2 className="font-heading text-2xl font-bold">
              Confirmă prezența
            </h2>
            {guest ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Salut, <strong>{guest.name}</strong>! Te rugăm să îți confirmi
                prezența.
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Pentru a răspunde ai nevoie de link-ul personal trimis de
                gazdă.
              </p>
            )}
          </div>

          {submitted ? (
            <div className="mt-6 rounded-xl border border-success/30 bg-success/10 p-5 text-center">
              <Check className="mx-auto h-8 w-8 text-success" />
              <p className="mt-2 font-medium">
                Răspunsul tău a fost înregistrat:{" "}
                <strong>
                  {rsvpStatus === "yes"
                    ? "Da, voi participa"
                    : rsvpStatus === "no"
                      ? "Nu pot participa"
                      : "Poate voi participa"}
                </strong>
              </p>
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                className="mt-3 text-xs text-muted-foreground underline"
              >
                Schimbă răspunsul
              </button>
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <RsvpButton
                  active={rsvpStatus === "yes"}
                  onClick={() => setRsvpStatus("yes")}
                  icon={Check}
                  label="Da, vin"
                  color="success"
                  disabled={!guest}
                />
                <RsvpButton
                  active={rsvpStatus === "maybe"}
                  onClick={() => setRsvpStatus("maybe")}
                  icon={HelpCircle}
                  label="Poate"
                  color="warning"
                  disabled={!guest}
                />
                <RsvpButton
                  active={rsvpStatus === "no"}
                  onClick={() => setRsvpStatus("no")}
                  icon={X}
                  label="Nu pot"
                  color="destructive"
                  disabled={!guest}
                />
              </div>

              {rsvpStatus === "yes" && invitation.allowPlusOne && guest && (
                <div className="mt-6 space-y-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={plusOne}
                      onChange={(e) => setPlusOne(e.target.checked)}
                      className="h-4 w-4 accent-gold"
                    />
                    Voi veni cu un însoțitor
                  </label>
                  {plusOne && (
                    <Input
                      placeholder="Numele însoțitorului"
                      value={plusOneName}
                      onChange={(e) => setPlusOneName(e.target.value)}
                    />
                  )}
                  <Textarea
                    placeholder="Alergii / restricții alimentare (opțional)"
                    value={dietaryNotes}
                    onChange={(e) => setDietaryNotes(e.target.value)}
                    rows={2}
                  />
                </div>
              )}

              <Textarea
                placeholder="Mesaj pentru gazdă (opțional)"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                className="mt-4"
              />

              <Button
                onClick={() =>
                  rsvpStatus !== "pending" && submitRsvp(rsvpStatus as "yes" | "no" | "maybe")
                }
                disabled={
                  !guest || rsvpStatus === "pending" || loading
                }
                className="mt-6 w-full bg-gold text-background hover:bg-gold-dark"
              >
                {loading ? "Se salvează..." : "Trimite răspunsul"}
              </Button>
            </>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 text-center text-xs text-muted-foreground">
        Invitație creată cu{" "}
        <Link
          href="/cabinet/invitatii/nou"
          className="text-gold hover:underline"
        >
          ePetrecere.md
        </Link>
      </footer>
    </div>
  );
}

function DetailCard({
  icon: Icon,
  title,
  lines,
}: {
  icon: typeof MapPin;
  title: string;
  lines: (string | null)[];
}) {
  return (
    <div className="rounded-xl border border-border/40 bg-card p-5">
      <div className="flex items-center gap-2 text-sm font-medium text-gold">
        <Icon className="h-4 w-4" /> {title}
      </div>
      <div className="mt-2 space-y-0.5 text-sm">
        {lines.filter(Boolean).map((line, i) => (
          <p key={i} className="text-foreground">
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}

function RsvpButton({
  active,
  onClick,
  icon: Icon,
  label,
  color,
  disabled,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Check;
  label: string;
  color: "success" | "warning" | "destructive";
  disabled: boolean;
}) {
  const activeStyles = {
    success: "border-success bg-success/15 text-success",
    warning: "border-warning bg-warning/15 text-warning",
    destructive: "border-destructive bg-destructive/15 text-destructive",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition-all disabled:opacity-50 ${
        active
          ? activeStyles[color]
          : "border-border/40 bg-card hover:border-gold/30"
      }`}
    >
      <Icon className="h-5 w-5" />
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}
