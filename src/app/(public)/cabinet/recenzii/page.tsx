"use client";

// M4 — Cabinet: "Lasă o recenzie" page listing completed bookings that
// haven't been reviewed yet and letting the client submit a verified
// review tied to that booking (Trustpilot-style).

import { useEffect, useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Star,
  MessageSquareText,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ReviewableBooking {
  id: number;
  eventDate: string;
  eventType: string | null;
  artistId: number | null;
  artistName: string | null;
  artistSlug: string | null;
}

export default function ReviewsCabinetPage() {
  const { isSignedIn, isLoaded } = useUser();
  const [bookings, setBookings] = useState<ReviewableBooking[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/reviews/reviewable-bookings", {
        cache: "no-store",
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBookings(data.bookings ?? []);
    } catch {
      toast.error("Nu am putut încărca rezervările.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isLoaded && isSignedIn) load();
    else if (isLoaded) setLoading(false);
  }, [isLoaded, isSignedIn]);

  function onReviewed(bookingId: number) {
    setBookings((prev) => prev.filter((b) => b.id !== bookingId));
  }

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="mx-auto max-w-md py-20 px-4 text-center">
        <MessageSquareText className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">
          Autentifică-te pentru a lăsa recenzii verificate.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl py-8 px-4">
      <Link
        href="/cabinet"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gold"
      >
        <ArrowLeft className="h-3 w-3" /> Înapoi la cabinet
      </Link>
      <h1 className="mt-2 font-heading text-2xl font-bold">
        Recenziile tale verificate
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Poți lăsa o recenzie doar pentru evenimentele care au avut loc și pentru care ai confirmat rezervarea. Recenziile apar după verificare.
      </p>

      <div className="mt-6 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Se încarcă…
          </div>
        ) : bookings.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/40 bg-card py-12 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">
              Nicio rezervare în așteptarea recenziei.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              După un eveniment confirmat vei putea lăsa o recenzie aici.
            </p>
          </div>
        ) : (
          bookings.map((b) => (
            <ReviewCard key={b.id} booking={b} onSubmitted={() => onReviewed(b.id)} />
          ))
        )}
      </div>
    </div>
  );
}

function ReviewCard({
  booking,
  onSubmitted,
}: {
  booking: ReviewableBooking;
  onSubmitted: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (rating < 1) {
      toast.error("Alege o notă de la 1 la 5 stele.");
      return;
    }
    if (text.trim().length < 10) {
      toast.error("Scrie cel puțin 10 caractere.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/reviews/from-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingRequestId: booking.id,
          rating,
          text: text.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Nu am putut trimite recenzia.");
        return;
      }
      toast.success("Mulțumim! Recenzia este în curs de verificare.");
      onSubmitted();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-border/40 bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase text-muted-foreground">
            {booking.eventType || "Eveniment"} ·{" "}
            {new Date(booking.eventDate).toLocaleDateString("ro-MD")}
          </p>
          {booking.artistSlug ? (
            <Link
              href={`/artisti/${booking.artistSlug}`}
              className="font-heading text-lg font-semibold hover:text-gold"
            >
              {booking.artistName || "Artist"}
            </Link>
          ) : (
            <h3 className="font-heading text-lg font-semibold">
              {booking.artistName || "Artist"}
            </h3>
          )}
        </div>
      </div>

      {/* Star rating */}
      <div className="mt-4 flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setRating(n)}
            aria-label={`${n} stele`}
          >
            <Star
              className={cn(
                "h-7 w-7 transition-colors",
                (hover || rating) >= n
                  ? "fill-gold text-gold"
                  : "text-muted-foreground",
              )}
            />
          </button>
        ))}
        {rating > 0 && (
          <span className="ml-2 text-sm text-muted-foreground">{rating}/5</span>
        )}
      </div>

      <div className="mt-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Povestește-ne cum a fost experiența ta..."
          rows={4}
          maxLength={1000}
        />
        <div className="mt-1 text-right text-[10px] text-muted-foreground">
          {text.length}/1000
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <Button
          onClick={submit}
          disabled={submitting}
          className="gap-1 bg-gold text-background hover:bg-gold-dark"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Trimite recenzia
        </Button>
      </div>
    </div>
  );
}
