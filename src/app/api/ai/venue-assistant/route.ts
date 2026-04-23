// AI assistant for venue owners — spec section 10.
//
// Chat with function calling:
//  - list_bookings       — filter by status/date range
//  - occupancy_stats     — compute % of days booked/blocked in a period
//  - block_calendar_days — bulk block days (vacation, renovation)
//  - improve_description — rewrite descriptionRo (preview + optional save)
//  - suggest_price       — analyze similar venues to recommend pricing
//
// Scope: AI only sees THE CALLER'S venue data, never other venues' data
// individually (only aggregates).

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  venues,
  users,
  bookingRequests,
  calendarEvents,
} from "@/lib/db/schema";
import { and, avg, count, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { rateLimit } from "@/lib/rate-limit";

function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  return new Anthropic({ apiKey });
}

const MODEL = "claude-sonnet-4-5";

type ClientMessage = {
  role: "user" | "assistant";
  content: string | Anthropic.Messages.ContentBlockParam[];
};

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "list_bookings",
    description:
      "Listează rezervările sălii. Poate fi filtrat după status și interval de date.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["pending", "accepted", "completed", "all"],
        },
        fromDate: {
          type: "string",
          description: "YYYY-MM-DD (inclusiv)",
        },
        toDate: {
          type: "string",
          description: "YYYY-MM-DD (inclusiv)",
        },
      },
    },
  },
  {
    name: "occupancy_stats",
    description:
      "Returnează procentul de zile ocupate / blocate într-o perioadă (util pentru întrebarea 'care e rata mea de ocupare?').",
    input_schema: {
      type: "object",
      properties: {
        fromDate: { type: "string", description: "YYYY-MM-DD" },
        toDate: { type: "string", description: "YYYY-MM-DD" },
      },
      required: ["fromDate", "toDate"],
    },
  },
  {
    name: "block_calendar_days",
    description:
      "Blochează un interval de zile (vacanță, renovare). Cere confirmare clară de la utilizator înainte de apelare.",
    input_schema: {
      type: "object",
      properties: {
        fromDate: { type: "string", description: "YYYY-MM-DD" },
        toDate: { type: "string", description: "YYYY-MM-DD" },
        reason: { type: "string", description: "Motiv (ex: 'Renovare')" },
      },
      required: ["fromDate", "toDate"],
    },
  },
  {
    name: "suggest_price",
    description:
      "Analizează prețul mediu per persoană al sălilor similare (același oraș) și sugerează un preț competitiv.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
];

