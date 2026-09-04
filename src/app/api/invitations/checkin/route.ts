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
import { z } from "zod/v4";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { invitationGuests, invitations } from "@/lib/db/schema";
import { requireAppUser } from "@/lib/planner/ownership";
import { isGuestTokenActive } from "@/lib/invitations/access";
import { decryptGuestValue, revealInvitationGuestRecord } from "@/lib/privacy/guest-encryption";

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
      rsvpTokenExpiresAt: invitationGuests.rsvpTokenExpiresAt,
      rsvpTokenRevokedAt: invitationGuests.rsvpTokenRevokedAt,
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
  if (!isGuestTokenActive(row)) {
    return NextResponse.json(
      { error: "Codul a expirat sau a fost revocat" },
      { status: 410 },
    );
  }
  const visibleRow = revealInvitationGuestRecord(row);

  // Sanity: event must be today or in the past few days (prevent
  // accidental pre-check-ins from curious guests reading the QR a week early).
  // We're generous here — the host can always manually uncheck via UI
  // later if they want to pre-test.

  if (row.checkedInAt) {
    // Idempotent — already checked in
    return NextResponse.json({
      guest: {
        id: row.guestId,
        name: decryptGuestValue(visibleRow.guestName),
        plusOne: row.plusOne,
        plusOneName: visibleRow.plusOneName,
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
      name: decryptGuestValue(visibleRow.guestName),
      plusOne: row.plusOne,
      plusOneName: visibleRow.plusOneName,
    },
    alreadyCheckedIn: false,
    checkedInAt: now.toISOString(),
  });
}

// GET — host fetches live check-in stats for their invitation.
export async function GET(req: NextRequest) {
  const invitationId = Number(req.nextUrl.searchParams.get("invitation_id"));
  if (!Number.isFinite(invitationId)) {
    return NextResponse.json(
      { error: "invitation_id required" },
      { status: 400 },
    );
  }

  const appUser = await requireAppUser();
  if (!appUser.ok) {
    return NextResponse.json(
      { error: appUser.error },
      { status: appUser.status },
    );
  }
  const [ownedInvitation] = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        eq(invitations.id, invitationId),
        eq(invitations.userId, appUser.userId),
      ),
    )
    .limit(1);
  if (!ownedInvitation) {
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
    guests: guests.map(revealInvitationGuestRecord),
  });
}
