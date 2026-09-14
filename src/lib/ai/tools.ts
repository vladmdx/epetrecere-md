import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { artists, leads, bookings, bookingRequests, venues, calendarEvents } from "@/lib/db/schema";
import { redactContact } from "@/lib/privacy/contact-redaction";
import { eq, and, sql, desc, gte, count } from "drizzle-orm";
import { executeAdminReadTool } from "./admin-read-tools";
import { normalizeCalendarDates } from "@/lib/booking/calendar-write";
import { bulkSetCalendarEvents } from "@/lib/db/queries/calendar";
import {
  CalendarWriteAuthorizationError,
  artistCalendarWriteAuthorization,
} from "@/lib/booking/calendar-write-authorization";
import { acquireLegalScopeLocks } from "@/lib/booking/advisory-locks";
import { getLockedAppUserById } from "@/lib/venue-access";

const VALID_LEAD_STATUSES = [
  "new",
  "contacted",
  "proposal_sent",
  "negotiation",
  "confirmed",
  "completed",
  "lost",
  "follow_up",
] as const;

// Tool definitions for Claude
export const adminTools: Anthropic.Tool[] = [
  {
    name: "get_vendor_profile_status",
    description: "Read-only lookup of an artist or venue by exact ID or name in any supported language. Returns minimal profile names, city and isActive publication flag. false means not published, not necessarily rejected. No contacts or legal data.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: { type: "string", enum: ["artist", "venue"] },
        id: { type: "integer", minimum: 1, description: "Exact profile ID; takes precedence over name" },
        name: { type: "string", minLength: 2, maxLength: 120, description: "Name or a specific name fragment; required when id is omitted" },
      },
      required: ["type"],
      additionalProperties: false,
    },
  },
  {
    name: "get_booking_status_by_id",
    description: "Read-only status of 1–10 exact booking request IDs, with vendor IDs and event interval. accepted is an offer accepted by vendor, NOT final bilateral confirmation; confirmed_by_client is final confirmation. No client contacts, legal documents or guest data.",
    input_schema: {
      type: "object" as const,
      properties: { booking_ids: { type: "array", minItems: 1, maxItems: 10, items: { type: "integer", minimum: 1 } } },
      required: ["booking_ids"],
      additionalProperties: false,
    },
  },
  {
    name: "get_artists",
    description: "Get list of artists with optional filters. Returns id, name, category, price, rating, isActive.",
    input_schema: {
      type: "object" as const,
      properties: {
        active_only: { type: "boolean", description: "Filter only active artists" },
        featured_only: { type: "boolean", description: "Filter only featured artists" },
        without_description: { type: "boolean", description: "Filter artists missing description" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
    },
  },
  {
    name: "get_leads",
    description: "Get leads/requests with optional status filter. Returns name, eventType, eventDate, budget, status, score.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", description: "Filter by status: new, contacted, proposal_sent, negotiation, confirmed, completed, lost" },
        limit: { type: "number", description: "Max results (default 20)" },
      },
    },
  },
  {
    name: "get_analytics",
    description: "Get platform analytics: total artists, venues, leads, bookings, and recent activity.",
    input_schema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "update_lead_status",
    description: "Change the status of a lead.",
    input_schema: {
      type: "object" as const,
      properties: {
        lead_id: { type: "number", description: "Lead ID" },
        status: { type: "string", description: "New status" },
      },
      required: ["lead_id", "status"],
    },
  },
  {
    name: "generate_description",
    description: "Generate or improve an artist description using AI. Returns the new text.",
    input_schema: {
      type: "object" as const,
      properties: {
        artist_id: { type: "number", description: "Artist ID" },
        language: { type: "string", description: "Language: ro, ru, or en" },
      },
      required: ["artist_id"],
    },
  },
];

