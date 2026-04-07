"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useLocale } from "@/hooks/use-locale";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

interface RequestFormProps {
  trigger: React.ReactNode;
  artistId?: number;
  venueId?: number;
  preselectedDate?: string;
}

export function RequestForm({ trigger, artistId, venueId, preselectedDate }: RequestFormProps) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const data = {
      name: form.get("name") as string,
      phone: form.get("phone") as string,
      phonePrefix: "+373",
      email: (form.get("email") as string) || undefined,
      eventType: (form.get("eventType") as string) || undefined,
      eventDate: (form.get("eventDate") as string) || undefined,
      location: (form.get("location") as string) || undefined,
      guestCount: form.get("guestCount") ? Number(form.get("guestCount")) : undefined,
      message: (form.get("message") as string) || undefined,
      source: "form" as const,
      artistId,
      venueId,
    };

    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error("Failed");

      toast.success(t("form.submit_success"));
      setOpen(false);
    } catch {
      toast.error("A apărut o eroare. Încercați din nou.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger>{trigger}</SheetTrigger>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-heading">{t("artist.request_price")}</SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <Label htmlFor="name">{t("form.name")} *</Label>
            <Input id="name" name="name" required />
          </div>

          <div>
            <Label htmlFor="phone">{t("form.phone")} *</Label>
            <div className="flex gap-2">
              <Input value="+373" disabled className="w-20" />
              <Input id="phone" name="phone" type="tel" required className="flex-1" />
            </div>
          </div>

          <div>
            <Label htmlFor="email">{t("form.email")}</Label>
            <Input id="email" name="email" type="email" />
          </div>

          <div>
            <Label htmlFor="eventType">{t("form.event_type")}</Label>
            <select
              id="eventType"
              name="eventType"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">—</option>
              <option value="wedding">{t("event_types.wedding")}</option>
              <option value="baptism">{t("event_types.baptism")}</option>
              <option value="cumpatrie">{t("event_types.cumpatrie")}</option>
              <option value="corporate">{t("event_types.corporate")}</option>
              <option value="birthday">{t("event_types.birthday")}</option>
              <option value="other">{t("event_types.other")}</option>
            </select>
          </div>

          <div>
            <Label htmlFor="eventDate">{t("form.event_date")}</Label>
            <Input
              id="eventDate"
              name="eventDate"
              type="date"
              defaultValue={preselectedDate}
            />
          </div>

          <div>
            <Label htmlFor="location">{t("form.location")}</Label>
            <Input id="location" name="location" />
          </div>

          <div>
            <Label htmlFor="guestCount">{t("form.guest_count")}</Label>
            <Input id="guestCount" name="guestCount" type="number" min={1} />
          </div>

          <div>
            <Label htmlFor="message">{t("form.message")}</Label>
            <Textarea id="message" name="message" rows={3} />
          </div>

          <div className="flex items-start gap-2">
            <Checkbox id="gdpr" name="gdpr" required />
            <Label htmlFor="gdpr" className="text-xs text-muted-foreground leading-tight">
              {t("form.gdpr_consent")}
            </Label>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-gold text-background hover:bg-gold-dark"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                {t("common.submit")}
              </>
            )}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
