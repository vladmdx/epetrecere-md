import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { workSchedule } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// GET work schedule for an artist
export async function GET(req: NextRequest) {
  const artistId = req.nextUrl.searchParams.get("artist_id");
  if (!artistId) return NextResponse.json({ error: "artist_id required" }, { status: 400 });

  const schedule = await db
    .select()
    .from(workSchedule)
    .where(eq(workSchedule.artistId, Number(artistId)))
    .orderBy(workSchedule.dayOfWeek);

  return NextResponse.json(schedule);
}

// SET work schedule (replace all for artist)
export async function POST(req: Request) {
  const body = await req.json();
  const { artistId, schedule } = body as {
    artistId: number;
    schedule: { dayOfWeek: number; startTime: string; endTime: string; isWorking: boolean }[];
  };

  if (!artistId || !schedule) {
    return NextResponse.json({ error: "artistId and schedule required" }, { status: 400 });
  }

  // Delete existing schedule
  await db.delete(workSchedule).where(eq(workSchedule.artistId, artistId));

  // Insert new
  if (schedule.length > 0) {
    await db.insert(workSchedule).values(
      schedule.map((s) => ({ artistId, ...s })),
    );
  }

  return NextResponse.json({ success: true });
}
