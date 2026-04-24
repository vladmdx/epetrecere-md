"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Star,
  StarHalf,
  MessageSquare,
  TrendingUp,
  Loader2,
  Mail,
  CheckCircle2,
  ExternalLink,
  Search,
  Filter,
  Send,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Review {
  id: number;
  authorName: string;
  rating: number;
  text: string | null;
  eventType: string | null;
  reply: string | null;
  replyAt: string | null;
  isApproved: boolean;
  createdAt: string;
}

interface ReviewableBooking {
  id: number;
  clientName: string;
  clientEmail: string | null;
  eventDate: string;
  eventType: string | null;
  status: string;
}

interface Props {
  /** "sala" → public profile at /sali/[slug]; "artist" → /artisti/[slug]. */
  entityKind: "sala" | "artist";
  entityId: number;
  entityName: string;
  entitySlug: string;
  reviews: Review[];
  reviewableBookings: ReviewableBooking[];
}

export function VenueReviewsClient({
  entityKind,
  entityName,
  entitySlug,
  reviews,
  reviewableBookings,
}: Props) {
  const [reviewsState, setReviewsState] = useState<Review[]>(reviews);
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [requestedIds, setRequestedIds] = useState<Set<number>>(new Set());
  const [requestingId, setRequestingId] = useState<number | null>(null);
  const [bulkRequesting, setBulkRequesting] = useState(false);

  // Filter state — applied client-side to reviewsState.
  const [search, setSearch] = useState("");
  const [filterStars, setFilterStars] = useState<number | null>(null); // null = all
  const [filterReplied, setFilterReplied] = useState<"all" | "yes" | "no">(
    "all",
  );

  // Stats
  const stats = useMemo(() => {
    const count = reviewsState.length;
    const avg = count > 0 ? reviewsState.reduce((s, r) => s + r.rating, 0) / count : 0;
    const unanswered = reviewsState.filter((r) => !r.reply).length;

    // Distribution 1..5
    const dist = [1, 2, 3, 4, 5].map((star) => ({
      star,
      count: reviewsState.filter((r) => r.rating === star).length,
    }));

    // 12-month trend: monthly average rating (last 12 months incl. current)
    const now = new Date();
    const monthKeys: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthKeys.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      );
    }
    const byMonth = new Map<string, { sum: number; count: number }>();
    for (const r of reviewsState) {
      const d = new Date(r.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const bucket = byMonth.get(key) ?? { sum: 0, count: 0 };
      bucket.sum += r.rating;
      bucket.count += 1;
      byMonth.set(key, bucket);
    }
    const trend = monthKeys.map((key) => {
      const b = byMonth.get(key);
      return {
        month: key,
        avg: b && b.count > 0 ? b.sum / b.count : null,
        count: b?.count ?? 0,
      };
    });

    return { count, avg, unanswered, dist, trend };
  }, [reviewsState]);

  async function handleReply(reviewId: number) {
    if (!replyText.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/reviews/${reviewId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: replyText.trim() }),
      });
      if (!res.ok) {
        toast.error("Nu s-a putut salva răspunsul");
        return;
      }
      setReviewsState((prev) =>
        prev.map((r) =>
          r.id === reviewId
            ? { ...r, reply: replyText.trim(), replyAt: new Date().toISOString() }
            : r,
        ),
      );
      setReplyingTo(null);
      setReplyText("");
      toast.success("Răspunsul a fost salvat!");
    } catch {
      toast.error("Eroare la salvarea răspunsului");
    } finally {
      setSubmitting(false);
    }
  }

  /** Derived list with search + filter applied. */
  const filteredReviews = useMemo(() => {
    let list = reviewsState;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        const hay = [r.authorName, r.text, r.eventType, r.reply]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }
    if (filterStars !== null) {
      list = list.filter((r) => r.rating === filterStars);
    }
    if (filterReplied === "yes") list = list.filter((r) => !!r.reply);
    else if (filterReplied === "no") list = list.filter((r) => !r.reply);
    return list;
  }, [reviewsState, search, filterStars, filterReplied]);

  const hasActiveFilter =
    !!search.trim() || filterStars !== null || filterReplied !== "all";

  function resetFilters() {
    setSearch("");
    setFilterStars(null);
    setFilterReplied("all");
  }

  async function requestReview(bookingId: number) {
    setRequestingId(bookingId);
    try {
      const res = await fetch("/api/reviews/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingRequestId: bookingId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.error || "Nu s-a putut trimite");
        return;
      }
      setRequestedIds((prev) => new Set(prev).add(bookingId));
      toast.success("Email trimis clientului");
    } finally {
      setRequestingId(null);
    }
  }

  /** Fire a review-request email for every eligible booking in one batch.
   *  Runs sequentially (not parallel) so the rate limiter on the server
   *  doesn't reject half of them. */
  async function requestAllReviews() {
    const pending = reviewableBookings.filter(
      (b) => b.clientEmail && !requestedIds.has(b.id),
    );
    if (pending.length === 0) {
      toast.info("Nu există clienți eligibili cu email");
      return;
    }
    if (
      !confirm(
        `Trimit email cu invitație pentru recenzie la ${pending.length} ${
          pending.length === 1 ? "client" : "clienți"
        }?`,
      )
    ) {
      return;
    }
    setBulkRequesting(true);
    let ok = 0;
    let fail = 0;
    try {
      for (const b of pending) {
        try {
          const res = await fetch("/api/reviews/request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bookingRequestId: b.id }),
          });
          if (res.ok) {
            ok++;
            setRequestedIds((prev) => new Set(prev).add(b.id));
          } else {
            fail++;
          }
        } catch {
          fail++;
        }
      }
      if (fail === 0) {
        toast.success(`${ok} invitații trimise`);
      } else if (ok === 0) {
        toast.error(`${fail} eșuate — verifică în consolă`);
      } else {
        toast.success(`${ok} trimise · ${fail} eșuate`);
      }
    } finally {
      setBulkRequesting(false);
    }
  }

  // Trend chart: find max count for y-axis scaling
  const maxDist = Math.max(1, ...stats.dist.map((d) => d.count));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Recenzii</h1>
          <p className="text-muted-foreground">
            Recenzii pentru <strong>{entityName}</strong>
          </p>
        </div>
        <Link
          href={`/${entityKind === "sala" ? "sali" : "artisti"}/${entitySlug}#reviews`}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-1 text-xs text-gold hover:underline"
        >
          <ExternalLink className="h-3 w-3" /> Vezi pe profilul public
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col gap-2 pt-6">
            <div className="flex items-baseline gap-3">
              <p className="font-heading text-4xl font-bold text-gold">
                {stats.avg.toFixed(1)}
              </p>
              <StarRatingDisplay rating={stats.avg} />
            </div>
            <p className="text-xs text-muted-foreground">
              Rating mediu ·{" "}
              <strong>{stats.count}</strong>{" "}
              {stats.count === 1 ? "recenzie" : "recenzii"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <MessageSquare className="h-8 w-8 text-gold" />
            <div>
              <p className="text-2xl font-bold">{stats.count}</p>
              <p className="text-xs text-muted-foreground">Total recenzii</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <TrendingUp className="h-8 w-8 text-success" />
            <div>
              <p className="text-2xl font-bold">{stats.unanswered}</p>
              <p className="text-xs text-muted-foreground">Fără răspuns</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Distribution + Trend */}
      {stats.count > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Distribution */}
          <Card>
            <CardContent className="space-y-3 p-5">
              <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Distribuție pe stele
              </h2>
              <div className="space-y-2">
                {stats.dist.slice().reverse().map((d) => {
                  const pct = stats.count > 0 ? (d.count / stats.count) * 100 : 0;
                  return (
                    <div key={d.star} className="flex items-center gap-3">
                      <div className="flex w-12 items-center gap-0.5 text-xs">
                        {d.star}
                        <Star className="h-3 w-3 fill-gold text-gold" />
                      </div>
                      <div className="relative h-3 flex-1 overflow-hidden rounded-full bg-muted/40">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-gold transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-10 text-right text-xs text-muted-foreground">
                        {d.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* 12-month trend */}
          <Card>
            <CardContent className="space-y-3 p-5">
              <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Trend ultimele 12 luni
              </h2>
              <TrendSparkline trend={stats.trend} />
            </CardContent>
          </Card>
        </div>
      )}

      {/* Request Review section */}
      {reviewableBookings.length > 0 && (
        <Card>
          <CardContent className="space-y-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-heading text-lg font-semibold">
                  Cere recenzie
                </h2>
                <p className="text-xs text-muted-foreground">
                  Trimite un email clientului ca să lase o recenzie pentru
                  evenimentul trecut.
                </p>
              </div>
              {reviewableBookings.some(
                (b) => b.clientEmail && !requestedIds.has(b.id),
              ) && (
                <Button
                  size="sm"
                  onClick={requestAllReviews}
                  disabled={bulkRequesting}
                  className="gap-1.5 bg-gold text-[#0D0D0D] hover:bg-gold-dark"
                >
                  {bulkRequesting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Cere de la toți ({
                    reviewableBookings.filter(
                      (b) => b.clientEmail && !requestedIds.has(b.id),
                    ).length
                  })
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {reviewableBookings.map((b) => {
                const requested = requestedIds.has(b.id);
                return (
                  <div
                    key={b.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/40 p-3 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{b.clientName}</p>
                      <p className="text-xs text-muted-foreground">
                        {b.eventType || "Eveniment"} ·{" "}
                        {new Date(b.eventDate).toLocaleDateString("ro-RO", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                        {b.clientEmail ? ` · ${b.clientEmail}` : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={
                        !b.clientEmail || requested || requestingId === b.id
                      }
                      onClick={() => requestReview(b.id)}
                      className="gap-1.5"
                    >
                      {requestingId === b.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : requested ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      ) : (
                        <Mail className="h-3.5 w-3.5" />
                      )}
                      {requested ? "Trimis" : "Cere recenzie"}
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Reviews List + Filter toolbar */}
      {reviewsState.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nu aveți încă nicio recenzie.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Filter toolbar */}
          <Card>
            <CardContent className="flex flex-wrap items-center gap-3 p-3">
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Caută în autor, text, răspuns..."
                  className="h-8 w-full rounded-md border border-border/50 bg-background pl-9 pr-2 text-xs"
                />
              </div>
              <div className="flex items-center gap-1 text-xs">
                <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Stele:</span>
                <button
                  onClick={() => setFilterStars(null)}
                  className={cn(
                    "rounded px-2 py-0.5 text-xs",
                    filterStars === null
                      ? "bg-gold text-[#0D0D0D]"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  Toate
                </button>
                {[5, 4, 3, 2, 1].map((s) => (
                  <button
                    key={s}
                    onClick={() => setFilterStars(s)}
                    className={cn(
                      "inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-xs",
                      filterStars === s
                        ? "bg-gold text-[#0D0D0D]"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {s}
                    <Star className="h-2.5 w-2.5" />
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 text-xs">
                <span className="text-muted-foreground">Răspuns:</span>
                {(["all", "yes", "no"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setFilterReplied(v)}
                    className={cn(
                      "rounded px-2 py-0.5",
                      filterReplied === v
                        ? "bg-gold text-[#0D0D0D]"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {v === "all" ? "Toate" : v === "yes" ? "Da" : "Nu"}
                  </button>
                ))}
              </div>
              {hasActiveFilter && (
                <button
                  onClick={resetFilters}
                  className="text-xs text-gold hover:underline"
                >
                  Resetează
                </button>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {filteredReviews.length}/{reviewsState.length}
              </span>
            </CardContent>
          </Card>

          {filteredReviews.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Nicio recenzie pentru filtrul curent.{" "}
                <button
                  onClick={resetFilters}
                  className="text-gold hover:underline"
                >
                  Resetează
                </button>
              </CardContent>
            </Card>
          )}

          {filteredReviews.map((review) => (
            <Card key={review.id}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{review.authorName}</span>
                      <span className="text-xs text-muted-foreground">
                        {review.eventType || "Eveniment"} ·{" "}
                        {new Date(review.createdAt).toLocaleDateString("ro-RO")}
                      </span>
                      {!review.isApproved && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                          În aprobare
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={cn(
                            "h-4 w-4",
                            i < review.rating
                              ? "fill-gold text-gold"
                              : "text-muted",
                          )}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <p className="mt-3 text-sm text-muted-foreground">
                  {review.text}
                </p>

                {review.reply && (
                  <div className="mt-3 rounded-lg bg-accent/50 p-3">
                    <p className="mb-1 text-xs font-medium">Răspunsul tău:</p>
                    <p className="text-sm text-muted-foreground">
                      {review.reply}
                    </p>
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
                            className="bg-gold text-[#0D0D0D] hover:bg-gold-dark"
                            disabled={submitting}
                            onClick={() => handleReply(review.id)}
                          >
                            {submitting ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : null}
                            Trimite
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setReplyingTo(null);
                              setReplyText("");
                            }}
                          >
                            Anulează
                          </Button>
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

/**
 * 5 stars, filled / half-filled / empty based on a rating in [0, 5].
 * Uses Lucide's StarHalf for .3 - .7, rounds outside that. Matches the spec's
 * "4 stele pline + 1 pe jumătate" presentation.
 */
function StarRatingDisplay({ rating }: { rating: number }) {
  const stars: React.ReactNode[] = [];
  for (let i = 1; i <= 5; i++) {
    const diff = rating - (i - 1);
    if (diff >= 0.75) {
      stars.push(
        <Star key={i} className="h-5 w-5 fill-gold text-gold" aria-hidden />,
      );
    } else if (diff >= 0.25) {
      // Half star — render a filled StarHalf over an empty Star for the outline.
      stars.push(
        <span key={i} className="relative inline-flex h-5 w-5" aria-hidden>
          <Star className="absolute inset-0 h-5 w-5 text-gold/40" />
          <StarHalf className="absolute inset-0 h-5 w-5 fill-gold text-gold" />
        </span>,
      );
    } else {
      stars.push(
        <Star key={i} className="h-5 w-5 text-gold/30" aria-hidden />,
      );
    }
  }
  return (
    <span
      className="inline-flex items-center gap-0.5"
      aria-label={`${rating.toFixed(1)} din 5 stele`}
    >
      {stars}
    </span>
  );
}

/** Lightweight SVG sparkline of monthly avg rating over the last 12 months. */
function TrendSparkline({
  trend,
}: {
  trend: Array<{ month: string; avg: number | null; count: number }>;
}) {
  const w = 320;
  const h = 90;
  const padX = 8;
  const padY = 12;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const points = trend.map((t, i) => {
    const x = padX + (innerW * i) / Math.max(1, trend.length - 1);
    const val = t.avg ?? 0;
    // rating 1..5 → y axis inverted
    const y = padY + innerH - (innerH * (val - 1)) / 4;
    return { x, y, val: t.avg, month: t.month, count: t.count };
  });
  const hasAny = points.some((p) => p.val !== null);
  const segments: string[] = [];
  let currentPath = "";
  for (const p of points) {
    if (p.val === null) {
      if (currentPath) segments.push(currentPath);
      currentPath = "";
      continue;
    }
    currentPath +=
      currentPath === ""
        ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`
        : ` L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }
  if (currentPath) segments.push(currentPath);

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-[90px] w-full text-gold"
        preserveAspectRatio="none"
      >
        {/* Baseline (rating 3 = neutral) */}
        <line
          x1={padX}
          x2={w - padX}
          y1={padY + innerH - (innerH * 2) / 4}
          y2={padY + innerH - (innerH * 2) / 4}
          stroke="currentColor"
          strokeDasharray="2 3"
          strokeOpacity="0.2"
        />
        {segments.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
        {points.map((p, i) =>
          p.val === null ? null : (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="2.5"
              fill="currentColor"
            >
              <title>
                {p.month}: {p.val.toFixed(1)}★ ({p.count})
              </title>
            </circle>
          ),
        )}
      </svg>
      {!hasAny && (
        <p className="text-center text-xs text-muted-foreground">
          Fără date suficiente pentru trend
        </p>
      )}
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{trend[0]?.month.slice(2)}</span>
        <span>{trend[trend.length - 1]?.month.slice(2)}</span>
      </div>
    </div>
  );
}
