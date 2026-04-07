import { NextRequest, NextResponse } from "next/server";
import { getVenues } from "@/lib/db/queries/venues";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  const filters = {
    capacityMin: params.get("capacity_min") ? Number(params.get("capacity_min")) : undefined,
    capacityMax: params.get("capacity_max") ? Number(params.get("capacity_max")) : undefined,
    priceMax: params.get("price_max") ? Number(params.get("price_max")) : undefined,
    city: params.get("city") || undefined,
    featured: params.get("featured") === "true" ? true : undefined,
    sort: (params.get("sort") as "popular" | "price_asc" | "price_desc" | "rating" | "capacity") || undefined,
    page: params.get("page") ? Number(params.get("page")) : 1,
    limit: params.get("limit") ? Number(params.get("limit")) : 12,
  };

  const result = await getVenues(filters);
  return NextResponse.json(result);
}
