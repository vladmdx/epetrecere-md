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
});

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

  return NextResponse.json(events);
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
  );

  return NextResponse.json({ success: true });
}
