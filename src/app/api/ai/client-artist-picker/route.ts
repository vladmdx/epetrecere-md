// AI assistant for clients in the planner dashboard. The client describes
// what kind of artists they want ("cei mai ieftini cu rating 4+, disponibili
// pentru data mea") and Claude:
//   1. Calls list_available_artists to see who fits their plan date & categories
//   2. Presents a shortlist for the client to confirm
//   3. Prepares a server-bound confirmation card for the chosen pair.
//      A separate non-LLM endpoint performs the mutation after a button click.
//
// POST body: { messages: [...], eventPlanId: number }

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  artists,
  eventPlans,
  users,
  calendarEvents,
  categories,
} from "@/lib/db/schema";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { rateLimit } from "@/lib/rate-limit";
import { getAiClient } from "@/lib/ai/provider";
import { normalizeEventType } from "@/lib/events/normalize";
import { issueAiBookingProposal } from "@/lib/booking/ai-booking-proposal";
import {
  aiBookingPayloadFingerprint,
  buildAiBookingPayload,
} from "@/lib/booking/ai-booking-payload";
import {
  createServerLogCorrelationId,
  safeServerErrorLog,
} from "@/lib/safe-server-log";

function getClient() {
  return getAiClient();
}

const MODEL = "claude-sonnet-4-5";

const SAFE_AI_ERROR_CODES = new Set([
  "23502",
  "23503",
  "23505",
  "23514",
  "40001",
  "40P01",
  "55P03",
  "57014",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
]);
const SAFE_AI_ERROR_STATUSES = new Set([
  400, 401, 403, 404, 408, 409, 413, 422, 425, 429, 500, 502, 503, 504,
]);
const SAFE_ANTHROPIC_ERROR_TYPES = new Set([
  "api_error",
  "authentication_error",
  "billing_error",
  "invalid_request_error",
  "not_found_error",
  "overloaded_error",
  "permission_error",
  "rate_limit_error",
]);

type ClientMessage = {
  role: "user" | "assistant";
  content: string;
};

