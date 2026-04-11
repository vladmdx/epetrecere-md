import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getArtists } from "@/lib/db/queries/artists";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  const filters = {
    categoryId: params.get("category") ? Number(params.get("category")) : undefined,
    search: params.get("q") || undefined,
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

  // M0a #8 — price is only exposed to authenticated clients.
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({
      ...result,
      items: result.items.map((a) => ({
        ...a,
        priceFrom: null,
        phone: null,
        email: null,
        instagram: null,
        facebook: null,
        youtube: null,
        tiktok: null,
      })),
    });
  }

  return NextResponse.json(result);
}