export async function POST(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimit(`ai-venue:${clerkId}`, 20, 60 * 60 * 1000);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Prea multe cereri. Încearcă mai târziu." },
      { status: 429 },
    );
  }

  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [venue] = await db
    .select({
      id: venues.id,
      nameRo: venues.nameRo,
      city: venues.city,
      capacityMin: venues.capacityMin,
      capacityMax: venues.capacityMax,
      pricePerPerson: venues.pricePerPerson,
      descriptionRo: venues.descriptionRo,
      facilities: venues.facilities,
    })
    .from(venues)
    .where(eq(venues.userId, appUser.id))
    .limit(1);
  if (!venue) {
    return NextResponse.json({ error: "No venue found" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const incoming = body?.messages as ClientMessage[] | undefined;
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return NextResponse.json(
      { error: "messages required" },
      { status: 400 },
    );
  }

  const systemPrompt = `Ești asistentul AI pentru proprietarul unei săli de evenimente pe ePetrecere.md. Ajuți la gestionarea sălii, planificare, și îmbunătățirea performanței profilului.

Date despre sala ta:
- Nume: ${venue.nameRo}
- Oraș: ${venue.city ?? "—"}
- Capacitate: ${venue.capacityMin ?? "?"}–${venue.capacityMax ?? "?"} persoane
- Preț actual/persoană: ${venue.pricePerPerson ? `${venue.pricePerPerson}€` : "nespecificat"}
- Facilități: ${(venue.facilities as string[] | null)?.join(", ") || "nespecificat"}
- Descriere actuală: ${venue.descriptionRo ? venue.descriptionRo.slice(0, 200) + "..." : "niciuna"}

Reguli:
1. Răspunde în română, scurt și prietenos.
2. Folosește tools pentru întrebări despre date concrete (rezervări, ocupare). NU inventa numere.
3. Pentru blocări de calendar, cere explicit confirmarea utilizatorului înainte de a apela tool-ul.
4. Pentru sugestii de preț, folosește suggest_price apoi oferă rationale clar.
5. Nu ai acces la datele altor săli individual — doar la medii agregate.`;

  const client = getClient();
  const conversation: Anthropic.Messages.MessageParam[] = incoming.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let iterations = 0;

  while (iterations < 8) {
    iterations++;
    let resp: Anthropic.Messages.Message;
    try {
      resp = await client.messages.create({
        model: MODEL,
        max_tokens: 2048,
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        tools: TOOLS,
        messages: conversation,
      });
    } catch (err) {
      const e = err as { status?: number; message?: string };
      console.error("[ai/venue-assistant] Anthropic error:", e.status, e.message);
      return NextResponse.json(
        { error: "Serviciul AI e temporar indisponibil. Încearcă din nou." },
        { status: 502 },
      );
    }

    conversation.push({ role: "assistant", content: resp.content });

    if (resp.stop_reason !== "tool_use") break;

    const toolUses = resp.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
    );
    if (toolUses.length === 0) break;

    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

    for (const toolUse of toolUses) {
      let toolResult: string;

      if (toolUse.name === "list_bookings") {
        const input = toolUse.input as {
          status?: string;
          fromDate?: string;
          toDate?: string;
        };
        const conds = [eq(bookingRequests.venueId, venue.id)];
        if (input.status && input.status !== "all") {
          conds.push(
            eq(
              bookingRequests.status,
              input.status as
                | "pending"
                | "accepted"
                | "confirmed_by_client"
                | "completed"
                | "cancelled"
                | "rejected",
            ),
          );
        }
        if (input.fromDate) conds.push(gte(bookingRequests.eventDate, input.fromDate));
        if (input.toDate) conds.push(lte(bookingRequests.eventDate, input.toDate));
        const rows = await db
          .select({
            id: bookingRequests.id,
            clientName: bookingRequests.clientName,
            eventType: bookingRequests.eventType,
            eventDate: bookingRequests.eventDate,
            guestCount: bookingRequests.guestCount,
            agreedPrice: bookingRequests.agreedPrice,
            status: bookingRequests.status,
          })
          .from(bookingRequests)
          .where(and(...conds))
          .limit(20);
        toolResult = JSON.stringify({
          count: rows.length,
          bookings: rows,
        });
      } else if (toolUse.name === "occupancy_stats") {
        const input = toolUse.input as { fromDate: string; toDate: string };
        const busyDaysRow = await db
          .select({
            value: sql<number>`COUNT(DISTINCT ${calendarEvents.date})::int`,
          })
          .from(calendarEvents)
          .where(
            and(
              eq(calendarEvents.entityType, "venue"),
              eq(calendarEvents.entityId, venue.id),
              gte(calendarEvents.date, input.fromDate),
              lte(calendarEvents.date, input.toDate),
              inArray(calendarEvents.status, ["booked", "blocked"]),
            ),
          );
        const busyDays = Number(busyDaysRow[0]?.value ?? 0);
        const totalDays =
          Math.floor(
            (new Date(input.toDate).getTime() -
              new Date(input.fromDate).getTime()) /
              (1000 * 60 * 60 * 24),
          ) + 1;
        const pct = totalDays > 0 ? Math.round((busyDays / totalDays) * 100) : 0;
        toolResult = JSON.stringify({
          busyDays,
          totalDays,
          occupancyPct: pct,
        });
      } else if (toolUse.name === "block_calendar_days") {
        const input = toolUse.input as {
          fromDate: string;
          toDate: string;
          reason?: string;
        };
        // Generate all dates in range
        const start = new Date(input.fromDate);
        const end = new Date(input.toDate);
        const dates: string[] = [];
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          dates.push(d.toISOString().split("T")[0]);
        }
        // Bulk insert blocks
        if (dates.length > 0) {
          await db
            .insert(calendarEvents)
            .values(
              dates.map((date) => ({
                entityType: "venue" as const,
                entityId: venue.id,
                date,
                status: "blocked" as const,
                source: "manual" as const,
                note: input.reason ?? "Blocat de AI assistant",
              })),
            )
            .onConflictDoNothing();
        }
        toolResult = JSON.stringify({
          blocked: dates.length,
          fromDate: input.fromDate,
          toDate: input.toDate,
        });
      } else if (toolUse.name === "suggest_price") {
        const row = await db
          .select({
            avgPrice: avg(venues.pricePerPerson),
            minPrice: sql<number>`MIN(${venues.pricePerPerson})`,
            maxPrice: sql<number>`MAX(${venues.pricePerPerson})`,
            count: count(),
          })
          .from(venues)
          .where(
            and(
              eq(venues.city, venue.city ?? ""),
              eq(venues.isActive, true),
              sql`${venues.pricePerPerson} IS NOT NULL`,
            ),
          );
        toolResult = JSON.stringify({
          city: venue.city,
          yourPrice: venue.pricePerPerson,
          marketStats: {
            avg: Number(row[0]?.avgPrice ?? 0),
            min: Number(row[0]?.minPrice ?? 0),
            max: Number(row[0]?.maxPrice ?? 0),
            venueCount: Number(row[0]?.count ?? 0),
          },
        });
      } else {
        toolResult = `Tool necunoscut: ${toolUse.name}`;
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: toolResult,
      });
    }

    conversation.push({ role: "user", content: toolResults });
  }

  return NextResponse.json({ messages: conversation });
}
