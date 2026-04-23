// AI assistant for clients in the planner dashboard. The client describes
// what kind of artists they want ("cei mai ieftini cu rating 4+, disponibili
// pentru data mea") and Claude:
//   1. Calls list_available_artists to see who fits their plan date & categories
//   2. Presents a shortlist for the client to confirm
//   3. Calls send_booking_requests with the approved IDs — each request
//      inherits the client's plan metadata so it lands in the right plan.
//
// POST body: { messages: [...], eventPlanId: number }

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  artists,
  bookingRequests,
  eventPlans,
  users,
  calendarEvents,
  categories,
} from "@/lib/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
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
    name: "list_available_artists",
    description:
      "Caută artiști disponibili pentru data evenimentului clientului. " +
      "Returnează pentru fiecare artist: id, name, rating, ratingCount, priceFrom, " +
      "categories (array cu numele categoriilor), location, isVerified, isPremium, " +
      "isFeatured, description. Filtrele sunt opționale.",
    input_schema: {
      type: "object",
      properties: {
        maxPrice: {
          type: "number",
          description: "Preț maxim per artist în EUR.",
        },
        minRating: {
          type: "number",
          description: "Rating minim (1-5).",
        },
        categoryIds: {
          type: "array",
          items: { type: "number" },
          description:
            "ID-urile categoriilor preferate (ex. cântăreț, DJ). Opțional.",
        },
        categoryNames: {
          type: "array",
          items: { type: "string" },
          description:
            "Alternative la categoryIds: caută artiști după numele categoriei (case-insensitive). Ex: ['DJ', 'Fotograf'].",
        },
      },
    },
  },
  {
    name: "send_booking_requests",
    description:
      "Trimite cereri de rezervare automat către o listă de artiști. " +
      "Cererile vor apărea în tabul 'Rezervări Artiști' al clientului. " +
      "Apelează DOAR după ce clientul a confirmat explicit alegerea.",
    input_schema: {
      type: "object",
      properties: {
        artistIds: {
          type: "array",
          items: { type: "number" },
          description: "ID-urile artiștilor.",
        },
        message: {
          type: "string",
          description:
            "Mesaj standard de inclus în fiecare cerere (ex. scurt context).",
        },
      },
      required: ["artistIds"],
    },
  },
];

export async function POST(req: NextRequest) {
  try {
    return await handleRequest(req);
  } catch (err) {
    const e = err as { message?: string; stack?: string };
    console.error("[ai/client-artist-picker] Uncaught error:", e.message, e.stack);
    return NextResponse.json(
      { error: "Eroare internă în asistentul AI. " + (e.message || "") },
      { status: 500 },
    );
  }
}

