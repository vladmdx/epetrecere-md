"use client";

// Shared widget for the personal iCal subscription URL.
// Used in /dashboard/setari (where it lives in production) and previously
// in /dashboard/calendar. The URL is HMAC-signed per user so anyone with
// it can see confirmed bookings — we stress this in the copy.

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar as CalendarIcon, Check, Copy } from "lucide-react";

export function IcalSubscribeCard() {
  const [path, setPath] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/vendor/ical-info")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.path) setPath(data.path);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !path) return null;
  const fullUrl =
    typeof window !== "undefined" ? `${window.location.origin}${path}` : path;

  async function copy() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      toast.success("Link copiat!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Nu am putut copia linkul.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarIcon className="h-4 w-4 text-gold" /> Sincronizează cu
          calendarul tău
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Abonează-te la acest link în Google Calendar, Apple Calendar sau
          Outlook și toate rezervările tale confirmate vor apărea automat.
          Linkul este personal — nu-l da nimănui.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input readOnly value={fullUrl} className="flex-1 font-mono text-xs" />
          <Button onClick={copy} variant="outline" className="gap-1.5">
            {copied ? (
              <Check className="h-4 w-4 text-success" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            {copied ? "Copiat" : "Copiază"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
