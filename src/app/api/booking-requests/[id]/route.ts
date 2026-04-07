import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { bookingRequests, calendarEvents } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// UPDATE booking request (accept/reject by artist)
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const { action, reply } = body as { action: "accept" | "reject"; reply?: string };

  const [booking] = await db
    .select()
    .from(bookingRequests)
    .where(eq(bookingRequests.id, Number(id)))
    .limit(1);

  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (action === "accept") {
    await db.update(bookingRequests).set({
      status: "accepted",
      artistReply: reply || "Cererea a fost acceptată!",
      updatedAt: new Date(),
    }).where(eq(bookingRequests.id, Number(id)));

    // Block date in calendar
    if (booking.eventDate) {
      await db.insert(calendarEvents).values({
        entityType: "artist",
        entityId: booking.artistId,
        date: booking.eventDate,
        status: "booked",
        source: "booking",
        note: `Rezervare: ${booking.clientName} - ${booking.eventType || "Eveniment"}`,
      });
    }
  } else {
    await db.update(bookingRequests).set({
      status: "rejected",
      artistReply: reply || "Ne pare rău, nu suntem disponibili.",
      updatedAt: new Date(),
    }).where(eq(bookingRequests.id, Number(id)));
  }

  return NextResponse.json({ success: true });
}
