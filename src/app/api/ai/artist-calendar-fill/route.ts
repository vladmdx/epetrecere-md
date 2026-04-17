// AI calendar-fill assistant for artists.
//
// The artist chats with Claude in natural language about their availability
// ("sesiuni 2h, 200€ weekend, 15:00-23:00, pe 3 luni"). Claude asks
// clarifying questions until it has enough to batch-create slots via the
// `create_slots` tool, at which point this route persists them and replies
// with a confirmation.
//
// Flow per request:
//   client sends: { messages: [{role, content}, ...], artistId }
//   server calls: Claude messages API with system prompt + tool
//   loop:        if stop_reason === "tool_use" → exec tool → tool_result → ask Claude to continue
//   server returns: { messages: [updated] }

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { artistAvailabilitySlots, artists, users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Client is created per-request — the SDK is cheap to instantiate and
// avoiding a module-level singleton keeps edge/serverless cold starts
// predictable.
function getClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY missing");
  return new Anthropic({ apiKey });
}

const MODEL = "claude-sonnet-4-5";

const SYSTEM_PROMPT = `Ești asistentul de calendar pentru un artist muzical pe platforma ePetrecere.md.

Sarcina ta: ajută artistul să-și completeze calendarul cu sloturi de disponibilitate. Fiecare slot are: dată, oră început, oră sfârșit, preț (EUR, opțional) și notă (opțional).

Reguli de conversație (limba română):
1. Pui întrebări scurte, concrete, doar despre informațiile care LIPSESC (ex: dacă artistul nu a menționat prețul, întreabă prețul; dacă nu a spus pe ce perioadă, întreabă perioada).
2. NU inventezi date sau prețuri. Nu presupui.
3. Când ai suficiente informații pentru a crea sloturi, apelezi tool-ul \`create_slots\` cu un array complet. NU cere confirmare — apelează tool-ul direct. Platforma confirmă vizual.
4. Dacă artistul spune "lucrez sâmbăta și duminica", expandează acele zile peste perioada cerută.
5. Dacă artistul menționează zile pe care e ocupat, EXCLUDE-le din sloturile create.
6. Un slot nu poate depăși 24h. Dacă artistul zice "până seara", întreabă ora exactă.
7. Data curentă: ${new Date().toISOString().slice(0, 10)}. Nu propune sloturi în trecut.
8. Răspunsurile tale sunt scurte (max 3 propoziții) și prietenoase. Evită liste dacă întrebarea e simplă.

După tool_use, rezumă pe scurt ce ai creat (ex: "Am adăugat 24 sloturi pentru weekenduri în aprilie-iunie, 200€ fiecare").`;

const CREATE_SLOTS_TOOL: Anthropic.Messages.Tool = {
  name: "create_slots",
  description:
    "Creează sloturi de disponibilitate în calendar după ce ai toate informațiile. Batch: trimiți toate sloturile într-un singur apel.",
  input_schema: {
    type: "object",
    properties: {
      slots: {
        type: "array",
        description: "Lista sloturilor de creat.",
        items: {
          type: "object",
          properties: {
            date: {
              type: "string",
              description: "Data în format YYYY-MM-DD.",
              pattern: "^\\d{4}-\\d{2}-\\d{2}$",
            },
            startTime: {
              type: "string",
              description: "Ora de început, format HH:MM, 24h.",
              pattern: "^\\d{2}:\\d{2}$",
            },
            endTime: {
              type: "string",
              description: "Ora de sfârșit, HH:MM, 24h.",
              pattern: "^\\d{2}:\\d{2}$",
            },
            price: {
              type: "number",
              description: "Prețul în EUR (întreg). Opțional.",
            },
            note: {
              type: "string",
              description: "Notă scurtă, opțional (ex: 'weekend seara').",
            },
          },
          required: ["date", "startTime", "endTime"],
        },
      },
    },
    required: ["slots"],
  },
};

type ClientMessage = {
  role: "user" | "assistant";
  /** Either a plain string (user input) or a structured content-block
   *  array (assistant reply carrying tool_use + text). Claude requires
   *  the full block array to be echoed back on follow-up turns. */
  content: string | Anthropic.Messages.ContentBlockParam[];
};

export async function POST(req: NextRequest) {
  // AuthN — only the owner of an artist profile may use their quota.
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const [artist] = await db
    .select({ id: artists.id })
    .from(artists)
    .where(eq(artists.userId, appUser.id))
    .limit(1);
  if (!artist) {
    return NextResponse.json(
      { error: "No artist profile." },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const incoming = body?.messages as ClientMessage[] | undefined;
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return NextResponse.json({ error: "messages required" }, { status: 400 });
  }

  const client = getClient();

  // Persisted conversation — mutated through the tool loop, returned
  // verbatim so the UI can pass it back on the next turn.
  const conversation: Anthropic.Messages.MessageParam[] = incoming.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  let slotsCreated = 0;
  let iterations = 0;

  while (iterations < 5) {
    iterations++;
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          // Cache the system prompt across turns — cuts ~80% of input
          // cost on back-and-forth chats.
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [CREATE_SLOTS_TOOL],
      messages: conversation,
    });

    // Append the full assistant reply (text + any tool_use blocks) so
    // subsequent turns see the same context Claude saw.
    conversation.push({ role: "assistant", content: resp.content });

    if (resp.stop_reason === "tool_use") {
      const toolUse = resp.content.find(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
      );
      if (!toolUse) break;

      if (toolUse.name === "create_slots") {
        const input = toolUse.input as {
          slots?: Array<{
            date: string;
            startTime: string;
            endTime: string;
            price?: number;
            note?: string;
          }>;
        };
        const slots = input.slots ?? [];

        // Basic client-side validation so a hallucinated slot doesn't
        // corrupt the table.
        const clean = slots.filter(
          (s) =>
            /^\d{4}-\d{2}-\d{2}$/.test(s.date) &&
            /^\d{2}:\d{2}$/.test(s.startTime) &&
            /^\d{2}:\d{2}$/.test(s.endTime) &&
            s.startTime < s.endTime,
        );

        if (clean.length > 0) {
          await db.insert(artistAvailabilitySlots).values(
            clean.map((s) => ({
              artistId: artist.id,
              date: s.date,
              startTime: s.startTime,
              endTime: s.endTime,
              price: typeof s.price === "number" ? s.price : null,
              note: s.note ?? null,
            })),
          );
          slotsCreated += clean.length;
        }

        conversation.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: toolUse.id,
              content: `Am creat ${clean.length} sloturi în calendar${
                slots.length !== clean.length
                  ? ` (${slots.length - clean.length} respinse pentru validare)`
                  : ""
              }.`,
            },
          ],
        });
        // Loop once more so Claude can produce the final confirmation text.
        continue;
      }
      // Unknown tool — bail gracefully.
      break;
    }

    // Any other stop_reason = we're done (end_turn / max_tokens / etc.)
    break;
  }

  return NextResponse.json({
    messages: conversation,
    slotsCreated,
  });
}
