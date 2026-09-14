import { and, eq, ilike, or, type SQL } from "drizzle-orm";
import { partnerOrganizations, venues } from "@/lib/db/schema";
import { escapeIlikePattern, type AdminVenueStatusFilter } from "./venue-list";

export function adminVenueListConditions(query: {
  q: string | null;
  status: AdminVenueStatusFilter | null;
}): SQL | undefined {
  const parts: SQL[] = [];
  if (query.q) {
    const pattern = `%${escapeIlikePattern(query.q)}%`;
    const search = or(
      ilike(venues.nameRo, pattern),
      ilike(venues.nameRu, pattern),
      ilike(venues.nameEn, pattern),
      ilike(venues.city, pattern),
    );
    if (search) parts.push(search);
  }
  if (query.status === "published") {
    parts.push(eq(venues.isActive, true));
  } else if (query.status === "unpublished") {
    parts.push(eq(venues.isActive, false));
  } else if (query.status) {
    parts.push(eq(partnerOrganizations.status, query.status));
  }
  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0] : and(...parts);
}
