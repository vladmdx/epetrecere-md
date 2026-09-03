import { NextResponse, type NextRequest } from "next/server";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, venues } from "@/lib/db/schema";

/** Validate client-side history against current publication/deletion state. */
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type");
  const slugs = (req.nextUrl.searchParams.get("slugs") ?? "").split(",").filter(s => /^[a-zA-Z0-9_-]{1,200}$/.test(s)).slice(0,10);
  if (!slugs.length || !["artist","venue"].includes(type ?? "")) return NextResponse.json({slugs:[]});
  const table = type === "artist" ? artists : venues;
  const rows = await db.select({slug:table.slug}).from(table).where(and(eq(table.isActive,true),inArray(table.slug,slugs)));
  return NextResponse.json({slugs:rows.map(r=>r.slug)},{headers:{"Cache-Control":"no-store"}});
}
