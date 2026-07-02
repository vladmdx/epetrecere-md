// POST /api/v1/ai/chat/stream — Server-Sent Events streaming AI chat.
//
// Why a separate route instead of streaming from the existing
// /api/ai/chat? Tools-loop semantics differ: the streaming variant
// flushes tokens to the client as they arrive, so we can show a
// growing assistant bubble in real time. The existing route does
// multi-round tool calls + assembles the final response server-side.
//
// For M6 we ship streaming WITHOUT tools (most partner/client AI
// queries don't need DB lookups — they're advice, copywriting,
// scheduling helpers). Tool-aware streaming can land in M7 if
// partners request it.
//
// Wire format:
//   event: token
//   data: {"text":"Hi"}
//
//   event: done
//   data: {"usage":{"input_tokens":42,"output_tokens":120}}
//
//   event: error
//   data: {"code":"…","message":"…"}

import { auth } from "@clerk/nextjs/server";
import { MODELS } from "@/lib/ai/models";
import { z } from "zod/v4";
import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const runtime = "nodejs"; // Anthropic SDK needs Node, not Edge.
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1).max(8000),
    }),
  ).min(1).max(60),
  context: z.enum(["client_assistant", "partner_assistant"]).optional(),
});

const CLIENT_SYSTEM = `Ești asistentul AI pentru clienții ePetrecere.md — utilizatori care își planifică evenimente (nuntă, botez, cumătrie, aniversare, corporate).
Ești prietenos, concis, în limba română.
Ajuți cu: idei de organizare, întrebări despre furnizori, sfaturi de buget, idei pentru meniu/decor, etichetă pentru cereri.
NU inventa prețuri specifice. Pentru tarife concrete, recomandă să trimită cereri către artiști/săli.`;

const PARTNER_SYSTEM = `Ești asistentul AI pentru artiștii și sălile de pe ePetrecere.md.
Ești profesionist, scurt la replică, în limba română.
Ajuți cu: răspunsuri la cereri dificile (buget mic, dată indisponibilă), descrieri pentru profil, optimizare SEO, sfaturi de pricing, marketing pe Instagram/TikTok, gestionare reputație.
Folosește bullet points când ai mai mult de 2 sfaturi.`;

function dateContext(): string {
  const now = new Date();
  const dateRo = now.toLocaleDateString("ro-RO", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `\n\nData curentă: ${dateRo} (folosește pentru orice referință temporală — nu te baza pe data din antrenament).`;
}

export async function POST(req: Request) {
  // Auth gate
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return new Response(
      JSON.stringify({ error: "unauthorized" }),
      { status: 401, headers: { "content-type": "application/json" } },
    );
  }
  const [appUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return new Response(
      JSON.stringify({ error: "user_not_found" }),
      { status: 404, headers: { "content-type": "application/json" } },
    );
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "validation_error", details: err }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ai_unavailable" }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }
  const client = new Anthropic({ apiKey });

  const system =
    (body.context === "partner_assistant" ? PARTNER_SYSTEM : CLIENT_SYSTEM) +
    dateContext();

  // SSE stream. We use a TransformStream so we can write events
  // imperatively while the response is being consumed. Each event is
  // a discrete `event: name\ndata: json\n\n` frame.
  const encoder = new TextEncoder();
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  function send(event: string, data: unknown) {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    return writer.write(encoder.encode(frame));
  }

  (async () => {
    try {
      const anthropicStream = await client.messages.stream({
        model: MODELS.CHAT,
        max_tokens: 1500,
        system,
        messages: body.messages.map((m) => ({ role: m.role, content: m.content })),
      });

      // Forward text deltas as `token` events.
      for await (const chunk of anthropicStream) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
          await send("token", { text: chunk.delta.text });
        }
      }

      const final = await anthropicStream.finalMessage();
      await send("done", {
        usage: final.usage,
        stopReason: final.stop_reason,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "ai_failure";
      await send("error", { code: "ai_failure", message });
    } finally {
      await writer.close();
    }
  })();

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Disable Vercel buffering — without this, SSE messages stay
      // queued until the response closes, defeating the point.
      "X-Accel-Buffering": "no",
    },
  });
}