async function handleRequest(req: NextRequest) {
  // ─── AuthN ─────────────────────────────────────────────────────
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit per Clerk user — 20 calls/hour. Client-side chat is
  // cheaper than artist-side (usually one or two tool loops) but still
  // can rack up cost if left open in a tab.
  const rl = await rateLimit(`ai-client-pick:${clerkId}`, 20, 60 * 60 * 1000);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Prea multe cereri. Încearcă din nou mai târziu." },
      { status: 429 },
    );
  }

  const [appUser] = await db
    .select({ id: users.id, email: users.email, name: users.name, phone: users.phone })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const eventPlanId = Number(body?.eventPlanId);
  const incoming = body?.messages as ClientMessage[] | undefined;
  if (!eventPlanId || !Array.isArray(incoming) || incoming.length === 0) {
    return NextResponse.json(
      { error: "eventPlanId + messages required" },
      { status: 400 },
    );
  }

  // Confirm plan ownership + pull context for the system prompt.
  const [plan] = await db
    .select()
    .from(eventPlans)
    .where(and(eq(eventPlans.id, eventPlanId), eq(eventPlans.userId, appUser.id)))
    .limit(1);
  if (!plan) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Pre-fetch ALL active categories so we can resolve IDs to names in both
  // the system prompt and tool responses.
  const allCategories = await db
    .select({
      id: categories.id,
      nameRo: categories.nameRo,
      type: categories.type,
    })
    .from(categories)
    .where(eq(categories.isActive, true));

  const categoryMap = new Map<number, { nameRo: string; type: string | null }>();
  for (const c of allCategories) {
    categoryMap.set(c.id, { nameRo: c.nameRo, type: c.type });
  }

  // Selected category names from the plan (resolved from IDs)
  const selectedCategoryNames = (plan.selectedCategories ?? [])
    .map((id) => categoryMap.get(id)?.nameRo)
    .filter((n): n is string => !!n);

  // Full list of bookable categories (artist + service, e.g. Fotografi is "service")
  // The discovery page treats both as bookable through the artist flow.
  const artistCategoriesList = allCategories
    .filter((c) => c.type === "artist" || c.type === "service")
    .map((c) => `#${c.id} ${c.nameRo}`)
    .join(", ");

  const systemPrompt = `Ești asistentul de rezervări pentru un client pe ePetrecere.md care planifică un eveniment.

Plan curent:
- Titlu: ${plan.title}
- Tip: ${plan.eventType ?? "nespecificat"}
- Data: ${plan.eventDate ?? "nespecificată"}
- Locație: ${plan.location ?? "nespecificată"}
- Invitați: ${plan.guestCountTarget ?? "n/a"}
- Buget total: ${plan.budgetTarget ? `${plan.budgetTarget}€` : "nespecificat"}
- Categorii selectate de client: ${selectedCategoryNames.length > 0 ? selectedCategoryNames.join(", ") : "niciuna"}

Toate categoriile de artiști disponibile:
${artistCategoriesList}

Reguli:
1. Limba română. Răspunsuri scurte și prietenoase.
2. Când clientul cere recomandări, apelează \`list_available_artists\` cu filtre explicite. Poți filtra pe \`categoryNames\` (ex: ['Fotograf']) — este mai natural decât ID-uri.
3. **IMPORTANT**: Dacă clientul cere artiști din MAI MULTE categorii (ex: "2 fotografi și 3 artiști de show program"), apelează \`list_available_artists\` o dată per categorie (cu un singur \`categoryNames\`). Nu încerca să le combini într-un singur apel.
4. Rezultatele sunt deja sortate după preț ascendent și includ: nume, rating, preț, categorii (nume complet), locație, status verificat/premium, descriere. Lista returnată arată EXACT artiștii disponibili pentru data evenimentului clientului — lista este identică cu ce vede clientul pe pagina "Artiști disponibili".
5. După ce primești listele, prezintă top alegeri relevante CA TEXT (nume, categorie, rating, preț, motiv scurt). NU trimite cereri automat.
6. Cere confirmarea clientului: "Să trimit cererile?". Doar apoi apelezi \`send_booking_requests\`.
7. Dacă rezultatele sunt puține sau nepotrivite, sugerează ajustări (alt preț, categorii diferite, scade ratingul minim).
8. Mesajul din send_booking_requests trebuie să includă data evenimentului și tipul. Ex: "Salut! Plan ${plan.title} pe ${plan.eventDate}."
9. NU rezerva pentru date din trecut.
10. Artiști **verificați** (isVerified=true) sau **premium** (isPremium=true) sunt un semnal de încredere — menționează-i în recomandări.`;

  const client = getClient();
  const conversation: Anthropic.Messages.MessageParam[] = incoming.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let requestsSent = 0;
  let iterations = 0;

  while (iterations < 10) {
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
      const e = err as { status?: number; message?: string; error?: { type?: string; message?: string } };
      console.error(
        `[ai/client-artist-picker] Anthropic error status=${e.status} type=${e.error?.type} msg=${e.error?.message || e.message} plan=${plan.id}`,
      );
      // Surface more detail in dev / preview so we can debug
      return NextResponse.json(
        {
          error: "Serviciul AI e temporar indisponibil. Încearcă din nou.",
          debug: process.env.NODE_ENV === "production" ? undefined : {
            status: e.status,
            type: e.error?.type,
            message: e.error?.message || e.message,
          },
        },
        { status: 502 },
      );
    }

    conversation.push({ role: "assistant", content: resp.content });

    if (resp.stop_reason !== "tool_use") break;

    // Handle ALL tool_use blocks in this assistant message (Claude can make
    // parallel calls). Anthropic requires a tool_result for every tool_use id.
    const toolUses = resp.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
    );
    if (toolUses.length === 0) break;

    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

    for (const toolUse of toolUses) {
      let toolResult: string;

      if (toolUse.name === "list_available_artists") {
        const input = toolUse.input as {
          maxPrice?: number;
          minRating?: number;
          categoryIds?: number[];
          categoryNames?: string[];
        };

        // Resolve categoryNames to IDs (case-insensitive partial match).
        // Match across BOTH artist and service categories — the discovery
        // page groups photographers/MC/etc (type="service") alongside artists.
        const resolvedCategoryIds = new Set<number>(input.categoryIds ?? []);
        if (input.categoryNames && input.categoryNames.length > 0) {
          const namesLower = input.categoryNames.map((n) => n.toLowerCase().trim());
          for (const c of allCategories) {
            if (c.type !== "artist" && c.type !== "service") continue;
            const catLower = c.nameRo.toLowerCase();
            if (
              namesLower.some(
                (n) => catLower.includes(n) || n.includes(catLower),
              )
            ) {
              resolvedCategoryIds.add(c.id);
            }
          }
        }

        // Fetch artists — use the SAME availability filter as /api/artists
        const where = [eq(artists.isActive, true)];
        if (typeof input.minRating === "number") {
          where.push(gte(artists.ratingAvg, input.minRating));
        }
        if (typeof input.maxPrice === "number") {
          where.push(lte(artists.priceFrom, input.maxPrice));
        }
        if (plan.eventDate) {
          const dateStr =
            typeof plan.eventDate === "string"
              ? plan.eventDate
              : new Date(plan.eventDate).toISOString().split("T")[0];
          where.push(
            sql`${artists.id} NOT IN (
              SELECT ${calendarEvents.entityId} FROM ${calendarEvents}
              WHERE ${calendarEvents.entityType} = 'artist'
              AND ${calendarEvents.date} = ${dateStr}
              AND ${calendarEvents.status} IN ('booked', 'blocked')
            )`,
          );
        }

        let found = await db
          .select({
            id: artists.id,
            name: artists.nameRo,
            slug: artists.slug,
            priceFrom: artists.priceFrom,
            ratingAvg: artists.ratingAvg,
            ratingCount: artists.ratingCount,
            categoryIds: artists.categoryIds,
            location: artists.location,
            isVerified: artists.isVerified,
            isPremium: artists.isPremium,
            isFeatured: artists.isFeatured,
            description: artists.descriptionRo,
          })
          .from(artists)
          .where(and(...where))
          .limit(200);

        if (resolvedCategoryIds.size > 0) {
          found = found.filter((a) =>
            (a.categoryIds ?? []).some((cid) => resolvedCategoryIds.has(cid)),
          );
        }

        found.sort(
          (a, b) =>
            (a.priceFrom ?? Number.POSITIVE_INFINITY) -
            (b.priceFrom ?? Number.POSITIVE_INFINITY),
        );

        const truncate = (s: string | null, n: number) =>
          s ? (s.length > n ? s.slice(0, n) + "…" : s) : null;

        toolResult = JSON.stringify({
          count: found.length,
          artists: found.slice(0, 30).map((a) => ({
            id: a.id,
            name: a.name,
            rating: Number(a.ratingAvg ?? 0).toFixed(1),
            ratingCount: a.ratingCount ?? 0,
            priceFrom: a.priceFrom,
            categories: (a.categoryIds ?? [])
              .map((cid) => categoryMap.get(cid)?.nameRo)
              .filter(Boolean),
            location: a.location,
            isVerified: a.isVerified,
            isPremium: a.isPremium,
            isFeatured: a.isFeatured,
            description: truncate(a.description, 200),
          })),
        });
      } else if (toolUse.name === "send_booking_requests") {
        const input = toolUse.input as {
          artistIds?: number[];
          message?: string;
        };
        const ids = (input.artistIds ?? []).filter(
          (x) => typeof x === "number" && x > 0,
        );
        const msg = input.message ?? `Cerere din planul "${plan.title}".`;
        if (ids.length === 0 || !plan.eventDate) {
          toolResult = "Eroare: niciun artist sau lipsește data planului.";
        } else {
          const clientName = appUser.name ?? "Client ePetrecere";
          const dateStr =
            typeof plan.eventDate === "string"
              ? plan.eventDate
              : new Date(plan.eventDate).toISOString().split("T")[0];
          await db.insert(bookingRequests).values(
            ids.map((artistId) => ({
              artistId,
              eventPlanId: plan.id,
              clientUserId: appUser.id,
              clientName,
              clientPhone: appUser.phone ?? "—",
              clientEmail: appUser.email ?? null,
              eventDate: dateStr,
              eventType: plan.eventType ?? null,
              guestCount: plan.guestCountTarget ?? null,
              message: msg,
              status: "pending" as const,
            })),
          );
          requestsSent += ids.length;
          toolResult = `Am trimis ${ids.length} cereri de rezervare. Artiștii vor răspunde cu ofertele lor.`;
        }
      } else {
        toolResult = `Tool necunoscut: ${toolUse.name}`;
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: toolResult,
      });
    }

    // Single user message with ALL tool_results (Anthropic requirement)
    conversation.push({
      role: "user",
      content: toolResults,
    });
  }

  return NextResponse.json({
    messages: conversation,
    requestsSent,
  });
}
