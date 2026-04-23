"use client";

// Sign contract dialog — opens from the booking card when status is
// "accepted" or "confirmed_by_client" AND contract is not yet signed.
// Client types their full name (single-line signature) + consent
// checkbox → POST /api/booking-requests/[id]/contract → dialog shows
// the generated PDF inline (iframe) + download link.

import { useState } from "react";
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

interface Props {
  bookingId: number;
  initialSigned?: boolean;
  /** Called after successful signing so parent can refresh UI. */
  onSigned?: () => void;
  /** Trigger element — if omitted, renders a default "Semnează contract" button. */
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

  const pdfUrl = `/api/booking-requests/${bookingId}/contract`;

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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2">
              <FileSignature className="h-5 w-5 text-gold" />
              Contract booking #{bookingId}
            </DialogTitle>
            <DialogDescription>
              {signed
                ? "Contractul tău este deja semnat. Poți descărca PDF-ul sau deschide într-un tab nou."
                : "Citește termenii și semnează electronic. Contractul are valoare juridică."}
            </DialogDescription>
          </DialogHeader>

          {/* PDF preview */}
          <div className="overflow-hidden rounded-lg border border-border/40">
            <iframe
              src={pdfUrl}
              title={`Contract ${bookingId}`}
              className="h-80 w-full"
            />
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

          <DialogFooter>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-2 text-xs hover:bg-muted"
            >
              <Eye className="h-3.5 w-3.5" />
              Deschide în tab nou
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
