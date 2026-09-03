import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getVenues } from "@/lib/db/queries/venues";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { publicCatalogData } from "@/lib/privacy/public-catalog";

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

  const citiesParam = params.get("cities");
  const citiesList = citiesParam
    ? citiesParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  const filters = {
    capacityMin: params.get("capacity_min") ? Number(params.get("capacity_min")) : undefined,
    capacityMax: params.get("capacity_max") ? Number(params.get("capacity_max")) : undefined,
    priceMax: params.get("price_max") ? Number(params.get("price_max")) : undefined,
    city: citiesList ? undefined : (params.get("city") || undefined),
    cityKeywords: citiesList,
    availableDate: params.get("date") || undefined,
    featured: params.get("featured") === "true" ? true : undefined,
    sort: (params.get("sort") as "popular" | "price_asc" | "price_desc" | "rating" | "capacity") || undefined,
    page: params.get("page") ? Number(params.get("page")) : 1,
    limit: params.get("limit") ? Number(params.get("limit")) : 12,
  };

  const result = await getVenues(filters);

  // Phone and email admin-only. Price and website visible to authed users.
  const { userId } = await auth();
  const admin = await isAdmin(userId);

  if (admin) {
    return NextResponse.json(result);
  }

  const redacted = publicCatalogData(result.items, Boolean(userId));

  return NextResponse.json({ ...result, items: redacted });
}
