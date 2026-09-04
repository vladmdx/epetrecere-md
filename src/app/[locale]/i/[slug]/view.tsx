"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, Calendar, MapPin, Check, X, HelpCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { getInvitationDesign, googleFontsUrl } from "@/lib/invitations/templates";
import { useLocale } from "@/hooks/use-locale";

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
  customColors?: { designId?: string } | null;
}

interface Guest {
  id: number;
  name: string;
  rsvpStatus: "pending" | "yes" | "no" | "maybe";
  plusOne: boolean;
  plusOneName: string | null;
  dietaryNotes: string | null;
  dietaryConsentAt: string | Date | null;
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
  const { t } = useLocale();
  const [rsvpStatus, setRsvpStatus] = useState<Guest["rsvpStatus"]>(
    guest?.rsvpStatus ?? "pending",
  );
  const [plusOne, setPlusOne] = useState(guest?.plusOne ?? false);
  const [plusOneName, setPlusOneName] = useState(guest?.plusOneName ?? "");
  const [dietaryNotes, setDietaryNotes] = useState(guest?.dietaryNotes ?? "");
  const [dietaryConsent, setDietaryConsent] = useState(
    Boolean(guest?.dietaryConsentAt),
  );
  const [message, setMessage] = useState(guest?.message ?? "");
  const [submitted, setSubmitted] = useState(
    guest?.rsvpStatus && guest.rsvpStatus !== "pending",
  );
  const [loading, setLoading] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const title =
    invitation.coupleNames || invitation.hostName || t("invite.fallbackTitle");

  const design = getInvitationDesign(invitation.customColors?.designId);

  // Inject Google Fonts for the selected design
  useEffect(() => {
    const fontsUrl = googleFontsUrl(design);
    if (!fontsUrl) return;
    const id = `invitation-font-${design.id}`;
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = fontsUrl;
    document.head.appendChild(link);
  }, [design]);

  const decorations: Record<string, string> = {
    sparkles: "✦",
    flowers: "❀",
    minimal: "—",
    ornate: "❦",
  };
  const decor = decorations[design.decorStyle] || "✦";

