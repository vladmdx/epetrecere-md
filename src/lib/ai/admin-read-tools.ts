import { z } from "zod/v4";
import { eq, ilike, inArray, or, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { artists, venues, bookingRequests } from "@/lib/db/schema";
import { plainText } from "@/lib/content/plain-text";
import { redactContact } from "@/lib/privacy/contact-redaction";

const profileLookup = z.object({
  type: z.enum(["artist", "venue"]),
  id: z.number().int().positive().safe().optional(),
  name: z.string().trim().min(2).max(120).optional(),
}).refine(input => input.id !== undefined || input.name !== undefined);
const bookingLookup = z.object({ booking_ids: z.array(z.number().int().positive().safe()).min(1).max(10) });
const label = (value: string | null) => value === null ? null : redactContact(plainText(value));

/** Role comes only from the authenticated server context, not from tool input. */
export async function executeAdminReadTool(name: string, input: unknown, verifiedRole?: string) {
  if (verifiedRole !== "admin" && verifiedRole !== "super_admin") return { error: "Admin context required" };

  if (name === "get_vendor_profile_status") {
    const parsed = profileLookup.safeParse(input);
    if (!parsed.success) return { error: "Provide artist/venue type and a positive id or a name of 2–120 characters" };
    const { type, id, name: searchName } = parsed.data;
    const table = type === "artist" ? artists : venues;
    // User/model text is a parameter, and LIKE wildcards are literal search characters.
    const pattern = `%${(searchName ?? "").replace(/[\\%_]/g, "\\$&")}%`;
    const matches = await db.select({
      id: table.id, nameRo: table.nameRo, nameRu: table.nameRu, nameEn: table.nameEn,
      isActive: table.isActive,
      city: type === "artist" ? artists.baseCity : venues.city,
    }).from(table).where(id !== undefined ? eq(table.id, id) : or(
      ilike(table.nameRo, pattern), ilike(table.nameRu, pattern), ilike(table.nameEn, pattern),
    )).orderBy(asc(table.id)).limit(10);
    return { type, matches: matches.map(row => ({
      id: row.id, nameRo: label(row.nameRo), nameRu: label(row.nameRu), nameEn: label(row.nameEn),
      city: label(row.city), isActive: row.isActive,
    })) };
  }

  if (name === "get_booking_status_by_id") {
    const parsed = bookingLookup.safeParse(input);
    if (!parsed.success) return { error: "Provide 1–10 positive booking IDs" };
    const ids = [...new Set(parsed.data.booking_ids)];
    const matches = await db.select({
      id: bookingRequests.id, artistId: bookingRequests.artistId, venueId: bookingRequests.venueId,
      status: bookingRequests.status, eventDate: bookingRequests.eventDate,
      startTime: bookingRequests.startTime, endTime: bookingRequests.endTime,
      agreedPrice: bookingRequests.agreedPrice,
    }).from(bookingRequests).where(inArray(bookingRequests.id, ids)).orderBy(asc(bookingRequests.id));
    return { matches, notFoundIds: ids.filter(id => !matches.some(booking => booking.id === id)) };
  }
  return { error: "Unknown admin read tool" };
}
