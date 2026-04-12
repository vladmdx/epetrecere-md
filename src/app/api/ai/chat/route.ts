import { NextResponse } from "next/server";
import { z } from "zod/v4";
import { auth } from "@clerk/nextjs/server";
import Anthropic from "@anthropic-ai/sdk";
import { adminTools, vendorTools, executeTool } from "@/lib/ai/tools";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

const chatSchema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    }),
  ),
  context: z.enum(["admin", "vendor"]),
});

const ADMIN_SYSTEM = `Ești un asistent AI pentru platforma ePetrecere.md — un marketplace de servicii pentru evenimente din Republica Moldova.
Ai acces la baza de date a platformei prin funcții (tools). Folosește-le pentru a răspunde la întrebări despre artiști, leads, analytics.
Poți actualiza statusul lead-urilor și genera descrieri.
Răspunde concis și profesional în limba utilizatorului.`;

const VENDOR_SYSTEM = `Ești un asistent AI personal pentru artiștii de pe platforma ePetrecere.md.
Ai acces la calendarul, rezervările și datele artistului prin funcții (tools).
Ajuți cu gestionarea calendarului, răspunsuri la întrebări, și sfaturi de promovare.
Răspunde prietenos și util în limba utilizatorului.`;

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  const client = new Anthropic({ apiKey });
  const isAdmin = requestedContext === "admin";
  const systemPrompt = isAdmin ? ADMIN_SYSTEM : VENDOR_SYSTEM;
  const tools = isAdmin ? adminTools : vendorTools;

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
        const result = await executeTool(block.name, block.input as Record<string, unknown>);
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