  async function submitRsvp(status: "yes" | "no" | "maybe") {
    if (!guest?.rsvpToken) {
      alert(t("invite.view.needPersonalLink"));
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
        dietaryConsent,
        message,
      }),
    });
    setLoading(false);
    if (res.ok) {
      setRsvpStatus(status);
      setSubmitted(true);
    } else {
      const payload = await res.json().catch(() => null);
      alert(payload?.error || t("invite.view.saveError"));
    }
  }

  async function deleteMyGuestData() {
    if (!guest?.rsvpToken || !confirm(t("invite.view.deleteConfirm"))) return;
    setLoading(true);
    const res = await fetch("/api/rsvp", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: guest.rsvpToken }),
    });
    setLoading(false);
    if (res.ok) {
      setDeleted(true);
    } else {
      const payload = await res.json().catch(() => null);
      alert(payload?.error || t("invite.view.deleteError"));
    }
  }

  return (
    <div
      className="min-h-screen"
      style={{
        ...(design.cssVars as React.CSSProperties),
        background: "var(--inv-bg)",
        color: "var(--inv-text)",
        fontFamily: design.fontFamily
          ? `"${design.fontFamily}", serif`
          : undefined,
      }}
    >
      {/* Hero */}
      <section className="relative overflow-hidden">
        {invitation.coverImageUrl ? (

          <img
            src={invitation.coverImageUrl}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover opacity-30"
          />
        ) : null}
        <div className="relative mx-auto max-w-3xl px-4 py-20 text-center lg:px-8">
          <div
            className="text-4xl"
            style={{ color: "var(--inv-accent)" }}
          >
            {decor}
          </div>
          <p
            className="mt-4 text-sm font-medium uppercase tracking-[4px]"
            style={{ color: "var(--inv-accent)" }}
          >
            {t("invite.view.youAreInvited")}
          </p>
          <h1
            className="mt-4 text-4xl font-bold md:text-6xl"
            style={{
              fontFamily: design.fontHeading
                ? `"${design.fontHeading}", serif`
                : undefined,
              color: "var(--inv-text)",
            }}
          >
            {title}
          </h1>
          {invitation.eventDate && (
            <p
              className="mt-4 text-lg italic"
              style={{ color: "var(--inv-muted)" }}
            >
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
              title={t("invite.view.ceremony")}
              lines={[
                invitation.ceremonyLocation,
                invitation.ceremonyTime
                  ? t("invite.view.atHour", { time: invitation.ceremonyTime })
                  : null,
              ]}
            />
          )}
          {invitation.receptionLocation && (
            <DetailCard
              icon={MapPin}
              title={t("invite.view.reception")}
              lines={[
                invitation.receptionLocation,
                invitation.receptionTime
                  ? t("invite.view.atHour", { time: invitation.receptionTime })
                  : null,
              ]}
            />
          )}
          {invitation.dressCode && (
            <DetailCard
              icon={Sparkles}
              title={t("invite.view.dressCode")}
              lines={[invitation.dressCode]}
            />
          )}
          {invitation.rsvpDeadline && (
            <DetailCard
              icon={Calendar}
              title={t("invite.view.rsvpBy")}
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
        {deleted ? (
          <div className="rounded-2xl border border-success/30 bg-success/10 p-8 text-center">
            <Check className="mx-auto h-8 w-8 text-success" />
            <p className="mt-3 font-medium">{t("invite.view.deleted")}</p>
          </div>
        ) : (
        <div className="rounded-2xl border border-gold/30 bg-card p-6 shadow-lg md:p-8">
          <div className="text-center">
            <h2 className="font-heading text-2xl font-bold">
              {t("invite.view.confirmAttendance")}
            </h2>
            {guest ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {t("invite.view.greeting")} <strong>{guest.name}</strong>
                {t("invite.view.greetingSuffix")}
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {t("invite.view.needPersonalLink")}
              </p>
            )}
          </div>

          {submitted ? (
            <div className="mt-6 rounded-xl border border-success/30 bg-success/10 p-5 text-center">
              <Check className="mx-auto h-8 w-8 text-success" />
              <p className="mt-2 font-medium">
                {t("invite.view.answerRecorded")}{" "}
                <strong>
                  {rsvpStatus === "yes"
                    ? t("invite.view.answerYes")
                    : rsvpStatus === "no"
                      ? t("invite.view.answerNo")
                      : t("invite.view.answerMaybe")}
                </strong>
              </p>
              <button
                type="button"
                onClick={() => setSubmitted(false)}
                className="mt-3 text-xs text-muted-foreground underline"
              >
                {t("invite.view.changeAnswer")}
              </button>
            </div>
          ) : (
            <>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <RsvpButton
                  active={rsvpStatus === "yes"}
                  onClick={() => setRsvpStatus("yes")}
                  icon={Check}
                  label={t("invite.view.btnYes")}
                  color="success"
                  disabled={!guest}
                />
                <RsvpButton
                  active={rsvpStatus === "maybe"}
                  onClick={() => setRsvpStatus("maybe")}
                  icon={HelpCircle}
                  label={t("invite.view.btnMaybe")}
                  color="warning"
                  disabled={!guest}
                />
                <RsvpButton
                  active={rsvpStatus === "no"}
                  onClick={() => setRsvpStatus("no")}
                  icon={X}
                  label={t("invite.view.btnNo")}
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
                    {t("invite.view.plusOneLabel")}
                  </label>
                  {plusOne && (
                    <Input
                      placeholder={t("invite.view.plusOneNamePlaceholder")}
                      value={plusOneName}
                      onChange={(e) => setPlusOneName(e.target.value)}
                    />
                  )}
                  <Textarea
                    placeholder={t("invite.view.dietaryPlaceholder")}
                    value={dietaryNotes}
                    onChange={(e) => setDietaryNotes(e.target.value)}
                    rows={2}
                  />
                  {dietaryNotes.trim() && (
                    <label className="flex items-start gap-2 rounded-lg border border-gold/25 bg-gold/5 p-3 text-xs leading-relaxed">
                      <input
                        type="checkbox"
                        checked={dietaryConsent}
                        onChange={(e) => setDietaryConsent(e.target.checked)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-gold"
                      />
                      <span>{t("invite.view.dietaryConsent")}</span>
                    </label>
                  )}
                </div>
              )}

              <Textarea
                placeholder={t("invite.view.messagePlaceholder")}
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
                  !guest ||
                  rsvpStatus === "pending" ||
                  loading ||
                  (Boolean(dietaryNotes.trim()) && !dietaryConsent)
                }
                className="mt-6 w-full bg-gold text-[#0D0D0D] hover:bg-gold-dark"
              >
                {loading ? t("invite.view.saving") : t("invite.view.submit")}
              </Button>
            </>
          )}
        </div>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-8 text-center text-xs text-muted-foreground">
        <p className="mx-auto mb-3 max-w-2xl px-4">
          {t("invite.view.privacyNotice")} {" "}
          <Link href="/confidentialitate#liste-invitati" className="text-gold underline">
            {t("invite.view.privacyLink")}
          </Link>
        </p>
        {guest && !deleted && (
          <button
            type="button"
            onClick={deleteMyGuestData}
            disabled={loading}
            className="mb-3 text-xs text-muted-foreground underline hover:text-destructive"
          >
            {t("invite.view.deleteMyData")}
          </button>
        )}
        <br />
        {t("invite.view.createdWith")}{" "}
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
