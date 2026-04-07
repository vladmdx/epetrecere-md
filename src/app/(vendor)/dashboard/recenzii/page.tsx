"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, MessageSquare, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

const demoReviews = [
  { id: 1, authorName: "Maria P.", rating: 5, text: "Absolut fantastic! Vocea incredibilă și atmosfera a fost magică.", eventType: "Nuntă", date: "2026-03-20", reply: null },
  { id: 2, authorName: "Ion R.", rating: 4, text: "Foarte bun, profesionist. Recomand cu încredere.", eventType: "Botez", date: "2026-02-15", reply: "Mulțumim frumos, Ion! A fost o plăcere." },
  { id: 3, authorName: "Elena M.", rating: 5, text: "Cel mai bun artist cu care am colaborat. Invitații au fost încântați!", eventType: "Aniversare", date: "2026-01-10", reply: null },
];

export default function VendorReviewsPage() {
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");

  const avgRating = demoReviews.reduce((sum, r) => sum + r.rating, 0) / demoReviews.length;

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
              <p className="text-2xl font-bold">{demoReviews.length}</p>
              <p className="text-xs text-muted-foreground">Total recenzii</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <TrendingUp className="h-8 w-8 text-success" />
            <div>
              <p className="text-2xl font-bold">{demoReviews.filter((r) => !r.reply).length}</p>
              <p className="text-xs text-muted-foreground">Fără răspuns</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reviews List */}
      <div className="space-y-4">
        {demoReviews.map((review) => (
          <Card key={review.id}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{review.authorName}</span>
                    <span className="text-xs text-muted-foreground">{review.eventType} · {review.date}</span>
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
                        <Button size="sm" className="bg-gold text-background hover:bg-gold-dark">Trimite</Button>
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
    </div>
  );
}
