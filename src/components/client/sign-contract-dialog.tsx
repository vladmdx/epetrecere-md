"use client";

// Sign contract dialog — opens from the booking card when status is
// "accepted" or "confirmed_by_client" AND contract is not yet signed.
// Fetches booking details from API and renders an HTML preview of the
// contract terms (no iframe — more reliable across browsers). PDF is
// available via "Deschide în tab nou" link.

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FileSignature, Loader2, Download, Eye } from "lucide-react";
import { toast } from "sonner";

interface BookingPreview {
  clientName: string;
  clientPhone: string | null;
  clientEmail: string | null;
  vendorName: string;
  vendorKind: "artist" | "sala";
  eventDate: string | null;
  eventType: string | null;
  startTime: string | null;
  endTime: string | null;
  guestCount: number | null;
  agreedPrice: number | null;
  message: string | null;
}

interface Props {
  bookingId: number;
  initialSigned?: boolean;
  onSigned?: () => void;
  trigger?: React.ReactNode;
}

export function SignContractDialog({
  bookingId,
  initialSigned = false,
  onSigned,
  trigger,
}: Props) {
  const [open, setOpen] = useState(false);
  const [signature, setSignature] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signed, setSigned] = useState(initialSigned);
  const [preview, setPreview] = useState<BookingPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const pdfUrl = `/api/booking-requests/${bookingId}/contract`;

  // Fetch preview data when dialog opens
  useEffect(() => {
    if (!open || preview) return;
    setLoadingPreview(true);
    fetch(`/api/booking-requests/${bookingId}/contract-preview`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setPreview(data);
      })
      .catch(() => {})
      .finally(() => setLoadingPreview(false));
  }, [open, bookingId, preview]);

  async function sign() {
    if (signature.trim().length < 2) {
      toast.error("Scrie numele complet ca semnătură");
      return;
    }
    if (!agreed) {
      toast.error("Trebuie să accepți termenii contractului");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/booking-requests/${bookingId}/contract`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signature: signature.trim() }),
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Nu am putut semna");
        return;
      }
      setSigned(true);
      toast.success("Contract semnat. Poți descărca PDF-ul.");
      onSigned?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div onClick={() => setOpen(true)} className="inline-block">
        {trigger ?? (
          <Button
            size="sm"
            className="gap-1.5 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
          >
            <FileSignature className="h-3.5 w-3.5" />
            {signed ? "Vezi contract semnat" : "Semnează contract"}
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-gold" />
              Contract booking #{bookingId}
            </DialogTitle>
            <DialogDescription>
              {signed
                ? "Contractul tău este deja semnat. Poți descărca PDF-ul."
                : "Citește termenii și semnează electronic. Contractul are valoare juridică."}
            </DialogDescription>
          </DialogHeader>

          {/* Contract preview — HTML instead of iframe for reliability */}
          <div className="rounded-lg border border-border/40 bg-background/40 p-5 text-sm">
            {loadingPreview ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-gold" />
              </div>
            ) : preview ? (
              <div className="space-y-4">
                <div className="border-b border-border/40 pb-3 text-center">
                  <p className="font-heading text-base font-bold text-gold">
                    CONTRACT DE PRESTĂRI SERVICII
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ePetrecere.md · Republica Moldova
                  </p>
                </div>

                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gold">
                    Părțile Contractante
                  </p>
                  <div className="grid gap-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {preview.vendorKind === "sala" ? "Sala" : "Artist"} (Prestator):
                      </span>
                      <span className="font-medium">{preview.vendorName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Client (Beneficiar):</span>
                      <span className="font-medium">{preview.clientName}</span>
                    </div>
                    {preview.clientPhone && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Telefon client:</span>
                        <span className="font-medium">{preview.clientPhone}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gold">
                    Detalii Eveniment
                  </p>
                  <div className="grid gap-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tip eveniment:</span>
                      <span className="font-medium">{preview.eventType || "—"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Data:</span>
                      <span className="font-medium">{preview.eventDate || "—"}</span>
                    </div>
                    {(preview.startTime || preview.endTime) && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Interval orar:</span>
                        <span className="font-medium">
                          {preview.startTime || "—"} – {preview.endTime || "—"}
                        </span>
                      </div>
                    )}
                    {preview.guestCount && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Număr invitați:</span>
                        <span className="font-medium">{preview.guestCount}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Preț agreat:</span>
                      <span className="font-bold text-gold">
                        {preview.agreedPrice
                          ? `${preview.agreedPrice} EUR`
                          : "de negociat"}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gold">
                    Termeni și Condiții
                  </p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    <li>
                      • Prestatorul se obligă să execute serviciile convenite la
                      data și în intervalul orar stabilit.
                    </li>
                    <li>
                      • Clientul se obligă să achite prețul agreat conform
                      modalității stabilite.
                    </li>
                    <li>
                      • Anularea se face conform politicii platformei
                      ePetrecere.md.
                    </li>
                    <li>
                      • Semnătura electronică are valoare juridică echivalentă
                      cu semnătura pe hârtie, conform legislației RM.
                    </li>
                  </ul>
                </div>
              </div>
            ) : (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Nu s-au putut încărca detaliile contractului. Folosește
                &quot;Deschide în tab nou&quot; pentru a vedea PDF-ul.
              </p>
            )}
          </div>

          {!signed && (
            <div className="space-y-3">
              <div>
                <Label
                  htmlFor={`sig-${bookingId}`}
                  className="text-xs font-medium"
                >
                  Semnătura ta (numele complet)
                </Label>
                <Input
                  id={`sig-${bookingId}`}
                  value={signature}
                  onChange={(e) => setSignature(e.target.value)}
                  placeholder="Ex: Ion Popescu"
                  className="mt-1 font-accent text-lg italic"
                />
              </div>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg bg-muted/30 p-3">
                <Checkbox
                  checked={agreed}
                  onCheckedChange={(v) => setAgreed(!!v)}
                  className="mt-0.5"
                />
                <span className="text-xs leading-relaxed text-muted-foreground">
                  Confirm că am citit contractul și sunt de acord cu termenii.
                  Înțeleg că această semnătură electronică are valoare
                  juridică echivalentă cu o semnătură pe hârtie conform
                  legislației Republicii Moldova.
                </span>
              </label>
            </div>
          )}

          <DialogFooter className="gap-2">
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs hover:bg-muted"
            >
              <Eye className="h-3.5 w-3.5" />
              Deschide PDF în tab nou
            </a>
            {signed ? (
              <a
                href={pdfUrl}
                download={`contract-${bookingId}.pdf`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-gold px-3 py-2 text-xs font-medium text-[#0D0D0D] hover:bg-gold-dark"
              >
                <Download className="h-3.5 w-3.5" />
                Descarcă PDF
              </a>
            ) : (
              <Button
                onClick={sign}
                disabled={busy || !agreed || signature.trim().length < 2}
                className="gap-1.5 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileSignature className="h-4 w-4" />
                )}
                Semnează electronic
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
