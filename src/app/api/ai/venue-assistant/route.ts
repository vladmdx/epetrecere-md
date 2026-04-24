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
  reviews,
  profileViews,
  profileClicks,
} from "@/lib/db/schema";
import {
  and,
  avg,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  sql,
} from "drizzle-orm";
import { rateLimit } from "@/lib/rate-limit";
import {
  generateVenueDescription,
  generateSEOTexts,
} from "@/lib/ai";

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
  {
    name: "recent_reviews",
    description:
      "Listează recenziile sălii (default cele fără răspuns). Folosește pentru a ajuta owner-ul să răspundă.",
    input_schema: {
      type: "object",
      properties: {
        onlyUnanswered: {
          type: "boolean",
          description: "Default true — doar recenzii fără răspuns.",
        },
        limit: { type: "number", description: "Default 5, max 20" },
      },
    },
  },
  {
    name: "reply_to_review",
    description:
      "Postează un răspuns public la o recenzie. CERE EXPLICIT confirmarea textului de la utilizator înainte de apelare.",
    input_schema: {
      type: "object",
      properties: {
        reviewId: { type: "number" },
        reply: { type: "string", description: "Răspunsul public (max 1000 chars)" },
      },
      required: ["reviewId", "reply"],
    },
  },
  {
    name: "improve_description",
    description:
      "Rescrie/îmbunătățește descrierea sălii folosind AI. Returnează doar preview-ul HTML; NU salvează. Owner-ul decide dacă vrea să îl salveze cu save_description.",
    input_schema: {
      type: "object",
      properties: {
        lang: { type: "string", enum: ["ro", "ru", "en"], description: "Default 'ro'" },
        mode: {
          type: "string",
          enum: ["generate", "improve"],
          description: "'improve' rescrie descrierea existentă; 'generate' scrie de la 0",
        },
      },
    },
  },
  {
    name: "save_description",
    description:
      "Salvează descrierea în DB (pentru limba specificată). Apelează DOAR după ce owner-ul a văzut preview-ul din improve_description și a confirmat explicit.",
    input_schema: {
      type: "object",
      properties: {
        lang: { type: "string", enum: ["ro", "ru", "en"] },
        html: { type: "string", description: "Conținutul HTML (de la improve_description)" },
      },
      required: ["lang", "html"],
    },
  },
  {
    name: "generate_seo",
    description:
      "Generează titlu SEO (≤60 chars) + meta description (≤160 chars) pentru sala în limba specificată. Returnează doar preview.",
    input_schema: {
      type: "object",
      properties: {
        lang: { type: "string", enum: ["ro", "ru", "en"], description: "Default 'ro'" },
      },
    },
  },
  {
    name: "save_seo",
    description:
      "Salvează titlu SEO + meta description pentru limba dată. Apelează DOAR după confirmarea explicită a owner-ului.",
    input_schema: {
      type: "object",
      properties: {
        lang: { type: "string", enum: ["ro", "ru", "en"] },
        title: { type: "string", description: "Max 60 chars" },
        description: { type: "string", description: "Max 160 chars" },
      },
      required: ["lang", "title", "description"],
    },
  },
  {
    name: "analytics_summary",
    description:
      "Returnează un sumar al analitice-lor profilului: vizite, CTA clicks, conversion rate, galerie, meniu, pe o perioadă.",
    input_schema: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "Ultima N zile (7/30/90/365, default 30)",
        },
      },
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

  const systemPrompt = `Ești asistentul AI pentru proprietarul unei săli de evenimente pe ePetrecere.md. Ajuți la gestionarea sălii, planificare, îmbunătățirea profilului și răspunsuri la recenzii.

Date despre sala ta:
- Nume: ${venue.nameRo}
- Oraș: ${venue.city ?? "—"}
- Capacitate: ${venue.capacityMin ?? "?"}–${venue.capacityMax ?? "?"} persoane
- Preț actual/persoană: ${venue.pricePerPerson ? `${venue.pricePerPerson}€` : "nespecificat"}
- Facilități: ${(venue.facilities as string[] | null)?.join(", ") || "nespecificat"}
- Descriere actuală (RO, trunchiat): ${venue.descriptionRo ? venue.descriptionRo.slice(0, 200) + "..." : "niciuna"}

Reguli critice:
1. Răspunde în română, scurt și prietenos (emoji-uri OK cu moderație).
2. Folosește tools pentru ORICE întrebare despre date concrete (rezervări, ocupare, recenzii, analytics). Niciodată nu inventa numere.
3. **Acțiuni destructive sau publice necesită confirmare explicită a owner-ului**:
   - block_calendar_days → "Vrei să blochez 1-10 ian? (Da/Nu)"
   - reply_to_review → afișează TEXTUL propus, cere "E OK să postez?" înainte de apel
   - save_description / save_seo → arată preview-ul din improve_description sau generate_seo, cere "Salvez?" înainte de a apela save_*
4. Pentru sugestii preț, folosește suggest_price apoi oferă rationale concret (vs medie oraș).
5. La response review, generează un răspuns politicos, personalizat (menționează numele clientului + un detaliu din recenzie), ≤150 cuvinte. Arată-l înainte de a chema reply_to_review.
6. La îmbunătățire descriere, folosește improve_description → arată preview → întreabă → save_description.
7. Nu ai acces la datele altor săli individual — doar medii agregate via suggest_price.`;

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
      } else if (toolUse.name === "recent_reviews") {
        const input = toolUse.input as {
          onlyUnanswered?: boolean;
          limit?: number;
        };
        const onlyUnanswered = input.onlyUnanswered !== false; // default true
        const limit = Math.min(20, Math.max(1, input.limit ?? 5));
        const rows = await db
          .select({
            id: reviews.id,
            authorName: reviews.authorName,
            rating: reviews.rating,
            text: reviews.text,
            eventType: reviews.eventType,
            reply: reviews.reply,
            createdAt: reviews.createdAt,
          })
          .from(reviews)
          .where(
            and(
              eq(reviews.venueId, venue.id),
              eq(reviews.isApproved, true),
              onlyUnanswered ? isNull(reviews.reply) : sql`TRUE`,
            ),
          )
          .orderBy(desc(reviews.createdAt))
          .limit(limit);
        toolResult = JSON.stringify({
          count: rows.length,
          reviews: rows,
        });
      } else if (toolUse.name === "reply_to_review") {
        const input = toolUse.input as { reviewId: number; reply: string };
        // Ownership re-check — refuse if the review doesn't belong to this venue.
        const [target] = await db
          .select({ id: reviews.id, venueId: reviews.venueId })
          .from(reviews)
          .where(eq(reviews.id, input.reviewId))
          .limit(1);
        if (!target || target.venueId !== venue.id) {
          toolResult = JSON.stringify({
            success: false,
            error: "Recenzia nu aparține sălii tale sau nu există.",
          });
        } else if (!input.reply || input.reply.trim().length === 0) {
          toolResult = JSON.stringify({
            success: false,
            error: "Răspunsul nu poate fi gol.",
          });
        } else {
          await db
            .update(reviews)
            .set({
              reply: input.reply.trim().slice(0, 1000),
              replyAt: new Date(),
            })
            .where(eq(reviews.id, input.reviewId));
          toolResult = JSON.stringify({
            success: true,
            reviewId: input.reviewId,
          });
        }
      } else if (toolUse.name === "improve_description") {
        const input = toolUse.input as {
          lang?: "ro" | "ru" | "en";
          mode?: "generate" | "improve";
        };
        const lang = input.lang ?? "ro";
        const currentField =
          lang === "ro"
            ? venue.descriptionRo
            : lang === "ru"
              ? (venue as unknown as { descriptionRu?: string | null }).descriptionRu
              : (venue as unknown as { descriptionEn?: string | null }).descriptionEn;
        const current = currentField ?? "";
        const mode =
          input.mode ?? (current.trim() ? "improve" : "generate");
        try {
          const html = await generateVenueDescription({
            name:
              lang === "ro"
                ? venue.nameRo
                : lang === "ru"
                  ? (venue as unknown as { nameRu?: string | null }).nameRu || venue.nameRo
                  : (venue as unknown as { nameEn?: string | null }).nameEn || venue.nameRo,
            city: venue.city,
            capacityMin: venue.capacityMin,
            capacityMax: venue.capacityMax,
            facilities: (venue.facilities as string[] | null) ?? [],
            current,
            mode,
            language: lang,
          });
          toolResult = JSON.stringify({
            success: true,
            lang,
            mode,
            preview: html,
            note: "Owner-ul trebuie să confirme înainte de save_description.",
          });
        } catch (err) {
          toolResult = JSON.stringify({
            success: false,
            error: (err as Error).message || "Generare eșuată",
          });
        }
      } else if (toolUse.name === "save_description") {
        const input = toolUse.input as {
          lang: "ro" | "ru" | "en";
          html: string;
        };
        if (!input.html || input.html.length > 20_000) {
          toolResult = JSON.stringify({
            success: false,
            error: "HTML lipsă sau prea lung (>20k)",
          });
        } else {
          const field =
            input.lang === "ro"
              ? "descriptionRo"
              : input.lang === "ru"
                ? "descriptionRu"
                : "descriptionEn";
          await db
            .update(venues)
            .set({ [field]: input.html, updatedAt: new Date() })
            .where(eq(venues.id, venue.id));
          toolResult = JSON.stringify({
            success: true,
            lang: input.lang,
          });
        }
      } else if (toolUse.name === "generate_seo") {
        const input = toolUse.input as { lang?: "ro" | "ru" | "en" };
        const lang = input.lang ?? "ro";
        const name =
          lang === "ro"
            ? venue.nameRo
            : lang === "ru"
              ? (venue as unknown as { nameRu?: string | null }).nameRu || venue.nameRo
              : (venue as unknown as { nameEn?: string | null }).nameEn || venue.nameRo;
        const descrRaw =
          lang === "ro"
            ? venue.descriptionRo
            : lang === "ru"
              ? (venue as unknown as { descriptionRu?: string | null }).descriptionRu
              : (venue as unknown as { descriptionEn?: string | null }).descriptionEn;
        const plain = (descrRaw || "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 800);
        const ctx = [
          venue.city ? `Locație: ${venue.city}` : "",
          venue.capacityMin || venue.capacityMax
            ? `Capacitate: ${venue.capacityMin ?? "?"}–${venue.capacityMax ?? "?"} persoane`
            : "",
          plain,
        ]
          .filter(Boolean)
          .join(". ");
        try {
          const r = await generateSEOTexts(
            name || "Sală evenimente",
            "venue",
            ctx,
            lang,
          );
          toolResult = JSON.stringify({
            success: true,
            lang,
            title: r.title,
            metaDescription: r.metaDescription,
            note: "Owner-ul trebuie să confirme înainte de save_seo.",
          });
        } catch {
          toolResult = JSON.stringify({
            success: false,
            error: "Serviciul AI a eșuat.",
          });
        }
      } else if (toolUse.name === "save_seo") {
        const input = toolUse.input as {
          lang: "ro" | "ru" | "en";
          title: string;
          description: string;
        };
        const titleField =
          input.lang === "ro"
            ? "seoTitleRo"
            : input.lang === "ru"
              ? "seoTitleRu"
              : "seoTitleEn";
        const descField =
          input.lang === "ro"
            ? "seoDescRo"
            : input.lang === "ru"
              ? "seoDescRu"
              : "seoDescEn";
        await db
          .update(venues)
          .set({
            [titleField]: input.title.slice(0, 100),
            [descField]: input.description.slice(0, 300),
            updatedAt: new Date(),
          })
          .where(eq(venues.id, venue.id));
        toolResult = JSON.stringify({ success: true, lang: input.lang });
      } else if (toolUse.name === "analytics_summary") {
        const input = toolUse.input as { days?: number };
        const days = [7, 30, 90, 365].includes(input.days ?? -1)
          ? (input.days as number)
          : 30;
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const [viewsRow] = await db
          .select({ total: sql<number>`COUNT(*)::int` })
          .from(profileViews)
          .where(
            and(
              eq(profileViews.venueId, venue.id),
              gte(profileViews.createdAt, since),
            ),
          );
        const clickRows = await db
          .select({
            clickType: profileClicks.clickType,
            total: sql<number>`COUNT(*)::int`,
          })
          .from(profileClicks)
          .where(
            and(
              eq(profileClicks.venueId, venue.id),
              gte(profileClicks.createdAt, since),
            ),
          )
          .groupBy(profileClicks.clickType);
        const clicks: Record<string, number> = {};
        for (const r of clickRows) clicks[r.clickType] = Number(r.total);
        const views = Number(viewsRow?.total ?? 0);
        const cta = clicks.cta ?? 0;
        const conversionPct =
          views > 0 ? Math.round((cta / views) * 1000) / 10 : 0;
        toolResult = JSON.stringify({
          days,
          views,
          clicks,
          conversionPct,
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
