import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminTools, vendorTools, executeTool } from "@/lib/ai/tools";
import { db } from "@/lib/db";
import { users, artists } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { getAiClient } from "@/lib/ai/provider";

const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    }),
  ),
  context: z.enum(["admin", "vendor"]),
});

const ADMIN_SYSTEM_BASE = `Ești un asistent AI pentru platforma ePetrecere.md — un marketplace de servicii pentru evenimente din Republica Moldova.
Ai acces la baza de date a platformei prin funcții (tools). Folosește-le pentru a răspunde la întrebări despre artiști, leads, analytics.
Poți actualiza statusul lead-urilor și genera descrieri.
Răspunde concis și profesional în limba utilizatorului.`;

const VENDOR_SYSTEM_BASE = `Ești un asistent AI personal pentru artiștii de pe platforma ePetrecere.md.
Ai acces la calendarul, rezervările și datele artistului prin funcții (tools).
Ajuți cu gestionarea calendarului, răspunsuri la întrebări, și sfaturi de promovare.
Răspunde prietenos și util în limba utilizatorului.`;

/**
 * Inject "today's date" into the system prompt every request. Without this
 * Claude has no idea what year it is — partners reported the assistant
 * answering June 2024 calendar questions when asked about June 2026, and
 * contradicting itself on follow-ups. The prompt also pins year context
 * so date math ("next month", "in 3 weeks") doesn't drift to the model's
 * training cutoff.
 */
function buildSystemPrompt(base: string): string {
  const now = new Date();
  const dateRo = now.toLocaleDateString("ro-RO", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const isoDate = now.toISOString().slice(0, 10); // YYYY-MM-DD
  return `${base}

DATA CURENTĂ (folosește această dată pentru orice referință temporală — nu te baza pe data ta de antrenament):
- Data de azi: ${dateRo} (${isoDate})
- Anul curent: ${now.getFullYear()}

REGULI STRICT despre date:
- Când utilizatorul cere informații despre o anumită zi (ex. "20.06"), interpretează anul ca cel curent (${now.getFullYear()}) decât dacă a specificat altfel.
- Când răspunzi despre disponibilitatea calendarului, folosește EXCLUSIV datele întoarse de tool-uri. NU inventa marcaje "booked" sau "blocked" care nu există în răspunsul tool-ului.
- Dacă tool-ul nu întoarce nimic pentru o dată, răspunsul este "ești liber" — nu spune "este rezervat".
- Nu te contrazice între mesaje. Dacă într-un mesaj ai spus "ești liber pe data X", la mesajul următor nu spune că data X este "booked" decât dacă tool-ul rulat între timp a confirmat rezervarea.`;
}

export async function POST(req: Request) {
  // Auth gate — only authenticated users with the correct role may use the
  // admin/vendor AI chat. The context field is validated against the user's
  // actual role so callers cannot escalate to admin tools.
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [appUser] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.clerkId, clerkId))
    .limit(1);
  if (!appUser) {
    return NextResponse.json({ error: "User not found" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = chatSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Enforce role: only admins get admin tools, only artists get vendor tools
  const requestedContext = parsed.data.context;
  if (requestedContext === "admin" && appUser.role !== "admin" && appUser.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (requestedContext === "vendor" && appUser.role !== "artist" && appUser.role !== "admin" && appUser.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "AI provider not configured" }, { status: 503 });
  }

  const client = getAiClient();
  const isAdmin = requestedContext === "admin";
  const systemPrompt = buildSystemPrompt(
    isAdmin ? ADMIN_SYSTEM_BASE : VENDOR_SYSTEM_BASE,
  );
  const tools = isAdmin ? adminTools : vendorTools;

  // Resolve vendor artist ID for scoping vendor tools
  let vendorArtistId: number | undefined;
  if (!isAdmin) {
    const [appUserFull] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.clerkId, clerkId))
      .limit(1);
    if (appUserFull) {
      const [artist] = await db
        .select({ id: artists.id })
        .from(artists)
        .where(eq(artists.userId, appUserFull.id))
        .limit(1);
      vendorArtistId = artist?.id;
    }
  }

  const messages: Anthropic.MessageParam[] = parsed.data.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  try {
    // Loop to handle tool calls
    let response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1500,
      system: systemPrompt,
      tools,
      messages,
    });

    // Process tool use blocks (up to 3 rounds)
    let rounds = 0;
    while (response.stop_reason === "tool_use" && rounds < 3) {
      rounds++;

      const toolBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );

      // Add assistant response with tool use
      messages.push({ role: "assistant", content: response.content });

      // Execute tools and add results
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of toolBlocks) {
        const result = await executeTool(block.name, block.input as Record<string, unknown>, vendorArtistId);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      }

      messages.push({ role: "user", content: toolResults });

      // Get next response
      response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: systemPrompt,
        tools,
        messages,
      });
    }

    // Extract final text
    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text",
    );

    return NextResponse.json({ reply: textBlock?.text || "Nu am putut genera un răspuns." });
  } catch (err) {
    console.error("AI chat error:", err);
    return NextResponse.json({ error: "AI service unavailable" }, { status: 503 });
  }
}
