/**
 * Resolve which venue a dashboard page should operate on.
 * URL/body id is input only; authorization always goes through venue-access.
 * server-only.
 */
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users, venues } from "@/lib/db/schema";
import { getCurrentAppUser, listAccessibleVenueIds, resolveSelectedVenue } from "@/lib/venue-access";
import { isMultiHallEnabled } from "@/lib/feature-flags";
import { DEFAULT_LOCALE, localizePath, type AppLocale } from "@/lib/i18n/routing";
import { readLastVenueCookie, writeLastVenueCookie } from "./last-selected";

export type DashboardVenue = {
  id: number;
  organizationId: number | null;
  nameRo: string;
  slug: string;
  isActive: boolean;
};

export async function loadAuthorizedDashboardVenue(
  requestedVenueId?: number | null,
): Promise<DashboardVenue | null> {
  const user = await getCurrentAppUser();
  if (!user) return null;
  const cookieId = requestedVenueId == null ? await readLastVenueCookie() : null;
  const selection = await resolveSelectedVenue(
    user.id,
    requestedVenueId ?? cookieId,
  );
  if (!selection.ok) return null;
  const [venue] = await db
    .select({
      id: venues.id,
      organizationId: venues.organizationId,
      nameRo: venues.nameRo,
      slug: venues.slug,
      isActive: venues.isActive,
    })
    .from(venues)
    .where(eq(venues.id, selection.venueId))
    .limit(1);
  if (venue) await writeLastVenueCookie(venue.id);
  return venue ?? null;
}

/**
 * Compatibility redirects for `/dashboard/sala/*`.
 *  - one accessible venue → new canonical route
 *  - several + valid cookie/query → selected venue
 *  - several without selection → /dashboard/locatii
 *  - zero → venue onboarding
 */
export async function redirectLegacySalaPath(opts: {
  locale: AppLocale;
  restPath: string;
  requestedVenueId?: number | null;
}): Promise<never> {
  if (!isMultiHallEnabled()) {
    throw new Error("redirectLegacySalaPath is a MULTI_HALL-only compatibility path");
  }
  const locale = opts.locale || DEFAULT_LOCALE;
  const user = await getCurrentAppUser();
  if (!user) {
    redirect(
      `${localizePath("/sign-in", locale)}?redirect_url=${encodeURIComponent(localizePath("/dashboard/sala", locale))}`,
    );
  }
  const ids = await listAccessibleVenueIds(user.id);
  const rest = opts.restPath.replace(/\/$/, "");
  if (ids.length === 0) {
    redirect(localizePath("/dashboard/venue-onboarding", locale));
  }
  const cookieId = await readLastVenueCookie();
  const requested = opts.requestedVenueId ?? cookieId;
  if (requested != null && ids.includes(requested)) {
    await writeLastVenueCookie(requested);
    redirect(localizePath(`/dashboard/locatii/${requested}${rest}`, locale));
  }
  if (ids.length === 1) {
    await writeLastVenueCookie(ids[0]);
    redirect(localizePath(`/dashboard/locatii/${ids[0]}${rest}`, locale));
  }
  redirect(localizePath("/dashboard/locatii", locale));
}

export async function requireSignedInUserId(): Promise<string | null> {
  const [row] = await (async () => {
    const user = await getCurrentAppUser();
    if (!user) return [];
    return db.select({ id: users.id }).from(users).where(eq(users.id, user.id)).limit(1);
  })();
  return row?.id ?? null;
}

export function venueDashboardBase(venueId: number): string {
  return `/dashboard/locatii/${venueId}`;
}

export async function requireLocatieVenue(
  venueIdRaw: string | number,
  locale: AppLocale = DEFAULT_LOCALE,
): Promise<DashboardVenue> {
  const venueId = Number(venueIdRaw);
  if (!Number.isFinite(venueId) || venueId <= 0) {
    redirect(localizePath("/dashboard/locatii", locale));
  }
  const venue = await loadAuthorizedDashboardVenue(venueId);
  if (!venue) redirect(localizePath("/dashboard/locatii", locale));
  return venue;
}
