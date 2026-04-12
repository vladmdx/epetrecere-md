"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, MessageSquare, TrendingUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { useUser } from "@clerk/nextjs";

type Review = {
  id: number;
  authorName: string;
  rating: number;
  text: string;
  eventType: string | null;
  createdAt: string;
  reply: string | null;
};

export default function VendorReviewsPage() {
  const { user, isLoaded } = useUser();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    (async () => {
      try {
        const email = user?.primaryEmailAddress?.emailAddress;
        if (!email) {
          setError("Nu s-a putut determina contul de artist.");
          setLoading(false);
          return;
        }
        // Resolve artist ID
        const roleRes = await fetch(`/api/auth/check-role?email=${encodeURIComponent(email)}`);
        const roleData = await roleRes.json();
        if (!roleData.artistId) {
          setError("Contul dvs. nu este asociat cu un profil de artist.");
          setLoading(false);
          return;
        }
        // Load reviews for this artist
        const res = await fetch(`/api/reviews?artist_id=${roleData.artistId}`);
        if (!res.ok) throw new Error("Failed to fetch reviews");
        const data = await res.json();
        setReviews(Array.isArray(data) ? data : []);
      } catch {
        setError("Eroare la încărcarea recenziilor.");
      } finally {
        setLoading(false);
      }
    })();
  }, [isLoaded, user]);

  async function handleReply(reviewId: number) {
    if (!replyText.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/reviews/${reviewId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: replyText.trim() }),
      });
      if (res.ok) {
        setReviews((prev) =>
          prev.map((r) => (r.id === reviewId ? { ...r, reply: replyText.trim() } : r)),
        );
        setReplyingTo(null);
        setReplyText("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gold" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Card>
          <CardContent className="py-12 text-center text-destructive">
            <p>{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const avgRating = reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;

  return (
    <div className="space-y-6">
      <h1 className="font-heading text-2xl font-bold">Recenzii</h1>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <Star className="h-8 w-8 fill-gold text-gold" />
            <div>
              <p className="text-2xl font-bold">{avgRating.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">Rating mediu</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <MessageSquare className="h-8 w-8 text-gold" />
            <div>
              <p className="text-2xl font-bold">{reviews.length}</p>
              <p className="text-xs text-muted-foreground">Total recenzii</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <TrendingUp className="h-8 w-8 text-success" />
            <div>
              <p className="text-2xl font-bold">{reviews.filter((r) => !r.reply).length}</p>
              <p className="text-xs text-muted-foreground">Fără răspuns</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reviews List */}
      {reviews.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nu aveți încă nicio recenzie.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {reviews.map((review) => (
            <Card key={review.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{review.authorName}</span>
                      <span className="text-xs text-muted-foreground">
                        {review.eventType || "Eveniment"} · {new Date(review.createdAt).toLocaleDateString("ro-RO")}
                      </span>
                    </div>
                    <div className="mt-1 flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={cn("h-4 w-4", i < review.rating ? "fill-gold text-gold" : "text-muted")} />
                      ))}
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-sm text-muted-foreground">{review.text}</p>

                {review.reply && (
                  <div className="mt-3 rounded-lg bg-accent/50 p-3">
                    <p className="text-xs font-medium mb-1">Răspunsul tău:</p>
                    <p className="text-sm text-muted-foreground">{review.reply}</p>
                  </div>
                )}

                {!review.reply && (
                  <>
                    {replyingTo === review.id ? (
                      <div className="mt-3 space-y-2">
                        <Textarea
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Scrie răspunsul tău..."
                          rows={2}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="bg-gold text-background hover:bg-gold-dark"
                            disabled={submitting}
                            onClick={() => handleReply(review.id)}
                          >
                            {submitting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                            Trimite
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => { setReplyingTo(null); setReplyText(""); }}>Anulează</Button>
                        </div>
                      </div>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 gap-1"
                        onClick={() => setReplyingTo(review.id)}
                      >
                        <MessageSquare className="h-3.5 w-3.5" /> Răspunde
                      </Button>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
