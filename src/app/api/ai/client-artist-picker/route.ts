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
  artistAvailabilitySlots,
} from "@/lib/db/schema";
import { and, eq, gte, lte, inArray, sql } from "drizzle-orm";

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
      "Returnează listă cu id, nume, rating, preț minim și categorie. " +
      "Filtrele sunt opționale — fără ele primești primii 30 artiști activi.",
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
  // ─── AuthN ─────────────────────────────────────────────────────
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const systemPrompt = `Ești asistentul de rezervări pentru un client pe ePetrecere.md care planifică un eveniment.

Plan curent:
- Titlu: ${plan.title}
- Tip: ${plan.eventType ?? "nespecificat"}
- Data: ${plan.eventDate ?? "nespecificată"}
- Locație: ${plan.location ?? "nespecificată"}
- Invitați: ${plan.guestCountTarget ?? "n/a"}
- Buget total: ${plan.budgetTarget ? `${plan.budgetTarget}€` : "nespecificat"}
- Categorii selectate: ${JSON.stringify(plan.selectedCategories ?? [])}

Reguli:
1. Limba română. Răspunsuri scurte și prietenoase.
2. Când clientul cere recomandări, apelează \`list_available_artists\` cu filtrele explicite din cerere (preț, rating, categorii).
3. După ce primești lista, prezintă top 3-5 alegeri relevante CA TEXT (nume, rating, preț, motiv). NU trimite cereri automat.
4. Cere confirmarea clientului: "Să trimit cererile?". Doar apoi apelezi \`send_booking_requests\`.
5. Dacă rezultatele sunt puține sau nepotrivite, spune sincer și sugerează ajustări.
6. Mesajul din send_booking_requests trebuie să includă data evenimentului și tipul. Ex: "Salut! Plan ${plan.title} pe ${plan.eventDate}."
7. NU rezerva pentru date din trecut.`;

  const client = getClient();
  const conversation: Anthropic.Messages.MessageParam[] = incoming.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let requestsSent = 0;
  let iterations = 0;

  while (iterations < 6) {
    iterations++;
    const resp = await client.messages.create({
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

    conversation.push({ role: "assistant", content: resp.content });

    if (resp.stop_reason !== "tool_use") break;

    const toolUse = resp.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
    );
    if (!toolUse) break;

    // ─── Tool dispatch ────────────────────────────────────────
    let toolResult: string;

    if (toolUse.name === "list_available_artists") {
      const input = toolUse.input as {
        maxPrice?: number;
        minRating?: number;
        categoryIds?: number[];
      };
      // Fetch artists; optionally filter to those with a free slot on
      // the plan's date (plan.eventDate). If plan has no date set, skip
      // the slot join entirely.
      const where = [eq(artists.isActive, true)];
      if (typeof input.minRating === "number") {
        where.push(gte(artists.ratingAvg, input.minRating));
      }
      if (typeof input.maxPrice === "number") {
        where.push(lte(artists.priceFrom, input.maxPrice));
      }

      let found = await db
        .select({
          id: artists.id,
          name: artists.nameRo,
          slug: artists.slug,
          priceFrom: artists.priceFrom,
          ratingAvg: artists.ratingAvg,
          ratingCount: artists.ratingCount,
        })
        .from(artists)
        .where(and(...where))
        .limit(30);

      // Intersect with slot availability when we have a date.
      if (plan.eventDate && found.length > 0) {
        const freeArtistIds = await db
          .select({ artistId: artistAvailabilitySlots.artistId })
          .from(artistAvailabilitySlots)
          .where(
            and(
              eq(artistAvailabilitySlots.date, plan.eventDate),
              eq(artistAvailabilitySlots.isBooked, false),
              inArray(
                artistAvailabilitySlots.artistId,
                found.map((f) => f.id),
              ),
            ),
          );
        const freeSet = new Set(freeArtistIds.map((x) => x.artistId));
        // Only enforce the "has a free slot" filter when we actually
        // have slots for the queried artists — otherwise we'd return
        // empty results for every older artist that never opted in.
        if (freeSet.size > 0) {
          found = found.filter((a) => freeSet.has(a.id));
        }
      }

      toolResult = JSON.stringify({
        count: found.length,
        artists: found.slice(0, 12).map((a) => ({
          id: a.id,
          name: a.name,
          rating: Number(a.ratingAvg ?? 0).toFixed(1),
          ratingCount: a.ratingCount,
          priceFrom: a.priceFrom,
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
        await db.insert(bookingRequests).values(
          ids.map((artistId) => ({
            artistId,
            eventPlanId: plan.id,
            clientUserId: appUser.id,
            clientName,
            clientPhone: appUser.phone ?? "—",
            clientEmail: appUser.email ?? null,
            eventDate: plan.eventDate!,
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

    conversation.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: toolResult,
        },
      ],
    });
  }

  return NextResponse.json({
    messages: conversation,
    requestsSent,
  });
}