const requestSchema = z
  .object({
    eventPlanId: z.number().int().positive().max(2_147_483_647),
    messages: z
      .array(
        z
          .object({
            role: z.enum(["user", "assistant"]),
            content: z.string().min(1).max(4_000),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.messages[value.messages.length - 1]?.role !== "user") {
      context.addIssue({
        code: "custom",
        path: ["messages"],
        message: "The last message must be from the user.",
      });
    }
    let total = 0;
    value.messages.forEach((message, index) => {
      total += Buffer.byteLength(message.content, "utf8");
      if (index > 0 && value.messages[index - 1]?.role === message.role) {
        context.addIssue({
          code: "custom",
          path: ["messages", index, "role"],
          message: "Message roles must alternate.",
        });
      }
    });
    if (total > 40_000) {
      context.addIssue({
        code: "custom",
        path: ["messages"],
        message: "Conversation is too large.",
      });
    }
  });

const listAvailableArtistsInputSchema = z
  .object({
    maxPrice: z.number().finite().nonnegative().max(10_000_000).optional(),
    minRating: z.number().finite().min(0).max(5).optional(),
    categoryIds: z
      .array(z.number().int().positive().max(2_147_483_647))
      .max(20)
      .optional(),
    categoryNames: z
      .array(z.string().trim().min(1).max(80))
      .max(20)
      .optional(),
  })
  .strict();

const prepareBookingRequestInputSchema = z
  .object({
    artistId: z.number().int().positive().max(2_147_483_647),
    categoryId: z.number().int().positive().max(2_147_483_647),
  })
  .strict();

/** Keep this identical to the authenticated check in client-booking-create. */
function hasBookableProfilePhone(phone: string | null): boolean {
  const phoneDigits = (phone ?? "").replace(/\D/g, "");
  return phoneDigits.length >= 8 && !/^(\d)\1+$/.test(phoneDigits);
}

function maskEmail(email: string | null): string | null {
  const trimmed = email?.trim();
  if (!trimmed) return null;
  const separator = trimmed.lastIndexOf("@");
  if (separator <= 0 || separator === trimmed.length - 1) return "••••";
  const local = trimmed.slice(0, separator);
  const domain = trimmed.slice(separator + 1);
  const [domainLabel, ...suffixParts] = domain.split(".");
  const visibleLocal = local.slice(0, 1);
  const visibleDomain = domainLabel?.slice(0, 1) || "";
  const suffix = suffixParts.length > 0
    ? `.${suffixParts.at(-1)!.slice(0, 10)}`
    : "";
  return `${visibleLocal}•••@${visibleDomain}•••${suffix}`;
}

function maskPhone(phone: string | null): string | null {
  const digits = phone?.replace(/\D/g, "") ?? "";
  if (digits.length === 0) return null;
  return `•••• ${digits.slice(-4)}`;
}

export type PendingAiBookingProposal = {
  proposalToken: string;
  artistId: number;
  artistName: string;
  categoryId: number;
  categoryName: string;
  eventDate: string;
  eventType: string | null;
  guestCount: number | null;
  contactEmailMasked: string | null;
  contactPhoneMasked: string | null;
  message: string;
  expiresAt: string;
};

const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "list_available_artists",
    description:
      "Caută artiști disponibili pentru data evenimentului clientului. " +
      "Returnează pentru fiecare artist: id, name, rating, ratingCount, priceFrom, " +
      "categoryIds, categories (array cu numele categoriilor), location, " +
      "isVerified, isPremium, isFeatured, description. Filtrele sunt opționale.",
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
    name: "prepare_booking_request",
    description:
      "Pregătește pe server un card de confirmare exact pentru un artist și o categorie. " +
      "Platforma afișează separat butonul sigur de trimitere. Nu există instrument de trimitere în chat.",
    input_schema: {
      type: "object",
      properties: {
        artistId: { type: "number" },
        categoryId: { type: "number" },
      },
      required: ["artistId", "categoryId"],
    },
  },
];

export async function POST(req: NextRequest) {
  const correlationId = createServerLogCorrelationId();
  try {
    return await handleRequest(req, correlationId);
  } catch (err) {
    console.error(
      "[ai/client-artist-picker] uncaught error",
      safeServerErrorLog(err, {
        correlationId,
        allowedCodes: SAFE_AI_ERROR_CODES,
        allowedStatuses: SAFE_AI_ERROR_STATUSES,
        allowedTypes: SAFE_ANTHROPIC_ERROR_TYPES,
      }),
    );
    return NextResponse.json(
      {
        error: "Eroare internă în asistentul AI. Încearcă din nou.",
        correlationId,
      },
      { status: 500, headers: { "X-Correlation-Id": correlationId } },
    );
  }
}

