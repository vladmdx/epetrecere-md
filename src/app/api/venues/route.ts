import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getVenues } from "@/lib/db/queries/venues";
import { publicCatalogData } from "@/lib/privacy/public-catalog";
import { catalogSortForPrices, parseCatalogFilters } from "@/lib/venues/catalog-filters";
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

  const citiesParam = params.get("cities");
  const citiesList = citiesParam
    ? citiesParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  const { userId } = await auth();
  const admin = await isAdmin(userId);
  const revealPrices = Boolean(userId);
  const parsedInput = parseCatalogFilters({
    guest_count: params.get("guest_count") ?? params.get("guests") ?? params.get("capacity_min"),
    capacity_max: params.get("capacity_max"),
    price_max: revealPrices ? params.get("price_max") : undefined,
    date: params.get("date"),
    start: params.get("start") ?? params.get("start_time"),
    end: params.get("end") ?? params.get("end_time"),
    page: params.get("page") ?? undefined,
    limit: params.get("limit") ?? undefined,
    sort: params.get("sort") ?? undefined,
  });
  if (parsedInput.invalidFields.length) {
    return NextResponse.json(
      { error: "invalid_filters", fields: parsedInput.invalidFields },
      { status: 400 },
    );
  }

  const filters = {
    capacityMin: parsedInput.guestCount,
    capacityMax: parsedInput.capacityMax,
    priceMax: revealPrices ? parsedInput.priceMax : undefined,
    city: citiesList ? undefined : (params.get("city") || undefined),
    cityKeywords: citiesList,
    availableDate: parsedInput.date,
    startTime: parsedInput.startTime,
    endTime: parsedInput.endTime,
    guestCount: parsedInput.guestCount,
    featured: params.get("featured") === "true" ? true : undefined,
    sort: catalogSortForPrices(parsedInput.sort, revealPrices),
    page: parsedInput.page,
    limit: parsedInput.limit,
    revealPrices,
  };

  const result = await getVenues(filters);

  if (admin) {
    return NextResponse.json(result);
  }

  const redacted = publicCatalogData(result.items, Boolean(userId));

  return NextResponse.json({ ...result, items: redacted });
}
