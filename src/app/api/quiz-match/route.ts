// M7 Feature 9 — Vendor Matching Quiz
//
// Accepts the quiz answers from /chestionar and returns a ranked list of
// artists that fit the client's criteria. Reuses scoring heuristics from the
// lead matching engine (category overlap, city, budget, quality signals) but
// runs synchronously and returns the results directly — nothing persisted.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import {
  artists,
  artistImages,
  categories as categoriesTable,
} from "@/lib/db/schema";
import { and, eq, ilike, or, sql, inArray } from "drizzle-orm";
import { rateLimit } from "@/lib/rate-limit";

const quizSchema = z.object({
  eventType: z.string().min(1),
  guestCount: z.number().positive(),
  budget: z.number().positive(),
  city: z.string().min(1),
  style: z.string().min(1),
  services: z.array(z.string()).min(1),
});

// Reused from lead matching engine. Keep in sync if extended.
const SERVICE_TO_CATEGORY_SLUGS: Record<string, string[]> = {
  singer: ["cantareti-de-estrada", "interpreti-muzica-populara"],
  mc: ["moderatori"],
  dj: ["dj"],
  band: ["formatii", "cover-band"],
  photographer: ["foto-video"],
  videographer: ["foto-video"],
  show: ["show-program", "dansatori", "dansuri-populare"],
  decor: ["decor-floristica"],
  candy_bar: ["candy-bar"],
  fireworks: ["foc-de-artificii"],
  animators: ["animatori"],
  equipment: ["echipament-tehnic"],
};

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") || "anonymous";
  const { success } = await rateLimit(`quiz:${ip}`, 20, 60_000);
  if (!success) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json();
  const parsed = quizSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const quiz = parsed.data;

  // 1. Resolve services → category IDs
  const categorySlugs = Array.from(
    new Set(quiz.services.flatMap((s) => SERVICE_TO_CATEGORY_SLUGS[s] ?? [])),
  );
  let categoryIds: number[] = [];
  if (categorySlugs.length > 0) {
    const cats = await db
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(inArray(categoriesTable.slug, categorySlugs));
    categoryIds = cats.map((c) => c.id);
  }

  // 2. Query candidates
  const conditions = [eq(artists.isActive, true)];
  if (quiz.city) {
    conditions.push(ilike(artists.location, `%${quiz.city}%`));
  }
  conditions.push(
    or(
      sql`${artists.priceFrom} IS NULL`,
      sql`${artists.priceFrom} <= ${Math.round(quiz.budget * 1.5)}`,
    )!,
  );

  const candidates = await db
    .select({
      id: artists.id,
      slug: artists.slug,
      nameRo: artists.nameRo,
      categoryIds: artists.categoryIds,
      priceFrom: artists.priceFrom,
      location: artists.location,
      ratingAvg: artists.ratingAvg,
      isVerified: artists.isVerified,
      isFeatured: artists.isFeatured,
      isPremium: artists.isPremium,
    })
    .from(artists)
    .where(and(...conditions))
    .limit(100);

  // 3. Score
  type Scored = {
    id: number;
    score: number;
    reasons: string[];
    slug: string;
    nameRo: string;
    priceFrom: number | null;
    location: string | null;
    ratingAvg: number | null;
    categoryIds: number[] | null;
  };

  const scored: Scored[] = candidates.map((a) => {
    const reasons: string[] = [];
    let score = 20;

    // Category overlap (up to 40)
    if (categoryIds.length > 0 && a.categoryIds?.length) {
      const overlap = a.categoryIds.filter((c) => categoryIds.includes(c));
      if (overlap.length > 0) {
        score += Math.min(40, overlap.length * 20);
        reasons.push(`Servicii potrivite: ${overlap.length}`);
      }
    }

    // City
    if (
      quiz.city &&
      a.location?.toLowerCase().includes(quiz.city.toLowerCase())
    ) {
      score += 10;
      reasons.push(`Activează în ${quiz.city}`);
    }

    // Budget
    if (a.priceFrom && a.priceFrom <= quiz.budget) {
      score += 15;
      reasons.push("În buget");
    } else if (a.priceFrom && a.priceFrom <= quiz.budget * 1.5) {
      score += 5;
      reasons.push("Aproape de buget");
    }

    // Guest count bonus — if artist info suggests large events, give small boost
    if (quiz.guestCount >= 200) {
      score += 3;
    }

    // Quality
    if (a.isPremium) {
      score += 8;
      reasons.push("Premium");
    }
    if (a.isVerified) {
      score += 5;
      reasons.push("Verificat");
    }
    if (a.isFeatured) {
      score += 5;
      reasons.push("Recomandat");
    }
    if (a.ratingAvg && a.ratingAvg >= 4.5) {
      score += 5;
      reasons.push(`Rating ${a.ratingAvg.toFixed(1)}`);
    }

    return {
      id: a.id,
      score: Math.min(100, score),
      reasons,
      slug: a.slug,
      nameRo: a.nameRo,
      priceFrom: a.priceFrom,
      location: a.location,
      ratingAvg: a.ratingAvg,
      categoryIds: a.categoryIds,
    };
  });

  const top = scored
    .sort((x, y) => y.score - x.score)
    .filter((s) => s.score >= 40)
    .slice(0, 12);

  // 4. Fetch cover images and category names for the top list
  const topIds = top.map((t) => t.id);
  const coverByArtist: Record<number, string> = {};
  if (topIds.length > 0) {
    const imgs = await db
      .select({
        artistId: artistImages.artistId,
        url: artistImages.url,
        isCover: artistImages.isCover,
        sortOrder: artistImages.sortOrder,
      })
      .from(artistImages)
      .where(inArray(artistImages.artistId, topIds));
    // Prefer cover, fall back to first by sortOrder
    for (const id of topIds) {
      const imgsForArtist = imgs.filter((i) => i.artistId === id);
      const cover =
        imgsForArtist.find((i) => i.isCover)?.url ||
        imgsForArtist.sort(
          (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
        )[0]?.url;
      if (cover) coverByArtist[id] = cover;
    }
  }

  const matches = top.map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.nameRo,
    location: t.location,
    priceFrom: t.priceFrom,
    ratingAvg: t.ratingAvg,
    matchScore: t.score,
    reasons: t.reasons,
    coverImage: coverByArtist[t.id] ?? null,
    categories: [],
  }));

  return NextResponse.json({ matches });
}
