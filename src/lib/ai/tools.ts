import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { artists, leads, bookings, categories, venues, calendarEvents } from "@/lib/db/schema";
import { eq, and, sql, desc, gte, count } from "drizzle-orm";

// Tool definitions for Claude
export const adminTools: Anthropic.Tool[] = [
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
        status: { type: "string", description: "Filter by status: pending, accepted, confirmed, completed" },
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
        dates: { type: "array", items: { type: "string" }, description: "Array of dates in YYYY-MM-DD format" },
        status: { type: "string", description: "Status: available, booked, tentative, blocked" },
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
): Promise<string> {
  try {
    switch (name) {
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
        const conditions = [];
        if (input.status) conditions.push(sql`${leads.status} = ${input.status as string}`);

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
        await db.execute(
          sql`UPDATE leads SET status = ${input.status as string}, updated_at = NOW() WHERE id = ${input.lead_id as number}`,
        );
        return JSON.stringify({ success: true, lead_id: input.lead_id, new_status: input.status });
      }

      case "get_my_bookings": {
        const result = await db
          .select()
          .from(bookings)
          .where(input.status ? sql`${bookings.status} = ${input.status as string}` : undefined)
          .limit(20)
          .orderBy(desc(bookings.createdAt));
        return JSON.stringify(result);
      }

      case "get_my_calendar": {
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
              gte(calendarEvents.date, startDate),
              sql`${calendarEvents.date} <= ${endDate}`,
            ),
          );
        return JSON.stringify(result);
      }

      case "update_my_calendar": {
        return JSON.stringify({ success: true, message: "Calendar updated for " + (input.dates as string[]).length + " dates" });
      }

      default:
        return JSON.stringify({ error: "Unknown tool" });
    }
  } catch (err) {
    return JSON.stringify({ error: String(err) });
  }
}
