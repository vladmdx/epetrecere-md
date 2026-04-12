"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, CheckCircle, XCircle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Review {
  id: number;
  artistId: number | null;
  venueId: number | null;
  authorName: string;
  eventType: string | null;
  rating: number;
  text: string | null;
  isApproved: boolean;
  createdAt: string;
}

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "approved">("pending");

  useEffect(() => {
    fetch("/api/reviews/list")
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => { setReviews(data); })
      .catch(() => toast.error("Nu s-au putut încărca recenziile"))
      .finally(() => setLoading(false));
  }, []);

  async function handleAction(id: number, action: "approve" | "reject") {
    try {
      await fetch(`/api/reviews/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (action === "approve") {
        setReviews((prev) => prev.map((r) => (r.id === id ? { ...r, isApproved: true } : r)));
        toast.success("Recenzie aprobată!");
      } else {
        setReviews((prev) => prev.filter((r) => r.id !== id));
        toast.success("Recenzie respinsă și ștearsă.");
      }
    } catch {
      toast.error("Eroare");
    }
  }

  const filtered = reviews.filter((r) => {
    if (filter === "pending") return !r.isApproved;
    if (filter === "approved") return r.isApproved;
    return true;
  });

  const pendingCount = reviews.filter((r) => !r.isApproved).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Recenzii</h1>
        <p className="text-sm text-muted-foreground">
          {pendingCount > 0 ? `${pendingCount} recenzii așteaptă aprobare` : "Toate recenziile sunt procesate"}
        </p>
      </div>

      <div className="flex gap-2">
        {(["pending", "approved", "all"] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? "default" : "outline"}
            size="sm"
            className={filter === f ? "bg-gold text-background hover:bg-gold-dark" : ""}
            onClick={() => setFilter(f)}
          >
            {f === "pending" ? `De aprobat (${pendingCount})` : f === "approved" ? "Aprobate" : "Toate"}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-gold" /></div>
      ) : (
        <div className="space-y-3">
          {filtered.map((review) => (
            <Card key={review.id} className={cn(!review.isApproved && "border-warning/30")}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{review.authorName}</span>
                      {review.eventType && <Badge variant="secondary" className="text-xs">{review.eventType}</Badge>}
                      <Badge variant="outline" className={cn("text-xs", review.isApproved ? "text-success border-success/30" : "text-warning border-warning/30")}>
                        {review.isApproved ? "Aprobat" : "În așteptare"}
                      </Badge>
                    </div>
                    <div className="mt-1 flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={cn("h-3.5 w-3.5", i < review.rating ? "fill-gold text-gold" : "text-muted")} />
                      ))}
                    </div>
                    {review.text && <p className="mt-2 text-sm text-muted-foreground">{review.text}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(review.createdAt).toLocaleDateString("ro-RO")}
                      {review.artistId && ` · Artist ID: ${review.artistId}`}
                    </p>
                  </div>

                  <div className="flex gap-2 shrink-0">
                    {!review.isApproved && (
                      <Button
                        size="sm"
                        className="bg-success text-white hover:bg-success/90 gap-1"
                        onClick={() => handleAction(review.id, "approve")}
                      >
                        <CheckCircle className="h-3.5 w-3.5" /> Aprobă
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive gap-1"
                      onClick={() => handleAction(review.id, "reject")}
                    >
                      <XCircle className="h-3.5 w-3.5" /> {review.isApproved ? "Șterge" : "Respinge"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {filtered.length === 0 && (
            <p className="py-8 text-center text-muted-foreground">
              {filter === "pending" ? "Nu sunt recenzii de aprobat" : "Nu există recenzii"}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
