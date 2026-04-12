"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "@/hooks/use-locale";
import { MapPin, Phone, Mail, Clock, Loader2, CheckCircle } from "lucide-react";

export function ContactPageClient() {
  const { t } = useLocale();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
      <div className="mb-10 text-center">
        <h1 className="font-heading text-3xl font-bold md:text-4xl">{t("nav.contact")}</h1>
        <p className="mt-2 text-muted-foreground">
          Contactează-ne pentru orice întrebare legată de serviciile noastre
        </p>
      </div>

      <div className="grid gap-12 lg:grid-cols-2">
        {/* Contact Info */}
        <div className="space-y-8">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold/10 text-gold">
              <MapPin className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-heading font-bold">Adresă</h3>
              <p className="text-sm text-muted-foreground">Chișinău, Republica Moldova</p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold/10 text-gold">
              <Phone className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-heading font-bold">{t("form.phone")}</h3>
              <p className="text-sm text-muted-foreground">{process.env.NEXT_PUBLIC_CONTACT_PHONE || "+373 60 123 456"}</p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold/10 text-gold">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-heading font-bold">{t("form.email")}</h3>
              <p className="text-sm text-muted-foreground">info@epetrecere.md</p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gold/10 text-gold">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-heading font-bold">Program</h3>
              <p className="text-sm text-muted-foreground">Luni — Vineri: 09:00 – 18:00</p>
              <p className="text-sm text-muted-foreground">Sâmbătă: 10:00 – 14:00</p>
            </div>
          </div>
        </div>

        {/* Contact Form */}
        {submitted ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-border/40 bg-card p-12 text-center">
            <CheckCircle className="h-12 w-12 text-green-500" />
            <h3 className="font-heading text-lg font-bold">Mesajul a fost trimis!</h3>
            <p className="text-sm text-muted-foreground">
              Te vom contacta in cel mai scurt timp posibil.
            </p>
          </div>
        ) : (
          <form
            className="space-y-4 rounded-xl border border-border/40 bg-card p-6"
            onSubmit={async (e) => {
              e.preventDefault();
              setSubmitting(true);
              setFormError(null);
              const fd = new FormData(e.currentTarget);
              try {
                const res = await fetch("/api/leads", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name: fd.get("name"),
                    phone: fd.get("phone"),
                    email: fd.get("email") || undefined,
                    message: fd.get("message"),
                    source: "contact_page",
                    eventType: "other",
                  }),
                });
                if (!res.ok) {
                  throw new Error("Eroare la trimiterea mesajului");
                }
                setSubmitted(true);
              } catch {
                setFormError("Nu am putut trimite mesajul. Încercați din nou sau contactați-ne telefonic.");
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="name">{t("form.name")} *</Label>
                <Input id="name" name="name" required />
              </div>
              <div>
                <Label htmlFor="phone">{t("form.phone")} *</Label>
                <Input id="phone" name="phone" type="tel" required pattern="^(\+?373|0)\s?\d{2}\s?\d{3}\s?\d{3}$" title="Format: +373 XX XXX XXX sau 0XX XXX XXX" />
              </div>
            </div>
            <div>
              <Label htmlFor="email">{t("form.email")}</Label>
              <Input id="email" name="email" type="email" />
            </div>
            <div>
              <Label htmlFor="message">{t("form.message")} *</Label>
              <Textarea id="message" name="message" rows={5} required />
            </div>
            {formError && (
              <p className="text-sm text-destructive">{formError}</p>
            )}
            <Button
              type="submit"
              className="w-full bg-gold text-background hover:bg-gold-dark"
              disabled={submitting}
            >
              {submitting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              {t("common.submit")}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
