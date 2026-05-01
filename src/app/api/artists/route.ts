import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getArtists } from "@/lib/db/queries/artists";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function isAdmin(clerkId: string | null): Promise<boolean> {
  if (!clerkId) return false;
  const [u] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  return u?.role === "admin" || u?.role === "super_admin";
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  const filters = {
    categoryId: params.get("category") ? Number(params.get("category")) : undefined,
    search: params.get("q") || undefined,
    // City filter — passed by the planifica wizard so artists are scoped to
    // (a) their base_city OR (b) "all Moldova" travel preference. Empty
    // value (no city in URL) means "show everyone" (legacy behavior).
    city: params.get("city") || undefined,
    priceMin: params.get("price_min") ? Number(params.get("price_min")) : undefined,
    priceMax: params.get("price_max") ? Number(params.get("price_max")) : undefined,
    ratingMin: params.get("rating_min") ? Number(params.get("rating_min")) : undefined,
    availableDate: params.get("date") || undefined,
    featured: params.get("featured") === "true" ? true : undefined,
    sort: (params.get("sort") as "popular" | "price_asc" | "price_desc" | "rating" | "newest") || undefined,
    page: params.get("page") ? Number(params.get("page")) : 1,
    limit: params.get("limit") ? Number(params.get("limit")) : 12,
  };

  const result = await getArtists(filters);

  // Phone and email are admin-only (clients must communicate via platform).
  // Price and socials are visible to authenticated users, hidden from anon.
  const { userId } = await auth();
  const admin = await isAdmin(userId);

  if (admin) {
    return NextResponse.json(result);
  }

  const redacted = userId
    ? result.items.map((a) => ({ ...a, phone: null, email: null }))
    : result.items.map((a) => ({
        ...a,
        priceFrom: null,
        phone: null,
        email: null,
        instagram: null,
        facebook: null,
        youtube: null,
        tiktok: null,
      }));

  return NextResponse.json({ ...result, items: redacted });
}