export const vendorTools: Anthropic.Tool[] = [
  {
    name: "get_my_bookings",
    description: "Get the vendor's bookings. Returns event details and status.",
    input_schema: {
      type: "object" as const,
      properties: {
        status: { type: "string", description: "Filter by status: pending, accepted, confirmed_by_client, completed, rejected, cancelled" },
      },
    },
  },
  {
    name: "get_my_calendar",
    description: "Get the vendor's calendar events for a given month.",
    input_schema: {
      type: "object" as const,
      properties: {
        month: { type: "string", description: "Month in YYYY-MM format" },
      },
      required: ["month"],
    },
  },
  {
    name: "update_my_calendar",
    description: "Update calendar availability for specific dates.",
    input_schema: {
      type: "object" as const,
      properties: {
        dates: {
          type: "array",
          minItems: 1,
          maxItems: 31,
          uniqueItems: true,
          items: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          description: "Unique real dates in YYYY-MM-DD format (maximum 31)",
        },
        status: {
          type: "string",
          enum: ["available", "booked", "tentative", "blocked"],
          description: "Calendar status",
        },
      },
      required: ["dates", "status"],
    },
  },
];

// Tool execution
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  _vendorArtistId?: number,
  verifiedAdminRole?: "admin" | "super_admin",
  actorUserId?: string,
): Promise<string> {
  // Enforce role boundaries here as well as in the chat route; model output is untrusted.
  if (_vendorArtistId !== undefined && !vendorTools.some(tool => tool.name === name)) {
    return JSON.stringify({ error: "Tool not permitted for vendor context" });
  }
  try {
    switch (name) {
      case "get_vendor_profile_status":
      case "get_booking_status_by_id":
        return JSON.stringify(await executeAdminReadTool(name, input, verifiedAdminRole));
      case "get_artists": {
        const conditions = [];
        if (input.active_only) conditions.push(eq(artists.isActive, true));
        if (input.featured_only) conditions.push(eq(artists.isFeatured, true));
        if (input.without_description) conditions.push(sql`${artists.descriptionRo} IS NULL OR ${artists.descriptionRo} = ''`);

        const result = await db
          .select({
            id: artists.id,
            name: artists.nameRo,
            slug: artists.slug,
            priceFrom: artists.priceFrom,
            ratingAvg: artists.ratingAvg,
            isActive: artists.isActive,
            isFeatured: artists.isFeatured,
            hasDescription: sql<boolean>`${artists.descriptionRo} IS NOT NULL AND ${artists.descriptionRo} != ''`,
          })
          .from(artists)
          .where(conditions.length ? and(...conditions) : undefined)
          .limit((input.limit as number) || 20)
          .orderBy(desc(artists.createdAt));

        return JSON.stringify(result);
      }

      case "get_leads": {
        const validLeadStatuses = ["new", "contacted", "qualified", "converted", "lost"];
        const conditions = [];
        if (input.status && validLeadStatuses.includes(input.status as string)) {
          conditions.push(sql`${leads.status} = ${input.status as string}`);
        }

        const result = await db
          .select({
            id: leads.id,
            name: leads.name,
            phone: leads.phone,
            eventType: leads.eventType,
            eventDate: leads.eventDate,
            budget: leads.budget,
            status: leads.status,
            score: leads.score,
            source: leads.source,
            createdAt: leads.createdAt,
          })
          .from(leads)
          .where(conditions.length ? and(...conditions) : undefined)
          .limit((input.limit as number) || 20)
          .orderBy(desc(leads.createdAt));

        return JSON.stringify(result);
      }

      case "get_analytics": {
        const [artistCount] = await db.select({ count: count() }).from(artists).where(eq(artists.isActive, true));
        const [venueCount] = await db.select({ count: count() }).from(venues).where(eq(venues.isActive, true));
        const [leadCount] = await db.select({ count: count() }).from(leads);
        const [newLeadCount] = await db.select({ count: count() }).from(leads).where(eq(leads.status, "new"));
        const [bookingCount] = await db.select({ count: count() }).from(bookings);

        return JSON.stringify({
          artists_active: artistCount.count,
          venues_active: venueCount.count,
          total_leads: leadCount.count,
          new_leads: newLeadCount.count,
          total_bookings: bookingCount.count,
        });
      }

      case "update_lead_status": {
        const leadId = input.lead_id;
        const status = input.status;
        if (
          !actorUserId
          || !Number.isSafeInteger(leadId)
          || (leadId as number) < 1
          || typeof status !== "string"
          || !VALID_LEAD_STATUSES.includes(
            status as (typeof VALID_LEAD_STATUSES)[number],
          )
        ) {
          return JSON.stringify({ error: "Invalid or missing admin write context" });
        }
        return db.transaction(async (tx) => {
          const executor = tx as unknown as typeof db;
          await acquireLegalScopeLocks(tx, { userIds: [actorUserId] });
          const actor = await getLockedAppUserById(actorUserId, executor);
          if (!actor?.isGlobalAdmin) {
            return JSON.stringify({ error: "Admin authorization changed" });
          }
          const [target] = await executor
            .select({ id: leads.id })
            .from(leads)
            .where(eq(leads.id, leadId as number))
            .for("update")
            .limit(1);
          if (!target) return JSON.stringify({ error: "Lead not found" });
          await executor
            .update(leads)
            .set({
              status: status as (typeof VALID_LEAD_STATUSES)[number],
              updatedAt: new Date(),
            })
            .where(eq(leads.id, target.id));
          return JSON.stringify({
            success: true,
            lead_id: target.id,
            new_status: status,
          });
        });
      }

      case "get_my_bookings": {
        if (!_vendorArtistId) return JSON.stringify({ error: "No artist context" });
        const conditions = [eq(bookingRequests.artistId, _vendorArtistId)];
        if (input.status) {
          const validBookingStatuses = ["pending", "accepted", "confirmed_by_client", "completed", "rejected", "cancelled"];
          if (validBookingStatuses.includes(input.status as string)) {
            conditions.push(sql`${bookingRequests.status} = ${input.status as string}`);
          }
        }
        const result = await db
          .select({
            id: bookingRequests.id,
            eventDate: bookingRequests.eventDate,
            startTime: bookingRequests.startTime,
            endTime: bookingRequests.endTime,
            eventType: bookingRequests.eventType,
            guestCount: bookingRequests.guestCount,
            agreedPrice: bookingRequests.agreedPrice,
            status: bookingRequests.status,
            paidStatus: bookingRequests.paidStatus,
          })
          .from(bookingRequests)
          .where(and(...conditions))
          .limit(20)
          .orderBy(desc(bookingRequests.createdAt));
        return JSON.stringify(result.map(row => ({...row, eventType: row.eventType ? redactContact(row.eventType) : null})));
      }

      case "get_my_calendar": {
        if (!_vendorArtistId) return JSON.stringify({ error: "No artist context" });
        const month = input.month as string;
        const [year, mon] = month.split("-").map(Number);
        const startDate = `${year}-${String(mon).padStart(2, "0")}-01`;
        const lastDay = new Date(year, mon, 0).getDate();
        const endDate = `${year}-${String(mon).padStart(2, "0")}-${lastDay}`;

        const result = await db
          .select({ date: calendarEvents.date, status: calendarEvents.status })
          .from(calendarEvents)
          .where(
            and(
              eq(calendarEvents.entityType, "artist"),
              eq(calendarEvents.entityId, _vendorArtistId),
              gte(calendarEvents.date, startDate),
              sql`${calendarEvents.date} <= ${endDate}`,
            ),
          );
        return JSON.stringify(result);
      }

      case "update_my_calendar": {
        if (!_vendorArtistId || !actorUserId) {
          return JSON.stringify({ error: "No authorized artist context" });
        }
        const dates = normalizeCalendarDates(
          Array.isArray(input.dates) ? input.dates : [],
          { maxDates: 31, rejectDuplicates: true },
        );
        const status = input.status as string;
        const validStatuses = ["available", "booked", "tentative", "blocked"] as const;
        type CalStatus = (typeof validStatuses)[number];
        if (!validStatuses.includes(status as CalStatus)) {
          return JSON.stringify({ error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` });
        }
        const typedStatus = status as CalStatus;
        await bulkSetCalendarEvents(
          "artist",
          _vendorArtistId,
          dates,
          typedStatus,
          "manual",
          undefined,
          undefined,
          artistCalendarWriteAuthorization({
            userId: actorUserId,
            artistId: _vendorArtistId,
          }),
        );
        return JSON.stringify({ success: true, message: `Calendar updated for ${dates.length} dates`, dates, status });
      }

      default:
        return JSON.stringify({ error: "Unknown tool" });
    }
  } catch (err) {
    if (err instanceof CalendarWriteAuthorizationError) {
      return JSON.stringify({ error: "Artist calendar authorization changed" });
    }
    return JSON.stringify({ error: String(err) });
  }
}
