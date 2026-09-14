import { sql } from "drizzle-orm";
import { venues } from "@/lib/db/schema";
import { isMultiHallEnabled } from "@/lib/feature-flags";

/**
 * Flag OFF never references halls/organizations. Flag ON publishes a venue
 * only when it is active, its organization (if any) is active, and at least
 * one hall is active.
 */
export function publishedVenuePredicateSql() {
  if (!isMultiHallEnabled()) {
    return sql`${venues.isActive} = true`;
  }
  return sql`(
    ${venues.isActive} = true
    AND (
      ${venues.organizationId} IS NULL
      OR EXISTS (
        SELECT 1
        FROM partner_organizations po
        WHERE po.id = ${venues.organizationId}
          AND po.status = 'active'
      )
    )
    AND EXISTS (
      SELECT 1
      FROM venue_halls vh
      WHERE vh.venue_id = ${venues.id}
        AND vh.status = 'active'
    )
  )`;
}

export function venueMatchesPublication(opts: {
  isActive: boolean;
  organizationId: number | null;
  organizationStatus: string | null | undefined;
  activeHallCount: number;
}): boolean {
  if (!opts.isActive) return false;
  if (!isMultiHallEnabled()) return true;
  if (opts.organizationId != null && opts.organizationStatus !== "active") return false;
  return opts.activeHallCount > 0;
}
