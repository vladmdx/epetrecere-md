// Live check-in dashboard for the host — shown on event day.
// Displays live count of arrivals, search/filter guests, and a QR code
// print view that can be projected or printed for seat cards.

import { auth } from "@clerk/nextjs/server";
import { redirect, notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, invitations, invitationGuests } from "@/lib/db/schema";
import { revealInvitationGuestRecord } from "@/lib/privacy/guest-encryption";
import { CheckinClient } from "./client";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function CheckinDashboardPage({ params }: Props) {
  const { id } = await params;
  const invitationId = Number(id);
  if (!Number.isFinite(invitationId)) notFound();

  const { userId: clerkId } = await auth();
  if (!clerkId) redirect(`/sign-in?redirect_url=/cabinet/invitatii/${id}/checkin`);

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) redirect("/");

  const [invitation] = await db
    .select()
    .from(invitations)
    .where(
      and(
        eq(invitations.id, invitationId),
        eq(invitations.userId, appUser.id),
      ),
    )
    .limit(1);
  if (!invitation) notFound();

  const guests = await db
    .select()
    .from(invitationGuests)
    .where(eq(invitationGuests.invitationId, invitationId));

  const base =
    process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md";

  // Precompute the check-in URL per guest so the client can render QR codes
  // without a second API call. rsvpToken is required — those without one
  // fall back to "manual check-in only" (rare, legacy rows).
  const guestsWithUrls = guests.map((storedGuest) => {
    const g = revealInvitationGuestRecord(storedGuest);
    return ({
    id: g.id,
    name: g.name,
    rsvpStatus: g.rsvpStatus,
    plusOne: g.plusOne,
    plusOneName: g.plusOneName,
    checkedInAt: g.checkedInAt ? g.checkedInAt.toISOString() : null,
    checkInUrl: g.rsvpToken
      ? `${base}/i/${invitation.slug}/check?token=${g.rsvpToken}`
      : null,
    });
  });

  return (
    <CheckinClient
      invitationId={invitationId}
      invitationTitle={
        invitation.coupleNames || invitation.hostName || "Eveniment"
      }
      eventDate={invitation.eventDate ?? ""}
      guests={guestsWithUrls}
    />
  );
}