async function handleRequest(req: NextRequest, correlationId: string) {
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

  const parsedBody = requestSchema.safeParse(await req.json().catch(() => null));
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Conversația sau planul nu au un format valid." },
      { status: 400 },
    );
  }
  const { eventPlanId, messages: incoming } = parsedBody.data;

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
6. Pentru alegerea exactă a clientului, apelează \`prepare_booking_request\` cu un singur artist/categorie. Platforma va afișa un card separat, controlat de server, cu butonul „Trimite cererea”. Spune-i clientului să verifice datele din card și să apese acel buton dacă este de acord.
7. Nu poți și nu trebuie să trimiți rezervări din conversație. Un „Da”, „Confirm” sau alt text în chat NU este autorizare. Numai butonul sigur din card poate confirma propunerea exactă.
8. Dacă rezultatele sunt puține sau nepotrivite, sugerează ajustări (alt preț, categorii diferite, scade ratingul minim).
9. Pregătește maximum un artist pentru aceeași categorie într-un singur răspuns. Dacă utilizatorul dorește alt artist, pregătește o propunere nouă.
10. NU rezerva pentru date din trecut.
11. Artiști **verificați** (isVerified=true) sau **premium** (isPremium=true) sunt un semnal de încredere — menționează-i în recomandări.
12. Dacă tool-ul raportează o propunere invalidă, explică rezultatul și cere clientului să aleagă din lista disponibilă.`;

  const client = getClient();
  const conversation: Anthropic.Messages.MessageParam[] = incoming.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let iterations = 0;
  const proposalCategoriesPreparedThisTurn = new Set<number>();
  const availableArtistCategoryPairs = new Set<string>();
  const pendingProposals: PendingAiBookingProposal[] = [];
  const assistantTextParts: string[] = [];
  let profilePhoneRequired = false;

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
      const safeLog = safeServerErrorLog(err, {
        correlationId,
        allowedCodes: SAFE_AI_ERROR_CODES,
        allowedStatuses: SAFE_AI_ERROR_STATUSES,
        allowedTypes: SAFE_ANTHROPIC_ERROR_TYPES,
      });
      console.error(
        "[ai/client-artist-picker] Anthropic request failed",
        safeLog,
      );
      const { correlationId: _, ...safeDebug } = safeLog;
      return NextResponse.json(
        {
          error: "Serviciul AI e temporar indisponibil. Încearcă din nou.",
          correlationId,
          debug: process.env.NODE_ENV === "production" ? undefined : safeDebug,
        },
        { status: 502, headers: { "X-Correlation-Id": correlationId } },
      );
    }

    conversation.push({ role: "assistant", content: resp.content });
    assistantTextParts.push(
      ...resp.content
        .filter(
          (block): block is Anthropic.Messages.TextBlock =>
            block.type === "text",
        )
        .map((block) => block.text.trim())
        .filter(Boolean),
    );

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
        const parsedInput = listAvailableArtistsInputSchema.safeParse(
          toolUse.input,
        );
        if (!parsedInput.success) {
          toolResult = JSON.stringify({
            ok: false,
            code: "INVALID_ARTIST_FILTERS",
            message:
              "Filtrele trebuie să conțină doar preț, rating și categorii în limite valide.",
          });
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: toolResult,
          });
          continue;
        }
        const input = parsedInput.data;

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
        const planEventType = normalizeEventType(plan.eventType);
        if (planEventType) {
          where.push(sql`${planEventType} = ANY(${artists.eventTypes})`);
        }
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

        const returnedArtists = found.slice(0, 30).map((a) => {
          const visibleCategoryIds = (a.categoryIds ?? []).filter((cid) => {
            const knownCategory = categoryMap.get(cid);
            return knownCategory?.type === "artist"
              || knownCategory?.type === "service";
          });
          for (const categoryId of visibleCategoryIds) {
            availableArtistCategoryPairs.add(`${a.id}:${categoryId}`);
          }
          return {
            id: a.id,
            name: a.name,
            rating: Number(a.ratingAvg ?? 0).toFixed(1),
            ratingCount: a.ratingCount ?? 0,
            priceFrom: a.priceFrom,
            categoryIds: visibleCategoryIds,
            categories: visibleCategoryIds
              .map((cid) => categoryMap.get(cid)?.nameRo)
              .filter(Boolean),
            location: a.location,
            isVerified: a.isVerified,
            isPremium: a.isPremium,
            isFeatured: a.isFeatured,
            description: truncate(a.description, 200),
          };
        });

        toolResult = JSON.stringify({
          count: found.length,
          artists: returnedArtists,
        });
      } else if (toolUse.name === "prepare_booking_request") {
        const parsedInput = prepareBookingRequestInputSchema.safeParse(
          toolUse.input,
        );
        const artistId = parsedInput.success ? parsedInput.data.artistId : null;
        const categoryId = parsedInput.success
          ? parsedInput.data.categoryId
          : null;
        const category = categoryId ? categoryMap.get(categoryId) : null;
        const pairWasReturned = artistId != null
          && categoryId != null
          && availableArtistCategoryPairs.has(`${artistId}:${categoryId}`);
        const [selectedArtist] = pairWasReturned
          ? await db
              .select({
                id: artists.id,
                nameRo: artists.nameRo,
                categoryIds: artists.categoryIds,
                isActive: artists.isActive,
              })
              .from(artists)
              .where(eq(artists.id, artistId))
              .limit(1)
          : [];
        if (
          !artistId
          || !categoryId
          || !category
          || (category.type !== "artist" && category.type !== "service")
          || !pairWasReturned
          || !selectedArtist?.isActive
          || !(selectedArtist.categoryIds ?? []).includes(categoryId)
          || proposalCategoriesPreparedThisTurn.has(categoryId)
        ) {
          toolResult = JSON.stringify({
            ok: false,
            code: "INVALID_BOOKING_PROPOSAL",
            message:
              "Artistul/categoria trebuie alese exact din listă și poate exista o singură propunere per categorie în acest răspuns.",
          });
        } else if (!hasBookableProfilePhone(appUser.phone)) {
          profilePhoneRequired = true;
          toolResult = JSON.stringify({
            ok: false,
            code: "CLIENT_PHONE_REQUIRED",
            message:
              "Adaugă un număr de telefon valid în profil înainte de a pregăti cererea.",
          });
        } else {
          const bookingPayload = buildAiBookingPayload({
            plan,
            actor: appUser,
            artistId,
          });
          if (!bookingPayload) {
            toolResult = JSON.stringify({
              ok: false,
              code: "EVENT_DATE_REQUIRED",
              message:
                "Planul trebuie să aibă o dată înainte de pregătirea rezervării.",
            });
            toolResults.push({
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: toolResult,
            });
            continue;
          }
          const proposal = await issueAiBookingProposal({
            userId: appUser.id,
            eventPlanId: plan.id,
            artistId,
            categoryId,
            payloadFingerprint: aiBookingPayloadFingerprint(bookingPayload),
          });
          proposalCategoriesPreparedThisTurn.add(categoryId);
          pendingProposals.push({
            proposalToken: proposal.token,
            artistId,
            artistName: selectedArtist.nameRo,
            categoryId,
            categoryName: category.nameRo,
            eventDate: bookingPayload.eventDate,
            eventType: bookingPayload.eventType ?? null,
            guestCount: bookingPayload.guestCount ?? null,
            contactEmailMasked: maskEmail(bookingPayload.clientEmail ?? null),
            contactPhoneMasked: maskPhone(bookingPayload.clientPhone),
            message: bookingPayload.message,
            expiresAt: proposal.expiresAt.toISOString(),
          });
          toolResult = JSON.stringify({
            ok: true,
            artistId,
            artistName: selectedArtist.nameRo,
            categoryId,
            categoryName: category.nameRo,
            expiresAt: proposal.expiresAt.toISOString(),
            instruction:
              "Cardul exact de confirmare este afișat separat de platformă. Spune clientului să verifice cardul și să apese butonul sigur dacă este de acord.",
          });
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

  const assistantTextBase = (assistantTextParts.join("\n\n").trim()
    || (pendingProposals.length > 0
      ? "Am pregătit propunerea. Verifică detaliile din cardul de confirmare."
      : "Nu am putut pregăti o recomandare. Încearcă să reformulezi cererea."))
    .slice(0, 4_000);
  const phoneNotice =
    "Adaugă un număr de telefon valid în profil înainte de a pregăti cererea.";
  const assistantText = profilePhoneRequired
    ? `${phoneNotice}\n\n${assistantTextBase}`.slice(0, 4_000)
    : assistantTextBase;
  const messages: ClientMessage[] = [
    ...incoming,
    { role: "assistant", content: assistantText },
  ];
  return NextResponse.json(
    {
      messages,
      requestsSent: 0,
      pendingProposals,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
