// Venue-specific settings — spec section 11.
//
// Auto-reply, calendar visibility, notifications (placeholder), GDPR.

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, venues } from "@/lib/db/schema";
import { getVenueIcalToken } from "@/lib/calendar/ical-token";
import { VenueSettingsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function VenueSettingsPage() {
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect("/sign-in?redirect_url=/dashboard/sala/setari");

  const [appUser] = await db
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
      languagePref: users.languagePref,
      notificationDigestFrequency: users.notificationDigestFrequency,
    })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) redirect("/");

  const [venue] = await db
    .select({
      id: venues.id,
      nameRo: venues.nameRo,
      calendarEnabled: venues.calendarEnabled,
      autoReplyEnabled: venues.autoReplyEnabled,
      autoReplyMessage: venues.autoReplyMessage,
      bufferHours: venues.bufferHours,
    })
    .from(venues)
    .where(eq(venues.userId, appUser.id))
    .limit(1);
  if (!venue) redirect("/dashboard");

  const icalToken = getVenueIcalToken(venue.id);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md";
  const icalUrl = `${baseUrl}/api/calendar/venue-ical/${venue.id}/${icalToken}.ics`;

  return (
    <VenueSettingsClient
      venue={{
        id: venue.id,
        nameRo: venue.nameRo,
        calendarEnabled: venue.calendarEnabled,
        autoReplyEnabled: venue.autoReplyEnabled,
        autoReplyMessage: venue.autoReplyMessage,
        bufferHours: venue.bufferHours,
      }}
      userEmail={appUser.email}
      userPhone={appUser.phone}
      userLanguage={appUser.languagePref ?? "ro"}
      icalUrl={icalUrl}
      notificationDigestFrequency={appUser.notificationDigestFrequency}
    />
  );
}
