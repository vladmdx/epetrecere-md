// Guest check-in — called when a guest's QR code is scanned at the event.
//
// Flow:
//   1. Host prints a guest list with unique QR codes (one per guest).
//      Each QR encodes the URL: https://epetrecere.md/i/<slug>/check?token=<rsvpToken>
//   2. Guest arrives, host scans with phone camera → opens that URL
//   3. The page fires POST /api/invitations/checkin with the token
//   4. If valid + not already checked in → update checkedInAt = NOW()
//   5. UI shows "Bun venit, <name>!" + live counter updates for host
//
// Check-ins are idempotent: a second scan returns the existing timestamp
// so the UI can show "Deja check-in la 14:32".
//
// Security: rsvpToken is unique + unguessable (32+ chars), same token
// used for RSVP. Anyone with the token can check in the guest — which is
// fine because QR codes are physically distributed (printed on placecards
// or pre-sent via email).

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod/v4";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { invitationGuests, invitations, users } from "@/lib/db/schema";

const schema = z.object({
  token: z.string().min(8).max(200),
});

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "token required" },
      { status: 400 },
    );
  }

  const [row] = await db
    .select({
      guestId: invitationGuests.id,
      guestName: invitationGuests.name,
      checkedInAt: invitationGuests.checkedInAt,
      plusOne: invitationGuests.plusOne,
      plusOneName: invitationGuests.plusOneName,
      invitationId: invitationGuests.invitationId,
      invitationSlug: invitations.slug,
      eventDate: invitations.eventDate,
    })
    .from(invitationGuests)
    .innerJoin(invitations, eq(invitations.id, invitationGuests.invitationId))
    .where(eq(invitationGuests.rsvpToken, parsed.data.token))
    .limit(1);

  if (!row) {
    return NextResponse.json(
      { error: "QR code invalid sau invitat necunoscut" },
      { status: 404 },
    );
  }

  // Sanity: event must be today or in the past few days (prevent
  // accidental pre-check-ins from curious guests reading the QR a week early).
  // We're generous here — the host can always manually uncheck via UI
  // later if they want to pre-test.

  if (row.checkedInAt) {
    // Idempotent — already checked in
    return NextResponse.json({
      guest: {
        id: row.guestId,
        name: row.guestName,
        plusOne: row.plusOne,
        plusOneName: row.plusOneName,
      },
      alreadyCheckedIn: true,
      checkedInAt: row.checkedInAt,
    });
  }

  const now = new Date();
  await db
    .update(invitationGuests)
    .set({ checkedInAt: now })
    .where(eq(invitationGuests.id, row.guestId));

  return NextResponse.json({
    guest: {
      id: row.guestId,
      name: row.guestName,
      plusOne: row.plusOne,
      plusOneName: row.plusOneName,
    },
    alreadyCheckedIn: false,
    checkedInAt: now.toISOString(),
  });
}

// GET — host fetches live check-in stats for their invitation.
//
// Security: unlike POST (which is authorized by the unguessable per-guest
// rsvpToken), GET returns the FULL guest list — names, RSVP status, plus-one
// details, check-in times — which is host-only PII. invitation_id is a
// sequential serial, so without an ownership check anyone could enumerate
// ids and dump every event's guest list (IDOR). We therefore require the
// caller to be signed in AND to own the invitation.
export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const invitationId = Number(req.nextUrl.searchParams.get("invitation_id"));
  if (!Number.isFinite(invitationId)) {
    return NextResponse.json(
      { error: "invitation_id required" },
      { status: 400 },
    );
  }

  // Resolve the caller's DB user and confirm they own this invitation.
  // Return 404 (not 403) for both missing and not-owned so the endpoint
  // doesn't leak which invitation ids exist.
  const [inv] = await db
    .select({ ownerId: invitations.userId })
    .from(invitations)
    .where(eq(invitations.id, invitationId))
    .limit(1);

  const [caller] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);

  if (!inv || !caller || inv.ownerId !== caller.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const guests = await db
    .select({
      id: invitationGuests.id,
      name: invitationGuests.name,
      rsvpStatus: invitationGuests.rsvpStatus,
      plusOne: invitationGuests.plusOne,
      plusOneName: invitationGuests.plusOneName,
      checkedInAt: invitationGuests.checkedInAt,
    })
    .from(invitationGuests)
    .where(eq(invitationGuests.invitationId, invitationId));

  // Simple aggregate stats for the live banner
  const total = guests.length;
  const confirmed = guests.filter((g) => g.rsvpStatus === "yes").length;
  const checkedIn = guests.filter((g) => g.checkedInAt !== null).length;
  const expectedWithPlusOnes =
    guests.reduce(
      (acc, g) =>
        acc + (g.rsvpStatus === "yes" ? 1 + (g.plusOne ? 1 : 0) : 0),
      0,
    );

  return NextResponse.json({
    stats: {
      total,
      confirmed,
      checkedIn,
      expectedWithPlusOnes,
    },
    guests,
  });
}
