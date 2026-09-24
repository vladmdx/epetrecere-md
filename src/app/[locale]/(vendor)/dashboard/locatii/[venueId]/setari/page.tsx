// Venue-specific settings — spec section 11.
//
// Auto-reply, calendar visibility, notifications (placeholder), GDPR.

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, venues } from "@/lib/db/schema";
import { getVenueIcalTokenForUser } from "@/lib/calendar/ical-token";
import { VenueSettingsClient } from "../../../sala/setari/client";
import { requireLocatieVenue, venueDashboardBase } from "@/lib/venues/dashboard-scope";
import { DEFAULT_LOCALE, isLocale, localizePath } from "@/lib/i18n/routing";

export const dynamic = "force-dynamic";

export default async function VenueSettingsPage({
  params,
}: {
  params: Promise<{ locale: string; venueId: string }>;
}) {
  const { locale: rawLocale, venueId } = await params;
  const locale = isLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
  const scoped = await requireLocatieVenue(venueId, locale);
  const { userId: clerkId } = await auth();
  if (!clerkId) redirect(`${localizePath("/sign-in", locale)}?redirect_url=${encodeURIComponent(localizePath(`${venueDashboardBase(scoped.id)}/setari`, locale))}`);

  const [appUser] = await db
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
      languagePref: users.languagePref,
      timezone: users.timezone,
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
    .where(eq(venues.id, scoped.id))
    .limit(1);
  if (!venue) redirect(localizePath("/dashboard/locatii", locale));

  const icalToken = await getVenueIcalTokenForUser(venue.id, appUser.id);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://epetrecere.md";
  const icalUrl = icalToken
    ? `${baseUrl}/api/calendar/venue-ical/${venue.id}/${icalToken}.ics`
    : null;

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
      userTimezone={appUser.timezone ?? "Europe/Chisinau"}
      icalUrl={icalUrl}
      notificationDigestFrequency={appUser.notificationDigestFrequency}
      organizationId={scoped.organizationId}
    />
  );
}
