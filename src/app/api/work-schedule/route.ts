import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { workSchedule, artists, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// GET work schedule for an artist (public — used by calendar widget)
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

// SET work schedule (replace all for artist) — auth + ownership required
export async function POST(req: Request) {
  const { userId: clerkId } = await auth();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { artistId, schedule } = body as {
    artistId: number;
    schedule: { dayOfWeek: number; startTime: string; endTime: string; isWorking: boolean }[];
  };

  if (!artistId || !schedule) {
    return NextResponse.json({ error: "artistId and schedule required" }, { status: 400 });
  }

  // Verify ownership: signed-in user must own this artist
  const [appUser] = await db.select({ id: users.id }).from(users).where(eq(users.clerkId, clerkId)).limit(1);
  if (!appUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [artist] = await db.select({ userId: artists.userId }).from(artists).where(eq(artists.id, artistId)).limit(1);
  if (!artist || artist.userId !== appUser.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
