import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import {
  getCalendarEvents,
  bulkSetCalendarEvents,
} from "@/lib/db/queries/calendar";

const getSchema = z.object({
  entity_type: z.enum(["artist", "venue"]),
  entity_id: z.coerce.number(),
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

const postSchema = z.object({
  entity_type: z.enum(["artist", "venue"]),
  entity_id: z.number(),
  dates: z.array(z.string()),
  status: z.enum(["available", "booked", "tentative", "blocked"]),
  note: z.string().nullable().optional(),
  event_type: z.string().nullable().optional(),
});

/** Normalize a date value to YYYY-MM-DD string, handling timezone offsets */
function normalizeDate(d: string | Date): string {
  if (typeof d === "string") {
    // If already YYYY-MM-DD, return as-is
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    // If ISO timestamp, parse and extract local date
    const dt = new Date(d);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
  }
  if (d instanceof Date) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  }
  return String(d);
}

export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = getSchema.safeParse(params);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid params", details: parsed.error.issues }, { status: 400 });
  }

  const events = await getCalendarEvents(
    parsed.data.entity_type,
    parsed.data.entity_id,
    parsed.data.month,
  );

  // Normalize dates to YYYY-MM-DD to avoid timezone issues
  const normalized = events.map((e) => ({
    ...e,
    date: normalizeDate(e.date),
  }));

  return NextResponse.json(normalized);
}

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = postSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", details: parsed.error.issues }, { status: 400 });
  }

  await bulkSetCalendarEvents(
    parsed.data.entity_type,
    parsed.data.entity_id,
    parsed.data.dates,
    parsed.data.status,
    "manual",
    parsed.data.note ?? null,
    parsed.data.event_type ?? null,
  );

  return NextResponse.json({ success: true });
}
