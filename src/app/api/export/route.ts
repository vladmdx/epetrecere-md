import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { artists, leads, bookings } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type") || "artists";

  let data: Record<string, unknown>[] = [];
  let filename = "export.csv";

  if (type === "artists") {
    const rows = await db.select({
      id: artists.id, name: artists.nameRo, slug: artists.slug,
      location: artists.location, priceFrom: artists.priceFrom,
      ratingAvg: artists.ratingAvg, isActive: artists.isActive,
      email: artists.email, phone: artists.phone,
    }).from(artists).orderBy(desc(artists.createdAt));
    data = rows;
    filename = "artists-export.csv";
  } else if (type === "leads") {
    const rows = await db.select({
      id: leads.id, name: leads.name, phone: leads.phone,
      email: leads.email, eventType: leads.eventType,
      eventDate: leads.eventDate, budget: leads.budget,
      status: leads.status, score: leads.score, source: leads.source,
      createdAt: leads.createdAt,
    }).from(leads).orderBy(desc(leads.createdAt));
    data = rows;
    filename = "leads-export.csv";
  } else if (type === "bookings") {
    const rows = await db.select().from(bookings).orderBy(desc(bookings.createdAt));
    data = rows;
    filename = "bookings-export.csv";
  }

  if (!data.length) {
    return NextResponse.json({ error: "No data" }, { status: 404 });
  }

  // Convert to CSV
  const headers = Object.keys(data[0]);
  const csvRows = [
    headers.join(","),
    ...data.map(row => headers.map(h => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      const str = String(val);
      return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(",")),
  ];

  return new NextResponse(csvRows.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
