import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

/** Retired: credits or a self-reported lead status cannot unlock personal data. */
export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    error: "Contact details are available only in a bilaterally confirmed booking.",
    code: "BOOKING_CONFIRMATION_REQUIRED",
  }, { status: 410, headers: { "Cache-Control": "private, no-store" } });
}
