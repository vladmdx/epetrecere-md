import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getVenues } from "@/lib/db/queries/venues";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;

  const filters = {
    capacityMin: params.get("capacity_min") ? Number(params.get("capacity_min")) : undefined,
    capacityMax: params.get("capacity_max") ? Number(params.get("capacity_max")) : undefined,
    priceMax: params.get("price_max") ? Number(params.get("price_max")) : undefined,
    city: params.get("city") || undefined,
    availableDate: params.get("date") || undefined,
    featured: params.get("featured") === "true" ? true : undefined,
    sort: (params.get("sort") as "popular" | "price_asc" | "price_desc" | "rating" | "capacity") || undefined,
    page: params.get("page") ? Number(params.get("page")) : 1,
    limit: params.get("limit") ? Number(params.get("limit")) : 12,
  };

  const result = await getVenues(filters);

  // M0a #8 — price gated behind login.
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({
      ...result,
      items: result.items.map((v) => ({
        ...v,
        pricePerPerson: null,
        phone: null,
        email: null,
        website: null,
      })),
    });
  }

  return NextResponse.json(result);
}
